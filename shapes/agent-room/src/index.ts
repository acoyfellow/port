import { DurableObject } from 'cloudflare:workers';

type Env = {
  readonly ROOM: DurableObjectNamespace<ChatRoomDO>;
  readonly AGENT: DurableObjectNamespace<AgentDO>;
};

type Message = { readonly n: number; readonly sender: string; readonly text: string };
type Turn = { readonly n: number; readonly room: string; readonly sender: string; readonly text: string; readonly reply: string };

export class ChatRoomDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS messages (n INTEGER PRIMARY KEY, sender TEXT, text TEXT)');
  }

  private append(sender: string, text: string): void {
    this.ctx.storage.sql.exec('INSERT INTO messages (sender, text) VALUES (?, ?)', sender, text);
  }

  async post(room: string, agent: string, sender: string, text: string): Promise<Turn> {
    this.append(sender, text);
    const turn = await this.env.AGENT.get(this.env.AGENT.idFromName(agent)).turn(room, sender, text);
    this.append(`agent:${agent}`, turn.reply);
    return turn;
  }

  messages(): readonly Message[] {
    return this.ctx.storage.sql.exec<Message>('SELECT n, sender, text FROM messages ORDER BY n').toArray();
  }
}

export class AgentDO extends DurableObject<Env> {
  private readonly boot = crypto.randomUUID();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS turns (n INTEGER PRIMARY KEY, room TEXT, sender TEXT, text TEXT, reply TEXT)',
    );
  }

  turn(room: string, sender: string, text: string): Turn {
    const reply = `ack ${sender}: ${text}`;
    this.ctx.storage.sql.exec(
      'INSERT INTO turns (room, sender, text, reply) VALUES (?, ?, ?, ?)',
      room,
      sender,
      text,
      reply,
    );
    const n = this.ctx.storage.sql.exec<{ n: number }>('SELECT MAX(n) AS n FROM turns').one().n;
    return { n, room, sender, text, reply };
  }

  read(): { readonly boot: string; readonly turns: readonly Turn[] } {
    const turns = this.ctx.storage.sql.exec<Turn>('SELECT n, room, sender, text, reply FROM turns ORDER BY n').toArray();
    return { boot: this.boot, turns };
  }

  crash(): void {
    this.ctx.abort('shape smoke: restart on purpose');
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const roomName = url.searchParams.get('room') ?? 'default';
    const agentName = url.searchParams.get('agent') ?? 'default';
    const room = env.ROOM.get(env.ROOM.idFromName(roomName));
    const agent = env.AGENT.get(env.AGENT.idFromName(agentName));
    if (url.pathname === '/post') {
      const sender = url.searchParams.get('sender') ?? 'anon';
      return Response.json(await room.post(roomName, agentName, sender, url.searchParams.get('text') ?? ''));
    }
    if (url.pathname === '/messages') return Response.json(await room.messages());
    if (url.pathname === '/agent') return Response.json(await agent.read());
    if (url.pathname === '/crash') {
      try {
        await agent.crash();
      } catch (error) {
        return Response.json({ restarted: true, reason: String(error) });
      }
      return Response.json({ restarted: false });
    }
    return new Response('agent-room shape');
  },
} satisfies ExportedHandler<Env>;
