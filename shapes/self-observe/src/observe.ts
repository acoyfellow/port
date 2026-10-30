export type Arm = 'baseline' | 'shrink' | 'mutate' | 'governor' | 'all';
export const ARMS: readonly Arm[] = ['baseline', 'shrink', 'mutate', 'governor', 'all'];

export const armHas = (arm: Arm, tool: 'shrink' | 'mutate' | 'governor' | 'trace') =>
  arm === 'all' || arm === tool || (tool === 'trace' && arm === 'shrink');

export const probeMain = (target: string, exportName: string, body: string) => `import * as mod from "./${target}";
const fn = mod[${JSON.stringify(exportName)}];
const seen = [];
const record = (label, value) => { if (seen.length < 60) seen.push({ label, value: safe(value) }); };
const safe = (v) => { try { return JSON.parse(JSON.stringify(v, (_k, x) => typeof x === "bigint" ? String(x) : x)); } catch { return String(v); } };
export default {
  async fetch() {
    if (typeof fn !== "function") return Response.json({ error: "no function " + ${JSON.stringify(exportName)} + " in ${target}" });
    try {
      const result = await (async () => { ${body} })();
      return Response.json({ result: safe(result), seen });
    } catch (error) {
      return Response.json({ error: String(error && error.stack ? error.stack : error).slice(0, 1200), seen });
    }
  }
};`;

export const shrinkBody = (property: string, generator: string, runs: number) => `
const rand = (() => { let s = 12345; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
const gen = { int: (lo = -100, hi = 100) => lo + Math.floor(rand() * (hi - lo + 1)), pick: (xs) => xs[Math.floor(rand() * xs.length)], str: (n = 8, alphabet = "abcdefghij ,\\"\\n0123456789") => Array.from({ length: Math.floor(rand() * (n + 1)) }, () => alphabet[Math.floor(rand() * alphabet.length)]).join(""), array: (make, n = 8) => Array.from({ length: Math.floor(rand() * (n + 1)) }, make), bool: () => rand() < 0.5 };
const generate = (${generator});
const holds = (${property});
const check = (input) => { try { return holds(fn, input) === true ? null : "property returned false"; } catch (error) { return String(error && error.message ? error.message : error); } };
const smaller = (x) => {
  const out = [];
  if (typeof x === "number") { if (x !== 0) out.push(0, Math.trunc(x / 2), x > 0 ? x - 1 : x + 1); }
  else if (typeof x === "string") { for (let i = 0; i < x.length; i++) out.push(x.slice(0, i) + x.slice(i + 1)); if (x.length > 1) out.push(x.slice(0, Math.ceil(x.length / 2))); }
  else if (Array.isArray(x)) { for (let i = 0; i < x.length; i++) out.push([...x.slice(0, i), ...x.slice(i + 1)]); x.forEach((v, i) => smaller(v).slice(0, 3).forEach((s) => { const c = x.slice(); c[i] = s; out.push(c); })); }
  else if (x && typeof x === "object") { for (const k of Object.keys(x)) smaller(x[k]).slice(0, 3).forEach((s) => out.push({ ...x, [k]: s })); }
  return out;
};
for (let run = 0; run < ${runs}; run++) {
  let input = generate(gen);
  let why = check(input);
  if (why === null) continue;
  const first = input;
  let steps = 0;
  for (let progress = true; progress && steps < 400; ) {
    progress = false;
    for (const candidate of smaller(input)) {
      steps++;
      const w = check(candidate);
      if (w !== null) { input = candidate; why = w; progress = true; break; }
    }
  }
  let output; try { output = fn(...(Array.isArray(input) && input.__args ? input : [input])); } catch (e) { output = "throws: " + String(e && e.message ? e.message : e); }
  return { verdict: "FAILS", run: run + 1, smallest: input, why, outputForSmallest: output, firstFailing: first, shrinkSteps: steps };
}
return { verdict: "HOLDS", runs: ${runs} };
`;

export const traceBody = (args: string) => `
const input = (${args});
const out = await fn(...input);
return { input, output: out };
`;

