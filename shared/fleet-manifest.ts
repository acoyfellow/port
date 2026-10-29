export const FLEET_COMPATIBILITY_DATE = '2026-10-01';

export type FleetBinding =
  | { readonly type: 'durable_object_namespace'; readonly name: string; readonly class_name: string }
  | { readonly type: 'worker_loader'; readonly name: string }
  | { readonly type: 'ai'; readonly name: string }
  | { readonly type: 'plain_text'; readonly name: string; readonly text: string }
  | { readonly type: 'secret_text'; readonly name: string; readonly text: string };

export const fleetBindings = (gateway: string, key: string): readonly FleetBinding[] => [
  { type: 'durable_object_namespace', name: 'AGENT', class_name: 'Agent' },
  { type: 'worker_loader', name: 'LOADER' },
  { type: 'ai', name: 'AI' },
  { type: 'plain_text', name: 'GATEWAY', text: gateway },
  { type: 'secret_text', name: 'FLEET_KEY', text: key },
];

export const fleetWorkerMetadata = (gateway: string, key: string) => ({
  main_module: 'fleet.js',
  compatibility_date: FLEET_COMPATIBILITY_DATE,
  compatibility_flags: ['nodejs_compat'],
  bindings: fleetBindings(gateway, key),
  migrations: { new_tag: 'v1', new_sqlite_classes: ['Agent'] },
  observability: { enabled: true },
});

export type CreatedResource = 'ai-gateway' | 'worker';

export const FLEET_CREATES: readonly CreatedResource[] = ['ai-gateway', 'worker'];
