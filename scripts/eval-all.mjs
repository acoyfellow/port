import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import dns from 'node:dns';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import https from 'node:https';
import { dirname, join, relative } from 'node:path';

const root = join(import.meta.dirname, '..');
const evals = join(root, 'evals', 'swarm-5');
const MODEL = 'workers-ai/@cf/moonshotai/kimi-k2.6';
const ZONE = 'customer0.dev';
const RUN_CAP_MS = 15 * 60_000;
const GRADE_TIMEOUT_MS = 120_000;
const RESTART_AFTER_MS = 3000;
const HEALTH_CAP_MS = 6 * 60_000;

const ALL_SHAPES = [
  'durable-session',
  'chat-with-sandbox',
  'container-per-thread',
  'person-with-computer',
  'shared-container',
  'sealed-box',
  'git-gatekeeper',
  'self-editing-app',
  'isolate-agents',
  'self-observe',
  'gadget-workspace',
  'egress-filter',
  'snapshot-rollback',
  'scheduled-agent',
  'flight-recorder',
  'safe-sql',
  'workflow-plan',
  'vector-memory',
  'write-list',
  'beam-fleet',
  'beam-space',
];
const EXCLUDED = {
  'agent-room': 'excluded: no file tools (environment is undefined)',
};
const ALL_TASKS = readdirSync(join(evals, 'tasks')).sort();

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value = ''] = arg.replace(/^--/, '').split('=');
    return [key, value];
  }),
);
const shapes = args.shapes ? args.shapes.split(',') : ALL_SHAPES;
const tasks = args.tasks ? args.tasks.split(',') : ALL_TASKS;
const outFile = join(root, args.out || 'proof/eval-all.json');

const log = (...parts) => console.log(new Date().toISOString().slice(11, 19), ...parts);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const walk = (base) => {
  const files = {};
  const go = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (name === 'node_modules') continue;
      if (statSync(full).isDirectory()) go(full);
      else files[relative(base, full)] = readFileSync(full, 'utf8');
    }
  };
  go(base);
  return files;
};
const seed = walk(join(evals, 'seed'));

let resolverPromise;
const resolver = () => {
  resolverPromise ??= (async () => {
    const [server] = await dns.promises.resolveNs(ZONE);
    const [address] = await dns.promises.resolve4(server);
    const found = new dns.promises.Resolver();
    found.setServers([address]);
    return found;
  })();
  return resolverPromise;
};

const call = async (slug, auth, method, path, body) => {
  const host = `port-shape-${slug}.${ZONE}`;
  const [address] = await (await resolver()).resolve4(host);
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const outgoing = https.request(
      {
        host: address,
        servername: host,
        method,
        path,
        timeout: 100_000,
        headers: {
          host,
          'content-type': 'application/json',
          ...auth,
          ...(payload === undefined ? {} : { 'content-length': Buffer.byteLength(payload) }),
        },
      },
      (incoming) => {
        let text = '';
        incoming.setEncoding('utf8');
        incoming.on('data', (chunk) => (text += chunk));
        incoming.on('end', () => {
          let json;
          try {
            json = JSON.parse(text);
          } catch {
            json = undefined;
          }
          resolve({ status: incoming.statusCode ?? 0, json, text });
        });
        incoming.on('error', reject);
      },
    );
    outgoing.on('timeout', () => outgoing.destroy(new Error('request timed out')));
    outgoing.on('error', reject);
    if (payload !== undefined) outgoing.write(payload);
    outgoing.end();
  });
};

const retrying = async (slug, auth, method, path, body, tries = 30) => {
  let last = '';
  for (let attempt = 0; attempt < tries; attempt++) {
    const reply = await call(slug, auth, method, path, body).catch((error) => String(error));
    if (typeof reply !== 'string' && reply.status >= 200 && reply.status < 300) return reply.json;
    if (typeof reply !== 'string' && reply.status >= 400 && reply.status < 500)
      throw new Error(`${method} ${path} HTTP ${reply.status}: ${reply.text.slice(0, 200)}`);
    last = typeof reply === 'string' ? reply : `HTTP ${reply.status} ${reply.text.slice(0, 120)}`;
    await pause(2000);
  }
  throw new Error(`${method} ${path} kept failing: ${last}`);
};

const shapeKey = (slug) => {
  const file = join(root, '.tmp', `shape-key-${slug}`);
  return existsSync(file) ? readFileSync(file, 'utf8').trim() : '';
};

const authFor = async (slug) => {
  if (slug === 'isolate-agents') return { authorization: `Bearer ${shapeKey(slug)}` };
  if (slug === 'person-with-computer') {
    const stamp = Date.now();
    const signin = await retrying(
      slug,
      {},
      'GET',
      `/signin?p=eval-${stamp}&token=t-${randomBytes(8).toString('hex')}`,
      undefined,
      90,
    );
    return { authorization: `Bearer ${signin.cookie}` };
  }
  return {};
};

