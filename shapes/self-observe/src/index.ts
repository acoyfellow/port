import { DurableObject } from 'cloudflare:workers';
import { transform } from 'sucrase';
import { type Block, callModel, costOf, type Message, type ModelEnv, type Tool, type ToolUse } from './model';
import { type Arm, ARMS, armHas, govern, mutantsOf, probeMain, shrinkBody, type TurnRecord, traceBody } from './observe';

type Env = ModelEnv & {
  readonly AGENT: DurableObjectNamespace<Agent>;
  readonly LOADER: WorkerLoader;
  readonly FLEET_KEY: string;
};

type WorkerLoader = {
  get(id: string, code: () => WorkerCode): { getEntrypoint(): Fetcher };
};

type WorkerCode = {
  compatibilityDate: string;
  compatibilityFlags: string[];
  mainModule: string;
  modules: Record<string, string>;
  globalOutbound: null;
  env: Record<string, never>;
};

type Files = Record<string, string>;

type Job = {
  task: string;
  prompt: string;
  files: Files;
  hidden: { files: Files; entry: string };
  check?: { files: Files; entry: string };
  model: string;
  maxTurns: number;
  arm?: Arm;
};

type TestResult = { name: string; file: string; ok: boolean; error?: string };

type Outcome = {
  state: 'running' | 'done' | 'failed';
  task: string;
  turns: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  usd: number;
  startedAt: number;
  ms: number;
  toolCalls: Record<string, number>;
  arm: Arm;
  governorNotes: number;
  checks: number;
  history: TurnRecord[];
  visible?: { passed: number; total: number };
  hidden?: { passed: number; total: number; failures: TestResult[] };
  passed?: boolean;
  error?: string;
};

const testShim = `const tests = [];
const prefix = [];
export const test = (name, a, b) => { const fn = typeof a === "function" ? a : b; tests.push({ name: [...prefix, name].join(" > "), fn }); };
export const it = test;
export const describe = (name, fn) => { prefix.push(name); try { fn(); } finally { prefix.pop(); } };
export const take = () => tests.splice(0, tests.length);
export default test;`;

const runnerMain = (testFiles: readonly string[]) => `import { take } from "./__test.js";
const files = ${JSON.stringify(testFiles)};
export default {
  async fetch() {
    const results = [];
    for (const file of files) {
      try {
        await import("./" + file);
      } catch (error) {
        results.push({ name: "load", file, ok: false, error: String(error && error.stack ? error.stack : error).slice(0, 800) });
        take();
        continue;
      }
      for (const t of take()) {
        try {
          await t.fn({ skip() {}, todo() {} });
          results.push({ name: t.name, file, ok: true });
        } catch (error) {
          results.push({ name: t.name, file, ok: false, error: String(error && error.message ? error.message : error).slice(0, 800) });
        }
      }
    }
    return Response.json(results);
  }
};`;

const relativeTo = (from: string, target: string) => {
  const depth = from.split('/').length - 1;
  return `${depth === 0 ? './' : '../'.repeat(depth)}${target}`;
};

