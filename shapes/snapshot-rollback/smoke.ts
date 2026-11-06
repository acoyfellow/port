import { runPiSmoke } from '../kit/pi-smoke.ts';
import type { Client } from '../kit/smoke.ts';

const CHECKPOINT = 'tests-pass';

const field = (value: unknown, key: string) =>
  typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;

const lab = async (api: Client, agent: string, step: string) =>
  (await api.raw('GET', `/lab/${step}?agent=${agent}&name=${CHECKPOINT}`)).json;

const breakAndRestore = async (api: Client, agent: string) => {
  const checkpoint = await lab(api, agent, 'checkpoint');
  const expected = field(checkpoint, 'fingerprint');
  if (typeof expected !== 'string')
    return { snapshotError: `no "${CHECKPOINT}" checkpoint: ${JSON.stringify(checkpoint)}` };
  const broken = await lab(api, agent, 'break');
  const restored = await lab(api, agent, 'rollback');
  return {
    expectedFingerprint: expected,
    expectedFiles: Number(field(checkpoint, 'files')),
    snapshotMs: Number(field(checkpoint, 'ms')),
    snapshotKb: Math.round(Number(field(checkpoint, 'bytes')) / 1024),
    brokenFingerprint: String(field(broken, 'fingerprint')),
    brokenBeforeRestore: field(broken, 'fingerprint') !== expected && Number(field(broken, 'files')) === 1,
    restoredFingerprint: String(field(restored, 'fingerprint')),
    restoredFiles: Number(field(restored, 'files')),
    restoredMatches: field(restored, 'fingerprint') === expected,
    freshContainer:
      typeof field(restored, 'before') === 'string' &&
      field(restored, 'before') !== '' &&
      field(restored, 'before') !== field(restored, 'after'),
    restoreMs: Number(field(restored, 'ms')),
  };
};

await runPiSmoke({
  slug: 'snapshot-rollback',
  restartAfterMs: 15000,
  task: {
    prompt: `In /workspace, write stats.py with a function mean(values) and a function median(values), and test_stats.py with at least four plain assert-based tests run by "python3 test_stats.py". Run the tests until they pass. Then call save_checkpoint with the name "${CHECKPOINT}" and reply with one short sentence.`,
    passed: (files) =>
      (files['stats.py'] ?? '').includes('def median') && (files['test_stats.py'] ?? '').includes('assert'),
    describe: 'wrote and tested stats.py and saved a checkpoint of /workspace',
  },
  afterTask: breakAndRestore,
  infrastructure: (probe) => ({
    ok:
      Number(probe.snapshots) >= 1 &&
      probe.brokenBeforeRestore === true &&
      probe.restoredMatches === true &&
      probe.freshContainer === true,
    claim: `Pi saved checkpoint "${CHECKPOINT}" (${String(probe.expectedFiles)} files, ${String(probe.snapshotKb)} KB in the Durable Object, ${String(probe.snapshotMs)} ms). The test then deleted every file in /workspace; the rollback threw the container away, started a fresh one and unpacked the checkpoint in ${String(probe.restoreMs)} ms. The restored files hash to ${String(probe.restoredFingerprint)}, the same as the checkpoint.`,
  }),
});