const shapeStep = (slug, step) => {
  const result = spawnSync(process.execPath, [join(root, 'scripts', 'shape.mjs'), slug, step], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return { ok: result.status === 0, out: `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim() };
};

const countTap = (output) => {
  const pass = Number(output.match(/^# pass (\d+)/m)?.[1] ?? 0);
  const fail = Number(output.match(/^# fail (\d+)/m)?.[1] ?? 0);
  const cancelled = Number(output.match(/^# cancelled (\d+)/m)?.[1] ?? 0);
  return { passed: pass, total: pass + fail + cancelled };
};

const runTests = (dir, pattern, deadline) => {
  const left = deadline - Date.now();
  if (left <= 0) return { passed: 0, total: 0, timedOut: true };
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', pattern], {
    cwd: dir,
    encoding: 'utf8',
    timeout: left,
    maxBuffer: 16 * 1024 * 1024,
  });
  return { ...countTap(`${result.stdout ?? ''}`), timedOut: result.error?.code === 'ETIMEDOUT' };
};

const grade = (slug, task, files) => {
  const dir = join(root, '.tmp', 'eval', slug, task);
  rmSync(dir, { recursive: true, force: true });
  for (const [path, text] of Object.entries(files)) {
    if (path.startsWith('/') || path.split('/').includes('..')) continue;
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  mkdirSync(join(dir, 'test', 'hidden'), { recursive: true });
  writeFileSync(
    join(dir, 'test', 'hidden', `${task}.test.ts`),
    readFileSync(join(evals, 'tasks', task, `${task}.test.ts`), 'utf8'),
  );
  writeFileSync(join(dir, 'test', 'hidden', 'fixtures.ts'), readFileSync(join(evals, 'fixtures.ts'), 'utf8'));
  const deadline = Date.now() + GRADE_TIMEOUT_MS;
  const hidden = runTests(dir, `test/hidden/${task}.test.ts`, deadline);
  const visible = runTests(dir, 'test/*.test.ts', deadline);
  return { hidden, visible };
};

const runTask = async (slug, task, auth) => {
  const started = Date.now();
  const agent = `eval-${task}-${randomBytes(3).toString('hex')}`;
  const row = {
    slug,
    task,
    model: MODEL,
    agent,
    passed: false,
    hiddenPassed: 0,
    hiddenTotal: 0,
    visiblePassed: 0,
    visibleTotal: 0,
    usd: 0,
    tokens: 0,
    seconds: 0,
    resumed: false,
    reason: '',
  };
  try {
    const prompt = readFileSync(join(evals, 'tasks', task, 'prompt.md'), 'utf8');
    await retrying(slug, auth, 'POST', `/run?agent=${agent}`, { prompt, files: seed, model: MODEL }, 5);
    await pause(RESTART_AFTER_MS);
    const before = await retrying(slug, auth, 'GET', `/status?agent=${agent}`);
    const runningAtRestart = before.status === 'running';
    await retrying(slug, auth, 'GET', `/restart?agent=${agent}`);
    let status = await retrying(slug, auth, 'GET', `/status?agent=${agent}`, undefined, 60);
    while (status.status === 'running' && Date.now() - started < RUN_CAP_MS) {
      await pause(5000);
      status = await retrying(slug, auth, 'GET', `/status?agent=${agent}`, undefined, 60);
    }
    row.usd = status.usd ?? 0;
    row.tokens = status.tokens ?? 0;
    row.resumed = runningAtRestart && status.status === 'done';
    row.capped = status.status === 'running';
    if (row.capped) row.reason = 'still running at the 15 min cap';
    else if (status.status === 'unanswered') row.reason = `unanswered: ${status.reason ?? ''}`.slice(0, 200);
    const files = await retrying(slug, auth, 'GET', `/files?agent=${agent}`);
    const { hidden, visible } = grade(slug, task, files);
    row.hiddenPassed = hidden.passed;
    row.hiddenTotal = hidden.total;
    row.visiblePassed = visible.passed;
    row.visibleTotal = visible.total;
    row.passed = hidden.total > 0 && hidden.passed === hidden.total;
    if (!row.reason && !row.passed)
      row.reason =
        hidden.timedOut || visible.timedOut
          ? 'grader hit the 120 s timeout'
          : `hidden ${hidden.passed}/${hidden.total}`;
  } catch (error) {
    row.reason = String(error.message ?? error).slice(0, 240);
  }
  row.seconds = Math.round((Date.now() - started) / 1000);
  return row;
};

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 0 ? null : sorted[Math.floor((sorted.length - 1) / 2)];
};

const previous =
  existsSync(outFile) && args.fresh === undefined
    ? JSON.parse(readFileSync(outFile, 'utf8'))
    : { rows: [], shapes: {} };
const rows = previous.rows.filter((row) => !(shapes.includes(row.slug) && tasks.includes(row.task)));
const shapeNotes = { ...previous.shapes };

const save = () => {
  const summary = {};
  for (const slug of ALL_SHAPES) {
    const mine = rows.filter((row) => row.slug === slug);
    const note = shapeNotes[slug] ?? {};
    summary[slug] = {
      passed: mine.filter((row) => row.passed).length,
      of: ALL_TASKS.length,
      ran: mine.length,
      usd: Number(mine.reduce((sum, row) => sum + row.usd, 0).toFixed(4)),
      medianSeconds: median(mine.map((row) => row.seconds)),
      coldStartS: note.coldStartS ?? mine.find((row) => row.coldStartS != null)?.coldStartS ?? null,
      resumed: mine.filter((row) => row.resumed).length,
      note: note.note ?? '',
      swept: note.swept ?? null,
    };
  }
  for (const [slug, note] of Object.entries(EXCLUDED)) summary[slug] = { excluded: true, note };
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(
    outFile,
    `${JSON.stringify({ at: new Date().toISOString(), model: MODEL, tasks: ALL_TASKS, shapes: shapeNotes, grader: 'node --test on test/hidden/TASK.test.ts and test/*.test.ts, 120 s cap, local', summary, rows }, null, 2)}\n`,
  );
};

for (const slug of shapes) {
  log(`== ${slug}: up`);
  const note = { coldStartS: null, note: '', swept: null };
  shapeNotes[slug] = note;
  const up = shapeStep(slug, 'up');
  const upAt = Date.now();
  let auth;
  if (!up.ok) {
    note.note = `did not come up: ${up.out.split('\n').slice(-3).join(' ').slice(0, 200)}`;
    for (const task of tasks)
      rows.push({
        slug,
        task,
        model: MODEL,
        passed: false,
        hiddenPassed: 0,
        hiddenTotal: 0,
        visiblePassed: 0,
        visibleTotal: 0,
        usd: 0,
        tokens: 0,
        seconds: 0,
        resumed: false,
        coldStartS: null,
        reason: note.note,
      });
  } else {
    try {
      auth = await authFor(slug);
      const healthDeadline = Date.now() + HEALTH_CAP_MS;
      let healthy = false;
      while (!healthy && Date.now() < healthDeadline) {
        const reply = await call(slug, auth, 'GET', '/health').catch(() => undefined);
        healthy = reply !== undefined && reply.status === 200;
        if (!healthy) await pause(2000);
      }
      if (!healthy) throw new Error('health did not answer within 6 min');
      note.coldStartS = Math.round((Date.now() - upAt) / 1000);
      log(`${slug}: healthy, cold start ${note.coldStartS}s`);
      for (const task of tasks) {
        log(`${slug}/${task}: run`);
        const taskAuth = slug === 'person-with-computer' ? await authFor(slug) : auth;
        const row = { ...(await runTask(slug, task, taskAuth)), coldStartS: note.coldStartS };
        rows.push(row);
        log(
          `${slug}/${task}: passed=${row.passed} hidden ${row.hiddenPassed}/${row.hiddenTotal} visible ${row.visiblePassed}/${row.visibleTotal} $${row.usd.toFixed(4)} ${row.seconds}s resumed=${row.resumed} ${row.reason}`,
        );
        save();
      }
    } catch (error) {
      note.note = `failed before tasks: ${String(error.message ?? error).slice(0, 200)}`;
      for (const task of tasks)
        if (!rows.some((row) => row.slug === slug && row.task === task))
          rows.push({
            slug,
            task,
            model: MODEL,
            passed: false,
            hiddenPassed: 0,
            hiddenTotal: 0,
            visiblePassed: 0,
            visibleTotal: 0,
            usd: 0,
            tokens: 0,
            seconds: 0,
            resumed: false,
            coldStartS: note.coldStartS,
            reason: note.note,
          });
    }
  }
  log(`${slug}: down`);
  const down = shapeStep(slug, 'down');
  if (!down.ok)
    note.note = `${note.note} down failed: ${down.out.split('\n').slice(-2).join(' ').slice(0, 160)}`.trim();
  let swept = shapeStep(slug, 'sweep');
  for (let retry = 0; retry < 3 && !swept.ok; retry++) {
    await pause(20_000);
    shapeStep(slug, 'down');
    swept = shapeStep(slug, 'sweep');
  }
  const leftovers = swept.out.match(/"leftovers":\s*(\{[^}]*\})/)?.[1]?.replace(/\s+/g, '') ?? 'unknown';
  note.swept = leftovers;
  log(`${slug}: sweep leftovers ${leftovers}`);
  save();
  if (!swept.ok) {
    log(`STOP: ${slug} left resources behind; not starting the next shape`);
    process.exit(2);
  }
}
save();
log('eval-all finished');
