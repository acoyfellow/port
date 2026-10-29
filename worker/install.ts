import { FLEET_COMPATIBILITY_DATE, fleetWorkerMetadata } from '../shared/fleet-manifest';
import { FLEET_BUNDLE, FLEET_VERSION } from './generated/fleet-bundle';
import { SEED, TASKS } from './generated/swarm-5';

const API = 'https://api.cloudflare.com/client/v4';
export const EVAL_MODELS = [
  { id: '@cf/moonshotai/kimi-k2.7-code', label: 'Kimi K2.7 Code · Workers AI, billed to your account' },
  { id: '@cf/zai-org/glm-5.3', label: 'GLM 5.3 · Workers AI, billed to your account' },
  { id: '@cf/zai-org/glm-5.3-flash', label: 'GLM 5.3 Flash · Workers AI, cheapest' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 · needs unified billing credits on your gateway' },
] as const;

export const DEFAULT_EVAL_MODEL = '@cf/moonshotai/kimi-k2.7-code';

const isEvalModel = (value: string) => EVAL_MODELS.some((model) => model.id === value);
const MAX_TURNS = 40;

export type Resource = {
  readonly kind: 'worker' | 'ai-gateway' | 'workers-dev-subdomain';
  readonly name: string;
  readonly existsAfterInstall?: boolean;
  readonly existsAfterTeardown?: boolean;
};

export type Install = {
  readonly id: string;
  readonly entry: 'fleet';
  readonly createdAt: number;
  readonly accountId: string;
  readonly resources: readonly Resource[];
  readonly url: string | null;
  readonly key: string;
  readonly fleetVersion?: string;
  readonly state: 'installed' | 'removed' | 'failed';
  readonly log: readonly string[];
};

type CloudflareCall = {
  readonly ok: boolean;
  readonly status: number;
  readonly result: unknown;
  readonly message: string;
};

const field = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null && key in value ? Reflect.get(value, key) : undefined;

const call = async (token: string, path: string, init: RequestInit = {}): Promise<CloudflareCall> => {
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${token}`);
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

const must = (step: string, result: CloudflareCall) => {
  if (!result.ok) throw new Error(`${step}: ${result.message}`);
  return result.result;
};

const randomHex = (bytes: number) =>
  [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');

const uploadWorker = async (token: string, accountId: string, name: string, gateway: string, key: string) => {
  const form = new FormData();
  form.set(
    'metadata',
    new Blob([JSON.stringify(fleetWorkerMetadata(gateway, key))], { type: 'application/json' }),
  );
  form.set('fleet.js', new Blob([FLEET_BUNDLE], { type: 'application/javascript+module' }), 'fleet.js');

  return call(token, `/accounts/${accountId}/workers/scripts/${name}`, { method: 'PUT', body: form });
};

const accountSubdomain = async (token: string, accountId: string) => {
  const current = await call(token, `/accounts/${accountId}/workers/subdomain`);
  const existing = field(current.result, 'subdomain');

  return typeof existing === 'string' && existing !== '' ? existing : null;
};

const PROBE_SOURCE = 'export default { fetch() { return new Response("ok"); } };';

const PROBE_DO_SOURCE =
  'import { DurableObject } from "cloudflare:workers"; export class Agent extends DurableObject {} export default { fetch() { return new Response("ok"); } };';

const probeVariants = (
  gateway: string,
): readonly { name: string; metadata: Record<string, unknown>; source: string }[] => {
  const base = {
    main_module: 'w.js',
    compatibility_date: FLEET_COMPATIBILITY_DATE,
    compatibility_flags: ['nodejs_compat'],
  };
  return [
    { name: 'plain', metadata: { ...base, bindings: [] }, source: PROBE_SOURCE },
    { name: 'ai', metadata: { ...base, bindings: [{ type: 'ai', name: 'AI' }] }, source: PROBE_SOURCE },
    {
      name: 'vars',
      metadata: {
        ...base,
        bindings: [
          { type: 'plain_text', name: 'GATEWAY', text: gateway },
          { type: 'secret_text', name: 'FLEET_KEY', text: 'probe' },
        ],
      },
      source: PROBE_SOURCE,
    },
    {
      name: 'loader',
      metadata: { ...base, bindings: [{ type: 'worker_loader', name: 'LOADER' }] },
      source: PROBE_SOURCE,
    },
    {
      name: 'durable-object',
      metadata: {
        ...base,
        bindings: [{ type: 'durable_object_namespace', name: 'AGENT', class_name: 'Agent' }],
        migrations: { new_tag: 'v1', new_sqlite_classes: ['Agent'] },
      },
      source: PROBE_DO_SOURCE,
    },
    {
      name: 'observability',
      metadata: { ...base, bindings: [], observability: { enabled: true } },
      source: PROBE_SOURCE,
    },
    { name: 'full-fleet', metadata: fleetWorkerMetadata(gateway, 'probe'), source: FLEET_BUNDLE },
  ];
};

export const probeUpload = async (token: string, accountId: string) => {
  const results: { variant: string; upload: string; deleted: boolean }[] = [];
  const tag = randomHex(3);
  for (const variant of probeVariants(`port-probe-${tag}`)) {
    const name = `port-probe-${tag}-${variant.name}`;
    const form = new FormData();
    form.set(
      'metadata',
      new Blob(
        [
          JSON.stringify({
            ...variant.metadata,
            main_module: variant.name === 'full-fleet' ? 'fleet.js' : 'w.js',
          }),
        ],
        { type: 'application/json' },
      ),
    );
    const file = variant.name === 'full-fleet' ? 'fleet.js' : 'w.js';
    form.set(file, new Blob([variant.source], { type: 'application/javascript+module' }), file);
    const upload = await call(token, `/accounts/${accountId}/workers/scripts/${name}`, {
      method: 'PUT',
      body: form,
    });
    const removed = upload.ok
      ? (await call(token, `/accounts/${accountId}/workers/scripts/${name}?force=true`, { method: 'DELETE' }))
          .ok
      : true;
    results.push({
      variant: variant.name,
      upload: upload.ok ? 'ok' : `${upload.status} ${upload.message}`,
      deleted: removed,
    });
  }
  return results;
};

export const workerExists = async (token: string, accountId: string, name: string) =>
  (await call(token, `/accounts/${accountId}/workers/scripts/${name}/settings`)).ok;

export const gatewayExists = async (token: string, accountId: string, name: string) =>
  (await call(token, `/accounts/${accountId}/ai-gateway/gateways/${name}`)).ok;

export const resourceExists = (token: string, accountId: string, resource: Resource) =>
  resource.kind === 'worker'
    ? workerExists(token, accountId, resource.name)
    : resource.kind === 'ai-gateway'
      ? gatewayExists(token, accountId, resource.name)
      : Promise.resolve(false);

export const installFleet = async (token: string, accountId: string): Promise<Install> => {
  const id = randomHex(4);
  const name = `port-fleet-${id}`;
  const gateway = `port-fleet-${id}`;
  const key = randomHex(24);
  const created: Resource[] = [];
  const log: string[] = [];
  const base = {
    id,
    entry: 'fleet' as const,
    createdAt: Date.now(),
    accountId,
    key,
    fleetVersion: FLEET_VERSION,
  };

  try {
    must(
      'create AI Gateway',
      await call(token, `/accounts/${accountId}/ai-gateway/gateways`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: gateway,
          collect_logs: true,
          cache_ttl: 0,
          cache_invalidate_on_update: false,
          rate_limiting_interval: 0,
          rate_limiting_limit: 0,
          rate_limiting_technique: 'fixed',
        }),
      }),
    );
    created.push({ kind: 'ai-gateway', name: gateway });
    log.push(`created AI Gateway ${gateway}`);

    must('upload Worker', await uploadWorker(token, accountId, name, gateway, key));
    created.push({ kind: 'worker', name });
    log.push(`uploaded Worker ${name}`);

    must(
      'turn on workers.dev',
      await call(token, `/accounts/${accountId}/workers/scripts/${name}/subdomain`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: true, previews_enabled: false }),
      }),
    );
    const subdomain = await accountSubdomain(token, accountId);
    const url = subdomain === null ? null : `https://${name}.${subdomain}.workers.dev`;
    log.push(url === null ? 'no workers.dev subdomain on this account' : `reachable at ${url}`);

    const checked = await Promise.all(
      created.map(async (resource) => ({
        ...resource,
        existsAfterInstall: await resourceExists(token, accountId, resource),
      })),
    );

    return { ...base, resources: checked, url, state: 'installed', log };
  } catch (error) {
    log.push(error instanceof Error ? error.message : String(error));
    for (const probe of await probeUpload(token, accountId))
      log.push(
        `probe ${probe.variant}: ${probe.upload}${probe.deleted ? '' : ' (probe Worker left behind)'}`,
      );
    return { ...base, resources: created, url: null, state: 'failed', log };
  }
};

