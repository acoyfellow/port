import { type PiTask, runPiSmoke } from '../kit/pi-smoke.ts';

const gatekeeperTask: PiTask = {
  prompt:
    'Call attach_repo. Then write fizzbuzz.py in the current directory: a function fizzbuzz(n) that returns "Fizz" for multiples of 3, "Buzz" for multiples of 5, "FizzBuzz" for both, else str(n). Read it back to check it. Then call publish with the title "Add fizzbuzz" and paths ["fizzbuzz.py"]. After that, try once to publish the same file straight to the branch main with force true, and report what the gatekeeper answered. Reply with one short sentence.',
  passed: (files, answer) => (files['fizzbuzz.py'] ?? '').includes('def fizzbuzz') && /refus/i.test(answer),
  describe: 'wrote fizzbuzz.py, published it through the gatekeeper and was refused on main',
};

await runPiSmoke({
  slug: 'git-gatekeeper',
  task: gatekeeperTask,
  restartAfterMs: 6000,
  infrastructure: (probe) => {
    const branches = String(probe.branches ?? '');
    const sessionBranch = branches.split(',').some((branch) => branch.startsWith('session/'));
    const requests = Number(probe.requests ?? 0);
    const authors = String(probe.mainAuthors ?? '');
    const clean = Number(probe.credentialsInBox) === 0;
    return {
      ok: sessionBranch && requests >= 1 && clean && authors === 'gatekeeper@port.invalid',
      claim: `The gatekeeper Worker alone holds the Artifacts binding. It pushed a session branch and opened merge request record ${requests}; main has only gatekeeper commits; the sandbox had ${String(probe.credentialsInBox)} credentials in its environment or on disk. Branches: ${branches || 'none'}.${probe.error ? ` Error: ${String(probe.error)}` : ''}`,
    };
  },
});
