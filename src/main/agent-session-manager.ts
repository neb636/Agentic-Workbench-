import { randomUUID } from "node:crypto";
import { accessSync, constants } from "node:fs";
import { delimiter, isAbsolute, join } from "node:path";
import { homedir } from "node:os";
import type { WebContents } from "electron";
import { Terminal } from "@xterm/headless";
import { SerializeAddon } from "@xterm/addon-serialize";
import type { IPty } from "node-pty";
import type { AgentProviderInfo, AgentSessionCreateOptions, AgentSessionEvent, AgentSessionSnapshot, AgentSessionStatus } from "../shared/models";
import { IPC } from "../shared/ipc";
import type { AgentProviderAdapter } from "./agent-provider";
import { spawnTerminal } from "./pty-manager";

interface Session {
  id: string;
  viewId: string;
  owner: WebContents;
  provider: AgentProviderAdapter;
  process: IPty;
  terminal: Terminal;
  serialize: SerializeAddon;
  sequence: number;
  status: AgentSessionStatus;
  interrupted: boolean;
  working: boolean;
  sending: boolean;
  disposed: boolean;
  inputWasEdited: boolean;
}

export function executablePath(command: string): string | undefined {
  const dirs = [...(process.env.PATH ?? "").split(delimiter), join(homedir(), ".local/bin"), "/opt/homebrew/bin", "/usr/local/bin"];
  const candidates = isAbsolute(command) ? [command] : dirs.filter(Boolean).map((dir) => join(dir, command));
  return candidates.find((candidate) => { try { accessSync(candidate, constants.X_OK); return true; } catch { return false; } });
}

export class AgentSessionManager {
  private readonly sessions = new Map<string, Session>();
  constructor(private readonly providers: AgentProviderAdapter[], private readonly spawn = spawnTerminal) {}

  discover(): AgentProviderInfo[] {
    return this.providers.map((provider) => ({ id: provider.id, label: provider.label, available: Boolean(executablePath(provider.executable)), resume: true,
      reason: executablePath(provider.executable) ? undefined : `Install ${provider.label}, or configure its WORKBENCH executable path before starting the app.` }));
  }

  create(options: AgentSessionCreateOptions, owner: WebContents): string {
    const existing = [...this.sessions.values()].find((s) => s.viewId === options.viewId && s.owner === owner);
    if (existing) return existing.id;
    const provider = this.providers.find((p) => p.id === options.providerId);
    if (!provider) throw new Error("Unknown agent provider.");
    const executable = executablePath(provider.executable);
    if (!executable) throw new Error(`${provider.label} executable was not found. Install it or configure its executable path.`);
    const terminal = new Terminal({ cols: options.cols, rows: options.rows, scrollback: 2000, allowProposedApi: true });
    const serialize = new SerializeAddon();
    terminal.loadAddon(serialize);
    let processInstance: IPty;
    try { processInstance = this.spawn(executable, provider.args(Boolean(options.resume)), options.workspacePath, options.cols, options.rows); }
    catch (error) { terminal.dispose(); throw error; }
    const session: Session = {
      id: randomUUID(), viewId: options.viewId, owner, provider, process: processInstance, terminal, serialize,
      sequence: 0, interrupted: false, working: false, sending: false, disposed: false, inputWasEdited: false,
      status: { lifecycle: "starting", activity: "unknown", canSubmit: false, inputState: "unavailable", reason: "Starting CLI…", rule: "startup", observedAt: Date.now(), completed: 0 },
    };
    this.sessions.set(session.id, session);
    // Headless parsing owns terminal replies, including when no renderer is attached.
    terminal.onData((data) => { if (!session.disposed && session.status.lifecycle !== "exited") processInstance.write(data); });
    processInstance.onData((data) => terminal.write(data, () => {
      if (session.disposed) return;
      this.emit(session, { type: "data", data });
      this.detect(session);
    }));
    processInstance.onExit(({ exitCode }) => {
      if (session.disposed) return;
      session.status = { ...session.status, lifecycle: exitCode === 0 ? "exited" : "failed", activity: "unknown", canSubmit: false, inputState: "unavailable",
        reason: `CLI exited with code ${exitCode}.`, rule: "process.exit", observedAt: Date.now(), exitCode };
      this.emit(session, { type: "status", status: session.status });
    });
    return session.id;
  }

  async attach(id: string, owner: WebContents): Promise<AgentSessionSnapshot> {
    const s = this.owned(id, owner);
    await this.flush(s);
    return { sessionId: id, sequence: s.sequence, screen: s.serialize.serialize(), cols: s.terminal.cols, rows: s.terminal.rows, status: s.status };
  }

