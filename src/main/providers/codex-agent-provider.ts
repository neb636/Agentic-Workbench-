import type { AgentOutput } from "../../shared/models";
import type { AgentProviderAdapter, AgentTurnCallbacks, AgentTurnContext } from "../agent-provider";
import { ProcessManager } from "../process-manager";

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function errorMessage(event: JsonObject): string | undefined {
  const direct = stringValue(event.message) ?? stringValue(event.error);
  if (direct) return direct;
  return isObject(event.error) ? stringValue(event.error.message) : undefined;
}

export function parseCodexEvent(line: string): {
  providerSessionId?: string;
  output?: AgentOutput;
  error?: string;
} {
  let event: JsonObject;
  try {
    const parsed: unknown = JSON.parse(line);
    if (!isObject(parsed)) return { output: { kind: "activity", text: line } };
    event = parsed;
  } catch {
    return { output: { kind: "activity", text: line } };
  }

  if (event.type === "thread.started") {
    return { providerSessionId: stringValue(event.thread_id) };
  }
  if (event.type === "turn.failed") {
    return { error: errorMessage(event) ?? "The agent turn failed." };
  }
  if ((event.type === "item.started" || event.type === "item.completed") && isObject(event.item)) {
    const item = event.item;
    if (item.type === "agent_message" && event.type === "item.completed") {
      const text = stringValue(item.text);
      return text ? { output: { kind: "assistant", text } } : {};
    }
    if (item.type === "command_execution" && event.type === "item.completed") {
      const command = stringValue(item.command);
      const processOutput = stringValue(item.aggregated_output);
      const text = [command ? `$ ${command}` : undefined, processOutput].filter(Boolean).join("\n");
      return text ? { output: { kind: "activity", text } } : {};
    }
    if (item.type === "file_change" && event.type === "item.completed") {
      const text = stringValue(item.summary) ?? "Workspace files changed.";
      return { output: { kind: "activity", text } };
    }
  }
  return {};
}

export class CodexAgentProvider implements AgentProviderAdapter {
  readonly id = "codex.cli";

  constructor(private readonly processes: ProcessManager) {}

  startTurn(context: AgentTurnContext, callbacks: AgentTurnCallbacks) {
    const args = context.providerSessionId
      ? ["exec", "resume", "--json", "--skip-git-repo-check", context.providerSessionId, "-"]
      : ["exec", "--json", "--sandbox", "workspace-write", "--skip-git-repo-check", "-"];
    let stdoutBuffer = "";
    let stderr = "";
    let reportedError = false;

    const consumeLine = (line: string) => {
      if (!line.trim()) return;
      const parsed = parseCodexEvent(line);
      if (parsed.providerSessionId) callbacks.onProviderSessionId(parsed.providerSessionId);
      if (parsed.output) callbacks.onOutput(parsed.output);
      if (parsed.error) {
        reportedError = true;
        callbacks.onError(parsed.error);
      }
    };

    return this.processes.start({
      command: process.env.WORKBENCH_CODEX_PATH ?? "codex",
      args,
      cwd: context.workspacePath,
      stdin: context.prompt,
    }, {
      onStdout: (data) => {
        stdoutBuffer += data;
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() ?? "";
        lines.forEach(consumeLine);
      },
      onStderr: (data) => { stderr += data; },
      onError: (error) => {
        reportedError = true;
        callbacks.onError(`Could not start Codex CLI: ${error.message}`);
      },
      onExit: (exitCode) => {
        consumeLine(stdoutBuffer);
        if (exitCode !== 0 && !reportedError) {
          callbacks.onError(stderr.trim() || `Codex CLI exited with code ${exitCode}.`);
        }
        callbacks.onExit(exitCode);
      },
    });
  }
}
