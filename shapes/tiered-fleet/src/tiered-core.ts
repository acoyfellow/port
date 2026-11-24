export type ExecutionTier = 'isolate' | 'container';

export type CommandDecision = {
  readonly tier: ExecutionTier;
  readonly reason: string;
};

export type TieredStats = {
  readonly totalCommands: number;
  readonly isolateCommands: number;
  readonly containerCommands: number;
  readonly escalatedSeats: number;
  readonly totalSeats: number;
  readonly containerSeconds: number;
};

export type TierTracker = {
  recordCommand(seat: string, command: string): CommandDecision;
  recordContainerLease(seat: string, elapsedMs: number): void;
  isEscalated(seat: string): boolean;
  stats(): TieredStats;
};

const SHELL_OPERATORS: readonly string[] = ['&&', '||', ';', '|', '>', '<', '`', '$('];

const READ_ONLY_BUILTINS: ReadonlySet<string> = new Set(['ls', 'cat', 'pwd', 'echo', 'find']);

function hasShellOperator(command: string): boolean {
  return SHELL_OPERATORS.some((operator) => command.includes(operator));
}

function isNodeTestCommand(trimmed: string): boolean {
  return /^node\s+--test(?:\s|$)/.test(trimmed);
}

function leadingToken(trimmed: string): string {
  const spaceIndex = trimmed.search(/\s/);
  return spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex);
}

export function classifyCommand(command: string): CommandDecision {
  const trimmed = command.trim();
  if (trimmed.length === 0 || hasShellOperator(trimmed)) {
    return { tier: 'container', reason: 'subprocess-required' };
  }
  if (isNodeTestCommand(trimmed)) {
    return { tier: 'isolate', reason: 'node-test' };
  }
  if (READ_ONLY_BUILTINS.has(leadingToken(trimmed))) {
    return { tier: 'isolate', reason: 'read-only-builtin' };
  }
  return { tier: 'container', reason: 'subprocess-required' };
}

export function createTierTracker(): TierTracker {
  const allSeats = new Set<string>();
  const escalatedSeats = new Set<string>();
  let totalCommands = 0;
  let isolateCommands = 0;
  let containerCommands = 0;
  let containerSeconds = 0;

  return {
    recordCommand(seat: string, command: string): CommandDecision {
      const decision = classifyCommand(command);
      allSeats.add(seat);
      totalCommands += 1;
      if (decision.tier === 'isolate') {
        isolateCommands += 1;
      } else {
        containerCommands += 1;
        escalatedSeats.add(seat);
      }
      return decision;
    },
    recordContainerLease(seat: string, elapsedMs: number): void {
      allSeats.add(seat);
      escalatedSeats.add(seat);
      containerSeconds += Math.max(0, elapsedMs) / 1000;
    },
    isEscalated(seat: string): boolean {
      return escalatedSeats.has(seat);
    },
    stats(): TieredStats {
      return {
        totalCommands,
        isolateCommands,
        containerCommands,
        escalatedSeats: escalatedSeats.size,
        totalSeats: allSeats.size,
        containerSeconds,
      };
    },
  };
}
