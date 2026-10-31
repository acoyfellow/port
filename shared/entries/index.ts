import type { Entry, ShapeBuild } from '../entry.ts';
import { SHAPE as isolate_agents } from '../../shapes/isolate-agents/shape';
import { SHAPE as durable_session } from '../../shapes/durable-session/shape';
import { SHAPE as chat_with_sandbox } from '../../shapes/chat-with-sandbox/shape';
import { SHAPE as agent_room } from '../../shapes/agent-room/shape';
import { SHAPE as container_per_thread } from '../../shapes/container-per-thread/shape';
import { SHAPE as person_with_computer } from '../../shapes/person-with-computer/shape';
import { SHAPE as shared_container } from '../../shapes/shared-container/shape';
import { SHAPE as sealed_box } from '../../shapes/sealed-box/shape';
import { SHAPE as self_editing_app } from '../../shapes/self-editing-app/shape';
import { SHAPE as self_observe } from '../../shapes/self-observe/shape';
import { ENTRY as grounded_bug_arena } from './grounded-bug-arena';

const BUILDS: Readonly<Record<string, ShapeBuild>> = {
  "agent-room": {
    "task": "read the shared room and answered a person by posting to it",
    "infrastructure": "There is no container: the room and the agent are separate Durable Objects. Pi read the room through a tool and posted \"kiwi5691\" as agent:helper.",
    "usd": 0.00108901,
    "tokens": 2516,
    "seconds": 17,
    "resumed": true,
    "on": "2026-10-31"
  },
  "chat-with-sandbox": {
    "task": "wrote and checked fizzbuzz.py and NOTES.md",
    "infrastructure": "The tools ran in this chat's own sandbox container, internet off (boot 76a9bf68).",
    "usd": 0.0031724299999999995,
    "tokens": 4848,
    "seconds": 120,
    "resumed": true,
    "on": "2026-10-31"
  },
  "container-per-thread": {
    "task": "wrote and checked fizzbuzz.py and NOTES.md",
    "infrastructure": "The tools ran in this thread's own container (boot 5c16a669).",
    "usd": 0.00403377,
    "tokens": 7356,
    "seconds": 127,
    "resumed": true,
    "on": "2026-10-31"
  },
  "durable-session": {
    "task": "wrote and checked fizzbuzz.py and NOTES.md",
    "infrastructure": "There is no container: Pi's transcript and the workspace files live in one Durable Object's SQLite (11 tables).",
    "usd": 0.0024773600000000005,
    "tokens": 3412,
    "seconds": 22,
    "resumed": true,
    "on": "2026-10-31"
  },
  "person-with-computer": {
    "task": "wrote and checked fizzbuzz.py and NOTES.md",
    "infrastructure": "The agent ran as the signed-in person in their own computer (boot 684d2117). The token stayed in the Directory Durable Object; the browser got only a signed cookie, and a forged cookie got HTTP 401.",
    "usd": 0.00474934,
    "tokens": 9237,
    "seconds": 134,
    "resumed": true,
    "on": "2026-10-31"
  },
  "sealed-box": {
    "task": "wrote and checked fizzbuzz.py and NOTES.md",
    "infrastructure": "The tools ran in a container with internet off: a fetch from inside the box was blocked. Model calls left from the Durable Object, not the box.",
    "usd": 0.0031159,
    "tokens": 5551,
    "seconds": 149,
    "resumed": true,
    "on": "2026-10-31"
  },
  "shared-container": {
    "task": "wrote and checked fizzbuzz.py and NOTES.md",
    "infrastructure": "The tools ran in the shared container as Unix user agent2; reading /home/agent3 was denied.",
    "usd": 0.005279079999999999,
    "tokens": 10232,
    "seconds": 129,
    "resumed": true,
    "on": "2026-10-31"
  }
};

export const ENTRIES: readonly Entry[] = [
  isolate_agents,
  { ...durable_session, build: BUILDS["durable-session"] },
  { ...chat_with_sandbox, build: BUILDS["chat-with-sandbox"] },
  { ...agent_room, build: BUILDS["agent-room"] },
  { ...container_per_thread, build: BUILDS["container-per-thread"] },
  { ...person_with_computer, build: BUILDS["person-with-computer"] },
  { ...shared_container, build: BUILDS["shared-container"] },
  { ...sealed_box, build: BUILDS["sealed-box"] },
  self_editing_app,
  self_observe,
  grounded_bug_arena,
];
