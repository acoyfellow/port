import type { Context } from '@earendil-works/chord/context';
import { describe, expect, it } from 'vitest';
import { type FileStore, MemoryExecutionEnv } from '../memory-env.ts';
import { type Refusal, type RefusalLog, withWriteList, writeAllowed } from '../write-list-env.ts';

const context: Context = {};

const memoryStore = (seed: Record<string, string>): FileStore => {
  const files = new Map<string, Uint8Array>(
    Object.entries(seed).map(([path, text]) => [path, new TextEncoder().encode(text)]),
  );
  return {
    load: () => Object.fromEntries(files),
    save: (path, bytes) => (bytes === undefined ? files.delete(path) : files.set(path, bytes)),
  };
};

const memoryLog = (): RefusalLog & { readonly all: Refusal[] } => {
  const all: Refusal[] = [];
  return { all, record: (refusal) => all.push(refusal), list: () => all };
};

const rule = { allowed: ['src/**', 'NOTES.md'] };

const guarded = () => {
  const inner = new MemoryExecutionEnv({
    id: 'write-list-test',
    cwd: '/work',
    store: memoryStore({ '/work/README.md': 'keep\n', '/work/src/a.js': 'old\n' }),
  });
  const log = memoryLog();
  return { env: withWriteList(inner, rule, log), log };
};

const text = async (env: ReturnType<typeof guarded>['env'], path: string) => {
  const read = await env.readTextFile(path, context);
  return read.ok ? read.value : undefined;
};

describe('write list', () => {
  it('matches folders, single files and relative paths', () => {
    expect(writeAllowed(rule, '/work', 'src/deep/x.js')).toBe(true);
    expect(writeAllowed(rule, '/work', '/work/NOTES.md')).toBe(true);
    expect(writeAllowed(rule, '/work', 'README.md')).toBe(false);
    expect(writeAllowed(rule, '/work', 'src/../README.md')).toBe(false);
    expect(writeAllowed(rule, '/work', '/tmp/scratch')).toBe(true);
  });

  it('refuses and counts a write outside the list, and allows one inside', async () => {
    const { env, log } = guarded();
    const outside = await env.writeFile('README.md', 'changed', context);
    const inside = await env.writeFile('src/a.js', 'new', context);
    expect(outside.ok).toBe(false);
    expect(inside.ok).toBe(true);
    expect(await text(env, 'README.md')).toBe('keep\n');
    expect(await text(env, 'src/a.js')).toBe('new');
    expect(log.all.map((each) => each.path)).toEqual(['README.md']);
  });

  it('undoes a shell write outside the list and keeps one inside', async () => {
    const { env, log } = guarded();
    await env.exec(
      'echo changed > README.md && echo made > extra.txt && echo ok > src/b.js',
      undefined,
      context,
    );
    expect(await text(env, 'README.md')).toBe('keep\n');
    expect(await text(env, 'extra.txt')).toBeUndefined();
    expect(await text(env, 'src/b.js')).toBe('ok\n');
    expect(log.all.map((each) => each.path).sort()).toEqual(['/work/README.md', '/work/extra.txt']);
  });

  it('refuses a rename that moves a file out of the list', async () => {
    const { env, log } = guarded();
    const moved = await env.renameFile('src/a.js', 'a.js', context);
    expect(moved.ok).toBe(false);
    expect(log.all).toHaveLength(1);
  });
});
