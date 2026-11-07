import { SHAPE as agent_room } from '../../shapes/agent-room/shape';
import { SHAPE as chat_with_sandbox } from '../../shapes/chat-with-sandbox/shape';
import { SHAPE as container_per_thread } from '../../shapes/container-per-thread/shape';
import { SHAPE as durable_session } from '../../shapes/durable-session/shape';
import { SHAPE as egress_filter } from '../../shapes/egress-filter/shape';
import { SHAPE as flight_recorder } from '../../shapes/flight-recorder/shape';
import { SHAPE as gadget_workspace } from '../../shapes/gadget-workspace/shape';
import { SHAPE as git_gatekeeper } from '../../shapes/git-gatekeeper/shape';
import { SHAPE as isolate_agents } from '../../shapes/isolate-agents/shape';
import { SHAPE as person_with_computer } from '../../shapes/person-with-computer/shape';
import { SHAPE as safe_sql } from '../../shapes/safe-sql/shape';
import { SHAPE as scheduled_agent } from '../../shapes/scheduled-agent/shape';
import { SHAPE as sealed_box } from '../../shapes/sealed-box/shape';
import { SHAPE as self_editing_app } from '../../shapes/self-editing-app/shape';
import { SHAPE as self_observe } from '../../shapes/self-observe/shape';
import { SHAPE as shared_container } from '../../shapes/shared-container/shape';
import { SHAPE as snapshot_rollback } from '../../shapes/snapshot-rollback/shape';
import { SHAPE as vector_memory } from '../../shapes/vector-memory/shape';
import { SHAPE as workflow_plan } from '../../shapes/workflow-plan/shape';
import type { Entry, EvalAll, ShapeBuild } from '../entry.ts';

