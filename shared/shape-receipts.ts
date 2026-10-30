export type ShapeReceipt = {
  readonly proved: string;
  readonly seconds: { readonly up: number; readonly smoke: number; readonly down: number };
  readonly on: string;
};

export const SHAPE_RECEIPTS: Readonly<Record<string, ShapeReceipt>> = {
  'durable-session': {
    proved:
      'The session kept 3 turns after a forced Durable Object restart. The boot ID changed and the SQLite rows stayed.',
    seconds: { up: 10, smoke: 2, down: 3 },
    on: '2026-10-30',
  },
  'agent-room': {
    proved:
      'The room Durable Object sent 2 turns from 2 people to a separate agent Durable Object. The agent kept both turns and their senders after a forced restart.',
    seconds: { up: 10, smoke: 2, down: 3 },
    on: '2026-10-30',
  },
  'self-editing-app': {
    proved:
      'The gate shipped v1. It refused v2, which failed a check, and v3, which did not boot, so v1 stayed live. It shipped v4, and rollback restored v1.',
    seconds: { up: 10, smoke: 2, down: 2 },
    on: '2026-10-30',
  },
  'sealed-box': {
    proved:
      'A container with internet off answered one task. The answer echoed the run ID, the SHA-256 of the task and a fresh nonce.',
    seconds: { up: 24, smoke: 58, down: 3 },
    on: '2026-10-30',
  },
  'chat-with-sandbox': {
    proved:
      'Chat A wrote a file in its own container and kept 2 turns. Chat B got a different container with no file and 1 turn.',
    seconds: { up: 50, smoke: 78, down: 4 },
    on: '2026-10-30',
  },
  'container-per-thread': {
    proved:
      'Two threads got two Durable Objects and two containers with different boot IDs. Thread A saw its file across 2 turns. Thread B could not see it.',
    seconds: { up: 23, smoke: 251, down: 4 },
    on: '2026-10-30',
  },
  'person-with-computer': {
    proved:
      'Two signed-in people got their own Durable Object and container. The token stayed on the server, and a forged cookie got 401.',
    seconds: { up: 23, smoke: 95, down: 5 },
    on: '2026-10-30',
  },
  'shared-container': {
    proved:
      '5 agents ran as 5 Unix users in one container with one boot ID. Each wrote a private file. All 20 cross-agent reads got Permission denied.',
    seconds: { up: 22, smoke: 124, down: 3 },
    on: '2026-10-30',
  },
};
