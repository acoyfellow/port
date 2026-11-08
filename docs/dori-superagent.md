# dori-superagent, read against port

Source: github.com/sisyphuslabs/dori-superagent at commit `937c80b` (Nov 8 2026). 206 stars, 52 forks, first commit Oct 7 2026. I read the code, prompts and tests. I did not run it.

## What it is

One person talks to one lead agent in Slack, Telegram or Discord. The lead turns each request into a **lane**: one coding-agent session (omo) in its own terminal tab (herdr or hc), started from a written brief. A lane finishes only with `dori ready --evidence <link>`. The lead then merges through a gate.

It is a harness for one machine. The state is JSON files under `~/.dori`. There is no server, no database and no cloud part.

| Part | What it does | Code |
|---|---|---|
| Lead | the only session that talks to you; writes briefs, opens lanes, merges | `prompts/lead.md` |
| Lane | one agent session per job, with fixed lane rules | `src/lanes.ts`, `prompts/lane-footer.md` |
| Inbox | a message to a busy pane waits and is sent as one batch when the pane is idle | `src/inbox.ts` |
| Duty loop | every 60 s: send queued messages, nudge lanes silent for 10 and 20 min, escalate at 40 min, mark a lane lost if its pane is gone | `src/duty.ts` |
| Hourly loop | starts the next backlog item that needs no decision, within lane and host-load limits; asks each open question once; never merges | `src/loop.ts` |
| Merge gate | merges only with a CLEAR review receipt for the exact head SHA and at least one passing check | `src/gate.ts` |

Size: about 3,300 lines in `src/`, 12,600 lines of TypeScript in all, and about 300 tests. The only runtime it needs is Bun.

## The good ideas

1. **A done has to prove itself.** `ready` refuses without an evidence link, and only a READY lane can be closed.
2. **The merge gate fails closed.** No receipt, a BLOCK verdict, no checks, a red check, or only skipped checks: each refuses with a named reason. The merge uses `--match-head-commit`, so a push after the review voids the receipt.
3. **A busy agent is never interrupted.** Messages queue and arrive as one batch when the pane is idle. A delivery that may or may not have arrived is held, not sent twice.
4. **Silence is a signal.** Nudges at fixed times, then an escalation to the lead, then "lost" if the pane is gone.
5. **One voice.** Lanes never talk to the person. Everything goes through the lead.

## The weak points

1. **One machine.** Every lane is a terminal tab on one host, and the host-load limit is how it scales. If the laptop sleeps, everything stops.
2. **Isolation is only a tab.** Lanes share one user, one disk and one set of credentials (`gh`, chat tokens). A lane can read another lane's checkout and the chat token.
3. **Status comes from reading the terminal.** Whether an agent is idle or working comes from herdr, or from the agent's own OSC 7501 report on hc. An agent that never reports stays `unknown`.
4. **The reviewer is the same kind of model as the author.** `dori review` runs a new omo session with a short prompt. It is independent of the lane's context, but not of its model.
5. **No cost limits in the harness.** Wall, token and cost limits exist only in the separate Dori mode `launch` command, not in `dori start`.
6. **Licence.** The Sustainable Use License allows internal business use and non-commercial use only. Commercial use needs a licence from Sisyphus Labs. Do not copy its code into port.

## Against port

| | dori-superagent | port beam-space | port durable shapes |
|---|---|---|---|
| Where agents run | terminal tabs on one machine | Durable Objects; tools in one container | Durable Objects |
| Survives the host going away | no | yes: the coordinator and threads resume from SQLite | yes |
| Isolation between agents | none beyond the tab | Unix user per seat, own folder per thread | own DO per session |
| Who checks the work | a fresh reviewer session, then CI | a checker thread per worker | hidden tests in the eval |
| Stops a double start after a restart | yes: a lane key that is open is refused | yes: the thread name is claimed in SQLite | not applicable |
| Talks to people | Slack, Telegram, Discord | HTTP only | HTTP only |
| Merges code | yes, through the gate | no | git-gatekeeper only |
| Measured cost per task | not published | coding eval (see the directory) | coding eval |

## Verdict

**Adopt three ideas. Do not adopt the code or the runtime.**

dori is a careful single-machine harness. Its runtime model (terminal tabs, one shared user, one laptop) is what port's shapes exist to replace. Its licence also rules out reusing the code. But three of its rules are small, testable and missing from port:

1. **Evidence-gated done** for beam-space: a thread's answer is accepted only with a link or file the coordinator can read back. Today the coordinator trusts the checker's text.
2. **Head-pinned merge receipt** for git-gatekeeper: a review counts only for the exact commit it read, and an empty check list is never green.
3. **Queue, do not interrupt**: a message to a running thread waits until its turn ends. beam-space's `message_thread` sends straight away.

The parts that do not fit port: chat channels (a product feature, not an infrastructure shape), the terminal multiplexers, and status read from the screen.

A possible shape, not built: **"lead with lanes"**, one lead DO, one lane DO per job, an inbox table, an alarm-driven duty loop that nudges, and a merge gate as a separate Worker. It would be beam-space plus dori's lifecycle rules, and it would be measured with the same coding eval.
