import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { RemoteHttpEnv } from './http-env.ts';

const BOX_PORT = 8080;
const BOOT_TRIES = 90;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type ContainerOptions = {
  readonly internet: boolean;
  readonly cwd?: string;
  readonly env?: Record<string, string>;
};

const started = async (ctx: DurableObjectState, options: ContainerOptions) => {
  const container = ctx.container;
  if (container === undefined) throw new Error('this Durable Object has no container');
  if (!container.running)
    container.start({
      enableInternet: options.internet,
      ...(options.env === undefined ? {} : { env: options.env }),
    });
  const port = container.getTcpPort(BOX_PORT);
  let last = '';
  for (let attempt = 0; attempt < BOOT_TRIES; attempt++) {
    const reply = await port.fetch('http://box/').catch((error: unknown) => String(error));
    if (typeof reply !== 'string' && reply.ok) return port;
    last = typeof reply === 'string' ? reply : `HTTP ${reply.status}`;
    await pause(1000);
  }
  throw new Error(`the container env server never answered: ${last}`);
};

export const containerEnv = (ctx: DurableObjectState, id: string, options: ContainerOptions) =>
  new RemoteHttpEnv({
    id,
    cwd: options.cwd ?? '/workspace',
    transport: async (path, init) => (await started(ctx, options)).fetch(`http://box${path}`, init),
  });

export const boxBoot = async (ctx: DurableObjectState, options: ContainerOptions) => {
  const reply: unknown = await (await (await started(ctx, options)).fetch('http://box/')).json();
  const boot = typeof reply === 'object' && reply !== null ? Reflect.get(reply, 'boot') : undefined;
  return typeof boot === 'string' ? boot : '';
};

export const stopBox = async (ctx: DurableObjectState) => {
  const container = ctx.container;
  if (container === undefined || !container.running) return false;
  await container.destroy().catch(() => undefined);
  return true;
};

export const runInBox = async (env: RemoteHttpEnv, command: readonly string[], timeout = 30) => {
  let output = '';
  const result = await env.exec(
    command,
    {
      timeout,
      onOutput: (text) => {
        output += text;
      },
    },
    BACKGROUND_CONTEXT,
  );
  return {
    exitCode: result.ok ? result.value.exitCode : -1,
    output: output.trim(),
    error: result.ok ? '' : result.error.code,
  };
};
