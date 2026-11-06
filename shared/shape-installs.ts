export type InstanceType = 'lite' | 'basic' | 'standard-1';

export type ShapeBinding =
  | { readonly kind: 'durable-object'; readonly binding: string; readonly className: string }
  | {
      readonly kind: 'container';
      readonly binding: string;
      readonly className: string;
      readonly image: string;
      readonly instanceType: InstanceType;
    }
  | { readonly kind: 'worker-loader'; readonly binding: string }
  | { readonly kind: 'ai'; readonly binding: string }
  | { readonly kind: 'artifacts'; readonly binding: string }
  | { readonly kind: 'secret'; readonly binding: string }
  | { readonly kind: 'd1'; readonly binding: string; readonly seed: string }
  | { readonly kind: 'vectorize'; readonly binding: string; readonly dimensions: number }
  | { readonly kind: 'workflow'; readonly binding: string; readonly className: string }
  | {
      readonly kind: 'service';
      readonly binding: string;
      readonly part: string;
      readonly entrypoint: string;
    };

export type ShapePart = {
  readonly part: string;
  readonly bindings: readonly ShapeBinding[];
  readonly repos?: readonly string[];
  readonly tailOfMain?: boolean;
};

export type ShapeInstall = {
  readonly slug: string;
  readonly bindings: readonly ShapeBinding[];
  readonly gatewayBinding: string;
  readonly parts?: readonly ShapePart[];
};

const DO = (binding: string, className: string): ShapeBinding => ({
  kind: 'durable-object',
  binding,
  className,
});
const BOX = (binding: string, className: string, image: string): ShapeBinding => ({
  kind: 'container',
  binding,
  className,
  image,
  instanceType: 'basic',
});
const LOADER: ShapeBinding = { kind: 'worker-loader', binding: 'LOADER' };
const AI: ShapeBinding = { kind: 'ai', binding: 'AI' };

const shape = (slug: string, bindings: readonly ShapeBinding[]): ShapeInstall => ({
  slug,
  bindings: [...bindings, AI],
  gatewayBinding: 'GATEWAY',
});

export const PI_BOX_IMAGE = 'pi-box';
export const SHARED_BOX_IMAGE = 'pi-shared-box';

export const SHAPE_INSTALLS: readonly ShapeInstall[] = [
  shape('isolate-agents', [DO('AGENT', 'Agent'), LOADER]),
  shape('durable-session', [DO('SESSION', 'Session')]),
  shape('agent-room', [DO('ROOM', 'Room'), DO('AGENT', 'RoomAgent')]),
  shape('self-editing-app', [DO('BODY', 'Body'), LOADER]),
  shape('self-observe', [DO('AGENT', 'Observer'), LOADER]),
  shape('chat-with-sandbox', [BOX('CHAT', 'Chat', PI_BOX_IMAGE)]),
  shape('container-per-thread', [BOX('THREAD', 'Thread', PI_BOX_IMAGE)]),
  shape('snapshot-rollback', [BOX('THREAD', 'Thread', PI_BOX_IMAGE)]),
  shape('sealed-box', [BOX('BOX', 'Box', PI_BOX_IMAGE)]),
  shape('person-with-computer', [DO('DIRECTORY', 'Directory'), BOX('PERSON', 'Person', PI_BOX_IMAGE)]),
  shape('shared-container', [DO('SEAT', 'Seat'), BOX('BOX', 'Box', SHARED_BOX_IMAGE)]),
  {
    ...shape('git-gatekeeper', [
      BOX('SESSION', 'Session', PI_BOX_IMAGE),
      { kind: 'service', binding: 'GATE', part: 'gate', entrypoint: 'Gatekeeper' },
    ]),
    parts: [{ part: 'gate', bindings: [{ kind: 'artifacts', binding: 'REPOS' }], repos: ['demo'] }],
  },
  {
    ...shape('gadget-workspace', [
      DO('WORKSPACE', 'Workspace'),
      LOADER,
      { kind: 'service', binding: 'OUTBOX', part: 'gate', entrypoint: 'Outbox' },
      { kind: 'service', binding: 'REVIEW', part: 'gate', entrypoint: 'Review' },
    ]),
    parts: [
      { part: 'gate', bindings: [DO('LEDGER', 'Ledger'), { kind: 'secret', binding: 'DELIVERY_KEY' }] },
    ],
  },
  {
    ...shape('egress-filter', [
      DO('WORKSPACE', 'Workspace'),
      DO('CANARY', 'Canary'),
      LOADER,
      { kind: 'service', binding: 'EGRESS', part: 'filter', entrypoint: 'Egress' },
      { kind: 'service', binding: 'AUDIT', part: 'filter', entrypoint: 'Audit' },
    ]),
    parts: [{ part: 'filter', bindings: [DO('LOG', 'Log')] }],
  },
  shape('scheduled-agent', [DO('AGENT', 'Agent'), DO('CLOCK', 'Clock')]),
  {
    ...shape('flight-recorder', [
      DO('SESSION', 'Session'),
      { kind: 'service', binding: 'READER', part: 'recorder', entrypoint: 'Reader' },
    ]),
    parts: [{ part: 'recorder', bindings: [DO('TAPE', 'Tape')], tailOfMain: true }],
  },
  {
    ...shape('safe-sql', [
      DO('ANALYST', 'Analyst'),
      { kind: 'service', binding: 'SQL', part: 'query', entrypoint: 'ReadOnly' },
    ]),
    parts: [{ part: 'query', bindings: [{ kind: 'd1', binding: 'DB', seed: 'safe-sql' }] }],
  },
  shape('workflow-plan', [
    DO('PLANNER', 'Planner'),
    { kind: 'workflow', binding: 'PLAN', className: 'PlanWorkflow' },
  ]),
  shape('vector-memory', [
    DO('SESSION', 'Session'),
    { kind: 'vectorize', binding: 'MEMORY', dimensions: 768 },
  ]),
];

