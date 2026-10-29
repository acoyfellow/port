import { Schema } from 'effect';
import { defineTaggedUnion } from 'foldkit/schema';
import { Readiness } from '../../shared/catalog';

export const Filter = Schema.Literals(['all', ...Readiness.literals]);

export type Filter = typeof Filter.Type;

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

export const Model = Schema.Struct({
  filter: Filter,
  open: Schema.NullOr(Schema.String),
  who: Who,
});

export type Model = typeof Model.Type;

export const initialModel: Model = { filter: 'all', open: null, who: Who.Checking() };
