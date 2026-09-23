import type { AgentDetection, ScreenObservation } from "../agent-provider";

export function pastePrompt(prompt: string): string {
  if (/^\s*[/!]/.test(prompt)) throw new Error("Use native commands directly in the terminal.");
  // Terminal controls must never escape bracketed paste into native commands.
  // eslint-disable-next-line no-control-regex
  if (!prompt.trim() || /[\x00-\x08\x0b-\x1f\x7f]/.test(prompt.replace(/\r\n/g, "\n"))) {
    throw new Error("Prompt contains unsupported terminal control characters.");
  }
  return `\x1b[200~${prompt.replace(/\r\n/g, "\n")}\x1b[201~`;
}

export function detectCliScreen(kind: "codex" | "claude") {
  return (screen: ScreenObservation): AgentDetection => {
    const lines = [...screen.lines];
    while (lines.length && !lines.at(-1)?.trim()) lines.pop();
    const bottom = lines.slice(-12).join("\n");
    const result = (activity: AgentDetection["activity"], canSubmit: boolean, rule: string, reason: string, inputState: AgentDetection["inputState"] = "unavailable"): AgentDetection =>
      ({ activity, canSubmit, inputState, rule: `${kind}.${rule}`, reason });
    if (/trust (?:this|the)|allow once|allow always|yes, (?:proceed|allow)|do you want to (?:proceed|allow)|would you like to (?:run|proceed)|enter to confirm|select an option|sign in|log in|choose.*account/i.test(bottom)) {
      return result("waiting-for-input", false, "decision", "Respond in the terminal.");
    }
    const working = kind === "codex"
      ? /esc to (?:interrupt|cancel)|• (?:Working|Thinking)|(?:Working|Thinking)\s*[.…]/i.test(bottom)
      : /esc to (?:interrupt|cancel)|(?:^|\n)\s*[✻✽✶✳✢·] [^\n]+…/i.test(bottom);
    const prompt = kind === "codex" ? /^\s*›\s?(.*)$/ : /^\s*[❯>]\s?(.*)$/;
    let match = screen.cursorLine.match(prompt);
    let multiline = false;
    if (!match) {
      for (let row = screen.cursorY - 1; row >= Math.max(0, screen.cursorY - 12); row--) {
        const line = screen.lines[row];
        const candidate = line.match(prompt);
        if (candidate) { match = candidate; multiline = true; break; }
        if (line.trim() && !/^\s{2}/.test(line)) break;
      }
    }
    const atStart = screen.cursorX <= (screen.cursorLine.indexOf(kind === "codex" ? "›" : "❯") + 2);
    const placeholder = match && atStart && !screen.inputWasEdited && (kind === "codex"
      ? screen.cursorCellDim && /^(Ask Codex|Write tests|Explain this|Implement|Find and fix|Improve documentation|Summarize recent|Run \/review)/.test(match[1])
      : /^Try\s+["“].+["”]$/.test(match[1]));
    const empty = Boolean(match && !multiline && (!match[1].trim() || placeholder));
    const inputState = !match || !screen.bracketedPaste ? "unavailable" : empty ? "empty" : "draft";
    if (working) return result("working", inputState === "empty", "working", empty ? "Submit using the CLI’s native queue or steering." : "Clear the native draft or use the terminal input.", inputState);
    if (match) return result("ready", inputState === "empty", empty ? "prompt" : "native-draft", !screen.bracketedPaste ? "Use the terminal; paste mode is not available." : empty ? "Ready for a prompt." : "A draft is already in the terminal. Send or clear it there first.", inputState);
    return result("unknown", false, "unmatched", "Use the terminal until its prompt is recognized.");
  };
}
