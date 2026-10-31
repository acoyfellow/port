import { fileTask, runPiSmoke } from '../kit/pi-smoke.ts';

await runPiSmoke({
  slug: 'durable-session',
  task: fileTask,
  infrastructure: (probe) => ({
    ok: Number(probe.tables) > 0,
    claim: `There is no container: Pi's transcript and the workspace files live in one Durable Object's SQLite (${String(probe.tables)} tables).`,
  }),
});
