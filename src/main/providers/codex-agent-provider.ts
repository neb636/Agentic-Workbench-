import type { AgentProviderAdapter, AgentSubmission } from "../agent-provider";
import { detectCliScreen, pastePrompt } from "./cli-screen";
import type { AgentPromptRequest } from "../../shared/models";

export class CodexAgentProvider implements AgentProviderAdapter {
  readonly id = "codex.cli";
  readonly label = "Codex";
  readonly executable = process.env.WORKBENCH_CODEX_PATH ?? "codex";
  readonly interrupt = "\u001b";
  args(resume: boolean) { return resume ? ["resume"] : []; }
  detect = detectCliScreen("codex");
  readonly capabilities = { planning: true };
  submit = (request: AgentPromptRequest): AgentSubmission => ({ paste: pastePrompt(request.prompt),
    prefix: request.intent === "plan" ? { input: "/plan ", acknowledged: (screen) => /^\s*› \/plan\s*$/.test(screen.cursorLine) } : undefined,
  });
}
