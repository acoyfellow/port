import { runPiSmoke } from '../kit/pi-smoke.ts';

const SEED = {
  'README.md': '# text helpers\n\nThree small helpers live in src/. Each has a test in test/.\n',
  'package.json': '{ "name": "text-helpers", "type": "module" }\n',
};

await runPiSmoke({
  slug: 'beam-space',
  restartAfterMs: 20000,
  task: {
    prompt: `Build three helpers, one per worker thread, each in its own file with a node:test test next to it in test/:
1. src/slug.js exporting slugify(text): lowercase, trim, words joined by single dashes.
2. src/initials.js exporting initials(name): the first letter of each word, upper case.
3. src/clamp.js exporting clamp(n, lo, hi).
Start a checker thread for each worker that reads the worker's files, runs its test and reports pass or fail. Adopt the files of each worker whose checker passed it, save a summary, and reply in one sentence.`,
    passed: (files) =>
      (files['src/slug.js'] ?? '').includes('slugify') &&
      (files['src/initials.js'] ?? '').includes('initials') &&
      (files['src/clamp.js'] ?? '').includes('clamp'),
    describe:
      'coordinated three worker threads and three checker threads that built and checked three helpers',
  },
  seedFiles: SEED,
  infrastructure: (probe) => {
    const ok =
      Number(probe.workers) === 3 &&
      Number(probe.checkers) >= 3 &&
      Number(probe.repeatedWorkers) === 0 &&
      Number(probe.restartedThreads) === 0 &&
      String(probe.sharedFiles).includes('src/clamp.js') &&
      String(probe.summary).trim() !== '';
    return {
      ok,
      claim: `The coordinator, restarted mid-job, started ${String(probe.workers)} worker threads and ${String(probe.checkers)} checker threads (${String(probe.names)}), each a Pi agent whose tools ran as its own Unix user under a Gleam supervisor. After the restart it reused the threads it had started: ${String(probe.restartedThreads)} threads were started twice and ${String(probe.repeatedWorkers)} workers repeated a part. ${String(probe.done)} of ${String(probe.threads)} threads finished. The checked files were adopted into the space (${String(probe.sharedFiles)}) and the summary was saved.`,
    };
  },
});
