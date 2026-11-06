import type { Entry } from '../../shared/entry';
import { html } from './html';
import { cents } from './parts';

type Cell = ReturnType<typeof html> | string;
type Value = number | string | undefined;
type Column = {
  readonly key: string;
  readonly label: string;
  readonly cell: (entry: Entry) => Cell;
  readonly value?: (entry: Entry) => Value;
  readonly numeric?: boolean;
};

export type SortDir = 'asc' | 'desc';
export type Sort = { readonly key: string; readonly dir: SortDir };

const DASH = '—';
const INTERNET_LABEL = { off: 'Off', on: 'On', none: 'No shell', allowlist: 'Allow list' } as const;
const INTERNET_RANK = { off: 0, none: 1, allowlist: 2, on: 3 } as const;

const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

const pill = (tone: string, text: string) => html`<span class="pill pill-${tone}">${text}</span>`;

const shapeCell = (entry: Entry) =>
  html`<a class="row-name" href="/d/${entry.slug}"><span><strong>${entry.name}</strong><small>${entry.oneLine}</small></span></a>`;

const COLUMNS: readonly Column[] = [
  { key: 'name', label: 'Shape', cell: shapeCell, value: (entry) => entry.name },
  {
    key: 'isolation',
    label: 'Isolation',
    cell: (entry) => entry.traits?.isolation ?? DASH,
    value: (entry) => entry.traits?.isolation,
  },
  {
    key: 'internet',
    label: 'Internet',
    cell: (entry) =>
      entry.traits === undefined
        ? DASH
        : pill(entry.traits.internet === 'on' ? 'warn' : 'ok', INTERNET_LABEL[entry.traits.internet]),
    value: (entry) => (entry.traits === undefined ? undefined : INTERNET_RANK[entry.traits.internet]),
  },
  {
    key: 'cost',
    label: 'AI cost / run',
    numeric: true,
    cell: (entry) => (entry.build === undefined ? DASH : cents(entry.build.usd)),
    value: (entry) => entry.build?.usd,
  },
  {
    key: 'added',
    label: 'Added',
    cell: (entry) =>
      entry.added === undefined
        ? DASH
        : html`<time datetime="${entry.added}">${shortDate(entry.added)}</time>`,
    value: (entry) => entry.added,
  },
];

type Group = {
  readonly id: string;
  readonly title: string;
  readonly note: string;
  readonly has: (entry: Entry) => boolean;
};

const GROUPS: readonly Group[] = [
  {
    id: 'no-container',
    title: 'No container',
    note: 'Tools run in Durable Objects and isolates. They start instantly.',
    has: (entry) => entry.traits?.startup === 'instant',
  },
  {
    id: 'container',
    title: 'With a container',
    note: 'Tools run in a Linux container with a disk. The first call waits for it to boot.',
    has: (entry) => entry.traits?.startup !== 'instant',
  },
];

const SORTABLE = new Set(COLUMNS.filter((column) => column.value !== undefined).map((column) => column.key));

export const sortOf = (params: URLSearchParams): Sort => {
  const key = params.get('sort') ?? '';
  return { key: SORTABLE.has(key) ? key : '', dir: params.get('dir') === 'desc' ? 'desc' : 'asc' };
};

const compareValues = (x: Value, y: Value) =>
  typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'en');

export const sortRows = (entries: readonly Entry[], sort: Sort): readonly Entry[] => {
  const value = COLUMNS.find((column) => column.key === sort.key)?.value;
  if (value === undefined) return entries;
  return [...entries].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    if (x === undefined) return y === undefined ? 0 : 1;
    if (y === undefined) return -1;
    return sort.dir === 'desc' ? -compareValues(x, y) : compareValues(x, y);
  });
};

const headerCell = (column: Column, sort: Sort) => {
  if (column.value === undefined) return html`<th scope="col" class="col-${column.key}">${column.label}</th>`;
  const active = sort.key === column.key;
  const next: SortDir = active && sort.dir === 'asc' ? 'desc' : 'asc';
  const arrow = active ? (sort.dir === 'asc' ? '↑' : '↓') : '↕';
  return html`<th scope="col" aria-sort="${active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}" class="col-${column.key}${column.numeric ? ' num' : ''}"><a href="/?sort=${column.key}&amp;dir=${next}#directory"${active ? html` class="active"` : ''}>${column.label}<span class="arrow" aria-hidden="true">${arrow}</span></a></th>`;
};

const mobileSort = (sort: Sort) =>
  html`<form class="mobile-sort" method="get" action="/#directory"><label>Sort by <select name="sort" onchange="this.form.submit()">${COLUMNS.filter(
    (column) => column.value !== undefined,
  ).map(
    (column) =>
      html`<option value="${column.key}"${column.key === sort.key ? html` selected` : ''}>${column.label}</option>`,
  )}</select></label><select name="dir" onchange="this.form.submit()" aria-label="Order"><option value="asc"${sort.dir === 'asc' ? html` selected` : ''}>Low to high</option><option value="desc"${sort.dir === 'desc' ? html` selected` : ''}>High to low</option></select><noscript><button type="submit">Sort</button></noscript></form>`;

const groupTable = (group: Group, entries: readonly Entry[], sort: Sort) =>
  html`<section class="dir-group" aria-labelledby="group-${group.id}"><header class="dir-group-head"><h3 id="group-${group.id}">${group.title} <span class="count">${entries.length}</span></h3><p>${group.note}</p></header><div class="table-wrap"><table class="dir-table"><thead><tr>${COLUMNS.map((column) => headerCell(column, sort))}</tr></thead><tbody>${sortRows(
    entries,
    sort,
  ).map(
    (entry) =>
      html`<tr data-entry="${entry.slug}">${COLUMNS.map(
        (column) =>
          html`<td data-label="${column.label}" class="col-${column.key}${column.numeric ? ' num' : ''}">${column.cell(entry)}</td>`,
      )}</tr>`,
  )}</tbody></table></div></section>`;

export const directoryTable = (entries: readonly Entry[], sort: Sort) =>
  html`${mobileSort(sort)}${GROUPS.map((group) => ({ group, members: entries.filter(group.has) }))
    .filter(({ members }) => members.length > 0)
    .map(({ group, members }) => groupTable(group, members, sort))}`;
