import { Type } from '@earendil-works/pi-ai';
import { defineExtension, defineTool } from '@earendil-works/pi-durable';
import { type AgentEnv, piAgent, seedWorkspace, workspaceOf } from '../../kit/agent.ts';
import { type Fleet, fleetOf, seatEnv, seatFacts, seatOf } from '../../kit/beam.ts';
import { MemoryExecutionEnv, sqliteFileStore } from '../../kit/memory-env.ts';
import { piRouter } from '../../kit/router.ts';

type Env = AgentEnv & {
  readonly SPACE: DurableObjectNamespace<Space>;
  readonly THREAD: DurableObjectNamespace<Thread>;
  readonly BOX: DurableObjectNamespace<Fleet>;
};

export { Fleet } from '../../kit/beam.ts';

const SLUG = 'beam-space';
const THREAD_NAME = /^[a-z0-9-]{1,40}$/;
const READ_WAIT_MS = 60_000;
const READ_POLL_MS = 5_000;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type ThreadRow = {
  readonly name: string;
  readonly role: string;
  readonly brief: string;
  readonly startedAt: number;
  readonly starts: number;
  readonly status: string;
  readonly answer: string;
};

const threadKey = (space: string, name: string) => `${space}:${name}`;

const text = (value: string) => ({ output: [{ type: 'text' as const, text: value }] });

const ledger = (sql: SqlStorage) => {
  sql.exec(
    'CREATE TABLE IF NOT EXISTS space_threads (name TEXT PRIMARY KEY, role TEXT, brief TEXT, started_at INTEGER, starts INTEGER, status TEXT, answer TEXT)',
  );
  sql.exec('CREATE TABLE IF NOT EXISTS space_notes (at INTEGER, sender TEXT, body TEXT)');
  sql.exec('CREATE TABLE IF NOT EXISTS space_summary (id INTEGER PRIMARY KEY, body TEXT, at INTEGER)');
  const all = () =>
    sql
      .exec<{
        name: string;
        role: string;
        brief: string;
        started_at: number;
        starts: number;
        status: string;
        answer: string;
      }>(
        'SELECT name, role, brief, started_at, starts, status, answer FROM space_threads ORDER BY started_at',
      )
      .toArray()
      .map(
        (row): ThreadRow => ({
          name: row.name,
          role: row.role,
          brief: row.brief,
          startedAt: row.started_at,
          starts: row.starts,
          status: row.status,
          answer: row.answer,
        }),
      );
  return {
    all,
    find: (name: string) => all().find((row) => row.name === name),
    claim: (name: string, role: string, brief: string) => {
      const existing = all().find((row) => row.name === name);
      if (existing !== undefined) return { fresh: false, row: existing };
      sql.exec(
        "INSERT INTO space_threads (name, role, brief, started_at, starts, status, answer) VALUES (?, ?, ?, ?, 1, 'running', '')",
        name,
        role,
        brief,
        Date.now(),
      );
      return { fresh: true, row: all().find((row) => row.name === name) };
    },
    settle: (name: string, status: string, answer: string) =>
      sql.exec('UPDATE space_threads SET status = ?, answer = ? WHERE name = ?', status, answer, name),
    note: (sender: string, body: string) =>
      sql.exec('INSERT INTO space_notes (at, sender, body) VALUES (?, ?, ?)', Date.now(), sender, body),
    notes: () =>
      sql
        .exec<{ at: number; sender: string; body: string }>(
          'SELECT at, sender, body FROM space_notes ORDER BY at',
        )
        .toArray(),
    saveSummary: (body: string) =>
      sql.exec('INSERT OR REPLACE INTO space_summary (id, body, at) VALUES (1, ?, ?)', body, Date.now()),
    summary: () =>
      sql.exec<{ body: string }>('SELECT body FROM space_summary WHERE id = 1').toArray()[0]?.body ?? '',
  };
};

const spaceName = (ctx: DurableObjectState) => ctx.id.toString();

const SPACE_ROOT = '/space';

const spaceFiles = (ctx: DurableObjectState) =>
  new MemoryExecutionEnv({
    id: `${SLUG}:${ctx.id.toString()}`,
    cwd: SPACE_ROOT,
    store: sqliteFileStore(ctx.storage.sql, 'space'),
  });

