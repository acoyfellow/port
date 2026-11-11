import { type AgentEnv, piAgent } from '../../kit/agent.ts';
import { boxBoot, containerEnv, runInBox } from '../../kit/container-env.ts';
import { piRouter } from '../../kit/router.ts';

type Env = AgentEnv & { readonly BOX: DurableObjectNamespace<Box> };

const SLUG = 'nix-git';
const BOX_OPTIONS = { internet: true } as const;
const REMOTE = '/tmp/remote.git';

const FORCE_FORMS: readonly (readonly [string, string])[] = [
  ['--force', 'git push --force origin HEAD:main'],
  ['-f', 'git push -f origin HEAD:main'],
  ['--force-with-lease', 'git push --force-with-lease origin HEAD:main'],
  ['+refspec', 'git push origin +HEAD:main'],
  ['+refspec in config', 'git -c remote.origin.push=+HEAD:main push origin'],
  ['--mirror', 'git push --mirror origin'],
];

const quote = (text: string) => `'${text.replaceAll("'", "'\\''")}'`;

const forcePushProbe = (workspace: string) =>
  [
    'set -u',
    `rm -rf ${REMOTE} /tmp/probe-clone`,
    `git init -q --bare ${REMOTE}`,
    `cd ${quote(workspace)}`,
    'git init -q -b main 2>/dev/null || true',
    'git -c user.email=a@b -c user.name=a commit -q --allow-empty -m base',
    `git remote remove origin 2>/dev/null; git remote add origin ${REMOTE}`,
    'git push -q origin HEAD:main',
    'git -c user.email=a@b -c user.name=a commit -q --allow-empty -m ahead',
    'git push -q origin HEAD:main && echo NORMAL_PUSH=ok || echo NORMAL_PUSH=refused',
    `remote_head=$(git --git-dir=${REMOTE} rev-parse main)`,
    'git reset -q --hard HEAD~1',
    'git -c user.email=a@b -c user.name=a commit -q --allow-empty -m rewrite',
    ...FORCE_FORMS.map(
      ([label, command]) =>
        `if ${command} >/dev/null 2>&1; then echo ${quote(`FORCE ${label}=accepted`)}; else echo ${quote(`FORCE ${label}=refused`)}; fi`,
    ),
    `test "$(git --git-dir=${REMOTE} rev-parse main)" = "$remote_head" && echo REMOTE=unchanged || echo REMOTE=moved`,
    'echo GIT_BIN=$(readlink -f "$(command -v git)")',
    'cat /nix-git.json',
  ].join('\n');

const parseProbe = (stdout: string) => {
  const lines = stdout.split('\n');
  const forms = lines.filter((line) => line.startsWith('FORCE '));
  const refused = forms.filter((line) => line.endsWith('=refused')).length;
  const value = (key: string) =>
    lines.find((line) => line.startsWith(`${key}=`))?.slice(key.length + 1) ?? '';
  const manifestLine = lines.find((line) => line.startsWith('{')) ?? '{}';
  const manifest: unknown = JSON.parse(manifestLine);
  const gitStorePath = String(Reflect.get(Object(manifest), 'git_store_path') ?? '');
  return {
    forcePushForms: forms.length,
    forcePushRefused: refused,
    refusedForms: forms.map((line) => line.slice(6)).join(', '),
    normalPush: value('NORMAL_PUSH'),
    remote: value('REMOTE'),
    gitBin: value('GIT_BIN'),
    gitStorePath,
    gitIsNix: gitStorePath.startsWith('/nix/store/') && value('GIT_BIN').startsWith(gitStorePath),
    patchSha256: String(Reflect.get(Object(manifest), 'patch_sha256') ?? ''),
  };
};

export class Box extends piAgent<Env>({
  name: SLUG,
  instructions:
    'You are a coding agent with your own Linux computer: a shell, git, Python, Node and a disk in /workspace. The git on this computer was built so that it cannot force-push; a normal push works. Use the tools to do the work, check it, then reply in one short sentence.',
  environment: (_env, ctx) => containerEnv(ctx, `nix-git:${ctx.id.toString()}`, BOX_OPTIONS),
  probe: async (_env, ctx) => {
    const boot = await boxBoot(ctx, BOX_OPTIONS);
    const env = containerEnv(ctx, `nix-git-probe:${ctx.id.toString()}`, BOX_OPTIONS);
    const result = await runInBox(env, ['bash', '-c', forcePushProbe('/tmp/probe-clone')], 60);
    return { facts: { boot, ...parseProbe(result.output) } };
  },
}) {}

export default piRouter<Env>({
  shape: SLUG,
  agent: (env, name) => env.BOX.get(env.BOX.idFromName(name)),
  gateway: (env) => env.GATEWAY,
});
