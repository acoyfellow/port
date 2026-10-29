import { DurableObject } from 'cloudflare:workers';
import { Schema } from 'effect';
import { type OAuthClient, refreshTokens, revoke } from './auth/oauth';
import { seal, unseal } from './auth/seal';

export type GrantEnv = {
  readonly TOKEN_ENC_KEY: string;
  readonly OAUTH_CLIENT_ID: string;
  readonly OAUTH_CLIENT_SECRET: string;
};

const TokenSetSchema = Schema.Struct({
  accessToken: Schema.String,
  refreshToken: Schema.NullOr(Schema.String),
  expiresAt: Schema.Number,
  scope: Schema.String,
});

const GrantRecordSchema = Schema.Struct({
  user: Schema.String,
  email: Schema.NullOr(Schema.String),
  accountId: Schema.NullOr(Schema.String),
  accountName: Schema.NullOr(Schema.String),
  scope: Schema.String,
  tokens: TokenSetSchema,
  lastUsed: Schema.Number,
});

export type GrantRecord = typeof GrantRecordSchema.Type;

const decodeRecord = Schema.decodeUnknownOption(Schema.fromJsonString(GrantRecordSchema));

export type GrantSummary = {
  readonly email: string | null;
  readonly accountId: string | null;
  readonly accountName: string | null;
  readonly scope: string;
};

const RECORD_KEY = 'grant';
const UNUSED_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export class Grant extends DurableObject<GrantEnv> {
  private client(redirectUri: string): OAuthClient {
    return { clientId: this.env.OAUTH_CLIENT_ID, clientSecret: this.env.OAUTH_CLIENT_SECRET, redirectUri };
  }

  private async read(): Promise<GrantRecord | null> {
    const sealed = await this.ctx.storage.get<string>(RECORD_KEY);

    if (sealed === undefined) return null;

    const plain = await unseal(this.env.TOKEN_ENC_KEY, sealed);

    if (plain === null) return null;

    const decoded = decodeRecord(plain);

    return decoded._tag === 'Some' ? decoded.value : null;
  }

  private async write(record: GrantRecord): Promise<void> {
    await this.ctx.storage.put(RECORD_KEY, await seal(this.env.TOKEN_ENC_KEY, JSON.stringify(record)));
    await this.ctx.storage.setAlarm(record.lastUsed + UNUSED_TTL_MS);
  }

  async save(record: GrantRecord): Promise<void> {
    await this.write(record);
  }

  async summary(): Promise<GrantSummary | null> {
    const record = await this.read();

    return record === null
      ? null
      : {
          email: record.email,
          accountId: record.accountId,
          accountName: record.accountName,
          scope: record.scope,
        };
  }

  async chooseAccount(accountId: string, accountName: string): Promise<boolean> {
    const record = await this.read();

    if (record === null) return false;

    await this.write({ ...record, accountId, accountName, lastUsed: Date.now() });

    return true;
  }

  async token(redirectUri: string): Promise<{ accessToken: string; accountId: string | null } | null> {
    const record = await this.read();

    if (record === null) return null;

    const now = Date.now();
    const fresh =
      record.tokens.expiresAt - REFRESH_MARGIN_MS > now || record.tokens.refreshToken === null
        ? record.tokens
        : await refreshTokens(this.client(redirectUri), record.tokens.refreshToken, fetch, now).catch(
            () => null,
          );

    if (fresh === null) {
      await this.forget();

      return null;
    }

    await this.write({
      ...record,
      tokens: { ...fresh, refreshToken: fresh.refreshToken ?? record.tokens.refreshToken },
      lastUsed: now,
    });

    return { accessToken: fresh.accessToken, accountId: record.accountId };
  }

  async signOut(redirectUri: string): Promise<void> {
    const record = await this.read();

    if (record !== null) {
      await revoke(this.client(redirectUri), record.tokens.refreshToken ?? record.tokens.accessToken);
    }

    await this.forget();
  }

  private async forget(): Promise<void> {
    await this.ctx.storage.deleteAll();
    await this.ctx.storage.deleteAlarm();
  }

  override async alarm(): Promise<void> {
    const record = await this.read();

    if (record === null || record.lastUsed + UNUSED_TTL_MS <= Date.now()) await this.forget();
    else await this.ctx.storage.setAlarm(record.lastUsed + UNUSED_TTL_MS);
  }
}
