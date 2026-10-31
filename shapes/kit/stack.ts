import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';
import * as Redacted from 'effect/Redacted';

export const COMPATIBILITY_DATE = '2026-09-30';
export const PREFIX = 'port-shape-';

export const workerName = (slug: string) => `${PREFIX}${slug}`;
export const containerName = (slug: string, part: string) => `${PREFIX}${slug}-${part}`;
export const gatewayName = (slug: string) => `${PREFIX}${slug}`;
export const SHAPE_ZONE = 'customer0.dev';
export const shapeHost = (slug: string) => `${PREFIX}${slug}.${SHAPE_ZONE}`;

export const durableObject = <Shape>(className: string) => Cloudflare.DurableObject<Shape>(className);

export const workerLoader = (binding: string) => Cloudflare.WorkerLoader(binding);

export const workersAi = (binding: string) => Cloudflare.Workers.AI(binding);

export const container = <Shape>(slug: string, className: string) =>
  Cloudflare.Container<Shape>(className, {
    name: containerName(slug, className.toLowerCase()),
    className,
    context: './box',
    maxInstances: 2,
    instanceType: 'lite',
  });

export type ShapeOptions = {
  readonly gateway?: { readonly binding: string };
  readonly secret?: { readonly binding: string; readonly env: string };
};

const secretValue = (env: string) => {
  const value = process.env[env];
  if (value === undefined || value === '') throw new Error(`${env} must be set for this shape`);
  return Redacted.make(value);
};

export const shapeStack = <const Env extends Cloudflare.WorkerBindingProps>(
  slug: string,
  env: Env,
  options: ShapeOptions = {},
) =>
  Alchemy.Stack(
    workerName(slug),
    { providers: Cloudflare.providers(), state: Alchemy.localState() },
    Effect.gen(function* () {
      const gateway =
        options.gateway === undefined
          ? {}
          : {
              [options.gateway.binding]: (yield* Cloudflare.AI.Gateway('gateway', {
                id: gatewayName(slug),
                authentication: true,
              })).gatewayId,
            };
      const secret =
        options.secret === undefined ? {} : { [options.secret.binding]: secretValue(options.secret.env) };
      const worker = yield* Cloudflare.Worker('worker', {
        name: workerName(slug),
        main: './src/index.ts',
        compatibility: { date: COMPATIBILITY_DATE, flags: ['nodejs_compat'] },
        workersDev: false,
        domain: shapeHost(slug),
        env: { ...env, ...gateway, ...secret },
      });
      return { url: worker.url, worker: worker.workerName };
    }),
  );
