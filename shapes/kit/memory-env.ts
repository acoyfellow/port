import type { Context } from '@earendil-works/chord/context';
import {
  type BinaryReader,
  type DirReader,
  type ExecutionEnv,
  ExecutionError,
  err,
  FileError,
  type FileErrorCode,
  type FileInfo,
  type FileWatcher,
  LineScanner,
  ok,
  type Result,
  type ShellExecOptions,
  type ShellExecResult,
  StreamDecoder,
  type TextLineReader,
} from '@earendil-works/pi-durable/env';
import { Bash, type Command, getCommandNames, InMemoryFs } from 'just-bash/browser';

export type FileStore = {
  readonly load: () => Record<string, Uint8Array>;
  readonly save: (path: string, bytes: Uint8Array | undefined) => void;
};

export type MemoryEnvOptions = {
  readonly id: string;
  readonly cwd: string;
  readonly store: FileStore;
  readonly commands?: readonly Command[];
};

const CODES: Record<string, FileErrorCode> = {
  ENOENT: 'not_found',
  ENOTDIR: 'not_directory',
  EISDIR: 'is_directory',
  EACCES: 'permission_denied',
  EPERM: 'permission_denied',
  EINVAL: 'invalid',
  ENOTEMPTY: 'invalid',
  EEXIST: 'invalid',
};

const fileError = (error: unknown, path: string) => {
  if (error instanceof FileError) return error;
  const message = error instanceof Error ? error.message : String(error);
  const code = CODES[message.split(':')[0] ?? ''] ?? 'unknown';
  return new FileError(code, message, path);
};

const aborted = (context: Context, path?: string) =>
  context.abortSignal?.aborted === true
    ? err<never, FileError>(new FileError('aborted', 'aborted', path))
    : undefined;

const normalize = (path: string) => {
  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return `/${parts.join('/')}`;
};

const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1);

const parentOf = (path: string) => {
  const cut = path.lastIndexOf('/');
  return cut <= 0 ? '/' : path.slice(0, cut);
};

const encoder = new TextEncoder();

export class MemoryExecutionEnv implements ExecutionEnv {
  readonly id: string;
  cwd: string;
  readonly #fs = new InMemoryFs();
  readonly #store: FileStore;
  readonly #commands: readonly Command[];
  readonly #running = new Set<AbortController>();
  #loaded = false;
  #temp = 0;

  constructor(options: MemoryEnvOptions) {
    this.id = options.id;
    this.cwd = normalize(options.cwd);
    this.#store = options.store;
    this.#commands = options.commands ?? [];
  }

  async #ready() {
    if (this.#loaded) return;
    this.#loaded = true;
    await this.#fs.mkdir(this.cwd, { recursive: true });
    for (const [path, bytes] of Object.entries(this.#store.load())) {
      await this.#fs.mkdir(parentOf(path), { recursive: true });
      await this.#fs.writeFile(path, bytes);
    }
  }

  #resolve(path: string) {
    const plain = path.startsWith('file://') ? decodeURIComponent(new URL(path).pathname) : path;
    return normalize(plain.startsWith('/') ? plain : `${this.cwd}/${plain}`);
  }

