import { fileTask, runPiSmoke } from '../kit/pi-smoke.ts';

await runPiSmoke({
  slug: 'chat-with-sandbox',
  task: fileTask,
  infrastructure: (probe) => ({
    ok: typeof probe.boot === 'string' && probe.boot.length > 0,
    claim: `The tools ran in this chat's own sandbox container, internet off (boot ${String(probe.boot).slice(0, 8)}).`,
  }),
});
