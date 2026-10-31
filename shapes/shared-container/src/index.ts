import { DurableObject } from 'cloudflare:workers';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { type AgentEnv, piAgent } from '../../kit/agent.ts';
import { RemoteHttpEnv } from '../../kit/http-env.ts';
import { piRouter } from '../../kit/router.ts';

type Env = AgentEnv & {
  readonly SEAT: DurableObjectNamespace<Seat>;
  readonly BOX: DurableObjectNamespace<Box>;
};

const SEATS = 5;
const BOX_NAME = 'shared';
const BOOT_TRIES = 90;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class Box extends DurableObject<Env> {
  async #port(seat: number) {
    const container = this.ctx.container;
    if (container === undefined) throw new Error('the shared box has no container');
    if (!container.running) container.start({ enableInternet: true });
    const port = container.getTcpPort(8080 + seat);
    for (let attempt = 0; attempt < BOOT_TRIES; attempt++) {
      const reply = await port.fetch('http://seat/').catch(() => undefined);
      if (reply?.ok === true) return port;
      await pause(1000);
    }
    throw new Error(`seat ${seat} never answered`);
  }

  async relay(seat: number, path: string, method: string, body: string) {
    const response = await (await this.#port(seat)).fetch(`http://seat${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(method === 'GET' ? {} : { body }),
    });
    return { status: response.status, text: await response.text() };
  }
}

const seatOf = (name: string) => {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return (hash % SEATS) + 1;
};

const seatEnv = (env: Env, seat: number) =>
  new RemoteHttpEnv({
    id: `shared-container:seat-${seat}`,
    cwd: `/home/agent${seat}`,
    transport: async (path, init) => {
      const box = env.BOX.get(env.BOX.idFromName(BOX_NAME));
      const body = typeof init.body === 'string' ? init.body : '';
      const reply = await box.relay(seat, path, init.method ?? 'GET', body);
      return new Response(reply.text, { status: reply.status });
    },
  });

const otherSeat = (seat: number) => (seat % SEATS) + 1;

export class Seat extends piAgent<Env>({
  name: 'shared-container',
  instructions:
    'You are one of five coding agents sharing a Linux container. Your home directory is your workspace; you run as your own Unix user and cannot read the other agents. Do the task with the tools, check it, then reply in one short sentence.',
  environment: (env, ctx) => seatEnv(env, seatOf(ctx.id.toString())),
  probe: async (env, ctx) => {
    const seat = seatOf(ctx.id.toString());
    const neighbour = `/home/agent${otherSeat(seat)}`;
    let output = '';
    const result = await seatEnv(env, seat).exec(
      `id -un; ls ${neighbour} 2>&1 || true`,
      {
        timeout: 20,
        onOutput: (text) => {
          output += text;
        },
      },
      BACKGROUND_CONTEXT,
    );
    const [user = '', ...rest] = output.trim().split('\n');
    return {
      facts: {
        seat,
        user,
        neighbour,
        neighbourDenied: result.ok && rest.join(' ').includes('Permission denied'),
      },
    };
  },
}) {}

export default piRouter<Env>({
  shape: 'shared-container',
  agent: (env, name) => env.SEAT.get(env.SEAT.idFromName(name)),
  gateway: (env) => env.GATEWAY,
});
