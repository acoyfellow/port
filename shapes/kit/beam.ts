import { DurableObject } from 'cloudflare:workers';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import { RemoteHttpEnv } from './http-env.ts';

export const BEAM_SEATS = 5;
const BOX_NAME = 'fleet';
const CONTROL_PORT = 8090;
const BOOT_TRIES = 90;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type SeatState = {
  readonly seat: number;
  readonly user: string;
  readonly osPid: number;
  readonly starts: number;
  readonly startedAt: number;
};

export type FleetState = { readonly supervisor: string; readonly seats: readonly SeatState[] };

const field = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;

const seatStateOf = (value: unknown): SeatState => ({
  seat: Number(field(value, 'seat')),
  user: String(field(value, 'user')),
  osPid: Number(field(value, 'osPid')),
  starts: Number(field(value, 'starts')),
  startedAt: Number(field(value, 'startedAt')),
});

const fleetStateOf = (value: unknown): FleetState => {
  const seats = field(value, 'seats');
  return {
    supervisor: String(field(value, 'supervisor')),
    seats: Array.isArray(seats) ? seats.map(seatStateOf) : [],
  };
};

export class Fleet extends DurableObject {
  async #port(port: number) {
    const container = this.ctx.container;
    if (container === undefined) throw new Error('the fleet has no container');
    if (!container.running) container.start({ enableInternet: true });
    const tcp = container.getTcpPort(port);
    for (let attempt = 0; attempt < BOOT_TRIES; attempt++) {
      const reply = await tcp.fetch('http://fleet/').catch(() => undefined);
      if (reply?.ok === true) return tcp;
      await pause(1000);
    }
    throw new Error(`port ${port} never answered`);
  }

  async relay(seat: number, path: string, method: string, body: string) {
    const response = await (await this.#port(8080 + seat)).fetch(`http://seat${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(method === 'GET' ? {} : { body }),
    });
    return { status: response.status, text: await response.text() };
  }

  async state(): Promise<FleetState> {
    const reply = await (await this.#port(CONTROL_PORT)).fetch('http://fleet/');
    return fleetStateOf(await reply.json());
  }

  async kill(seat: number) {
    const reply = await (await this.#port(CONTROL_PORT)).fetch(`http://fleet/kill/${seat}`, {
      method: 'POST',
    });
    return reply.json();
  }
}

export type FleetNamespace = DurableObjectNamespace<Fleet>;

export const fleetOf = (box: FleetNamespace) => box.get(box.idFromName(BOX_NAME));

export const seatOf = (name: string) => {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return (hash % BEAM_SEATS) + 1;
};

export const seatEnv = (box: FleetNamespace, slug: string, seat: number, conversation: string) =>
  new RemoteHttpEnv({
    id: `${slug}:seat-${seat}:${conversation}`,
    cwd: `/home/agent${seat}/${conversation}`,
    transport: async (path, init) => {
      const body = typeof init.body === 'string' ? init.body : '';
      const reply = await fleetOf(box).relay(seat, path, init.method ?? 'GET', body);
      return new Response(reply.text, { status: reply.status });
    },
  });

const otherSeat = (seat: number) => (seat % BEAM_SEATS) + 1;

export const seatFacts = async (box: FleetNamespace, slug: string, conversation: string) => {
  const seat = seatOf(conversation);
  const neighbour = `/home/agent${otherSeat(seat)}`;
  let output = '';
  const result = await seatEnv(box, slug, seat, conversation).exec(
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
  const fleet = await fleetOf(box).state();
  return {
    seat,
    user,
    neighbour,
    neighbourDenied: result.ok && rest.join(' ').includes('Permission denied'),
    supervisor: fleet.supervisor,
    seats: JSON.stringify(fleet.seats),
  };
};
