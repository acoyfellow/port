import type { Entry } from '../../shared/entry';
import { html, type Raw } from './html';

export type ChartPoint = {
  readonly slug: string;
  readonly name: string;
  readonly cents: number;
  readonly minutes: number;
  readonly parts: number;
  readonly container: boolean;
  readonly score: string;
  readonly perfect: boolean;
};

type Placed = ChartPoint & { readonly cx: number; readonly cy: number; readonly r: number };
type Box = { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number };

const WIDTH = 760;
const HEIGHT = 440;
const PAD = { left: 60, right: 120, top: 20, bottom: 48 };
const CENT_TICKS = [5, 10, 20, 40, 80];
const LABEL_HEIGHT = 13;
const CHAR_WIDTH = 6.2;

export const chartPoints = (entries: readonly Entry[]): readonly ChartPoint[] =>
  entries.flatMap((entry) => {
    const run = entry.evalAll;
    if (run === undefined || run.of === 0 || run.usdPerTask <= 0) return [];
    return [
      {
        slug: entry.slug,
        name: entry.name,
        cents: run.usdPerTask * 100,
        minutes: run.medianSeconds / 60,
        parts: entry.parts.length,
        container: entry.parts.some((part) => part.product === 'container'),
        score: `${run.passed}/${run.of}`,
        perfect: run.passed === run.of,
      },
    ];
  });

const overlaps = (a: Box, b: Box) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

const labelText = (point: ChartPoint) => (point.perfect ? point.slug : `${point.slug} ${point.score}`);

const labelBox = (point: Placed, side: 'right' | 'left'): Box => {
  const width = labelText(point).length * CHAR_WIDTH;
  const left = side === 'right' ? point.cx + point.r + 3 : point.cx - point.r - 3 - width;
  return { left, right: left + width, top: point.cy - LABEL_HEIGHT / 2, bottom: point.cy + LABEL_HEIGHT / 2 };
};

const circleBox = (point: Placed): Box => ({
  left: point.cx - point.r,
  right: point.cx + point.r,
  top: point.cy - point.r,
  bottom: point.cy + point.r,
});

const placeLabels = (points: readonly Placed[]) => {
  const taken: Box[] = [];
  const labels = new Map<string, 'right' | 'left'>();
  const byIsolation = [...points].sort((a, b) => neighbours(points, b) - neighbours(points, a)).reverse();
  for (const point of byIsolation) {
    const others = points.filter((other) => other.slug !== point.slug).map(circleBox);
    const side = (['right', 'left'] as const).find((candidate) => {
      const box = labelBox(point, candidate);
      return (
        box.left >= 0 && box.right <= WIDTH && ![...taken, ...others].some((used) => overlaps(box, used))
      );
    });
    if (side === undefined) continue;
    labels.set(point.slug, side);
    taken.push(labelBox(point, side));
  }
  return labels;
};

const neighbours = (points: readonly Placed[], point: Placed) =>
  points.filter((other) => Math.hypot(other.cx - point.cx, other.cy - point.cy) < 40).length;

export const costChart = (entries: readonly Entry[]): Raw => {
  const points = chartPoints(entries);
  if (points.length === 0) return html``;
  const centsLow = Math.min(4, ...points.map((point) => point.cents));
  const centsHigh = Math.max(...points.map((point) => point.cents)) * 1.15;
  const minutesStep = 2;
  const minutesTop = Math.max(
    minutesStep,
    Math.ceil(Math.max(...points.map((point) => point.minutes)) / minutesStep) * minutesStep,
  );
  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const x = (cents: number) =>
    PAD.left + (Math.log(cents / centsLow) / Math.log(centsHigh / centsLow)) * plotWidth;
  const y = (minutes: number) => PAD.top + plotHeight - (minutes / minutesTop) * plotHeight;
  const placed: readonly Placed[] = points.map((point) => ({
    ...point,
    cx: x(point.cents),
    cy: y(point.minutes),
    r: 3 + point.parts * 1.3,
  }));
  const labels = placeLabels(placed);
  const centTicks = CENT_TICKS.filter((cents) => cents >= centsLow && cents <= centsHigh);
  const minuteTicks = Array.from({ length: minutesTop / minutesStep + 1 }, (_, index) => index * minutesStep);
  const drawOrder = [...placed].sort((a, b) => b.r - a.r);
  return html`<figure class="cost-chart">
  <svg viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="AI cost per task against median time per task for every scored shape">
    ${centTicks.map(
      (cents) =>
        html`<line class="grid" x1="${x(cents)}" x2="${x(cents)}" y1="${PAD.top}" y2="${PAD.top + plotHeight}"/><text class="tick" x="${x(cents)}" y="${HEIGHT - PAD.bottom + 18}" text-anchor="middle">${cents}¢</text>`,
    )}
    ${minuteTicks.map(
      (minutes) =>
        html`<line class="grid" x1="${PAD.left}" x2="${PAD.left + plotWidth}" y1="${y(minutes)}" y2="${y(minutes)}"/><text class="tick" x="${PAD.left - 8}" y="${y(minutes) + 4}" text-anchor="end">${minutes} min</text>`,
    )}
    <text class="axis" x="${PAD.left + plotWidth / 2}" y="${HEIGHT - 10}" text-anchor="middle">AI cost per task (log scale)</text>
    <text class="axis" x="14" y="${PAD.top + plotHeight / 2}" text-anchor="middle" transform="rotate(-90 14 ${PAD.top + plotHeight / 2})">median time per task</text>
    ${drawOrder.map((point) => {
      const side = labels.get(point.slug);
      const label =
        side === undefined
          ? ''
          : html`<text x="${side === 'right' ? point.cx + point.r + 3 : point.cx - point.r - 3}" y="${point.cy + 4}" text-anchor="${side === 'right' ? 'start' : 'end'}">${labelText(point)}</text>`;
      return html`<a href="/d/${point.slug}"><g class="dot${point.container ? ' container' : ''}"><title>${point.name}: ${point.cents.toFixed(1)}¢, ${point.minutes.toFixed(1)} min, ${point.parts} parts, coding eval ${point.score}</title><circle cx="${point.cx}" cy="${point.cy}" r="${point.r}"/>${label}</g></a>`;
    })}
  </svg>
  <figcaption><span class="key"><i class="swatch"></i>no container</span><span class="key"><i class="swatch container"></i>container</span><span class="key">bigger dot = more parts</span><span class="key">score shown only when below 5/5</span><span class="key">hover or tap a dot for its name</span></figcaption>
</figure>`;
};
