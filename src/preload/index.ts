import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "../shared/ipc";
import type {
  AgentSessionCreateOptions,
  AgentSessionEvent,
  FilesChangedEvent,
  PersistedState,
  PtyCreateOptions,
  PtyDataEvent,
  PtyExitEvent,
  WorkbenchApi,
} from "../shared/models";

const api: WorkbenchApi = {
  platform: process.platform,
  persistence: {
    load: () => ipcRenderer.invoke(IPC.persistenceLoad) as Promise<PersistedState>,
    save: (state) => ipcRenderer.invoke(IPC.persistenceSave, state) as Promise<void>,
  },
  workspace: {
    chooseDirectory: () => ipcRenderer.invoke(IPC.workspaceChooseDirectory) as Promise<string | null>,
  },
  app: {
    metrics: () => ipcRenderer.invoke(IPC.appMetrics),
  },
  files: {
    list: (root, path) => ipcRenderer.invoke(IPC.filesList, { root, path }),
    read: (root, path) => ipcRenderer.invoke(IPC.filesRead, { root, path }),
    find: (root, query) => ipcRenderer.invoke(IPC.filesFind, { root, query }),
    watch: (root) => ipcRenderer.send(IPC.filesWatch, { root }),
    unwatch: (root) => ipcRenderer.send(IPC.filesUnwatch, { root }),
    onChanged: (listener) => {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: FilesChangedEvent) => listener(payload);
      ipcRenderer.on(IPC.filesChanged, wrapped);
      return () => ipcRenderer.removeListener(IPC.filesChanged, wrapped);
    },
  },
  sourceControl: {
    detect: (root) => ipcRenderer.invoke(IPC.sourceControlDetect, { root }),
    status: (root) => ipcRenderer.invoke(IPC.sourceControlStatus, { root }),
    commit: (root, message) => ipcRenderer.invoke(IPC.sourceControlCommit, { root, message }),
    createWorktree: (root, branch) => ipcRenderer.invoke(IPC.sourceControlCreateWorktree, { root, branch }),
  },
  pty: {
    create: (options: PtyCreateOptions) => ipcRenderer.invoke(IPC.ptyCreate, options) as Promise<string>,
    input: (sessionId, data) => ipcRenderer.send(IPC.ptyInput, { sessionId, data }),
    resize: (sessionId, cols, rows) => ipcRenderer.send(IPC.ptyResize, { sessionId, cols, rows }),
    terminate: (sessionId) => ipcRenderer.send(IPC.ptyTerminate, { sessionId }),
    onData: (listener) => {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: PtyDataEvent) => listener(payload);
      ipcRenderer.on(IPC.ptyData, wrapped);
      return () => ipcRenderer.removeListener(IPC.ptyData, wrapped);
    },
    onExit: (listener) => {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: PtyExitEvent) => listener(payload);
      ipcRenderer.on(IPC.ptyExit, wrapped);
      return () => ipcRenderer.removeListener(IPC.ptyExit, wrapped);
    },
  },
  agent: {
    providers: () => ipcRenderer.invoke(IPC.agentProviders),
    attach: (sessionId) => ipcRenderer.invoke(IPC.agentAttach, { sessionId }),
    input: (sessionId, data) => ipcRenderer.send(IPC.agentInput, { sessionId, data }),
    resize: (sessionId, cols, rows) => ipcRenderer.send(IPC.agentResize, { sessionId, cols, rows }),
    create: (options: AgentSessionCreateOptions) =>
      ipcRenderer.invoke(IPC.agentCreate, options) as Promise<string>,
    sendPrompt: (sessionId, request) =>
      ipcRenderer.invoke(IPC.agentSendPrompt, { sessionId, ...request }),
    interrupt: (sessionId) => ipcRenderer.send(IPC.agentInterrupt, { sessionId }),
    terminate: (sessionId) => ipcRenderer.send(IPC.agentTerminate, { sessionId }),
    onEvent: (listener) => {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: AgentSessionEvent) => listener(payload);
      ipcRenderer.on(IPC.agentEvent, wrapped);
      return () => ipcRenderer.removeListener(IPC.agentEvent, wrapped);
    },
  },
};

contextBridge.exposeInMainWorld("workbench", api);
