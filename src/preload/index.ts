import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "../shared/ipc";
import type {
  AgentSessionCreateOptions,
  AgentSessionEvent,
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
