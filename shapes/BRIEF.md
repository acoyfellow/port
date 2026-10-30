# Move one port shape to the standard layout

You move ONE existing shape, `~/cloudflare/port/shapes/SLUG/`, to the standard layout. Copy `~/cloudflare/port/shapes/durable-session/` exactly. It is the reference.

## The standard layout

```
shapes/SLUG/
  shape.ts        the manifest (moved from shared/entries/SLUG.ts)
  alchemy.run.ts  only a shapeStack call from ../kit/stack.ts
  smoke.ts        uses client and prove from ../kit/smoke.ts, decodes every response with effect/Schema
  src/index.ts    the Worker and its Durable Object classes
  box/            only if the shape has a container: Dockerfile and its files
```

There is no per-shape package.json, package-lock.json, node_modules or smoke.mjs. One install lives in `shapes/` (already done).

## Steps

1. `cd ~/cloudflare/port && git mv shared/entries/SLUG.ts shapes/SLUG/shape.ts`. In it, change the import to `import type { Entry } from '../../shared/entry.ts';` and `export const ENTRY` to `export const SHAPE`. Change nothing else in shape.ts.
2. Rewrite `alchemy.run.ts` with `shapeStack('SLUG', { ... })` and the helpers `durableObject`, `workerLoader`, `container` from `../kit/stack.ts`. Read `shapes/kit/stack.ts`. Do not add Alchemy imports. If a container folder is not named `box`, rename it to `box` with git mv. A container class name gives a container named `port-shape-SLUG-<classname lowercased>`.
3. Port `smoke.mjs` to `smoke.ts`. Keep the same checks and the same claim, but write the claim in plain short sentences (ASD-STE100: one fact per sentence, active voice, no semicolons). Then delete smoke.mjs.
4. Delete `package.json`, `package-lock.json` and `node_modules` in `shapes/SLUG`.
5. If `src/index.ts` needs a change for the new names, make the smallest change.
6. Run `node scripts/gen-entries.mjs`, then `node scripts/lint-shapes.mjs`. Your shape line must say `ok`.
7. Run from `~/cloudflare/port`, each wrapped in `perl -e 'alarm 115; exec @ARGV' ...`:
   `node scripts/shape.mjs SLUG up`, then `smoke`, then `down`, then `sweep`.
   A container smoke can take up to 4 minutes. If a step needs longer than 115 s, run the step in a cmux terminal surface instead: `cmux new-surface --type terminal --workspace workspace:40 --focus false --command "~/cloudflare/port/.tmp/run-shape.sh SLUG"`, then read `.tmp/run-SLUG.out`.
8. If a step fails, find the cause and fix it. Retry up to 4 times. Always finish with down and sweep. Sweep must show `leftovers: {}`.

## Rules

- Stay inside `shapes/SLUG` and `shared/entries/SLUG.ts`. Do not edit `shapes/kit`, `scripts`, `proof`, `worker` or any other shape. If the kit cannot express your shape, stop and reply BLOCKED with the exact reason.
- No source comments. No type casts (`as`, `!`, `<T>x`). No secrets or account IDs in files.
- Never call wrangler deploy. Never touch a repo outside `~/cloudflare/port`.
- Write `pro''of` in bash commands where the word appears.

Last line of your reply: `DONE SLUG <the PROVED line>` or `BLOCKED SLUG: <exact reason>`.
