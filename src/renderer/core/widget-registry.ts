import type { ComponentType } from "react";
import { Registry } from "./registry";

/** Slots pass whatever context they have; a workspace row passes only its workspace. */
export interface WidgetProps {
  workspaceId?: string;
  viewId?: string;
}

export interface WidgetDefinition {
  id: string;
  slot: string;
  order?: number;
  component: ComponentType<WidgetProps>;
}

export class WidgetRegistry extends Registry<WidgetDefinition> {
  forSlot(slot: string): WidgetDefinition[] {
    return this.list()
      .filter((item) => item.slot === slot)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }
}