export const shapeInstallOf = (slug: string) => SHAPE_INSTALLS.find((each) => each.slug === slug);

export const usesContainers = (install: ShapeInstall) =>
  install.bindings.some((binding) => binding.kind === 'container');

export const SHAPE_COMPATIBILITY_DATE = '2026-09-30';

export type MetadataBinding =
  | { readonly type: 'durable_object_namespace'; readonly name: string; readonly class_name: string }
  | { readonly type: 'worker_loader'; readonly name: string }
  | { readonly type: 'ai'; readonly name: string }
  | { readonly type: 'plain_text'; readonly name: string; readonly text: string }
  | { readonly type: 'secret_text'; readonly name: string; readonly text: string }
  | { readonly type: 'artifacts'; readonly name: string; readonly namespace: string }
  | { readonly type: 'd1'; readonly name: string; readonly id: string }
  | { readonly type: 'vectorize'; readonly name: string; readonly index_name: string }
  | {
      readonly type: 'workflow';
      readonly name: string;
      readonly workflow_name: string;
      readonly class_name: string;
    }
  | {
      readonly type: 'service';
      readonly name: string;
      readonly service: string;
      readonly entrypoint: string;
    };

export type PartNames = {
  readonly self: string;
  readonly partName: (part: string) => string;
  readonly secret: string;
  readonly databaseId?: string;
};

const metadataBinding = (binding: ShapeBinding, names: PartNames): MetadataBinding => {
  if (binding.kind === 'durable-object' || binding.kind === 'container')
    return { type: 'durable_object_namespace', name: binding.binding, class_name: binding.className };
  if (binding.kind === 'worker-loader') return { type: 'worker_loader', name: binding.binding };
  if (binding.kind === 'secret') return { type: 'secret_text', name: binding.binding, text: names.secret };
  if (binding.kind === 'd1') return { type: 'd1', name: binding.binding, id: names.databaseId ?? '' };
  if (binding.kind === 'vectorize')
    return { type: 'vectorize', name: binding.binding, index_name: names.self };
  if (binding.kind === 'workflow')
    return {
      type: 'workflow',
      name: binding.binding,
      workflow_name: names.self,
      class_name: binding.className,
    };
  if (binding.kind === 'artifacts')
    return { type: 'artifacts', name: binding.binding, namespace: names.self };
  if (binding.kind === 'service')
    return {
      type: 'service',
      name: binding.binding,
      service: names.partName(binding.part),
      entrypoint: binding.entrypoint,
    };
  return { type: 'ai', name: binding.binding };
};

const partClasses = (part: ShapePart) =>
  part.bindings.flatMap((binding) => (binding.kind === 'durable-object' ? [binding.className] : []));

export const partMetadata = (part: ShapePart, names: PartNames) => ({
  main_module: 'index.js',
  compatibility_date: SHAPE_COMPATIBILITY_DATE,
  compatibility_flags: ['nodejs_compat'],
  bindings: part.bindings.map((binding) => metadataBinding(binding, names)),
  observability: { enabled: true },
  ...(partClasses(part).length === 0
    ? {}
    : { migrations: { new_tag: 'v1', new_sqlite_classes: partClasses(part) } }),
});

export const durableClasses = (install: ShapeInstall) =>
  install.bindings.flatMap((binding) =>
    binding.kind === 'durable-object' || binding.kind === 'container' ? [binding.className] : [],
  );

export const containerBindings = (install: ShapeInstall) =>
  install.bindings.flatMap((binding) => (binding.kind === 'container' ? [binding] : []));

const NO_PARTS: PartNames = { self: '', partName: (part) => part, secret: '' };

export const shapeWorkerMetadata = (
  install: ShapeInstall,
  gateway: string,
  key: string,
  names: PartNames = NO_PARTS,
) => ({
  main_module: 'index.js',
  compatibility_date: SHAPE_COMPATIBILITY_DATE,
  compatibility_flags: ['nodejs_compat'],
  bindings: [
    ...install.bindings.map((binding) => metadataBinding(binding, names)),
    { type: 'plain_text', name: install.gatewayBinding, text: gateway },
    { type: 'secret_text', name: 'PORT_KEY', text: key },
  ] satisfies readonly MetadataBinding[],
  containers: containerBindings(install).map((binding) => ({ class_name: binding.className })),
  tail_consumers: (install.parts ?? [])
    .filter((part) => part.tailOfMain === true)
    .map((part) => ({ service: names.partName(part.part) })),
  migrations: { new_tag: 'v1', new_sqlite_classes: durableClasses(install) },
  observability: { enabled: true },
});

export const containerApplicationBody = (
  name: string,
  image: string,
  instanceType: InstanceType,
  namespaceId: string,
) => ({
  name,
  max_instances: 2,
  instances: 0,
  scheduling_policy: 'default',
  constraints: {},
  configuration: { image, instance_type: instanceType },
  durable_objects: { namespace_id: namespaceId },
});
