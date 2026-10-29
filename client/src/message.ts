import { Schema } from 'effect';
import { defineMessageUnion } from 'foldkit/message';
import { Filter } from './model';

export const Message = defineMessageUnion({
  PickedFilter: { filter: Filter },
  OpenedEntry: { slug: Schema.String },
  ClosedEntry: {},
  Ignored: {},
});

export type Message = typeof Message.Type;