export const toModule = (path: string, source: string) => {
  const code = transform(source, { transforms: ['typescript'], disableESTransforms: true }).code;
  return code
    .replace(
      /(from\s+|import\s*\(\s*|import\s+)(["'])node:test\2/g,
      (_m, lead, quote) => `${lead}${quote}${relativeTo(path, '__test.js')}${quote}`,
    )
    .replace(/(["'])(\.{1,2}\/[^"']+)\.ts\1/g, (_m, quote, stem) => `${quote}${stem}.js${quote}`);
};

const isVisibleTest = (path: string) => /^test\/[^/]+\.test\.ts$/.test(path);

const compileAll = (files: Files) => {
  const modules: Record<string, string> = { '__test.js': testShim };
  const errors: TestResult[] = [];
  for (const [path, source] of Object.entries(files)) {
    if (!path.endsWith('.ts')) continue;
    try {
      modules[path.replace(/\.ts$/, '.js')] = toModule(path.replace(/\.ts$/, '.js'), source);
    } catch (error) {
      errors.push({ name: 'compile', file: path, ok: false, error: String(error).slice(0, 800) });
    }
  }
  return { modules, errors };
};

const runIsolate = async (env: Env, modules: Record<string, string>, main: string): Promise<unknown> => {
  const worker = env.LOADER.get(`probe:${crypto.randomUUID()}`, () => ({
    compatibilityDate: '2026-09-30',
    compatibilityFlags: ['nodejs_compat'],
    mainModule: '__probe.js',
    modules: { ...modules, '__probe.js': main },
    globalOutbound: null,
    env: {},
  }));
  const response = await Promise.race([
    worker.getEntrypoint().fetch('https://probe.fleet/'),
    new Promise<Response>((resolve) => setTimeout(() => resolve(Response.json({ error: 'timed out after 10 s' })), 10_000)),
  ]);
  return response.json();
};

const runTests = async (env: Env, files: Files, pick: (path: string) => boolean): Promise<TestResult[]> => {
  const modules: Record<string, string> = { '__test.js': testShim };
  const testFiles: string[] = [];
  const errors: TestResult[] = [];

  for (const [path, source] of Object.entries(files)) {
    if (!path.endsWith('.ts')) continue;
    const name = path.replace(/\.ts$/, '.js');
    try {
      modules[name] = toModule(name, source);
    } catch (error) {
      errors.push({ name: 'compile', file: path, ok: false, error: String(error).slice(0, 800) });
      continue;
    }
    if (pick(path)) testFiles.push(name);
  }

  modules['__main.js'] = runnerMain(testFiles);
  const worker = env.LOADER.get(`tests:${crypto.randomUUID()}`, () => ({
    compatibilityDate: '2026-09-30',
    compatibilityFlags: ['nodejs_compat'],
    mainModule: '__main.js',
    modules,
    globalOutbound: null,
    env: {},
  }));
  try {
    const response = await worker.getEntrypoint().fetch('https://tests.fleet/');
    const results: TestResult[] = await response.json();
    return [...errors, ...results];
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error).slice(0, 300);
    return [
      ...errors,
      { name: 'run', file: testFiles.join(', '), ok: false, error: `the tests did not finish: ${message}. Your code is too slow or loops forever on some input.` },
    ];
  }
};

const TOOLS: Tool[] = [
  {
    name: 'list_files',
    description: 'List every file path in the project.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'read_file',
    description: 'Read one file.',
    input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  },
  {
    name: 'write_file',
    description: 'Create or replace a whole file.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string' }, content: { type: 'string' } },
      required: ['path', 'content'],
    },
  },
  {
    name: 'edit_file',
    description: 'Replace one exact, unique piece of text in a file.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string' }, old_text: { type: 'string' }, new_text: { type: 'string' } },
      required: ['path', 'old_text', 'new_text'],
    },
  },
  {
    name: 'run_tests',
    description: 'Run node --test on every test/*.test.ts file and report each failing test.',
    input_schema: { type: 'object', properties: {} },
  },
];

const OBSERVE_TOOLS: Record<'shrink' | 'trace' | 'mutate', Tool> = {
  shrink: {
    name: 'shrink',
    description:
      'Check a property of one exported function against 200 random inputs. On failure, returns the SMALLEST failing input, the error and the output for it. property is a JS arrow (fn, input) => boolean that calls fn. generator is a JS arrow (gen) => input using gen.int(lo,hi), gen.str(n), gen.array(make,n), gen.pick(xs), gen.bool().',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string' }, export: { type: 'string' }, property: { type: 'string' }, generator: { type: 'string' } },
      required: ['path', 'export', 'property', 'generator'],
    },
  },
  trace: {
    name: 'trace',
    description: 'Call one exported function with the given arguments in a sandbox and return the output or the error. args is a JS array literal, e.g. [money(150, "USD")]; money is not in scope, so build plain objects.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string' }, export: { type: 'string' }, args: { type: 'string' } },
      required: ['path', 'export', 'args'],
    },
  },
  mutate: {
    name: 'mutate',
    description: 'Mutation test one source file: make up to 30 small changes (flip a compare, swap && and ||, nudge a number), run your tests on each, and list the changes your tests do NOT catch. A surviving change means a missing test.',
    input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  },
};

