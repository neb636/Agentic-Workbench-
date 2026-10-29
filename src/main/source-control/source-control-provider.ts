import path from "node:path";
import type { SourceControlStatus, WorktreeResult } from "../../shared/models";
import { worktreeContainer } from "../workspace-files";

export type ProviderStatus = Omit<SourceControlStatus, "providerId" | "providerLabel" | "root">;

/** A version-control system behind a narrow, fixed set of operations. */
export interface SourceControlProvider {
  id: string;
  label: string;
  detect: (root: string) => Promise<boolean>;
  status: (root: string) => Promise<ProviderStatus>;
  /** Records every working change in one commit. */
  commit: (root: string, message: string) => Promise<{ commitId: string }>;
  createWorktree: (root: string, branch: string, target: string) => Promise<WorktreeResult>;
}

export class SourceControlService {
  private readonly detected = new Map<string, SourceControlProvider | null>();

  constructor(private readonly providers: SourceControlProvider[]) {}

  async providerFor(root: string): Promise<SourceControlProvider | undefined> {
    if (!this.detected.has(root)) {
      let found: SourceControlProvider | null = null;
      for (const provider of this.providers) {
        if (await provider.detect(root).catch(() => false)) { found = provider; break; }
      }
      this.detected.set(root, found);
    }
    return this.detected.get(root) ?? undefined;
  }

  async status(root: string): Promise<SourceControlStatus | null> {
    const provider = await this.providerFor(root);
    if (!provider) return null;
    return { ...(await provider.status(root)), providerId: provider.id, providerLabel: provider.label, root };
  }

  async commit(root: string, message: string): Promise<{ commitId: string }> {
    return (await this.require(root)).commit(root, message);
  }

  async createWorktree(root: string, branch: string): Promise<WorktreeResult> {
    const provider = await this.require(root);
    const target = path.join(worktreeContainer(root), branch.replace(/[^A-Za-z0-9._-]+/g, "-"));
    return provider.createWorktree(root, branch, target);
  }

  private async require(root: string): Promise<SourceControlProvider> {
    const provider = await this.providerFor(root);
    if (!provider) throw new Error("This folder is not under source control.");
    return provider;
  }
}
