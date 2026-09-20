import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import type { ViewComponentProps } from "../../core/view-registry";
import { services } from "../../core/services";
import type { SessionController } from "../../core/session-provider-registry";
import { TerminalIcon } from "../../ui/icons";

export function TerminalView({ workspace }: ViewComponentProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<SessionController | undefined>(undefined);
  const [status, setStatus] = useState("Starting…");

  useEffect(() => {
    const host = hostRef.current;
    const provider = services.sessions.get("terminal.local");
    if (!host || !provider) return;
    const styles = getComputedStyle(document.documentElement);
    const token = (name: string) => styles.getPropertyValue(name).trim();

    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: "var(--wb-font-mono)",
      fontSize: 13,
      lineHeight: 1.35,
      theme: {
        background: token("--wb-terminal-bg"),
        foreground: token("--wb-terminal-fg"),
        cursor: token("--wb-terminal-cursor"),
        selectionBackground: token("--wb-terminal-selection"),
        black: token("--wb-terminal-black"),
        red: token("--wb-terminal-red"),
        green: token("--wb-terminal-green"),
        yellow: token("--wb-terminal-yellow"),
        blue: token("--wb-terminal-blue"),
        magenta: token("--wb-terminal-magenta"),
        cyan: token("--wb-terminal-cyan"),
        white: token("--wb-terminal-white"),
      },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(host);
    fit.fit();
    let active = true;
    let offData: (() => void) | undefined;
    let offExit: (() => void) | undefined;

    void provider.create({ workspacePath: workspace.path, cols: terminal.cols, rows: terminal.rows })
      .then((controller) => {
        if (!active) {
          controller.dispose();
          return;
        }
        controllerRef.current = controller;
        setStatus("Running");
        offData = controller.onData?.((data) => terminal.write(data));
        offExit = controller.onExit?.((code) => {
          terminal.write(`\r\n\x1b[2mProcess exited with code ${code}\x1b[0m\r\n`);
          setStatus("Exited");
        });
        terminal.onData((data) => controller.input?.(data));
      })
      .catch((error: unknown) => {
        terminal.write(`\r\n\x1b[31mUnable to start terminal: ${String(error)}\x1b[0m`);
        setStatus("Error");
      });

    const observer = new ResizeObserver(() => {
      try {
        fit.fit();
        controllerRef.current?.resize?.(terminal.cols, terminal.rows);
      } catch {
        // Ignore the final observer tick while the terminal is being disposed.
      }
    });
    observer.observe(host);

    return () => {
      active = false;
      observer.disconnect();
      offData?.();
      offExit?.();
      controllerRef.current?.dispose();
      controllerRef.current = undefined;
      terminal.dispose();
    };
  }, [workspace.path]);

  return (
    <section className="terminal-view" aria-label="Terminal session">
      <div className="view-toolbar">
        <div className="view-toolbar-title"><TerminalIcon size={15} /> Local terminal</div>
        <div className="session-status"><span className={`status-dot status-${status.toLowerCase()}`} />{status}</div>
      </div>
      <div className="terminal-host" ref={hostRef} />
    </section>
  );
}
