import { choice, isChoice, select, textInput, toggle, type PromptOptionDefinition } from "../../../shared/prompt-options";
import type { PromptMenuDefinition } from "../../core/prompt-menu-registry";
import { useWorkbenchStore } from "../../state/workbench-store";
import { ListChecksIcon } from "../../ui/icons";
import { InstructionsManager } from "./InstructionsManager";

export const builtInInstructions: PromptOptionDefinition[] = [
  toggle("create-issue", { label: "Create issue", category: "Project management",
    text: "When the work is done, draft an issue that describes the change, why it was needed, and any follow-up work." }),
  toggle("open-pr", { label: "Open PR", category: "Delivery",
    text: "When the change is ready, open a draft pull request that summarizes the change and how it was verified." }),
  toggle("write-report", { label: "Write report", category: "Delivery",
    text: "Finish with a short report: what changed, why, how it was verified, and any risks or follow-ups." }),
  select("unit-tests", { label: "Unit tests", category: "Verification", display: "segmented", default: "repo-defaults", choices: [
    choice("repo-defaults", "Repo defaults"),
    choice("write-new", "Write new", "Add or update unit tests that cover this change, and run them before finishing."),
    choice("skip", "Skip", "Do not add or run unit tests for this change."),
  ] }),
  textInput("test-focus", { label: "Test focus", category: "Verification", when: isChoice("unit-tests", "write-new"),
    placeholder: "e.g. error handling", template: "Focus the new tests on {{value}}." }),
];

export const instructionsMenu: PromptMenuDefinition = {
  id: "instructions",
  label: "Instructions",
  description: "Added to the end of your prompt",
  icon: ListChecksIcon,
  order: 20,
  kind: "instruction",
  placement: "append",
  resetAfterSend: false,
  options: ({ workspaceId }) => [
    ...builtInInstructions,
    ...useWorkbenchStore.getState().instructionOptions
      .filter((stored) => stored.scope === "global" || stored.workspaceId === workspaceId)
      .map((stored) => stored.option),
  ],
  manage: { title: "Manage instructions", description: "Reusable options that add instructions after your prompt.", component: InstructionsManager },
};
