import { runPiSmoke } from '../kit/pi-smoke.ts';

const phrase = `hello from pi ${Date.now() % 10_000}`;

await runPiSmoke({
  slug: 'self-editing-app',
  task: {
    prompt: `Change /workspace/app.js so GET / answers with exactly the text "${phrase}". Keep /__check working. Then call ship_app.`,
    passed: (files) => (files['app.js'] ?? '').includes(phrase),
    describe: 'edited its own app and shipped a new version that passed the boot check',
  },
  infrastructure: (probe) => ({
    ok: Number(probe.live) > 1 && String(probe.text).trim() === phrase,
    claim: `Version ${String(probe.live)} went live only after it booted and passed /__check in a fresh Worker Loader isolate; it now answers "${String(probe.text).trim()}".`,
  }),
});
