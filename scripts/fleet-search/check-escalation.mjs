import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import dns from 'node:dns';
import { mkdirSync, writeFileSync } from 'node:fs';
import https from 'node:https';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDockerHost } from './docker-host.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const ZONE = 'customer0.dev';
const MODEL = 'workers-ai/@cf/deepseek-ai/deepseek-v4.1-flash-1017';
const SLUG = 'tiered-pull-fleet';

const pause = (ms) => new Promise((done) => setTimeout(done, ms));

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

const call = async (method, path, body) => {
  const host = `port-shape-${SLUG}.${ZONE}`;
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

const retrying = async (method, path, body, tries = 30) => {
  let last = '';
  for (let attempt = 0; attempt < tries; attempt++) {
    const reply = await call(method, path, body).catch((error) => String(error));
    if (typeof reply !== 'string' && reply.status >= 200 && reply.status < 300) return reply.json;
    last = typeof reply === 'string' ? reply : `HTTP ${reply.status} ${reply.text.slice(0, 120)}`;
    await pause(2000);
  }
  throw new Error(`${method} ${path} failed: ${last}`);
};

const shapeStep = (step, extraEnv) => {
  const result = spawnSync(process.execPath, [join(root, 'scripts', 'shape.mjs'), SLUG, step], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, ...extraEnv },
  });
  return { ok: result.status === 0, out: `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim() };
};

const parseSweep = (output) => {
  const start = output.indexOf('{');
  if (start < 0) return { leftovers: -1, errors: 1 };
  try {
    const parsed = JSON.parse(output.slice(start));
    return {
      at: parsed.at,
      prefix: parsed.prefix,
      leftovers: Object.keys(parsed.leftovers ?? {}).length,
      errors: Object.keys(parsed.errors ?? {}).length,
    };
  } catch {
    return { leftovers: -1, errors: 1 };
  }
};

const main = async () => {
  const outPath = resolve(root, process.argv[2] || '.tmp/tiered-pull/escalation.json');
  const extraEnv = { DOCKER_HOST: resolveDockerHost() };
  const up = shapeStep('up', extraEnv);
  if (!up.ok) {
    shapeStep('down', extraEnv);
    shapeStep('sweep', extraEnv);
    throw new Error(`Deploy failed: ${up.out.split('\n').slice(-4).join(' ')}`);
  }
  let record;
  let failure = null;
  try {
    const healthDeadline = Date.now() + 5 * 60_000;
    let healthy = false;
    while (!healthy && Date.now() < healthDeadline) {
      const reply = await call('GET', '/health').catch(() => undefined);
      healthy = reply !== undefined && reply.status === 200;
      if (!healthy) await pause(2000);
    }
    if (!healthy) throw new Error('Health timeout');
    const agent = `esc-${randomBytes(3).toString('hex')}`;
    const started = Date.now();
    await retrying('POST', `/fleet/submit?agent=${agent}`, {
      prompt:
        'Run `python3 -c "print(6 * 7)"` using the bash tool, then write the exact printed number to `answer.txt` in /workspace using the write tool, and reply briefly.',
      files: { 'README.md': 'escalation test\n' },
      model: MODEL,
      weight: 10,
    });
    let status = await retrying('GET', `/status?agent=${agent}`);
    while (status.status === 'running' && Date.now() - started < 5 * 60_000) {
      await pause(3000);
      status = await retrying('GET', `/status?agent=${agent}`);
    }
    const files = await retrying('GET', `/files?agent=${agent}`);
    const metrics = await retrying('GET', '/fleet/metrics');
    const answer = String(files['answer.txt'] ?? '').trim();
    const aiUsd = Number.isFinite(status.usd) ? status.usd : 0;
    const containerSeconds = Number.isFinite(metrics.containerSeconds) ? metrics.containerSeconds : 0;
    const projectedInfraUsd =
      containerSeconds * 0.00000778 + ((Date.now() - started) / 1000) * 0.125 * (12.5 / 1_000_000);
    record = {
      at: new Date().toISOString(),
      slug: SLUG,
      agent,
      model: MODEL,
      elapsedMs: Math.max(1, Date.now() - started),
      answer,
      passed: answer.includes('42') && metrics.escalatedSeats >= 1 && containerSeconds > 0,
      escalatedSeats: metrics.escalatedSeats,
      containerCommands: metrics.containerCommands,
      isolateCommands: metrics.isolateCommands,
      containerSeconds: Number(containerSeconds.toFixed(3)),
      aiUsd: Number(aiUsd.toFixed(6)),
      projectedInfraUsd: Number(projectedInfraUsd.toFixed(6)),
      metrics,
    };
  } catch (error) {
    failure = error;
  } finally {
    shapeStep('down', extraEnv);
    let sweep = parseSweep(shapeStep('sweep', extraEnv).out);
    for (let retry = 0; retry < 2 && (sweep.leftovers !== 0 || sweep.errors !== 0); retry++) {
      await pause(15_000);
      shapeStep('down', extraEnv);
      sweep = parseSweep(shapeStep('sweep', extraEnv).out);
    }
    if (record !== undefined) {
      record.sweep = sweep;
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, `${JSON.stringify(record, null, 2)}\n`);
      console.log(JSON.stringify(record, null, 2));
    }
  }
  if (failure !== null) throw failure;
};

main().catch((error) => {
  console.error(error.message ?? error);
  process.exitCode = 1;
});