const toolsFor = (arm: Arm): Tool[] => [
  ...TOOLS,
  ...(armHas(arm, 'shrink') ? [OBSERVE_TOOLS.shrink] : []),
  ...(armHas(arm, 'trace') ? [OBSERVE_TOOLS.trace] : []),
  ...(armHas(arm, 'mutate') ? [OBSERVE_TOOLS.mutate] : []),
];

const SYSTEM =
  'You are a careful TypeScript engineer working in a small repository. Make the change the task asks for, add tests for it in the test folder, and keep every existing test passing. Use the tools to read and change files and to run the tests. When run_tests passes and the task is done, reply with a one-line summary and no tool calls.';

const systemFor = (arm: Arm) => {
  const extra: string[] = [];
  if (armHas(arm, 'shrink')) extra.push('Before you finish, use shrink on each function you wrote with a property from the task, and use trace to see what a function really returns. Fix every failure shrink finds.');
  if (armHas(arm, 'mutate')) extra.push('When your tests pass, run mutate on each source file you changed and add a test for each change it says your tests do not catch.');
  if (armHas(arm, 'governor')) extra.push('A governor watches your loop and may add a line that starts with "governor:". Follow it.');
  return extra.length ? `${SYSTEM}\n\n${extra.join('\n')}` : SYSTEM;
};

const callWithRetry = async <T>(call: () => Promise<T>): Promise<T> => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await call();
    } catch (error) {
      const message = String(error instanceof Error ? error.message : error);
      if (attempt >= 4 || !/timeout|3046|overloaded|capacity/i.test(message)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
    }
  }
};

const isToolUse = (block: Block): block is ToolUse => block.type === 'tool_use';

const withoutLeadingDotSlash = (path: string) =>
  path.startsWith('./') ? path.slice(2) : path.startsWith('/') ? path.slice(1) : path;

const text = (value: unknown) => (typeof value === 'string' ? value : '');

export class Agent extends DurableObject<Env> {
  private async outcome(): Promise<Outcome | undefined> {
    return this.ctx.storage.get<Outcome>('outcome');
  }

  async start(job: Job): Promise<Outcome> {
    const outcome: Outcome = {
      state: 'running',
      task: job.task,
      turns: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      usd: 0,
      startedAt: Date.now(),
      ms: 0,
      toolCalls: {},
      arm: job.arm && ARMS.includes(job.arm) ? job.arm : 'baseline',
      governorNotes: 0,
      checks: 0,
      history: [],
    };
    await this.ctx.storage.put({ job, outcome, files: job.files });
    await this.ctx.storage.setAlarm(Date.now());
    return outcome;
  }

  async status(): Promise<Outcome | null> {
    return (await this.outcome()) ?? null;
  }

  async files(): Promise<Files> {
    return (await this.ctx.storage.get<Files>('files')) ?? {};
  }

  override async alarm(): Promise<void> {
    const job = await this.ctx.storage.get<Job>('job');
    const outcome = await this.outcome();
    if (job === undefined || outcome === undefined || outcome.state !== 'running') return;

    try {
      await this.loop(job, outcome);
      const files = await this.files();
      const visible = await runTests(this.env, files, isVisibleTest);
      const hidden = await runTests(
        this.env,
        { ...files, ...job.hidden.files },
        (p) => p === job.hidden.entry,
      );
      outcome.visible = { passed: visible.filter((r) => r.ok).length, total: visible.length };
      outcome.hidden = {
        passed: hidden.filter((r) => r.ok).length,
        total: hidden.length,
        failures: hidden.filter((r) => !r.ok),
      };
      outcome.passed = hidden.length > 0 && hidden.every((r) => r.ok) && visible.every((r) => r.ok);
      outcome.state = 'done';
    } catch (error) {
      outcome.state = 'failed';
      outcome.error = String(error instanceof Error ? error.message : error).slice(0, 1000);
    }
    outcome.ms = Date.now() - outcome.startedAt;
    await this.ctx.storage.put('outcome', outcome);
  }