const spaceTools = (env: Env, ctx: DurableObjectState) => {
  const book = ledger(ctx.storage.sql);
  const space = spaceName(ctx);
  const threadOf = (name: string) => env.THREAD.get(env.THREAD.idFromName(threadKey(space, name)));
  return defineExtension({
    name: 'space',
    tools: [
      defineTool({
        name: 'start_thread',
        description:
          'Start a thread: a separate coding agent with its own workspace and Unix user, supervised on the BEAM. It starts with a copy of the space’s shared files. For a checker, set from to the worker’s name: the checker then also starts with a copy of every file that worker wrote. Give it a short unique name and a complete brief. Starting a name that already exists does nothing and returns its state, so it is safe to call again after a restart.',
        parameters: Type.Object({
          name: Type.String({ description: 'short unique name, lowercase letters, digits and dashes' }),
          role: Type.String({ description: 'worker or checker' }),
          brief: Type.String({ description: 'the whole task for this thread' }),
          from: Type.Optional(
            Type.String({ description: 'for a checker: the worker whose files it checks' }),
          ),
        }),
        execute: async (input) => {
          if (!THREAD_NAME.test(input.name)) return text('name must be lowercase letters, digits and dashes');
          const claimed = book.claim(input.name, input.role, input.brief);
          if (!claimed.fresh)
            return text(`thread ${input.name} already exists: ${JSON.stringify(claimed.row)}`);
          if (input.from !== undefined && book.find(input.from) === undefined)
            return text(`no thread named ${input.from}`);
          const seed = {
            ...(await workspaceOf(spaceFiles(ctx))),
            ...(input.from === undefined ? {} : await threadOf(input.from).workspace()),
          };
          const thread = threadOf(input.name);
          if (Object.keys(seed).length > 0) await thread.writeWorkspace(seed);
          await thread.submit(input.brief, `run:${input.name}`);
          return text(`started thread ${input.name}`);
        },
      }),
      defineTool({
        name: 'message_thread',
        description: 'Send a follow-up message to a thread that already exists.',
        parameters: Type.Object({ name: Type.String(), message: Type.String() }),
        execute: async (input) => {
          if (book.find(input.name) === undefined) return text(`no thread named ${input.name}`);
          await threadOf(input.name).submit(input.message, `msg:${input.name}:${Date.now()}`);
          book.settle(input.name, 'running', '');
          return text(`sent to ${input.name}`);
        },
      }),
      defineTool({
        name: 'read_threads',
        description:
          'Read every thread: its role, status and final answer. It waits up to a minute for running threads to finish before it returns. Threads that are still running say running; call it again until none are. Do not reply to the person while any thread is running.',
        parameters: Type.Object({}),
        execute: async () => {
          const deadline = Date.now() + READ_WAIT_MS;
          const refresh = async () => {
            for (const row of book.all().filter((each) => each.status === 'running')) {
              const status = await threadOf(row.name).status(`run:${row.name}`, '');
              if (status.status !== 'running')
                book.settle(row.name, status.status, 'text' in status ? status.text : '');
            }
            return book.all().some((each) => each.status === 'running');
          };
          while ((await refresh()) && Date.now() < deadline) await pause(READ_POLL_MS);
          return text(JSON.stringify(book.all().map(({ brief: _brief, ...rest }) => rest)));
        },
      }),
      defineTool({
        name: 'read_thread_files',
        description: 'List the files a thread wrote, with their contents.',
        parameters: Type.Object({ name: Type.String() }),
        execute: async (input) => {
          if (book.find(input.name) === undefined) return text(`no thread named ${input.name}`);
          return text(JSON.stringify(await threadOf(input.name).workspace()).slice(0, 20000));
        },
      }),
      defineTool({
        name: 'adopt_thread_files',
        description:
          'Copy every file a finished thread wrote into the space’s shared files. Use it for a worker whose checker said its result is good. Later threads start from the shared files.',
        parameters: Type.Object({ name: Type.String() }),
        execute: async (input) => {
          if (book.find(input.name) === undefined) return text(`no thread named ${input.name}`);
          const files = await threadOf(input.name).workspace();
          await seedWorkspace(spaceFiles(ctx), files);
          book.note('coordinator', `adopted ${Object.keys(files).length} files from ${input.name}`);
          return text(`adopted ${Object.keys(files).length} files from ${input.name}`);
        },
      }),
      defineTool({
        name: 'save_summary',
        description:
          'Save the space summary that people read. Call it once at the end, and again if it changes.',
        parameters: Type.Object({ body: Type.String() }),
        execute: async (input) => {
          book.saveSummary(input.body);
          return text('summary saved');
        },
      }),
    ],
  });
};

