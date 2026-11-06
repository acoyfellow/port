import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { Type } from '@earendil-works/pi-ai';
import { defineExtension, defineTool } from '@earendil-works/pi-durable';
import { type AgentEnv, piAgent } from '../../kit/agent.ts';
import { boxBoot, containerEnv, runInBox, stopBox } from '../../kit/container-env.ts';
import { piRouter } from '../../kit/router.ts';

type Env = AgentEnv & { readonly THREAD: DurableObjectNamespace<Thread> };

const BOX = { internet: true } as const;
const ARCHIVE = '/tmp/port-checkpoint.tgz';
const CHUNK = 1_000_000;
const NAME = /^[a-z0-9-]{1,40}$/;
const FINGERPRINT = [
  'sh',
  '-c',
  'cd /workspace && find . -type f | LC_ALL=C sort | xargs -r sha256sum | sha256sum | cut -c1-16; find . -type f | wc -l',
];

type Checkpoint = {
  readonly name: string;
  readonly bytes: number;
  readonly fingerprint: string;
  readonly files: number;
  readonly ms: number;
};

const table = (sql: SqlStorage) => {
  sql.exec(
    'CREATE TABLE IF NOT EXISTS checkpoints (name TEXT PRIMARY KEY, bytes INTEGER, fingerprint TEXT, files INTEGER, ms INTEGER, at INTEGER)',
  );
  sql.exec('CREATE TABLE IF NOT EXISTS chunks (name TEXT, n INTEGER, data BLOB, PRIMARY KEY (name, n))');
  sql.exec('CREATE TABLE IF NOT EXISTS restores (id INTEGER PRIMARY KEY, name TEXT, ms INTEGER, at INTEGER)');
  return {
    all: () =>
      sql
        .exec<Checkpoint>('SELECT name, bytes, fingerprint, files, ms FROM checkpoints ORDER BY at')
        .toArray(),
    find: (name: string) =>
      sql
        .exec<Checkpoint>('SELECT name, bytes, fingerprint, files, ms FROM checkpoints WHERE name = ?', name)
        .toArray()[0],
    save: (checkpoint: Checkpoint, archive: Uint8Array) => {
      sql.exec('DELETE FROM chunks WHERE name = ?', checkpoint.name);
      for (let offset = 0, n = 0; offset < archive.length; offset += CHUNK, n++)
        sql.exec(
          'INSERT INTO chunks (name, n, data) VALUES (?, ?, ?)',
          checkpoint.name,
          n,
          archive.slice(offset, offset + CHUNK),
        );
      sql.exec(
        'INSERT OR REPLACE INTO checkpoints (name, bytes, fingerprint, files, ms, at) VALUES (?, ?, ?, ?, ?, ?)',
        checkpoint.name,
        checkpoint.bytes,
        checkpoint.fingerprint,
        checkpoint.files,
        checkpoint.ms,
        Date.now(),
      );
    },
    archive: (name: string) => {
      const parts = sql
        .exec<{ data: ArrayBuffer }>('SELECT data FROM chunks WHERE name = ? ORDER BY n', name)
        .toArray()
        .map((row) => new Uint8Array(row.data));
      const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
      let offset = 0;
      for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
      }
      return out;
    },
    restored: (name: string, ms: number) =>
      sql.exec('INSERT INTO restores (name, ms, at) VALUES (?, ?, ?)', name, ms, Date.now()),
    restores: () =>
      sql.exec<{ name: string; ms: number }>('SELECT name, ms FROM restores ORDER BY id').toArray(),
  };
};

const environment = (ctx: DurableObjectState) => containerEnv(ctx, `snapshot:${ctx.id.toString()}`, BOX);

const fingerprintOf = async (ctx: DurableObjectState) => {
  const result = await runInBox(environment(ctx), FINGERPRINT, 60);
  const [hash = '', count = '0'] = result.output.split('\n');
  return { fingerprint: hash.trim(), files: Number(count.trim()) };
};

const saveCheckpoint = async (ctx: DurableObjectState, name: string) => {
  if (!NAME.test(name)) return `refused: name must match ${NAME.source}`;
  const started = Date.now();
  const state = await fingerprintOf(ctx);
  const packed = await runInBox(environment(ctx), ['tar', 'czf', ARCHIVE, '-C', '/workspace', '.'], 120);
  if (packed.exitCode !== 0) return `tar failed: ${packed.output}`;
  const read = await environment(ctx).readBinaryFile(ARCHIVE, BACKGROUND_CONTEXT);
  if (!read.ok) return `could not read the archive: ${read.error.message}`;
  const ms = Date.now() - started;
  table(ctx.storage.sql).save({ name, bytes: read.value.length, ...state, ms }, read.value);
  return `checkpoint "${name}" saved: ${state.files} files, ${Math.round(read.value.length / 1024)} KB, ${ms} ms`;
};

