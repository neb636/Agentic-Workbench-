import type { PromptContribution } from "../../shared/models";

export interface AssembledPrompt {
  userPrompt: string;
  contributions: PromptContribution[];
  content: string;
}

export class PromptAssembler {
  assemble(userPrompt: string, contributions: PromptContribution[]): AssembledPrompt {
    const enabled = contributions.filter((contribution) => contribution.enabled && contribution.content.trim());
    const sections = enabled.map((contribution) => contribution.content.trim());
    sections.push(userPrompt.trim());
    return {
      userPrompt,
      contributions: enabled,
      content: sections.filter(Boolean).join("\n\n"),
    };
  }
}
