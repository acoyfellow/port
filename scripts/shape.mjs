import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const receipts = join(root, 'proof', 'shapes');
const PREFIX = 'port-shape-';

const accountId = () => {
  const fromEnv = process.env.SHAPE_ACCOUNT_ID;
  if (fromEnv) return fromEnv;
  const file = join(root, '.tmp', 'personal-account');
  if (!existsSync(file)) throw new Error('Set SHAPE_ACCOUNT_ID or write .tmp/personal-account');
  return readFileSync(file, 'utf8').trim();
};

const token = () => {
  const fromEnv = process.env.CLOUDFLARE_API_TOKEN;
  if (fromEnv) return fromEnv;
  const config = readFileSync(
    [
      join(homedir(), '.wrangler/config/default.toml'),
      join(homedir(), 'Library/Preferences/.wrangler/config/default.toml'),
    ].find(existsSync) ?? '',
    'utf8',
  );
  const match = /oauth_token = "([^"]+)"/.exec(config);
  if (match === null) throw new Error('No wrangler OAuth token. Run npx wrangler login.');
  const expiry = /expiration_time = "([^"]+)"/.exec(config);
  if (expiry !== null && Date.parse(expiry[1]) < Date.now() + 60_000) {
    execFileSync('npx', ['wrangler', 'whoami'], { cwd: root, stdio: 'ignore' });
    return token();
  }
  return match[1];
};

const api = async (path, init = {}) => {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId()}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token()}`, 'content-type': 'application/json', ...init.headers },
  });
  const body = await response
    .json()
    .catch(() => ({ success: false, errors: [{ message: `HTTP ${response.status}` }] }));
  return { status: response.status, body };
};

const names = (result, key = 'name') =>
  (Array.isArray(result) ? result : []).map((item) => item[key] ?? item.id ?? item.title).filter(Boolean);

const registryBasic = async (permissions) => {
  const minted = await api('/containers/registries/registry.cloudflare.com/credentials', {
    method: 'POST',
    body: JSON.stringify({ expiration_minutes: 5, permissions }),
  });
  const password = minted.body.result?.password;
  if (typeof password !== 'string') throw new Error(`registry credentials: HTTP ${minted.status}`);
  return Buffer.from(`v1:${password}`).toString('base64');
};

const KINDS = {
  worker: async () => names((await api('/workers/scripts')).body.result, 'id'),
  'do-namespace': async () =>
    names((await api('/workers/durable_objects/namespaces?per_page=1000')).body.result),
  kv: async () => names((await api('/storage/kv/namespaces?per_page=100')).body.result, 'title'),
  d1: async () => names((await api('/d1/database?per_page=100')).body.result),
  r2: async () => names((await api('/r2/buckets')).body.result?.buckets),
  queue: async () => names((await api('/queues')).body.result, 'queue_name'),
  'ai-gateway': async () => names((await api('/ai-gateway/gateways?per_page=100')).body.result, 'id'),
  container: async () => names((await api('/containers/applications')).body.result),
  workflow: async () => names((await api('/workflows?per_page=100')).body.result),
  'registry-image': async () => {
    const basic = await registryBasic(['pull']);
    const repositories = new Set();
    let next = 'https://registry.cloudflare.com/v2/_catalog?tags=true&n=1000';
    for (let page = 0; page < 50 && next !== null; page++) {
      const response = await fetch(next, { headers: { authorization: `Basic ${basic}` } });
      if (!response.ok) throw new Error(`registry catalog: HTTP ${response.status}`);
      const catalog = await response.json();
      for (const repository of Object.keys(catalog.repositories ?? {})) repositories.add(repository);
      const link = /<?([^>;]+)>?;\s*rel="?next/.exec(response.headers.get('link') ?? '');
      next = link === null ? null : link[1];
    }
    return [...repositories].map(
      (repository) => repository.split('/').find((part) => part.startsWith(PREFIX)) ?? '',
    );
  },
};

export const sweep = async (slug) => {
  const match = slug === 'all' ? PREFIX : `${PREFIX}${slug}`;
  const found = {};
  const errors = {};
  for (const [kind, list] of Object.entries(KINDS)) {
    try {
      const hits = (await list()).filter((name) => String(name).startsWith(match));
      if (hits.length > 0) found[kind] = hits;
    } catch (error) {
      errors[kind] = String(error);
    }
  }
  return { at: new Date().toISOString(), prefix: match, leftovers: found, errors };
};

const receiptPath = (slug) => join(receipts, `${slug}.json`);

const readReceipt = (slug) =>
  existsSync(receiptPath(slug)) ? JSON.parse(readFileSync(receiptPath(slug), 'utf8')) : { slug };

const writeReceipt = (slug, patch) => {
  mkdirSync(receipts, { recursive: true });
  const next = { ...readReceipt(slug), ...patch, slug };
  writeFileSync(receiptPath(slug), `${JSON.stringify(next, null, 2)}\n`);
  return next;
};

export const purgeImages = async (slug) => {
  const images = (await KINDS['registry-image']()).filter((name) => name.startsWith(`${PREFIX}${slug}`));
  const basic = await registryBasic(['pull', 'push']);
  const base = `https://registry.cloudflare.com/v2/${accountId()}`;
  const accept =
    'application/vnd.oci.image.index.v1+json,application/vnd.oci.image.manifest.v1+json,application/vnd.docker.distribution.manifest.v2+json,application/vnd.docker.distribution.manifest.list.v2+json';
  for (const image of images) {
    const listed = await fetch(`${base}/${image}/tags/list`, {
      headers: { authorization: `Basic ${basic}` },
    });
    const tags = listed.ok ? ((await listed.json()).tags ?? []) : [];
    for (const tag of tags) {
      await fetch(`${base}/${image}/manifests/${tag}`, {
        method: 'DELETE',
        headers: { authorization: `Basic ${basic}`, accept },
      });
    }
  }
  if (images.length > 0)
    await fetch('https://registry.cloudflare.com/v2/gc/layers', {
      method: 'PUT',
      headers: { authorization: `Basic ${basic}`, 'content-type': 'application/json' },
    });
  return images;
};