const rollback = async (ctx: DurableObjectState, name: string) => {
  const store = table(ctx.storage.sql);
  const checkpoint = store.find(name);
  if (checkpoint === undefined) return { error: `no checkpoint named "${name}"` };
  const started = Date.now();
  const before = await boxBoot(ctx, BOX);
  await stopBox(ctx);
  const after = await boxBoot(ctx, BOX);
  const env = environment(ctx);
  const wrote = await env.writeFile(ARCHIVE, store.archive(name), BACKGROUND_CONTEXT);
  if (!wrote.ok) return { error: `could not write the archive: ${wrote.error.message}` };
  const unpacked = await runInBox(
    env,
    [
      'sh',
      '-c',
      `rm -rf /workspace && mkdir -p /workspace && tar xzf ${ARCHIVE} -C /workspace && rm ${ARCHIVE}`,
    ],
    120,
  );
  if (unpacked.exitCode !== 0) return { error: `untar failed: ${unpacked.output}` };
  const ms = Date.now() - started;
  store.restored(name, ms);
  return { name, before, after, ms, ...(await fingerprintOf(ctx)), expected: checkpoint.fingerprint };
};

const checkpointTools = (ctx: DurableObjectState) =>
  defineExtension({
    name: 'checkpoints',
    tools: [
      defineTool({
        name: 'save_checkpoint',
        description:
          'Save a checkpoint of every file in /workspace under a name. Save one whenever the work is in a known-good state, such as after the tests pass.',
        parameters: Type.Object({ name: Type.String({ description: 'short name like tests-pass' }) }),
        execute: async (input) => ({
          output: [
            {
              type: 'text',
              text: await saveCheckpoint(ctx, input.name).catch(
                (error: unknown) => `failed: ${String(error)}`,
              ),
            },
          ],
        }),
      }),
      defineTool({
        name: 'rollback',
        description:
          'Throw away the current computer, start a fresh one, and put back /workspace exactly as it was at a named checkpoint. Use it when the work is broken and it is easier to go back than to repair.',
        parameters: Type.Object({ name: Type.String() }),
        execute: async (input) => ({
          output: [{ type: 'text', text: JSON.stringify(await rollback(ctx, input.name)) }],
        }),
      }),
    ],
  });

export class Thread extends piAgent<Env>({
  name: 'snapshot-rollback',
  instructions:
    'You are a coding agent with your own Linux computer: a shell, git, Python, Node and a disk in /workspace. You can save checkpoints of /workspace and roll back to one. Use the tools to do the work, check it, then reply in one short sentence.',
  environment: (_env, ctx) => environment(ctx),
  extensions: (_env, ctx) => [checkpointTools(ctx)],
  probe: async (_env, ctx) => {
    const store = table(ctx.storage.sql);
    const checkpoints = store.all();
    return {
      facts: {
        snapshots: checkpoints.length,
        checkpoints: checkpoints
          .map((each) => `${each.name}:${each.files}f:${each.bytes}B:${each.ms}ms`)
          .join(','),
        restores: store.restores().length,
      },
    };
  },
}) {
  async lab(step: string, name: string) {
    if (step === 'checkpoint') return table(this.ctx.storage.sql).find(name) ?? { error: 'none' };
    if (step === 'break') {
      const result = await runInBox(
        environment(this.ctx),
        ['sh', '-c', 'cd /workspace && find . -mindepth 1 -delete && echo broken > BROKEN'],
        60,
      );
      return { exitCode: result.exitCode, ...(await fingerprintOf(this.ctx)) };
    }
    if (step === 'rollback') return rollback(this.ctx, name);
    return { error: `unknown step ${step}` };
  }
}

const labRoute = async (request: Request, env: Env) => {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/lab/')) return undefined;
  const agent = url.searchParams.get('agent') ?? '';
  if (!/^[a-z0-9-]{1,64}$/.test(agent)) return Response.json({ error: 'agent is required' }, { status: 400 });
  const thread = env.THREAD.get(env.THREAD.idFromName(agent));
  return Response.json(await thread.lab(url.pathname.slice(5), url.searchParams.get('name') ?? ''));
};

export default piRouter<Env>({
  shape: 'snapshot-rollback',
  agent: (env, name) => env.THREAD.get(env.THREAD.idFromName(name)),
  gateway: (env) => env.GATEWAY,
  extra: labRoute,
});
