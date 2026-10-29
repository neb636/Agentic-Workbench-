import type { ComponentType } from "react";
import type { WorkbenchView, Workspace } from "../../shared/models";
import { Registry } from "./registry";
import type { ViewStatus } from "./view-status";

export interface ViewComponentProps {
  view: WorkbenchView;
  workspace: Workspace;
}

export interface ViewDefinition {
  id: string;
  label: string;
  description: string;
  icon: ComponentType<{ size?: number }>;
  component: ComponentType<ViewComponentProps>;
  createState?: () => unknown;
  /** Whether the new-view menus offer this type; views opened by commands set it false. */
  creatable?: boolean;
  /** Title for new views; defaults to the label. */
  defaultTitle?: string;
  /** Views of this type are listed under their workspace in the left sidebar. */
  listInSidebar?: boolean;
  /** Status shown when no live status has been published for the view. */
  idleStatus?: (view: WorkbenchView) => ViewStatus | undefined;
}

export class ViewRegistry extends Registry<ViewDefinition> {}
