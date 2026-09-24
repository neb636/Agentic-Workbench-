import { create } from "zustand";
import type { AgentDeliveryResult, AgentPromptRequest, AgentViewState, PromptQuotation } from "../../../shared/models";
import type { AssembledPrompt } from "../../core/prompt-assembler";
import { createId } from "../../core/id";
import { services } from "../../core/services";
import { useAgentRuntimes } from "../../core/agent-runtimes";
import { useWorkbenchStore } from "../../state/workbench-store";

export interface ComposerTarget { workspaceId: string; viewId: string; }
export interface PromptPreview extends AssembledPrompt { intent: AgentPromptRequest["intent"]; }
export interface PromptHistoryEntry {
  id: string;
  createdAt: number;
  draft: string;
  quotations: PromptQuotation[];
  preview: PromptPreview;
  outcome: AgentDeliveryResult["outcome"] | "saved";
  message: string;
}
interface ComposerRuntime {
  history: PromptHistoryEntry[];
  sending: boolean;
  result?: AgentDeliveryResult;
}
const emptyRuntime: ComposerRuntime = { history: [], sending: false };
export const useComposerState = create<{ views: Record<string, ComposerRuntime> }>(() => ({ views: {} }));
export const emptyComposerRuntime = emptyRuntime;

function stateFor({ workspaceId, viewId }: ComposerTarget): AgentViewState | undefined {
  return useWorkbenchStore.getState().workspaces.find((w) => w.id === workspaceId)?.views.find((v) => v.id === viewId)?.state as AgentViewState | undefined;
}
export function patchComposer(target: ComposerTarget, patch: Pick<AgentViewState, "draft" | "quotations" | "intent">): void {
  useWorkbenchStore.getState().updateViewState(target.workspaceId, target.viewId, {
    ...patch, composerRevision: (stateFor(target)?.composerRevision ?? 0) + 1,
  });
}
function exists({ workspaceId, viewId }: ComposerTarget): boolean {
  return Boolean(useWorkbenchStore.getState().workspaces.find((w) => w.id === workspaceId)?.views.some((v) => v.id === viewId));
}
function updateRuntime(viewId: string, patch: Partial<ComposerRuntime>): void {
  useComposerState.setState((state) => ({ views: { ...state.views, [viewId]: { ...(state.views[viewId] ?? emptyRuntime), ...patch } } }));
}
export function clearComposerRuntime(viewId: string): void {
  useComposerState.setState((state) => { const views = { ...state.views }; delete views[viewId]; return { views }; });
}
function previewFor(target: ComposerTarget): PromptPreview {
  const state = stateFor(target);
  return { ...services.promptAssembler.assemble(state?.draft ?? "", services.promptContributors.collect(target)), intent: state?.intent ?? "default" };
}
function entryFor(target: ComposerTarget, outcome: PromptHistoryEntry["outcome"], message: string): PromptHistoryEntry {
  const state = stateFor(target);
  return { id: createId("prompt"), createdAt: Date.now(), draft: state?.draft ?? "", quotations: [...(state?.quotations ?? [])], preview: previewFor(target), outcome, message };
}
function remember(viewId: string, entry: PromptHistoryEntry): boolean {
  if (JSON.stringify(entry).length > 2_000_000) return false;
  const history = [entry, ...(useComposerState.getState().views[viewId]?.history ?? [])].slice(0, 20);
  // Keep local recall bounded even when prompts contain large pasted logs.
  while (history.length > 1 && JSON.stringify(history).length > 2_000_000) history.pop();
  updateRuntime(viewId, { history });
  return true;
}

export function registerComposerContributions(): void {
  services.promptContributors.register({ id: "terminal-quotations", contributions: (target) =>
    (stateFor(target)?.quotations ?? []).map((quote, index) => ({ id: quote.id, kind: "context", source: `Terminal selection ${index + 1}`,
      enabled: true, content: `Terminal selection ${index + 1}:\n${quote.content.split("\n").map((line) => `> ${line}`).join("\n")}` })),
  });
  services.commands.register<ComposerTarget, PromptPreview>("agent.composer.preview", previewFor);
  services.commands.register<ComposerTarget & { text: string }>("agent.composer.quote", (target) => {
    if (!exists(target) || !target.text.trim()) return;
    // A quotation is text, never a terminal control sequence.
    // eslint-disable-next-line no-control-regex
    const content = target.text.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");
    const quotations = [...(stateFor(target)?.quotations ?? []), { id: createId("quote"), content }];
    patchComposer(target, { quotations });
  });
  services.commands.register<ComposerTarget & { entryId: string }>("agent.composer.recall", (target) => {
    const entry = useComposerState.getState().views[target.viewId]?.history.find((item) => item.id === target.entryId);
    if (!entry || !exists(target)) return;
    const current = stateFor(target);
    if ((current?.draft?.trim() || current?.quotations?.length) && !remember(target.viewId, entryFor(target, "saved", "Draft saved before recall."))) {
      throw new Error("The current draft is too large for recent history. Copy it before replacing it.");
    }
    patchComposer(target, {
      draft: entry.draft, quotations: entry.quotations, intent: entry.preview.intent,
    });
  });
  services.commands.register<ComposerTarget>("agent.composer.send", async (target) => {
    const runtime = useAgentRuntimes.getState().sessions[target.viewId];
    const state = stateFor(target);
    if (!runtime || !state?.draft?.trim() || useComposerState.getState().views[target.viewId]?.sending) return;
    const entry = entryFor(target, "not-sent", "");
    if (entry.preview.content.length > 500_000) {
      updateRuntime(target.viewId, { result: { outcome: "not-sent", stage: "none", message: "The composed prompt exceeds 500,000 characters. Shorten the prompt or remove quoted context." } });
      return;
    }
    if (/^\s*[/!]/.test(entry.draft)) {
      updateRuntime(target.viewId, { result: { outcome: "not-sent", stage: "none", message: "Use native commands directly in the terminal." } });
      return;
    }
    const revision = state.composerRevision ?? 0;
    updateRuntime(target.viewId, { sending: true, result: undefined });
    let result: AgentDeliveryResult;
    try { result = await runtime.controller.sendPrompt({ prompt: entry.preview.content, intent: entry.preview.intent }); }
    catch { result = { outcome: "uncertain", stage: "unknown", message: "Delivery could not be confirmed. Inspect the terminal before retrying." }; }
    if (!exists(target)) return;
    remember(target.viewId, { ...entry, outcome: result.outcome, message: result.message });
    updateRuntime(target.viewId, { sending: false, result });
    if (result.outcome === "submitted" && (stateFor(target)?.composerRevision ?? 0) === revision) {
      patchComposer(target, { draft: "", quotations: [], intent: "default" });
    }
  });
}
