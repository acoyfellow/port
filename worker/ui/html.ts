const RAW = Symbol('raw');

export type Raw = { readonly [RAW]: string };

export type Part = Raw | string | number | null | undefined | false | readonly Part[];

export const raw = (text: string): Raw => ({ [RAW]: text });

const isRaw = (part: unknown): part is Raw => typeof part === 'object' && part !== null && RAW in part;

export const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

const render = (part: Part): string => {
  if (part === null || part === undefined || part === false) return '';
  if (isRaw(part)) return part[RAW];
  if (Array.isArray(part)) return part.map(render).join('');
  return escapeHtml(String(part));
};

export const html = (strings: TemplateStringsArray, ...parts: readonly Part[]): Raw =>
  raw(
    strings.reduce((out, text, index) => out + text + (index < parts.length ? render(parts[index]) : ''), ''),
  );

export const renderHtml = (part: Part) => render(part);
