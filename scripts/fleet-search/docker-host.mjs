import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const resolveDockerHost = (env = process.env, exists = existsSync, home = homedir()) => {
  if (typeof env.DOCKER_HOST === 'string' && env.DOCKER_HOST !== '') {
    if (!env.DOCKER_HOST.startsWith('unix://')) return env.DOCKER_HOST;
    const socket = env.DOCKER_HOST.slice('unix://'.length);
    if (exists(socket)) return env.DOCKER_HOST;
    throw new Error(`DOCKER_HOST socket does not exist: ${socket}`);
  }
  const candidates = [
    join(home, '.colima', 'default', 'docker.sock'),
    join(home, '.colima', 'wa', 'docker.sock'),
    '/var/run/docker.sock',
  ];
  for (const socket of candidates) {
    if (exists(socket)) return `unix://${socket}`;
  }
  throw new Error(`No Docker socket found (checked ${candidates.join(', ')})`);
};
