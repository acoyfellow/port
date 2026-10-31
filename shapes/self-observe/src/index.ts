import { Type } from '@earendil-works/pi-ai';
import { defineExtension, defineTool } from '@earendil-works/pi-durable';
import { type AgentEnv, piAgent } from '../../kit/agent.ts';
import {
  compileProject,
  nodeTestCommand,
  runInIsolate,
  runModuleInIsolate,
  type WorkerLoader,
} from '../../kit/loader-tests.ts';
import { MemoryExecutionEnv, sqliteFileStore } from '../../kit/memory-env.ts';
import { piRouter } from '../../kit/router.ts';
import { mutantsOf, probeMain, shrinkBody, traceBody } from './observe.ts';

type Env = AgentEnv & { readonly AGENT: DurableObjectNamespace<Observer>; readonly LOADER: WorkerLoader };

const WORKSPACE = '/workspace';
const SCOPE = 'workspace';
const decoder = new TextDecoder();

const workspaceFiles = (ctx: DurableObjectState) =>
  Object.fromEntries(
    Object.entries(sqliteFileStore(ctx.storage.sql, SCOPE).load())
      .filter(([path]) => path.startsWith(`${WORKSPACE}/`))
      .map(([path, bytes]) => [path.slice(WORKSPACE.length + 1), decoder.decode(bytes)]),
  );

const visibleTests = (files: Record<string, string>) =>
  Object.keys(files).filter((path) => /^test\/[^/]+\.test\.ts$/.test(path));

const countUse = (ctx: DurableObjectState, tool: string) => {
  ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS isolate_runs (tool TEXT PRIMARY KEY, runs INTEGER)');
  ctx.storage.sql.exec(
    'INSERT INTO isolate_runs (tool, runs) VALUES (?, 1) ON CONFLICT(tool) DO UPDATE SET runs = runs + 1',
    tool,
  );
};

const usesOf = (ctx: DurableObjectState) => {
  ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS isolate_runs (tool TEXT PRIMARY KEY, runs INTEGER)');
  const rows = ctx.storage.sql
    .exec<{ tool: string; runs: number }>('SELECT tool, runs FROM isolate_runs')
    .toArray();
  return Object.fromEntries(rows.map((row) => [row.tool, row.runs]));
};

const text = (value: string) => ({ output: [{ type: 'text' as const, text: value }] });

const probe = async (env: Env, ctx: DurableObjectState, path: string, exportName: string, body: string) => {
  countUse(ctx, 'probe');
  const { modules, errors } = compileProject(workspaceFiles(ctx));
  if (errors.length > 0)
    return text(`compile error: ${errors.map((each) => `${each.file}: ${each.error}`).join('\n')}`);
  const result = await runModuleInIsolate(
    env.LOADER,
    modules,
    probeMain(path.replace(/\.ts$/, '.js'), exportName, body),
  );
  return text(JSON.stringify(result).slice(0, 2500));
};

