export const validateReceipt = (receipt) => {
  if (!receipt || receipt.version !== 1) throw new Error('Unsupported receipt');
  if (!receipt.benchmarkDigest || !receipt.model || !receipt.configurationDigest)
    throw new Error('Missing pinned experiment identity');
  if (!Array.isArray(receipt.trials) || receipt.trials.length === 0) throw new Error('Missing trials');
  if (new Set(receipt.trials.map((trial) => trial.id)).size !== receipt.trials.length)
    throw new Error('Duplicate trial IDs');
  for (const trial of receipt.trials) {
    if (!trial.id || !Number.isFinite(trial.elapsedMs) || trial.elapsedMs <= 0)
      throw new Error('Invalid trial timing');
    if (typeof trial.accepted !== 'boolean' || !trial.evidenceDigest)
      throw new Error('Missing independent correctness evidence');
    if (
      !trial.cost ||
      !['ai', 'compute', 'storage', 'requests', 'idle'].every(
        (key) => Number.isFinite(trial.cost[key]) && trial.cost[key] >= 0,
      )
    )
      throw new Error('Incomplete cost accounting');
  }
  if (receipt.cleanup?.remaining !== 0 || !receipt.cleanup.inventoryDigest)
    throw new Error('Missing cleanup inventory');
  return receipt;
};

export const reserve = (ledger, id, maximumUsd, limitUsd = 20, concurrency = 2) => {
  if (!Number.isFinite(maximumUsd) || maximumUsd <= 0) throw new Error('Invalid reservation');
  if (ledger.jobs[id]) throw new Error('Duplicate experiment');
  const jobs = Object.values(ledger.jobs);
  const active = jobs.filter((job) => job.state === 'running');
  if (active.length >= concurrency) throw new Error('Concurrency limit');
  const committed = jobs.reduce((total, job) => total + (job.actualUsd ?? job.maximumUsd), 0);
  if (committed + maximumUsd > limitUsd) throw new Error('Budget limit');
  return { ...ledger, jobs: { ...ledger.jobs, [id]: { state: 'running', maximumUsd } } };
};

export const settle = (ledger, id, actualUsd) => {
  const job = ledger.jobs[id];
  if (!job || job.state !== 'running') throw new Error('Experiment is not running');
  if (!Number.isFinite(actualUsd) || actualUsd < 0 || actualUsd > job.maximumUsd)
    throw new Error('Reservation exceeded');
  return { ...ledger, jobs: { ...ledger.jobs, [id]: { ...job, state: 'done', actualUsd } } };
};

export const summarize = (input) => {
  const receipt = validateReceipt(input);
  const accepted = receipt.trials.filter((trial) => trial.accepted).length;
  const totalUsd = receipt.trials.reduce(
    (sum, trial) => sum + Object.values(trial.cost).reduce((a, b) => a + b, 0),
    0,
  );
  const timings = receipt.trials.map((trial) => trial.elapsedMs).sort((a, b) => a - b);
  return {
    configurationDigest: receipt.configurationDigest,
    accepted,
    attempted: receipt.trials.length,
    usdPerAccepted: accepted === 0 ? Infinity : totalUsd / accepted,
    p95Ms: timings[Math.ceil(timings.length * 0.95) - 1],
  };
};

export const frontier = (receipts) => {
  if (!receipts.length) throw new Error('No experiments');
  const first = validateReceipt(receipts[0]);
  if (
    receipts.some(
      (receipt) => receipt.benchmarkDigest !== first.benchmarkDigest || receipt.model !== first.model,
    )
  )
    throw new Error('Incomparable experiments');
  const trialSet = (receipt) =>
    receipt.trials
      .map((trial) => trial.task ?? trial.id)
      .sort()
      .join('\n');
  if (receipts.some((receipt) => trialSet(receipt) !== trialSet(first)))
    throw new Error('Different workload coverage');
  const rows = receipts.map(summarize).filter((row) => row.accepted === row.attempted);
  return rows.filter(
    (row) =>
      !rows.some(
        (other) =>
          other.usdPerAccepted <= row.usdPerAccepted &&
          other.p95Ms <= row.p95Ms &&
          (other.usdPerAccepted < row.usdPerAccepted || other.p95Ms < row.p95Ms),
      ),
  );
};
