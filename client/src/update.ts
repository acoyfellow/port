import type { Update } from 'foldkit';
import type { Message } from './message';
import type { Model } from './model';

type UpdateReturn = Update.Return<Model, Message, never>;

export const update = (model: Model, message: Message): UpdateReturn => {
  switch (message._tag) {
    case 'PickedFilter':
      return { model: { ...model, filter: message.filter } };
    case 'OpenedEntry':
      return { model: { ...model, open: message.slug } };
    case 'ClosedEntry':
      return { model: { ...model, open: null } };
    case 'LoadedWho':
      return { model: { ...model, who: message.who } };
    case 'Ignored':
      return { model };
  }
};
