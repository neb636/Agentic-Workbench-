import type { PromptContribution } from "../../shared/models";
import { assemblePrompt, type AssembledPrompt } from "../../shared/prompt-assembly";

export type { AssembledPrompt };

export class PromptAssembler {
  assemble(userPrompt: string, contributions: PromptContribution[]): AssembledPrompt {
    return assemblePrompt(userPrompt, contributions);
  }
}