const observeTools = (env: Env, ctx: DurableObjectState) =>
  defineExtension({
    name: 'observe',
    tools: [
      defineTool({
        name: 'shrink',
        description:
          'Check a property of one exported function against 200 random inputs in a fresh isolate. On failure, returns the smallest failing input, the error and the output for it. property is a JS arrow (fn, input) => boolean; generator is a JS arrow (gen) => input using gen.int(lo,hi), gen.str(n), gen.array(make,n), gen.pick(xs), gen.bool().',
        parameters: Type.Object({
          path: Type.String(),
          export: Type.String(),
          property: Type.String(),
          generator: Type.String(),
        }),
        replay: 'safe',
        execute: (args) =>
          probe(env, ctx, args.path, args.export, shrinkBody(args.property, args.generator, 200)),
      }),
      defineTool({
        name: 'trace',
        description:
          'Call one exported function with the given arguments in a fresh isolate and return the output or the error. args is a JS array literal.',
        parameters: Type.Object({ path: Type.String(), export: Type.String(), args: Type.String() }),
        replay: 'safe',
        execute: (args) => probe(env, ctx, args.path, args.export, traceBody(args.args || '[]')),
      }),
      defineTool({
        name: 'mutate',
        description:
          'Mutation-test one source file: make up to 30 small changes, run your tests on each in a fresh isolate, and list the changes your tests do not catch.',
        parameters: Type.Object({ path: Type.String() }),
        replay: 'safe',
        execute: async (args) => {
          const files = workspaceFiles(ctx);
          const source = files[args.path];
          if (source === undefined) return text(`No file ${args.path}`);
          const tests = visibleTests(files);
          const baseline = await runInIsolate(env.LOADER, files, tests);
          if (baseline.some((each) => !each.ok))
            return text('fix the failing tests first: mutate needs a green baseline');
          countUse(ctx, 'mutate');
          const mutants = mutantsOf(source, 30);
          const survivors: string[] = [];
          for (const mutant of mutants) {
            const results = await runInIsolate(env.LOADER, { ...files, [args.path]: mutant.source }, tests);
            if (results.every((each) => each.ok))
              survivors.push(`line ${mutant.line}: \`${mutant.from}\` -> \`${mutant.to}\``);
          }
          return text(
            `${mutants.length - survivors.length}/${mutants.length} changes caught by your tests.${survivors.length > 0 ? `\nNOT caught:\n${survivors.slice(0, 12).join('\n')}` : ''}`,
          );
        },
      }),
    ],
  });

export class Observer extends piAgent<Env>({
  name: 'self-observe',
  instructions:
    'You are a careful TypeScript engineer in /workspace. Make the change the task asks for and add tests. Run tests with `node --test` (a fresh Worker Loader isolate). Before you finish, use shrink on each function you wrote with a property from the task, use trace to see what a function really returns, and run mutate on each source file you changed; add a test for each change it says your tests miss. Reply with a one-line summary.',
  environment: (env, ctx) =>
    new MemoryExecutionEnv({
      id: `self-observe:${ctx.id.toString()}`,
      cwd: WORKSPACE,
      store: sqliteFileStore(ctx.storage.sql, SCOPE),
      commands: [nodeTestCommand(env.LOADER, WORKSPACE)],
    }),
  extensions: (env, ctx) => [observeTools(env, ctx)],
  probe: async (_env, ctx) => {
    const uses = usesOf(ctx);
    return { facts: { probeRuns: uses.probe ?? 0, mutateRuns: uses.mutate ?? 0 } };
  },
}) {
  seed(files: Record<string, string>) {
    const store = sqliteFileStore(this.ctx.storage.sql, SCOPE);
    if (Object.keys(store.load()).length > 0) return;
    for (const [path, body] of Object.entries(files))
      store.save(`${WORKSPACE}/${path}`, new TextEncoder().encode(body));
  }

  async grade(hidden: Record<string, string>, entry: string) {
    const results = await runInIsolate(this.env.LOADER, { ...workspaceFiles(this.ctx), ...hidden }, [entry]);
    return { passed: results.filter((each) => each.ok).length, total: results.length };
  }
}

export default piRouter<Env>({
  shape: 'self-observe',
  agent: (env, name) => env.AGENT.get(env.AGENT.idFromName(name)),
  gateway: (env) => env.GATEWAY,
  extra: async (request, env) => {
    const url = new URL(request.url);
    const agent = env.AGENT.get(env.AGENT.idFromName(url.searchParams.get('agent') ?? ''));
    if (url.pathname === '/seed' && request.method === 'POST') {
      const files: Record<string, string> = await request.json();
      await agent.seed(files);
      return Response.json({ seeded: Object.keys(files).length });
    }
    if (url.pathname === '/grade' && request.method === 'POST') {
      const body: { hidden: Record<string, string>; entry: string } = await request.json();
      return Response.json(await agent.grade(body.hidden, body.entry));
    }
    return undefined;
  },
});
