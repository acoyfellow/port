import { FLEET_BENCH } from '../../shared/entries/fleet-bench';
import { html, raw } from './html';
import type { Viewer } from './layout';
import { badge, cents, page } from './parts';

const runOf = (slug: string, seats: number) =>
  FLEET_BENCH.runs.find((run) => run.slug === slug && run.seats === seats);

const tenSeatRows = () =>
  FLEET_BENCH.runs
    .filter((run) => run.seats === 10)
    .slice()
    .sort((a, b) => b.passed / b.attempted - a.passed / a.attempted || a.makespanSeconds - b.makespanSeconds);

const LABEL: Record<string, string> = {
  'tiered-pull-fleet': 'Tiered pull-queue fleet',
  'pull-fleet': 'Pull-queue warm vessels',
  'container-per-thread': 'Container per agent',
  'shared-container': 'Shared container',
  'isolate-agents': 'Isolate-only agents',
  'tiered-fleet': 'Tiered (no queue)',
};

const VERDICT: Record<string, string> = {
  'tiered-pull-fleet': 'Best all-around · cheapest & fast',
  'pull-fleet': 'Highest reliability at 10 seats',
  'container-per-thread': '10 separate boxes · heavy infra',
  'shared-container': '1 box · throttled under burst',
  'isolate-agents': 'Instant · no Linux tools',
  'tiered-fleet': 'Needs a queue at 10 seats',
};

const bpStatArt = (big: string, sub: string, foot: string) =>
  raw(`<svg class="bp-art" viewBox="0 0 240 150" aria-hidden="true">
    <rect class="bp-line" x="14" y="14" width="212" height="122" rx="6" stroke-dasharray="3 3" opacity="0.45"/>
    <text class="bp-big" x="120" y="72" text-anchor="middle">${big}</text>
    <g class="bp-dim">
      <text x="120" y="96" text-anchor="middle">${sub}</text>
      <path d="M36 112 H204"/>
      <text x="120" y="126" text-anchor="middle">${foot}</text>
    </g>
    <g class="bp-amber"><circle cx="36" cy="112" r="2.5"/><circle cx="204" cy="112" r="2.5"/></g>
  </svg>`);

const heroSection = () => {
  const tp = runOf('tiered-pull-fleet', 10);
  const pf = runOf('pull-fleet', 10);
  const iso = runOf('isolate-agents', 1);
  const picks = [
    {
      num: '01 · BEST ALL-AROUND',
      slug: 'tiered-pull-fleet',
      title: 'Tiered pull-queue fleet',
      big: tp === undefined ? '0.9¢' : cents(tp.totalUsdPerOk ?? 0),
      sub: tp === undefined ? 'PER FINISHED TASK' : `PER TASK · ${tp.passed}/${tp.attempted} AT 10 SEATS`,
      foot: '3-WIDE QUEUE · ISOLATE FIRST · LAZY BOX',
      blurb:
        'Runs 3 agents at a time in instant isolates and spins up a container only when a task needs Python or git. 2.5x faster and 6.7x less container time.',
    },
    {
      num: '02 · HIGHEST PASS RATE',
      slug: 'pull-fleet',
      title: 'Pull-queue warm vessels',
      big: pf === undefined ? '9/10' : `${pf.passed}/${pf.attempted}`,
      sub: 'PASSED AT 10 CONCURRENT SEATS',
      foot: '3 WARM BOXES · WEIGHTED PULL QUEUE',
      blurb:
        'Three warm Linux containers pull tasks from one queue. Full Linux environment on every turn without booting 10 boxes or tripping rate limits.',
    },
    {
      num: '03 · FASTEST SINGLE TASK',
      slug: 'isolate-agents',
      title: 'Isolate-only agents',
      big: iso === undefined ? '62s' : `${Math.round(iso.makespanSeconds)}s`,
      sub: '0 CONTAINERS · INSTANT STARTUP',
      foot: 'WORKER LOADER ISOLATE · PURE JS / TS',
      blurb:
        'No containers at all. Starts immediately for TypeScript and JavaScript jobs that never touch external Linux binaries.',
    },
  ];

  return html`<section class="blueprint" aria-labelledby="pick-head"><div class="bp-head"><span class="bp-tag">Measured on Cloudflare</span><h1 id="pick-head">We ran 6 agent setups with 10 agents at once. Use the winners on your own account.</h1><p>Every architecture ran the same real coding tasks on Workers AI with hidden tests and full cleanup. Pick the shape that fits your workload and deploy it in one click.</p></div><ol class="bp-steps">${picks.map(
    (pick) =>
      html`<li class="bp-step"><div class="bp-text" style="display:flex;flex-direction:column;gap:6px;flex:1"><span class="bp-num">${pick.num}</span><strong><a href="/d/${pick.slug}" style="text-decoration:none;color:#fff">${pick.title}</a></strong><p style="flex:1">${pick.blurb}</p><a href="/d/${pick.slug}" style="display:inline-flex;align-items:center;gap:6px;align-self:flex-start;margin-top:8px;padding:6px 12px;border-radius:6px;border:1px solid rgba(165,147,255,.5);background:rgba(124,92,255,.28);color:#fff;font-size:13px;font-weight:500;text-decoration:none">Inspect &amp; use →</a></div>${bpStatArt(pick.big, pick.sub, pick.foot)}</li>`,
  )}</ol></section>`;
};

