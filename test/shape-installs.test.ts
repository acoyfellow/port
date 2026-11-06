import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  containerApplicationBody,
  durableClasses,
  partMetadata,
  SHAPE_INSTALLS,
  shapeInstallOf,
  shapeWorkerMetadata,
} from '../shared/shape-installs';

const shapesDir = join(import.meta.dirname, '..', 'shapes');
const deployable = readdirSync(shapesDir).filter((slug) => {
  try {
    readFileSync(join(shapesDir, slug, 'alchemy.run.ts'));
    return true;
  } catch {
    return false;
  }
});

const declared = (slug: string) => {
  const source = readFileSync(join(shapesDir, slug, 'alchemy.run.ts'), 'utf8').replace(
    /container<[A-Za-z]+>\(SLUG, /g,
    `container('${slug}', `,
  );
  const bindings = [
    ...source.matchAll(
      /([A-Z_]+): (durableObject|container|workerLoader|workersAi)<?[A-Za-z]*>?\(([^)]*)\)/g,
    ),
    ...source.matchAll(/([A-Z_]+): Cloudflare\.(WorkerEntrypoint)\(([^)]*)\)/g),
    ...source.matchAll(/([A-Z_]+): Cloudflare\.(Workflow)\(('[A-Za-z]+')/g),
    ...[...source.matchAll(/([A-Z_]+): memory,?$/gm)].map((match) => [match[0], match[1], 'vectorize', '']),
  ];
  return bindings.map(([, binding, kind, args]) => ({
    binding,
    kind,
    className:
      kind === 'container' || kind === 'WorkerEntrypoint'
        ? /'([A-Za-z]+)'(?:,|\s*$)/.exec(args.split(',')[1] ?? '')?.[1]
        : /'([A-Za-z]+)'/.exec(args)?.[1],
  }));
};

describe('shape install recipes', () => {
  it('cover every shape that has a deploy script', () => {
    expect(SHAPE_INSTALLS.map((each) => each.slug).sort()).toEqual([...deployable].sort());
  });

  for (const slug of deployable)
    it(`${slug} creates the same bindings as its alchemy.run.ts`, () => {
      const install = shapeInstallOf(slug);
      expect(install).toBeDefined();
      const everyBinding = [
        ...(install?.bindings ?? []),
        ...(install?.parts ?? []).flatMap((part) =>
          part.bindings.filter((binding) => binding.kind === 'durable-object'),
        ),
      ];
      const ours = everyBinding.map((binding) => ({
        binding: binding.binding,
        kind: {
          'durable-object': 'durableObject',
          container: 'container',
          'worker-loader': 'workerLoader',
          ai: 'workersAi',
          service: 'WorkerEntrypoint',
          artifacts: 'artifacts',
          workflow: 'Workflow',
          vectorize: 'vectorize',
        }[binding.kind],
        className:
          binding.kind === 'durable-object' || binding.kind === 'container' || binding.kind === 'workflow'
            ? binding.className
            : binding.kind === 'vectorize'
              ? undefined
              : binding.kind === 'service'
                ? binding.entrypoint
                : binding.binding,
      }));
      expect(ours.sort((a, b) => a.binding.localeCompare(b.binding))).toEqual(
        declared(slug).sort((a, b) => a.binding.localeCompare(b.binding)),
      );
    });

  it('builds Worker metadata with a key, a gateway and one migration for every Durable Object class', () => {
    const install = shapeInstallOf('person-with-computer');
    if (install === undefined) throw new Error('missing');
    const metadata = shapeWorkerMetadata(install, 'gw', 'k');
    expect(metadata.migrations.new_sqlite_classes).toEqual(['Directory', 'Person']);
    expect(metadata.containers).toEqual([{ class_name: 'Person' }]);
    expect(metadata.bindings).toContainEqual({ type: 'secret_text', name: 'PORT_KEY', text: 'k' });
    expect(metadata.bindings).toContainEqual({ type: 'plain_text', name: 'GATEWAY', text: 'gw' });
    expect(durableClasses(install)).toEqual(['Directory', 'Person']);
  });

  it('ties a container application to its Durable Object namespace', () => {
    expect(containerApplicationBody('app', 'img@sha256:1', 'basic', 'ns')).toMatchObject({
      name: 'app',
      configuration: { image: 'img@sha256:1', instance_type: 'basic' },
      durable_objects: { namespace_id: 'ns' },
      instances: 0,
    });
  });
});

describe('git-gatekeeper install', () => {
  const install = shapeInstallOf('git-gatekeeper');
  if (install === undefined) throw new Error('missing');
  const names = {
    self: 'port-git-gatekeeper-ab12',
    partName: (part: string) => `port-git-gatekeeper-ab12-${part}`,
    secret: 's',
  };

  it('gives the Artifacts binding only to the gatekeeper Worker', () => {
    const main = shapeWorkerMetadata(install, 'gw', 'k', names);
    expect(main.bindings.some((binding) => binding.type === 'artifacts')).toBe(false);
    expect(main.bindings).toContainEqual({
      type: 'service',
      name: 'GATE',
      service: 'port-git-gatekeeper-ab12-gate',
      entrypoint: 'Gatekeeper',
    });
    const gate = install.parts?.find((part) => part.part === 'gate');
    if (gate === undefined) throw new Error('no gate part');
    expect(partMetadata(gate, names).bindings).toEqual([
      { type: 'artifacts', name: 'REPOS', namespace: 'port-git-gatekeeper-ab12' },
    ]);
  });
});
