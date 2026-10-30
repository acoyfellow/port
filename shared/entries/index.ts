import { SHAPE as agent_room } from '../../shapes/agent-room/shape';
import { SHAPE as chat_with_sandbox } from '../../shapes/chat-with-sandbox/shape';
import { SHAPE as container_per_thread } from '../../shapes/container-per-thread/shape';
import { SHAPE as durable_session } from '../../shapes/durable-session/shape';
import { SHAPE as isolate_agents } from '../../shapes/isolate-agents/shape';
import { SHAPE as person_with_computer } from '../../shapes/person-with-computer/shape';
import { SHAPE as sealed_box } from '../../shapes/sealed-box/shape';
import { SHAPE as self_editing_app } from '../../shapes/self-editing-app/shape';
import { SHAPE as shared_container } from '../../shapes/shared-container/shape';
import type { Entry, ShapeBuild } from '../entry.ts';
import { ENTRY as grounded_bug_arena } from './grounded-bug-arena';

const BUILDS: Readonly<Record<string, ShapeBuild>> = {
  'agent-room': {
    proved:
      'ChatRoomDO sent 2 turns from alice and bob to a separate AgentDO. The AgentDO kept both turns and their senders after a forced restart. The boot ID changed. The room holds 4 messages.',
    seconds: {
      up: 7,
      smoke: 9,
      down: 4,
    },
    on: '2026-10-30',
  },
  'chat-with-sandbox': {
    proved:
      'Chat A wrote /home/user/note.txt in its own container. Chat A kept 2 Durable Object turns. Chat B got a different container. Chat B had no note and 1 turn.',
    seconds: {
      up: 30,
      smoke: 137,
      down: 5,
    },
    on: '2026-10-30',
  },
  'container-per-thread': {
    proved:
      'Each thread got its own Durable Object and container. Thread A saw its own file across 2 turns. Thread B got a different host. Thread B did not see the file of thread A.',
    seconds: {
      up: 19,
      smoke: 132,
      down: 3,
    },
    on: '2026-10-30',
  },
  'durable-session': {
    proved:
      'The session kept 3 turns after a forced Durable Object restart. The boot ID changed and the SQLite rows stayed.',
    seconds: {
      up: 8,
      smoke: 14,
      down: 3,
    },
    on: '2026-10-30',
  },
  'isolate-agents': {
    proved:
      'The seed tests passed in a Worker Loader isolate (23 of 23). A test that called the internet failed, because the isolate has no outbound network. One agent in a Durable Object ran 6 turns through the AI Gateway, changed files 2 times and was graded by hidden tests.',
    seconds: {
      up: 13,
      smoke: 180,
      down: 8,
    },
    on: '2026-10-30',
  },
  'person-with-computer': {
    proved:
      'Two signed-in people each got their own Hark Durable Object and container. Alice saw her note alpha. Bob saw an empty note. The two boot IDs were different. Directory kept the token on the server. The client got only a signed cookie. A forged cookie got 401. The Hark object trimmed 30 messages to the last 24.',
    seconds: {
      up: 18,
      smoke: 84,
      down: 4,
    },
    on: '2026-10-30',
  },
  'sealed-box': {
    proved:
      'A sealed container ran one task with internet off. It returned the correct answer. It echoed the run ID, the task SHA-256 and a fresh nonce.',
    seconds: {
      up: 22,
      smoke: 12,
      down: 6,
    },
    on: '2026-10-30',
  },
  'self-editing-app': {
    proved:
      'The Worker Loader gate shipped v1. The gate rejected v2 because its check failed. The gate rejected v3 because it did not boot. Version 1 stayed live. The gate shipped v4. Rollback made v1 live again.',
    seconds: {
      up: 8,
      smoke: 9,
      down: 5,
    },
    on: '2026-10-30',
  },
  'shared-container': {
    proved:
      '5 agents ran as 5 different Unix users in one container. The container had 1 boot ID. Each agent wrote a private file. All 20 cross-agent reads got Permission denied.',
    seconds: {
      up: 18,
      smoke: 8,
      down: 3,
    },
    on: '2026-10-30',
  },
};

export const ENTRIES: readonly Entry[] = [
  { ...isolate_agents, build: BUILDS['isolate-agents'] },
  { ...durable_session, build: BUILDS['durable-session'] },
  { ...chat_with_sandbox, build: BUILDS['chat-with-sandbox'] },
  { ...agent_room, build: BUILDS['agent-room'] },
  { ...container_per_thread, build: BUILDS['container-per-thread'] },
  { ...person_with_computer, build: BUILDS['person-with-computer'] },
  { ...shared_container, build: BUILDS['shared-container'] },
  { ...sealed_box, build: BUILDS['sealed-box'] },
  { ...self_editing_app, build: BUILDS['self-editing-app'] },
  grounded_bug_arena,
];
