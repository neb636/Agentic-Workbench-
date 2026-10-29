import type { FileViewState } from "../../../shared/models";
import { services } from "../../core/services";
import { useWorkbenchStore } from "../../state/workbench-store";

export interface OpenFileArgs extends FileViewState {
  workspaceId: string;
}

/** Focuses the tab already showing a file, or opens one. */
export function registerFileCommands(): void {
  services.commands.register<OpenFileArgs>("file.open", ({ workspaceId, root, path }) => {
    const store = useWorkbenchStore.getState();
    const workspace = store.workspaces.find((item) => item.id === workspaceId);
    if (!workspace) return;
    const existing = workspace.views.find((view) => view.type === "file"
      && (view.state as FileViewState | undefined)?.root === root && (view.state as FileViewState | undefined)?.path === path);
    if (existing) { store.selectView(workspaceId, existing.id); return; }
    store.createView(workspaceId, "file", path.split("/").at(-1) ?? path, { root, path } satisfies FileViewState);
  });
}
