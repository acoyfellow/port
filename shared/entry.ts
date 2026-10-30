export type Stage = 'installable' | 'verified' | 'outlined' | 'idea';

export type Part = {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly product:
    | 'worker'
    | 'durable-object'
    | 'worker-loader'
    | 'container'
    | 'workers-ai'
    | 'ai-gateway'
    | 'kv'
    | 'd1'
    | 'r2'
    | 'queue'
    | 'workflow'
    | 'browser'
    | 'access'
    | 'external';
};

export type Edge = { readonly from: string; readonly to: string; readonly label?: string };

export type Measure = { readonly label: string; readonly value: string; readonly source: string };

export type Entry = {
  readonly slug: string;
  readonly mark: string;
  readonly name: string;
  readonly oneLine: string;
  readonly stage: Stage;
  readonly shape: string;
  readonly parts: readonly Part[];
  readonly edges: readonly Edge[];
  readonly strengths: readonly string[];
  readonly limits: readonly string[];
  readonly measures: readonly Measure[];
  readonly install: { readonly status: 'ready' | 'planned' | 'none'; readonly plan: string };
  readonly evalPlan: string;
  readonly source: string;
  readonly receipt?: string;
};
