export const projectCost = (usage, rates) => {
  if (!rates || rates.version !== 1 || !rates.source || !rates.observedAt)
    throw new Error('Pinned pricing source required');
  const cost = { ai: 0, compute: 0, storage: 0, requests: 0, idle: 0 };
  const items = [];
  for (const [name, rate] of Object.entries(rates.meters)) {
    if (!Object.hasOwn(cost, rate.category) || !Number.isFinite(rate.usdPerUnit) || rate.usdPerUnit < 0)
      throw new Error(`Invalid rate: ${name}`);
    const quantity = usage[name];
    if (!Number.isFinite(quantity) || quantity < 0) throw new Error(`Missing usage: ${name}`);
    const usd = quantity * rate.usdPerUnit;
    cost[rate.category] += usd;
    items.push({ meter: name, quantity, usdPerUnit: rate.usdPerUnit, usd });
  }
  if (!items.length || Object.keys(usage).some((name) => !Object.hasOwn(rates.meters, name)))
    throw new Error('Unpriced usage');
  if (
    !Object.keys(cost).every((category) =>
      items.some((item) => rates.meters[item.meter].category === category),
    )
  )
    throw new Error('Incomplete pricing coverage');
  return {
    basis: 'projected-from-measured-usage',
    source: rates.source,
    observedAt: rates.observedAt,
    cost,
    items,
  };
};
