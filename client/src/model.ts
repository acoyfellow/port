import { Schema } from 'effect';
import { defineTaggedUnion } from 'foldkit/schema';

export const Account = Schema.Struct({ id: Schema.String, name: Schema.NullOr(Schema.String) });

export const Me = Schema.Struct({
  signedIn: Schema.Boolean,
  email: Schema.optional(Schema.NullOr(Schema.String)),
  account: Schema.optional(Schema.NullOr(Account)),
  scopes: Schema.optional(Schema.Array(Schema.String)),
});

export type Me = typeof Me.Type;

export const Who = defineTaggedUnion({
  Checking: {},
  SignedOut: {},
  SignedIn: { email: Schema.NullOr(Schema.String), account: Schema.NullOr(Account) },
});

export type Who = typeof Who.Type;

export const Model = Schema.Struct({ who: Who });

export type Model = typeof Model.Type;

export const initialModel: Model = { who: Who.Checking() };