const BUILDS: Readonly<Record<string, ShapeBuild>> = {
  'agent-room': {
    task: 'read the shared room and answered a person by posting to it',
    infrastructure:
      'There is no container: the room and the agent are separate Durable Objects. Pi read the room through a tool and posted "kiwi5691" as agent:helper.',
    usd: 0.00108901,
    tokens: 2516,
    seconds: 17,
    resumed: true,
    on: '2026-10-31',
  },
  'chat-with-sandbox': {
    task: 'wrote and checked fizzbuzz.py and NOTES.md',
    infrastructure: "The tools ran in this chat's own sandbox container, internet off (boot 76a9bf68).",
    usd: 0.0031724299999999995,
    tokens: 4848,
    seconds: 120,
    resumed: true,
    on: '2026-10-31',
  },
  'container-per-thread': {
    task: 'wrote and checked fizzbuzz.py and NOTES.md',
    infrastructure: "The tools ran in this thread's own container (boot 5c16a669).",
    usd: 0.00403377,
    tokens: 7356,
    seconds: 127,
    resumed: true,
    on: '2026-10-31',
  },
  'durable-session': {
    task: 'wrote and checked fizzbuzz.py and NOTES.md',
    infrastructure:
      "There is no container: Pi's transcript and the workspace files live in one Durable Object's SQLite (11 tables).",
    usd: 0.0024773600000000005,
    tokens: 3412,
    seconds: 22,
    resumed: true,
    on: '2026-10-31',
  },
  'egress-filter': {
    task: 'wrote and ran two fetch scripts, one allowed and one blocked by the egress filter',
    infrastructure:
      'Every script request went through the filter Worker, which logged 4 requests (+example.com,-api.github.com,-port-shape-egress-filter.customer0.dev,-cloudflare.com). It allowed example.com and blocked 3. A canary leak attempt from the sandbox got status 403; the canary saw 0 requests from the sandbox and 1 from the control. The sandbox had no bindings.',
    usd: 0.0043368899999999995,
    tokens: 6430,
    seconds: 46,
    resumed: true,
    on: '2026-11-06',
  },
  'flight-recorder': {
    task: 'wrote and checked fizzbuzz.py and NOTES.md',
    infrastructure:
      'Pi made 4 tool calls (write,write,read,read). A separate Tail Worker, which the agent cannot reach or write to, recorded 4 of them from 13 traces.',
    usd: 0.0018873700000000002,
    tokens: 2004,
    seconds: 34,
    resumed: true,
    on: '2026-11-06',
  },
  'gadget-workspace': {
    task: 'built a notes gadget in a facet, shared a note through the gatekeeper, and the email was delivered only after a valid passkey signature',
    infrastructure:
      'The gadget ran as a Durable Object facet and kept "buy milk 6148" in its own storage. Its email went to the gatekeeper and waited. The gatekeeper refused an unsigned approval, a signature from another key, a signature over a different action, a second enrollment and a replay (approval needs a passkey signature | the signature does not match the approver key | the signature is for a different action | action is already delivered); it delivered the email only for a valid P-256 passkey signature over that action\'s digest. Only the gatekeeper holds the delivery key. A sandboxed gadget saw bindings [OUTBOX] and no internet.',
    usd: 0.01440298,
    tokens: 17020,
    seconds: 69,
    resumed: true,
    on: '2026-11-06',
  },
  'git-gatekeeper': {
    task: 'wrote fizzbuzz.py, published it through the gatekeeper and was refused on main',
    infrastructure:
      'The gatekeeper Worker alone holds the Artifacts binding. It pushed a session branch and opened merge request record 1; main has only gatekeeper commits; the sandbox had 0 credentials in its environment or on disk. Branches: main,session/b2fa1657a50e8dc3.',
    usd: 0.00354462,
    tokens: 7704,
    seconds: 72,
    resumed: true,
    on: '2026-11-03',
  },
  'isolate-agents': {
    task: 'finished the money-words task; hidden tests passed 2 of 2',
    infrastructure:
      'The tools ran in memory in the Durable Object; node --test ran in Worker Loader isolates (seed 23/23) with the network blocked.',
    usd: 0.03213973,
    tokens: 38232,
    seconds: 181,
    resumed: true,
    on: '2026-10-31',
  },
  'person-with-computer': {
    task: 'wrote and checked fizzbuzz.py and NOTES.md',
    infrastructure:
      'The agent ran as the signed-in person in their own computer (boot 684d2117). The token stayed in the Directory Durable Object; the browser got only a signed cookie, and a forged cookie got HTTP 401.',
    usd: 0.00474934,
    tokens: 9237,
    seconds: 134,
    resumed: true,
    on: '2026-10-31',
  },
  'safe-sql': {
    task: 'answered a question from D1 and was refused when it tried to change the data',
    infrastructure:
      "Pi answered from D1 through a read-only query Worker. Its write attempt was refused (UPDATE orders SET total_cents = 0 WHERE customer_id = (SELECT id FROM customers WHERE name = 'Grace');), and a direct UPDATE and DROP TABLE were refused too, by reading SQLite's query plan before running anything. Afterwards the database still had 4 customers, 7 orders and 20950 cents in total, as seeded. The agent's Worker has no D1 binding.",
    usd: 0.0048658700000000004,
    tokens: 7959,
    seconds: 48,
    resumed: true,
    on: '2026-11-06',
  },
  'scheduled-agent': {
    task: 'set up a job, then ran it twice on its own, woken by a Durable Object alarm',
    infrastructure:
      'After the first task, no request was sent to the agent. A separate clock Durable Object woke it 2 times by alarm, 20 s apart, and Pi wrote 2 tick lines to log.txt (tick 1 2026-11-06T13:35:05.271Z | tick 2 2026-11-06T13:35:25.321Z).',
    usd: 0.0015176499999999997,
    tokens: 3360,
    seconds: 67,
    resumed: true,
    on: '2026-11-06',
  },
  'sealed-box': {
    task: 'wrote and checked fizzbuzz.py and NOTES.md',
    infrastructure:
      'The tools ran in a container with internet off: a fetch from inside the box was blocked. Model calls left from the Durable Object, not the box.',
    usd: 0.0031159,
    tokens: 5551,
    seconds: 149,
    resumed: true,
    on: '2026-10-31',
  },
  'self-editing-app': {
    task: 'edited its own app and shipped a new version that passed the boot check',
    infrastructure:
      'Version 2 went live only after it booted and passed /__check in a fresh Worker Loader isolate; it now answers "hello from pi 7386".',
    usd: 0.0023168,
    tokens: 4015,
    seconds: 14,
    resumed: true,
    on: '2026-10-31',
  },
  'self-observe': {
    task: 'wrote clamp with tests, then checked it with shrink and mutate in isolates',
    infrastructure:
      "Shrink, trace and mutate are Pi extension tools that run the agent's code in fresh Worker Loader isolates: 7 shrink or trace runs and 7 mutate runs.",
    usd: 0.17429245999999995,
    tokens: 539493,
    seconds: 630,
    resumed: true,
    on: '2026-10-31',
  },
  'shared-container': {
    task: 'wrote and checked fizzbuzz.py and NOTES.md',
    infrastructure:
      'The tools ran in the shared container as Unix user agent2; reading /home/agent3 was denied.',
    usd: 0.005279079999999999,
    tokens: 10232,
    seconds: 129,
    resumed: true,
    on: '2026-10-31',
  },
  'snapshot-rollback': {
    task: 'wrote and tested stats.py and saved a whole-computer checkpoint',
    infrastructure:
      'Pi saved checkpoint "tests-pass" (3 files, 1 KB in the Durable Object, 169 ms). The test then deleted every file in /workspace; the rollback threw the container away, started a fresh one and unpacked the checkpoint in 2223 ms. The restored files hash to 6cb2cf57e15c30dc, the same as the checkpoint.',
    usd: 0.005205,
    tokens: 8762,
    seconds: 28,
    resumed: true,
    on: '2026-11-06',
  },
  'vector-memory': {
    task: 'stored facts in Vectorize; a fresh session with no shared chat recalled them',
    infrastructure:
      "Session A stored 3 facts in Vectorize. Session B, a separate Durable Object that never saw A's chat and stored nothing itself, recalled 4 of A's facts by meaning (the project database is D1 | my project code name is ORCA-34827 | I prefer short answers) and answered with the code name and the database.",
    usd: 0.00277328,
    tokens: 5961,
    seconds: 127,
    resumed: true,
    on: '2026-11-06',
  },
  'workflow-plan': {
    task: 'planned three steps, then a Workflow ran each step as its own durable step with one forced retry',
    infrastructure:
      'A Cloudflare Workflow ran Pi\'s 3-step plan as durable steps and finished "complete". Step 2 failed once on purpose and the Workflow retried it on its own. Attempts: 1:ran,2:failed,2:ran,3:ran. No step\'s work ran twice.',
    usd: 0.00144481,
    tokens: 1845,
    seconds: 63,
    resumed: true,
    on: '2026-11-06',
  },
};

