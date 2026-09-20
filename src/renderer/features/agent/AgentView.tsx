import { useEffect, useMemo, useState } from "react";
import { TextArea } from "react-aria-components";
import type { PromptContribution } from "../../../shared/models";
import { services } from "../../core/services";
import type { ViewComponentProps } from "../../core/view-registry";
import { useWorkbenchStore } from "../../state/workbench-store";
import { AgentIcon, SendIcon, SparkIcon } from "../../ui/icons";
import { Button, IconButton } from "../../ui/controls";

interface Message {
  id: string;
  prompt: string;
  contributionCount: number;
}

export function AgentView({ view, workspace }: ViewComponentProps) {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionStatus, setSessionStatus] = useState("Starting…");
  const personas = useWorkbenchStore((state) => state.personas);
  const selectedPersonaId = useWorkbenchStore((state) => state.selectedPersonaByWorkspace[workspace.id]);
  const allInstructions = useWorkbenchStore((state) => state.appendedInstructions);
  const instructions = useMemo(
    () => allInstructions.filter((item) => item.workspaceId === workspace.id),
    [allInstructions, workspace.id],
  );

  useEffect(() => {
    const provider = services.sessions.get("agent.preview");
    let disposed = false;
    let disposeSession: (() => void) | undefined;
    void provider?.create({ workspacePath: workspace.path }).then((controller) => {
      if (disposed) controller.dispose();
      else {
        disposeSession = controller.dispose;
        setSessionStatus("Ready");
      }
    });
    return () => {
      disposed = true;
      disposeSession?.();
    };
  }, [workspace.path]);

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
    if (!prompt.trim()) return;
    const assembled = services.promptAssembler.assemble(prompt, contributions);
    setMessages((current) => [...current, { id: crypto.randomUUID(), prompt: assembled.userPrompt, contributionCount: assembled.contributions.length }]);
    setPrompt("");
  };

  const widgets = services.widgets.forSlot("agent.composer.support");

  return (
    <section className="agent-view" aria-label="Agent session">
      <div className="agent-display">
        <div className="view-toolbar agent-toolbar">
          <div className="view-toolbar-title"><AgentIcon size={15} /> Agent session</div>
          <div className="session-status"><span className="status-dot status-ready" />{sessionStatus}</div>
        </div>
        <div className="agent-transcript">
          {messages.length === 0 ? (
            <div className="agent-empty">
              <div className="agent-empty-icon"><SparkIcon size={24} /></div>
              <h2>What would you like to work on?</h2>
              <p>Start a local agent session. Your persona and enabled instructions will be assembled with the prompt.</p>
            </div>
          ) : (
            messages.map((message) => (
              <div className="prompt-message" key={message.id}>
                <div className="message-label">You</div>
                <p>{message.prompt}</p>
                {message.contributionCount > 0 && <span>{message.contributionCount} prompt contribution{message.contributionCount === 1 ? "" : "s"}</span>}
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
            <IconButton label="Send prompt" onPress={submit} isDisabled={!prompt.trim()} className="send-button"><SendIcon size={16} /></IconButton>
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