export type Mutant = { line: number; from: string; to: string; source: string };

const SWAPS: readonly [RegExp, string][] = [
  [/===/, '!=='],
  [/!==/, '==='],
  [/<=/, '<'],
  [/>=/, '>'],
  [/(?<![<=>!])<(?![<=])/, '<='],
  [/(?<![<=>!-])>(?![>=])/, '>='],
  [/&&/, '||'],
  [/\|\|/, '&&'],
  [/\+ 1\b/, '+ 0'],
  [/- 1\b/, '- 0'],
  [/\btrue\b/, 'false'],
  [/\bfalse\b/, 'true'],
  [/\b(\d+)\b/, '$1+1'],
];

export function mutantsOf(source: string, limit = 40): Mutant[] {
  const lines = source.split('\n');
  const out: Mutant[] = [];
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('import') || trimmed.startsWith('//') || trimmed.startsWith('export type') || trimmed.startsWith('type ')) return;
    for (const [pattern, replacement] of SWAPS) {
      const match = pattern.exec(line);
      if (!match) continue;
      const next = line.replace(pattern, (m, g1) => replacement.replace('$1', g1 ?? m));
      if (next === line) continue;
      const copy = lines.slice();
      copy[i] = next;
      out.push({ line: i + 1, from: trimmed.slice(0, 90), to: next.trim().slice(0, 90), source: copy.join('\n') });
    }
  });
  const step = Math.max(1, Math.ceil(out.length / limit));
  return out.filter((_, i) => i % step === 0).slice(0, limit);
}

export type TurnRecord = { readonly turn: number; readonly tools: readonly string[]; readonly paths: readonly string[]; readonly passed: number | null; readonly total: number | null; readonly tokens: number };

export type Governor = { readonly note: string | null; readonly cells: Record<string, number> };

export function govern(history: readonly TurnRecord[], maxTurns: number): Governor {
  const last = history.at(-1);
  if (!last) return { note: null, cells: {} };
  const edits = history.flatMap((t) => t.tools.map((tool, i) => ({ tool, path: t.paths[i] ?? '', turn: t.turn }))).filter((x) => x.tool === 'edit_file' || x.tool === 'write_file');
  const perFile = new Map<string, number>();
  for (const e of edits) perFile.set(e.path, (perFile.get(e.path) ?? 0) + 1);
  const hot = [...perFile.entries()].sort((a, b) => b[1] - a[1])[0];
  const runs = history.filter((t) => t.passed !== null);
  const lastRuns = runs.slice(-3);
  const flat = lastRuns.length === 3 && lastRuns.every((r) => r.passed === lastRuns[0]?.passed && r.total === lastRuns[0]?.total) && (lastRuns[0]?.passed ?? 0) < (lastRuns[0]?.total ?? 0);
  const sinceTest = history.length - 1 - history.map((t) => t.passed !== null).lastIndexOf(true);
  const readsOnly = history.slice(-3).every((t) => t.tools.length > 0 && t.tools.every((x) => x === 'read_file' || x === 'list_files'));
  const left = maxTurns - last.turn;
  const cells = { turn: last.turn, left, edits: edits.length, hotFileEdits: hot?.[1] ?? 0, flatRuns: flat ? 1 : 0, turnsSinceTest: sinceTest, readsOnly: readsOnly ? 1 : 0 };
  const notes: string[] = [];
  if (flat) notes.push(`the last 3 test runs all gave ${lastRuns[0]?.passed}/${lastRuns[0]?.total}: your edits are not changing the result, so re-read the failing message before editing again`);
  if (hot && hot[1] >= 4) notes.push(`you edited ${hot[0]} ${hot[1]} times: consider rewriting the function whole, or use shrink/trace to see what it really does`);
  if (sinceTest >= 4 && edits.length > 0) notes.push(`${sinceTest} turns since you last ran tests`);
  if (readsOnly && last.turn >= 4) notes.push('3 turns of only reading: start writing');
  if (left <= 3) notes.push(`${left} turns left: finish, run the tests and stop`);
  return { note: notes.length ? `governor: ${notes.join('; ')}.` : null, cells };
}
