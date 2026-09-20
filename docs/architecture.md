# Architecture

Agent Workbench is a local Electron application with a React renderer. The renderer has no direct Node access; all persistence, directory selection, PTY, and agent-process operations cross the typed preload API in `src/shared/models.ts`.

## Application model

- A `Workspace` points to a local directory and owns persisted `WorkbenchView` records.
- A View selects a registered React surface and stores optional view-specific state. Views do not inherently own processes.
- A Session is an in-memory runtime controller created by a registered session provider. Terminal and Agent views acquire and dispose sessions with their component lifecycle.
- Zustand owns persisted workspace, view, persona, and appended-instruction state. The main process validates it with Zod and atomically writes one JSON file in Electron's user-data directory.

## Renderer extension seams

`src/renderer/core/services.ts` exposes small in-process registries for views, session providers, commands, and widgets, plus the prompt assembler. `register-first-party.ts` contributes the built-in Agent and Terminal views through those same seams.

The Agent composer obtains Persona and Appended Instructions as generic `PromptContribution` values. `PromptAssembler` combines enabled contributions with the user's text before the assembled content is passed to an `AgentSessionController`.

Provider identity is persisted in Agent view state as `providerId`. `AgentView` resolves that ID through the session-provider registry and otherwise knows only generic send, output, status, interrupt, and dispose operations.

## Process boundaries

The runtime path is:

```text
React view
  -> renderer session provider
  -> typed window.workbench preload API
  -> validated Electron IPC
  -> main-process session manager
  -> provider adapter / process or PTY manager
  -> local executable
```

The Terminal provider uses `PtyManager` and `node-pty` for an interactive shell. The Agent path uses `AgentSessionManager` for logical session ownership and `ProcessManager` for cancellable, non-interactive child processes. Both managers terminate resources when their owning renderer is destroyed and during application shutdown.

## Codex provider

Codex CLI is the first AgentProvider implementation, not a Workbench dependency. `CodexAgentProvider` is confined to the main-process provider directory. It owns Codex command construction, passes prompts over stdin, parses Codex JSONL events, retains the native Codex thread ID for later turns, and translates native events into generic agent output/errors. The renderer-side provider only binds the registered provider identity to the generic agent preload API.

## UI and themes

The shell and features use React Aria primitives for accessible interaction behavior. Styling lives in `src/renderer/theme/workbench.css`; feature selectors consume semantic `--wb-bg-*`, `--wb-text-*`, `--wb-border-*`, `--wb-accent-*`, `--wb-status-*`, `--wb-radius-*`, and `--wb-font-*` values. Terminal palette values are also theme-owned.
