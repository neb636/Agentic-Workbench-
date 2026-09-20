import type { SessionProvider } from "../../core/session-provider-registry";

export const localTerminalProvider: SessionProvider = {
  id: "terminal.local",
  label: "Local terminal",
  async create(context) {
    // The identifier is assigned after listeners are installed so early PTY output can be buffered.
    // eslint-disable-next-line prefer-const
    let sessionId: string | undefined;
    let disposed = false;
    const bufferedData: string[] = [];
    const dataListeners = new Set<(data: string) => void>();
    const exitListeners = new Set<(code: number) => void>();
    const offData = window.workbench.pty.onData((event) => {
      if (sessionId && event.sessionId !== sessionId) return;
      if (!sessionId) bufferedData.push(event.data);
      else dataListeners.forEach((listener) => listener(event.data));
    });
    const offExit = window.workbench.pty.onExit((event) => {
      if (event.sessionId === sessionId) exitListeners.forEach((listener) => listener(event.exitCode));
    });

    sessionId = await window.workbench.pty.create({
      cwd: context.workspacePath,
      cols: context.cols ?? 80,
      rows: context.rows ?? 24,
    });

    return {
      id: sessionId,
      input: (data) => window.workbench.pty.input(sessionId!, data),
      resize: (cols, rows) => window.workbench.pty.resize(sessionId!, cols, rows),
      onData: (listener) => {
        dataListeners.add(listener);
        bufferedData.splice(0).forEach(listener);
        return () => dataListeners.delete(listener);
      },
      onExit: (listener) => {
        exitListeners.add(listener);
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
