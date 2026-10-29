import { Schema } from 'effect';
import { Readiness } from '../../shared/catalog';

export const Filter = Schema.Literals(['all', ...Readiness.literals]);

export type Filter = typeof Filter.Type;

export const Model = Schema.Struct({
  filter: Filter,
  open: Schema.NullOr(Schema.String),
});

export type Model = typeof Model.Type;

export const initialModel: Model = { filter: 'all', open: null };
