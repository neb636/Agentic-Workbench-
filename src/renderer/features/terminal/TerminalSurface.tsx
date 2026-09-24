import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import type { AgentSessionController, TerminalSessionController } from "../../core/session-provider-registry";

export interface TerminalSurfaceHandle { focus: () => void; }

export function TerminalSurface({ controller, ref, onSelectionChange }: {
  controller: AgentSessionController | TerminalSessionController;
  ref?: Ref<TerminalSurfaceHandle>;
  onSelectionChange?: (text: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const selectionCallback = useRef(onSelectionChange);
  useEffect(() => { selectionCallback.current = onSelectionChange; }, [onSelectionChange]);
  useImperativeHandle(ref, () => ({ focus: () => terminalRef.current?.focus() }), []);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const styles = getComputedStyle(document.documentElement);
    const token = (name: string) => styles.getPropertyValue(name).trim();
    const terminal = new Terminal({ cursorBlink: true, fontFamily: token("--wb-font-mono"), fontSize: 13, lineHeight: 1.25,
      scrollback: 2000, theme: {
        background: token("--wb-terminal-bg"), foreground: token("--wb-terminal-fg"), cursor: token("--wb-terminal-cursor"),
        selectionBackground: token("--wb-terminal-selection"), black: token("--wb-terminal-black"), red: token("--wb-terminal-red"),
        green: token("--wb-terminal-green"), yellow: token("--wb-terminal-yellow"), blue: token("--wb-terminal-blue"),
        magenta: token("--wb-terminal-magenta"), cyan: token("--wb-terminal-cyan"), white: token("--wb-terminal-white"),
      },
    });
    const fit = new FitAddon(); terminal.loadAddon(fit); terminal.open(host);
    terminalRef.current = terminal;
    const selection = terminal.onSelectionChange(() => selectionCallback.current?.(terminal.getSelection()));
    let active = true;
    let attached = false;
    let followOutput = true;
    const write = (data: string) => terminal.write(data, () => { if (active && followOutput) terminal.scrollToBottom(); });
    const wheel = (event: WheelEvent) => { if (event.deltaY < 0) followOutput = false; };
    const pointer = (event: PointerEvent) => { if ((event.target as HTMLElement).classList.contains("xterm-viewport")) followOutput = false; };
    host.addEventListener("wheel", wheel, { passive: true });
    host.addEventListener("pointerdown", pointer);
    const scroll = terminal.onScroll(() => {
      if (terminal.buffer.active.viewportY === terminal.buffer.active.baseY) followOutput = true;
    });
    const resize = () => {
      if (active && attached && host.clientWidth && host.clientHeight) {
        fit.fit(); controller.resize?.(terminal.cols, terminal.rows);
        if (followOutput) terminal.scrollToBottom();
      }
    };
    let detach: (() => void) | undefined;
    let offExit: (() => void) | undefined;
    if ("attach" in controller) {
      for (const identifier of [{ final: "c" }, { prefix: ">", final: "c" }, { final: "n" }, { prefix: "?", final: "n" }, { final: "t" }]) {
        terminal.parser.registerCsiHandler(identifier, () => true);
      }
      // The headless terminal answers protocol queries; this surface only forwards user input.
      detach = controller.attach((snapshot) => {
        terminal.resize(snapshot.cols, snapshot.rows);
        terminal.write(snapshot.screen, () => { attached = true; resize(); terminal.scrollToBottom(); });
      }, write, (message) => write(`\r\n${message}\r\n`));
    } else {
      attached = true; resize();
      detach = controller.onData?.(write);
      offExit = controller.onExit?.((code) => write(`\r\nProcess exited with code ${code}\r\n`));
    }
    const input = terminal.onData((data) => { if (attached) { followOutput = true; controller.input?.(data); } });
    const observer = new ResizeObserver(resize); observer.observe(host);
    return () => {
      active = false; observer.disconnect(); detach?.(); offExit?.(); input.dispose(); scroll.dispose();
      selection.dispose(); terminalRef.current = null;
      host.removeEventListener("wheel", wheel); host.removeEventListener("pointerdown", pointer); terminal.dispose();
    };
  }, [controller]);
  return <div className="terminal-host" ref={hostRef} aria-label="Native CLI terminal" />;
}
