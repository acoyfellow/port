import type { Context } from '@earendil-works/chord/context';
import {
  type BinaryReader,
  type DirReader,
  type ExecutionEnv,
  ExecutionError,
  type ExecutionErrorCode,
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
  type TextLineReader,
} from '@earendil-works/pi-durable/env';

export type Transport = (path: string, init: RequestInit) => Promise<Response>;

type Encoded = { readonly code?: string; readonly message?: string; readonly path?: string };

const FILE_CODES: readonly FileErrorCode[] = [
  'aborted',
  'not_found',
  'permission_denied',
  'not_directory',
  'is_directory',
  'invalid',
  'not_supported',
  'unknown',
];

const EXEC_CODES: readonly ExecutionErrorCode[] = [
  'aborted',
  'timeout',
  'shell_unavailable',
  'spawn_error',
  'callback_error',
  'unknown',
];

const fileCode = (code: string | undefined) => FILE_CODES.find((each) => each === code) ?? 'unknown';

const execCode = (code: string | undefined) => EXEC_CODES.find((each) => each === code) ?? 'unknown';

const field = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;

const text = (value: unknown) => (typeof value === 'string' ? value : undefined);

const encodedError = (value: unknown): Encoded => ({
  code: text(field(value, 'code')),
  message: text(field(value, 'message')),
  path: text(field(value, 'path')),
});

const base64ToBytes = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
};

const contentOf = (content: string | Uint8Array) =>
  typeof content === 'string' ? content : { bytes: bytesToBase64(content) };

const isFileKind = (value: unknown): value is FileInfo['kind'] =>
  value === 'file' || value === 'directory' || value === 'symlink';

const fileInfoOf = (value: unknown): FileInfo | undefined => {
  const name = text(field(value, 'name'));
  const path = text(field(value, 'path'));
  const kind = field(value, 'kind');
  const size = field(value, 'size');
  const mtimeMs = field(value, 'mtimeMs');
  if (
    name === undefined ||
    path === undefined ||
    !isFileKind(kind) ||
    typeof size !== 'number' ||
    typeof mtimeMs !== 'number'
  )
    return undefined;
  return { name, path, kind, size, mtimeMs };
};

const stringsOf = (value: unknown) =>
  Array.isArray(value) ? value.filter((each) => typeof each === 'string') : [];

export class RemoteHttpEnv implements ExecutionEnv {
  readonly id: string;
  cwd: string;
  readonly #send: Transport;

  constructor(options: { readonly id: string; readonly cwd: string; readonly transport: Transport }) {
    this.id = options.id;
    this.cwd = options.cwd;
    this.#send = options.transport;
  }

