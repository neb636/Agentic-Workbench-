import type { FilesChangedEvent } from "../../shared/models";

const listeners = new Map<string, Set<(event: FilesChangedEvent) => void>>();
let unsubscribe: (() => void) | undefined;

/** Shares one main-process watch per workspace root among every consumer in this window. */
export function watchWorkspace(root: string, listener: (event: FilesChangedEvent) => void): () => void {
  unsubscribe ??= window.workbench.files.onChanged((event) => listeners.get(event.root)?.forEach((notify) => notify(event)));
  let set = listeners.get(root);
  if (!set) {
    set = new Set();
    listeners.set(root, set);
    window.workbench.files.watch(root);
  }
  set.add(listener);
  return () => {
    const current = listeners.get(root);
    if (!current?.delete(listener) || current.size) return;
    listeners.delete(root);
    window.workbench.files.unwatch(root);
  };
}