const EVALS: Readonly<Record<string, EvalAll>> = {
  'chat-with-sandbox': {
    passed: 4,
    of: 5,
    usdPerTask: 0.0611,
    capped: 1,
    medianSeconds: 275,
    note: 'sku-glob hit the 15 min cap at hidden 2/3',
    on: '2026-11-06',
  },
  'container-per-thread': {
    passed: 5,
    of: 5,
    usdPerTask: 0.0905,
    capped: 0,
    medianSeconds: 371,
    note: '',
    on: '2026-11-06',
  },
  'durable-session': {
    passed: 5,
    of: 5,
    usdPerTask: 0.1197,
    capped: 0,
    medianSeconds: 195,
    note: '',
    on: '2026-11-06',
  },
  'git-gatekeeper': {
    passed: 5,
    of: 5,
    usdPerTask: 0.0926,
    capped: 0,
    medianSeconds: 347,
    note: '',
    on: '2026-11-06',
  },
  'isolate-agents': {
    passed: 4,
    of: 5,
    usdPerTask: 0.07,
    capped: 1,
    medianSeconds: 236,
    note: 'csv-parse used an enum (prompt forbids it); sku-glob passed at the cap',
    on: '2026-11-06',
  },
  'person-with-computer': {
    passed: 5,
    of: 5,
    usdPerTask: 0.0527,
    capped: 1,
    medianSeconds: 472,
    note: 'rerun after a harness bug (one sign-in reused across tasks)',
    on: '2026-11-06',
  },
  'sealed-box': {
    passed: 4,
    of: 5,
    usdPerTask: 0.0773,
    capped: 1,
    medianSeconds: 214,
    note: 'sku-glob hit the 15 min cap; hidden file did not load',
    on: '2026-11-06',
  },
  'self-editing-app': {
    passed: 5,
    of: 5,
    usdPerTask: 0.1251,
    capped: 0,
    medianSeconds: 211,
    note: '',
    on: '2026-11-06',
  },
  'self-observe': {
    passed: 5,
    of: 5,
    usdPerTask: 0.1671,
    capped: 3,
    medianSeconds: 902,
    note: '3/5 runs hit the 15 min cap but their files passed; usd undercounted',
    on: '2026-11-06',
  },
  'shared-container': {
    passed: 5,
    of: 5,
    usdPerTask: 0.0801,
    capped: 0,
    medianSeconds: 231,
    note: '',
    on: '2026-11-06',
  },
};

