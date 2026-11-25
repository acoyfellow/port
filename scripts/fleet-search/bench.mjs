import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import dns from 'node:dns';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import https from 'node:https';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDockerHost } from './docker-host.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const evals = join(root, 'evals', 'swarm-5');
const DEFAULT_MODEL = 'workers-ai/@cf/deepseek-ai/deepseek-v4.1-flash-1017';
const ZONE = 'customer0.dev';
const RUN_CAP_MS = 8 * 60_000;
const GRADE_TIMEOUT_MS = 120_000;
const HEALTH_CAP_MS = 5 * 60_000;

const INSTANCE_RATES = {
  lite: 0.0625 * 0.00002 + 0.25 * 0.0000025 + 2 * 0.00000007,
  basic: 0.25 * 0.00002 + 1 * 0.0000025 + 4 * 0.00000007,
  'standard-1': 0.5 * 0.00002 + 4 * 0.0000025 + 8 * 0.00000007,
};
const DO_GB_SEC_RATE = 12.5 / 1_000_000;

const parseArgs = (argv) =>
  Object.fromEntries(
    argv.map((arg) => {
      const [key, value = ''] = arg.replace(/^--/, '').split('=');
      return [key, value];
    }),
  );

const pause = (ms) => new Promise((done) => setTimeout(done, ms));
const log = (...parts) => console.log(new Date().toISOString().slice(11, 19), ...parts);

