export type ScopeNote = {
  readonly scope: string;
  readonly why: string;
  readonly verified: boolean;
};

export const SCOPES: readonly ScopeNote[] = [
  {
    scope: 'offline_access',
    why: 'Keep the install working without signing in again',
    verified: true,
  },
  { scope: 'user-details.read', why: 'Show who is signed in', verified: true },
  {
    scope: 'account-settings.read',
    why: 'List the accounts you can install on',
    verified: true,
  },
  {
    scope: 'aig.read',
    why: 'Find an AI Gateway with auth on for model calls',
    verified: true,
  },
  {
    scope: 'aig.run',
    why: 'Agents call models through your gateway, on your bill',
    verified: true,
  },
  {
    scope: 'workers_scripts.write',
    why: 'Upload and delete the Workers that make up an install',
    verified: false,
  },
  {
    scope: 'containers.write',
    why: 'Create the shared container pool',
    verified: false,
  },
  {
    scope: 'artifacts.write',
    why: 'Create a git repo per agent workspace',
    verified: false,
  },
  {
    scope: 'workers_kv.write',
    why: 'Store install state and settings',
    verified: false,
  },
  {
    scope: 'd1.write',
    why: 'Per-install database if an entry needs one',
    verified: false,
  },
  {
    scope: 'browser.write',
    why: 'Browser sessions for agents that need a real page',
    verified: false,
  },
];

export const requestedScopes = (): readonly string[] => SCOPES.map((each) => each.scope);
