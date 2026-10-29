import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const base = process.argv[2] ?? 'http://localhost:8862';
const key = process.env.FLEET_KEY ?? 'local';
const ref = process.env.REFERENCE_DIR;
const evals = new URL('../evals/swarm-5/', import.meta.url).pathname;
const tasks = ['business-days', 'cart-merge', 'csv-parse', 'money-words', 'sku-glob'];
const visibleTest = /^test\/[^/]+\.test\.ts$/;

const walk = (root) => {
  const out = {};
  const go = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) go(full);
      else if (/\.(ts|json|md)$/.test(name)) out[relative(root, full)] = readFileSync(full, 'utf8');
    }
  };
  go(root);
  return out;
};

const run = async (files, tests) => {
  const response = await fetch(`${base}/selftest`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ files, tests }),
  });
  return response.json();
};

const fixtures = readFileSync(join(evals, 'fixtures.ts'), 'utf8');
const sets = { seed: walk(join(evals, 'seed')), ...(ref ? { reference: walk(ref) } : {}) };

for (const [label, files] of Object.entries(sets)) {
  const visible = await run(
    files,
    Object.keys(files).filter((path) => visibleTest.test(path)),
  );
  console.log(`${label} visible: ${visible.filter((x) => x.ok).length}/${visible.length}`);
  for (const task of tasks) {
    const hiddenPath = `test/hidden/${task}.test.ts`;
    const code = readFileSync(join(evals, 'tasks', task, `${task}.test.ts`), 'utf8');
    const results = await run({ ...files, [hiddenPath]: code, 'test/hidden/fixtures.ts': fixtures }, [
      hiddenPath,
    ]);
    const bad = results.filter((x) => !x.ok);
    const first = bad[0]
      ? `  first fail: ${bad[0].name} — ${String(bad[0].error).split('\n')[0].slice(0, 120)}`
      : '';
    console.log(`${label} ${task}: ${results.length - bad.length}/${results.length}${first}`);
  }
}