const walk = (base) => {
  const files = {};
  const visit = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules') continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) visit(full);
      else files[relative(base, full)] = readFileSync(full, 'utf8');
    }
  };
  visit(base);
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
  return new Promise((done, reject) => {
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
        incoming.on('data', (chunk) => {
          text += chunk;
        });
        incoming.on('end', () => {
          let json;
          try {
            json = JSON.parse(text);
          } catch {
            json = undefined;
          }
          done({ status: incoming.statusCode ?? 0, json, text });
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

const authFor = (slug) => {
  if (slug !== 'isolate-agents') return {};
  const file = join(root, '.tmp', `shape-key-${slug}`);
  if (!existsSync(file)) throw new Error(`Missing key file: ${file}`);
  return { authorization: `Bearer ${readFileSync(file, 'utf8').trim()}` };
};

const shapeStep = (slug, step, extraEnv = {}) => {
  const result = spawnSync(process.execPath, [join(root, 'scripts', 'shape.mjs'), slug, step], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, ...extraEnv },
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

const grade = (slug, seatTag, task, files) => {
  const dir = join(root, '.tmp', 'fleet-grade', slug, seatTag);
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

const runSeat = async (slug, auth, task, seatIndex, mode, model) => {
  const started = Date.now();
  const agent = `fl-${seatIndex}-${task}-${randomBytes(2).toString('hex')}`;
  const prompt = readFileSync(join(evals, 'tasks', task, 'prompt.md'), 'utf8');
  const row = {
    seat: seatIndex,
    agent,
    task,
    passed: false,
    hiddenPassed: 0,
    hiddenTotal: 0,
    visiblePassed: 0,
    visibleTotal: 0,
    usd: 0,
    tokens: 0,
    elapsedMs: 1,
    reason: '',
  };
  try {
    if (mode === 'pull-fleet') {
      await retrying(
        slug,
        auth,
        'POST',
        `/fleet/submit?agent=${agent}`,
        { prompt, files: seed, model, weight: 10 - seatIndex },
        5,
      );
    } else {
      await retrying(slug, auth, 'POST', `/run?agent=${agent}`, { prompt, files: seed, model }, 5);
    }
    let status = await retrying(slug, auth, 'GET', `/status?agent=${agent}`, undefined, 40);
    while (status.status === 'running' && Date.now() - started < RUN_CAP_MS) {
      await pause(4000);
      status = await retrying(slug, auth, 'GET', `/status?agent=${agent}`, undefined, 40);
    }
    row.usd = Number.isFinite(status.usd) ? status.usd : 0;
    row.tokens = Number.isFinite(status.tokens) ? status.tokens : 0;
    if (status.status === 'running') row.reason = 'hit 8m cap';
    else if (status.status === 'unanswered') row.reason = `unanswered: ${status.reason ?? ''}`.slice(0, 200);
    const files = await retrying(slug, auth, 'GET', `/files?agent=${agent}`);
    const { hidden, visible } = grade(slug, agent, task, files);
    row.hiddenPassed = hidden.passed;
    row.hiddenTotal = hidden.total;
    row.visiblePassed = visible.passed;
    row.visibleTotal = visible.total;
    row.passed = hidden.total > 0 && hidden.passed === hidden.total;
    if (!row.reason && !row.passed) row.reason = `hidden ${hidden.passed}/${hidden.total}`;
  } catch (error) {
    row.reason = String(error.message ?? error).slice(0, 200);
  }
  row.elapsedMs = Math.max(1, Date.now() - started);
  log(
    `${slug}[${seatIndex}/${task}]: passed=${row.passed} hidden=${row.hiddenPassed}/${row.hiddenTotal} $${row.usd.toFixed(4)} ${(row.elapsedMs / 1000).toFixed(1)}s ${row.reason}`,
  );
  return row;
};

const parseSweep = (output) => {
  const jsonStart = output.indexOf('{');
  if (jsonStart < 0) return { leftovers: -1, errors: 1, raw: output.slice(-200) };
  try {
    const parsed = JSON.parse(output.slice(jsonStart));
    return {
      at: parsed.at,
      prefix: parsed.prefix,
      leftovers: Object.keys(parsed.leftovers ?? {}).length,
      errors: Object.keys(parsed.errors ?? {}).length,
    };
  } catch {
    return { leftovers: -1, errors: 1, raw: output.slice(-200) };
  }
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const slug = args.slug;
  const seats = Number(args.seats ?? 1);
  const model = args.model || DEFAULT_MODEL;
  const taskPool = (args.tasks || 'business-days,cart-merge,csv-parse,money-words,sku-glob').split(',');
  const outPath = resolve(root, args.out || `.tmp/fleet-search/benchmarks/${slug}-${seats}.json`);
  const instanceType = args.instance || 'basic';
  const usesContainer = slug !== 'isolate-agents';
  if (!slug || !Number.isInteger(seats) || seats < 1)
    throw new Error('Usage: bench.mjs --slug=SLUG --seats=N --out=FILE');

  const extraEnv = {};
  if (usesContainer) extraEnv.DOCKER_HOST = resolveDockerHost();
  if (args['max-instances']) extraEnv.SHAPE_MAX_INSTANCES = args['max-instances'];

  const seatTasks = Array.from({ length: seats }, (_, i) => taskPool[i % taskPool.length]);
  log(`== ${slug} (${seats} seats): up`);
  const upAt = Date.now();
  const up = shapeStep(slug, 'up', extraEnv);
  if (!up.ok) {
    shapeStep(slug, 'down', extraEnv);
    shapeStep(slug, 'sweep', extraEnv);
    throw new Error(`Deploy failed for ${slug}: ${up.out.split('\n').slice(-5).join(' ')}`);
  }

  let trials = [];
  let makespanMs = 0;
  let coldStartS = 0;
  let fleetMetrics = null;
  let runError = null;
  try {
    const auth = authFor(slug);
    const healthDeadline = Date.now() + HEALTH_CAP_MS;
    let healthy = false;
    while (!healthy && Date.now() < healthDeadline) {
      const reply = await call(slug, auth, 'GET', '/health').catch(() => undefined);
      healthy = reply !== undefined && reply.status === 200;
      if (!healthy) await pause(2000);
    }
    if (!healthy) throw new Error(`Health timeout for ${slug}`);
    coldStartS = Math.round((Date.now() - upAt) / 1000);
    log(`${slug}: healthy in ${coldStartS}s, launching ${seats} seats`);

    const mode = slug === 'pull-fleet' || slug === 'tiered-pull-fleet' ? 'pull-fleet' : 'standard';
    const batchStart = Date.now();
    trials = await Promise.all(seatTasks.map((task, idx) => runSeat(slug, auth, task, idx + 1, mode, model)));
    makespanMs = Math.max(1, Date.now() - batchStart);

    if (mode === 'pull-fleet' || slug === 'tiered-fleet') {
      fleetMetrics = await retrying(slug, auth, 'GET', '/fleet/metrics', undefined, 5).catch(() => null);
    }
  } catch (error) {
    runError = error;
  } finally {
    log(`${slug}: down`);
    shapeStep(slug, 'down', extraEnv);
    let sweep = parseSweep(shapeStep(slug, 'sweep', extraEnv).out);
    for (let retry = 0; retry < 2 && (sweep.leftovers !== 0 || sweep.errors !== 0); retry++) {
      await pause(15_000);
      shapeStep(slug, 'down', extraEnv);
      sweep = parseSweep(shapeStep(slug, 'sweep', extraEnv).out);
    }
    log(`${slug}: sweep leftovers=${sweep.leftovers} errors=${sweep.errors}`);
    if (!runError) {
      const aiUsd = trials.reduce((sum, row) => sum + row.usd, 0);
      const seatSeconds = trials.reduce((sum, row) => sum + row.elapsedMs / 1000, 0);
      let containerSeconds = 0;
      let containerSecondsSource = 'none';
      if (fleetMetrics && Number.isFinite(fleetMetrics.containerSeconds)) {
        containerSeconds = fleetMetrics.containerSeconds;
        containerSecondsSource = 'coordinator-measured';
      } else if (!usesContainer) {
        containerSeconds = 0;
        containerSecondsSource = 'no-container';
      } else if (slug === 'shared-container') {
        containerSeconds = makespanMs / 1000;
        containerSecondsSource = 'shared-box-makespan';
      } else {
        containerSeconds = seatSeconds;
        containerSecondsSource = 'sum-of-seat-active-seconds';
      }
      const rate = INSTANCE_RATES[instanceType] ?? INSTANCE_RATES.basic;
      const projectedInfraUsd = containerSeconds * rate + seatSeconds * 0.125 * DO_GB_SEC_RATE;
      const record = {
        version: 1,
        at: new Date().toISOString(),
        slug,
        seats,
        model,
        usesContainer:
          usesContainer &&
          !((slug === 'tiered-fleet' || slug === 'tiered-pull-fleet') && containerSeconds === 0),
        instanceType: usesContainer ? instanceType : 'none',
        coldStartS,
        makespanMs,
        containerSeconds: Number(containerSeconds.toFixed(2)),
        containerSecondsSource,
        aiUsd: Number(aiUsd.toFixed(6)),
        projectedInfraUsd: Number(projectedInfraUsd.toFixed(6)),
        infraRateBasis: 'projected-from-measured-container-seconds-plus-do-gb-seconds',
        fleetMetrics,
        trials,
        sweep,
      };
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, `${JSON.stringify(record, null, 2)}\n`);
      log(`wrote ${relative(root, outPath)}`);
    }
  }
  if (runError) throw runError;
};

main().catch((error) => {
  console.error(error.message ?? error);
  process.exitCode = 1;
});
