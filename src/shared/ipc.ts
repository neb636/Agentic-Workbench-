export const IPC = {
  persistenceLoad: "persistence:load",
  persistenceSave: "persistence:save",
  workspaceChooseDirectory: "workspace:choose-directory",
  ptyCreate: "pty:create",
  ptyInput: "pty:input",
  ptyResize: "pty:resize",
  ptyTerminate: "pty:terminate",
  ptyData: "pty:data",
  ptyExit: "pty:exit",
} as const;
