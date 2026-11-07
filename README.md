# port

A directory of agent infrastructure shapes for Cloudflare. Each shape is one way to run a coding agent on Cloudflare: where its tools run, what it can reach, and where its state lives. You can install any shape on your own account with one button, test it, and tear it down.

Live at [port.customer0.dev](https://port.customer0.dev).

## What a shape is

Every shape runs the same agent: stock [Pi](https://pi.dev) (`pi-durable`) in a Durable Object, with Kimi K2.6 on Workers AI through an AI Gateway. Only the infrastructure around the agent changes, so the shapes can be compared fairly.

There are 19 shapes, in two groups:

| Group | Shapes |
|---|---|
| No container (11) | durable session, isolate tests, agent room, app the agent rewrites, gadget workspace, egress filter, scheduled agent, flight recorder, read-only SQL, Workflow plan, long-term memory |
| Container (8) | container per thread, sealed box, person with a computer, shared container, git gatekeeper, snapshot and rollback, chat with sandbox, self-observe |

Each shape lives in `shapes/<slug>/`:

- `shape.ts`: the directory entry (parts, strengths, limits, how it was tested)
- `src/`, and for some shapes a second Worker (`gate/`, `filter/`, `query/`, `recorder/`)
- `alchemy.run.ts`: deploys it for a test run
- `smoke.ts`: the test run

## What you can do on the site

1. **Browse.** The directory compares the shapes by isolation, internet access, coding eval score and AI cost per task. Each shape has a page with a diagram, its strengths and limits, and its last test run.
2. **Sign in with Cloudflare.** You pick one account. port asks only for the permissions an install uses.
3. **Install and run.** port creates the shape's resources on your account and runs the test against them.
4. **Tear down.** port deletes each resource, then asks the Cloudflare API to confirm that 0 are left.

Everything runs on your account and your bill. port keeps your encrypted grant and a record of what it created. Nothing else.

## How shapes are tested

| Test | What it shows | Result files |
|---|---|---|
| Shape run | The shape works on a real account. Pi does a task, is restarted mid-task and resumes, and the shape's own claim holds (for example "a write was refused" or "the Tail Worker recorded every tool call"). Then teardown leaves 0 resources. | `proof/pi/<slug>.json`, `proof/shapes/<slug>.json` |
| Coding eval | The same 5 coding tasks, the same model and the same hidden tests for every shape that has file tools. Shown on the site as passed/5 and AI cost per task. | `proof/eval-all.json` |
| Button install | The website button installs the shape on a signed-in account and tears it down. | `proof/install/` |

AI cost is what the model charged for the words Pi sent and got back. It does not include the Cloudflare products the shape runs on.

## What port does not do

- It does not run your agents for you. They run on your account.
- It does not pay for model calls. Those go through your AI Gateway.
- It does not touch anything it did not create. Teardown deletes only resources it recorded.

## Develop

```sh
npm install
npm run build      # regenerates the directory entries and the shape bundles
npm test           # vitest
npm run lint       # biome
npm run dev        # local server
```

After you add or change a shape, run `npm run build`. Shape test runs use `node scripts/shape.mjs` (up, smoke, down, sweep).

## Status

| Part | State |
|---|---|
| Directory, shape pages, diagrams | live |
| Sign in with Cloudflare | live. Through WARP, Browser Isolation breaks the sign-in cookie, so turn WARP off. |
| Button install for every shape | built. The full check across all shapes needs a signed-in run. |
| Coding eval | 10 shapes scored. Runs that hit the 15 minute cap are left out of the cost average. |
