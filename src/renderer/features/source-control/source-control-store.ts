import { useEffect } from "react";
import { create } from "zustand";
import type { SourceControlStatus, Workspace } from "../../../shared/models";
import { errorMessage } from "../../core/errors";
import { watchWorkspace } from "../../core/workspace-watch";

interface SourceControlEntry {
  /** `null` when the folder is not under source control. */
  status?: SourceControlStatus | null;
  loading: boolean;
  error?: string;
}

export const useSourceControl = create<Record<string, SourceControlEntry>>(() => ({}));
const inFlight = new Map<string, Promise<void>>();

export function refreshSourceControl(root: string): Promise<void> {
  const running = inFlight.get(root);
  if (running) return running;
  useSourceControl.setState((state) => ({ [root]: { ...state[root], loading: true } }));
  const promise = window.workbench.sourceControl.status(root)
    .then((status) => useSourceControl.setState({ [root]: { status, loading: false } }))
    .catch((error: unknown) => useSourceControl.setState((state) => ({ [root]: { ...state[root], loading: false, error: errorMessage(error) } })))
    .finally(() => inFlight.delete(root));
  inFlight.set(root, promise);
  return promise;
}

/** Status for a folder, refreshed on focus and, when live, as its files change. */
export function useSourceControlStatus(root: string | undefined, live: boolean): SourceControlEntry | undefined {
  const entry = useSourceControl((state) => (root ? state[root] : undefined));
  useEffect(() => {
    if (!root) return;
    void refreshSourceControl(root);
    const refresh = () => void refreshSourceControl(root);
    window.addEventListener("focus", refresh);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = live ? watchWorkspace(root, () => { clearTimeout(timer); timer = setTimeout(refresh, 400); }) : undefined;
    return () => { window.removeEventListener("focus", refresh); clearTimeout(timer); off?.(); };
  }, [root, live]);
  return entry;
}

/** The folder the active view works in: a session's worktree when it has one, otherwise the workspace. */
export function activeRoot(workspace: Workspace): string {
  const active = workspace.views.find((view) => view.id === workspace.activeViewId);
  const cwd = (active?.state as { cwd?: unknown } | undefined)?.cwd;
  return typeof cwd === "string" && cwd ? cwd : workspace.path;
}
