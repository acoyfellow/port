import type { Edge, Entry, Part } from './entry.ts';

const BOX_W = 190;
const BOX_H = 64;
const COL_GAP = 70;
const ROW_GAP = 22;
const PAD = 24;

type Placed = { readonly part: Part; readonly x: number; readonly y: number };

const depthOf = (parts: readonly Part[], edges: readonly Edge[]) => {
  const incoming = new Set(edges.map((edge) => edge.to));
  const roots = parts.filter((part) => !incoming.has(part.id)).map((part) => part.id);
  const depth = new Map<string, number>();
  const queue = roots.length > 0 ? roots : parts.slice(0, 1).map((part) => part.id);
  for (const id of queue) depth.set(id, 0);
  while (queue.length > 0) {
    const id = queue.shift() ?? '';
    const next = (depth.get(id) ?? 0) + 1;
    for (const edge of edges) {
      if (edge.from === id && !depth.has(edge.to)) {
        depth.set(edge.to, next);
        queue.push(edge.to);
      }
    }
  }
  for (const part of parts) if (!depth.has(part.id)) depth.set(part.id, 0);
  return depth;
};

const place = (entry: Entry): readonly Placed[] => {
  const depth = depthOf(entry.parts, entry.edges);
  const columns = new Map<number, Part[]>();
  for (const part of entry.parts) {
    const column = depth.get(part.id) ?? 0;
    columns.set(column, [...(columns.get(column) ?? []), part]);
  }
  const tallest = Math.max(1, ...[...columns.values()].map((column) => column.length));
  const height = tallest * BOX_H + (tallest - 1) * ROW_GAP;
  return [...columns.entries()].flatMap(([column, parts]) => {
    const own = parts.length * BOX_H + (parts.length - 1) * ROW_GAP;
    const top = PAD + (height - own) / 2;
    return parts.map((part, row) => ({
      part,
      x: PAD + column * (BOX_W + COL_GAP),
      y: top + row * (BOX_H + ROW_GAP),
    }));
  });
};

const escapeXml = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

const wrap = (text: string, width: number) => {
  const lines: string[] = [];
  for (const word of text.split(' ')) {
    const last = lines.at(-1);
    if (last !== undefined && `${last} ${word}`.length <= width) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
};

const box = ({ part, x, y }: Placed) => {
  const lines = wrap(part.detail, 34);
  const detail = lines.length > 2 ? [lines[0] ?? '', `${(lines[1] ?? '').slice(0, 31)}…`] : lines;
  return `<g><title>${escapeXml(`${part.label}: ${part.detail}`)}</title><rect x="${x}" y="${y}" width="${BOX_W}" height="${BOX_H}" rx="8" class="box ${part.product}"/><text x="${x + 12}" y="${y + 22}" class="label">${escapeXml(part.label)}</text>${detail
    .map(
      (line, index) =>
        `<text x="${x + 12}" y="${y + 40 + index * 13}" class="detail">${escapeXml(line)}</text>`,
    )
    .join('')}</g>`;
};

const arrow = (from: Placed, to: Placed) => {
  const forward = to.x > from.x;
  const x1 = forward ? from.x + BOX_W : from.x + BOX_W / 2;
  const y1 = forward ? from.y + BOX_H / 2 : from.y + BOX_H;
  const x2 = forward ? to.x : to.x + BOX_W / 2;
  const y2 = forward ? to.y + BOX_H / 2 : to.y;
  const mid = forward
    ? `C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2}`
    : `C${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2}`;
  return `<path d="M${x1},${y1} ${mid} ${x2},${y2}" class="edge" marker-end="url(#head)"/>`;
};

const STYLE =
  '.box{fill:#fff;stroke:#1b1b1b;stroke-width:1.2}.box.container{stroke:#c2410c}.box.durable-object,.box.workflow{stroke:#6d4aff}.box.external{stroke-dasharray:4 3}.label{font:600 12.5px system-ui,sans-serif;fill:#1b1b1b}.detail{font:10.5px system-ui,sans-serif;fill:#5c5c5c}.edge{fill:none;stroke:#8a7cf0;stroke-width:1.3}@media (prefers-color-scheme:dark){.box{fill:#1c1c1e;stroke:#d8d8d8}.label{fill:#f2f2f2}.detail{fill:#a8a8a8}}';

export const entryDiagram = (entry: Entry) => {
  const placed = place(entry);
  const byId = new Map(placed.map((each) => [each.part.id, each]));
  const width = Math.max(...placed.map((each) => each.x + BOX_W), BOX_W) + PAD;
  const height = Math.max(...placed.map((each) => each.y + BOX_H), BOX_H) + PAD;
  const edges = entry.edges.flatMap((edge) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    return from === undefined || to === undefined || from === to ? [] : [arrow(from, to)];
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeXml(`${entry.name}: ${entry.shape}`)}"><style>${STYLE}</style><defs><marker id="head" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#8a7cf0"/></marker></defs>${edges.join('')}${placed.map(box).join('')}</svg>`;
};
