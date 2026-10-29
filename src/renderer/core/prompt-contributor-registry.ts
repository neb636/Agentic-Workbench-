import type { PromptContribution } from "../../shared/models";
import { Registry } from "./registry";

export interface PromptContributor {
  id: string;
  contributions: (context: { workspaceId: string; viewId: string }) => PromptContribution[];
}
export class PromptContributorRegistry extends Registry<PromptContributor> {
  collect(context: { workspaceId: string; viewId: string }): PromptContribution[] {
    return this.list().flatMap((contributor) => contributor.contributions(context));
  }
}
