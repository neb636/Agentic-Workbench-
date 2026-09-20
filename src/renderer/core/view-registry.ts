import type { ComponentType } from "react";
import type { WorkbenchView, Workspace } from "../../shared/models";
import { Registry } from "./registry";

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
}

export class ViewRegistry extends Registry<ViewDefinition> {}
