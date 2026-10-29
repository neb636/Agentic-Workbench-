import type { TerminalSessionProvider } from "../../core/session-provider-registry";
import type { PtyDataEvent, PtyExitEvent } from "../../../shared/models";

export const localTerminalProvider: TerminalSessionProvider = {
  id: "terminal.local",
  label: "Local terminal",
  kind: "terminal",
  async create(context) {
    // The identifier is assigned after listeners are installed so early PTY output can be buffered.
    let sessionId: string | undefined;
    let disposed = false;
    const bufferedData: PtyDataEvent[] = [];
    const pendingExits: PtyExitEvent[] = [];
    let exitCode: number | undefined;
    const dataListeners = new Set<(data: string) => void>();
    const exitListeners = new Set<(code: number) => void>();
    const offData = window.workbench.pty.onData((event) => {
      if (sessionId && event.sessionId !== sessionId) return;
      if (!sessionId || !dataListeners.size) bufferedData.push(event);
      else dataListeners.forEach((listener) => listener(event.data));
    });
    const offExit = window.workbench.pty.onExit((event) => {
      if (!sessionId) pendingExits.push(event);
      if (event.sessionId === sessionId) { exitCode = event.exitCode; exitListeners.forEach((listener) => listener(event.exitCode)); }
    });

    try { sessionId = await window.workbench.pty.create({
      cwd: context.workspacePath,
      cols: context.cols ?? 80,
      rows: context.rows ?? 24,
    }); } catch (error) { offData(); offExit(); throw error; }
    exitCode = pendingExits.find((event) => event.sessionId === sessionId)?.exitCode;

    return {
      id: sessionId,
      input: (data) => window.workbench.pty.input(sessionId!, data),
      resize: (cols, rows) => window.workbench.pty.resize(sessionId!, cols, rows),
      onData: (listener) => {
        dataListeners.add(listener);
        bufferedData.splice(0).filter((event) => event.sessionId === sessionId).forEach((event) => listener(event.data));
        return () => dataListeners.delete(listener);
      },
      onExit: (listener) => {
        exitListeners.add(listener);
        if (exitCode !== undefined) listener(exitCode);
        return () => exitListeners.delete(listener);
      },
      dispose: () => {
        if (disposed) return;
        disposed = true;
        offData();
        offExit();
        window.workbench.pty.terminate(sessionId!);
      },
    };
  },
};