  async #persist(path: string) {
    const stat = await this.#fs.lstat(path).catch(() => undefined);
    if (stat === undefined) {
      for (const known of Object.keys(this.#store.load()))
        if (known === path || known.startsWith(`${path}/`)) this.#store.save(known, undefined);
      return;
    }
    if (stat.isFile) this.#store.save(path, await this.#fs.readFileBuffer(path));
    if (stat.isDirectory)
      for (const child of await this.#fs.readdir(path))
        await this.#persist(`${path === '/' ? '' : path}/${child}`);
  }

  async #persistAll() {
    const known = new Set(Object.keys(this.#store.load()));
    for (const path of this.#fs.getAllPaths()) {
      const stat = await this.#fs.lstat(path).catch(() => undefined);
      if (stat?.isFile !== true) continue;
      known.delete(path);
      this.#store.save(path, await this.#fs.readFileBuffer(path));
    }
    for (const gone of known) this.#store.save(gone, undefined);
  }

  async #info(path: string): Promise<Result<FileInfo, FileError>> {
    try {
      const stat = await this.#fs.lstat(path);
      const kind = stat.isSymbolicLink ? 'symlink' : stat.isDirectory ? 'directory' : 'file';
      return ok({ name: baseName(path), path, kind, size: stat.size, mtimeMs: stat.mtime.getTime() });
    } catch (error) {
      return err(fileError(error, path));
    }
  }

  async #attempt<A>(path: string, context: Context, run: () => Promise<A>): Promise<Result<A, FileError>> {
    const stop = aborted(context, path);
    if (stop !== undefined) return stop;
    await this.#ready();
    try {
      return ok(await run());
    } catch (error) {
      return err(fileError(error, path));
    }
  }

  async absolutePath(path: string, _context: Context) {
    return ok<string, FileError>(this.#resolve(path));
  }

  async joinPath(parts: string[], _context: Context) {
    return ok<string, FileError>(normalize(parts.join('/')));
  }

  async readTextFile(path: string, context: Context) {
    const resolved = this.#resolve(path);
    return this.#attempt(resolved, context, () => this.#fs.readFile(resolved, 'utf8'));
  }

  async readTextLines(path: string, options: { maxLines?: number } | undefined, context: Context) {
    const text = await this.readTextFile(path, context);
    if (!text.ok) return text;
    const lines = text.value.split('\n');
    if (lines.at(-1) === '') lines.pop();
    return ok<string[], FileError>(
      options?.maxLines === undefined ? lines : lines.slice(0, options.maxLines),
    );
  }

  async openTextLineReader(path: string, context: Context): Promise<Result<TextLineReader, FileError>> {
    const text = await this.readTextFile(path, context);
    if (!text.ok) return text;
    const lines = text.value.split('\n');
    const last = lines.pop();
    const queue = [
      ...lines.map((line) => ({ text: line, terminated: true })),
      ...(last === undefined || last === '' ? [] : [{ text: last, terminated: false }]),
    ];
    let closed = false;
    return ok({
      readLine: async (readContext) => {
        const stop = aborted(readContext, path);
        if (stop !== undefined) return stop;
        if (closed) return err(new FileError('invalid', 'Text line reader is closed', path));
        return ok(queue.shift());
      },
      close: async () => {
        closed = true;
      },
    });
  }

  async readBinaryFile(path: string, context: Context) {
    const resolved = this.#resolve(path);
    return this.#attempt(resolved, context, () => this.#fs.readFileBuffer(resolved));
  }

  async openBinaryReader(
    path: string,
    options: { noFollow?: boolean } | undefined,
    context: Context,
  ): Promise<Result<BinaryReader, FileError>> {
    const resolved = this.#resolve(path);
    const info = await this.#attempt(resolved, context, async () => {
      const stat = await this.#fs.lstat(resolved);
      if (stat.isSymbolicLink && options?.noFollow === true)
        throw new FileError('invalid', 'Refusing to follow a symbolic link', resolved);
      const target = await this.#fs.stat(resolved);
      if (target.isDirectory) throw new FileError('is_directory', 'Is a directory', resolved);
      return { bytes: await this.#fs.readFileBuffer(resolved), mtimeMs: target.mtime.getTime() };
    });
    if (!info.ok) return info;
    const { bytes, mtimeMs } = info.value;
    let closed = false;
    const guard = (readContext: Context) =>
      aborted(readContext, resolved) ??
      (closed
        ? err<never, FileError>(new FileError('invalid', 'Binary reader is closed', resolved))
        : undefined);
    return ok({
      info: async (readContext) =>
        guard(readContext) ??
        ok({ name: baseName(resolved), path: resolved, kind: 'file', size: bytes.length, mtimeMs }),
      read: async (offset, length, readContext) => {
        const stop = guard(readContext);
        if (stop !== undefined) return stop;
        if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 0)
          return err(
            new FileError('invalid', 'Offset and length must be non-negative safe integers', resolved),
          );
        return ok(bytes.slice(offset, offset + length));
      },
      scanLines: async (range, readContext) => {
        const stop = guard(readContext);
        if (stop !== undefined) return stop;
        try {
          const scanner = new LineScanner(range.startLine, range.endLine);
          scanner.push(bytes);
          return ok(scanner.finish());
        } catch {
          return err(new FileError('invalid', 'Invalid line range', resolved));
        }
      },
      close: async () => {
        closed = true;
      },
    });
  }

