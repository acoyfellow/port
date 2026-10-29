import { defineMessageUnion } from 'foldkit/message';
import { Who } from './model';

export const Message = defineMessageUnion({
  LoadedWho: { who: Who },
});

export type Message = typeof Message.Type;
