import { SCOPES } from '../../shared/scopes';
import { html } from './html';
import type { Viewer } from './layout';
import { copyField, errorPage, linkButton, notice, page, pageHead, postButton } from './parts';

export const signInPage = (next: string) =>
  page({
    title: 'Sign in',
    viewer: null,
    section: 'none',
    body: html`<div style="max-width:560px;margin:24px auto 0">${pageHead(
      'Sign in with Cloudflare',
      'port asks Cloudflare for the permissions below. Next you pick the one account port may act on. You can sign out at any time, and port forgets your tokens when you do.',
    )}<div class="stack"><div class="actions">${linkButton(`/oauth/start?next=${encodeURIComponent(next)}`, {
      label: 'Continue to Cloudflare',
    })}${linkButton('/oauth/link', { label: 'Use a sign-in link instead', kind: 'ghost' })}</div><details class="card"><summary>The ${
      SCOPES.length
    } permissions port asks for</summary><table style="margin-top:10px"><tbody>${SCOPES.map(
      (note) => html`<tr><td class="mono">${note.scope}</td><td class="muted">${note.why}</td></tr>`,
    )}</tbody></table></details></div></div>`,
  });

export const linkPage = (target: string) =>
  page({
    title: 'Sign-in link',
    viewer: null,
    section: 'none',
    crumbs: [{ label: 'Sign in', href: '/sign-in' }, { label: 'Sign-in link' }],
    body: html`<div style="max-width:560px">${pageHead(
      'Sign in with a link',
      'Some networks open new sites in a remote browser, and that breaks the Cloudflare sign-in. Copy this link and open it in a new tab. It works for 10 minutes.',
    )}<div class="stack">${copyField('sign-in-link', target, 'Sign-in link')}<div class="actions">${linkButton(
      target,
      {
        label: 'Open it here',
        kind: 'ghost',
      },
    )}</div></div></div>`,
  });

export type AccountChoice = { readonly id: string; readonly name: string };

export const accountPickerPage = (viewer: Viewer, accounts: readonly AccountChoice[]) =>
  page({
    title: 'Pick an account',
    viewer,
    section: 'account',
    body: html`<div style="max-width:560px;margin:24px auto 0">${pageHead(
      'Pick the account to install on',
      'port only acts on the account you pick here. You can change it later from your account page.',
    )}<form method="post" action="/oauth/account" class="choices">${accounts.map(
      (account) =>
        html`<button class="choice" name="account" value="${account.id}|${account.name}"><span>${account.name}</span><small>${account.id}</small></button>`,
    )}</form></div>`,
  });

export type AccountSummary = {
  readonly email: string | null;
  readonly accountName: string | null;
  readonly accountId: string | null;
  readonly scopes: readonly string[];
};

export const accountPage = (viewer: Viewer, summary: AccountSummary) => {
  const missing = SCOPES.filter((note) => !summary.scopes.includes(note.scope));
  return page({
    title: 'Account',
    viewer,
    section: 'account',
    body: html`${pageHead('Account', 'Who port acts as, and on which Cloudflare account.')}<div class="stack"><section class="card"><dl class="kv"><dt>Signed in as</dt><dd>${
      summary.email ?? 'Unknown'
    }</dd><dt>Account</dt><dd>${summary.accountName ?? 'None picked'} ${
      summary.accountId === null ? '' : html`<span class="muted mono">${summary.accountId}</span>`
    }</dd><dt>Permissions</dt><dd>${summary.scopes.length} granted${
      missing.length === 0 ? '' : html` · <span style="color:var(--warn)">${missing.length} missing</span>`
    }</dd></dl><div class="actions" style="margin-top:16px">${linkButton('/oauth/account', {
      label: 'Change account',
      kind: 'ghost',
    })}${postButton('/installs/cli-key', { label: 'Get a CLI key', kind: 'ghost', busy: 'Making a key…' })}${postButton(
      '/installs/probe',
      { label: 'Check upload permissions', kind: 'ghost', busy: 'Checking 7 uploads…' },
    )}${postButton('/oauth/logout', { label: 'Sign out', kind: 'danger' })}</div></section>${
      missing.length === 0
        ? ''
        : notice(
            'warn',
            html`Your sign-in is missing ${missing.map((note) => html`<code>${note.scope}</code> `)}. ${linkButton(
              '/sign-in',
              {
                label: 'Sign in again',
                small: true,
              },
            )}`,
          )
    }</div>`,
  });
};

export const signInError = (status: number, title: string, detail: string) =>
  errorPage({
    status,
    title,
    detail,
    viewer: null,
    actions: [
      linkButton('/sign-in', { label: 'Try again' }),
      linkButton('/oauth/link', { label: 'Use a sign-in link', kind: 'ghost' }),
    ],
  });
