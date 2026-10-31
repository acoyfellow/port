import { DurableObject } from 'cloudflare:workers';
import { Type } from '@earendil-works/pi-ai';
import { defineExtension, defineTool } from '@earendil-works/pi-durable';
import { type AgentEnv, piAgent } from '../../kit/agent.ts';
import { piRouter } from '../../kit/router.ts';

type Env = AgentEnv & {
  readonly ROOM: DurableObjectNamespace<Room>;
  readonly AGENT: DurableObjectNamespace<RoomAgent>;
};

const ROOM_NAME = 'lobby';

export class Room extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS messages (n INTEGER PRIMARY KEY, sender TEXT, text TEXT)',
    );
  }

  post(sender: string, text: string) {
    this.ctx.storage.sql.exec('INSERT INTO messages (sender, text) VALUES (?, ?)', sender, text);
    return this.ctx.storage.sql.exec<{ n: number }>('SELECT MAX(n) AS n FROM messages').one().n;
  }

  read() {
    return this.ctx.storage.sql
      .exec<{ n: number; sender: string; text: string }>('SELECT n, sender, text FROM messages ORDER BY n')
      .toArray();
  }
}

const roomOf = (env: Env) => env.ROOM.get(env.ROOM.idFromName(ROOM_NAME));

const roomTools = (env: Env, agent: string) =>
  defineExtension({
    name: 'room',
    tools: [
      defineTool({
        name: 'read_room',
        description: 'Read every message in the shared chat room, oldest first, with its verified sender.',
        parameters: Type.Object({}),
        replay: 'safe',
        execute: async () => {
          const lines = (await roomOf(env).read()).map((each) => `#${each.n} ${each.sender}: ${each.text}`);
          return {
            output: [{ type: 'text', text: lines.length === 0 ? '(the room is empty)' : lines.join('\n') }],
          };
        },
      }),
      defineTool({
        name: 'post_to_room',
        description: 'Post one message to the shared chat room as yourself.',
        parameters: Type.Object({ text: Type.String() }),
        execute: async (args) => {
          const n = await roomOf(env).post(`agent:${agent}`, args.text);
          return { output: [{ type: 'text', text: `posted #${n}` }] };
        },
      }),
    ],
  });

export class RoomAgent extends piAgent<Env>({
  name: 'agent-room',
  instructions:
    'You are an AI agent in a shared chat room with people and other agents. Use read_room to see what was said, with each verified sender, and post_to_room to answer. Do what the newest message from a person asks, then reply in one short sentence.',
  environment: () => undefined,
  extensions: (env) => [roomTools(env, 'helper')],
  probe: async (env) => {
    const messages = await roomOf(env).read();
    return {
      facts: {
        messages: messages.length,
        agentPosts: messages.filter((each) => each.sender.startsWith('agent:')).length,
        last: messages.at(-1)?.text ?? '',
      },
    };
  },
}) {}

export default piRouter<Env>({
  shape: 'agent-room',
  agent: (env, name) => env.AGENT.get(env.AGENT.idFromName(name)),
  gateway: (env) => env.GATEWAY,
  extra: async (request, env) => {
    const url = new URL(request.url);
    if (url.pathname !== '/say') return undefined;
    const sender = url.searchParams.get('sender') ?? '';
    const text = url.searchParams.get('text') ?? '';
    if (sender === '' || text === '')
      return Response.json({ error: 'sender and text are required' }, { status: 400 });
    return Response.json({ n: await roomOf(env).post(`person:${sender}`, text) });
  },
});
