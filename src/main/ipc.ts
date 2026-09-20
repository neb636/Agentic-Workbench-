import { dialog, ipcMain } from "electron";
import { basename } from "node:path";
import { IPC } from "../shared/ipc";
import {
  persistedStateSchema,
  ptyCreateOptionsSchema,
  ptyInputSchema,
  ptyResizeSchema,
  ptyTerminateSchema,
} from "../shared/schemas";
import { loadState, saveState } from "./persistence";
import { PtyManager } from "./pty-manager";

export function registerIpc(ptyManager: PtyManager): void {
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
  ipcMain.on(IPC.ptyInput, (_event, input: unknown) => {
    const parsed = ptyInputSchema.parse(input);
    ptyManager.input(parsed.sessionId, parsed.data);
  });
  ipcMain.on(IPC.ptyResize, (_event, input: unknown) => {
    const parsed = ptyResizeSchema.parse(input);
    ptyManager.resize(parsed.sessionId, parsed.cols, parsed.rows);
  });
  ipcMain.on(IPC.ptyTerminate, (_event, input: unknown) => {
    ptyManager.terminate(ptyTerminateSchema.parse(input).sessionId);
  });
}

export function unregisterIpc(): void {
  for (const channel of Object.values(IPC)) ipcMain.removeHandler(channel);
}

export function directoryName(directoryPath: string): string {
  return basename(directoryPath);
}
