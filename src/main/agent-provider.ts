import type { AgentOutput } from "../shared/models";
import type { ManagedProcess } from "./process-manager";

export interface AgentTurnContext {
  workspacePath: string;
  prompt: string;
  providerSessionId?: string;
}

export interface AgentTurnCallbacks {
  onProviderSessionId: (sessionId: string) => void;
  onOutput: (output: AgentOutput) => void;
  onError: (message: string) => void;
  onExit: (exitCode: number) => void;
}

export interface AgentProviderAdapter {
  id: string;
  startTurn: (context: AgentTurnContext, callbacks: AgentTurnCallbacks) => ManagedProcess;
}
