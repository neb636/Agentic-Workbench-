import type { AgentProviderAdapter } from "../agent-provider";
import { detectCliScreen, pastePrompt } from "./cli-screen";

export class ClaudeAgentProvider implements AgentProviderAdapter {
  readonly id = "claude.cli";
  readonly label = "Claude Code";
  readonly executable = process.env.WORKBENCH_CLAUDE_PATH ?? "claude";
  readonly interrupt = "\u001b";
  args(resume: boolean) { return resume ? ["--resume"] : []; }
  detect = detectCliScreen("claude");
  submit = pastePrompt;
}
