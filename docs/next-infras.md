# Next agent infra shapes

Each idea gets a falsifiable question and the smallest spike that answers it. An idea moves into the directory as `stage: 'idea'` and becomes `outlined` only after its spike ran.

Measured baseline (swarm-5, 118 tool calls): read, edit and write are 54% of calls, JS and tests 45%, shell, git and browser 1%. The machine waited on the model 99% of the time.

## 1. Pi inside a Durable Object facet

Shape: one parent Durable Object per user. Each agent is a facet with its own SQLite storage, started from code the parent loads with the Worker Loader.

Question: can a facet hold a full Pi session (messages, files, tool state) and survive eviction, with the parent able to list, pause and delete children?

Spike: parent DO creates 5 facets, each runs 10 turns of the fleet loop, evict the isolate mid-run, check every facet resumes at the right turn. Measure cold start per facet and storage per session.

Why it matters: per-agent isolation without one Durable Object class per tenant, and per-agent code versions.

## 2. Dynamic Workflows as the agent loop

Shape: each turn is a Workflow step. The model call, each tool call and each test run are steps with retries. The step code is loaded at run time, so a user can change the agent without a deploy.

Question: is the per-step overhead small enough for 40-turn runs, and do retries remove the hung-model-call failure (sku-glob)?

Spike: run swarm-5 with the loop as a Workflow. Compare passes, time and cost with the Durable Object loop on the same model.

## 3. Pi Durable in facets plus Workflows

Shape: the facet owns state, the Workflow owns durability of long tool calls. The facet starts a Workflow for anything over a few seconds and sleeps.

Question: does this beat either alone on the 1% of calls that need a real computer?

## 4. Rented computer per call

Shape: the agent loop never owns a container. Shell, git and browser calls go to a shared container pool, one call per lease.

Question: what is the lease latency, and what share of a run is spent waiting for a lease? The measured mix says only 1% of calls need it.

Spike: pool of 2 containers, 5 agents, swarm-5. Measure lease wait p50 and p95 and total container seconds against swarm-5.

## 5. Browser Rendering as a tool, not a box

Shape: browser calls go to Browser Rendering sessions, not to a container with Chromium.

Question: can the coil browser tool run fully on Browser Rendering with session reuse across turns?

## 6. Agent per Git branch on Artifacts

Shape: each agent writes to its own branch in an Artifacts repo. Merge is a step the parent runs after tests pass.

Question: can 5 agents edit one repo in parallel without lost writes, and is the merge step deterministic?

## 7. Model routing through AI Gateway

Shape: the loop asks a cheap model first and moves to a stronger model only after a failed test run.

Question: same pass rate as the strong model at what share of its cost?

## 8. Sealed eval cell

Shape: hidden tests run in a Worker Loader isolate with no network and no bindings, created per test run.

Question: can this replace Terrarium boxes for grading, and what does it cost per graded task?

## Order

1 and 2 first: both reuse the fleet loop that already passes 4 of 5, and both change only one part. Then 4, because the measured tool mix says it is the biggest cost lever for coil-style shapes.
