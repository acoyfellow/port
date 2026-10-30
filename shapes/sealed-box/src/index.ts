import { DurableObject } from 'cloudflare:workers';

type Env = { readonly BOX: DurableObjectNamespace<Box> };

type Receipt = {
  readonly answer: string;
  readonly run: string;
  readonly fingerprint: string;
  readonly nonce: string;
  readonly internet: boolean;
};

const sha256 = async (text: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class Box extends DurableObject<Env> {
  async run(run: string, task: string) {
    const container = this.ctx.container;
    if (container === undefined) throw new Error('no container on this Durable Object');
    if (!container.running) container.start({ enableInternet: false });
    const nonce = crypto.randomUUID();
    const port = container.getTcpPort(8080);
    let last = '';
    for (let attempt = 0; attempt < 25; attempt++) {
      try {
        const response = await port.fetch('http://box/cgi-bin/run', {
          headers: { 'x-run': run, 'x-task': task, 'x-nonce': nonce },
        });
        if (response.ok) {
          const receipt: Receipt = await response.json();
          const fingerprint = await sha256(task);
          const verified =
            receipt.run === run && receipt.fingerprint === fingerprint && receipt.nonce === nonce;
          await container.destroy().catch(() => undefined);
          return { receipt, expected: { run, fingerprint, nonce }, verified };
        }
        last = `HTTP ${response.status}`;
      } catch (error) {
        last = String(error);
      }
      await pause(2000);
    }
    throw new Error(`box never answered: ${last}`);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/run') return new Response('sealed-box shape');
    const run = url.searchParams.get('run') ?? crypto.randomUUID();
    const task = url.searchParams.get('task') ?? '';
    if (!/^[a-z0-9-]{1,64}$/.test(task))
      return Response.json({ error: 'task must match [a-z0-9-]' }, { status: 400 });
    const box = env.BOX.get(env.BOX.idFromName(run));
    try {
      return Response.json(await box.run(run, task));
    } catch (error) {
      return Response.json({ error: String(error) }, { status: 502 });
    }
  },
} satisfies ExportedHandler<Env>;
