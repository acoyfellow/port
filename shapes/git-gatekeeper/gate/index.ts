import { WorkerEntrypoint } from 'cloudflare:workers';
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import { createFsFromVolume, Volume } from 'memfs';

export type GatekeeperEnv = { readonly REPOS: Artifacts };

export type Publication = {
  readonly repo: string;
  readonly branch: string;
  readonly commit: string;
  readonly request: number;
  readonly reused: boolean;
};

export type Refusal = { readonly refused: string };

const PROTECTED = new Set(['main', 'master', 'HEAD']);
const BRANCH = /^session\/[a-z0-9-]{1,64}$/;
const REPO = /^[a-z0-9][a-z0-9-]{1,62}$/;
const AUTHOR = { name: 'port gatekeeper', email: 'gatekeeper@port.invalid' };
const TOKEN_SECONDS = 600;
const DIR = '/repo';
const READY_TRIES = 3;
const READY_WAIT_MS = 5000;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const CALL_MS = 15_000;

const bounded = <T>(label: string, work: Promise<T>) =>
  Promise.race([
    work,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} took over ${CALL_MS} ms`)), CALL_MS),
    ),
  ]);

const bearer = (token: string) => () => ({ headers: { authorization: `Bearer ${token}` } });

const memoryFs = () => createFsFromVolume(new Volume());

type Fs = ReturnType<typeof memoryFs>;

const ensureDir = async (fs: Fs, path: string) => {
  const parent = path.slice(0, path.lastIndexOf('/'));
  if (parent !== '' && parent !== DIR) await fs.promises.mkdir(parent, { recursive: true });
};

const writeTree = async (fs: Fs, files: Readonly<Record<string, string>>) => {
  for (const [path, text] of Object.entries(files)) {
    const full = `${DIR}/${path}`;
    await ensureDir(fs, full);
    await fs.promises.writeFile(full, text);
    await git.add({ fs, dir: DIR, filepath: path });
  }
};

const safePath = (path: string) =>
  path !== '' && !path.startsWith('/') && !path.split('/').some((part) => part === '..' || part === '.git');

const requestsOf = async (fs: Fs) => {
  const text = await fs.promises.readFile(`${DIR}/.port/requests.json`, 'utf8').catch(() => '[]');
  const parsed: unknown = JSON.parse(String(text));
  return Array.isArray(parsed)
    ? parsed.filter(
        (each): each is { readonly n: number; readonly branch: string; readonly title: string } =>
          typeof each === 'object' && each !== null && typeof Reflect.get(each, 'n') === 'number',
      )
    : [];
};

export class Gatekeeper extends WorkerEntrypoint<GatekeeperEnv> {
  async attach(repo: string): Promise<{ readonly files: Record<string, string> } | Refusal> {
    if (!REPO.test(repo)) return { refused: `repo name must match ${REPO.source}` };
    const handle = await this.#repo(repo, true);
    const token = await handle.createToken('read', TOKEN_SECONDS);
    const fs = memoryFs();
    try {
      await git.clone({
        fs,
        http,
        dir: DIR,
        url: handle.remote,
        onAuth: bearer(token.plaintext),
        depth: 1,
        singleBranch: true,
      });
    } catch {
      return { files: {} };
    } finally {
      await handle.revokeToken(token.id);
    }
    const files: Record<string, string> = {};
    for (const path of await git.listFiles({ fs, dir: DIR })) {
      if (path.startsWith('.port/')) continue;
      files[path] = String(await fs.promises.readFile(`${DIR}/${path}`, 'utf8'));
    }
    return { files };
  }

  async publish(input: {
    readonly repo: string;
    readonly session: string;
    readonly title: string;
    readonly files: Readonly<Record<string, string>>;
    readonly branch?: string;
    readonly force?: boolean;
  }): Promise<Publication | Refusal> {
    const branch = input.branch ?? `session/${input.session}`;
    if (input.force === true) return { refused: 'the gatekeeper never force-pushes' };
    if (PROTECTED.has(branch)) return { refused: `the gatekeeper never pushes to ${branch}` };
    if (!BRANCH.test(branch)) return { refused: `branch must match ${BRANCH.source}` };
    if (!REPO.test(input.repo)) return { refused: `repo name must match ${REPO.source}` };
    const unsafe = Object.keys(input.files).find((path) => !safePath(path));
    if (unsafe !== undefined) return { refused: `path not allowed: ${unsafe}` };

    const handle = await this.#repo(input.repo, true);
    const token = await handle.createToken('write', TOKEN_SECONDS);
    const onAuth = bearer(token.plaintext);
    const fs = memoryFs();
    try {
      const remoteRefs = await git.listServerRefs({ http, url: handle.remote, onAuth }).catch(() => []);
      const hasMain = remoteRefs.some((ref) => ref.ref === 'refs/heads/main');
      const hasBranch = remoteRefs.some((ref) => ref.ref === `refs/heads/${branch}`);
      if (hasMain) {
        await git.clone({
          fs,
          http,
          dir: DIR,
          url: handle.remote,
          onAuth,
          ref: hasBranch ? branch : 'main',
          singleBranch: true,
        });
        if (!hasBranch) await git.branch({ fs, dir: DIR, ref: branch, checkout: true });
      } else {
        await fs.promises.mkdir(DIR, { recursive: true });
        await git.init({ fs, dir: DIR, defaultBranch: 'main' });
        await fs.promises.writeFile(`${DIR}/README.md`, `# ${input.repo}\n`);
        await git.add({ fs, dir: DIR, filepath: 'README.md' });
        await git.commit({ fs, dir: DIR, message: 'Start the repo', author: AUTHOR });
        await git.addRemote({ fs, dir: DIR, remote: 'origin', url: handle.remote });
        await git.push({ fs, http, dir: DIR, remote: 'origin', ref: 'main', onAuth });
        await git.branch({ fs, dir: DIR, ref: branch, checkout: true });
      }

      await writeTree(fs, input.files);
      const commit = await git.commit({ fs, dir: DIR, message: input.title, author: AUTHOR });
      const pushed = await git.push({ fs, http, dir: DIR, remote: 'origin', ref: branch, onAuth });
      if (!pushed.ok) return { refused: `push failed: ${JSON.stringify(pushed.refs)}` };

      await git.checkout({ fs, dir: DIR, ref: 'main', force: true });
      const requests = await requestsOf(fs);
      const open = requests.find((each) => each.branch === branch);
      const request = open?.n ?? requests.reduce((max, each) => Math.max(max, each.n), 0) + 1;
      if (open === undefined) {
        await fs.promises.mkdir(`${DIR}/.port`, { recursive: true });
        await fs.promises.writeFile(
          `${DIR}/.port/requests.json`,
          `${JSON.stringify([...requests, { n: request, branch, title: input.title }], null, 2)}\n`,
        );
        await git.add({ fs, dir: DIR, filepath: '.port/requests.json' });
        await git.commit({
          fs,
          dir: DIR,
          message: `Open merge request !${request} for ${branch}`,
          author: AUTHOR,
        });
        await git.push({ fs, http, dir: DIR, remote: 'origin', ref: 'main', onAuth });
      }
      return { repo: input.repo, branch, commit, request, reused: open !== undefined };
    } finally {
      await handle.revokeToken(token.id);
    }
  }

  async inspect(repo: string) {
    const handle = await this.#repo(repo, false);
    const token = await handle.createToken('read', TOKEN_SECONDS);
    const onAuth = bearer(token.plaintext);
    try {
      const refs = await git.listServerRefs({ http, url: handle.remote, onAuth });
      const fs = memoryFs();
      await git.clone({ fs, http, dir: DIR, url: handle.remote, onAuth, ref: 'main', singleBranch: true });
      const mainLog = await git.log({ fs, dir: DIR, depth: 20 });
      return {
        branches: refs.filter((ref) => ref.ref.startsWith('refs/heads/')).map((ref) => ref.ref.slice(11)),
        requests: await requestsOf(fs),
        mainAuthors: [...new Set(mainLog.map((entry) => entry.commit.author.email))],
        mainCommits: mainLog.length,
      };
    } finally {
      await handle.revokeToken(token.id);
    }
  }

  async remove(repo: string) {
    return this.env.REPOS.delete(repo).catch(() => false);
  }

  async #repo(name: string, create: boolean) {
    const { handle, info } = await this.#handle(name, create);
    return {
      remote: info.remote,
      createToken: (scope: 'read' | 'write', ttl: number) => handle.createToken(scope, ttl),
      revokeToken: (id: string) => handle.revokeToken(id),
    };
  }

  async #handle(name: string, _create: boolean) {
    const errors: string[] = [];
    for (let attempt = 0; attempt < READY_TRIES; attempt++) {
      const found = await this.#found(name).catch((error: unknown) => {
        errors.push(String(error));
        return undefined;
      });
      if (found !== undefined) return found;
      await pause(READY_WAIT_MS);
    }
    throw new Error(`repo ${name} is not available: ${errors.slice(-2).join(' | ')}`);
  }

  async #found(name: string) {
    const handle = await bounded('REPOS.get', this.env.REPOS.get(name));
    return { handle, info: await bounded('repo.info', handle.info()) };
  }
}

export default {
  fetch: () => new Response('not found', { status: 404 }),
};
