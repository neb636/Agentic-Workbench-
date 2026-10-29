import { app } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { PersistedState } from "../shared/models";
import { migratePersistedState, persistedStateSchema } from "../shared/schemas";

const emptyState: PersistedState = {
  workspaces: [],
  personas: [
    {
      id: "persona-thoughtful-collaborator",
      name: "Thoughtful collaborator",
      description: "Clear, pragmatic, and attentive to tradeoffs.",
      instructions:
        "Work as a thoughtful collaborator. Be concise, surface important tradeoffs, and ask only questions that materially change the result.",
      scope: "global",
    },
  ],
  instructionOptions: [],
  layout: { leftCollapsed: false, rightCollapsed: false },
};

function statePath() {
  return path.join(app.getPath("userData"), "workbench-state.json");
}

export async function loadState(): Promise<PersistedState> {
  try {
    const source = await fs.readFile(statePath(), "utf8");
    const result = persistedStateSchema.safeParse(migratePersistedState(JSON.parse(source)));
    if (!result.success) console.error("Workbench state did not validate; starting fresh", result.error.issues.slice(0, 5));
    return result.success ? result.data : emptyState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("Could not load workbench state", error);
    }
    return emptyState;
  }
}

export async function saveState(input: unknown): Promise<PersistedState> {
  const state = persistedStateSchema.parse(input);
  const target = statePath();
  const temporary = `${target}.next`;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(temporary, JSON.stringify(state, null, 2), "utf8");
  await fs.rename(temporary, target);
  return state;
}
