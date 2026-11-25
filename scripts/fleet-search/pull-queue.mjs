export const createPullQueue = (options) => {
  const { items = [], maxAttempts = 3, stopOnFirstPass = false } = options ?? {};

  if (!Array.isArray(items)) {
    throw new Error('items must be an array');
  }
  if (!Number.isInteger(maxAttempts) || maxAttempts <= 0) {
    throw new Error('maxAttempts must be a positive integer');
  }

  const records = [];
  const byId = new Map();
  let stopped = false;
  let totalAttempts = 0;

  for (const raw of items) {
    if (typeof raw?.id !== 'string' || raw.id.length === 0) {
      throw new Error('Each item must have a non-empty string id');
    }
    if (byId.has(raw.id)) {
      throw new Error(`Duplicate item id: ${raw.id}`);
    }
    const weight = raw.weight ?? 0;
    const record = {
      id: raw.id,
      weight,
      payload: raw.payload,
      status: 'pending',
      attempt: 0,
      vesselId: null,
      claimedAt: null,
      finishedAt: null,
      result: undefined,
      failures: [],
    };
    records.push(record);
    byId.set(raw.id, record);
  }

  const cloneRecord = (record) => ({
    ...record,
    failures: record.failures.map((entry) => ({ ...entry })),
  });

  const claim = (vesselId, nowMs) => {
    if (stopped) {
      return null;
    }
    let best = null;
    for (const record of records) {
      if (record.status !== 'pending') {
        continue;
      }
      if (best === null || record.weight > best.weight) {
        best = record;
      }
    }
    if (best === null) {
      return null;
    }
    best.status = 'running';
    best.attempt += 1;
    best.vesselId = vesselId;
    best.claimedAt = nowMs;
    totalAttempts += 1;
    return {
      id: best.id,
      weight: best.weight,
      payload: best.payload,
      attempt: best.attempt,
      vesselId: best.vesselId,
      claimedAt: best.claimedAt,
    };
  };

  const complete = (id, vesselId, result, nowMs) => {
    const record = byId.get(id);
    if (record === undefined) throw new Error(`Item ${id} is not running on vessel ${vesselId}`);
    if (record.status !== 'running' || record.vesselId !== vesselId) {
      throw new Error(`Item ${id} is not running on vessel ${vesselId}`);
    }
    record.status = 'done';
    record.result = result;
    record.finishedAt = nowMs;
    if (stopOnFirstPass && result?.passed === true) {
      stopped = true;
      for (const other of records) {
        if (other.status === 'pending') {
          other.status = 'cancelled';
        }
      }
    }
    return cloneRecord(record);
  };

  const fail = (id, vesselId, reason, nowMs) => {
    const record = byId.get(id);
    if (record === undefined) throw new Error(`Item ${id} is not running on vessel ${vesselId}`);
    if (record.status !== 'running' || record.vesselId !== vesselId) {
      throw new Error(`Item ${id} is not running on vessel ${vesselId}`);
    }
    record.failures.push({
      attempt: record.attempt,
      vesselId,
      reason,
      at: nowMs,
    });
    if (record.attempt < maxAttempts) {
      record.status = 'pending';
      record.vesselId = null;
      record.claimedAt = null;
    } else {
      record.status = 'failed';
      record.finishedAt = nowMs;
    }
    return cloneRecord(record);
  };

  const reclaimExpired = (nowMs, leaseMs) => {
    const reclaimed = [];
    for (const record of records) {
      if (record.status === 'running' && nowMs - record.claimedAt >= leaseMs) {
        fail(record.id, record.vesselId, 'lease-expired', nowMs);
        reclaimed.push(record.id);
      }
    }
    return reclaimed;
  };

  const stats = () => {
    const counts = {
      pending: 0,
      running: 0,
      done: 0,
      failed: 0,
      cancelled: 0,
      totalAttempts,
    };
    for (const record of records) {
      counts[record.status] += 1;
    }
    return counts;
  };

  const item = (id) => {
    const record = byId.get(id);
    return record ? cloneRecord(record) : undefined;
  };

  return {
    claim,
    complete,
    fail,
    reclaimExpired,
    stats,
    item,
  };
};