  #stopped(context: Context) {
    return context.abortSignal?.aborted ?? false;
  }

  async #op(op: string, args: readonly unknown[], context: Context): Promise<Result<unknown, FileError>> {
    if (context.abortSignal?.aborted === true) return err(new FileError('aborted', 'aborted'));
    try {
      const response = await this.#send('/op', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op, args, cwd: this.cwd }),
        ...(context.abortSignal === undefined ? {} : { signal: context.abortSignal }),
      });
      const reply: unknown = await response.json();
      if (field(reply, 'ok') === true) {
        const bytes = text(field(reply, 'bytes'));
        return ok(bytes === undefined ? field(reply, 'value') : base64ToBytes(bytes));
      }
      const error = encodedError(field(reply, 'error'));
      return err(new FileError(fileCode(error.code), error.message ?? 'remote error', error.path));
    } catch (error) {
      if (this.#stopped(context)) return err(new FileError('aborted', 'aborted'));
      return err(new FileError('unknown', error instanceof Error ? error.message : String(error)));
    }
  }

  async #string(op: string, args: readonly unknown[], context: Context): Promise<Result<string, FileError>> {
    const result = await this.#op(op, args, context);
    if (!result.ok) return result;
    const value = text(result.value);
    return value === undefined ? err(new FileError('unknown', `${op} returned no text`)) : ok(value);
  }

  async #void(op: string, args: readonly unknown[], context: Context): Promise<Result<void, FileError>> {
    const result = await this.#op(op, args, context);
    return result.ok ? ok(undefined) : result;
  }

  async #info(op: string, args: readonly unknown[], context: Context): Promise<Result<FileInfo, FileError>> {
    const result = await this.#op(op, args, context);
    if (!result.ok) return result;
    const info = fileInfoOf(result.value);
    return info === undefined ? err(new FileError('unknown', `${op} returned no file info`)) : ok(info);
  }

  async #infos(
    op: string,
    args: readonly unknown[],
    context: Context,
  ): Promise<Result<FileInfo[], FileError>> {
    const result = await this.#op(op, args, context);
    if (!result.ok) return result;
    if (!Array.isArray(result.value)) return err(new FileError('unknown', `${op} returned no listing`));
    return ok(result.value.flatMap((each) => fileInfoOf(each) ?? []));
  }

  absolutePath(path: string, context: Context) {
    return this.#string('absolutePath', [path], context);
  }

  joinPath(parts: string[], context: Context) {
    return this.#string('joinPath', [parts], context);
  }

  readTextFile(path: string, context: Context) {
    return this.#string('readTextFile', [path], context);
  }

  async readTextLines(path: string, options: { maxLines?: number } | undefined, context: Context) {
    const result = await this.#op('readTextLines', [path, options], context);
    return result.ok ? ok<string[], FileError>(stringsOf(result.value)) : result;
  }

  async openTextLineReader(path: string, context: Context): Promise<Result<TextLineReader, FileError>> {
    const content = await this.readTextFile(path, context);
    if (!content.ok) return content;
    const lines = content.value.split('\n');
    const last = lines.pop();
    const queue = [
      ...lines.map((line) => ({ text: line, terminated: true })),
      ...(last === undefined || last === '' ? [] : [{ text: last, terminated: false }]),
    ];
    let closed = false;
    return ok({
      readLine: async (readContext) => {
        if (readContext.abortSignal?.aborted === true) return err(new FileError('aborted', 'aborted', path));
        if (closed) return err(new FileError('invalid', 'Text line reader is closed', path));
        return ok(queue.shift());
      },
      close: async () => {
        closed = true;
      },
    });
  }

  async readBinaryFile(path: string, context: Context) {
    const result = await this.#op('readBinaryFile', [path], context);
    if (!result.ok) return result;
    return result.value instanceof Uint8Array
      ? ok<Uint8Array, FileError>(result.value)
      : err<Uint8Array, FileError>(new FileError('unknown', 'readBinaryFile returned no bytes'));
  }

  async openBinaryReader(
    path: string,
    options: { noFollow?: boolean } | undefined,
    context: Context,
  ): Promise<Result<BinaryReader, FileError>> {
    const result = await this.#op('snapshot', [path, options], context);
    if (!result.ok) return result;
    const info = fileInfoOf(field(result.value, 'info'));
    const encoded = text(field(result.value, 'bytes'));
    if (info === undefined || encoded === undefined)
      return err(new FileError('unknown', 'snapshot returned nothing'));
    const bytes = base64ToBytes(encoded);
    let closed = false;
    const guard = (readContext: Context) =>
      readContext.abortSignal?.aborted === true
        ? err<never, FileError>(new FileError('aborted', 'aborted', info.path))
        : closed
          ? err<never, FileError>(new FileError('invalid', 'Binary reader is closed', info.path))
          : undefined;
    return ok({
      info: async (readContext) => guard(readContext) ?? ok(info),
      read: async (offset, length, readContext) => {
        const stop = guard(readContext);
        if (stop !== undefined) return stop;
        if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 0)
          return err(
            new FileError('invalid', 'Offset and length must be non-negative safe integers', info.path),
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
          return err(new FileError('invalid', 'Invalid line range', info.path));
        }
      },
      close: async () => {
        closed = true;
      },
    });
  }

  writeFile(path: string, content: string | Uint8Array, context: Context) {
    return this.#void('writeFile', [path, contentOf(content)], context);
  }

  appendFile(path: string, content: string | Uint8Array, context: Context) {
    return this.#void('appendFile', [path, contentOf(content)], context);
  }

  truncateFile(path: string, size: number, context: Context) {
    return this.#void('truncateFile', [path, size], context);
  }

  flushFile(path: string, context: Context) {
    return this.#void('flushFile', [path], context);
  }

  renameFile(sourcePath: string, destinationPath: string, context: Context) {
    return this.#void('renameFile', [sourcePath, destinationPath], context);
  }

  fileInfo(path: string, context: Context) {
    return this.#info('fileInfo', [path], context);
  }

  listDir(path: string, context: Context) {
    return this.#infos('listDir', [path], context);
  }

  async openDirReader(path: string, context: Context): Promise<Result<DirReader, FileError>> {
    const listing = await this.listDir(path, context);
    if (!listing.ok) return listing;
    const pending = [...listing.value];
    let closed = false;
    return ok({
      next: async (maxEntries, readContext) => {
        if (readContext.abortSignal?.aborted === true) return err(new FileError('aborted', 'aborted', path));
        if (closed) return err(new FileError('invalid', 'Directory reader is closed', path));
        if (!Number.isSafeInteger(maxEntries) || maxEntries <= 0)
          return err(new FileError('invalid', 'maxEntries must be a positive safe integer', path));
        const entries: FileInfo[] = [];
        while (pending.length > 0 && entries.length < maxEntries) {
          const next = pending.shift();
          if (next === undefined) break;
          const current = await this.fileInfo(next.path, readContext);
          if (current.ok) entries.push(current.value);
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

  canonicalPath(path: string, context: Context) {
    return this.#string('canonicalPath', [path], context);
  }

  async exists(path: string, context: Context) {
    const result = await this.#op('exists', [path], context);
    return result.ok ? ok<boolean, FileError>(result.value === true) : result;
  }

  createDir(path: string, options: { recursive?: boolean } | undefined, context: Context) {
    return this.#void('createDir', [path, options], context);
  }

  remove(path: string, options: { recursive?: boolean; force?: boolean } | undefined, context: Context) {
    return this.#void('remove', [path, options], context);
  }

  createTempDir(prefix: string | undefined, context: Context) {
    return this.#string('createTempDir', [prefix], context);
  }

  createTempFile(options: { prefix?: string; suffix?: string } | undefined, context: Context) {
    return this.#string('createTempFile', [options], context);
  }

  async exec(
    command: string | readonly string[],
    options: ShellExecOptions | undefined,
    context: Context,
  ): Promise<Result<ShellExecResult, ExecutionError>> {
    if (context.abortSignal?.aborted === true) return err(new ExecutionError('aborted', 'aborted'));
    const { onOutput, ...rest } = options ?? {};
    let response: Response;
    try {
      response = await this.#send('/exec', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ command, options: rest, cwd: this.cwd }),
        ...(context.abortSignal === undefined ? {} : { signal: context.abortSignal }),
      });
    } catch (error) {
      if (this.#stopped(context)) return err(new ExecutionError('aborted', 'aborted'));
      return err(new ExecutionError('unknown', error instanceof Error ? error.message : String(error)));
    }
    if (response.body === null) return err(new ExecutionError('unknown', 'exec returned no body'));
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffered = '';
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffered += chunk.value;
        let newline = buffered.indexOf('\n');
        while (newline !== -1) {
          const line: unknown = JSON.parse(buffered.slice(0, newline));
          buffered = buffered.slice(newline + 1);
          newline = buffered.indexOf('\n');
          if (field(line, 'done') === true) {
            if (field(line, 'ok') === true) {
              const exitCode = field(field(line, 'value'), 'exitCode');
              const spillPath = text(field(field(line, 'value'), 'spillPath'));
              return ok({
                exitCode: typeof exitCode === 'number' ? exitCode : 1,
                ...(spillPath === undefined ? {} : { spillPath }),
              });
            }
            const error = encodedError(field(line, 'error'));
            return err(new ExecutionError(execCode(error.code), error.message ?? 'remote exec failed'));
          }
          const output = text(field(line, 'text'));
          const stream = field(line, 'stream') === 'stderr' ? 'stderr' : 'stdout';
          const skipped = field(line, 'skipped');
          if (output !== undefined)
            onOutput?.(output, context, {
              stream,
              ...(typeof skipped === 'object' && skipped !== null
                ? {
                    skipped: {
                      bytes: Number(field(skipped, 'bytes')),
                      newlines: Number(field(skipped, 'newlines')),
                      endsWithNewline: field(skipped, 'endsWithNewline') === true,
                    },
                  }
                : {}),
            });
        }
      }
    } catch (error) {
      if (this.#stopped(context)) return err(new ExecutionError('aborted', 'aborted'));
      return err(new ExecutionError('unknown', error instanceof Error ? error.message : String(error)));
    }
    return err(new ExecutionError('unknown', 'exec ended without a result'));
  }

  async cleanup(_context: Context) {}
}
