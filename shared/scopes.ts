export type ScopeNote = {
  readonly scope: string;
  readonly why: string;
};

export const SCOPES: readonly ScopeNote[] = [
  { scope: 'offline_access', why: 'Keep installs working without signing in again' },
  { scope: 'user-details.read', why: 'Show who is signed in' },
  { scope: 'account-settings.read', why: 'List the accounts you can install on' },
  { scope: 'workers-scripts.edit', why: 'Upload and delete the Workers that make up an install' },
  { scope: 'containers.write', why: 'Create the shared container pool' },
  { scope: 'artifacts.write', why: 'Create a git repo per agent workspace' },
  { scope: 'workers-kv-storage.write', why: 'Store install state and settings' },
  { scope: 'd1.write', why: 'A database per install, when an entry needs one' },
  { scope: 'workers-r2.write', why: 'File storage per install' },
  { scope: 'queues.write', why: 'Background work that runs on your account' },
  { scope: 'browser-rendering.write', why: 'Browser sessions for agents that need a real page' },
  { scope: 'secrets-store.write', why: 'Secrets an install needs, kept on your account' },
  { scope: 'workers-routes.write', why: 'Hostnames for installs' },
  { scope: 'workers-tail.read', why: 'Read live logs to check an install works' },
  { scope: 'workers-observability.write', why: 'Logs and traces for evaluating an install' },
  { scope: 'ai.read', why: 'Run Workers AI models on your account' },
  { scope: 'aig.write', why: 'Create an AI Gateway for the install if you have none' },
  { scope: 'aig.run', why: 'Agents call models through your gateway, on your bill' },
];
