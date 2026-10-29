import { useRef, useState } from "react";
import {
  Button as AriaButton,
  Dialog,
  DialogTrigger,
  ListBox,
  ListBoxItem,
  Modal,
  ModalOverlay,
  Popover,
  Select,
  SelectValue,
  TextArea,
  Tooltip,
  TooltipTrigger,
} from "react-aria-components";
import type { AgentSessionStatus, AgentViewState } from "../../../shared/models";
import { services } from "../../core/services";
import type { ViewStatus } from "../../core/view-status";
import { Button, IconButton } from "../../ui/controls";
import { ArrowUpIcon, ChevronDownIcon, CloseIcon, EyeIcon, HistoryIcon, NewChatIcon, QuoteIcon, StopIcon } from "../../ui/icons";
import { emptyComposerRuntime, patchComposer, useComposerState, type PromptPreview } from "./composer-state";
import { PromptMenuBar } from "./prompt-menus/PromptMenuBar";

export interface ComposerSession {
  status?: AgentSessionStatus;
  display: ViewStatus;
  planning: boolean;
  selection: string;
  interrupt: () => void;
  focusTerminal: () => void;
}

export function AgentComposer({ workspaceId, viewId, agentLabel, state, session, canLaunch, onCollapse }: {
  workspaceId: string;
  viewId: string;
  agentLabel: string;
  state: AgentViewState;
  /** Present once the CLI is running; before that, sending launches it. */
  session?: ComposerSession;
  canLaunch: boolean;
  onCollapse?: () => void;
}) {
  const target = { workspaceId, viewId };
  const runtime = useComposerState((s) => s.views[viewId] ?? emptyComposerRuntime);
  const patch = (value: Pick<AgentViewState, "draft" | "quotations" | "intent">) => patchComposer(target, value);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState<PromptPreview>();
  const [historyId, setHistoryId] = useState<string>();
  const [error, setError] = useState("");
  const [copiedRevision, setCopiedRevision] = useState<number>();
  const status = session?.status;
  const planning = session?.planning ?? false;
  const wantsPlan = state.intent === "plan";
  const busy = runtime.sending || runtime.launching;
  const hasDraft = Boolean(state.draft?.trim());
  const canSend = session
    ? Boolean(hasDraft && status?.canSubmit && !busy && (!wantsPlan || (planning && status.activity === "ready")))
    : Boolean(hasDraft && canLaunch && !busy && !wantsPlan);
  const historyEntry = runtime.history.find((entry) => entry.id === historyId) ?? runtime.history[0];
  const assembly = () => services.commands.execute<PromptPreview>("agent.composer.preview", target);
  const send = () => {
    if (!canSend) return;
    setError(""); promptRef.current?.focus();
    void services.commands.execute(session ? "agent.composer.send" : "agent.session.launch", { ...target, providerId: state.providerId }).catch((e: unknown) => setError(String(e)));
  };
  const quote = async () => {
    await services.commands.execute("agent.composer.quote", { ...target, text: session?.selection ?? "" });
    promptRef.current?.focus();
  };
  const feedback = error || (runtime.launching ? "Starting the CLI…" : runtime.sending ? "Delivering prompt…" : runtime.result?.outcome === "uncertain"
    ? `Delivery uncertain. ${runtime.result.message}` : runtime.result?.outcome === "not-sent"
      ? `Not sent. ${runtime.result.message}` : !session ? "" : !status?.canSubmit ? status?.reason
        : wantsPlan && status.activity !== "ready" ? "Wait until the CLI is ready to send for planning."
          : runtime.result?.message || status?.reason);
  const needsHandoff = session && (!status?.canSubmit || runtime.result?.outcome === "uncertain" || runtime.result?.outcome === "not-sent");

  return <div className="composer-dock">
    {session && <div className="session-strip">
      <div className="session-strip-start">
        <TooltipTrigger delay={300}>
          <AriaButton className={`session-pill tone-${session.display.tone}`} aria-label={`Session status: ${session.display.label}`}>
            <span className="status-dot" />{session.display.label}
          </AriaButton>
          <Tooltip className="wb-tooltip">{session.display.description}</Tooltip>
        </TooltipTrigger>
        {status?.activity === "working" && <Button className="strip-button" onPress={session.interrupt}><StopIcon size={13} />Interrupt</Button>}
      </div>
      <div className="session-strip-end">
        <Button className="strip-button" isDisabled={!session.selection.trim()} onPress={() => void quote()}><QuoteIcon size={13} />Add to prompt</Button>
        <Button className="strip-button" onPress={() => { void assembly().then(setPreview).catch((e: unknown) => setError(String(e))); }}><EyeIcon size={13} />Preview</Button>
        <DialogTrigger>
          <Button className="strip-button" isDisabled={!runtime.history.length} aria-label="Activity"><HistoryIcon size={13} />Activity{runtime.history.length > 0 && <span className="strip-count">{runtime.history.length}</span>}</Button>
          <Popover className="wb-popover composer-history" placement="top end">
            <Dialog aria-label="Recent prompts">
              {({ close }) => <>
                <h3>Recent prompts</h3>
                <p className="composer-note">This session, until the app closes. Recall uses your current persona and instructions.</p>
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
        <Button className="strip-button" onPress={() => void services.commands.execute("agent.session.reset", target)}><NewChatIcon size={13} />New conversation</Button>
      </div>
    </div>}
    <div className="composer-box">
      <div className="composer-box-top">
        {!!state.quotations?.length && <div className="composer-quotations" aria-label={`Quoted context: ${state.quotations.length} selections`}>
          {state.quotations.map((item, index) => <div className="composer-quotation" key={item.id}>
            <details><summary>Terminal selection {index + 1}</summary><pre>{item.content}</pre></details>
            <IconButton label={`Remove terminal selection ${index + 1}`} onPress={() => patch({ quotations: state.quotations?.filter((quote) => quote.id !== item.id) })}><CloseIcon size={11} /></IconButton>
          </div>)}
        </div>}
        <span className="kbd-hint">⌘/Ctrl + Enter</span>
        {onCollapse && <IconButton label="Collapse composer" onPress={onCollapse}><ChevronDownIcon size={14} /></IconButton>}
      </div>
      <TextArea ref={promptRef} aria-label="Prompt" placeholder={`Ask ${agentLabel} to build, investigate, or refine…`} value={state.draft ?? ""}
        onChange={(event) => patch({ draft: event.currentTarget.value })}
        onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); send(); } }} />
      <div className="composer-feedback" aria-live="polite">{feedback}</div>
      {needsHandoff && <div className="composer-handoff">
        <Button onPress={session.focusTerminal}>Focus terminal</Button>
        <Button onPress={() => { void assembly().then((value) => navigator.clipboard.writeText(value.content)).then(() => setCopiedRevision(state.composerRevision ?? 0)).catch(() => setError("Could not copy. Open Preview to select the prompt text.")); }}>{copiedRevision === (state.composerRevision ?? 0) ? "Copied prompt" : "Copy composed prompt"}</Button>
      </div>}
      <div className="composer-toolbar">
        <PromptMenuBar target={target} selections={state.promptSelections ?? {}} />
        <div className="composer-toolbar-end">
          {services.widgets.forSlot("agent.composer.toolbar").map((widget) => {
            const Widget = widget.component;
            return <Widget key={widget.id} workspaceId={workspaceId} viewId={viewId} />;
          })}
          <Select aria-label="Mode" className="mode-select" selectedKey={wantsPlan ? "plan" : "default"}
            disabledKeys={planning || wantsPlan ? [] : ["plan"]} onSelectionChange={(key) => patch({ intent: key === "plan" ? "plan" : "default" })}>
            <AriaButton className="composer-chip"><SelectValue>{({ selectedText }) => selectedText}</SelectValue><ChevronDownIcon size={12} /></AriaButton>
            <Popover className="wb-popover" placement="top end">
              <ListBox>
                <ListBoxItem id="default" textValue="Code"><div><span>Code</span><small>Keeps the CLI’s current mode</small></div></ListBoxItem>
                <ListBoxItem id="plan" textValue="Plan"><div><span>Plan</span><small>{planning ? "Enters the CLI’s Plan mode" : "Start the session to plan"}</small></div></ListBoxItem>
              </ListBox>
            </Popover>
          </Select>
          <Button className="send-button" aria-label={wantsPlan ? "Send for planning" : "Send prompt"} isDisabled={!canSend} onPress={send}>
            <ArrowUpIcon size={16} />
          </Button>
        </div>
      </div>
    </div>
    {wantsPlan && <p className="composer-plan-note" id={`plan-note-${viewId}`}>{planning
      ? "Enters the CLI’s Plan mode. The CLI may stay in that mode afterward."
      : "This provider does not support planning submissions. Switch to Code to send normally."}</p>}
    <ModalOverlay className="wb-modal-overlay" isDismissable isOpen={Boolean(preview)} onOpenChange={(open) => { if (!open) setPreview(undefined); }}>
      <Modal className="wb-modal composer-preview-modal"><Dialog aria-label="Prompt preview" className="wb-dialog">
        <div className="dialog-header"><div><h2>Prompt preview</h2><p>{preview?.intent === "plan" ? "Send for planning · enters the CLI’s Plan mode" : "Send · keeps the CLI’s current mode"}</p></div><Button onPress={() => setPreview(undefined)}>Close</Button></div>
        <div className="composer-preview-body">
          <div className="prompt-sources" aria-label="Included context">
            {preview?.contributions.filter((item) => item.placement !== "append").map((item) => <span key={`${item.kind}-${item.id}`}>{item.source}</span>)}
            <span className="is-prompt">Your prompt</span>
            {preview?.contributions.filter((item) => item.placement === "append").map((item) => <span key={`${item.kind}-${item.id}`}>{item.source}</span>)}
          </div>
          <pre className="prompt-preview-text" tabIndex={0}>{preview?.content || "Nothing to send yet."}</pre>
        </div>
      </Dialog></Modal>
    </ModalOverlay>
  </div>;
}
