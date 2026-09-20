import { Registry } from "./registry";

export interface SessionCreateContext {
  workspacePath: string;
  cols?: number;
  rows?: number;
}

export interface SessionController {
  id: string;
  input?: (data: string) => void;
  resize?: (cols: number, rows: number) => void;
  onData?: (listener: (data: string) => void) => () => void;
  onExit?: (listener: (exitCode: number) => void) => () => void;
  dispose: () => void;
}

export interface SessionProvider {
  id: string;
  label: string;
  create: (context: SessionCreateContext) => Promise<SessionController>;
}

export class SessionProviderRegistry extends Registry<SessionProvider> {}
