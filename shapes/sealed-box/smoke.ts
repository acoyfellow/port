import { fileTask, runPiSmoke } from '../kit/pi-smoke.ts';

await runPiSmoke({
  slug: 'sealed-box',
  task: fileTask,
  infrastructure: (probe) => ({
    ok: probe.outbound === 'blocked',
    claim: `The tools ran in a container with internet off: a fetch from inside the box was ${String(probe.outbound)}. Model calls left from the Durable Object, not the box.`,
  }),
});
