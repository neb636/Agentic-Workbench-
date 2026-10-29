import type { PromptOptionDefinition, PromptSelections } from "./prompt-options";

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

export interface PromptContribution {
  id: string;
  source: string;
  kind: "persona" | "instruction" | "context" | "attachment";
  content: string;
  enabled: boolean;
  /** Defaults to "prepend": before the user's prompt. */
  placement?: "prepend" | "append";
}

/** A user-managed Instructions option. */
export interface StoredPromptOption {
  scope: "global" | "workspace";
  workspaceId?: string;
  option: PromptOptionDefinition;
}

export interface LayoutState {
  leftSize?: number;
  rightSize?: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  rightPanel?: string;
}

export interface PersistedState {
  workspaces: Workspace[];
  activeWorkspaceId?: string;
  personas: Persona[];
  instructionOptions: StoredPromptOption[];
  layout: LayoutState;
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
  promptSelections?: PromptSelections;
  runIn?: { kind: "checkout" } | { kind: "worktree"; branch: string };
  /** Where the CLI runs once launched; the workspace path unless a worktree was created. */
  cwd?: string;
  /** The title is replaced by the first sent prompt. */
  autoTitle?: boolean;
  composerCollapsed?: boolean;
}

export interface FileViewState {
  root: string;
  path: string;
}

export interface FileEntry {
  name: string;
  path: string;
  kind: "file" | "directory";
  size: number;
}

export interface FileContent {
  path: string;
  content: string;
  size: number;
  truncated: boolean;
  binary: boolean;
}

export interface FilesChangedEvent {
  root: string;
  paths: string[];
}

export interface SourceControlChange {
  path: string;
  originalPath?: string;
  kind: "modified" | "added" | "deleted" | "renamed" | "untracked" | "conflicted";
  staged: boolean;
}

export interface SourceControlStatus {
  providerId: string;
  providerLabel: string;
  root: string;
  branch?: string;
  upstream?: string;
  ahead: number;
  behind: number;
  changes: SourceControlChange[];
  truncated: boolean;
}

export interface WorktreeResult {
  path: string;
  branch: string;
}

export interface AppMetrics {
  memoryBytes: number;
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
  app: {
    metrics: () => Promise<AppMetrics>;
  };
  files: {
    list: (root: string, path: string) => Promise<FileEntry[]>;
    read: (root: string, path: string) => Promise<FileContent>;
    find: (root: string, query: string) => Promise<string[]>;
    watch: (root: string) => void;
    unwatch: (root: string) => void;
    onChanged: (listener: (event: FilesChangedEvent) => void) => () => void;
  };
  sourceControl: {
    detect: (root: string) => Promise<boolean>;
    status: (root: string) => Promise<SourceControlStatus | null>;
    commit: (root: string, message: string) => Promise<{ commitId: string }>;
    createWorktree: (root: string, branch: string) => Promise<WorktreeResult>;
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
