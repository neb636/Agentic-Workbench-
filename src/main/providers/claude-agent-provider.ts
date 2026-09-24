import type { AgentProviderAdapter, AgentSubmission } from "../agent-provider";
import { detectCliScreen, pastePrompt } from "./cli-screen";
import type { AgentPromptRequest } from "../../shared/models";

export class ClaudeAgentProvider implements AgentProviderAdapter {
  readonly id = "claude.cli";
  readonly label = "Claude Code";
  readonly executable = process.env.WORKBENCH_CLAUDE_PATH ?? "claude";
  readonly interrupt = "\u001b";
  args(resume: boolean) { return resume ? ["--resume"] : []; }
  detect = detectCliScreen("claude");
  readonly capabilities = { planning: true };
  submit = (request: AgentPromptRequest): AgentSubmission => ({ paste: pastePrompt(request.prompt),
    prefix: request.intent === "plan" ? { input: "/plan ", acknowledged: (screen) =>
      /^\s*[❯>]\s+\/plan(?:\s|$)/.test(screen.cursorLine) && screen.cursorX === screen.cursorLine.indexOf("/plan") + 6,
    } : undefined,
  });
}
