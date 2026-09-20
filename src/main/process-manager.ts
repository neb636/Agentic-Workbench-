import { spawn } from "node:child_process";

export interface ProcessStartOptions {
  command: string;
  args: string[];
  cwd: string;
  stdin?: string;
}

export interface ProcessCallbacks {
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
  onError?: (error: Error) => void;
  onExit?: (exitCode: number, signal: NodeJS.Signals | null) => void;
}

export interface ManagedProcess {
  interrupt: () => void;
  terminate: () => void;
}

export class ProcessManager {
  private readonly processes = new Set<ReturnType<typeof spawn>>();

  start(options: ProcessStartOptions, callbacks: ProcessCallbacks): ManagedProcess {
    const child = spawn(options.command, options.args, {
      cwd: options.cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let closed = false;
    let terminateTimer: NodeJS.Timeout | undefined;
    let killTimer: NodeJS.Timeout | undefined;
    this.processes.add(child);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (data: string) => callbacks.onStdout?.(data));
    child.stderr.on("data", (data: string) => callbacks.onStderr?.(data));
    child.once("error", (error) => callbacks.onError?.(error));
    child.once("close", (exitCode, signal) => {
      closed = true;
      if (terminateTimer) clearTimeout(terminateTimer);
      if (killTimer) clearTimeout(killTimer);
      this.processes.delete(child);
      callbacks.onExit?.(exitCode ?? -1, signal);
    });
    child.stdin.on("error", () => {
      // The process may exit before it consumes stdin; its exit event is authoritative.
    });
    child.stdin.end(options.stdin ?? "");

    const terminate = () => {
      if (closed) return;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => {
        if (!closed) child.kill("SIGKILL");
      }, 1_500);
      killTimer.unref();
    };

    return {
      interrupt: () => {
        if (closed) return;
        child.kill("SIGINT");
        terminateTimer = setTimeout(terminate, 1_500);
        terminateTimer.unref();
      },
      terminate,
    };
  }

  terminateAll(): void {
    for (const processInstance of this.processes) processInstance.kill("SIGTERM");
    this.processes.clear();
  }
}
