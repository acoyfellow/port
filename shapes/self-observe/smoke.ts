import { runPiSmoke } from '../kit/pi-smoke.ts';

await runPiSmoke({
  slug: 'self-observe',
  task: {
    prompt:
      'Create src/clamp.ts exporting clamp(n: number, lo: number, hi: number): number, and test/clamp.test.ts with node:test tests. Run node --test, then use shrink on clamp with the property that the result is always between lo and hi when lo <= hi, and run mutate on src/clamp.ts.',
    passed: (files) => (files['src/clamp.ts'] ?? '').includes('clamp') && 'test/clamp.test.ts' in files,
    describe: 'wrote clamp with tests, then checked it with shrink and mutate in isolates',
  },
  infrastructure: (probe) => ({
    ok: Number(probe.probeRuns) > 0 && Number(probe.mutateRuns) > 0,
    claim: `Shrink, trace and mutate are Pi extension tools that run the agent's code in fresh Worker Loader isolates: ${String(probe.probeRuns)} shrink or trace runs and ${String(probe.mutateRuns)} mutate runs.`,
  }),
});
