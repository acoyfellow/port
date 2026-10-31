import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../..', import.meta.url).pathname;
const PORT = process.env.PORT_URL ?? 'https://port.customer0.dev';
const CLI_KEY = process.env.PORT_CLI_KEY;
const [slug] = process.argv.slice(2);
if (!slug || !CLI_KEY) throw new Error('usage: PORT_CLI_KEY=portcli.… node proof/install/run.mjs <slug>');

const port = async (method, path) => {
  const response = await fetch(`${PORT}${path}`, {
    method,
    headers: { authorization: `Bearer ${CLI_KEY}` },
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
};

const started = Date.now();
const installed = await port('POST', `/installs/shapes/${slug}`);
const record = installed.body;
console.log(`install ${slug}: HTTP ${installed.status} ${record.state ?? ''}`);
for (const line of record.log ?? []) console.log(`  ${line}`);

let smoke = { ok: false, tail: ['not run: install failed'] };
if (record.state === 'installed') {
  const secret = await port('GET', `/installs/shapes-${record.id}/key`);
  try {
    const output = execFileSync(process.execPath, ['smoke.ts'], {
      cwd: join(root, 'shapes', slug),
      env: {
        ...process.env,
        SHAPE_URL: secret.body.url,
        SHAPE_PORT_KEY: secret.body.key,
        SHAPE_KEY: secret.body.key,
        SHAPE_INSTALL_ID: record.id,
      },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
    smoke = { ok: true, tail: output.trim().split('\n').slice(-4) };
  } catch (error) {
    smoke = { ok: false, tail: `${error.stdout ?? ''}\n${error.stderr ?? ''}`.trim().split('\n').slice(-12) };
  }
}
console.log(`smoke ${slug}: ${smoke.ok ? 'ok' : 'FAILED'}`);
for (const line of smoke.tail) console.log(`  ${line.slice(0, 400)}`);

const removed =
  record.id === undefined ? { body: record } : await port('POST', `/installs/shapes-${record.id}/delete`);
console.log(`teardown ${slug}: ${removed.body.state}`);

const smokeFile = join(root, 'proof', 'install', 'runs', `${slug}.smoke.json`);
const pi = (() => {
  try {
    const parsed = JSON.parse(readFileSync(smokeFile, 'utf8'));
    return parsed.install === record.id ? parsed : null;
  } catch {
    return null;
  }
})();

const receipt = {
  slug,
  at: new Date().toISOString(),
  via: `${PORT}/installs/shapes/${slug}`,
  install: record.id ?? null,
  account: record.accountId ?? null,
  build: record.version ?? null,
  installed: record.state === 'installed',
  resources: (removed.body.resources ?? record.resources ?? []).map((resource) => ({
    kind: resource.kind,
    name: resource.name,
    existedAfterInstall: resource.existsAfterInstall ?? null,
    existsAfterTeardown: resource.existsAfterTeardown ?? null,
  })),
  removed: removed.body.state === 'removed',
  pi,
  smokeOk: smoke.ok,
  seconds: Math.round((Date.now() - started) / 1000),
  log: removed.body.log ?? record.log ?? [],
};
writeFileSync(join(root, 'proof', 'install', `${slug}.json`), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(
  `receipt proof/install/${slug}.json: installed=${receipt.installed} pi=${pi?.passed ?? false}/${pi?.resumed ?? false} removed=${receipt.removed}`,
);
process.exit(receipt.installed && smoke.ok && receipt.removed ? 0 : 1);
