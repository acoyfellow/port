import { runPiSmoke } from '../kit/pi-smoke.ts';

const note = `buy milk ${Date.now() % 10_000}`;
const recipient = 'team@example.com';

await runPiSmoke({
  slug: 'gadget-workspace',
  restartAfterMs: 8000,
  task: {
    prompt: `Turn the gadget into a notes app. POST /add with JSON {"text": "..."} stores a note in SQLite. GET /list returns JSON {"notes": [...]} with every note text. POST /share emails the note count to the address in JSON {"to": "..."} through this.env.OUTBOX.send(to, "N notes") and returns what OUTBOX answered. Then use call_gadget to add the note "${note}", list the notes, and share to ${recipient}.`,
    passed: (files) => (files['gadget/server.js'] ?? '').includes('OUTBOX'),
    describe: 'built a notes gadget in a facet, stored a note and shared it through the gatekeeper',
  },
  infrastructure: (probe) => {
    const list = String(probe.list ?? '');
    const pending = Number(probe.pending ?? 0);
    const delivered = Number(probe.delivered ?? -1);
    const internet = String(probe.sandboxInternet ?? '');
    const bindings = String(probe.sandboxBindings ?? '');
    const ok =
      list.includes(note) &&
      pending >= 1 &&
      delivered === 0 &&
      String(probe.recipients ?? '').includes(recipient) &&
      probe.gateHoldsKey === true &&
      probe.workspaceHasKey === false &&
      internet.startsWith('blocked') &&
      bindings === 'OUTBOX';
    return {
      ok,
      claim: `The gadget ran as a Durable Object facet and kept "${note}" in its own storage. Its email went to the gatekeeper, which queued ${pending} action for a person to approve and delivered ${delivered}. Only the gatekeeper Worker holds the delivery key. A sandboxed gadget saw bindings [${bindings}] and its internet was ${internet.slice(0, 60)}.`,
    };
  },
});
