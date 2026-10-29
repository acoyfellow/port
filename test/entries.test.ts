import { describe, expect, it } from 'vitest';
import { ENTRIES } from '../shared/entries/index';
import { entryDiagram } from '../shared/entry-diagram';

const SECRET_SHAPES = [/[0-9a-f]{32}/, /[a-z0-9.-]+@[a-z0-9-]+\.[a-z]+/i, /cfdata/i, /\.staging\./];

describe('directory entries', () => {
  it('has unique slugs', () => {
    expect(new Set(ENTRIES.map((entry) => entry.slug)).size).toBe(ENTRIES.length);
  });

  it.each(ENTRIES.map((entry) => [entry.slug, entry] as const))(
    '%s: edges point at real parts',
    (_, entry) => {
      const ids = new Set(entry.parts.map((part) => part.id));
      expect(ids.size).toBe(entry.parts.length);
      for (const edge of entry.edges) {
        expect(ids.has(edge.from), edge.from).toBe(true);
        expect(ids.has(edge.to), edge.to).toBe(true);
      }
    },
  );

  it.each(ENTRIES.map((entry) => [entry.slug, entry] as const))('%s: no secret-shaped text', (_, entry) => {
    const text = JSON.stringify(entry);
    for (const shape of SECRET_SHAPES) expect(text).not.toMatch(shape);
  });

  it.each(ENTRIES.map((entry) => [entry.slug, entry] as const))(
    '%s: only installable entries claim ready',
    (_, entry) => {
      expect(entry.install.status === 'ready').toBe(entry.stage === 'installable');
    },
  );

  it.each(ENTRIES.map((entry) => [entry.slug, entry] as const))(
    '%s: diagram renders every part',
    (_, entry) => {
      const svg = entryDiagram(entry);
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg.match(/<rect /g)?.length).toBe(entry.parts.length);
    },
  );
});

describe('entry diagram layout', () => {
  it('lays a loop out left to right instead of stacking it in one column', () => {
    const loop = ENTRIES[0];
    if (loop === undefined) return;
    const parts = ['a', 'b', 'c'].map((id) => ({ id, label: id, detail: id, product: 'worker' as const }));
    const svg = entryDiagram({
      ...loop,
      parts,
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'c', to: 'a' },
      ],
    });
    const xs = new Set([...svg.matchAll(/<rect x="(\d+)"/g)].map((match) => match[1]));
    expect(xs.size).toBe(3);
  });
});
