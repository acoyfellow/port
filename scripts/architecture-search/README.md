# Architecture search

This is an unfinished deterministic experiment runner. It does not yet satisfy the architecture-search campaign gate.

## Commands

Run commands from the repository root.

- `node --test scripts/architecture-search/*.test.mjs` tests admission, recovery, evidence, pricing and model limits.
- `node scripts/architecture-search/prepare.mjs` generates the three container-size calibration variants. It overwrites their generated source files. Do not run it during a campaign.
- `node scripts/architecture-search/pin.mjs` records source and workload hashes, or checks them against the existing snapshot.
- `node scripts/architecture-search/run.mjs scripts/architecture-search/calibration.json` executes the calibration plan with one deployment at a time.
- `node scripts/architecture-search/calibration-report.mjs` collects preliminary evidence. It exits nonzero while any configuration is incomplete. This is not a leaderboard.
- `node proof/architecture-search/check.mjs` checks campaign evidence. It must fail until independently checked real receipts exist.

No command invokes a coding LLM for orchestration or scoring. Agent workloads themselves use fixed-model inference.

## Budget and failure semantics

The ledger reserves each experiment's maximum before launch. Completed experiments release unused reservation. Unknown cleanup or accounting retains the reservation and stops progress. A crashed driver leaves an exclusive lock. `unlock.mjs DIRECTORY` refuses to archive it while its PID exists. Use this only on the same host and only after all child processes from that attempt have stopped.

Interrupted calibration attempts without accounting forfeit their full reservation. The ledger currently names this field `actualUsd`; `accountingBasis: full-reservation-forfeited` means this is a conservative budget charge, not a measured bill. It must not enter a cost ranking.

Model calls have persisted admission limits. Generated container variants use a persisted lifetime deadline and alarm teardown. Remote lifetime enforcement still needs live verification. A local process timeout alone cannot guarantee remote cleanup.

## Known limitations

The current live adapter reuses the existing eval runner. Its grading and deployment evidence need stronger raw-artifact capture before final campaign verification. The adapter projects CPU at provisioned capacity, charges deployment duration as runtime, and reserves a fixed overhead allowance. These are conservative screening assumptions, not complete measured infrastructure accounting. The calibration report therefore refuses ranking eligibility.

The three calibration variants differ only in container size. They validate the harness, not novel architecture discovery. One task per variant cannot establish p95 latency, traffic sensitivity, or reliability. Exploration, repeated paired trials, actual configuration mutation, and independent holdout validation remain to be implemented.

Unfinished fleet shapes are preserved. No catalog generation or production deployment is part of these commands.
