# Fleet Architecture Search — Measured Results

Model: `workers-ai/@cf/deepseek-ai/deepseek-v4.1-flash-1017` on Cloudflare Customer 0.

| Shape | Seats | Passed | Makespan | p50 | p95 | Container-s | AI USD | Projected Infra USD |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| isolate-agents | 1 | 1/1 | 61.8 s | 61.8 s | 61.8 s | 0.0 s | $0.0150 | $0.00010 |
| container-per-thread | 1 | 1/1 | 124.2 s | 124.2 s | 124.2 s | 124.2 s | $0.0057 | $0.00116 |
| shared-container | 1 | 1/1 | 143.2 s | 143.2 s | 143.2 s | 143.2 s | $0.0086 | $0.00134 |
| pull-fleet | 1 | 1/1 | 143.6 s | 143.6 s | 143.6 s | 141.1 s | $0.0078 | $0.00132 |
| tiered-fleet | 1 | 0/1 | 187.1 s | 187.1 s | 187.1 s | 0.0 s | $0.0115 | $0.00029 |
| pull-fleet | 10 | 9/10 | 482.9 s | 252.2 s | 482.9 s | 718.1 s | $0.1287 | $0.00990 |
| container-per-thread | 10 | 5/10 | 246.4 s | 128.1 s | 246.4 s | 1510.0 s | $0.0344 | $0.01411 |
| shared-container | 10 | 3/10 | 312.6 s | 121.2 s | 312.6 s | 312.6 s | $0.0652 | $0.00503 |
| isolate-agents | 10 | 2/10 | 64.4 s | 26.7 s | 64.4 s | 0.0 s | $0.0286 | $0.00058 |
| tiered-fleet | 10 | 1/10 | 307.0 s | 22.2 s | 307.0 s | 11.1 s | $0.0491 | $0.00113 |

## 4-Line Spend Ledger

- **Orchestrator:** $0.0000 reported + 132 unpriced turns (85987 out tokens; `unknownSpend=true`)
- **Builders (assay relay):** $0.2383 across 4 seats
- **Judges (odds/clef & clef-flash):** $0.000688 across 24 items
- **Benchmark (Customer 0):** $0.3895 ($0.3546 AI + $0.03495 projected infra)

## Pareto Frontiers (100% pass)

- **1 seat (100% pass):** container-per-thread, isolate-agents
- **10 seats (100% pass):** none
- **10 seats (pass-rate × cost × makespan tradeoff):** container-per-thread (5/10, $0.0097/ok, 246s), isolate-agents (2/10, $0.0146/ok, 64s), pull-fleet (9/10, $0.0154/ok, 483s)
