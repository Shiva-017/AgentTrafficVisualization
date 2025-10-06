import type { AppState, Agent, WorkItem, ProjectMetrics } from '@/lib/types';
import { DEFAULT_SEED, RUNNING_DEFAULT } from '@/lib/config';

export type ServerMsg =
  | { type: 'snapshot'; state: AppState }
  | { type: 'tick'; tick_id: number; items?: Array<Partial<WorkItem> & { id: string }>; agents?: Array<Partial<Agent> & { id: string }>; metrics?: Partial<ProjectMetrics>; agents_remove?: string[] };

function emptyState(): AppState {
  return {
    items: {},
    agents: {},
    metrics: {
      active_agents: 0,
      total_tokens: 0,
      total_spend_usd: 0,
      live_tps: 0,
      live_spend_per_s: 0,
      completion_rate: 0,
    },
    seed: DEFAULT_SEED,
    running: RUNNING_DEFAULT,
  };
}

class ServerState {
  private state: AppState = emptyState();
  private tickId: number = 0;

  getSnapshot(): ServerMsg {
    return { type: 'snapshot', state: this.state };
  }

  // Applies a snapshot (replace) or tick diffs (merge)
  apply(msg: ServerMsg): ServerMsg {
    if (msg.type === 'snapshot') {
      this.state = {
        items: msg.state.items ?? {},
        agents: msg.state.agents ?? {},
        metrics: msg.state.metrics ?? emptyState().metrics,
        seed: msg.state.seed ?? DEFAULT_SEED,
        running: !!msg.state.running,
      };
      this.tickId = 0;
      return { type: 'snapshot', state: this.state };
    }
    // tick
    this.tickId = Math.max(this.tickId + 1, msg.tick_id || 0);
    const items = { ...this.state.items } as Record<string, WorkItem>;
    const agents = { ...this.state.agents } as Record<string, Agent>;

    if (msg.items) {
      for (const patch of msg.items) {
        const id = patch.id;
        const prev = items[id] ?? ({ id } as WorkItem);
        items[id] = { ...prev, ...patch } as WorkItem;
      }
    }
    if (msg.agents) {
      for (const patch of msg.agents) {
        const id = patch.id;
        const prev = agents[id] ?? ({ id } as Agent);
        agents[id] = { ...prev, ...patch } as Agent;
      }
    }
    if (msg.agents_remove && msg.agents_remove.length) {
      for (const id of msg.agents_remove) {
        if (id in agents) delete agents[id];
      }
    }

    const metrics = msg.metrics ? { ...this.state.metrics, ...msg.metrics } : this.state.metrics;
    this.state = { ...this.state, items, agents, metrics };

    return {
      type: 'tick',
      tick_id: this.tickId,
      items: msg.items,
      agents: msg.agents,
      metrics: msg.metrics,
      agents_remove: msg.agents_remove,
    };
  }
}

export const serverState = new ServerState();
