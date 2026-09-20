import type { WebContents } from "electron";
import * as pty from "node-pty";
import { randomUUID } from "node:crypto";
import type { IPty } from "node-pty";
import type { PtyCreateOptions } from "../shared/models";
import { IPC } from "../shared/ipc";

interface ManagedPty {
  process: IPty;
  owner: WebContents;
}

export class PtyManager {
  private readonly sessions = new Map<string, ManagedPty>();

  create(options: PtyCreateOptions, owner: WebContents): string {
    const shell = process.platform === "win32"
      ? process.env.COMSPEC ?? "powershell.exe"
      : process.env.SHELL ?? "/bin/zsh";
    const sessionId = randomUUID();
    const processInstance = pty.spawn(shell, [], {
      name: "xterm-256color",
      cwd: options.cwd,
      cols: options.cols,
      rows: options.rows,
      env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" },
    });

    this.sessions.set(sessionId, { process: processInstance, owner });
    processInstance.onData((data) => {
      if (!owner.isDestroyed()) owner.send(IPC.ptyData, { sessionId, data });
    });
    processInstance.onExit(({ exitCode }) => {
      this.sessions.delete(sessionId);
      if (!owner.isDestroyed()) owner.send(IPC.ptyExit, { sessionId, exitCode });
    });
    return sessionId;
  }

  input(sessionId: string, data: string): void {
    this.sessions.get(sessionId)?.process.write(data);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    this.sessions.get(sessionId)?.process.resize(cols, rows);
  }

  terminate(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.process.kill();
    this.sessions.delete(sessionId);
  }

  terminateForOwner(owner: WebContents): void {
    for (const [sessionId, session] of this.sessions) {
      if (session.owner === owner) this.terminate(sessionId);
    }
  }

  terminateAll(): void {
    for (const sessionId of this.sessions.keys()) this.terminate(sessionId);
  }
}
