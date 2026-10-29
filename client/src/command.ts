import { Effect, Schema } from 'effect';
import { Command } from 'foldkit';
import { Message } from './message';
import { Me, Who } from './model';

const decodeMe = Schema.decodeUnknownEffect(Me);

const whoFrom = (me: Me): Who =>
  me.signedIn ? Who.SignedIn({ email: me.email ?? null, account: me.account ?? null }) : Who.SignedOut();

export const LoadWho = Command.define('LoadWho', {
  messages: [Message.LoadedWho],
  execute: Effect.tryPromise(() =>
    fetch('/oauth/me', { credentials: 'same-origin' }).then((response) => response.json()),
  ).pipe(
    Effect.flatMap(decodeMe),
    Effect.map((me) => Message.LoadedWho({ who: whoFrom(me) })),
    Effect.orElseSucceed(() => Message.LoadedWho({ who: Who.SignedOut() })),
  ),
});
