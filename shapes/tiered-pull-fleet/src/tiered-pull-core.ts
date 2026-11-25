export type CommandTier = 'isolate' | 'container';

export type CommandClassification = {
  readonly tier: CommandTier;
  readonly reason: string;
};

export type TieredPullConfig = {
  readonly concurrency: number;
  readonly maxBudgetUsd: number;
  readonly worstCasePerSeatUsd: number;
};

export type SubmitInput = {
  readonly agent: string;
  readonly weight?: number;
  readonly payload: unknown;
  readonly nowMs: number;
};

export type SlotAssignment = {
  readonly agent: string;
  readonly slot: string;
  readonly payload: unknown;
  readonly startedAt: number;
};

export type SubmitResult =
  | {
      readonly ok: true;
      readonly status: 'assigned';
      readonly assignment: SlotAssignment;
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
      readonly next: SlotAssignment | null;
    }
  | {
      readonly ok: false;
      readonly reason: 'not-running';
    };

export type TieredPullMetrics = {
  readonly concurrency: number;
  readonly admitted: number;
  readonly refused: number;
  readonly completed: number;
  readonly queued: number;
  readonly activeSlots: number;
  readonly totalCommands: number;
  readonly isolateCommands: number;
  readonly containerCommands: number;
  readonly escalatedSeats: number;
  readonly containerSeconds: number;
  readonly reservedUsd: number;
  readonly settledUsd: number;
};

export type AgentAssignmentState = {
  readonly state: 'queued' | 'running' | 'completed' | 'unknown';
  readonly slot: string | null;
};

type QueuedTask = {
  readonly agent: string;
  readonly weight: number;
  readonly payload: unknown;
  readonly order: number;
};

type SlotEntry = {
  readonly slot: string;
  assignment: SlotAssignment | null;
};

const READ_ONLY_BUILTINS = new Set(['ls', 'cat', 'pwd', 'echo', 'find']);

export const classifyCommand = (command: string): CommandClassification => {
  const trimmed = command.trim();
  if (
    trimmed.length === 0 ||
    trimmed.includes('&&') ||
    trimmed.includes('||') ||
    trimmed.includes(';') ||
    trimmed.includes('|') ||
    trimmed.includes('>') ||
    trimmed.includes('<') ||
    trimmed.includes('`') ||
    trimmed.includes('$(')
  ) {
    return { tier: 'container', reason: 'subprocess-required' };
  }

  if (/^node\s+--test(?:\s|$)/.test(trimmed)) {
    return { tier: 'isolate', reason: 'node-test' };
  }

  const leadingToken = trimmed.split(/\s+/, 1)[0];
  if (leadingToken !== undefined && READ_ONLY_BUILTINS.has(leadingToken)) {
    return { tier: 'isolate', reason: 'read-only-builtin' };
  }

  return { tier: 'container', reason: 'subprocess-required' };
};

const ISOLATE_COMMANDS = new Set([
  'alias',
  'awk',
  'base64',
  'basename',
  'cat',
  'cd',
  'chmod',
  'clear',
  'column',
  'comm',
  'cp',
  'cut',
  'date',
  'diff',
  'dirname',
  'du',
  'echo',
  'egrep',
  'env',
  'expand',
  'export',
  'expr',
  'false',
  'fgrep',
  'file',
  'find',
  'fold',
  'grep',
  'gunzip',
  'gzip',
  'head',
  'help',
  'history',
  'hostname',
  'join',
  'jq',
  'ln',
  'ls',
  'md5sum',
  'mkdir',
  'mktemp',
  'mv',
  'nl',
  'od',
  'paste',
  'printenv',
  'printf',
  'pwd',
  'readlink',
  'rev',
  'rg',
  'rm',
  'rmdir',
  'sed',
  'seq',
  'set',
  'sha1sum',
  'sha256sum',
  'sleep',
  'sort',
  'split',
  'stat',
  'strings',
  'tac',
  'tail',
  'tee',
  'test',
  'time',
  'timeout',
  'touch',
  'tr',
  'tree',
  'true',
  'unalias',
  'unexpand',
  'uniq',
  'wc',
  'which',
  'whoami',
  'xargs',
  'yes',
  'zcat',
  '[',
]);

