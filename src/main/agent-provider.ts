import type { AgentPromptRequest, AgentSessionStatus } from "../shared/models";

export interface ScreenObservation {
  lines: string[];
  cursorLine: string;
  cursorX: number;
  cursorY: number;
  cursorCellDim: boolean;
  inputWasEdited: boolean;
  bracketedPaste: boolean;
}
export type AgentDetection = Pick<AgentSessionStatus, "activity" | "canSubmit" | "inputState" | "reason" | "rule">;

export interface AgentSubmission {
  paste: string;
  prefix?: { input: string; acknowledged: (screen: ScreenObservation) => boolean };
}

/** Executable, native UI and key protocol knowledge belongs to an adapter. */
export interface AgentProviderAdapter {
  id: string;
  label: string;
  executable: string;
  args: (resume: boolean) => string[];
  detect: (screen: ScreenObservation) => AgentDetection;
  capabilities?: { planning: boolean };
  /** Quiet time a first input prompt must hold before it accepts a submission; some CLIs draw it before startup dialogs. */
  startupSettleMs?: number;
  submit: (request: AgentPromptRequest) => AgentSubmission;
  interrupt: string;
}
