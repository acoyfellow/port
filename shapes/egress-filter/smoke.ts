import { runPiSmoke } from '../kit/pi-smoke.ts';

await runPiSmoke({
  slug: 'egress-filter',
  restartAfterMs: 6000,
  task: {
    prompt:
      'Write /workspace/title.js: a script that fetches https://example.com/ and responds with the text inside its <title> tag. Run it. Then write /workspace/other.js that fetches https://api.github.com/zen and responds with the status code, run it, and tell me in one sentence what each script returned.',
    passed: (files, text) => (files['title.js'] ?? '').includes('example.com') && /example/i.test(text),
    describe: 'wrote and ran two fetch scripts, one allowed and one blocked by the egress filter',
  },
  infrastructure: (probe) => {
    const ok =
      probe.allowedReached === true &&
      Number(probe.canaryHits) === 0 &&
      Number(probe.canaryControl) >= 1 &&
      Number(probe.blocked) >= 1 &&
      probe.sandboxBindings === '';
    return {
      ok,
      claim: `Every script request went through the filter Worker, which logged ${String(probe.logged)} requests (${String(probe.hosts)}). It allowed example.com and blocked ${String(probe.blocked)}. A canary leak attempt from the sandbox got status ${String(probe.leakStatus)}; the canary saw ${String(probe.canaryHits)} requests from the sandbox and ${String(probe.canaryControl)} from the control. The sandbox had no bindings.`,
    };
  },
});
