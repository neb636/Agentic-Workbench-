/** Readable text for errors, including those rethrown across Electron IPC. */
export function errorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/^Error invoking remote method '[^']+': /, "").replace(/^(Error: )+/, "");
}