  async sendPrompt(id: string, prompt: string, owner: WebContents): Promise<void> {
    const s = this.owned(id, owner);
    if (s.sending) throw new Error("A prompt is already being delivered.");
    const paste = s.provider.submit(prompt);
    s.sending = true;
    try {
      await this.flush(s);
      this.detect(s);
      if (!s.status.canSubmit || s.disposed) throw new Error(s.status.reason);
      s.process.write(paste);
      // Wait for the native input editor to acknowledge a draft, not just a delay.
      const deadline = Date.now() + 2000;
      do {
        await new Promise((resolve) => setTimeout(resolve, 50));
        await this.flush(s);
        if (s.status.inputState === "draft" || s.status.activity === "waiting-for-input" || s.status.lifecycle !== "alive") break;
      } while (Date.now() < deadline);
      if (s.disposed || s.status.lifecycle !== "alive" || s.status.inputState !== "draft") {
        throw new Error("Prompt may be pasted. Inspect the terminal before sending again.");
      }
      s.process.write("\r");
      s.inputWasEdited = false;
      s.interrupted = false;
      const submittedDeadline = Date.now() + 2000;
      do {
        await new Promise((resolve) => setTimeout(resolve, 50));
        await this.flush(s);
        const current = this.sessions.get(id)?.status;
        if (current?.inputState === "empty") return;
        if (current?.lifecycle !== "alive" || current.activity === "waiting-for-input") break;
      } while (Date.now() < submittedDeadline);
      throw new Error("Enter was delivered, but submission could not be confirmed. Inspect the terminal before retrying.");
    } finally { s.sending = false; }
  }

  input(id: string, data: string, owner: WebContents): void {
    const s = this.owned(id, owner);
    if (s.sending || s.status.lifecycle === "exited" || s.status.lifecycle === "failed") return;
    if (data === "\x1b" || data === "\x03") s.interrupted = true;
    if (!["\x1b", "\x03", "\x1b[I", "\x1b[O"].includes(data)) s.inputWasEdited = !data.includes("\r");
    if (data.includes("\r")) s.interrupted = false;
    s.process.write(data);
  }
  resize(id: string, cols: number, rows: number, owner: WebContents): void {
    const s = this.owned(id, owner);
    s.terminal.resize(cols, rows);
    if (s.status.lifecycle === "alive" || s.status.lifecycle === "starting") s.process.resize(cols, rows);
  }
  interrupt(id: string, owner: WebContents): void {
    const s = this.owned(id, owner);
    if (s.sending) return;
    s.interrupted = true;
    if (s.status.lifecycle === "alive") s.process.write(s.provider.interrupt);
  }
  terminate(id: string, owner?: WebContents): void {
    const s = owner ? this.owned(id, owner) : this.sessions.get(id);
    if (!s) return;
    s.disposed = true;
    this.sessions.delete(id);
    if (s.status.lifecycle !== "exited" && s.status.lifecycle !== "failed") s.process.kill();
    s.terminal.dispose();
  }
  terminateForOwner(owner: WebContents): void { for (const s of this.sessions.values()) if (s.owner === owner) this.terminate(s.id); }
  terminateAll(): void { for (const id of this.sessions.keys()) this.terminate(id); }

  private flush(s: Session): Promise<void> {
    if (s.disposed) return Promise.reject(new Error("Session was closed."));
    return new Promise((resolve) => s.terminal.write("", resolve));
  }
  private owned(id: string, owner: WebContents): Session {
    const s = this.sessions.get(id);
    if (!s || s.owner !== owner) throw new Error("Unknown agent session.");
    return s;
  }
  private detect(s: Session): void {
    if (s.disposed || s.status.lifecycle === "exited" || s.status.lifecycle === "failed") return;
    const buffer = s.terminal.buffer.active;
    const lines = Array.from({ length: s.terminal.rows }, (_, i) => buffer.getLine(buffer.baseY + i)?.translateToString(true) ?? "");
    const detection = s.provider.detect({ lines, cursorLine: lines[buffer.cursorY] ?? "", cursorX: buffer.cursorX, cursorY: buffer.cursorY,
      cursorCellDim: Boolean(buffer.getLine(buffer.baseY + buffer.cursorY)?.getCell(buffer.cursorX)?.isDim()),
      inputWasEdited: s.inputWasEdited,
      bracketedPaste: s.terminal.modes.bracketedPasteMode });
    if (detection.inputState === "empty") s.inputWasEdited = false;
    let completed = s.status.completed;
    if (detection.activity === "working") s.working = true;
    if (detection.activity === "ready" && s.working) {
      if (!s.interrupted) completed++;
      s.working = false;
    }
    const next: AgentSessionStatus = { ...detection, lifecycle: "alive", completed, observedAt: Date.now() };
    const previous = s.status;
    s.status = next;
    if (previous.activity !== next.activity || previous.canSubmit !== next.canSubmit || previous.lifecycle !== next.lifecycle || previous.rule !== next.rule || previous.completed !== completed) this.emit(s, { type: "status", status: next });
  }
  private emit(s: Session, event: { type: "data"; data: string } | { type: "status"; status: AgentSessionStatus }): void {
    const payload: AgentSessionEvent = { ...event, sessionId: s.id, sequence: ++s.sequence };
    if (!s.owner.isDestroyed()) s.owner.send(IPC.agentEvent, payload);
  }
}
