import type { Entry } from '../entry.ts';
import { ENTRY as entry_isolate_agents } from './isolate-agents';
import { ENTRY as entry_durable_session } from './durable-session';
import { ENTRY as entry_chat_with_sandbox } from './chat-with-sandbox';
import { ENTRY as entry_agent_room } from './agent-room';
import { ENTRY as entry_container_per_thread } from './container-per-thread';
import { ENTRY as entry_person_with_computer } from './person-with-computer';
import { ENTRY as entry_shared_container } from './shared-container';
import { ENTRY as entry_sealed_box } from './sealed-box';
import { ENTRY as entry_self_editing_app } from './self-editing-app';
import { ENTRY as entry_grounded_bug_arena } from './grounded-bug-arena';

export const ENTRIES: readonly Entry[] = [entry_isolate_agents, entry_durable_session, entry_chat_with_sandbox, entry_agent_room, entry_container_per_thread, entry_person_with_computer, entry_shared_container, entry_sealed_box, entry_self_editing_app, entry_grounded_bug_arena];
