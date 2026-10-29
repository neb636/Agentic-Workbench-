import { app, dialog, ipcMain, type WebContents } from "electron";
import { basename } from "node:path";
import { IPC } from "../shared/ipc";
import {
  agentPromptSchema,
  agentSessionActionSchema,
  agentSessionCreateOptionsSchema,
  commitSchema,
  createWorktreeSchema,
  fileFindSchema,
  fileLocationSchema,
  persistedStateSchema,
  ptyCreateOptionsSchema,
  ptyInputSchema,
  ptyResizeSchema,
  ptyTerminateSchema,
  workspaceRootSchema,
} from "../shared/schemas";
import type { FilesChangedEvent } from "../shared/models";
import { AgentSessionManager } from "./agent-session-manager";
import { loadState, saveState } from "./persistence";
import { PtyManager } from "./pty-manager";
import type { SourceControlService } from "./source-control/source-control-provider";
import type { WorkspaceFiles, WorkspaceRoots } from "./workspace-files";

export interface WorkspaceServices {
  roots: WorkspaceRoots;
  files: WorkspaceFiles;
  sourceControl: SourceControlService;
}

/** File watches are owned by the window that asked for them and end with it. */
class FileWatchOwners {
  private readonly owners = new Map<WebContents, Map<string, Promise<() => void>>>();

  constructor(private readonly files: WorkspaceFiles) {}

  watch(owner: WebContents, root: string): void {
    let watches = this.owners.get(owner);
    if (!watches) {
      watches = new Map();
      this.owners.set(owner, watches);
      owner.once("destroyed", () => this.release(owner));
    }
    if (watches.has(root)) return;
    const disposal = this.files.watch(root, (paths) => {
      if (!owner.isDestroyed()) owner.send(IPC.filesChanged, { root, paths } satisfies FilesChangedEvent);
    });
    disposal.catch((error: unknown) => { console.warn("Could not watch workspace", String(error)); watches.delete(root); });
    watches.set(root, disposal);
  }

  unwatch(owner: WebContents, root: string): void {
    const disposal = this.owners.get(owner)?.get(root);
    this.owners.get(owner)?.delete(root);
    void disposal?.then((dispose) => dispose()).catch(() => undefined);
  }

  private release(owner: WebContents): void {
    for (const root of [...(this.owners.get(owner)?.keys() ?? [])]) this.unwatch(owner, root);
    this.owners.delete(owner);
  }
}

function listen(channel: string, handler: (event: Electron.IpcMainEvent, input: unknown) => void): void {
  ipcMain.on(channel, (event, input: unknown) => {
    try { handler(event, input); } catch (error) { console.warn(`Rejected ${channel}:`, String(error)); }
  });
}

