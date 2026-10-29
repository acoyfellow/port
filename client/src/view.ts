import type { Html, HtmlBuilder } from 'foldkit/html';
import { CATALOG, type Entry, type Readiness } from '../../shared/catalog';
import { Message } from './message';
import type { Filter, Model, Who } from './model';

type H = HtmlBuilder<Message>;

const READINESS_LABEL: Record<Readiness, string> = {
  installable: 'Ready to install',
  building: 'Being built',
  planned: 'Planned',
};

const READINESS_CLASS: Record<Readiness, string> = {
  installable: 'bg-ok/10 text-ok border-ok/30',
  building: 'bg-life-soft text-life border-life-line',
  planned: 'bg-raised text-faint border-line',
};

const FILTERS: readonly [Filter, string][] = [
  ['all', 'All'],
  ['installable', 'Ready'],
  ['building', 'Being built'],
  ['planned', 'Planned'],
];

const visible = (model: Model): readonly Entry[] =>
  model.filter === 'all' ? CATALOG : CATALOG.filter((entry) => entry.readiness === model.filter);

const badge = (h: H, readiness: Readiness): Html =>
  h.span(
    [
      h.Class(
        `inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${READINESS_CLASS[readiness]}`,
      ),
    ],
    [READINESS_LABEL[readiness]],
  );

const signInLink = (h: H): Html =>
  h.a(
    [
      h.Href('/oauth/start'),
      h.Class('rounded-md bg-accent px-3 py-1.5 text-sm text-accent-ink hover:opacity-90'),
    ],
    ['Sign in with Cloudflare'],
  );

const signedIn = (h: H, who: Extract<Who, { _tag: 'SignedIn' }>): Html =>
  h.div(
    [h.Class('flex items-center gap-3 text-sm')],
    [
      h.span(
        [h.Class('text-dim'), h.DataAttribute('who', 'signed-in')],
        [who.email ?? 'Signed in', who.account === null ? '' : ` · ${who.account.name ?? who.account.id}`],
      ),
      ...(who.account === null
        ? [h.a([h.Href('/oauth/account'), h.Class('underline')], ['Pick an account'])]
        : []),
      h.form(
        [h.Method('post'), h.Action('/oauth/logout')],
        [
          h.button(
            [h.Type('submit'), h.Class('rounded-md border border-line px-3 py-1.5 hover:border-line-strong')],
            ['Sign out'],
          ),
        ],
      ),
    ],
  );

const account = (h: H, who: Who): Html => {
  switch (who._tag) {
    case 'Checking':
      return h.span([h.Class('text-sm text-faint')], ['…']);
    case 'SignedOut':
      return signInLink(h);
    case 'SignedIn':
      return signedIn(h, who);
  }
};

const header = (h: H, model: Model): Html =>
  h.header(
    [h.Class('flex items-center justify-between border-b border-line px-6 py-4')],
    [
      h.a(
        [h.Href('/'), h.Class('flex items-center gap-2 text-base font-semibold tracking-tight')],
        [h.img([h.Src('/brand/favicon.svg'), h.Alt(''), h.Class('h-6 w-6')]), 'port'],
      ),
      account(h, model.who),
    ],
  );

const intro = (h: H): Html =>
  h.section(
    [h.Class('px-6 pt-10 pb-6 max-w-3xl')],
    [
      h.h1([h.Class('text-2xl font-semibold tracking-tight')], ['Agent infra for your Cloudflare account']),
      h.p(
        [h.Class('mt-2 text-dim')],
        [
          'Pick something below. Preview it on your own account, keep it, or tear it down. Everything runs on your account and your bill. port only holds the install button.',
        ],
      ),
    ],
  );

const filters = (h: H, model: Model): Html =>
  h.nav(
    [h.Class('flex gap-2 px-6 pb-4'), h.AriaLabel('Filter')],
    FILTERS.map(([value, label]) =>
      h.button(
        [
          h.Type('button'),
          h.OnClick(Message.PickedFilter({ filter: value })),
          h.AriaPressed(model.filter === value ? 'true' : 'false'),
          h.Class(
            `rounded-full border px-3 py-1 text-sm ${
              model.filter === value
                ? 'border-ink bg-ink text-bg'
                : 'border-line text-dim hover:border-line-strong'
            }`,
          ),
        ],
        [label],
      ),
    ),
  );

