import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const tmp = join(root, '.tmp');
const isReceipt = (name) => name.startsWith('self-observe-') && name.endsWith('.json') && !name.includes('partial') && !name.includes('merged') && !name.includes('stamp');
const receipts = readdirSync(tmp)
  .filter(isReceipt)
  .map((name) => JSON.parse(readFileSync(join(tmp, name), 'utf8')))
  .filter((receipt) => receipt.suite === 'hard-5');
const seats = receipts.flatMap((receipt) => receipt.results);
const dead = (seat) => /timeout|3046/i.test(seat.error ?? '') && seat.turns <= 3 && !seat.passed;
const clean = seats.filter((seat) => !dead(seat));
const arm = (name) => {
  const rows = clean.filter((seat) => seat.arm === name);
  const passed = rows.filter((seat) => seat.passed).length;
  const usd = rows.reduce((total, seat) => total + seat.usd, 0);
  return { name, seats: rows.length, passed, rate: rows.length ? passed / rows.length : 0, usd, perPass: passed ? usd / passed : Number.POSITIVE_INFINITY };
};
const base = arm('baseline');
const grounded = arm('grounded');
const spend = seats.reduce((total, seat) => total + seat.usd, 0);
const proof = join(root, 'proof', 'shapes', 'self-observe.json');
const sweep = existsSync(proof) ? JSON.parse(readFileSync(proof, 'utf8')).sweep : null;
const lastEval = Math.max(0, ...receipts.map((receipt) => receipt.endedAt ?? 0));
const swept = Boolean(sweep) && Object.keys(sweep.leftovers ?? { unknown: 1 }).length === 0 && Date.parse(sweep.at) > lastEval;
const problems = [];
if (base.seats < 50) problems.push(`baseline has ${base.seats} clean seats, needs 50`);
if (grounded.seats < 50) problems.push(`grounded has ${grounded.seats} clean seats, needs 50`);
if (spend > 15) problems.push(`spend $${spend.toFixed(2)} is over $15`);
if (!swept) problems.push('no clean sweep after the last eval');
for (const a of [base, grounded]) {
  const per = Number.isFinite(a.perPass) ? a.perPass.toFixed(4) : 'none';
  console.log(`${a.name.padEnd(9)} ${a.passed}/${a.seats} passed (${(100 * a.rate).toFixed(0)}%) $${a.usd.toFixed(3)} → $${per} per pass`);
}
console.log(`spend $${spend.toFixed(3)} · dropped ${seats.length - clean.length} dead seats`);
if (problems.length > 0) {
  console.log(`GATE NOT MET: ${problems.join('; ')}`);
  process.exit(1);
}
const keep = grounded.perPass <= 0.8 * base.perPass && grounded.rate >= base.rate;
console.log(`VERDICT ${keep ? 'KEEP' : 'KILL'}: grounded is ${(grounded.perPass / base.perPass).toFixed(2)}x baseline cost per pass, pass rate ${(100 * grounded.rate).toFixed(0)}% vs ${(100 * base.rate).toFixed(0)}%`);
process.exit(0);