  private async tool(
    name: string,
    input: Record<string, unknown>,
  ): Promise<{ content: string; error: boolean }> {
    const files = await this.files();
    const path = withoutLeadingDotSlash(text(input.path));

    if (name === 'list_files') return { content: Object.keys(files).sort().join('\n'), error: false };
    if (name === 'read_file')
      return path in files
        ? { content: files[path] ?? '', error: false }
        : { content: `No file ${path}`, error: true };
    if (name === 'write_file') {
      await this.ctx.storage.put('files', { ...files, [path]: text(input.content) });
      return { content: `Wrote ${path}`, error: false };
    }
    if (name === 'edit_file') {
      const current = files[path];
      const oldText = text(input.old_text);
      if (current === undefined) return { content: `No file ${path}`, error: true };
      const count = current.split(oldText).length - 1;
      if (oldText === '' || count !== 1)
        return { content: `old_text found ${count} times in ${path}; it must be found once`, error: true };
      await this.ctx.storage.put('files', {
        ...files,
        [path]: current.replace(oldText, () => text(input.new_text)),
      });
      return { content: `Edited ${path}`, error: false };
    }
    if (name === 'run_tests') {
      const results = await runTests(this.env, files, isVisibleTest);
      const failed = results.filter((r) => !r.ok);
      const summary = `${results.length - failed.length}/${results.length} passed`;
      return {
        content:
          failed.length === 0
            ? summary
            : `${summary}\n${failed.map((f) => `FAIL ${f.file} :: ${f.name}\n${f.error}`).join('\n')}`,
        error: failed.length > 0,
      };
    }
    if (name === 'shrink' || name === 'trace') {
      const target = path.replace(/\.ts$/, '.js');
      const { modules, errors } = compileAll(files);
      if (errors.length > 0) return { content: `compile error: ${errors.map((e) => `${e.file}: ${e.error}`).join('\n')}`, error: true };
      const body = name === 'shrink' ? shrinkBody(text(input.property), text(input.generator), 200) : traceBody(text(input.args) || '[]');
      const result = await runIsolate(this.env, modules, probeMain(target, text(input.export), body));
      return { content: JSON.stringify(result).slice(0, 2500), error: false };
    }
    if (name === 'mutate') {
      const source = files[path];
      if (source === undefined) return { content: `No file ${path}`, error: true };
      const baseline = await runTests(this.env, files, isVisibleTest);
      if (baseline.some((r) => !r.ok)) return { content: 'fix the failing tests first: mutate needs a green baseline', error: true };
      const mutants = mutantsOf(source, 30);
      const survivors: string[] = [];
      for (const mutant of mutants) {
        const results = await runTests(this.env, { ...files, [path]: mutant.source }, isVisibleTest);
        if (results.every((r) => r.ok)) survivors.push(`line ${mutant.line}: \`${mutant.from}\` → \`${mutant.to}\``);
      }
      return {
        content: `${mutants.length - survivors.length}/${mutants.length} changes caught by your tests.${survivors.length ? `\nNOT caught (add a test that fails on each):\n${survivors.slice(0, 12).join('\n')}` : ''}`,
        error: false,
      };
    }
    return { content: `Unknown tool ${name}`, error: true };
  }