export class Space extends piAgent<Env>({
  name: SLUG,
  instructions:
    'You coordinate a space. Always call read_threads first, before you start anything: you may have been restarted, and threads you already started keep running. Reuse them; never start a second thread for a part that already has one. You do not write code yourself and you have no file tools. The space holds shared files; every thread starts with a copy of them. You split the job into worker threads with start_thread, wait until a worker is done, then start one checker thread for it with from set to that worker’s name, so the checker starts with the worker’s files; its brief is to run the worker’s tests and report pass or fail. Read results with read_threads and read_thread_files; call read_threads again until every thread is done. Never start a thread twice. When a checker says a worker’s result is good, call adopt_thread_files on that worker. When every worker has been checked, write a short summary with save_summary: one line per worker, its checker’s verdict, and anything left to do. Then reply in one short sentence.',
  environment: (_env, ctx, conversationId) => (conversationId === 'workspace' ? spaceFiles(ctx) : undefined),
  extensions: (env, ctx) => [spaceTools(env, ctx)],
  unfinished: async (_env, ctx) => {
    const book = ledger(ctx.storage.sql);
    const rows = book.all();
    if (rows.length === 0) return undefined;
    const running = rows.filter((row) => row.status === 'running').map((row) => row.name);
    if (running.length === 0 && book.summary().trim() !== '') return undefined;
    return running.length > 0
      ? `You replied, but these threads are still running: ${running.join(', ')}. Call read_threads until they are done, then check, adopt and save the summary.`
      : 'You replied, but no summary is saved. Check every worker, adopt the files that passed and call save_summary.';
  },
  helperSpend: async (env, ctx) => {
    const space = spaceName(ctx);
    const spends = await Promise.all(
      ledger(ctx.storage.sql)
        .all()
        .map((row) => env.THREAD.get(env.THREAD.idFromName(threadKey(space, row.name))).spentAlone()),
    );
    return {
      usd: spends.reduce((sum, each) => sum + each.usd, 0),
      tokens: spends.reduce((sum, each) => sum + each.tokens, 0),
    };
  },
  probe: async (_env, ctx) => {
    const book = ledger(ctx.storage.sql);
    const rows = book.all();
    const shared = Object.keys(await workspaceOf(spaceFiles(ctx)));
    return {
      facts: {
        sharedFiles: shared.join(', '),
        threads: rows.length,
        workers: rows.filter((row) => row.role === 'worker').length,
        checkers: rows.filter((row) => row.role === 'checker').length,
        done: rows.filter((row) => row.status === 'done').length,
        restartedThreads: rows.filter((row) => row.starts !== 1).length,
        repeatedWorkers: rows.filter((row) => row.role === 'worker' && /-\d+$/.test(row.name)).length,
        names: rows.map((row) => row.name).join(', '),
        summary: book.summary().slice(0, 2000),
        notes: book.notes().length,
      },
    };
  },
}) {}

export class Thread extends piAgent<Env>({
  name: `${SLUG}-thread`,
  instructions:
    'You are one thread in a space. A coordinator gave you this task. Your home directory is your workspace; a BEAM supervisor runs your tools as your own Unix user. Do the task with the tools, check it, then reply with a short result the coordinator can act on.',
  environment: (env, ctx) => seatEnv(env.BOX, SLUG, seatOf(ctx.id.toString()), ctx.id.toString()),
  probe: async (env, ctx) => ({ facts: await seatFacts(env.BOX, SLUG, ctx.id.toString()) }),
}) {}

const json = (body: unknown, status = 200) => Response.json(body, { status });

export default piRouter<Env>({
  shape: SLUG,
  agent: (env, name) => env.SPACE.get(env.SPACE.idFromName(name)),
  gateway: (env) => env.GATEWAY,
  extra: async (request, env) => {
    const url = new URL(request.url);
    if (url.pathname === '/fleet') return json(await fleetOf(env.BOX).state());
    return undefined;
  },
});
