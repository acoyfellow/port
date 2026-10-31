export const probeMain = (
  target: string,
  exportName: string,
  body: string,
) => `import * as mod from "./${target}";
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
    if (
      trimmed.startsWith('import') ||
      trimmed.startsWith('//') ||
      trimmed.startsWith('export type') ||
      trimmed.startsWith('type ')
    )
      return;
    for (const [pattern, replacement] of SWAPS) {
      const match = pattern.exec(line);
      if (!match) continue;
      const next = line.replace(pattern, (m, g1) => replacement.replace('$1', g1 ?? m));
      if (next === line) continue;
      const copy = lines.slice();
      copy[i] = next;
      out.push({
        line: i + 1,
        from: trimmed.slice(0, 90),
        to: next.trim().slice(0, 90),
        source: copy.join('\n'),
      });
    }
  });
  const step = Math.max(1, Math.ceil(out.length / limit));
  return out.filter((_, i) => i % step === 0).slice(0, limit);
}
