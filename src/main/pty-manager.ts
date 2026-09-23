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

export function spawnTerminal(command: string, args: string[], cwd: string, cols: number, rows: number): IPty {
  return pty.spawn(command, args, { name: "xterm-256color", cwd, cols, rows,
    env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" } });
}

export class PtyManager {
  private readonly sessions = new Map<string, ManagedPty>();

  create(options: PtyCreateOptions, owner: WebContents): string {
    const shell = process.platform === "win32"
      ? process.env.COMSPEC ?? "powershell.exe"
      : process.env.SHELL ?? "/bin/zsh";
    const sessionId = randomUUID();
    const processInstance = spawnTerminal(shell, [], options.cwd, options.cols, options.rows);

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

  input(sessionId: string, data: string, owner: WebContents): void {
    this.owned(sessionId, owner).process.write(data);
  }

  resize(sessionId: string, cols: number, rows: number, owner: WebContents): void {
    this.owned(sessionId, owner).process.resize(cols, rows);
  }

  terminate(sessionId: string, owner?: WebContents): void {
    if (!this.sessions.has(sessionId)) return;
    const session = owner ? this.owned(sessionId, owner) : this.sessions.get(sessionId);
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

  private owned(id: string, owner: WebContents): ManagedPty {
    const session = this.sessions.get(id);
    if (!session || session.owner !== owner) throw new Error("Unknown terminal session.");
    return session;
  }
}
