import { fileTask, runPiSmoke } from '../kit/pi-smoke.ts';
import { type Client, pause } from '../kit/smoke.ts';

const TAIL_WAIT_TRIES = 20;

const field = (value: unknown, key: string) =>
  typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;

const flight = async (api: Client, agent: string) => {
  let last: unknown = {};
  for (let attempt = 0; attempt < TAIL_WAIT_TRIES; attempt++) {
    last = (await api.raw('GET', `/flight?agent=${agent}`)).json;
    const pi = Number(field(last, 'piToolCalls'));
    if (pi > 0 && Number(field(last, 'recordedCalls')) >= pi) break;
    await pause(3000);
  }
  return {
    piToolCalls: Number(field(last, 'piToolCalls')),
    recordedCalls: Number(field(last, 'recordedCalls')),
    piTools: String(field(last, 'piTools')),
    recordedTools: String(field(last, 'recordedTools')),
    traces: Number(field(last, 'traces')),
    agentHasRecorder: field(last, 'agentHasRecorder') === true,
  };
};

await runPiSmoke({
  slug: 'flight-recorder',
  restartAfterMs: 6000,
  task: fileTask,
  afterTask: flight,
  infrastructure: (probe) => ({
    ok:
      Number(probe.piToolCalls) > 0 &&
      Number(probe.recordedCalls) === Number(probe.piToolCalls) &&
      probe.agentHasRecorder === false,
    claim: `Pi made ${String(probe.piToolCalls)} tool calls (${String(probe.piTools)}). A separate Tail Worker, which the agent cannot reach or write to, recorded ${String(probe.recordedCalls)} of them from ${String(probe.traces)} traces.`,
  }),
});
