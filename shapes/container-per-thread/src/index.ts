import { DurableObject } from 'cloudflare:workers';

type Env = { readonly THREAD: DurableObjectNamespace<Thread> };

type Computer = { readonly thread: string; readonly host: string; readonly files: string };

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class Thread extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS turns (n INTEGER PRIMARY KEY AUTOINCREMENT, op TEXT, files TEXT)',
    );
  }

  async turn(thread: string, op: string) {
    const container = this.ctx.container;
    if (container === undefined) throw new Error('no container on this Durable Object');
    if (!container.running) container.start();
    const port = container.getTcpPort(8080);
    let last = '';
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        const response = await port.fetch('http://computer/cgi-bin/fs', {
          headers: { 'x-thread': thread, 'x-op': op },
        });
        if (response.ok) {
          const computer: Computer = await response.json();
          this.ctx.storage.sql.exec('INSERT INTO turns (op, files) VALUES (?, ?)', op, computer.files);
          const turns = this.ctx.storage.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM turns').one().n;
          return { computer, turns };
        }
        last = `HTTP ${response.status}`;
      } catch (error) {
        last = String(error);
      }
      await pause(2000);
    }
    throw new Error(`computer never answered: ${last}`);
  }

  async stop() {
    const container = this.ctx.container;
    if (container === undefined) return { stopped: false };
    const wasRunning = container.running;
    await container.destroy().catch(() => undefined);
    return { stopped: true, wasRunning };
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const name = url.searchParams.get('t') ?? '';
    if (!/^[a-z0-9-]{1,64}$/.test(name)) return new Response('container-per-thread shape');
    const thread = env.THREAD.get(env.THREAD.idFromName(name));
    try {
      if (url.pathname === '/stop') return Response.json(await thread.stop());
      if (url.pathname === '/write') return Response.json(await thread.turn(name, 'write'));
      if (url.pathname === '/read') return Response.json(await thread.turn(name, 'read'));
      return new Response('not found', { status: 404 });
    } catch (error) {
      return Response.json({ error: String(error) }, { status: 502 });
    }
  },
} satisfies ExportedHandler<Env>;
