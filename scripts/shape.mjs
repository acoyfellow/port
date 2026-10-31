import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const receipts = join(root, 'proof', 'shapes');
const PREFIX = 'port-shape-';

const PROFILE = process.env.SHAPE_PROFILE ?? 'customer0';
const profileFile = join(homedir(), '.alchemy', 'profiles', PROFILE, 'cloudflare.json');

const profileValues = () => {
  if (!existsSync(profileFile))
    throw new Error(`No alchemy profile ${PROFILE}. Run: npx alchemy profile edit --profile ${PROFILE}`);
  return JSON.parse(readFileSync(profileFile, 'utf8')).values ?? {};
};

const refreshProfile = () =>
  execFileSync(
    join(root, 'shapes', 'node_modules', '.bin', 'alchemy'),
    ['profile', 'refresh', '--profile', PROFILE, '--no-input'],
    {
      cwd: root,
      stdio: 'ignore',
    },
  );

export const accountId = () => {
  const value = profileValues().accountId;
  if (typeof value !== 'string' || value === '') throw new Error(`alchemy profile ${PROFILE} has no account`);
  return value;
};

const token = () => {
  const fromEnv = process.env.CLOUDFLARE_API_TOKEN;
  if (fromEnv) return fromEnv;
  if (typeof profileValues().expires !== 'number' || profileValues().expires < Date.now() + 120_000)
    refreshProfile();
  const access = profileValues().access;
  if (typeof access !== 'string' || access === '')
    throw new Error(`alchemy profile ${PROFILE} has no access token`);
  return access;
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

const listed = async (path, pick, key = 'name') => {
  const { status, body } = await api(path);
  if (status < 200 || status > 299 || body.success === false)
    throw new Error(`${path}: HTTP ${status} ${JSON.stringify(body.errors ?? []).slice(0, 160)}`);
  const result = pick(body.result);
  if (!Array.isArray(result)) throw new Error(`${path}: no list in the response`);
  return result.map((item) => item[key] ?? item.id ?? item.title).filter(Boolean);
};
const asIs = (result) => result;

export const registryBasic = async (permissions) => {
  const minted = await api('/containers/registries/registry.cloudflare.com/credentials', {
    method: 'POST',
    body: JSON.stringify({ expiration_minutes: 5, permissions }),
  });
  const password = minted.body.result?.password;
  if (typeof password !== 'string') throw new Error(`registry credentials: HTTP ${minted.status}`);
  return Buffer.from(`v1:${password}`).toString('base64');
};

const KINDS = {
  worker: async () => listed('/workers/scripts', asIs, 'id'),
  'do-namespace': async () => listed('/workers/durable_objects/namespaces?per_page=1000', asIs),
  kv: async () => listed('/storage/kv/namespaces?per_page=100', asIs, 'title'),
  d1: async () => listed('/d1/database?per_page=100', asIs),
  r2: async () => listed('/r2/buckets', (result) => result?.buckets),
  queue: async () => listed('/queues', asIs, 'queue_name'),
  'ai-gateway': async () => listed('/ai-gateway/gateways?per_page=100', asIs, 'id'),
  container: async () => listed('/containers/applications', asIs),
  workflow: async () => listed('/workflows?per_page=100', asIs),
  'custom-domain': async () => listed('/workers/domains', asIs, 'hostname'),
  'registry-image': async () => {
    const basic = await registryBasic(['pull']);
    const repositories = new Set();
    let next = 'https://registry.cloudflare.com/v2/_catalog?tags=true&n=1000';
    for (let page = 0; page < 50 && next !== null; page++) {
      const response = await fetch(next, { headers: { authorization: `Basic ${basic}` } });
      if (!response.ok) throw new Error(`registry catalog: HTTP ${response.status}`);
      const catalog = await response.json();
      for (const [repository, tags] of Object.entries(catalog.repositories ?? {}))
        if (tags.some((tag) => !tag.startsWith('sha256:'))) repositories.add(repository);
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
      const head = await fetch(`${base}/${image}/manifests/${tag}`, {
        method: 'HEAD',
        headers: { authorization: `Basic ${basic}`, accept },
      });
      const digest = head.headers.get('docker-content-digest') ?? tag;
      await fetch(`${base}/${image}/manifests/${digest}`, {
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

const shapeKey = (slug) => {
  const file = join(root, '.tmp', `shape-key-${slug}`);
  if (!existsSync(file)) {
    mkdirSync(join(root, '.tmp'), { recursive: true });
    writeFileSync(file, randomBytes(24).toString('hex'), { mode: 0o600 });
  }
  return readFileSync(file, 'utf8').trim();
};

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
        SHAPE_KEY: shapeKey(slug),
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