const card = (h: H, entry: Entry): Html =>
  h.li(
    [h.Class('list-none')],
    [
      h.button(
        [
          h.Type('button'),
          h.OnClick(Message.OpenedEntry({ slug: entry.slug })),
          h.Class(
            'flex h-full w-full flex-col gap-3 rounded-lg border border-line bg-panel p-4 text-left hover:border-line-strong',
          ),
          h.DataAttribute('entry', entry.slug),
        ],
        [
          h.div(
            [h.Class('flex items-center justify-between gap-2')],
            [h.h2([h.Class('font-semibold')], [entry.name]), badge(h, entry.readiness)],
          ),
          h.p([h.Class('text-sm text-dim')], [entry.oneLine]),
          h.div(
            [h.Class('mt-auto flex flex-wrap gap-1')],
            entry.resources.map((resource) =>
              h.span(
                [h.Class('rounded bg-raised px-1.5 py-0.5 font-mono text-xs text-faint')],
                [resource.kind],
              ),
            ),
          ),
        ],
      ),
    ],
  );

const grid = (h: H, model: Model): Html =>
  h.ul(
    [h.Class('grid gap-3 px-6 pb-16 sm:grid-cols-2 lg:grid-cols-3')],
    visible(model).map((entry) => card(h, entry)),
  );

const detail = (h: H, entry: Entry): Html =>
  h.div(
    [
      h.Class('fixed inset-0 z-10 flex items-end justify-center bg-black/40 sm:items-center'),
      h.OnClick(Message.ClosedEntry()),
    ],
    [
      h.div(
        [
          h.Role('dialog'),
          h.AriaModal(true),
          h.AriaLabel(entry.name),
          h.Class('max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-t-xl bg-bg p-6 sm:rounded-xl'),
          h.OnClick(Message.Ignored(), { propagation: 'Stop' }),
          h.OnKeyDown((key) => (key === 'Escape' ? Message.ClosedEntry() : Message.Ignored())),
        ],
        [
          h.div(
            [h.Class('flex items-center justify-between gap-2')],
            [h.h2([h.Class('text-xl font-semibold')], [entry.name]), badge(h, entry.readiness)],
          ),
          h.p([h.Class('mt-2 text-dim')], [entry.oneLine]),
          h.h3([h.Class('mt-6 text-sm font-semibold')], ['What it creates on your account']),
          h.ul(
            [h.Class('mt-2 space-y-1 text-sm')],
            entry.resources.map((resource) =>
              h.li(
                [],
                [
                  h.span([h.Class('font-mono')], [resource.kind]),
                  h.span([h.Class('text-dim')], [` · ${resource.why}`]),
                ],
              ),
            ),
          ),
          h.h3([h.Class('mt-6 text-sm font-semibold')], ['Permissions it uses']),
          h.p([h.Class('mt-2 font-mono text-xs text-dim')], [entry.scopes.join('  ')]),
          h.h3([h.Class('mt-6 text-sm font-semibold')], ['Fixed monthly cost on your account']),
          h.p([h.Class('mt-1 text-sm text-dim')], [`About $${entry.monthlyFloorUsd}, plus what agents use`]),
          ...(entry.evidence.length === 0
            ? []
            : [
                h.h3([h.Class('mt-6 text-sm font-semibold')], ['Why this shape']),
                h.ul(
                  [h.Class('mt-2 list-disc space-y-1 pl-5 text-sm text-dim')],
                  entry.evidence.map((line) => h.li([], [line])),
                ),
              ]),
          h.div(
            [h.Class('mt-8 flex gap-2')],
            [
              entry.readiness === 'installable'
                ? h.a(
                    [
                      h.Href('/installs'),
                      h.Class('rounded-md bg-accent px-4 py-2 text-sm text-accent-ink hover:opacity-90'),
                    ],
                    ['Install on my account'],
                  )
                : h.button(
                    [
                      h.Type('button'),
                      h.Disabled(true),
                      h.Class(
                        'cursor-not-allowed rounded-md bg-accent px-4 py-2 text-sm text-accent-ink opacity-40',
                      ),
                    ],
                    ['Not ready yet'],
                  ),
              h.button(
                [
                  h.Type('button'),
                  h.OnClick(Message.ClosedEntry()),
                  h.Class('rounded-md border border-line px-4 py-2 text-sm'),
                ],
                ['Close'],
              ),
            ],
          ),
        ],
      ),
    ],
  );

const openEntry = (model: Model): Entry | undefined =>
  model.open === null ? undefined : CATALOG.find((entry) => entry.slug === model.open);

export const view = (model: Model, h: H): Html => {
  const entry = openEntry(model);

  return h.div(
    [h.Class('min-h-full')],
    [
      header(h, model),
      intro(h),
      filters(h, model),
      grid(h, model),
      ...(entry === undefined ? [] : [detail(h, entry)]),
    ],
  );
};