const scoreboardSection = () => {
  const rows = tenSeatRows();
  return html`<section class="card"><h2>What happened with 10 agents at once</h2><p class="muted" style="margin:4px 0 14px">Same 10 coding tasks, same live Workers AI model, graded by hidden tests. Higher pass rate and lower cost per finished task win.</p><div class="table-wrap"><table class="dir-table"><thead><tr><th>Setup</th><th class="num">Finished</th><th class="num">Total time</th><th class="num">Cost / finished task</th><th>Takeaway</th><th></th></tr></thead><tbody>${rows.map(
    (run) => {
      const rate = run.passed / run.attempted;
      const pct = Math.round(rate * 100);
      const tone = rate >= 0.8 ? 'ok' : rate >= 0.4 ? 'warn' : 'bad';
      const mins = `${(run.makespanSeconds / 60).toFixed(1)} min`;
      return html`<tr><td><a class="row-name" href="/d/${run.slug}"><strong>${LABEL[run.slug] ?? run.slug}</strong><small>${run.slug}</small></a></td><td class="num">${badge(tone, `${run.passed}/${run.attempted} (${pct}%)`)}</td><td class="num">${mins}</td><td class="num"><strong>${
        run.totalUsdPerOk === null ? '—' : cents(run.totalUsdPerOk)
      }</strong></td><td class="muted">${VERDICT[run.slug] ?? ''}</td><td class="num"><a href="/d/${run.slug}">Use →</a></td></tr>`;
    },
  )}</tbody></table></div></section>`;
};

const takeawaysSection = () =>
  html`<div class="grid"><section class="card"><h2>1. Put a queue in front of your agents</h2><p class="muted" style="margin-top:6px">Firing 10 agents at once without a queue lost <strong>50–80% of runs</strong> to model rate limits. Capping active concurrency to 3 with a pull queue lifted reliability to <strong>80–90%</strong>.</p></section><section class="card"><h2>2. Skip containers until you need Linux</h2><p class="muted" style="margin-top:6px">Running TypeScript tests in Worker Loader isolates kept <strong>84% of commands</strong> off containers, cutting container time <strong>6.7x</strong> and making 10-seat runs <strong>2.5x faster</strong>.</p></section><section class="card"><h2>3. Escalate to Linux on demand</h2><p class="muted" style="margin-top:6px">When a task asked <code>tiered-pull-fleet</code> to run <code>python3</code>, it automatically leased a container, returned <code>42</code>, and cleaned up with <strong>0 resources left behind</strong>.</p></section></div>`;

const behindTheNumbers = () => {
  const spend = FLEET_BENCH.spend;
  const tpSpend = FLEET_BENCH.tieredPullSpend;
  const cal = FLEET_BENCH.calibration;
  const esc = FLEET_BENCH.escalation;
  return html`<details class="card"><summary style="cursor:pointer;font-weight:600">Behind the numbers, spend ledger &amp; what’s still in progress (${FLEET_BENCH.drafts.length + 1} drafts not yet shipped)</summary><div class="stack" style="margin-top:16px"><div class="grid"><div><h3>Method &amp; limits</h3><ul class="muted" style="margin-top:6px"><li><strong>Model:</strong> <code>${FLEET_BENCH.model}</code> (Workers AI deprecated Kimi K2.6 / K2.7-code / GLM-5.3-flash on 2026-11-20).</li><li><strong>Container seconds:</strong> measured inside the Coordinator DO (<code>tiered-pull-fleet</code> 106.6 s vs <code>pull-fleet</code> 718.1 s vs <code>container-per-thread</code> 1,510.0 s).</li><li><strong>Single 10-seat pass:</strong> error bars need multi-repeat runs; auto-retry on <code>model_error</code> is the next polish item.</li>${
    esc === null
      ? ''
      : html`<li><strong>Subprocess check:</strong> <code>python3 -c "print(6 * 7)"</code> wrote <code>${esc.answer}</code> (${esc.containerSeconds} container-s, 0 leftovers).</li>`
  }</ul></div><div><h3>Build &amp; benchmark spend</h3>${
    spend === null
      ? ''
      : html`<ul class="muted" style="margin-top:6px"><li><strong>Benchmarks on Customer 0:</strong> $${(spend.benchmarkUsd + (tpSpend?.benchmarkUsd ?? 0)).toFixed(2)} across all runs (incl. v1/v2a retries).</li><li><strong>Delegated builders (assay relay):</strong> $${(spend.buildersUsd + (tpSpend?.buildersUsd ?? 0)).toFixed(3)}${
          cal === null ? '' : ` (calibrated winner: ${cal.winner})`
        }.</li><li><strong>Log triage (odds/clef-flash):</strong> $${(spend.judgesUsd + (tpSpend?.judgesUsd ?? 0)).toFixed(5)}.</li><li><strong>Orchestrator:</strong> ${spend.orchestratorUnpricedTurns} unpriced turns on Gemini (flagged <code>unknown</code>, never hidden as $0).</li></ul>`
  }</div></div><div><h3>Still in progress before deploy / push</h3><ul class="muted" style="margin-top:6px"><li>2 local commits ready to push (<code>77dc8ee</code>, <code>bc38187</code>) plus these local UI updates.</li><li>${FLEET_BENCH.drafts.length} unverified draft shapes on disk (<code>${FLEET_BENCH.drafts.map((d) => d.slug).join(', ')}</code>) plus <code>toolchain-per-agent</code> — kept out of the live directory until smoke-tested and graded.</li><li><code>customer0.dev</code> 30-day Browser Isolation hold lifts ~Nov 26 (turn WARP off to test button sign-in).</li></ul></div></div></details>`;
};

export const benchmarksPage = (viewer: Viewer) =>
  page({
    title: 'Measured fleet setups',
    viewer,
    section: 'benchmarks',
    crumbs: [{ label: 'Directory', href: '/' }, { label: 'Fleet setups' }],
    body: html`<div class="stack">${heroSection()}${scoreboardSection()}${takeawaysSection()}${behindTheNumbers()}</div>`,
  });
