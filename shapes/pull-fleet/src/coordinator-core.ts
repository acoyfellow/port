export type CoordinatorConfig = {
  readonly poolSize: number;
  readonly maxBudgetUsd: number;
  readonly worstCasePerSeatUsd: number;
};

export type SubmitInput = {
  readonly agent: string;
  readonly weight?: number;
  readonly payload: unknown;
  readonly nowMs: number;
};

export type Assignment = {
  readonly agent: string;
  readonly vessel: string;
  readonly payload: unknown;
  readonly startedAt: number;
};

export type SubmitResult =
  | {
      readonly ok: true;
      readonly status: 'assigned';
      readonly assignment: Assignment;
    }
  | {
      readonly ok: true;
      readonly status: 'queued';
      readonly position: number;
    }
  | {
      readonly ok: false;
      readonly reason: 'budget-limit' | 'duplicate-agent' | 'invalid-input';
    };

export type CompleteResult =
  | {
      readonly ok: true;
      readonly next: Assignment | null;
    }
  | {
      readonly ok: false;
      readonly reason: 'not-running';
    };

export type FleetMetrics = {
  readonly poolSize: number;
  readonly admitted: number;
  readonly refused: number;
  readonly completed: number;
  readonly queued: number;
  readonly activeVessels: number;
  readonly containerSeconds: number;
  readonly reservedUsd: number;
  readonly settledUsd: number;
};

export type AgentAssignmentState = {
  readonly state: 'queued' | 'running' | 'completed' | 'unknown';
  readonly vessel: string | null;
};

export type Coordinator = {
  readonly submit: (input: SubmitInput) => SubmitResult;
  readonly complete: (agent: string, usd: number, elapsedMs: number, nowMs: number) => CompleteResult;
  readonly assignmentOf: (agent: string) => AgentAssignmentState;
  readonly metrics: () => FleetMetrics;
};

type QueuedTask = {
  readonly agent: string;
  readonly weight: number;
  readonly payload: unknown;
  readonly order: number;
};

export const createCoordinator = (config: CoordinatorConfig): Coordinator => {
  const vessels: string[] = [];
  for (let i = 1; i <= config.poolSize; i += 1) {
    vessels.push(`vessel-${i}`);
  }

  const vesselToAgent = new Map<string, string>();
  const agentToVessel = new Map<string, string>();
  const queuedAgents = new Set<string>();
  const completedAgents = new Set<string>();
  const queue: QueuedTask[] = [];

  let nextOrder = 0;
  let admitted = 0;
  let refused = 0;
  let completed = 0;
  let containerSeconds = 0;
  let reservedUsd = 0;
  let settledUsd = 0;

  const findIdleVessel = (): string | undefined => {
    for (const vessel of vessels) {
      if (!vesselToAgent.has(vessel)) {
        return vessel;
      }
    }
    return undefined;
  };

  const popNextQueuedTask = (): QueuedTask | undefined => {
    let bestTask: QueuedTask | undefined;
    let bestIdx = -1;
    for (let i = 0; i < queue.length; i += 1) {
      const candidate = queue[i];
      if (candidate === undefined) {
        continue;
      }
      if (
        bestTask === undefined ||
        candidate.weight > bestTask.weight ||
        (candidate.weight === bestTask.weight && candidate.order < bestTask.order)
      ) {
        bestTask = candidate;
        bestIdx = i;
      }
    }
    if (bestTask === undefined || bestIdx < 0) {
      return undefined;
    }
    queue.splice(bestIdx, 1);
    queuedAgents.delete(bestTask.agent);
    return bestTask;
  };

  const submit = (input: SubmitInput): SubmitResult => {
    if (typeof input.agent !== 'string' || input.agent.trim().length === 0) {
      return { ok: false, reason: 'invalid-input' };
    }

    if (queuedAgents.has(input.agent) || agentToVessel.has(input.agent) || completedAgents.has(input.agent)) {
      return { ok: false, reason: 'duplicate-agent' };
    }

    const projectedSpend = settledUsd + reservedUsd + config.worstCasePerSeatUsd;
    if (projectedSpend > config.maxBudgetUsd + 1e-12) {
      refused += 1;
      return { ok: false, reason: 'budget-limit' };
    }

    admitted += 1;
    reservedUsd += config.worstCasePerSeatUsd;

    const idleVessel = findIdleVessel();
    if (idleVessel !== undefined) {
      vesselToAgent.set(idleVessel, input.agent);
      agentToVessel.set(input.agent, idleVessel);
      return {
        ok: true,
        status: 'assigned',
        assignment: {
          agent: input.agent,
          vessel: idleVessel,
          payload: input.payload,
          startedAt: input.nowMs,
        },
      };
    }

    const order = nextOrder;
    nextOrder += 1;
    queue.push({
      agent: input.agent,
      weight: input.weight ?? 0,
      payload: input.payload,
      order,
    });
    queuedAgents.add(input.agent);

    return {
      ok: true,
      status: 'queued',
      position: queue.length,
    };
  };

  const complete = (agent: string, usd: number, elapsedMs: number, nowMs: number): CompleteResult => {
    const vessel = agentToVessel.get(agent);
    if (vessel === undefined) {
      return { ok: false, reason: 'not-running' };
    }

    agentToVessel.delete(agent);
    vesselToAgent.delete(vessel);
    completedAgents.add(agent);

    reservedUsd = Math.max(0, reservedUsd - config.worstCasePerSeatUsd);
    settledUsd += Math.max(0, usd);
    containerSeconds += Math.max(0, elapsedMs) / 1000;
    completed += 1;

    const nextTask = popNextQueuedTask();
    if (nextTask === undefined) {
      return { ok: true, next: null };
    }

    vesselToAgent.set(vessel, nextTask.agent);
    agentToVessel.set(nextTask.agent, vessel);

    return {
      ok: true,
      next: {
        agent: nextTask.agent,
        vessel,
        payload: nextTask.payload,
        startedAt: nowMs,
      },
    };
  };

  const assignmentOf = (agent: string): AgentAssignmentState => {
    const vessel = agentToVessel.get(agent);
    if (vessel !== undefined) {
      return { state: 'running', vessel };
    }
    if (queuedAgents.has(agent)) {
      return { state: 'queued', vessel: null };
    }
    if (completedAgents.has(agent)) {
      return { state: 'completed', vessel: null };
    }
    return { state: 'unknown', vessel: null };
  };

  const metrics = (): FleetMetrics => ({
    poolSize: config.poolSize,
    admitted,
    refused,
    completed,
    queued: queue.length,
    activeVessels: vesselToAgent.size,
    containerSeconds,
    reservedUsd,
    settledUsd,
  });

  return {
    submit,
    complete,
    assignmentOf,
    metrics,
  };
};
