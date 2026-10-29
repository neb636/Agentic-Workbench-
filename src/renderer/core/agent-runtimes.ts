import { create } from "zustand";
import type { AgentSessionStatus } from "../../shared/models";
import type { AgentProvider, AgentSessionController, SessionCreateContext } from "./session-provider-registry";

export interface AgentRuntime { controller: AgentSessionController; providerId: string; status?: AgentSessionStatus; seenCompletion?: number; }
export const useAgentRuntimes = create<{ sessions: Record<string, AgentRuntime> }>(() => ({ sessions: {} }));
const pending = new Map<string, Promise<AgentSessionController>>();
const generations = new Map<string, number>();
const offStatus = new Map<string, () => void>();

export function startAgentRuntime(viewId: string, provider: AgentProvider, context: SessionCreateContext): Promise<AgentSessionController> {
  const existing = useAgentRuntimes.getState().sessions[viewId];
  if (existing) return Promise.resolve(existing.controller);
  const inFlight = pending.get(viewId);
  if (inFlight) return inFlight;
  const generation = generations.get(viewId) ?? 0;
  const promise = provider.create({ ...context, viewId }).then((controller) => {
    if ((generations.get(viewId) ?? 0) !== generation) { controller.terminate(); controller.dispose(); throw new Error("View was closed."); }
    useAgentRuntimes.setState((state) => ({ sessions: { ...state.sessions, [viewId]: { controller, providerId: provider.id } } }));
    offStatus.set(viewId, controller.onStatus((status) => useAgentRuntimes.setState((state) => ({ sessions: {
      ...state.sessions, [viewId]: { ...state.sessions[viewId], controller, providerId: provider.id, status },
    } }))));
    return controller;
  }).finally(() => { if (pending.get(viewId) === promise) pending.delete(viewId); });
  pending.set(viewId, promise);
  return promise;
}

export function acknowledgeAgentCompletion(viewId: string): void {
  const runtime = useAgentRuntimes.getState().sessions[viewId];
  if (!runtime || runtime.seenCompletion === runtime.status?.completed) return;
  useAgentRuntimes.setState((state) => ({ sessions: { ...state.sessions, [viewId]: { ...runtime, seenCompletion: runtime.status?.completed } } }));
}

export function closeAgentRuntime(viewId: string): void {
  generations.set(viewId, (generations.get(viewId) ?? 0) + 1);
  const runtime = useAgentRuntimes.getState().sessions[viewId];
  offStatus.get(viewId)?.(); offStatus.delete(viewId);
  runtime?.controller.terminate(); runtime?.controller.dispose();
  useAgentRuntimes.setState((state) => { const sessions = { ...state.sessions }; delete sessions[viewId]; return { sessions }; });
}
