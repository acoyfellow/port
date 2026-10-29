import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(import.meta.dirname, '..', 'shared', 'entries');
const order = ['fleet', 'coil', 'my-ax', 'chat-ax', 'swarm-5', 'terrarium', 'hark', 'skin', 'pi-durable'];
const slugs = readdirSync(dir)
  .filter((name) => name.endsWith('.ts') && name !== 'index.ts')
  .map((name) => name.slice(0, -3))
  .sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
const name = (slug) => `entry_${slug.replaceAll('-', '_')}`;
writeFileSync(
  join(dir, 'index.ts'),
  `import type { Entry } from '../entry.ts';\n${slugs.map((slug) => `import { ENTRY as ${name(slug)} } from './${slug}';`).join('\n')}\n\nexport const ENTRIES: readonly Entry[] = [${slugs.map(name).join(', ')}];\n`,
);
console.log(`entries: ${slugs.join(', ')}`);
