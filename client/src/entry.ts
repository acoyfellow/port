import { Runtime } from 'foldkit';
import './styles.css';
import { LoadWho } from './command';
import { initialModel, Model } from './model';
import { update } from './update';
import { view } from './view';

const element = Runtime.makeElement({
  Model,
  init: () => ({ model: initialModel, commands: [LoadWho()] }),
  update,
  view,
  container: document.getElementById('root'),
});

Runtime.run(element);
