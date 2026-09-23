import type { AgentSessionStatus } from "../shared/models";

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

/** Executable, native UI and key protocol knowledge belongs to an adapter. */
export interface AgentProviderAdapter {
  id: string;
  label: string;
  executable: string;
  args: (resume: boolean) => string[];
  detect: (screen: ScreenObservation) => AgentDetection;
  submit: (prompt: string) => string;
  interrupt: string;
}
