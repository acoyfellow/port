import { fileTask, runPiSmoke } from '../kit/pi-smoke.ts';

await runPiSmoke({
  slug: 'shared-container',
  task: fileTask,
  infrastructure: (probe) => ({
    ok: probe.user === `agent${String(probe.seat)}` && probe.neighbourDenied === true,
    claim: `The tools ran in the shared container as Unix user ${String(probe.user)}; reading ${String(probe.neighbour)} was denied.`,
  }),
});
