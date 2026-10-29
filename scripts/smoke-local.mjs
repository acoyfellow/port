import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const base = 'http://localhost:8862';
const model = process.argv[2] ?? '@cf/zai-org/glm-5.3-flash';
const task = process.argv[3] ?? 'money-words';
const maxTurns = Number(process.argv[4] ?? 6);
const evals = new URL('../evals/swarm-5/', import.meta.url).pathname;
const headers = { authorization: 'Bearer local', 'content-type': 'application/json' };

const walk = (root) => {
  const out = {};
  const go = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) go(full);
      else out[relative(root, full)] = readFileSync(full, 'utf8');
    }
  };
  go(root);
  return out;
};

const agent = `smoke-${Date.now()}`;
const start = await fetch(`${base}/run?agent=${agent}`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    task,
    prompt: readFileSync(join(evals, 'tasks', task, 'prompt.md'), 'utf8'),
    files: walk(join(evals, 'seed')),
    hidden: {
      entry: `test/hidden/${task}.test.ts`,
      files: {
        [`test/hidden/${task}.test.ts`]: readFileSync(join(evals, 'tasks', task, `${task}.test.ts`), 'utf8'),
        'test/hidden/fixtures.ts': readFileSync(join(evals, 'fixtures.ts'), 'utf8'),
      },
    },
    model,
    maxTurns,
  }),
});
console.log('start', start.status);

for (let i = 0; i < 40; i++) {
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const status = await (await fetch(`${base}/status?agent=${agent}`, { headers })).json();
  console.log(
    `${status.state} turns=${status.turns} usd=${status.usd.toFixed(4)} tools=${JSON.stringify(status.toolCalls)}`,
  );
  if (status.state !== 'running') {
    console.log(
      JSON.stringify(
        { passed: status.passed, visible: status.visible, hidden: status.hidden, error: status.error },
        null,
        1,
      ),
    );
    break;
  }
}
