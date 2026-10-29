import { execFileSync } from 'node:child_process';

const namespace = '4ff2d79a6cae44e194d7706b31ff6bb9';
const homeAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
const listed = execFileSync(
  'npx',
  ['wrangler', 'kv', 'key', 'list', '--namespace-id', namespace, '--remote'],
  {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  },
);
const keys = [...listed.matchAll(/[0-9a-f]{32}/g)].map((m) => m[0]);
const receipts = await Promise.all(
  keys.map(async (key) => ({
    key,
    body: await (await fetch(`https://port.customer0.dev/receipts/${key}`)).json(),
  })),
);

for (const { key, body } of receipts.sort(
  (a, b) => (a.body.savedAt ?? a.body.at ?? 0) - (b.body.savedAt ?? b.body.at ?? 0),
)) {
  if (body.kind) {
    console.log(`${key.slice(0, 8)} ${body.kind}`, JSON.stringify(body.results ?? body).slice(0, 400));
    continue;
  }
  const when = new Date(body.savedAt).toISOString().slice(11, 19);
  const where = body.accountId === homeAccount ? 'customer0' : 'personal';
  const model = (body.evalTasks ?? [])[0]?.model ?? '';
  console.log(`${key.slice(0, 8)} ${body.id} ${body.state} ${when} ${where} ${model}`);
  for (const line of body.log.slice(-4)) console.log(`    ${line.slice(0, 300)}`);
  for (const t of body.eval ?? []) {
    const hidden = t.hidden ? ` hidden ${t.hidden.passed}/${t.hidden.total}` : '';
    const error = t.error ? ` ERR ${t.error.slice(0, 300)}` : '';
    console.log(
      `    task ${t.task} ${t.state} turns ${t.turns} $${(t.usd ?? 0).toFixed(4)} passed ${t.passed}${hidden}${error}`,
    );
  }
}
