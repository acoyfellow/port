import {
  containerApplicationBody,
  containerBindings,
  type PartNames,
  partMetadata,
  type ShapeInstall,
  shapeWorkerMetadata,
} from '../shared/shape-installs';
import { SHAPE_VERSIONS } from './generated/shape-bundles';
import { copyImage, deleteImage, type RegistryAuth } from './registry';

const API = 'https://api.cloudflare.com/client/v4';

export type ShapeResource = {
  readonly kind: 'worker' | 'ai-gateway' | 'container' | 'registry-image' | 'artifacts-namespace';
  readonly name: string;
  readonly id?: string;
  readonly existsAfterInstall?: boolean;
  readonly existsAfterTeardown?: boolean;
};

export type ShapeInstallRecord = {
  readonly id: string;
  readonly slug: string;
  readonly version: string;
  readonly createdAt: number;
  readonly accountId: string;
  readonly resources: readonly ShapeResource[];
  readonly url: string | null;
  readonly key: string;
  readonly state: 'installed' | 'removed' | 'failed';
  readonly log: readonly string[];
};

type Call = {
  readonly ok: boolean;
  readonly status: number;
  readonly result: unknown;
  readonly message: string;
};

const field = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null && key in value ? Reflect.get(value, key) : undefined;

export const cloudflare = async (token: string, path: string, init: RequestInit = {}): Promise<Call> => {
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${token}`);
  if (typeof init.body === 'string') headers.set('content-type', 'application/json');
  const response = await fetch(`${API}${path}`, { ...init, headers });
  const parsed: unknown = await response.json().catch(() => null);
  const errors = field(parsed, 'errors');
  const first = Array.isArray(errors) ? field(errors[0], 'message') : undefined;
  return {
    ok: response.ok && field(parsed, 'success') !== false,
    status: response.status,
    result: field(parsed, 'result'),
    message: typeof first === 'string' ? first : `HTTP ${response.status}`,
  };
};

const must = (step: string, result: Call) => {
  if (!result.ok) throw new Error(`${step}: ${result.message}`);
  return result.result;
};

const randomHex = (bytes: number) =>
  [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');

export type ShapeSource = {
  readonly bundle: (slug: string) => Promise<string>;
  readonly sourceRegistry: RegistryAuth;
  readonly sourceAccount: string;
  readonly imageTag: string;
};

const registryAuth = async (token: string, accountId: string): Promise<RegistryAuth> => {
  const minted = must(
    'registry credentials',
    await cloudflare(
      token,
      `/accounts/${accountId}/containers/registries/registry.cloudflare.com/credentials`,
      {
        method: 'POST',
        body: JSON.stringify({ expiration_minutes: 60, permissions: ['pull', 'push'] }),
      },
    ),
  );
  const password = field(minted, 'password');
  if (typeof password !== 'string') throw new Error('registry credentials: no password');
  return { basic: btoa(`v1:${password}`) };
};

const uploadScript = async (
  token: string,
  accountId: string,
  name: string,
  metadata: unknown,
  code: string,
) => {
  const form = new FormData();
  form.set('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.set('index.js', new Blob([code], { type: 'application/javascript+module' }), 'index.js');
  return cloudflare(token, `/accounts/${accountId}/workers/scripts/${name}`, { method: 'PUT', body: form });
};

const namespaceIdOf = async (token: string, accountId: string, script: string, className: string) => {
  const listed = must(
    'list Durable Object namespaces',
    await cloudflare(token, `/accounts/${accountId}/workers/durable_objects/namespaces?per_page=1000`),
  );
  const found = Array.isArray(listed)
    ? listed.find((each) => field(each, 'script') === script && field(each, 'class') === className)
    : undefined;
  const id = field(found, 'id');
  if (typeof id !== 'string') throw new Error(`no Durable Object namespace for ${className}`);
  return id;
};

const subdomainOf = async (token: string, accountId: string) => {
  const result = await cloudflare(token, `/accounts/${accountId}/workers/subdomain`);
  const value = field(result.result, 'subdomain');
  return typeof value === 'string' && value !== '' ? value : null;
};

export const installShape = async (
  token: string,
  accountId: string,
  install: ShapeInstall,
  source: ShapeSource,
): Promise<ShapeInstallRecord> => {
  const id = randomHex(4);
  const name = `port-${install.slug}-${id}`;
  const key = randomHex(24);
  const created: ShapeResource[] = [];
  const log: string[] = [];
  const base = {
    id,
    slug: install.slug,
    version: SHAPE_VERSIONS[install.slug] ?? 'unknown',
    createdAt: Date.now(),
    accountId,
    key,
  };
  try {
    must(
      'create AI Gateway',
      await cloudflare(token, `/accounts/${accountId}/ai-gateway/gateways`, {
        method: 'POST',
        body: JSON.stringify({
          id: name,
          collect_logs: true,
          cache_ttl: 0,
          cache_invalidate_on_update: false,
          rate_limiting_interval: 0,
          rate_limiting_limit: 0,
          rate_limiting_technique: 'fixed',
        }),
      }),
    );
    created.push({ kind: 'ai-gateway', name });
    log.push(`created AI Gateway ${name}`);

    const boxes = containerBindings(install);

    const images = new Map<string, string>();
    if (boxes.length > 0) {
      const target = await registryAuth(token, accountId);
      for (const image of new Set(boxes.map((box) => box.image))) {
        const repository = `${accountId}/${name}-${image}`;
        const copied = await copyImage(
          {
            auth: source.sourceRegistry,
            repository: `${source.sourceAccount}/${image}`,
            tag: source.imageTag,
          },
          { auth: target, repository, tag: 'v1' },
        );
        created.push({ kind: 'registry-image', name: repository });
        images.set(image, `registry.cloudflare.com/${repository}@${copied.digest}`);
        log.push(`copied image ${image} into your registry (${(copied.bytes / 1e6).toFixed(0)} MB)`);
      }
    }

    const names: PartNames = { self: name, partName: (part) => `${name}-${part}`, secret: randomHex(24) };
    for (const part of install.parts ?? []) {
      if (part.bindings.some((binding) => binding.kind === 'artifacts')) {
        for (const repo of part.repos ?? [])
          must(
            `create repo ${repo}`,
            await cloudflare(token, `/accounts/${accountId}/artifacts/namespaces/${name}/repos`, {
              method: 'POST',
              body: JSON.stringify({ name: repo, default_branch: 'main' }),
            }),
          );
        created.push({ kind: 'artifacts-namespace', name });
        log.push(`created Artifacts namespace ${name} with repos ${(part.repos ?? []).join(', ')}`);
      }
      must(
        `upload Worker ${part.part}`,
        await uploadScript(
          token,
          accountId,
          names.partName(part.part),
          partMetadata(part, names),
          await source.bundle(`${install.slug}--${part.part}`),
        ),
      );
      created.push({ kind: 'worker', name: names.partName(part.part) });
      log.push(`uploaded Worker ${names.partName(part.part)}`);
    }

    must(
      'upload Worker',
      await uploadScript(
        token,
        accountId,
        name,
        shapeWorkerMetadata(install, name, key, names),
        await source.bundle(install.slug),
      ),
    );
    created.push({ kind: 'worker', name });
    log.push(`uploaded Worker ${name}`);

    for (const box of boxes) {
      const namespace = await namespaceIdOf(token, accountId, name, box.className);
      const application = must(
        `create container ${box.className}`,
        await cloudflare(token, `/accounts/${accountId}/containers/applications`, {
          method: 'POST',
          body: JSON.stringify(
            containerApplicationBody(
              `${name}-${box.className.toLowerCase()}`,
              images.get(box.image) ?? '',
              box.instanceType,
              namespace,
            ),
          ),
        }),
      );
      const appId = field(application, 'id');
      created.push({
        kind: 'container',
        name: `${name}-${box.className.toLowerCase()}`,
        ...(typeof appId === 'string' ? { id: appId } : {}),
      });
      log.push(`created container ${box.className}`);
    }

    must(
      'turn on workers.dev',
      await cloudflare(token, `/accounts/${accountId}/workers/scripts/${name}/subdomain`, {
        method: 'POST',
        body: JSON.stringify({ enabled: true, previews_enabled: false }),
      }),
    );
    const subdomain = await subdomainOf(token, accountId);
    const url = subdomain === null ? null : `https://${name}.${subdomain}.workers.dev`;
    log.push(url === null ? 'no workers.dev subdomain on this account' : `reachable at ${url}`);

    const checked = await Promise.all(
      created.map(async (resource) => ({
        ...resource,
        existsAfterInstall: await shapeResourceExists(token, accountId, resource),
      })),
    );
    return { ...base, resources: checked, url, state: 'installed', log };
  } catch (error) {
    log.push(error instanceof Error ? error.message : String(error));
    return { ...base, resources: created, url: null, state: 'failed', log };
  }
};

