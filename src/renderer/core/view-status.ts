import { create } from "zustand";
import type { WorkbenchView } from "../../shared/models";
import { services } from "./services";

export interface ViewStatus {
  label: string;
  tone: "idle" | "ready" | "working" | "attention" | "error";
  /** Secondary text, such as the session's provider. */
  detail?: string;
  /** Something finished that the user has not looked at yet. */
  unseen?: boolean;
  description?: string;
}

/** Live statuses published by features for views whose sessions outlive their components. */
export const useViewStatuses = create<Record<string, ViewStatus>>(() => ({}));

export function publishViewStatus(viewId: string, status: ViewStatus | undefined): void {
  useViewStatuses.setState((state) => {
    const next = { ...state };
    if (status) next[viewId] = status; else delete next[viewId];
    return next;
  }, true);
}

export function viewStatus(view: WorkbenchView, statuses: Record<string, ViewStatus>): ViewStatus | undefined {
  return statuses[view.id] ?? services.views.get(view.type)?.idleStatus?.(view);
}