const subdomain = async () => (await api('/workers/subdomain')).body.result?.subdomain ?? '';

const runStep = (slug, step, sub) => {
  const dir = join(root, 'shapes', slug);
  if (!existsSync(join(dir, 'alchemy.run.ts'))) throw new Error(`shapes/${slug}/alchemy.run.ts is missing`);
  const alchemy = join(root, 'shapes', 'node_modules', '.bin', 'alchemy');
  const command = {
    up: [alchemy, ['deploy', '--stage', 'shape', '--yes', '--no-input']],
    smoke: [process.execPath, ['smoke.ts']],
    down: [alchemy, ['destroy', '--stage', 'shape', '--yes', '--no-input']],
  }[step];
  const started = Date.now();
  try {
    const output = execFileSync(command[0], command[1], {
      cwd: dir,
      env: {
        ...process.env,
        CLOUDFLARE_ACCOUNT_ID: accountId(),
        CLOUDFLARE_API_TOKEN: token(),
        SHAPE_SLUG: slug,
        SHAPE_SUBDOMAIN: sub,
      },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
    const tail = output.trim().split('\n').slice(-20);
    return { ok: true, ms: Date.now() - started, tail };
  } catch (error) {
    const text = `${error.stdout ?? ''}\n${error.stderr ?? ''}`.trim().split('\n').slice(-30);
    return { ok: false, ms: Date.now() - started, tail: text };
  }
};

const scrub = (lines) =>
  lines.map((line) =>
    line
      .replaceAll(accountId(), '<account>')
      .replace(/\.[a-z0-9-]+\.workers\.dev/g, '.<subdomain>.workers.dev')
      .replace(/[A-Za-z0-9_-]{40,}/g, '<redacted>'),
  );

const main = async () => {
  if (!process.argv[1]?.endsWith('shape.mjs')) return;
  const [slug, step] = process.argv.slice(2);
  if (!slug || !step) throw new Error('usage: node scripts/shape.mjs <slug|all> up|smoke|down|sweep');
  if (step === 'sweep') {
    const result = await sweep(slug);
    if (slug !== 'all') writeReceipt(slug, { sweep: result });
    console.log(JSON.stringify(result, null, 2));
    process.exit(
      Object.keys(result.leftovers).length === 0 && Object.keys(result.errors).length === 0 ? 0 : 1,
    );
  }
  if (!['up', 'smoke', 'down'].includes(step)) throw new Error(`unknown step ${step}`);
  const ran = runStep(slug, step, await subdomain());
  const purged = step === 'down' && ran.ok ? await purgeImages(slug) : [];
  const result =
    purged.length === 0
      ? ran
      : { ...ran, tail: [...ran.tail, `removed registry images: ${purged.join(', ')}`] };
  const saved = writeReceipt(slug, {
    [step]: { ...result, tail: scrub(result.tail), at: new Date().toISOString() },
  });
  console.log(`${slug} ${step}: ${result.ok ? 'ok' : 'FAILED'} in ${Math.round(result.ms / 1000)}s`);
  for (const line of saved[step].tail) console.log(`  ${line}`);
  process.exit(result.ok ? 0 : 1);
};

await main();
