import type { Entry } from '../entry.ts';

export const ENTRY: Entry = {
  slug: 'grounded-bug-arena',
  mark: 'GA',
  name: 'Grounded bug arena',
  oneLine:
    'Plant bugs in small circuits, let any agent hunt them, and accept a claim only if replay proves the fix.',
  stage: 'outlined',
  shape: '1 task = 1 planted circuit; 1 claim = 1 replay check, no judge model',
  parts: [
    {
      id: 'api',
      label: 'Arena Worker',
      detail: 'serves tasks, takes claims, returns a grounded verdict',
      product: 'worker',
    },
    {
      id: 'planter',
      label: 'Planter',
      detail: 'seeded mutations: flipped compare, AND/OR, min/max, select swap, one number',
      product: 'worker',
    },
    {
      id: 'judge',
      label: 'Replay judge',
      detail: 'runs reference and patched circuit over the same input journals, about 1 ms per claim',
      product: 'worker',
    },
    {
      id: 'parse',
      label: 'Clef and Clairic',
      detail: 'turn free-text claims into a bug flag, kind and line',
      product: 'workers-ai',
    },
    {
      id: 'ledger',
      label: 'Score ledger',
      detail: 'one row per claim: found, wrong line, false alarm',
      product: 'd1',
    },
  ],
  edges: [
    { from: 'api', to: 'planter', label: 'new task' },
    { from: 'api', to: 'parse', label: 'free-text claim' },
    { from: 'api', to: 'judge', label: 'line and fix' },
    { from: 'judge', to: 'ledger', label: 'verdict' },
  ],
  strengths: [
    'Ground truth is exact: every planted bug has a known line and value',
    'A claim counts only if the file misbehaves and the claimed fix restores the reference behaviour',
    'Clean copies of each task measure false alarms, not only finds',
    'Bugs that change no behaviour are found by replay and left out of the score',
  ],
  limits: [
    'Works only where a reference behaviour exists; real code needs a spec in its place',
    'Two thirds of planted bugs are number changes, so the bug mix is narrow',
    'Measured on 21 toy circuits and 52 visible bugs, one model at a time',
    'Not deployed: the replay judge runs on a laptop today',
  ],
  install: {
    status: 'planned',
    plan: 'One Worker with the circuit runtime bundled, a D1 ledger and a Workers AI binding for Clef and Clairic. GET /task returns a planted circuit; POST /claim parses and replays the claim and returns found, wrong-line or false-alarm. No containers.',
  },
  evalPlan:
    'port would serve 52 visible planted bugs and 52 clean copies to the agent under test, then report finds, grounded precision and false alarms per bug kind.',
  source: 'marionette/spikes/arena',
};
