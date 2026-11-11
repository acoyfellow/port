import { fileTask, runPiSmoke } from '../kit/pi-smoke.ts';

await runPiSmoke({
  slug: 'nix-git',
  task: fileTask,
  infrastructure: (probe) => {
    const ok =
      Number(probe.forcePushForms) === 6 &&
      Number(probe.forcePushRefused) === 6 &&
      probe.normalPush === 'ok' &&
      probe.remote === 'unchanged' &&
      probe.gitIsNix === true;
    return {
      ok,
      claim: `The agent's container runs a git built by Nix (${String(probe.gitStorePath)}, patch sha256 ${String(probe.patchSha256).slice(0, 12)}). ${String(probe.forcePushRefused)} of ${String(probe.forcePushForms)} forms of force push were refused (${String(probe.refusedForms)}), the remote branch was ${String(probe.remote)}, and a normal push was ${probe.normalPush === 'ok' ? 'accepted' : 'refused'}.`,
    };
  },
});