const unwrapShell = (command: string): string => {
  const match = /^(?:\/bin\/)?(?:ba)?sh\s+-c\s+(['"])([\s\S]*)\1$/.exec(command.trim());
  return match?.[2] !== undefined ? match[2].trim() : command.trim();
};

const stripEnvPrefix = (segment: string): string => {
  let rest = segment.trim();
  while (/^[A-Za-z_][A-Za-z0-9_]*=(?:'[^']*'|"[^"]*"|\S+)\s+/.test(rest)) {
    rest = rest.replace(/^[A-Za-z_][A-Za-z0-9_]*=(?:'[^']*'|"[^"]*"|\S+)\s+/, '').trim();
  }
  return rest;
};

export const classifyIsolateCommand = (command: string): CommandClassification => {
  const inner = unwrapShell(command);
  if (inner.length === 0 || inner.includes('`') || inner.includes('$(')) {
    return { tier: 'container', reason: 'subprocess-required' };
  }
  const segments = inner
    .split(/&&|\|\||;|\|/)
    .map((part) => stripEnvPrefix(part))
    .filter((part) => part.length > 0);
  if (segments.length === 0) return { tier: 'container', reason: 'subprocess-required' };
  let sawNodeTest = false;
  for (const segment of segments) {
    const token = segment.split(/\s+/, 1)[0] ?? '';
    if (token === 'node') {
      if (/^node\s+(?:--experimental-strip-types\s+)?--test(?:\s|$)/.test(segment)) {
        sawNodeTest = true;
        continue;
      }
      return { tier: 'container', reason: 'subprocess-required' };
    }
    if (!ISOLATE_COMMANDS.has(token)) {
      return { tier: 'container', reason: 'subprocess-required' };
    }
  }
  return { tier: 'isolate', reason: sawNodeTest ? 'node-test' : 'isolate-builtin' };
};

export const createTieredPullCoordinator = (config: TieredPullConfig) => {
  const concurrency = Math.max(0, Math.floor(config.concurrency));
  const slots: SlotEntry[] = [];
  for (let i = 1; i <= concurrency; i += 1) {
    slots.push({ slot: `slot-${i}`, assignment: null });
  }

  const runningByAgent = new Map<string, SlotEntry>();
  const completedAgents = new Set<string>();
  const queue: QueuedTask[] = [];
  const escalatedSeats = new Set<string>();

  let nextOrder = 0;
  let admitted = 0;
  let refused = 0;
  let completed = 0;
  let totalCommands = 0;
  let isolateCommands = 0;
  let containerCommands = 0;
  let containerSeconds = 0;
  let reservedUsd = 0;
  let settledUsd = 0;

  const findIdleSlot = (): SlotEntry | undefined => {
    for (const entry of slots) {
      if (entry.assignment === null) {
        return entry;
      }
    }
    return undefined;
  };

  const pullNextQueued = (): QueuedTask | undefined => {
    if (queue.length === 0) {
      return undefined;
    }
    let bestIndex = 0;
    let bestTask = queue[0];
    if (bestTask === undefined) {
      return undefined;
    }
    for (let i = 1; i < queue.length; i += 1) {
      const candidate = queue[i];
      if (candidate === undefined) {
        continue;
      }
      if (
        candidate.weight > bestTask.weight ||
        (candidate.weight === bestTask.weight && candidate.order < bestTask.order)
      ) {
        bestIndex = i;
        bestTask = candidate;
      }
    }
    queue.splice(bestIndex, 1);
    return bestTask;
  };

  const submit = (input: SubmitInput): SubmitResult => {
    if (input.agent.trim().length === 0) {
      return { ok: false, reason: 'invalid-input' };
    }

    if (
      runningByAgent.has(input.agent) ||
      completedAgents.has(input.agent) ||
      queue.some((item) => item.agent === input.agent)
    ) {
      return { ok: false, reason: 'duplicate-agent' };
    }

    if (settledUsd + reservedUsd + config.worstCasePerSeatUsd > config.maxBudgetUsd + 1e-12) {
      refused += 1;
      return { ok: false, reason: 'budget-limit' };
    }

    admitted += 1;
    reservedUsd += config.worstCasePerSeatUsd;

    const idleSlot = findIdleSlot();
    if (idleSlot !== undefined) {
      const assignment: SlotAssignment = {
        agent: input.agent,
        slot: idleSlot.slot,
        payload: input.payload,
        startedAt: input.nowMs,
      };
      idleSlot.assignment = assignment;
      runningByAgent.set(input.agent, idleSlot);
      return { ok: true, status: 'assigned', assignment };
    }

    const order = nextOrder;
    nextOrder += 1;
    queue.push({
      agent: input.agent,
      weight: input.weight ?? 0,
      payload: input.payload,
      order,
    });
    return { ok: true, status: 'queued', position: queue.length };
  };

  const recordDecision = (agent: string, decision: CommandClassification): CommandClassification => {
    totalCommands += 1;
    if (decision.tier === 'isolate') {
      isolateCommands += 1;
    } else {
      containerCommands += 1;
      escalatedSeats.add(agent);
    }
    return decision;
  };

  const recordCommand = (agent: string, command: string): CommandClassification =>
    recordDecision(agent, classifyCommand(command));

  const recordIsolateCommand = (agent: string, command: string): CommandClassification =>
    recordDecision(agent, classifyIsolateCommand(command));

  const recordContainerLease = (agent: string, elapsedMs: number): void => {
    escalatedSeats.add(agent);
    containerSeconds += Math.max(0, elapsedMs) / 1000;
  };

  const complete = (agent: string, usd: number, nowMs: number): CompleteResult => {
    const slotEntry = runningByAgent.get(agent);
    if (slotEntry === undefined) {
      return { ok: false, reason: 'not-running' };
    }

    runningByAgent.delete(agent);
    slotEntry.assignment = null;
    reservedUsd = Math.max(0, reservedUsd - config.worstCasePerSeatUsd);
    settledUsd += Math.max(0, usd);
    completed += 1;
    completedAgents.add(agent);

    const nextTask = pullNextQueued();
    if (nextTask === undefined) {
      return { ok: true, next: null };
    }

    const assignment: SlotAssignment = {
      agent: nextTask.agent,
      slot: slotEntry.slot,
      payload: nextTask.payload,
      startedAt: nowMs,
    };
    slotEntry.assignment = assignment;
    runningByAgent.set(nextTask.agent, slotEntry);
    return { ok: true, next: assignment };
  };

  const assignmentOf = (agent: string): AgentAssignmentState => {
    const runningSlot = runningByAgent.get(agent);
    if (runningSlot !== undefined) {
      return { state: 'running', slot: runningSlot.slot };
    }
    if (queue.some((item) => item.agent === agent)) {
      return { state: 'queued', slot: null };
    }
    if (completedAgents.has(agent)) {
      return { state: 'completed', slot: null };
    }
    return { state: 'unknown', slot: null };
  };

  const metrics = (): TieredPullMetrics => ({
    concurrency,
    admitted,
    refused,
    completed,
    queued: queue.length,
    activeSlots: runningByAgent.size,
    totalCommands,
    isolateCommands,
    containerCommands,
    escalatedSeats: escalatedSeats.size,
    containerSeconds,
    reservedUsd,
    settledUsd,
  });

  return {
    submit,
    recordCommand,
    recordIsolateCommand,
    recordContainerLease,
    complete,
    assignmentOf,
    metrics,
  };
};
