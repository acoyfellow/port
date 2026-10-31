import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { BACKGROUND_CONTEXT, withAbortSignal } from '@earendil-works/chord/context';
import { NodeExecutionEnv } from '@earendil-works/pi-durable/env/node';

const root = process.env.PI_ENV_ROOT ?? '/workspace';
const port = Number(process.env.PI_ENV_PORT ?? 8080);
const boot = crypto.randomUUID();
mkdirSync(root, { recursive: true });

const envFor = (cwd) => new NodeExecutionEnv({ cwd: cwd ?? root });

const encodeError = (error) => ({
  code: error?.code ?? 'unknown',
  message: String(error?.message ?? error),
  path: error?.path,
});

const encodeValue = (value) =>
  value instanceof Uint8Array ? { bytes: Buffer.from(value).toString('base64') } : { value };

const decodeContent = (content) =>
  typeof content === 'string' ? content : new Uint8Array(Buffer.from(content.bytes, 'base64'));

const readBody = (request) =>
  new Promise((resolve, reject) => {
    let text = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      text += chunk;
    });
    request.on('end', () => resolve(text === '' ? {} : JSON.parse(text)));
    request.on('error', reject);
  });

const snapshot = async (env, path, options, context) => {
  const opened = await env.openBinaryReader(path, options, context);
  if (!opened.ok) return opened;
  const reader = opened.value;
  try {
    const info = await reader.info(context);
    if (!info.ok) return info;
    const bytes = await reader.read(0, info.value.size, context);
    if (!bytes.ok) return bytes;
    return { ok: true, value: { info: info.value, bytes: Buffer.from(bytes.value).toString('base64') } };
  } finally {
    await reader.close(context);
  }
};

const ops = {
  absolutePath: (env, [path], context) => env.absolutePath(path, context),
  joinPath: (env, [parts], context) => env.joinPath(parts, context),
  readTextFile: (env, [path], context) => env.readTextFile(path, context),
  readTextLines: (env, [path, options], context) => env.readTextLines(path, options, context),
  readBinaryFile: (env, [path], context) => env.readBinaryFile(path, context),
  snapshot: (env, [path, options], context) => snapshot(env, path, options, context),
  writeFile: (env, [path, content], context) => env.writeFile(path, decodeContent(content), context),
  appendFile: (env, [path, content], context) => env.appendFile(path, decodeContent(content), context),
  truncateFile: (env, [path, size], context) => env.truncateFile(path, size, context),
  flushFile: (env, [path], context) => env.flushFile(path, context),
  renameFile: (env, [from, to], context) => env.renameFile(from, to, context),
  fileInfo: (env, [path], context) => env.fileInfo(path, context),
  listDir: (env, [path], context) => env.listDir(path, context),
  canonicalPath: (env, [path], context) => env.canonicalPath(path, context),
  exists: (env, [path], context) => env.exists(path, context),
  createDir: (env, [path, options], context) => env.createDir(path, options, context),
  remove: (env, [path, options], context) => env.remove(path, options, context),
  createTempDir: (env, [prefix], context) => env.createTempDir(prefix, context),
  createTempFile: (env, [options], context) => env.createTempFile(options, context),
};

const contextFor = (request) => {
  const controller = new AbortController();
  request.on('close', () => {
    if (!request.complete || request.destroyed) controller.abort();
  });
  return { controller, context: withAbortSignal(controller.signal, BACKGROUND_CONTEXT) };
};

const handleOp = async (request, response) => {
  const body = await readBody(request);
  const run = ops[body.op];
  if (run === undefined) {
    response.writeHead(404).end();
    return;
  }
  const { context } = contextFor(request);
  const result = await run(envFor(body.cwd), body.args ?? [], context);
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(
    JSON.stringify(
      result.ok
        ? { ok: true, ...encodeValue(result.value) }
        : { ok: false, error: encodeError(result.error) },
    ),
  );
};

const handleExec = async (request, response) => {
  const body = await readBody(request);
  const controller = new AbortController();
  response.on('close', () => {
    if (!response.writableFinished) controller.abort();
  });
  const context = withAbortSignal(controller.signal, BACKGROUND_CONTEXT);
  response.writeHead(200, { 'content-type': 'application/x-ndjson' });
  const result = await envFor(body.cwd).exec(
    body.command,
    {
      ...body.options,
      onOutput: (text, _context, info) => response.write(`${JSON.stringify({ text, ...info })}\n`),
    },
    context,
  );
  response.end(
    `${JSON.stringify(result.ok ? { done: true, ok: true, value: result.value } : { done: true, ok: false, error: encodeError(result.error) })}\n`,
  );
};

createServer((request, response) => {
  const route = request.url ?? '/';
  const handled =
    route === '/op'
      ? handleOp(request, response)
      : route === '/exec'
        ? handleExec(request, response)
        : undefined;
  if (handled === undefined) {
    response
      .writeHead(200, { 'content-type': 'application/json' })
      .end(JSON.stringify({ ok: true, boot, root }));
    return;
  }
  handled.catch((error) => {
    if (!response.headersSent) response.writeHead(500);
    response.end(JSON.stringify({ ok: false, error: encodeError(error) }));
  });
}).listen(port, () => console.log(`pi env server on ${port}, root ${root}`));
