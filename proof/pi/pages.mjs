import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SITE = 'https://port.customer0.dev';
const shapesDir = join(import.meta.dirname, '..', '..', 'shapes');

export const shapeSlugs = () =>
  readdirSync(shapesDir).filter((name) => existsSync(join(shapesDir, name, 'shape.ts')));

export const missingPiPages = async (slugs) => {
  const missing = [];
  for (const slug of slugs) {
    const response = await fetch(`${SITE}/d/${slug}`);
    const page = await response.text();
    const ok =
      response.ok &&
      page.includes('src="/pi-logo.svg"') &&
      page.includes('href="https://pi.dev"') &&
      page.includes('Runs on') &&
      page.includes('pi-durable 1.4.0');
    if (!ok) missing.push(`${slug} (HTTP ${response.status})`);
  }
  const logo = await fetch(`${SITE}/pi-logo.svg`);
  if (!logo.ok) missing.push(`pi-logo.svg (HTTP ${logo.status})`);
  return missing;
};

if (process.argv[1] === import.meta.filename) {
  const slugs = shapeSlugs();
  const missing = await missingPiPages(slugs);
  console.log(
    missing.length === 0 ? `pages: PASS (${slugs.length} shapes)` : `pages: FAIL ${missing.join(', ')}`,
  );
  process.exit(missing.length === 0 ? 0 : 1);
}
