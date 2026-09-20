import type { SessionProvider } from "../../core/session-provider-registry";
import { createId } from "../../core/id";

export const previewAgentProvider: SessionProvider = {
  id: "agent.preview",
  label: "Workbench preview",
  async create() {
    return { id: createId("session"), dispose: () => undefined };
  },
};