  async writeFile(path: string, content: string | Uint8Array, context: Context) {
    const resolved = this.#resolve(path);
    return this.#attempt(resolved, context, async () => {
      const parent = await this.#fs.stat(parentOf(resolved));
      if (!parent.isDirectory) throw new FileError('not_directory', 'Not a directory', resolved);
      await this.#fs.writeFile(resolved, content);
      await this.#persist(resolved);
    });
  }

  async appendFile(path: string, content: string | Uint8Array, context: Context) {
    const resolved = this.#resolve(path);
    return this.#attempt(resolved, context, async () => {
      await this.#fs.appendFile(resolved, content);
      await this.#persist(resolved);
    });
  }

  async truncateFile(path: string, size: number, context: Context) {
    const resolved = this.#resolve(path);
    return this.#attempt(resolved, context, async () => {
      const bytes = await this.#fs.readFileBuffer(resolved);
      const next = new Uint8Array(size);
      next.set(bytes.subarray(0, size));
      await this.#fs.writeFile(resolved, next);
      await this.#persist(resolved);
    });
  }

  async flushFile(path: string, context: Context) {
    const resolved = this.#resolve(path);
    return this.#attempt(resolved, context, async () => {
      await this.#fs.stat(resolved);
    });
  }

  async renameFile(sourcePath: string, destinationPath: string, context: Context) {
    const from = this.#resolve(sourcePath);
    const to = this.#resolve(destinationPath);
    return this.#attempt(from, context, async () => {
      await this.#fs.mv(from, to);
      await this.#persist(from);
      await this.#persist(to);
    });
  }

  async fileInfo(path: string, context: Context) {
    const resolved = this.#resolve(path);
    const stop = aborted(context, resolved);
    if (stop !== undefined) return stop;
    await this.#ready();
    return this.#info(resolved);
  }

  async listDir(path: string, context: Context) {
    const resolved = this.#resolve(path);
    const names = await this.#attempt(resolved, context, () => this.#fs.readdir(resolved));
    if (!names.ok) return names;
    const infos: FileInfo[] = [];
    for (const name of names.value) {
      const info = await this.#info(normalize(`${resolved}/${name}`));
      if (info.ok) infos.push(info.value);
    }
    return ok<FileInfo[], FileError>(infos);
  }

  async openDirReader(path: string, context: Context): Promise<Result<DirReader, FileError>> {
    const resolved = this.#resolve(path);
    const names = await this.#attempt(resolved, context, () => this.#fs.readdir(resolved));
    if (!names.ok) return names;
    const pending = [...names.value];
    let closed = false;
    return ok({
      next: async (maxEntries, readContext) => {
        const stop = aborted(readContext, resolved);
        if (stop !== undefined) return stop;
        if (closed) return err(new FileError('invalid', 'Directory reader is closed', resolved));
        if (!Number.isSafeInteger(maxEntries) || maxEntries <= 0)
          return err(new FileError('invalid', 'maxEntries must be a positive safe integer', resolved));
        const entries: FileInfo[] = [];
        while (pending.length > 0 && entries.length < maxEntries) {
          const name = pending.shift() ?? '';
          const info = await this.#info(normalize(`${resolved}/${name}`));
          if (info.ok) entries.push(info.value);
        }
        return ok({ entries, done: pending.length === 0 });
      },
      close: async () => {
        closed = true;
      },
    });
  }

  async watch(): Promise<Result<FileWatcher, FileError>> {
    return err(new FileError('not_supported', 'This environment does not watch files'));
  }

  async canonicalPath(path: string, context: Context) {
    const resolved = this.#resolve(path);
    return this.#attempt(resolved, context, () => this.#fs.realpath(resolved));
  }

  async exists(path: string, context: Context) {
    const info = await this.fileInfo(path, context);
    if (info.ok) return ok<boolean, FileError>(true);
    if (info.error.code === 'not_found') return ok<boolean, FileError>(false);
    return err<boolean, FileError>(info.error);
  }

  async createDir(path: string, options: { recursive?: boolean } | undefined, context: Context) {
    const resolved = this.#resolve(path);
    return this.#attempt(resolved, context, () =>
      this.#fs.mkdir(resolved, { recursive: options?.recursive ?? true }),
    );
  }

  async remove(
    path: string,
    options: { recursive?: boolean; force?: boolean } | undefined,
    context: Context,
  ) {
    const resolved = this.#resolve(path);
    return this.#attempt(resolved, context, async () => {
      await this.#fs.rm(resolved, { recursive: options?.recursive ?? false, force: options?.force ?? false });
      await this.#persist(resolved);
    });
  }

  async createTempDir(prefix: string | undefined, context: Context) {
    const path = `/tmp/${prefix ?? 'tmp-'}${++this.#temp}-${crypto.randomUUID().slice(0, 8)}`;
    return this.#attempt(path, context, async () => {
      await this.#fs.mkdir(path, { recursive: true });
      return path;
    });
  }

  async createTempFile(options: { prefix?: string; suffix?: string } | undefined, context: Context) {
    const dir = await this.createTempDir('tmp-', context);
    if (!dir.ok) return dir;
    const path = `${dir.value}/${options?.prefix ?? ''}${crypto.randomUUID()}${options?.suffix ?? ''}`;
    return this.#attempt(path, context, async () => {
      await this.#fs.writeFile(path, '');
      return path;
    });
  }

  async exec(
    command: string | readonly string[],
    options: ShellExecOptions | undefined,
    context: Context,
  ): Promise<Result<ShellExecResult, ExecutionError>> {
    if (context.abortSignal?.aborted === true) return err(new ExecutionError('aborted', 'aborted'));
    if (typeof command !== 'string' && command.length === 0)
      return err(new ExecutionError('spawn_error', 'Empty argv: no program to run'));
    await this.#ready();
    const cwd = options?.cwd === undefined ? this.cwd : this.#resolve(options.cwd);
    const directory = await this.#fs.stat(cwd).catch(() => undefined);
    if (directory?.isDirectory !== true)
      return err(new ExecutionError('spawn_error', `Working directory does not exist: ${cwd}`));
    const controller = new AbortController();
    this.#running.add(controller);
    const relay = () => controller.abort();
    context.abortSignal?.addEventListener('abort', relay, { once: true });
    let timedOut = false;
    const timer =
      options?.timeout === undefined || options.timeout <= 0
        ? undefined
        : setTimeout(() => {
            timedOut = true;
            controller.abort();
          }, options.timeout * 1000);
    const bash = new Bash({
      fs: this.#fs,
      cwd,
      env: { HOME: this.cwd, ...options?.env },
      customCommands: [...this.#commands],
    });
    try {
      const line =
        typeof command === 'string'
          ? command
          : command.map((arg) => `'${arg.replaceAll("'", "'\\''")}'`).join(' ');
      if (typeof command !== 'string' && !this.#knows(command[0] ?? ''))
        return err(new ExecutionError('spawn_error', `${command[0]}: command not found`));
      const result = await bash.exec(line, { cwd, signal: controller.signal });
      await this.#persistAll();
      if (timedOut)
        return err(new ExecutionError('timeout', `Command timed out after ${options?.timeout} seconds`));
      if (controller.signal.aborted) return err(new ExecutionError('aborted', 'aborted'));
      const emit = (text: string, stream: 'stdout' | 'stderr') => {
        if (text !== '')
          options?.onOutput?.(new StreamDecoder().decode(encoder.encode(text)), context, { stream });
      };
      emit(result.stdout, 'stdout');
      emit(result.stderr, 'stderr');
      return ok({ exitCode: result.exitCode });
    } catch (error) {
      return err(new ExecutionError('unknown', error instanceof Error ? error.message : String(error)));
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      context.abortSignal?.removeEventListener('abort', relay);
      this.#running.delete(controller);
    }
  }

  #knows(program: string) {
    return getCommandNames().includes(program) || this.#commands.some((each) => each.name === program);
  }

  async cleanup(_context: Context) {
    for (const controller of this.#running) controller.abort();
  }
}

export const sqliteFileStore = (sql: SqlStorage, scope: string): FileStore => {
  sql.exec(
    'CREATE TABLE IF NOT EXISTS shape_files (scope TEXT, path TEXT, bytes BLOB, PRIMARY KEY (scope, path))',
  );
  return {
    load: () =>
      Object.fromEntries(
        sql
          .exec<{ path: string; bytes: ArrayBuffer }>(
            'SELECT path, bytes FROM shape_files WHERE scope = ?',
            scope,
          )
          .toArray()
          .map((row) => [row.path, new Uint8Array(row.bytes)]),
      ),
    save: (path, bytes) => {
      if (bytes === undefined) sql.exec('DELETE FROM shape_files WHERE scope = ? AND path = ?', scope, path);
      else
        sql.exec(
          'INSERT OR REPLACE INTO shape_files (scope, path, bytes) VALUES (?, ?, ?)',
          scope,
          path,
          bytes,
        );
    },
  };
};
