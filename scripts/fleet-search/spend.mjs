import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createInterface } from 'node:readline';

export const DEFAULT_CAPS = {
  orchestratorUsd: 25,
  buildersUsd: 15,
  benchmarkUsd: 20,
};

export const createAnchor = async (anchorPath, sessionFile) => {
  if (!sessionFile || !existsSync(sessionFile)) throw new Error('Missing PI_SESSION_FILE for spend anchor');
  const size = statSync(sessionFile).size;
  const anchor = {
    version: 1,
    createdAt: new Date().toISOString(),
    sessionFile,
    startByte: size,
    caps: DEFAULT_CAPS,
  };
  await mkdir(dirname(anchorPath), { recursive: true });
  await writeFile(anchorPath, `${JSON.stringify(anchor, null, 2)}\n`);
  return anchor;
};

export const readOrchestratorSpend = async (sessionFile, startByte = 0, coldGapMs = 5 * 60_000) => {
  if (!sessionFile || !existsSync(sessionFile)) throw new Error('Orchestrator session file missing');
  const stat = statSync(sessionFile);
  if (!Number.isSafeInteger(startByte) || startByte < 0 || startByte > stat.size)
    throw new Error('Invalid spend anchor byte offset');
  let warmUsd = 0;
  let coldUsd = 0;
  let turns = 0;
  let coldTurns = 0;
  let unpricedTurns = 0;
  let lastAt = null;
  let lastContextTokens = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  const byModel = {};
  if (startByte < stat.size) {
    const stream = createReadStream(sessionFile, { start: startByte });
    for await (const line of createInterface({ input: stream })) {
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      const message = entry.message;
      const usage = message?.usage;
      if (!usage || message.role !== 'assistant') continue;
      const at = Date.parse(entry.timestamp ?? '');
      const tokens =
        (usage.input ?? 0) + (usage.output ?? 0) + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0);
      const usd = usage.cost?.total;
      turns++;
      inputTokens += usage.input ?? 0;
      outputTokens += usage.output ?? 0;
      cacheReadTokens += usage.cacheRead ?? 0;
      cacheWriteTokens += usage.cacheWrite ?? 0;
      lastContextTokens = (usage.input ?? 0) + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0);
      const model = message.model ?? 'unknown';
      byModel[model] ??= { turns: 0, usd: 0, unpricedTurns: 0 };
      byModel[model].turns++;
      if (!Number.isFinite(usd) || (tokens > 0 && usd === 0)) {
        unpricedTurns++;
        byModel[model].unpricedTurns++;
      } else {
        const cold = lastAt !== null && Number.isFinite(at) && at - lastAt > coldGapMs;
        if (cold) {
          coldTurns++;
          coldUsd += usd;
        } else {
          warmUsd += usd;
        }
        byModel[model].usd += usd;
      }
      if (Number.isFinite(at)) lastAt = at;
    }
  }
  return {
    usd: warmUsd + coldUsd,
    warmUsd,
    coldUsd,
    turns,
    coldTurns,
    unpricedTurns,
    unknownSpend: unpricedTurns > 0,
    lastContextTokens,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    byModel,
  };
};

export const readBuildersSpend = (receiptFiles) => {
  let usd = 0;
  let seats = 0;
  let unpricedSeats = 0;
  const runs = [];
  for (const file of receiptFiles) {
    if (!existsSync(file)) throw new Error(`Missing builder receipt: ${file}`);
    const data = JSON.parse(readFileSync(file, 'utf8'));
    const items = Array.isArray(data.receipts) ? data.receipts : [data];
    let runUsd = 0;
    for (const item of items) {
      seats++;
      const cost = item.usd;
      if (!Number.isFinite(cost) || cost < 0 || (item.turns > 0 && cost === 0)) {
        unpricedSeats++;
      } else {
        usd += cost;
        runUsd += cost;
      }
    }
    runs.push({ file, seats: items.length, usd: runUsd });
  }
  return { usd, seats, unpricedSeats, unknownSpend: unpricedSeats > 0, runs };
};

export const readJudgesSpend = (judgeFiles) => {
  let usd = 0;
  let calls = 0;
  let items = 0;
  let unpricedCalls = 0;
  for (const file of judgeFiles) {
    if (!existsSync(file)) throw new Error(`Missing judge receipt: ${file}`);
    const data = JSON.parse(readFileSync(file, 'utf8'));
    calls++;
    items += Number.isFinite(data.itemCount) ? data.itemCount : 0;
    if (Number.isFinite(data.usd) && data.usd > 0) {
      usd += data.usd;
    } else if (data.pricingStatus === 'reported-zero') {
      usd += 0;
    } else {
      unpricedCalls++;
    }
  }
  return { usd, calls, items, unpricedCalls, unknownSpend: unpricedCalls > 0 };
};

export const readBenchmarkSpend = (benchmarkFiles) => {
  let aiUsd = 0;
  let projectedInfraUsd = 0;
  let runs = 0;
  let unpricedRuns = 0;
  for (const file of benchmarkFiles) {
    if (!existsSync(file)) throw new Error(`Missing benchmark receipt: ${file}`);
    const data = JSON.parse(readFileSync(file, 'utf8'));
    runs++;
    if (
      !Number.isFinite(data.aiUsd) ||
      data.aiUsd < 0 ||
      !Number.isFinite(data.projectedInfraUsd) ||
      data.projectedInfraUsd < 0
    ) {
      unpricedRuns++;
    } else {
      aiUsd += data.aiUsd;
      projectedInfraUsd += data.projectedInfraUsd;
    }
  }
  return {
    usd: aiUsd + projectedInfraUsd,
    aiUsd,
    projectedInfraUsd,
    runs,
    unpricedRuns,
    unknownSpend: unpricedRuns > 0,
  };
};

export const validateSpendLedger = (ledger, caps = DEFAULT_CAPS) => {
  if (!ledger || ledger.version !== 1) throw new Error('Invalid spend ledger');
  for (const key of ['orchestrator', 'builders', 'judges', 'benchmark']) {
    const line = ledger[key];
    if (!line || !Number.isFinite(line.usd) || line.usd < 0 || typeof line.unknownSpend !== 'boolean')
      throw new Error(`Incomplete spend line: ${key}`);
  }
  if (ledger.orchestrator.unpricedTurns > 0 && !ledger.orchestrator.unknownSpend)
    throw new Error('Unpriced orchestrator turns hidden as zero');
  if (ledger.builders.unpricedSeats > 0 && !ledger.builders.unknownSpend)
    throw new Error('Unpriced builder seats hidden as zero');
  if (ledger.judges.unpricedCalls > 0 && !ledger.judges.unknownSpend)
    throw new Error('Unpriced judge calls hidden as zero');
  if (ledger.benchmark.unpricedRuns > 0 && !ledger.benchmark.unknownSpend)
    throw new Error('Unpriced benchmark runs hidden as zero');
  if (ledger.orchestrator.usd > caps.orchestratorUsd) throw new Error('Orchestrator spend cap exceeded');
  if (ledger.builders.usd > caps.buildersUsd) throw new Error('Builder spend cap exceeded');
  if (ledger.benchmark.usd > caps.benchmarkUsd) throw new Error('Benchmark spend cap exceeded');
  return ledger;
};
