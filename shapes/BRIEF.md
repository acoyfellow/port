# Build one port shape end to end

You build ONE shape under ~/cloudflare/port/shapes/SLUG/. Copy the pattern from ~/cloudflare/port/shapes/durable-session/ exactly: package.json (up/smoke/down scripts), alchemy.run.ts (Alchemy v2, Effect v4, localState), src/, smoke.mjs using ../lib.mjs.

Read ~/cloudflare/port/shared/entries/SLUG.ts for what the shape is. Build the SMALLEST port-owned version that proves the shape's core claim. Do not copy the source project. Do not touch the source project.

Rules:
- Every Cloudflare resource name starts with port-shape-SLUG (Worker name, buckets, KV, D1, containers, queues, gateways).
- Install deps with: npm i --no-audit --no-fund --registry=https://registry.npmjs.org/ --@cloudflare:registry=https://registry.npmjs.org/
- Use the same alchemy and effect versions as durable-session.
- No source comments. No type casts. No secrets in files. No account IDs in files.
- smoke.mjs must call prove(claim, ok, detail) from ../lib.mjs with a concrete, checked claim. The claim must be a fact the smoke observed on the deployed Worker, not a plan.
- Run only these, from ~/cloudflare/port:
    node scripts/shape.mjs SLUG up
    node scripts/shape.mjs SLUG smoke
    node scripts/shape.mjs SLUG down
    node scripts/shape.mjs SLUG sweep
  Wrap each in perl -e 'alarm 115; exec @ARGV' ... . Never call wrangler deploy directly.
- If up or smoke fails, fix and retry. Up to 4 tries.
- ALWAYS finish with down then sweep, even after a failure. sweep must show leftovers {} before you stop.
- Container shapes: one container class, the smallest image (a tiny Dockerfile FROM a small public image that serves HTTP on 8080). Max instances 1. If image push or container start is impossible on this account, write the exact error, still run down and sweep, and reply BLOCKED.
- Stay inside ~/cloudflare/port/shapes/SLUG. You may read anything.

Last line of your reply: DONE SLUG <the PROVED line> or BLOCKED SLUG: <exact error>.
