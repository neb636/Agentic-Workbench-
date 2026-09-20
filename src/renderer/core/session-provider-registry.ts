import { Registry } from "./registry";
import type { AgentOutput, AgentSessionStatus } from "../../shared/models";

export interface SessionCreateContext {
  workspacePath: string;
  cols?: number;
  rows?: number;
}

export interface SessionController {
  id: string;
  dispose: () => void;
}

export interface TerminalSessionController extends SessionController {
  input?: (data: string) => void;
  resize?: (cols: number, rows: number) => void;
  onData?: (listener: (data: string) => void) => () => void;
  onExit?: (listener: (exitCode: number) => void) => () => void;
}

export interface AgentSessionController extends SessionController {
  sendPrompt: (prompt: string) => Promise<void>;
  interrupt: () => void;
  onOutput: (listener: (output: AgentOutput) => void) => () => void;
  onStatus: (listener: (status: AgentSessionStatus) => void) => () => void;
  onError: (listener: (message: string) => void) => () => void;
}

interface SessionProviderBase {
  id: string;
  label: string;
}

export interface TerminalSessionProvider extends SessionProviderBase {
  kind: "terminal";
  create: (context: SessionCreateContext) => Promise<TerminalSessionController>;
}

export interface AgentProvider extends SessionProviderBase {
  kind: "agent";
  create: (context: SessionCreateContext) => Promise<AgentSessionController>;
}

export type SessionProvider = TerminalSessionProvider | AgentProvider;

export class SessionProviderRegistry extends Registry<SessionProvider> {
  firstAgent(): AgentProvider | undefined {
    return this.list().find((provider): provider is AgentProvider => provider.kind === "agent");
  }
}
