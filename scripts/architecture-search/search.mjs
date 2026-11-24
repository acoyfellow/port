import { createHash } from 'node:crypto';

export const configurationKey = (configuration) =>
  createHash('sha256')
    .update(
      JSON.stringify(
        Object.fromEntries(Object.entries(configuration).sort(([a], [b]) => a.localeCompare(b))),
      ),
    )
    .digest('hex');

export const neighbors = (configuration, domains, valid = () => true) => {
  if (!configuration || Object.keys(configuration).sort().join() !== Object.keys(domains).sort().join())
    throw new Error('Configuration does not match search dimensions');
  for (const [name, values] of Object.entries(domains)) {
    if (!Array.isArray(values) || values.length === 0 || !values.includes(configuration[name]))
      throw new Error(`Invalid search dimension: ${name}`);
  }
  const proposals = [];
  for (const name of Object.keys(domains).sort()) {
    for (const value of domains[name]) {
      if (value === configuration[name]) continue;
      const candidate = { ...configuration, [name]: value };
      if (valid(candidate)) proposals.push(candidate);
    }
  }
  return proposals;
};

export const propose = ({
  incumbent,
  domains,
  attempted,
  generation,
  exploratory = [],
  valid,
  maximum = 2,
}) => {
  if (!Number.isSafeInteger(generation) || generation < 0 || !Number.isSafeInteger(maximum) || maximum < 1)
    throw new Error('Invalid search bounds');
  const seen = new Set(attempted.map(configurationKey));
  const local = neighbors(incumbent, domains, valid);
  const distant = exploratory.filter((candidate) => {
    neighbors(candidate, domains, valid);
    return valid === undefined || valid(candidate);
  });
  const queue = generation % 3 === 2 ? [...distant, ...local] : [...local, ...distant];
  const chosen = [];
  for (const candidate of queue) {
    const key = configurationKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    chosen.push(candidate);
    if (chosen.length >= maximum) break;
  }
  return chosen;
};
