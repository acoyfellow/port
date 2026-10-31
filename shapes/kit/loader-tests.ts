import { defineCommand, type IFileSystem } from 'just-bash/browser';
import { transform } from 'sucrase';

export type WorkerLoader = {
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

export type TestResult = { name: string; file: string; ok: boolean; error?: string };

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

const toModule = (path: string, source: string) =>
  transform(source, { transforms: ['typescript'], disableESTransforms: true })
    .code.replace(
      /(from\s+|import\s*\(\s*|import\s+)(["'])node:test\2/g,
      (_m, lead, quote) => `${lead}${quote}${relativeTo(path, '__test.js')}${quote}`,
    )
    .replace(/(["'])(\.{1,2}\/[^"']+)\.ts\1/g, (_m, quote, stem) => `${quote}${stem}.js${quote}`);

export const compileProject = (files: Record<string, string>) => {
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

export const runModuleInIsolate = async (loader: WorkerLoader, modules: Record<string, string>, main: string) => {
  const worker = loader.get(`probe:${crypto.randomUUID()}`, () => ({
    compatibilityDate: '2026-09-30',
    compatibilityFlags: ['nodejs_compat'],
    mainModule: '__probe.js',
    modules: { ...modules, '__probe.js': main },
    globalOutbound: null,
    env: {},
  }));
  const response = await worker.getEntrypoint().fetch('https://probe.isolate/');
  const result: unknown = await response.json();
  return result;
};

export const runInIsolate = async (
  loader: WorkerLoader,
  files: Record<string, string>,
  tests: readonly string[],
): Promise<TestResult[]> => {
  const modules: Record<string, string> = { '__test.js': testShim };
  const testModules: string[] = [];
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
    if (tests.includes(path)) testModules.push(name);
  }
  modules['__main.js'] = runnerMain(testModules);
  const worker = loader.get(`tests:${crypto.randomUUID()}`, () => ({
    compatibilityDate: '2026-09-30',
    compatibilityFlags: ['nodejs_compat'],
    mainModule: '__main.js',
    modules,
    globalOutbound: null,
    env: {},
  }));
  const response = await worker.getEntrypoint().fetch('https://tests.isolate/');
  const results: TestResult[] = await response.json();
  return [...errors, ...results];
};

const projectFiles = async (fs: IFileSystem, root: string) => {
  const files: Record<string, string> = {};
  for (const path of fs.getAllPaths()) {
    if (!path.startsWith(`${root}/`) || path.includes('/node_modules/')) continue;
    const stat = await fs.stat(path).catch(() => undefined);
    if (stat?.isFile === true) files[path.slice(root.length + 1)] = await fs.readFile(path, 'utf8');
  }
  return files;
};

const report = (results: readonly TestResult[]) => {
  const failed = results.filter((each) => !each.ok);
  const lines = results.map(
    (each) =>
      `${each.ok ? 'ok' : 'not ok'} - ${each.file} > ${each.name}${each.ok ? '' : `\n  ${each.error ?? ''}`}`,
  );
  return {
    text: `${lines.join('\n')}\n# pass ${results.length - failed.length}\n# fail ${failed.length}\n`,
    failed: failed.length,
  };
};

export const nodeTestCommand = (loader: WorkerLoader, root: string) =>
  defineCommand('node', async (args, ctx) => {
    if (args[0] !== '--test')
      return {
        stdout: '',
        stderr: 'node: only `node --test [files...]` runs here, in a Worker Loader isolate\n',
        exitCode: 1,
      };
    const files = await projectFiles(ctx.fs, root);
    const picked = args.slice(1).map((each) => (each.startsWith('./') ? each.slice(2) : each));
    const tests =
      picked.length > 0 ? picked : Object.keys(files).filter((path) => /^test\/[^/]+\.test\.ts$/.test(path));
    const { text, failed } = report(await runInIsolate(loader, files, tests));
    return { stdout: text, stderr: '', exitCode: failed === 0 ? 0 : 1 };
  });