export const ENTRIES: readonly Entry[] = [
  {
    ...isolate_agents,
    added: '2026-10-30',
    build: BUILDS['isolate-agents'],
    evalAll: EVALS['isolate-agents'],
  },
  {
    ...durable_session,
    added: '2026-10-30',
    build: BUILDS['durable-session'],
    evalAll: EVALS['durable-session'],
  },
  {
    ...chat_with_sandbox,
    added: '2026-10-30',
    build: BUILDS['chat-with-sandbox'],
    evalAll: EVALS['chat-with-sandbox'],
  },
  { ...agent_room, added: '2026-10-30', build: BUILDS['agent-room'] },
  {
    ...container_per_thread,
    added: '2026-10-30',
    build: BUILDS['container-per-thread'],
    evalAll: EVALS['container-per-thread'],
  },
  {
    ...person_with_computer,
    added: '2026-10-30',
    build: BUILDS['person-with-computer'],
    evalAll: EVALS['person-with-computer'],
  },
  {
    ...shared_container,
    added: '2026-10-30',
    build: BUILDS['shared-container'],
    evalAll: EVALS['shared-container'],
  },
  { ...sealed_box, added: '2026-10-30', build: BUILDS['sealed-box'], evalAll: EVALS['sealed-box'] },
  {
    ...self_editing_app,
    added: '2026-10-30',
    build: BUILDS['self-editing-app'],
    evalAll: EVALS['self-editing-app'],
  },
  {
    ...git_gatekeeper,
    added: '2026-11-03',
    build: BUILDS['git-gatekeeper'],
    evalAll: EVALS['git-gatekeeper'],
  },
  { ...gadget_workspace, added: '2026-11-04', build: BUILDS['gadget-workspace'] },
  { ...egress_filter, added: '2026-11-06', build: BUILDS['egress-filter'] },
  { ...snapshot_rollback, added: '2026-11-06', build: BUILDS['snapshot-rollback'] },
  { ...scheduled_agent, added: '2026-11-06', build: BUILDS['scheduled-agent'] },
  { ...flight_recorder, added: '2026-11-06', build: BUILDS['flight-recorder'] },
  { ...safe_sql, added: '2026-11-06', build: BUILDS['safe-sql'] },
  { ...workflow_plan, added: '2026-11-06', build: BUILDS['workflow-plan'] },
  { ...vector_memory, added: '2026-11-06', build: BUILDS['vector-memory'] },
  { ...self_observe, added: '2026-10-30', build: BUILDS['self-observe'], evalAll: EVALS['self-observe'] },
];
