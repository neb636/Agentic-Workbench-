import { randomUUID } from "node:crypto";
import type { WebContents } from "electron";
import type { AgentSessionCreateOptions, AgentSessionEvent, AgentSessionStatus } from "../shared/models";
import { IPC } from "../shared/ipc";
import type { AgentProviderAdapter } from "./agent-provider";
import type { ManagedProcess } from "./process-manager";

interface ManagedAgentSession {
  id: string;
  provider: AgentProviderAdapter;
  providerSessionId?: string;
  workspacePath: string;
  owner: WebContents;
  process?: ManagedProcess;
  interrupted: boolean;
}

export class AgentSessionManager {
  private readonly sessions = new Map<string, ManagedAgentSession>();
  private readonly providers: Map<string, AgentProviderAdapter>;

  constructor(providers: AgentProviderAdapter[]) {
    this.providers = new Map(providers.map((provider) => [provider.id, provider]));
  }

  create(options: AgentSessionCreateOptions, owner: WebContents): string {
    const provider = this.providers.get(options.providerId);
    if (!provider) throw new Error(`Unknown agent provider: ${options.providerId}`);
    const id = randomUUID();
    this.sessions.set(id, {
      id,
      provider,
      workspacePath: options.workspacePath,
      owner,
      interrupted: false,
    });
    return id;
  }

  sendPrompt(sessionId: string, prompt: string, owner: WebContents): void {
    const session = this.ownedSession(sessionId, owner);
    if (session.process) throw new Error("The agent is already running a turn.");
    session.interrupted = false;
    this.emitStatus(session, "running");
    try {
      session.process = session.provider.startTurn({
        workspacePath: session.workspacePath,
        prompt,
        providerSessionId: session.providerSessionId,
      }, {
        onProviderSessionId: (providerSessionId) => { session.providerSessionId = providerSessionId; },
        onOutput: (output) => this.emit(session, { sessionId, type: "output", output }),
        onError: (message) => {
          if (!session.interrupted) this.emit(session, { sessionId, type: "error", message });
        },
        onExit: (exitCode) => {
          if (!this.sessions.has(sessionId)) return;
          session.process = undefined;
          if (session.interrupted) this.emitStatus(session, "interrupted");
          else this.emitStatus(session, exitCode === 0 ? "ready" : "error");
        },
      });
    } catch (error) {
      this.emit(session, { sessionId, type: "error", message: String(error) });
      this.emitStatus(session, "error");
      throw error;
    }
  }

  interrupt(sessionId: string, owner: WebContents): void {
    const session = this.ownedSession(sessionId, owner);
    if (!session.process) return;
    session.interrupted = true;
    session.process.interrupt();
  }

  terminate(sessionId: string, owner?: WebContents): void {
    const session = this.sessions.get(sessionId);
    if (!session || (owner && session.owner !== owner)) return;
    this.sessions.delete(sessionId);
    session.process?.terminate();
  }

  terminateForOwner(owner: WebContents): void {
    for (const [sessionId, session] of this.sessions) {
      if (session.owner === owner) this.terminate(sessionId);
    }
  }

  terminateAll(): void {
    for (const sessionId of this.sessions.keys()) this.terminate(sessionId);
  }

  private ownedSession(sessionId: string, owner: WebContents): ManagedAgentSession {
    const session = this.sessions.get(sessionId);
    if (!session || session.owner !== owner) throw new Error(`Unknown agent session: ${sessionId}`);
    return session;
  }

  private emitStatus(session: ManagedAgentSession, status: AgentSessionStatus): void {
    this.emit(session, { sessionId: session.id, type: "status", status });
  }

  private emit(session: ManagedAgentSession, event: AgentSessionEvent): void {
    if (!session.owner.isDestroyed()) session.owner.send(IPC.agentEvent, event);
  }
}
