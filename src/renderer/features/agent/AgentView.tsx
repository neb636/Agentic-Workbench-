import { useEffect, useMemo, useRef, useState } from "react";
import { TextArea } from "react-aria-components";
import type { AgentOutputKind, AgentSessionStatus, PromptContribution } from "../../../shared/models";
import { services } from "../../core/services";
import type { AgentSessionController } from "../../core/session-provider-registry";
import type { ViewComponentProps } from "../../core/view-registry";
import { useWorkbenchStore } from "../../state/workbench-store";
import { AgentIcon, SendIcon, SparkIcon } from "../../ui/icons";
import { Button, IconButton } from "../../ui/controls";

type TranscriptItem =
  | { id: string; kind: "user"; text: string; contributionCount: number }
  | { id: string; kind: AgentOutputKind | "error"; text: string };

function configuredProviderId(state: unknown): string | undefined {
  if (typeof state !== "object" || state === null || !("providerId" in state)) return undefined;
  return typeof state.providerId === "string" ? state.providerId : undefined;
}

function statusLabel(status: AgentSessionStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function AgentView({ view, workspace }: ViewComponentProps) {
  const [prompt, setPrompt] = useState("");
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [sessionStatus, setSessionStatus] = useState<AgentSessionStatus>("starting");
  const controllerRef = useRef<AgentSessionController | undefined>(undefined);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const personas = useWorkbenchStore((state) => state.personas);
  const selectedPersonaId = useWorkbenchStore((state) => state.selectedPersonaByWorkspace[workspace.id]);
  const allInstructions = useWorkbenchStore((state) => state.appendedInstructions);
  const instructions = useMemo(
    () => allInstructions.filter((item) => item.workspaceId === workspace.id),
    [allInstructions, workspace.id],
  );
  const requestedProvider = services.sessions.get(configuredProviderId(view.state) ?? "");
  const provider = requestedProvider?.kind === "agent" ? requestedProvider : services.sessions.firstAgent();

  useEffect(() => {
    let active = true;
    let controller: AgentSessionController | undefined;
    const unsubscribers: Array<() => void> = [];
    setSessionStatus("starting");
    setPrompt("");
    setTranscript([]);

    if (!provider) {
      setSessionStatus("error");
      setTranscript((current) => [...current, {
        id: crypto.randomUUID(),
        kind: "error",
        text: "No agent provider is registered.",
      }]);
      return;
    }

    void provider.create({ workspacePath: workspace.path })
      .then((created) => {
        if (!active) {
          created.dispose();
          return;
        }
        controller = created;
        controllerRef.current = created;
        unsubscribers.push(
          created.onStatus(setSessionStatus),
          created.onOutput((output) => setTranscript((current) => [...current, {
            id: crypto.randomUUID(),
            kind: output.kind,
            text: output.text,
          }])),
          created.onError((message) => setTranscript((current) => [...current, {
            id: crypto.randomUUID(),
            kind: "error",
            text: message,
          }])),
        );
        setSessionStatus("ready");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setSessionStatus("error");
        setTranscript((current) => [...current, {
          id: crypto.randomUUID(),
          kind: "error",
          text: `Unable to start agent session: ${String(error)}`,
        }]);
      });

    return () => {
      active = false;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      controller?.dispose();
      if (controllerRef.current === controller) controllerRef.current = undefined;
    };
  }, [provider, view.id, workspace.path]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight });
  }, [transcript]);

  const contributions = useMemo<PromptContribution[]>(() => {
    const selectedPersona = personas.find((persona) => persona.id === selectedPersonaId);
    return [
      ...(selectedPersona
        ? [{ id: selectedPersona.id, source: selectedPersona.name, kind: "persona" as const, content: selectedPersona.instructions, enabled: true }]
        : []),
      ...instructions.map((instruction) => ({
        id: instruction.id,
        source: "Appended instructions",
        kind: "instruction" as const,
        content: instruction.content,
        enabled: instruction.enabled,
      })),
    ];
  }, [instructions, personas, selectedPersonaId]);

  const submit = () => {
    const controller = controllerRef.current;
    if (!prompt.trim() || !controller || sessionStatus === "running") return;
    const assembled = services.promptAssembler.assemble(prompt, contributions);
    setTranscript((current) => [...current, {
      id: crypto.randomUUID(),
      kind: "user",
      text: assembled.userPrompt,
      contributionCount: assembled.contributions.length,
    }]);
    setPrompt("");
    void controller.sendPrompt(assembled.content).catch((error: unknown) => {
      setSessionStatus("error");
      setTranscript((current) => [...current, {
        id: crypto.randomUUID(),
        kind: "error",
        text: `Unable to send prompt: ${String(error)}`,
      }]);
    });
  };

  const widgets = services.widgets.forSlot("agent.composer.support");
  const canSend = Boolean(prompt.trim() && controllerRef.current && sessionStatus !== "running");

  return (
    <section className="agent-view" aria-label="Agent session">
      <div className="agent-display">
        <div className="view-toolbar agent-toolbar">
          <div className="view-toolbar-title"><AgentIcon size={15} /> Agent session{provider ? ` · ${provider.label}` : ""}</div>
          <div className="agent-toolbar-status">
            {sessionStatus === "running" && <Button className="agent-cancel" onPress={() => controllerRef.current?.interrupt()}>Cancel</Button>}
            <div className="session-status"><span className={`status-dot status-${sessionStatus}`} />{statusLabel(sessionStatus)}</div>
          </div>
        </div>
        <div className="agent-transcript" ref={transcriptRef} role="log" aria-live="polite">
          {transcript.length === 0 ? (
            <div className="agent-empty">
              <div className="agent-empty-icon"><SparkIcon size={24} /></div>
              <h2>What would you like to work on?</h2>
              <p>Start a local agent session. Your persona and enabled instructions will be assembled with the prompt.</p>
            </div>
          ) : (
            transcript.map((item) => item.kind === "user" ? (
              <div className="prompt-message" key={item.id}>
                <div className="message-label">You</div>
                <p>{item.text}</p>
                {item.contributionCount > 0 && <span>{item.contributionCount} prompt contribution{item.contributionCount === 1 ? "" : "s"}</span>}
              </div>
            ) : (
              <div className={`agent-output agent-output-${item.kind}`} key={item.id}>
                <div className="message-label">{item.kind === "assistant" ? "Agent" : item.kind === "error" ? "Error" : "Activity"}</div>
                <pre>{item.text}</pre>
              </div>
            ))
          )}
        </div>
      </div>
      <div className="agent-composer-row">
        <div className="composer-panel">
          <TextArea
            aria-label="Prompt"
            placeholder="Ask the agent to explore, build, or explain…"
            value={prompt}
            disabled={!controllerRef.current || sessionStatus === "running"}
            onChange={(event) => setPrompt(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
          />
          <div className="composer-actions">
            <div className="composer-hint">Enter to send · Shift+Enter for a new line</div>
            <IconButton label="Send prompt" onPress={submit} isDisabled={!canSend} className="send-button"><SendIcon size={16} /></IconButton>
          </div>
        </div>
        <aside className="support-column" aria-label="Prompt support">
          {widgets.map((widget) => {
            const Widget = widget.component;
            return <Widget key={widget.id} workspaceId={workspace.id} viewId={view.id} />;
          })}
          {widgets.length === 0 && <Button isDisabled>No support widgets</Button>}
        </aside>
      </div>
    </section>
  );
}