export const teardown = async (token: string, install: Install): Promise<Install> => {
  const log = [...install.log];

  for (const resource of [...install.resources].reverse()) {
    const path =
      resource.kind === 'worker'
        ? `/accounts/${install.accountId}/workers/scripts/${resource.name}?force=true`
        : `/accounts/${install.accountId}/ai-gateway/gateways/${resource.name}`;
    const result = await call(token, path, { method: 'DELETE' });
    log.push(
      `${result.ok ? 'deleted' : `delete failed (${result.message})`} ${resource.kind} ${resource.name}`,
    );
  }

  const checked = await Promise.all(
    install.resources.map(async (resource) => ({
      ...resource,
      existsAfterTeardown: await resourceExists(token, install.accountId, resource),
    })),
  );

  return {
    ...install,
    resources: checked,
    state: checked.every((r) => r.existsAfterTeardown === false) ? 'removed' : 'failed',
    log,
  };
};

export type EvalTask = {
  readonly task: string;
  readonly agent: string;
  readonly model: string;
};

export const isCurrentFleet = (install: Install) => install.fleetVersion === FLEET_VERSION;

export const startEval = async (install: Install, requested: string): Promise<EvalTask[]> => {
  if (install.url === null) throw new Error('The fleet has no URL.');
  if (!isCurrentFleet(install))
    throw new Error(
      'This install runs an older fleet. Tear it down and install again to get the current one.',
    );
  const model = isEvalModel(requested) ? requested : DEFAULT_EVAL_MODEL;
  const runId = randomHex(3);

  return Promise.all(
    TASKS.map(async (task) => {
      const agent = `${task.task}-${runId}`;
      const response = await fetch(`${install.url}/run?agent=${agent}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${install.key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          task: task.task,
          prompt: task.prompt,
          files: SEED,
          hidden: task.hidden,
          model,
          maxTurns: MAX_TURNS,
        }),
      });
      if (!response.ok) throw new Error(`start ${task.task}: ${response.status} ${await response.text()}`);
      return { task: task.task, agent, model };
    }),
  );
};

export const evalStatus = async (install: Install, tasks: readonly EvalTask[]) =>
  Promise.all(
    tasks.map(async (task) => {
      if (install.url === null) return { task: task.task, state: 'unreachable' };
      const response = await fetch(`${install.url}/status?agent=${task.agent}`, {
        headers: { authorization: `Bearer ${install.key}` },
      });
      const body: unknown = await response.json().catch(() => null);
      return typeof body === 'object' && body !== null
        ? body
        : { task: task.task, state: `HTTP ${response.status}` };
    }),
  );
