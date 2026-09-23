import type { AgentProviderAdapter } from "../agent-provider";
import { detectCliScreen, pastePrompt } from "./cli-screen";

export class CodexAgentProvider implements AgentProviderAdapter {
  readonly id = "codex.cli";
  readonly label = "Codex";
  readonly executable = process.env.WORKBENCH_CODEX_PATH ?? "codex";
  readonly interrupt = "\u001b";
  args(resume: boolean) { return resume ? ["resume"] : []; }
  detect = detectCliScreen("codex");
  submit = pastePrompt;
}
