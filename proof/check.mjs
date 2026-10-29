import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const load = (name) =>
  existsSync(join(here, name)) ? JSON.parse(readFileSync(join(here, name), 'utf8')) : null;
const fail = (why) => {
  console.log(`gate: FAIL — ${why}`);
  process.exit(1);
};

const disproven = load('DISPROVEN.json');
if (disproven) {
  if (
    typeof disproven.step !== 'string' ||
    !Array.isArray(disproven.attempts) ||
    disproven.attempts.length < 3
  )
    fail('DISPROVEN.json needs step and 3 attempts');
  console.log(`gate: PASS (disproven at ${disproven.step})`);
  process.exit(0);
}

const signin = load('signin.json');
if (!signin) fail('missing signin.json (next: sign in at port.customer0.dev)');
if (signin.signedIn !== true || !signin.account || (signin.scopes ?? []).length !== 18)
  fail('signin.json: not signed in with 18 scopes');

const install = load('install.json');
if (!install) fail('missing install.json (next: install the fleet)');
if (!Array.isArray(install.resources) || install.resources.length === 0) fail('install.json: no resources');
if (!install.resources.every((r) => r.existsAfterInstall === true))
  fail('install.json: a resource was not found after install');

const evalReceipt = load('eval.json');
if (!evalReceipt) fail('missing eval.json (next: run the 5 tasks)');
const tasks = evalReceipt.tasks ?? [];
if (tasks.length !== 5) fail('eval.json: need 5 tasks');
if (
  !tasks.every((t) => typeof t.usd === 'number' && typeof t.ms === 'number' && typeof t.passed === 'boolean')
)
  fail('eval.json: each task needs passed, usd, ms');
const passed = tasks.filter((t) => t.passed).length;
if (passed < 4) fail(`eval.json: ${passed}/5 passed`);

const teardown = load('teardown.json');
if (!teardown) fail('missing teardown.json (next: tear down)');
const names = new Set(install.resources.map((r) => `${r.kind}:${r.name}`));
const checked = new Set(
  (teardown.resources ?? []).filter((r) => r.existsAfterTeardown === false).map((r) => `${r.kind}:${r.name}`),
);
for (const name of names) if (!checked.has(name)) fail(`teardown.json: ${name} not verified gone`);

console.log(`gate: PASS — ${passed}/5 tasks, ${names.size} resources installed and removed`);