export const shapeResourceExists = async (token: string, accountId: string, resource: ShapeResource) => {
  if (resource.kind === 'worker')
    return (await cloudflare(token, `/accounts/${accountId}/workers/scripts/${resource.name}/settings`)).ok;
  if (resource.kind === 'ai-gateway')
    return (await cloudflare(token, `/accounts/${accountId}/ai-gateway/gateways/${resource.name}`)).ok;
  if (resource.kind === 'container') {
    const listed = await cloudflare(token, `/accounts/${accountId}/containers/applications`);
    return Array.isArray(listed.result) && listed.result.some((app) => field(app, 'name') === resource.name);
  }
  if (resource.kind === 'artifacts-namespace')
    return (await cloudflare(token, `/accounts/${accountId}/artifacts/namespaces/${resource.name}`)).ok;
  const auth = await registryAuth(token, accountId);
  const tags = await fetch(`https://registry.cloudflare.com/v2/${resource.name}/tags/list`, {
    headers: { authorization: `Basic ${auth.basic}` },
  });
  if (!tags.ok) return false;
  const body: unknown = await tags.json();
  const listedTags = field(body, 'tags');
  return (
    Array.isArray(listedTags) &&
    listedTags.some((tag) => typeof tag === 'string' && !tag.startsWith('sha256:'))
  );
};

