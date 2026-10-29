import { useState } from "react";
import { Dialog, DialogTrigger, GridList, GridListItem, Heading, Modal, ModalOverlay, TextArea, TextField, Label } from "react-aria-components";
import type { SourceControlChange } from "../../../shared/models";
import { errorMessage } from "../../core/errors";
import type { PanelProps } from "../../core/panel-registry";
import { services } from "../../core/services";
import type { WidgetProps } from "../../core/widget-registry";
import { useWorkbenchStore } from "../../state/workbench-store";
import { Button, IconButton } from "../../ui/controls";
import { BranchIcon, CheckIcon, FileIcon, RefreshIcon } from "../../ui/icons";
import { activeRoot, refreshSourceControl, useSourceControlStatus } from "./source-control-store";

const LETTERS: Record<SourceControlChange["kind"], string> = { modified: "M", added: "A", deleted: "D", renamed: "R", untracked: "U", conflicted: "C" };

function folderName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

export function SourceControlPanel({ workspace }: PanelProps) {
  const root = activeRoot(workspace);
  const entry = useSourceControlStatus(root, true);
  const status = entry?.status;
  const [message, setMessage] = useState("");
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState("");
  const count = status?.changes.length ?? 0;
  const commit = async (close: () => void) => {
    setCommitting(true); setError("");
    try { await window.workbench.sourceControl.commit(root, message.trim()); setMessage(""); }
    catch (e) { setError(errorMessage(e)); }
    finally { setCommitting(false); close(); void refreshSourceControl(root); }
  };

  return <div className="side-panel source-control-panel">
    <div className="side-panel-header">
      <h2>{folderName(root)}</h2>
      <IconButton label="Refresh changes" onPress={() => void refreshSourceControl(root)}><RefreshIcon size={14} /></IconButton>
    </div>
    {status === null ? <p className="panel-empty">This folder is not under source control.</p> : !status ? <p className="panel-empty">{entry?.error ?? "Reading changes…"}</p> : <>
      <div className="branch-row">
        <BranchIcon size={14} /><span className="branch-name">{status.branch ?? "Detached HEAD"}</span>
        {(status.ahead > 0 || status.behind > 0) && <small>↑{status.ahead} ↓{status.behind}</small>}
        <small className="branch-provider">{status.providerLabel}</small>
      </div>
      <div className="commit-area">
        <TextField aria-label="Commit message" value={message} onChange={setMessage}>
          <TextArea placeholder="Commit message" rows={3} />
        </TextField>
        <DialogTrigger>
          <Button className="commit-button" isDisabled={!count || !message.trim() || committing}><CheckIcon size={13} />Commit {count} {count === 1 ? "change" : "changes"}</Button>
          <ModalOverlay className="wb-modal-overlay" isDismissable>
            <Modal className="wb-modal wb-alert">
              <Dialog role="alertdialog" className="wb-dialog">
                {({ close }) => <>
                  <Heading slot="title">Commit {count} {count === 1 ? "change" : "changes"}?</Heading>
                  <p>Every change in <code>{folderName(root)}</code>, including untracked files, will be committed to <strong>{status.branch ?? "the current HEAD"}</strong>.</p>
                  <div className="dialog-actions"><Button onPress={close}>Cancel</Button><Button className="primary-button" isDisabled={committing} onPress={() => void commit(close)}>Commit</Button></div>
                </>}
              </Dialog>
            </Modal>
          </ModalOverlay>
        </DialogTrigger>
        {error && <p role="alert" className="agent-error">{error}</p>}
      </div>
      <div className="panel-section-header"><Label>Changes</Label><span className="count-badge">{count}{status.truncated ? "+" : ""}</span></div>
      <GridList aria-label="Changes" className="panel-list change-list" items={status.changes.map((change) => ({ ...change, id: change.path }))}
        disabledKeys={status.changes.filter((change) => change.kind === "deleted").map((change) => change.path)}
        onAction={(key) => void services.commands.execute("file.open", { workspaceId: workspace.id, root, path: String(key) })}
        renderEmptyState={() => <p className="panel-empty">No uncommitted changes.</p>}>
        {(change) => <GridListItem id={change.id} textValue={change.path} className="panel-list-item">
          <FileIcon size={14} />
          <span className="file-tree-name">{change.path.split("/").at(-1)}</span>
          <small>{change.path.split("/").slice(0, -1).join("/")}</small>
          <span className={`change-letter kind-${change.kind}`} title={`${change.kind}${change.staged ? ", staged" : ""}`}>{LETTERS[change.kind]}</span>
        </GridListItem>}
      </GridList>
    </>}
  </div>;
}

/** Branch name for a workspace row in the sidebar. */
export function WorkspaceBranch({ workspaceId }: WidgetProps) {
  const path = useWorkbenchStore((state) => state.workspaces.find((item) => item.id === workspaceId)?.path);
  const branch = useSourceControlStatus(path, false)?.status?.branch;
  return branch ? <span className="workspace-branch">{branch}</span> : null;
}

/** Branch of the active view's folder in the status bar. */
export function StatusBranch() {
  const workspace = useWorkbenchStore((state) => state.workspaces.find((item) => item.id === state.activeWorkspaceId) ?? state.workspaces[0]);
  const status = useSourceControlStatus(workspace ? activeRoot(workspace) : undefined, true)?.status;
  if (!status) return null;
  return <span className="status-item"><BranchIcon size={12} />{status.branch ?? "detached"}{status.changes.length > 0 && <span className="status-muted">· {status.changes.length} changed</span>}</span>;
}
