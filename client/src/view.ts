import type { Html, HtmlBuilder } from 'foldkit/html';
import { FLEET } from '../../shared/catalog';
import type { Message } from './message';
import type { Model, Who } from './model';

type H = HtmlBuilder<Message>;

const CREATED_LABEL: Record<(typeof FLEET.creates)[number], string> = {
  worker: 'One Worker, with a Durable Object and a Worker Loader',
  'ai-gateway': 'One AI Gateway for the model calls',
};

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

const primaryAction = (h: H, who: Who): Html =>
  who._tag === 'SignedIn'
    ? h.a(
        [
          h.Href('/installs'),
          h.Class('rounded-md bg-accent px-4 py-2 text-sm text-accent-ink hover:opacity-90'),
          h.DataAttribute('action', 'install'),
        ],
        ['Install on my account'],
      )
    : h.a(
        [
          h.Href('/oauth/start'),
          h.Class('rounded-md bg-accent px-4 py-2 text-sm text-accent-ink hover:opacity-90'),
          h.DataAttribute('action', 'sign-in'),
        ],
        ['Sign in to install'],
      );

const section = (h: H, title: string, body: readonly Html[]): Html =>
  h.section([h.Class('mt-8')], [h.h2([h.Class('text-sm font-semibold')], [title]), ...body]);

const fleet = (h: H, model: Model): Html =>
  h.main(
    [h.Class('mx-auto max-w-4xl px-6 pt-10 pb-16'), h.DataAttribute('entry', 'fleet')],
    [
      h.h1([h.Class('text-2xl font-semibold tracking-tight')], [FLEET.name]),
      h.p([h.Class('mt-2 max-w-2xl text-dim')], [FLEET.oneLine]),
      h.div([h.Class('mt-6 flex gap-2')], [primaryAction(h, model.who)]),
      h.figure(
        [h.Class('mt-10 overflow-hidden rounded-lg border border-line bg-panel p-4')],
        [
          h.img([
            h.Src('/fleet.svg'),
            h.Alt(
              'port uploads one Fleet Worker to your account. The Worker uses a Durable Object, a Worker Loader and Workers AI. Model calls go through an AI Gateway.',
            ),
            h.Class('block h-auto w-full'),
          ]),
        ],
      ),
      section(h, 'What it creates on your account', [
        h.ul(
          [h.Class('mt-2 list-disc space-y-1 pl-5 text-sm text-dim')],
          FLEET.creates.map((kind) => h.li([], [CREATED_LABEL[kind]])),
        ),
        h.p(
          [h.Class('mt-2 text-sm text-dim')],
          ['Tear down deletes both, then checks with the Cloudflare API that they are gone.'],
        ),
      ]),
      section(h, 'Permissions it uses', [
        h.p([h.Class('mt-2 font-mono text-xs text-dim')], [FLEET.scopes.join('  ')]),
      ]),
      section(h, 'Evidence', [
        h.ul(
          [h.Class('mt-2 list-disc space-y-1 pl-5 text-sm text-dim')],
          FLEET.evidence.map((line) => h.li([], [line])),
        ),
      ]),
    ],
  );

export const view = (model: Model, h: H): Html =>
  h.div([h.Class('min-h-full')], [header(h, model), fleet(h, model)]);
