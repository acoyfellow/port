import type { Entry } from '../entry.ts';
import { ENTRY as entry_chat_ax } from './chat-ax';
import { ENTRY as entry_coil } from './coil';
import { ENTRY as entry_fleet } from './fleet';
import { ENTRY as entry_hark } from './hark';
import { ENTRY as entry_my_ax } from './my-ax';
import { ENTRY as entry_pi_durable } from './pi-durable';
import { ENTRY as entry_skin } from './skin';
import { ENTRY as entry_swarm_5 } from './swarm-5';
import { ENTRY as entry_terrarium } from './terrarium';

export const ENTRIES: readonly Entry[] = [
  entry_fleet,
  entry_coil,
  entry_my_ax,
  entry_chat_ax,
  entry_swarm_5,
  entry_terrarium,
  entry_hark,
  entry_skin,
  entry_pi_durable,
];
