import { dialog, ipcMain } from "electron";
import { basename } from "node:path";
import { IPC } from "../shared/ipc";
import {
  agentPromptSchema,
  agentSessionActionSchema,
  agentSessionCreateOptionsSchema,
  persistedStateSchema,
  ptyCreateOptionsSchema,
  ptyInputSchema,
  ptyResizeSchema,
  ptyTerminateSchema,
} from "../shared/schemas";
import { AgentSessionManager } from "./agent-session-manager";
import { loadState, saveState } from "./persistence";
import { PtyManager } from "./pty-manager";

function listen(channel: string, handler: (event: Electron.IpcMainEvent, input: unknown) => void): void {
  ipcMain.on(channel, (event, input: unknown) => {
    try { handler(event, input); } catch (error) { console.warn(`Rejected ${channel}:`, String(error)); }
  });
}

export function registerIpc(ptyManager: PtyManager, agentSessionManager: AgentSessionManager): void {
  ipcMain.handle(IPC.persistenceLoad, () => loadState());
  ipcMain.handle(IPC.persistenceSave, (_event, input: unknown) =>
    saveState(persistedStateSchema.parse(input)),
  );
  ipcMain.handle(IPC.workspaceChooseDirectory, async () => {
    const result = await dialog.showOpenDialog({
      title: "Add workspace",
      properties: ["openDirectory", "createDirectory"],
      buttonLabel: "Add workspace",
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
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
