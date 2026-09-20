export type ViewType = string;

export interface WorkbenchView {
  id: string;
  type: ViewType;
  workspaceId: string;
  title: string;
  state?: unknown;
}

export interface Workspace {
  id: string;
  name: string;
  path: string;
  views: WorkbenchView[];
  activeViewId?: string;
}

export interface Persona {
  id: string;
  name: string;
  description: string;
  instructions: string;
  scope: "global" | "workspace";
  workspaceId?: string;
}

export interface AppendedInstruction {
  id: string;
  workspaceId: string;
  content: string;
  enabled: boolean;
}

export interface PromptContribution {
  id: string;
  source: string;
  kind: "persona" | "instruction" | "context" | "attachment";
  content: string;
  enabled: boolean;
}

export interface PersistedState {
  workspaces: Workspace[];
  activeWorkspaceId?: string;
  personas: Persona[];
  selectedPersonaByWorkspace: Record<string, string | undefined>;
  appendedInstructions: AppendedInstruction[];
}

export interface PtyCreateOptions {
  cwd: string;
  cols: number;
  rows: number;
}

export interface PtyDataEvent {
  sessionId: string;
  data: string;
}

export interface PtyExitEvent {
  sessionId: string;
  exitCode: number;
}

export type AgentSessionStatus =
  | "starting"
  | "ready"
  | "running"
  | "interrupted"
  | "error"
  | "terminated";

export type AgentOutputKind = "assistant" | "activity";

export interface AgentOutput {
  kind: AgentOutputKind;
  text: string;
}

export interface AgentSessionCreateOptions {
  providerId: string;
  workspacePath: string;
}

export type AgentSessionEvent =
  | { sessionId: string; type: "status"; status: AgentSessionStatus }
  | { sessionId: string; type: "output"; output: AgentOutput }
  | { sessionId: string; type: "error"; message: string };

export interface WorkbenchApi {
  platform: NodeJS.Platform;
  persistence: {
    load: () => Promise<PersistedState>;
    save: (state: PersistedState) => Promise<void>;
  };
  workspace: {
    chooseDirectory: () => Promise<string | null>;
  };
  pty: {
    create: (options: PtyCreateOptions) => Promise<string>;
    input: (sessionId: string, data: string) => void;
    resize: (sessionId: string, cols: number, rows: number) => void;
    terminate: (sessionId: string) => void;
    onData: (listener: (event: PtyDataEvent) => void) => () => void;
    onExit: (listener: (event: PtyExitEvent) => void) => () => void;
  };
  agent: {
    create: (options: AgentSessionCreateOptions) => Promise<string>;
    sendPrompt: (sessionId: string, prompt: string) => Promise<void>;
    interrupt: (sessionId: string) => void;
    terminate: (sessionId: string) => void;
    onEvent: (listener: (event: AgentSessionEvent) => void) => () => void;
  };
}
