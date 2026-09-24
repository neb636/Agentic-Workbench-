import { useEffect, useRef, useState } from "react";
import { Radio, RadioGroup } from "react-aria-components";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import type { AgentProviderInfo, AgentViewState } from "../../../shared/models";
import { services } from "../../core/services";
import { acknowledgeAgentCompletion, closeAgentRuntime, startAgentRuntime, useAgentRuntimes } from "../../core/agent-runtimes";
import type { ViewComponentProps } from "../../core/view-registry";
import { useWorkbenchStore } from "../../state/workbench-store";
import { AgentIcon } from "../../ui/icons";
import { Button } from "../../ui/controls";
import { AgentComposer } from "./AgentComposer";
import { TerminalSurface, type TerminalSurfaceHandle } from "../terminal/TerminalSurface";

export function AgentView({ view, workspace }: ViewComponentProps) {
  const state = (view.state ?? {}) as AgentViewState;
  const runtime = useAgentRuntimes((s) => s.sessions[view.id]);
  useEffect(() => { acknowledgeAgentCompletion(view.id); }, [view.id, runtime?.status?.completed]);
  const update = useWorkbenchStore((s) => s.updateViewState);
  const [providers, setProviders] = useState<AgentProviderInfo[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState("");
  const terminalRef = useRef<TerminalSurfaceHandle>(null);
  const layoutRef = useRef<HTMLElement>(null);
  const [composerMinimum, setComposerMinimum] = useState(40);
  const hasQuotations = Boolean(state.quotations?.length);
  useEffect(() => {
    const element = layoutRef.current;
    if (!element) return;
    const measure = () => setComposerMinimum(Math.min(75, Math.max(25, (hasQuotations ? 360 : 320) / element.clientHeight * 100)));
    const observer = new ResizeObserver(measure);
    observer.observe(element); measure();
    return () => observer.disconnect();
  }, [runtime?.controller.id, hasQuotations]);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    void window.workbench.agent.providers().then((items) => { if (active) setProviders(items); }).catch((e: unknown) => { if (active) setError(String(e)); });
    return () => { active = false; };
  }, []);
  const selected = state.providerId ?? providers.find((p) => p.available)?.id ?? providers[0]?.id;
  const patch = (value: Partial<AgentViewState>) => update(workspace.id, view.id, value);
  const start = async (resume = false) => {
    if (busy) return;
    const provider = services.sessions.get(selected ?? "");
    if (provider?.kind !== "agent") return;
    setBusy(true); setError(""); patch({ providerId: provider.id });
    try { await startAgentRuntime(view.id, provider, { workspacePath: workspace.path, resume }); }
    catch (e) { if (alive.current) setError(String(e)); }
    finally { if (alive.current) setBusy(false); }
  };
  if (!runtime) return <section className="harness-launcher" aria-label="New agent session">
    <div className="harness-card">
      <AgentIcon size={28} /><h2>Choose your coding harness</h2>
      <p>Your CLI, its native tools and permissions, with a composer alongside it.</p>
      <RadioGroup aria-label="Coding harness" value={selected ?? ""} onChange={(providerId) => patch({ providerId })} className="harness-options">
        {providers.filter((p) => services.sessions.get(p.id)?.kind === "agent").map((p) => <Radio key={p.id} value={p.id} isDisabled={!p.available || busy} className="harness-option">
          <strong>{p.label}</strong><span>{p.available ? "Available locally" : p.reason}</span>
        </Radio>)}
      </RadioGroup>
      {providers.length === 0 && !error && <p>Checking installed harnesses…</p>}
      {error && <p role="alert" className="agent-error">{error}</p>}
      <div className="harness-actions">
        <Button isDisabled={busy || !providers.find((p) => p.id === selected)?.available} onPress={() => void start(true)}>Resume…</Button>
        <Button className="primary-button" isDisabled={busy || !providers.find((p) => p.id === selected)?.available} onPress={() => void start()}>{busy ? "Starting…" : "Start session"}</Button>
      </div>
    </div>
  </section>;
  const status = runtime.status;
  const ended = status?.lifecycle === "exited" || status?.lifecycle === "failed";
  const label = status?.lifecycle === "alive" ? status.activity.replaceAll("-", " ") : status?.lifecycle ?? "starting";
  const split = Math.min(100 - composerMinimum, Math.max(25, typeof state.split === "number" ? state.split : 50));
  return <section ref={layoutRef} className="agent-view native-agent-view" aria-label="Agent session">
    <PanelGroup direction="vertical" onLayout={([height]) => { if (Math.abs(height - split) > .01) patch({ split: height }); }}>
    <Panel className="agent-display" defaultSize={split} minSize={25}>
      <div className="view-toolbar agent-toolbar">
        <div className="view-toolbar-title"><AgentIcon size={15} />{services.sessions.get(runtime.providerId)?.label}</div>
        <div className="agent-toolbar-status">
          {status?.activity === "working" && <Button onPress={() => runtime.controller.interrupt()}>Interrupt</Button>}
          {ended && <Button onPress={() => closeAgentRuntime(view.id)}>Choose session</Button>}
          <div className="session-status" title={`${status?.reason ?? ""} (${status?.rule ?? "startup"})`}><span className={`status-dot status-${status?.activity}`} />{label}</div>
        </div>
      </div>
      <TerminalSurface controller={runtime.controller} ref={terminalRef} onSelectionChange={setSelection} />
    </Panel>
    <PanelResizeHandle className="terminal-split" aria-label="Terminal height"><span /></PanelResizeHandle>
    <Panel className="agent-composer-row" defaultSize={100 - split} minSize={composerMinimum}>
      <AgentComposer key={runtime.controller.id} workspaceId={workspace.id} viewId={view.id} state={state} status={status}
        planning={Boolean(providers.find((p) => p.id === runtime.providerId)?.capabilities?.planning)}
        selection={selection} focusTerminal={() => terminalRef.current?.focus()} />
      <aside className="support-column" aria-label="Prompt support">{services.widgets.forSlot("agent.composer.support").map((widget) => {
        const Widget = widget.component;
        return <Widget key={widget.id} workspaceId={workspace.id} viewId={view.id} />;
      })}</aside>
    </Panel>
    </PanelGroup>
  </section>;
}
