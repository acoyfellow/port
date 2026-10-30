import { DurableObject } from 'cloudflare:workers';

type Env = { readonly SESSION: DurableObjectNamespace<Session> };

type Turn = { readonly n: number; readonly text: string; readonly boot: string };

export class Session extends DurableObject<Env> {
  private readonly boot = crypto.randomUUID();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS turns (n INTEGER PRIMARY KEY, text TEXT, boot TEXT)');
  }

  add(text: string): Turn {
    const next = this.ctx.storage.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM turns').one().n + 1;
    this.ctx.storage.sql.exec('INSERT INTO turns (n, text, boot) VALUES (?, ?, ?)', next, text, this.boot);
    return { n: next, text, boot: this.boot };
  }

  read(): { readonly boot: string; readonly turns: readonly Turn[] } {
    const turns = this.ctx.storage.sql.exec<Turn>('SELECT n, text, boot FROM turns ORDER BY n').toArray();
    return { boot: this.boot, turns };
  }

  crash(): void {
    this.ctx.abort('shape smoke: restart on purpose');
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const session = env.SESSION.get(env.SESSION.idFromName(url.searchParams.get('s') ?? 'default'));
    if (url.pathname === '/add') return Response.json(await session.add(url.searchParams.get('text') ?? ''));
    if (url.pathname === '/read') return Response.json(await session.read());
    if (url.pathname === '/crash') {
      try {
        await session.crash();
      } catch (error) {
        return Response.json({ restarted: true, reason: String(error) });
      }
      return Response.json({ restarted: false });
    }
    return new Response('durable-session shape');
  },
} satisfies ExportedHandler<Env>;
