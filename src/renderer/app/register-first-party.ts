import { services } from "../core/services";
import { useWorkbenchStore } from "../state/workbench-store";
import { AgentView } from "../features/agent/AgentView";
import { cliAgentProvider } from "../features/agent/cli-agent-provider";
import { closeAgentRuntime } from "../core/agent-runtimes";
import { TerminalView } from "../features/terminal/TerminalView";
import { localTerminalProvider } from "../features/terminal/terminal-provider";
import { PersonaWidget } from "../features/personas/PersonaWidget";
import { InstructionsWidget } from "../features/instructions/InstructionsWidget";
import { clearComposerRuntime, registerComposerContributions } from "../features/agent/composer-state";
import { AgentIcon, TerminalIcon } from "../ui/icons";

let registered = false;

export function registerFirstPartyContributions(): void {
  if (registered) return;
  registered = true;

  services.views.register({
    id: "agent",
    label: "Agent",
    description: "Choose a native coding CLI with a prompt composer.",
    icon: AgentIcon,
    component: AgentView,
    createState: () => ({}),
  });
  services.views.register({
    id: "terminal",
    label: "Terminal",
    description: "A local PTY-backed terminal session.",
    icon: TerminalIcon,
    component: TerminalView,
    createState: () => ({ providerId: "terminal.local" }),
  });

  services.sessions.register(cliAgentProvider("codex.cli", "Codex"));
  services.sessions.register(cliAgentProvider("claude.cli", "Claude Code"));
  services.sessions.register(localTerminalProvider);

  services.widgets.register({ id: "persona", slot: "agent.composer.support", order: 10, component: PersonaWidget });
  services.widgets.register({ id: "appended-instructions", slot: "agent.composer.support", order: 20, component: InstructionsWidget });
  services.promptContributors.register({ id: "persona", contributions: ({ workspaceId }) => {
    const state = useWorkbenchStore.getState();
    const persona = state.personas.find((p) => p.id === state.selectedPersonaByWorkspace[workspaceId]);
    return persona ? [{ id: persona.id, source: persona.name, kind: "persona", content: persona.instructions, enabled: true }] : [];
  } });
  services.promptContributors.register({ id: "instructions", contributions: ({ workspaceId }) =>
    useWorkbenchStore.getState().appendedInstructions.filter((i) => i.workspaceId === workspaceId).map((i) => ({
      id: i.id, source: "Appended instructions", kind: "instruction", content: i.content, enabled: i.enabled,
    })),
  });
  registerComposerContributions();

  services.commands.register("workspace.add", async () => {
    const path = await window.workbench.workspace.chooseDirectory();
    if (path) useWorkbenchStore.getState().addWorkspace(path);
  });
  services.commands.register<string>("workspace.select", (workspaceId) => {
    useWorkbenchStore.getState().selectWorkspace(workspaceId);
  });
  services.commands.register<{ workspaceId: string; viewType: string }>("view.create", ({ workspaceId, viewType }) => {
    const definition = services.views.get(viewType);
    if (!definition) throw new Error(`Unknown view type: ${viewType}`);
    return useWorkbenchStore.getState().createView(workspaceId, definition.id, definition.label, definition.createState?.());
  });
  services.commands.register<{ workspaceId: string; viewId: string }>("view.close", ({ workspaceId, viewId }) => {
    closeAgentRuntime(viewId);
    clearComposerRuntime(viewId);
    useWorkbenchStore.getState().closeView(workspaceId, viewId);
  });
}
