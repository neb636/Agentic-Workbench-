import type { PromptContribution } from "./models";

export interface AssembledPrompt {
  userPrompt: string;
  contributions: PromptContribution[];
  content: string;
}

/** Prepended contributions come before the user's prompt and appended ones after it, each in registration order. */
export function assemblePrompt(userPrompt: string, contributions: PromptContribution[]): AssembledPrompt {
  const enabled = contributions.filter((contribution) => contribution.enabled && contribution.content.trim());
  const prepended = enabled.filter((contribution) => contribution.placement !== "append");
  const appended = enabled.filter((contribution) => contribution.placement === "append");
  const sections = [...prepended.map((c) => c.content.trim()), userPrompt.trim(), ...appended.map((c) => c.content.trim())];
  return {
    userPrompt,
    contributions: [...prepended, ...appended],
    content: sections.filter(Boolean).join("\n\n"),
  };
}
