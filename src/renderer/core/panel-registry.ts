import type { ComponentType } from "react";
import type { Workspace } from "../../shared/models";
import { Registry } from "./registry";

export interface PanelProps {
  workspace: Workspace;
}

/** A side panel shown in the right sidebar and switched from its activity bar. */
export interface PanelDefinition {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
  order?: number;
  component: ComponentType<PanelProps>;
}

export class PanelRegistry extends Registry<PanelDefinition> {
  ordered(): PanelDefinition[] {
    return this.list().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }
}