const removeResource = async (token: string, accountId: string, resource: ShapeResource) => {
  if (resource.kind === 'worker')
    return cloudflare(token, `/accounts/${accountId}/workers/scripts/${resource.name}?force=true`, {
      method: 'DELETE',
    });
  if (resource.kind === 'ai-gateway')
    return cloudflare(token, `/accounts/${accountId}/ai-gateway/gateways/${resource.name}`, {
      method: 'DELETE',
    });
  if (resource.kind === 'container') {
    const listed = await cloudflare(token, `/accounts/${accountId}/containers/applications`);
    const app = Array.isArray(listed.result)
      ? listed.result.find((each) => field(each, 'name') === resource.name)
      : undefined;
    const appId = field(app, 'id') ?? resource.id;
    return typeof appId === 'string'
      ? cloudflare(token, `/accounts/${accountId}/containers/applications/${appId}`, { method: 'DELETE' })
      : { ok: true, status: 404, result: null, message: 'already gone' };
  }
  if (resource.kind === 'artifacts-namespace') {
    const path = `/accounts/${accountId}/artifacts/namespaces/${resource.name}`;
    const repos = await cloudflare(token, `${path}/repos`);
    for (const repo of Array.isArray(repos.result) ? repos.result : []) {
      const repoName = field(repo, 'name');
      if (typeof repoName === 'string')
        await cloudflare(token, `${path}/repos/${repoName}`, { method: 'DELETE' });
    }
    const removed = await fetch(`${API}${path}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    });
    return {
      ok: removed.ok || removed.status === 404,
      status: removed.status,
      result: null,
      message: `HTTP ${removed.status}`,
    };
  }
  await deleteImage(await registryAuth(token, accountId), resource.name);
  return { ok: true, status: 200, result: null, message: 'deleted' };
};

export const teardownShape = async (
  token: string,
  record: ShapeInstallRecord,
): Promise<ShapeInstallRecord> => {
  const log = [...record.log];
  const order: ShapeResource['kind'][] = [
    'container',
    'worker',
    'artifacts-namespace',
    'registry-image',
    'ai-gateway',
  ];
  const sorted = [...record.resources].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  for (const resource of sorted) {
    const result = await removeResource(token, record.accountId, resource).catch((error: unknown) => ({
      ok: false,
      status: 0,
      result: null,
      message: String(error),
    }));
    log.push(
      `${result.ok ? 'deleted' : `delete failed (${result.message})`} ${resource.kind} ${resource.name}`,
    );
  }
  const checked = await Promise.all(
    record.resources.map(async (resource) => ({
      ...resource,
      existsAfterTeardown: await shapeResourceExists(token, record.accountId, resource),
    })),
  );
  return {
    ...record,
    resources: checked,
    state: checked.every((resource) => resource.existsAfterTeardown === false) ? 'removed' : 'failed',
    log,
  };
};
