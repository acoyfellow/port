import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  createAnchor,
  readBenchmarkSpend,
  readBuildersSpend,
  readJudgesSpend,
  readOrchestratorSpend,
  validateSpendLedger,
} from './spend.mjs';

const base = join(import.meta.dirname, '../../.tmp');

test('orchestrator spend reads from anchor offset, splits warm/cold, flags unpriced turns', async () => {
  const dir = await mkdtemp(join(base, '/spend-test-'));
  try {
    const session = join(dir, 'session.jsonl');
    const prior = JSON.stringify({
      timestamp: '2026-11-24T10:00:00.000Z',
      message: {
        role: 'assistant',
        provider: 'old',
        model: 'old',
        usage: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0, cost: { total: 99 } },
      },
    });
    await writeFile(session, `${prior}\n`);
    const anchor = await createAnchor(join(dir, 'anchor.json'), session);
    const added = [
      {
        timestamp: '2026-11-24T11:00:00.000Z',
        message: {
          role: 'assistant',
          provider: 'anthropic-fable',
          model: 'claude-fable-5-2',
          usage: { input: 10, output: 100, cacheRead: 1000, cacheWrite: 0, cost: { total: 0.25 } },
        },
      },
      {
        timestamp: '2026-11-24T11:10:00.000Z',
        message: {
          role: 'assistant',
          provider: 'anthropic-fable',
          model: 'claude-fable-5-2',
          usage: { input: 10, output: 100, cacheRead: 0, cacheWrite: 1000, cost: { total: 1.5 } },
        },
      },
      {
        timestamp: '2026-11-24T11:11:00.000Z',
        message: {
          role: 'assistant',
          provider: 'meta',
          model: 'unpriced',
          usage: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0, cost: { total: 0 } },
        },
      },
    ];
    await writeFile(session, `${prior}\n${added.map((row) => JSON.stringify(row)).join('\n')}\n`);
    const result = await readOrchestratorSpend(session, anchor.startByte);
    assert.equal(result.turns, 3);
    assert.equal(result.warmUsd, 0.25);
    assert.equal(result.coldUsd, 1.5);
    assert.equal(result.coldTurns, 1);
    assert.equal(result.unpricedTurns, 1);
    assert.equal(result.unknownSpend, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('spend ledger rejects hidden unpriced usage and cap breaches', async () => {
  const dir = await mkdtemp(join(base, '/spend-ledger-'));
  try {
    const builderFile = join(dir, 'builder.json');
    const judgeFile = join(dir, 'judge.json');
    const benchFile = join(dir, 'bench.json');
    await writeFile(builderFile, JSON.stringify({ receipts: [{ seat: 's1', turns: 4, usd: 0.12 }] }));
    await writeFile(judgeFile, JSON.stringify({ itemCount: 6, usd: null, pricingStatus: 'unreported' }));
    await writeFile(benchFile, JSON.stringify({ aiUsd: 0.4, projectedInfraUsd: 0.05 }));
    const ledger = {
      version: 1,
      orchestrator: {
        usd: 2,
        warmUsd: 2,
        coldUsd: 0,
        turns: 5,
        coldTurns: 0,
        unpricedTurns: 0,
        unknownSpend: false,
      },
      builders: readBuildersSpend([builderFile]),
      judges: readJudgesSpend([judgeFile]),
      benchmark: readBenchmarkSpend([benchFile]),
    };
    assert.equal(ledger.judges.unknownSpend, true);
    validateSpendLedger(ledger);
    assert.throws(
      () => validateSpendLedger({ ...ledger, judges: { ...ledger.judges, unknownSpend: false } }),
      /Unpriced judge/,
    );
    assert.throws(
      () => validateSpendLedger({ ...ledger, benchmark: { ...ledger.benchmark, usd: 21 } }),
      /Benchmark spend cap/,
    );
    assert.throws(
      () => validateSpendLedger({ ...ledger, builders: { ...ledger.builders, usd: 16 } }),
      /Builder spend cap/,
    );
    assert.throws(
      () => validateSpendLedger({ ...ledger, orchestrator: { ...ledger.orchestrator, usd: 26 } }),
      /Orchestrator spend cap/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
