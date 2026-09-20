import type { AgentProvider } from "../../core/session-provider-registry";
import type { AgentSessionEvent } from "../../../shared/models";

export const codexAgentProvider: AgentProvider = {
  id: "codex.cli",
  label: "Codex CLI",
  kind: "agent",
  async create(context) {
    const eventListeners = new Set<(event: AgentSessionEvent) => void>();
    const sessionId = await window.workbench.agent.create({
      providerId: "codex.cli",
      workspacePath: context.workspacePath,
    });
    let disposed = false;
    const offEvent = window.workbench.agent.onEvent((event) => {
      if (event.sessionId !== sessionId) return;
      eventListeners.forEach((listener) => listener(event));
    });

    const subscribe = <T extends "output" | "status" | "error">(
      type: T,
      listener: (event: Extract<AgentSessionEvent, { type: T }>) => void,
    ) => {
      const wrapped = (event: AgentSessionEvent) => {
        if (event.type === type) listener(event as Extract<typeof event, { type: T }>);
      };
      eventListeners.add(wrapped);
      return () => eventListeners.delete(wrapped);
    };

    return {
      id: sessionId,
      sendPrompt: (prompt) => window.workbench.agent.sendPrompt(sessionId, prompt),
      interrupt: () => window.workbench.agent.interrupt(sessionId),
      onOutput: (listener) => subscribe("output", (event) => listener(event.output)),
      onStatus: (listener) => subscribe("status", (event) => listener(event.status)),
      onError: (listener) => subscribe("error", (event) => listener(event.message)),
      dispose: () => {
        if (disposed) return;
        disposed = true;
        offEvent();
        eventListeners.clear();
        window.workbench.agent.terminate(sessionId);
      },
    };
  },
};
