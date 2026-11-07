import * as Schema from 'effect/Schema';
import { fileTask, runPiSmoke } from '../kit/pi-smoke.ts';
import { type Client, pause } from '../kit/smoke.ts';

const SeatState = Schema.Struct({
  seat: Schema.Number,
  user: Schema.String,
  osPid: Schema.Number,
  starts: Schema.Number,
});
const FleetState = Schema.Struct({ supervisor: Schema.String, seats: Schema.Array(SeatState) });
const Started = Schema.Struct({ request: Schema.String });
const Status = Schema.Struct({ status: Schema.String });
const Probe = Schema.Record(Schema.String, Schema.Unknown);
const Killed = Schema.Struct({ killed: Schema.Number, osPid: Schema.Number });
const Files = Schema.Record(Schema.String, Schema.String);

const NEIGHBOURS = 2;
const stamp = Date.now();
const neighbours = Array.from({ length: NEIGHBOURS }, (_, index) => `beam-n${index}-${stamp}`);

type Observed = {
  killedSeat: number;
  killedPid: number;
  before: readonly (typeof SeatState.Type)[];
  neighbourSeats: number[];
};
const observed: Observed = { killedSeat: 0, killedPid: 0, before: [], neighbourSeats: [] };

const seatOfAgent = async (api: Client, agent: string) =>
  Number((await api.get(`/probe?agent=${agent}`, Probe, { tries: 60 })).seat);

const waitDone = async (api: Client, agent: string) => {
  for (let check = 0; check < 150; check++) {
    const status = await api.get(`/status?agent=${agent}`, Status, { tries: 60 });
    if (status.status !== 'running') return status.status;
    await pause(4000);
  }
  return 'running';
};

await runPiSmoke({
  slug: 'beam-fleet',
  restartAfterMs: 8000,
  task: fileTask,
  midTask: async (api, agent) => {
    for (const name of neighbours)
      await api.post(`/run?agent=${name}`, Started, { body: { prompt: fileTask.prompt } });
    observed.killedSeat = await seatOfAgent(api, agent);
    observed.neighbourSeats = await Promise.all(neighbours.map((name) => seatOfAgent(api, name)));
    observed.before = (await api.get('/fleet', FleetState)).seats;
    observed.killedPid = (await api.post(`/fleet/kill/${observed.killedSeat}`, Killed)).osPid;
  },
  afterTask: async (api) => {
    const neighbourStatus = await Promise.all(neighbours.map((name) => waitDone(api, name)));
    const neighbourFiles = await Promise.all(
      neighbours.map((name) => api.get(`/files?agent=${name}`, Files, { tries: 30 })),
    );
    const after = (await api.get('/fleet', FleetState)).seats;
    const startsOf = (list: readonly (typeof SeatState.Type)[], seat: number) =>
      list.find((each) => each.seat === seat)?.starts ?? 0;
    const others = after.filter((each) => each.seat !== observed.killedSeat);
    return {
      killedSeat: observed.killedSeat,
      killedPid: observed.killedPid,
      killedStartsBefore: startsOf(observed.before, observed.killedSeat),
      killedStartsAfter: startsOf(after, observed.killedSeat),
      otherSeatsRestarted: others.filter((each) => each.starts !== startsOf(observed.before, each.seat))
        .length,
      neighbourSeats: observed.neighbourSeats.join(', '),
      neighboursDone: neighbourStatus.filter((status) => status === 'done').length,
      neighboursPassed: neighbourFiles.filter((files) => fileTask.passed(files, '')).length,
    };
  },
  infrastructure: (probe) => {
    const ok =
      probe.supervisor === 'one_for_one' &&
      probe.user === `agent${String(probe.seat)}` &&
      probe.neighbourDenied === true &&
      Number(probe.killedStartsAfter) === Number(probe.killedStartsBefore) + 1 &&
      Number(probe.otherSeatsRestarted) === 0 &&
      Number(probe.neighboursPassed) === NEIGHBOURS;
    return {
      ok,
      claim: `A Gleam supervisor (one_for_one) ran 5 tool processes in one container, each as its own Unix user. Mid-task, the tool process of seat ${String(probe.killedSeat)} (pid ${String(probe.killedPid)}) was killed: the supervisor restarted only that seat (starts ${String(probe.killedStartsBefore)} to ${String(probe.killedStartsAfter)}), ${String(probe.otherSeatsRestarted)} other seats restarted, and ${String(probe.neighboursPassed)} of ${NEIGHBOURS} other agents running at the same time (seats ${String(probe.neighbourSeats)}) finished their task. Seat ${String(probe.seat)} ran as ${String(probe.user)} and reading ${String(probe.neighbour)} was denied.`,
    };
  },
});
