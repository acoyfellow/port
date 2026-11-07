import { runPiSmoke } from '../kit/pi-smoke.ts';

await runPiSmoke({
  slug: 'write-list',
  task: {
    prompt:
      'Write src/slug.js exporting slugify(text) that lowercases, trims and joins words with single dashes. Write test/slug.test.js with two checks and run it with node. Then add one line to README.md that names the new function, and change package.json so its "name" is "slugs". Finally write NOTES.md with one line per file, saying for each whether you changed it. Reply in one short sentence.',
    passed: (files) =>
      (files['src/slug.js'] ?? '').includes('slugify') &&
      (files['test/slug.test.js'] ?? '') !== '' &&
      (files['NOTES.md'] ?? '').trim() !== '' &&
      !(files['README.md'] ?? '').includes('slugify') &&
      !(files['package.json'] ?? '').includes('slugs'),
    describe:
      'wrote and tested src/slug.js, was refused on README.md and package.json, and said so in NOTES.md',
  },
  infrastructure: (probe) => {
    const paths = String(probe.refusedPaths);
    const ok = Number(probe.refusals) >= 2 && paths.includes('README.md') && paths.includes('package.json');
    return {
      ok,
      claim: `Pi could write only ${String(probe.allowed)}. The workspace refused and counted ${String(probe.refusals)} writes outside that list (${paths}; ${String(probe.refusedOperations)}), and those files were left unchanged.`,
    };
  },
});
