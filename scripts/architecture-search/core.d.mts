export type Ledger = { jobs: Record<string, unknown> };
export const reserve: (
  ledger: Ledger,
  id: string,
  maximumUsd: number,
  limitUsd?: number,
  concurrency?: number,
) => Ledger;
export const settle: (ledger: Ledger, id: string, actualUsd: number) => Ledger;
