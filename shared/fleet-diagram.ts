import { type FleetBinding, fleetBindings } from './fleet-manifest';

type Box = {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly tone: 'yours' | 'port' | 'outside';
};

type Edge = { readonly from: string; readonly to: string; readonly label: string };

export type { Box };

export type Diagram = {
  readonly width: number;
  readonly height: number;
  readonly boxes: readonly Box[];
  readonly edges: readonly Edge[];
};

const WIDTH = 920;
const HEIGHT = 520;
const ACCOUNT = { x: 220, y: 24, w: 676, h: 472 };

const bindingBox = (binding: FleetBinding, index: number): Box | null => {
  const column = { x: 652, w: 220, h: 80 };
  const y = 76 + index * 104;
  switch (binding.type) {
    case 'durable_object_namespace':
      return {
        id: binding.name,
        title: 'Durable Object',
        detail: `${binding.class_name}, one per agent: loop, files`,
        x: column.x,
        y,
        w: column.w,
        h: column.h,
        tone: 'yours',
      };
    case 'worker_loader':
      return {
        id: binding.name,
        title: 'Worker Loader',
        detail: 'tests run in a fresh isolate',
        x: column.x,
        y,
        w: column.w,
        h: column.h,
        tone: 'yours',
      };
    case 'ai':
      return {
        id: binding.name,
        title: 'Workers AI',
        detail: 'model calls on your bill',
        x: column.x,
        y,
        w: column.w,
        h: column.h,
        tone: 'yours',
      };
    case 'plain_text':
    case 'secret_text':
      return null;
  }
};

export const fleetDiagram = (): Diagram => {
  const bindings = fleetBindings('port-fleet-<id>', 'secret');
  const drawn = bindings.filter((binding) => bindingBox(binding, 0) !== null);
  const placed = drawn.flatMap((binding, order) => {
    const box = bindingBox(binding, order);
    return box === null ? [] : [box];
  });
  const gateway: Box = {
    id: 'GATEWAY',
    title: 'AI Gateway',
    detail: 'port-fleet-<id>: logs and limits',
    x: 652,
    y: 76 + placed.length * 104,
    w: 220,
    h: 80,
    tone: 'yours',
  };
  const worker: Box = {
    id: 'WORKER',
    title: 'Fleet Worker',
    detail: 'port-fleet-<id>.workers.dev',
    x: 364,
    y: 220,
    w: 220,
    h: 80,
    tone: 'yours',
  };
  const port: Box = {
    id: 'PORT',
    title: 'port',
    detail: 'installs, runs and tears down with your sign-in',
    x: 24,
    y: 212,
    w: 172,
    h: 96,
    tone: 'port',
  };

  return {
    width: WIDTH,
    height: HEIGHT,
    boxes: [port, worker, ...placed, gateway],
    edges: [
      { from: 'PORT', to: 'WORKER', label: 'upload, run, delete' },
      ...placed.map((box) => ({ from: 'WORKER', to: box.id, label: '' })),
      { from: 'AI', to: 'GATEWAY', label: '' },
    ],
  };
};

const escapeXml = (text: string) => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

const TONES = {
  yours: { fill: '#ffffff', stroke: '#18181b', text: '#18181b', detail: '#6b6b70' },
  port: { fill: '#18181b', stroke: '#18181b', text: '#ffffff', detail: '#c9c9cf' },
  outside: { fill: '#f4f4f2', stroke: '#a1a1a6', text: '#18181b', detail: '#6b6b70' },
} as const;

const DETAIL_CHAR_WIDTH = 6.4;

const DETAIL_LINE_HEIGHT = 15;

export const detailLines = (box: Box): string[] => {
  const perLine = Math.floor((box.w - 28) / DETAIL_CHAR_WIDTH);
  const lines: string[] = [];
  for (const word of box.detail.split(' ')) {
    const last = lines.at(-1);
    if (last !== undefined && `${last} ${word}`.length <= perLine)
      lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
};

export const detailFits = (box: Box) => {
  const lines = detailLines(box);
  const widest = Math.max(...lines.map((line) => line.length)) * DETAIL_CHAR_WIDTH;
  return widest <= box.w - 28 && 46 + (lines.length - 1) * DETAIL_LINE_HEIGHT <= box.h - 8;
};

const anchor = (box: Box, side: 'left' | 'right') => ({
  x: side === 'left' ? box.x : box.x + box.w,
  y: box.y + box.h / 2,
});

const edgePath = (from: Box, to: Box) => {
  const start = anchor(from, from.x < to.x ? 'right' : 'left');
  const end =
    from.x === to.x ? { x: to.x + to.w / 2, y: to.y } : anchor(to, from.x < to.x ? 'left' : 'right');
  if (from.x === to.x) {
    const s = { x: from.x + from.w / 2, y: from.y + from.h };
    return `M${s.x} ${s.y} L${end.x} ${end.y}`;
  }
  const mid = (start.x + end.x) / 2;
  return `M${start.x} ${start.y} C${mid} ${start.y} ${mid} ${end.y} ${end.x} ${end.y}`;
};

export const diagramSvg = (diagram: Diagram, accent = '#7c5cff'): string => {
  const byId = new Map(diagram.boxes.map((box) => [box.id, box]));
  const edges = diagram.edges
    .flatMap((edge) => {
      const from = byId.get(edge.from);
      const to = byId.get(edge.to);
      if (from === undefined || to === undefined) return [];
      const label =
        edge.label === ''
          ? ''
          : `<text x="${(from.x + from.w + to.x) / 2}" y="${from.y + from.h / 2 - 10}" text-anchor="middle" font-size="12" fill="#6b6b70">${escapeXml(edge.label)}</text>`;
      return [
        `<path d="${edgePath(from, to)}" fill="none" stroke="${accent}" stroke-width="1.6" marker-end="url(#arrow)"/>${label}`,
      ];
    })
    .join('');
  const boxes = diagram.boxes
    .map((box) => {
      const tone = TONES[box.tone];
      return `<g><rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="10" fill="${tone.fill}" stroke="${tone.stroke}" stroke-width="1.2"/><text x="${box.x + 14}" y="${box.y + 26}" font-size="15" font-weight="600" fill="${tone.text}">${escapeXml(box.title)}</text>${detailLines(
        box,
      )
        .map(
          (line, index) =>
            `<text x="${box.x + 14}" y="${box.y + 46 + index * DETAIL_LINE_HEIGHT}" font-size="11.5" fill="${tone.detail}">${escapeXml(line)}</text>`,
        )
        .join('')}</g>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${diagram.width} ${diagram.height}" role="img" aria-label="What the agent fleet creates on your Cloudflare account" font-family="Google Sans Flex, system-ui, sans-serif"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${accent}"/></marker></defs><rect x="${ACCOUNT.x}" y="${ACCOUNT.y}" width="${ACCOUNT.w}" height="${ACCOUNT.h}" rx="16" fill="#fafaf9" stroke="#d4d4d0" stroke-dasharray="5 5"/><text x="${ACCOUNT.x + 18}" y="${ACCOUNT.y + 28}" font-size="12" font-weight="600" fill="#6b6b70" letter-spacing=".04em">YOUR CLOUDFLARE ACCOUNT</text>${edges}${boxes}</svg>`;
};
