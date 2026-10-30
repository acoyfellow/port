import dns from 'node:dns';
import https from 'node:https';
import * as Schema from 'effect/Schema';

export const SHAPE_ZONE = 'customer0.dev';

export const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const shapeHost = (slug: string) => `port-shape-${slug}.${SHAPE_ZONE}`;

export const shapeKey = () => {
  const key = process.env.SHAPE_KEY;
  if (key === undefined || key === '') throw new Error('SHAPE_KEY is not set');
  return key;
};

const authoritative = async () => {
  const [server] = await dns.promises.resolveNs(SHAPE_ZONE);
  if (server === undefined) throw new Error(`${SHAPE_ZONE} has no nameserver`);
  const [address] = await dns.promises.resolve4(server);
  if (address === undefined) throw new Error(`${server} has no address`);
  const resolver = new dns.promises.Resolver();
  resolver.setServers([address]);
  return resolver;
};

const addressOf = async (host: string) => {
  const [address] = await (await authoritative()).resolve4(host);
  if (address === undefined) throw new Error(`${host} has no A record yet`);
  return address;
};

type Reply = { readonly status: number; readonly text: string };

const request = (
  host: string,
  address: string,
  method: string,
  path: string,
  body: string | undefined,
  headers: Record<string, string>,
) =>
  new Promise<Reply>((resolve, reject) => {
    const outgoing = https.request(
      {
        host: address,
        servername: host,
        method,
        path,
        headers: {
          ...headers,
          host,
          ...(body === undefined ? {} : { 'content-length': Buffer.byteLength(body) }),
        },
        timeout: 120_000,
      },
      (incoming) => {
        let text = '';
        incoming.setEncoding('utf8');
        incoming.on('data', (chunk: string) => {
          text += chunk;
        });
        incoming.on('end', () => resolve({ status: incoming.statusCode ?? 0, text }));
        incoming.on('error', reject);
      },
    );
    outgoing.on('timeout', () => outgoing.destroy(new Error('request timed out')));
    outgoing.on('error', reject);
    if (body !== undefined) outgoing.write(body);
    outgoing.end();
  });

type Decodable = Schema.ConstraintDecoder<unknown>;

type RequestOptions = { readonly tries?: number; readonly body?: unknown };

export type RawReply = { readonly status: number; readonly json: unknown };

export type Client = {
  readonly raw: (method: 'GET' | 'POST', path: string, body?: string) => Promise<RawReply>;
  readonly get: <S extends Decodable>(
    path: string,
    schema: S,
    options?: RequestOptions,
  ) => Promise<S['Type']>;
  readonly post: <S extends Decodable>(
    path: string,
    schema: S,
    options?: RequestOptions,
  ) => Promise<S['Type']>;
};

export const client = (slug: string, auth?: { readonly bearer: string }): Client => {
  const host = shapeHost(slug);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(auth === undefined ? {} : { authorization: `Bearer ${auth.bearer}` }),
  };
  const send =
    (method: 'GET' | 'POST') =>
    async <S extends Decodable>(path: string, schema: S, options: RequestOptions = {}) => {
      const tries = options.tries ?? 30;
      const body = options.body === undefined ? undefined : JSON.stringify(options.body);
      let last = '';
      for (let attempt = 0; attempt < tries; attempt++) {
        const reply = await addressOf(host)
          .then((address) => request(host, address, method, path, body, headers))
          .catch((error: unknown) => String(error));
        if (typeof reply !== 'string' && reply.status >= 200 && reply.status < 300)
          return Schema.decodeUnknownSync(schema)(JSON.parse(reply.text));
        last = typeof reply === 'string' ? reply : `HTTP ${reply.status}`;
        await pause(2000);
      }
      throw new Error(`${method} ${path} kept failing: ${last}`);
    };
  const raw = async (method: 'GET' | 'POST', path: string, body?: string) => {
    const reply = await request(host, await addressOf(host), method, path, body, headers);
    return { status: reply.status, json: JSON.parse(reply.text) };
  };
  return { get: send('GET'), post: send('POST'), raw };
};

export const prove = (claim: string, ok: boolean, detail: Record<string, unknown>) => {
  console.log(JSON.stringify(detail));
  if (!ok) {
    console.log(`smoke failed: ${claim}`);
    process.exit(1);
  }
  console.log(`PROVED ${claim}`);
};
