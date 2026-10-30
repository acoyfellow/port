import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';

export const COMPATIBILITY_DATE = '2026-09-30';
export const PREFIX = 'port-shape-';

export const workerName = (slug: string) => `${PREFIX}${slug}`;
export const containerName = (slug: string, part: string) => `${PREFIX}${slug}-${part}`;

export const durableObject = <Shape>(className: string) => Cloudflare.DurableObject<Shape>(className);

export const workerLoader = (binding: string) => Cloudflare.WorkerLoader(binding);

export const container = <Shape>(slug: string, className: string) =>
  Cloudflare.Container<Shape>(className, {
    name: containerName(slug, className.toLowerCase()),
    className,
    context: './box',
    maxInstances: 2,
    instanceType: 'lite',
  });

export const shapeStack = <const Env extends Cloudflare.WorkerBindingProps>(slug: string, env: Env) =>
  Alchemy.Stack(
    workerName(slug),
    { providers: Cloudflare.providers(), state: Alchemy.localState() },
    Effect.gen(function* () {
      const worker = yield* Cloudflare.Worker('worker', {
        name: workerName(slug),
        main: './src/index.ts',
        compatibility: { date: COMPATIBILITY_DATE },
        workersDev: true,
        env,
      });
      return { url: worker.url, worker: worker.workerName };
    }),
  );