  private async loop(job: Job, outcome: Outcome) {
    const messages: Message[] = [{ role: 'user', content: job.prompt }];

    while (outcome.turns < job.maxTurns) {
      const reply = await callWithRetry(() => callModel(this.env, job.model, systemFor(outcome.arm), toolsFor(outcome.arm), messages));
      outcome.turns += 1;
      outcome.inputTokens += reply.usage.input;
      outcome.outputTokens += reply.usage.output;
      outcome.cacheReadTokens += reply.usage.cacheRead;
      outcome.cacheWriteTokens += reply.usage.cacheWrite;
      outcome.usd = costOf(job.model, {
        input: outcome.inputTokens,
        output: outcome.outputTokens,
        cacheRead: outcome.cacheReadTokens,
        cacheWrite: outcome.cacheWriteTokens,
      });
      messages.push({ role: 'assistant', content: reply.content });

      const calls = reply.content.filter(isToolUse);
      if (calls.length === 0) {
        if (outcome.arm !== 'grounded' || !job.check || outcome.checks >= 2) break;
        const files = await this.files();
        const results = await runTests(this.env, { ...files, ...job.check.files }, (path) => path === job.check?.entry);
        const failed = results.find((result) => !result.ok);
        if (!failed) break;
        outcome.checks += 1;
        messages.push({
          role: 'user',
          content: `A replay check ran your code. The first failing case:\n${failed.name}\n${failed.error ?? ''}\nFix the code so this case passes, keep every test passing, then stop again.`,
        });
        continue;
      }

      const results: Block[] = [];
      let passed: number | null = null;
      let total: number | null = null;
      for (const call of calls) {
        outcome.toolCalls[call.name] = (outcome.toolCalls[call.name] ?? 0) + 1;
        const result = await this.tool(call.name, call.input);
        if (call.name === 'run_tests') {
          const m = /^(\d+)\/(\d+) passed/.exec(result.content);
          if (m) {
            passed = Number(m[1]);
            total = Number(m[2]);
          }
        }
        results.push({
          type: 'tool_result',
          tool_use_id: call.id,
          content: result.content,
          is_error: result.error,
        });
      }
      outcome.history.push({
        turn: outcome.turns,
        tools: calls.map((c) => c.name),
        paths: calls.map((c) => withoutLeadingDotSlash(text(c.input.path))),
        passed,
        total,
        tokens: outcome.inputTokens + outcome.outputTokens,
      });
      if (armHas(outcome.arm, 'governor')) {
        const verdict = govern(outcome.history, job.maxTurns);
        const lastResult = results.at(-1);
        if (verdict.note && lastResult && lastResult.type === 'tool_result') {
          lastResult.content = `${lastResult.content}\n\n${verdict.note}`;
          outcome.governorNotes += 1;
        }
      }
      const last = results.at(-1);
      if (last !== undefined && last.type === 'tool_result') last.cache_control = { type: 'ephemeral' };
      messages.push({ role: 'user', content: results });
      outcome.ms = Date.now() - outcome.startedAt;
      await this.ctx.storage.put('outcome', outcome);
    }
  }
}

const json = (body: unknown, status = 200) => Response.json(body, { status });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${env.FLEET_KEY}`)
      return json({ error: 'unauthorized' }, 401);

    const url = new URL(request.url);
    const id = url.searchParams.get('agent') ?? '';
    if (url.pathname === '/health') return json({ ok: true, gateway: env.GATEWAY });
    if (url.pathname === '/selftest' && request.method === 'POST') {
      const body: { files: Files; tests: string[] } = await request.json();
      return json(await runTests(env, body.files, (p) => body.tests.includes(p)));
    }
    if (id === '') return json({ error: 'agent is required' }, 400);

    const agent = env.AGENT.get(env.AGENT.idFromName(id));
    if (url.pathname === '/run' && request.method === 'POST')
      return json(await agent.start(await request.json()));
    if (url.pathname === '/status') return json(await agent.status());
    if (url.pathname === '/files') return json(await agent.files());
    return json({ error: 'not found' }, 404);
  },
} satisfies ExportedHandler<Env>;
