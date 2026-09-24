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

export interface AgentSessionStatus {
  lifecycle: "starting" | "alive" | "exited" | "failed";
  activity: "ready" | "working" | "waiting-for-input" | "unknown";
  canSubmit: boolean;
  inputState: "empty" | "draft" | "unavailable";
  reason: string;
  rule: string;
  observedAt: number;
  completed: number;
  exitCode?: number;
}

export interface AgentProviderInfo {
  id: string;
  label: string;
  available: boolean;
  reason?: string;
  resume: boolean;
  capabilities?: { planning: boolean };
}

export interface AgentPromptRequest {
  prompt: string;
  intent: "default" | "plan";
}

export interface AgentDeliveryResult {
  outcome: "submitted" | "not-sent" | "uncertain";
  stage: "none" | "prefix" | "paste" | "enter" | "unknown";
  message: string;
}

export interface PromptQuotation {
  id: string;
  content: string;
}

export interface AgentViewState {
  providerId?: string;
  draft?: string;
  split?: number;
  quotations?: PromptQuotation[];
  intent?: AgentPromptRequest["intent"];
  composerRevision?: number;
}

export interface AgentSessionCreateOptions {
  providerId: string;
  workspacePath: string;
  viewId: string;
  cols: number;
  rows: number;
  resume?: boolean;
}

export type AgentSessionEvent = { sessionId: string; sequence: number } & (
  | { type: "status"; status: AgentSessionStatus }
  | { type: "data"; data: string }
);

export interface AgentSessionSnapshot {
  sessionId: string;
  sequence: number;
  screen: string;
  cols: number;
  rows: number;
  status: AgentSessionStatus;
}

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
    providers: () => Promise<AgentProviderInfo[]>;
    create: (options: AgentSessionCreateOptions) => Promise<string>;
    attach: (sessionId: string) => Promise<AgentSessionSnapshot>;
    input: (sessionId: string, data: string) => void;
    resize: (sessionId: string, cols: number, rows: number) => void;
    sendPrompt: (sessionId: string, request: AgentPromptRequest) => Promise<AgentDeliveryResult>;
    interrupt: (sessionId: string) => void;
    terminate: (sessionId: string) => void;
    onEvent: (listener: (event: AgentSessionEvent) => void) => () => void;
  };
}
