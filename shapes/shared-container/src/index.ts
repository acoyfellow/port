import { DurableObject } from 'cloudflare:workers';

type Env = { readonly BOX: DurableObjectNamespace<Box> };

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class Box extends DurableObject<Env> {
  async seats(): Promise<unknown> {
    const container = this.ctx.container;
    if (container === undefined) throw new Error('no container on this Durable Object');
    if (!container.running) container.start();
    const port = container.getTcpPort(8080);
    let last = '';
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        const response = await port.fetch('http://box/cgi-bin/seats');
        if (response.ok) return await response.json();
        last = `HTTP ${response.status}`;
      } catch (error) {
        last = String(error);
      }
      await pause(2000);
    }
    throw new Error(`box never answered: ${last}`);
  }

  async stop() {
    const container = this.ctx.container;
    if (container === undefined || !container.running) return { stopped: false };
    await container.destroy();
    return { stopped: true };
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const box = env.BOX.get(env.BOX.idFromName('one'));
    try {
      if (url.pathname === '/seats') return Response.json(await box.seats());
      if (url.pathname === '/stop') return Response.json(await box.stop());
      return new Response('shared-container shape');
    } catch (error) {
      return Response.json({ error: String(error) }, { status: 502 });
    }
  },
} satisfies ExportedHandler<Env>;
