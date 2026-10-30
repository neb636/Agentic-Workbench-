import { randomUUID } from "node:crypto";
import type { WebContents } from "electron";
import { Terminal } from "@xterm/headless";
import { SerializeAddon } from "@xterm/addon-serialize";
import type { IPty } from "node-pty";
import type { AgentDeliveryResult, AgentPromptRequest, AgentProviderInfo, AgentSessionCreateOptions, AgentSessionEvent, AgentSessionSnapshot, AgentSessionStatus } from "../shared/models";
import { IPC } from "../shared/ipc";
import type { AgentProviderAdapter, ScreenObservation } from "./agent-provider";
import { executablePath } from "./executables";
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
  lastOutputAt: number;
  settled: boolean;
  settleTimer?: ReturnType<typeof setTimeout>;
}

export class AgentSessionManager {
  private readonly sessions = new Map<string, Session>();
  constructor(private readonly providers: AgentProviderAdapter[], private readonly spawn = spawnTerminal) {}

  discover(): AgentProviderInfo[] {
    return this.providers.map((provider) => ({ id: provider.id, label: provider.label, capabilities: provider.capabilities, available: Boolean(executablePath(provider.executable)), resume: true,
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
      lastOutputAt: Date.now(), settled: false,
      status: { lifecycle: "starting", activity: "unknown", canSubmit: false, inputState: "unavailable", reason: "Starting CLI…", rule: "startup", observedAt: Date.now(), completed: 0 },
    };
    this.sessions.set(session.id, session);
    // Headless parsing owns terminal replies, including when no renderer is attached.
    terminal.onData((data) => { if (!session.disposed && session.status.lifecycle !== "exited") processInstance.write(data); });
    processInstance.onData((data) => { session.lastOutputAt = Date.now(); terminal.write(data, () => {
      if (session.disposed) return;
      this.emit(session, { type: "data", data });
      this.detect(session);
    }); });
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

  async sendPrompt(id: string, request: AgentPromptRequest, owner: WebContents): Promise<AgentDeliveryResult> {
    const s = this.owned(id, owner);
    if (s.sending) return { outcome: "not-sent", stage: "none", message: "A prompt is already being delivered." };
    if (request.intent === "plan" && !s.provider.capabilities?.planning) {
      return { outcome: "not-sent", stage: "none", message: "This provider does not support planning submissions." };
    }
    let stage: AgentDeliveryResult["stage"] = "none";
    s.sending = true;
    try {
      const submission = s.provider.submit(request);
      await this.flush(s);
      this.detect(s);
      if (!s.status.canSubmit || s.disposed) throw new Error(s.status.reason);
      if (request.intent === "plan" && s.status.activity !== "ready") throw new Error("Wait until the CLI is ready before sending for planning.");
      if (submission.prefix) {
        stage = "prefix";
        s.process.write(submission.prefix.input);
        // Native CLIs may classify a command combined with a paste as ordinary text.
        // Wait for the adapter to recognize the command in the editor before pasting.
        const deadline = Date.now() + 2000;
        let acknowledged = false;
        do {
          await new Promise((resolve) => setTimeout(resolve, 50));
          await this.flush(s);
          if (s.status.lifecycle !== "alive" || s.status.activity !== "ready" || !s.terminal.modes.bracketedPasteMode) break;
          acknowledged = submission.prefix.acknowledged(this.observe(s));
          if (acknowledged) break;
        } while (Date.now() < deadline);
        if (!acknowledged) throw new Error("Planning command could not be confirmed in the native editor. Inspect the terminal before retrying.");
      }
      stage = "paste";
      s.process.write(submission.paste);
      // Wait for the native input editor to acknowledge a draft, not just a delay.
      // A command prefix is already a draft; it must change after the paste.
      const hasPastedDraft = () => s.status.inputState === "draft" && !submission.prefix?.acknowledged(this.observe(s));
      const deadline = Date.now() + 2000;
      do {
        await new Promise((resolve) => setTimeout(resolve, 50));
        await this.flush(s);
        if (hasPastedDraft() || s.status.activity === "waiting-for-input" || s.status.lifecycle !== "alive") break;
      } while (Date.now() < deadline);
      if (s.disposed || s.status.lifecycle !== "alive" || s.status.activity === "waiting-for-input" || !hasPastedDraft()) {
        throw new Error("Prompt may be pasted. Inspect the terminal before sending again.");
      }
      if (request.intent === "plan" && s.status.activity !== "ready") throw new Error("CLI activity changed while pasting. Inspect the terminal before sending for planning.");
      stage = "enter";
      s.process.write("\r");
      s.inputWasEdited = false;
      s.interrupted = false;
      // A CLI that is still busy, such as finishing startup, may hold the submitted draft until it can accept it.
      const submittedDeadline = Date.now() + 2000;
      const heldDeadline = Date.now() + 30_000;
      let current: AgentSessionStatus | undefined;
      do {
        await new Promise((resolve) => setTimeout(resolve, 50));
        await this.flush(s);
        current = this.sessions.get(id)?.status;
        if (current?.lifecycle === "alive" && current.activity !== "waiting-for-input" && current.inputState === "empty") {
          return { outcome: "submitted", stage, message: request.intent === "plan"
            ? "Planning request handed to the CLI. Its Plan mode may remain active."
            : "Prompt handed to the CLI." };
        }
        if (current?.lifecycle !== "alive" || current.activity === "waiting-for-input") break;
      } while (Date.now() < (current?.activity === "working" ? heldDeadline : submittedDeadline));
      throw new Error("Enter was delivered, but submission could not be confirmed. Inspect the terminal before retrying.");
    } catch (error) {
      return { outcome: stage === "none" ? "not-sent" : "uncertain", stage, message: error instanceof Error ? error.message : String(error) };
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
    clearTimeout(s.settleTimer);
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
    let detection = s.provider.detect(this.observe(s));
    let lifecycle: AgentSessionStatus["lifecycle"] = "alive";
    if (!s.settled && detection.canSubmit) {
      const wait = s.lastOutputAt + (s.provider.startupSettleMs ?? 0) - Date.now();
      if (wait > 0) {
        clearTimeout(s.settleTimer);
        s.settleTimer = setTimeout(() => this.detect(s), wait);
        lifecycle = "starting";
        detection = { ...detection, canSubmit: false, rule: "startup", reason: "Waiting for the CLI to finish starting…" };
      } else s.settled = true;
    }
    if (detection.inputState === "empty") s.inputWasEdited = false;
    let completed = s.status.completed;
    if (detection.activity === "working") s.working = true;
    if (detection.activity === "ready" && s.working) {
      if (!s.interrupted) completed++;
      s.working = false;
    }
    const next: AgentSessionStatus = { ...detection, lifecycle, completed, observedAt: Date.now() };
    const previous = s.status;
    s.status = next;
    if (previous.activity !== next.activity || previous.canSubmit !== next.canSubmit || previous.lifecycle !== next.lifecycle || previous.rule !== next.rule || previous.completed !== completed) this.emit(s, { type: "status", status: next });
  }
  private observe(s: Session): ScreenObservation {
    const buffer = s.terminal.buffer.active;
    const lines = Array.from({ length: s.terminal.rows }, (_, i) => buffer.getLine(buffer.baseY + i)?.translateToString(true) ?? "");
    return { lines, cursorLine: lines[buffer.cursorY] ?? "", cursorX: buffer.cursorX, cursorY: buffer.cursorY,
      cursorCellDim: Boolean(buffer.getLine(buffer.baseY + buffer.cursorY)?.getCell(buffer.cursorX)?.isDim()),
      inputWasEdited: s.inputWasEdited, bracketedPaste: s.terminal.modes.bracketedPasteMode };
  }
  private emit(s: Session, event: { type: "data"; data: string } | { type: "status"; status: AgentSessionStatus }): void {
    const payload: AgentSessionEvent = { ...event, sessionId: s.id, sequence: ++s.sequence };
    if (!s.owner.isDestroyed()) s.owner.send(IPC.agentEvent, payload);
  }
}
