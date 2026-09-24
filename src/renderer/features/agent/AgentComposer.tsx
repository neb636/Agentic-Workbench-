import { useRef, useState } from "react";
import { Checkbox, Dialog, DialogTrigger, ListBox, ListBoxItem, Modal, ModalOverlay, Popover, TextArea } from "react-aria-components";
import type { AgentSessionStatus, AgentViewState } from "../../../shared/models";
import { services } from "../../core/services";
import { Button, IconButton } from "../../ui/controls";
import { SendIcon } from "../../ui/icons";
import { emptyComposerRuntime, patchComposer, useComposerState, type PromptPreview } from "./composer-state";

export function AgentComposer({ workspaceId, viewId, state, status, planning, selection, focusTerminal }: {
  workspaceId: string;
  viewId: string;
  state: AgentViewState;
  status?: AgentSessionStatus;
  planning: boolean;
  selection: string;
  focusTerminal: () => void;
}) {
  const target = { workspaceId, viewId };
  const runtime = useComposerState((s) => s.views[viewId] ?? emptyComposerRuntime);
  const patch = (value: Pick<AgentViewState, "draft" | "quotations" | "intent">) => patchComposer(target, value);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState<PromptPreview>();
  const [historyId, setHistoryId] = useState<string>();
  const [error, setError] = useState("");
  const [copiedRevision, setCopiedRevision] = useState<number>();
  const wantsPlan = state.intent === "plan";
  const canSend = Boolean(state.draft?.trim() && status?.canSubmit && !runtime.sending && (!wantsPlan || (planning && status.activity === "ready")));
  const historyEntry = runtime.history.find((entry) => entry.id === historyId) ?? runtime.history[0];
  const assembly = () => services.commands.execute<PromptPreview>("agent.composer.preview", target);
  const send = () => {
    if (!canSend) return;
    setError(""); promptRef.current?.focus();
    void services.commands.execute("agent.composer.send", target).catch((e: unknown) => setError(String(e)));
  };
  const quote = async () => {
    await services.commands.execute("agent.composer.quote", { ...target, text: selection });
    promptRef.current?.focus();
  };
  const feedback = error || (runtime.sending ? "Delivering prompt…" : runtime.result?.outcome === "uncertain"
    ? `Delivery uncertain. ${runtime.result.message}` : runtime.result?.outcome === "not-sent"
      ? `Not sent. ${runtime.result.message}` : !status?.canSubmit ? status?.reason
        : wantsPlan && status.activity !== "ready" ? "Wait until the CLI is ready to send for planning."
          : runtime.result?.message || status?.reason);

  return <div className="composer-panel">
    <div className="composer-tools">
      <Button isDisabled={!selection.trim()} onPress={() => void quote()}>Add to prompt</Button>
      <Button onPress={() => { void assembly().then(setPreview).catch((e: unknown) => setError(String(e))); }}>Preview</Button>
      <DialogTrigger>
        <Button isDisabled={!runtime.history.length}>Recent prompts</Button>
        <Popover className="wb-popover composer-history" placement="top start">
          <Dialog aria-label="Recent prompts">
            {({ close }) => <>
              <h3>Recent prompts</h3>
              <p className="composer-note">This view, until the app closes. Recall uses your current persona and instructions.</p>
              <ListBox aria-label="Prompt history" selectionMode="single" selectedKeys={historyEntry ? [historyEntry.id] : []}
                onSelectionChange={(keys) => { if (keys !== "all") setHistoryId(String([...keys][0])); }}>
                {runtime.history.map((entry) => <ListBoxItem key={entry.id} id={entry.id} textValue={entry.draft || "Quoted context"}>
                  <span>{entry.draft || "Quoted context"}</span><small>{entry.outcome === "saved" ? "Saved draft" : entry.outcome === "submitted" ? "Handed to CLI" : entry.outcome === "uncertain" ? "Delivery uncertain" : "Not sent"} · {new Date(entry.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>
                </ListBoxItem>)}
              </ListBox>
              {historyEntry && <>
                <p className="composer-note" title={historyEntry.message}>{historyEntry.preview.intent === "plan" ? "Planning request" : "Uses the CLI’s current mode"}</p>
                <pre className="prompt-preview-text">{historyEntry.preview.content}</pre>
                <Button onPress={() => { void services.commands.execute("agent.composer.recall", { ...target, entryId: historyEntry.id }).then(() => {
                  close(); promptRef.current?.focus();
                }).catch((e: unknown) => { close(); setError(e instanceof Error ? e.message : String(e)); }); }}>Use as draft</Button>
              </>}
            </>}
          </Dialog>
        </Popover>
      </DialogTrigger>
    </div>
    {!!state.quotations?.length && <div className="composer-quotations" aria-label={`Quoted context: ${state.quotations.length} selections`}>
      {state.quotations.map((item, index) => <div className="composer-quotation" key={item.id}>
        <details><summary>Terminal selection {index + 1}</summary><pre>{item.content}</pre></details>
        <IconButton label={`Remove terminal selection ${index + 1}`} onPress={() => patch({ quotations: state.quotations?.filter((quote) => quote.id !== item.id) })}>×</IconButton>
      </div>)}
    </div>}
    <TextArea ref={promptRef} aria-label="Prompt" placeholder="Compose a prompt for your CLI…" value={state.draft ?? ""}
      onChange={(event) => patch({ draft: event.currentTarget.value })}
      onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); send(); } }} />
    <div className="composer-feedback" aria-live="polite">{feedback}</div>
    {(!status?.canSubmit || runtime.result?.outcome === "uncertain" || runtime.result?.outcome === "not-sent") && <div className="composer-handoff">
      <Button onPress={focusTerminal}>Focus terminal</Button>
      <Button onPress={() => { void assembly().then((value) => navigator.clipboard.writeText(value.content)).then(() => setCopiedRevision(state.composerRevision ?? 0)).catch(() => setError("Could not copy. Open Preview to select the prompt text.")); }}>{copiedRevision === (state.composerRevision ?? 0) ? "Copied prompt" : "Copy composed prompt"}</Button>
    </div>}
    <div className="composer-actions">
      <div className="composer-send-options">
        {(planning || wantsPlan) && <Checkbox className="wb-checkbox" isSelected={wantsPlan} isDisabled={!planning && !wantsPlan}
          onChange={(selected) => patch({ intent: selected ? "plan" : "default" })} aria-describedby={wantsPlan ? `plan-note-${viewId}` : undefined}>
          <span className="checkbox-box">✓</span><span>Plan this prompt</span>
        </Checkbox>}
        <span className="composer-hint">⌘ / Ctrl + Enter to send</span>
      </div>
      <Button className="primary-button composer-send" aria-label={wantsPlan ? "Send for planning" : "Send prompt"} isDisabled={!canSend} onPress={send}>
        <SendIcon size={14} />{wantsPlan ? "Send for planning" : "Send"}
      </Button>
    </div>
    {wantsPlan && <p className="composer-plan-note" id={`plan-note-${viewId}`}>{planning
      ? "Enters the CLI’s Plan mode. The CLI may stay in that mode afterward."
      : "This provider does not support planning submissions. Uncheck to send normally."}</p>}
    <ModalOverlay className="wb-modal-overlay" isDismissable isOpen={Boolean(preview)} onOpenChange={(open) => { if (!open) setPreview(undefined); }}>
      <Modal className="wb-modal composer-preview-modal"><Dialog aria-label="Prompt preview" className="wb-dialog">
        <div className="dialog-header"><div><h2>Prompt preview</h2><p>{preview?.intent === "plan" ? "Send for planning · enters the CLI’s Plan mode" : "Send · keeps the CLI’s current mode"}</p></div><Button onPress={() => setPreview(undefined)}>Close</Button></div>
        <div className="composer-preview-body">
          <div className="prompt-sources" aria-label="Included context">{preview?.contributions.map((item) => <span key={`${item.kind}-${item.id}`}>{item.source}</span>)}<span>Your prompt</span></div>
          <pre className="prompt-preview-text" tabIndex={0}>{preview?.content || "Nothing to send yet."}</pre>
        </div>
      </Dialog></Modal>
    </ModalOverlay>
  </div>;
}
