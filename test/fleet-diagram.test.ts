import { describe, expect, it } from 'vitest';
import { detailFits, diagramSvg, fleetDiagram } from '../shared/fleet-diagram';
import { FLEET_CREATES, fleetWorkerMetadata } from '../shared/fleet-manifest';

const TITLE_BY_BINDING: Record<string, string> = {
  durable_object_namespace: 'Durable Object',
  worker_loader: 'Worker Loader',
  ai: 'Workers AI',
};

const TITLE_BY_RESOURCE: Record<string, string> = {
  worker: 'Fleet Worker',
  'ai-gateway': 'AI Gateway',
};

describe('fleet diagram', () => {
  const diagram = fleetDiagram();
  const titles = diagram.boxes.map((box) => box.title);

  it('draws every binding the installer uploads, except plain values and secrets', () => {
    const drawn = fleetWorkerMetadata('g', 'k')
      .bindings.filter((b) => b.type !== 'plain_text' && b.type !== 'secret_text')
      .map((b) => TITLE_BY_BINDING[b.type]);

    expect(drawn.every((title) => title !== undefined && titles.includes(title))).toBe(true);
  });

  it('draws every resource the installer creates and tears down', () => {
    expect(FLEET_CREATES.every((kind) => titles.includes(TITLE_BY_RESOURCE[kind] ?? '?'))).toBe(true);
  });

  it('draws nothing the installer does not create', () => {
    const known = new Set(['port', ...Object.values(TITLE_BY_BINDING), ...Object.values(TITLE_BY_RESOURCE)]);

    expect(titles.filter((title) => !known.has(title))).toEqual([]);
  });

  it('keeps every box inside the picture and apart from the others', () => {
    for (const box of diagram.boxes) {
      expect(
        box.x >= 0 && box.y >= 0 && box.x + box.w <= diagram.width && box.y + box.h <= diagram.height,
      ).toBe(true);
    }
    for (const a of diagram.boxes)
      for (const b of diagram.boxes)
        if (a !== b)
          expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
  });

  it('fits every caption inside its box', () => {
    expect(diagram.boxes.filter((box) => !detailFits(box)).map((box) => box.title)).toEqual([]);
  });

  it('renders the same SVG every time and never shows a secret', () => {
    const svg = diagramSvg(diagram);

    expect(diagramSvg(fleetDiagram())).toBe(svg);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).not.toContain('secret');
  });
});
