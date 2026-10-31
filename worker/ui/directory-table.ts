import type { Entry, Stage } from '../../shared/entry';
import { html } from './html';

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
const STAGE_RANK: Record<Stage, number> = { installable: 0, verified: 1, outlined: 2, idea: 3 };
const STAGE_LABEL: Record<Stage, string> = {
  installable: 'Installable',
  verified: 'Verified',
  outlined: 'Outlined',
  idea: 'Idea',
};
const INTERNET_LABEL = { off: 'Off', on: 'On', none: 'No shell' } as const;
const INTERNET_RANK = { off: 0, none: 1, on: 2 } as const;

const pill = (tone: string, text: string) => html`<span class="pill pill-${tone}">${text}</span>`;

const shapeCell = (entry: Entry) =>
  html`<a class="row-name" href="/d/${entry.slug}"><span class="entry-icon" aria-hidden="true">${entry.mark}</span><span><strong>${entry.name}</strong><small>${entry.oneLine}</small></span></a>`;

const listsCell = (entry: Entry) =>
  html`<details class="row-lists"><summary><span class="ok-text">+${entry.strengths.length}</span> <span class="warn-text">−${entry.limits.length}</span></summary><p class="lists-head">Strengths</p><ul>${entry.strengths.map((item) => html`<li>${item}</li>`)}</ul><p class="lists-head">Limits</p><ul>${entry.limits.map((item) => html`<li>${item}</li>`)}</ul></details>`;

const COLUMNS: readonly Column[] = [
  { key: 'name', label: 'Shape', cell: shapeCell, value: (entry) => entry.name },
  {
    key: 'runs',
    label: 'Tools run in',
    cell: (entry) => entry.traits?.runsIn ?? DASH,
    value: (entry) => entry.traits?.runsIn,
  },
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
    key: 'state',
    label: 'State',
    cell: (entry) => entry.traits?.state ?? DASH,
    value: (entry) => entry.traits?.state,
  },
  {
    key: 'startup',
    label: 'Startup',
    cell: (entry) =>
      entry.traits === undefined
        ? DASH
        : pill(
            entry.traits.startup === 'instant' ? 'ok' : 'plain',
            entry.traits.startup === 'instant' ? 'Instant' : 'Container boot',
          ),
    value: (entry) => (entry.traits === undefined ? undefined : entry.traits.startup === 'instant' ? 0 : 1),
  },
  {
    key: 'cost',
    label: 'Pi cost',
    numeric: true,
    cell: (entry) => (entry.build === undefined ? DASH : `$${entry.build.usd.toFixed(4)}`),
    value: (entry) => entry.build?.usd,
  },
  {
    key: 'time',
    label: 'Pi time',
    numeric: true,
    cell: (entry) => (entry.build === undefined ? DASH : `${entry.build.seconds} s`),
    value: (entry) => entry.build?.seconds,
  },
  {
    key: 'restart',
    label: 'Restart',
    cell: (entry) =>
      entry.build === undefined ? DASH : entry.build.resumed ? pill('ok', 'Resumed') : pill('warn', 'Lost'),
    value: (entry) => (entry.build === undefined ? undefined : entry.build.resumed ? 0 : 1),
  },
  {
    key: 'stage',
    label: 'Stage',
    cell: (entry) => pill(entry.stage === 'installable' ? 'brand' : 'plain', STAGE_LABEL[entry.stage]),
    value: (entry) => STAGE_RANK[entry.stage],
  },
  { key: 'lists', label: 'Pros / cons', cell: listsCell },
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
  if (column.value === undefined) return html`<th scope="col">${column.label}</th>`;
  const active = sort.key === column.key;
  const next: SortDir = active && sort.dir === 'asc' ? 'desc' : 'asc';
  const arrow = active ? (sort.dir === 'asc' ? '↑' : '↓') : '↕';
  return html`<th scope="col" aria-sort="${active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}"${column.numeric ? html` class="num"` : ''}><a href="/?sort=${column.key}&amp;dir=${next}#directory"${active ? html` class="active"` : ''}>${column.label}<span class="arrow" aria-hidden="true">${arrow}</span></a></th>`;
};

const mobileSort = (sort: Sort) =>
  html`<form class="mobile-sort" method="get" action="/#directory"><label>Sort by <select name="sort" onchange="this.form.submit()">${COLUMNS.filter(
    (column) => column.value !== undefined,
  ).map(
    (column) =>
      html`<option value="${column.key}"${column.key === sort.key ? html` selected` : ''}>${column.label}</option>`,
  )}</select></label><select name="dir" onchange="this.form.submit()" aria-label="Order"><option value="asc"${sort.dir === 'asc' ? html` selected` : ''}>Low to high</option><option value="desc"${sort.dir === 'desc' ? html` selected` : ''}>High to low</option></select><noscript><button type="submit">Sort</button></noscript></form>`;

export const directoryTable = (entries: readonly Entry[], sort: Sort) =>
  html`${mobileSort(sort)}<div class="table-wrap"><table class="dir-table"><thead><tr>${COLUMNS.map((column) => headerCell(column, sort))}</tr></thead><tbody>${sortRows(
    entries,
    sort,
  ).map(
    (entry) =>
      html`<tr data-entry="${entry.slug}">${COLUMNS.map(
        (column) =>
          html`<td data-label="${column.label}" class="col-${column.key}${column.numeric ? ' num' : ''}">${column.cell(entry)}</td>`,
      )}</tr>`,
  )}</tbody></table></div>`;
