import { Schema } from 'effect';
import { defineMessageUnion } from 'foldkit/message';
import { Filter, Who } from './model';

export const Message = defineMessageUnion({
  PickedFilter: { filter: Filter },
  OpenedEntry: { slug: Schema.String },
  ClosedEntry: {},
  LoadedWho: { who: Who },
  Ignored: {},
});

export type Message = typeof Message.Type;
