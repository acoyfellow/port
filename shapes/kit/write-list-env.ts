import type { Context } from '@earendil-works/chord/context';
import { type ExecutionEnv, err, FileError } from '@earendil-works/pi-durable/env';

export type WriteRule = { readonly allowed: readonly string[] };

export type Refusal = { readonly path: string; readonly operation: string; readonly at: number };

export type RefusalLog = {
  readonly record: (refusal: Refusal) => void;
  readonly list: () => readonly Refusal[];
};

const normalize = (path: string) => {
  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return `/${parts.join('/')}`;
};

const matches = (path: string, pattern: string) =>
  pattern.endsWith('/**')
    ? path === pattern.slice(0, -3) || path.startsWith(pattern.slice(0, -2))
    : path === pattern;

const ALWAYS_WRITABLE = ['/tmp/**'];

const absoluteOf = (cwd: string, path: string) => {
  const plain = path.startsWith('file://') ? decodeURIComponent(new URL(path).pathname) : path;
  return normalize(plain.startsWith('/') ? plain : `${cwd}/${plain}`);
};

export const writeAllowed = (rule: WriteRule, cwd: string, path: string) => {
  const absolute = absoluteOf(cwd, path);
  return [...rule.allowed, ...ALWAYS_WRITABLE].some((pattern) => matches(absolute, absoluteOf(cwd, pattern)));
};

const snapshot = async (env: ExecutionEnv, context: Context) => {
  const files = new Map<string, Uint8Array>();
  const walk = async (dir: string) => {
    const listing = await env.listDir(dir, context);
    if (!listing.ok) return;
    for (const entry of listing.value) {
      if (entry.kind === 'directory') await walk(entry.path);
      if (entry.kind !== 'file') continue;
      const bytes = await env.readBinaryFile(entry.path, context);
      if (bytes.ok) files.set(entry.path, bytes.value);
    }
  };
  await walk(env.cwd);
  return files;
};

const same = (left: Uint8Array, right: Uint8Array) =>
  left.length === right.length && left.every((byte, index) => byte === right[index]);

export const sqliteRefusalLog = (sql: SqlStorage): RefusalLog => {
  sql.exec('CREATE TABLE IF NOT EXISTS write_refusals (at INTEGER, operation TEXT, path TEXT)');
  return {
    record: (refusal) =>
      sql.exec(
        'INSERT INTO write_refusals (at, operation, path) VALUES (?, ?, ?)',
        refusal.at,
        refusal.operation,
        refusal.path,
      ),
    list: () =>
      sql
        .exec<{ at: number; operation: string; path: string }>(
          'SELECT at, operation, path FROM write_refusals ORDER BY at',
        )
        .toArray(),
  };
};

const refused = (log: RefusalLog, operation: string, path: string) => {
  log.record({ path, operation, at: Date.now() });
  return err<never, FileError>(
    new FileError('permission_denied', `Write refused: ${path} is not on this session's write list`, path),
  );
};

export const withWriteList = (inner: ExecutionEnv, rule: WriteRule, log: RefusalLog): ExecutionEnv => {
  const allowed = (path: string) => writeAllowed(rule, inner.cwd, path);
  const guarded: Partial<ExecutionEnv> = {
    writeFile: async (path, content, context: Context) =>
      allowed(path) ? inner.writeFile(path, content, context) : refused(log, 'write', path),
    appendFile: async (path, content, context: Context) =>
      allowed(path) ? inner.appendFile(path, content, context) : refused(log, 'append', path),
    truncateFile: async (path, size, context: Context) =>
      allowed(path) ? inner.truncateFile(path, size, context) : refused(log, 'truncate', path),
    renameFile: async (from, to, context: Context) =>
      allowed(from) && allowed(to)
        ? inner.renameFile(from, to, context)
        : refused(log, 'rename', allowed(from) ? to : from),
    remove: async (path, options, context: Context) =>
      allowed(path) ? inner.remove(path, options, context) : refused(log, 'remove', path),
    exec: async (command, options, context: Context) => {
      const before = await snapshot(inner, context);
      const result = await inner.exec(command, options, context);
      const after = await snapshot(inner, context);
      for (const [path, bytes] of after) {
        const old = before.get(path);
        if (allowed(path) || (old !== undefined && same(old, bytes))) continue;
        log.record({ path, operation: 'shell', at: Date.now() });
        if (old === undefined) await inner.remove(path, { force: true }, context);
        else await inner.writeFile(path, old, context);
      }
      for (const [path, old] of before)
        if (!after.has(path) && !allowed(path)) {
          log.record({ path, operation: 'shell', at: Date.now() });
          await inner.writeFile(path, old, context);
        }
      return result;
    },
  };
  return new Proxy(inner, {
    get: (target, key, receiver) => {
      const replacement = typeof key === 'string' ? Reflect.get(guarded, key) : undefined;
      if (replacement !== undefined) return replacement;
      const value = Reflect.get(target, key, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
};