export function registerIpc(ptyManager: PtyManager, agentSessionManager: AgentSessionManager, workspace: WorkspaceServices): void {
  const watches = new FileWatchOwners(workspace.files);
  const allowedRoot = async (root: string) => { await workspace.roots.resolve(root); return root; };
  ipcMain.handle(IPC.persistenceLoad, async () => {
    const state = await loadState();
    workspace.roots.replace(state.workspaces.map((item) => item.path));
    return state;
  });
  ipcMain.handle(IPC.persistenceSave, async (_event, input: unknown) => {
    const state = await saveState(persistedStateSchema.parse(input));
    workspace.roots.replace(state.workspaces.map((item) => item.path));
  });
  ipcMain.handle(IPC.workspaceChooseDirectory, async () => {
    const result = await dialog.showOpenDialog({
      title: "Add workspace",
      properties: ["openDirectory", "createDirectory"],
      buttonLabel: "Add workspace",
    });
    const chosen = result.canceled ? null : result.filePaths[0] ?? null;
    if (chosen) workspace.roots.add(chosen);
    return chosen;
  });
  ipcMain.handle(IPC.appMetrics, () => ({
    memoryBytes: app.getAppMetrics().reduce((total, metric) => total + metric.memory.workingSetSize * 1024, 0),
  }));
  ipcMain.handle(IPC.filesList, (_event, input: unknown) => {
    const { root, path } = fileLocationSchema.parse(input);
    return workspace.files.list(root, path);
  });
  ipcMain.handle(IPC.filesRead, (_event, input: unknown) => {
    const { root, path } = fileLocationSchema.parse(input);
    return workspace.files.read(root, path);
  });
  ipcMain.handle(IPC.filesFind, (_event, input: unknown) => {
    const { root, query } = fileFindSchema.parse(input);
    return workspace.files.find(root, query);
  });
  listen(IPC.filesWatch, (event, input: unknown) => watches.watch(event.sender, workspaceRootSchema.parse(input).root));
  listen(IPC.filesUnwatch, (event, input: unknown) => watches.unwatch(event.sender, workspaceRootSchema.parse(input).root));
  ipcMain.handle(IPC.sourceControlDetect, async (_event, input: unknown) => {
    const root = await allowedRoot(workspaceRootSchema.parse(input).root);
    return Boolean(await workspace.sourceControl.providerFor(root));
  });
  ipcMain.handle(IPC.sourceControlStatus, async (_event, input: unknown) =>
    workspace.sourceControl.status(await allowedRoot(workspaceRootSchema.parse(input).root)));
  ipcMain.handle(IPC.sourceControlCommit, async (_event, input: unknown) => {
    const { root, message } = commitSchema.parse(input);
    return workspace.sourceControl.commit(await allowedRoot(root), message);
  });
  ipcMain.handle(IPC.sourceControlCreateWorktree, async (_event, input: unknown) => {
    const { root, branch } = createWorktreeSchema.parse(input);
    return workspace.sourceControl.createWorktree(await allowedRoot(root), branch);
  });
  ipcMain.handle(IPC.ptyCreate, (event, input: unknown) =>
    ptyManager.create(ptyCreateOptionsSchema.parse(input), event.sender),
  );
  listen(IPC.ptyInput, (event, input: unknown) => {
    const parsed = ptyInputSchema.parse(input);
    ptyManager.input(parsed.sessionId, parsed.data, event.sender);
  });
  listen(IPC.ptyResize, (event, input: unknown) => {
    const parsed = ptyResizeSchema.parse(input);
    ptyManager.resize(parsed.sessionId, parsed.cols, parsed.rows, event.sender);
  });
  listen(IPC.ptyTerminate, (event, input: unknown) => {
    ptyManager.terminate(ptyTerminateSchema.parse(input).sessionId, event.sender);
  });
  ipcMain.handle(IPC.agentCreate, (event, input: unknown) =>
    agentSessionManager.create(agentSessionCreateOptionsSchema.parse(input), event.sender),
  );
  ipcMain.handle(IPC.agentProviders, () => agentSessionManager.discover());
  ipcMain.handle(IPC.agentAttach, (event, input: unknown) => agentSessionManager.attach(agentSessionActionSchema.parse(input).sessionId, event.sender));
  listen(IPC.agentInput, (event, input: unknown) => {
    const p = ptyInputSchema.parse(input);
    agentSessionManager.input(p.sessionId, p.data, event.sender);
  });
  listen(IPC.agentResize, (event, input: unknown) => {
    const p = ptyResizeSchema.parse(input);
    agentSessionManager.resize(p.sessionId, p.cols, p.rows, event.sender);
  });
  ipcMain.handle(IPC.agentSendPrompt, (event, input: unknown) => {
    const parsed = agentPromptSchema.parse(input);
    return agentSessionManager.sendPrompt(parsed.sessionId, { prompt: parsed.prompt, intent: parsed.intent }, event.sender);
  });
  listen(IPC.agentInterrupt, (event, input: unknown) => {
    agentSessionManager.interrupt(agentSessionActionSchema.parse(input).sessionId, event.sender);
  });
  listen(IPC.agentTerminate, (event, input: unknown) => {
    agentSessionManager.terminate(agentSessionActionSchema.parse(input).sessionId, event.sender);
  });
}

export function unregisterIpc(): void {
  for (const channel of Object.values(IPC)) { ipcMain.removeHandler(channel); ipcMain.removeAllListeners(channel); }
}

export function directoryName(directoryPath: string): string {
  return basename(directoryPath);
}
