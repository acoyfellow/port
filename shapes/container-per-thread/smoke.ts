import { fileTask, runPiSmoke } from '../kit/pi-smoke.ts';

await runPiSmoke({
  slug: 'container-per-thread',
  task: fileTask,
  infrastructure: (probe) => ({
    ok: typeof probe.boot === 'string' && probe.boot.length > 0,
    claim: `The tools ran in this thread's own container (boot ${String(probe.boot).slice(0, 8)}).`,
  }),
});
