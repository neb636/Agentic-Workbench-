# Architecture

Agent Workbench is a generic, local Electron workbench. Concrete harnesses live behind provider adapters; the renderer has no Node access. First-party features use the same registries and prompt contributions available to future extensions.

## Views and runtime resources

A persisted Workspace owns View records. An Agent view persists only provider selection, composer draft, and split position. A new or restored view shows a harness picker and does not start a process until the user chooses Start or Resume.

Agent runtimes are separate from views and React components. The renderer runtime registry holds controller and status references; the main-process AgentSessionManager owns the PTY, bounded headless terminal, and provider. Switching tabs or workspaces releases only the terminal attachment. Closing a view terminates its runtime. Window destruction and application shutdown clean up all owned runtimes.

After application restart, Start launches a new CLI; Resume launches the selected provider's native session picker. Workbench does not persist process IDs or infer a native conversation identity. Ordinary shell Terminal views currently retain their component-scoped lifetime.

## Native terminal pipeline

```text
Agent view / prompt composer
  -> generic agent controller
  -> narrow typed preload API + validated, owner-checked IPC
  -> AgentSessionManager
  -> registered provider + shared PTY spawn service
  -> native interactive CLI
```

Codex launches as an interactive executable, not `codex exec`; Claude Code uses the same session contract. Provider adapters own executable configuration, launch/resume arguments, interrupt keys, paste encoding, and native-screen interpretation.

The main process parses every PTY chunk using xterm headless with 2,000 lines of scrollback. Attachments receive a serialized screen and sequence number, then consume only newer events. This prevents lost startup output and duplicate replay. Status remains available while the renderer surface is unmounted. The main terminal answers terminal queries; the renderer suppresses duplicate device-query responses.

TerminalSurface handles theme, display, input, and sizing for both agent and shell views. Process creation and termination remain outside this display component. The terminal/composer split uses an accessible panel primitive.

## Prompt contributions and delivery

PromptContributorRegistry supplies removable contributor registrations. Persona and Appended Instructions register their contributions through this seam. PromptAssembler combines enabled contributions with user text; AgentView passes the assembled prompt to the generic controller.

The main process serializes composer delivery against direct terminal input, verifies an empty native input editor, uses bracketed paste, waits up to two seconds for a recognized native draft, then sends Enter. Existing native drafts, approval dialogs, unavailable paste mode, unknown UI, and exited processes reject automated submission. The composer retains its draft on failure or uncertain delivery and never retries automatically.

When the CLI is working and its input editor is available, submission follows the harness's native steering/queue behavior. Workbench does not own a second prompt queue. Approval responses and slash commands belong in the terminal. Interrupt sends the provider's native interrupt key; it does not terminate the session.

## Status and extension boundaries

Process lifecycle (`starting/alive/exited/failed`) is separate from inferred activity (`ready/working/waiting-for-input/unknown`). Provider-owned rules examine the live bottom screen and cursor position, not the scrolled renderer viewport. Unmatched screens stay unknown; output silence is never completion. A recognized working-to-ready transition records a completion attention event, distinct from task success; an observed interrupt suppresses it. Background tabs show unseen completions until opened.

Status includes the detector rule, observation time, input-editor state, and reason. Diagnostics are available through the typed snapshot; the toolbar exposes the current rule in its tooltip. Detection is heuristic and CLI UI changes can require rule updates. No global hooks or CLI configuration edits are installed. A later provider can supply complete native lifecycle signals behind the same generic status interface.

To add a harness, implement AgentProviderAdapter in main, register it at the composition root, and register its generic renderer provider. Do not add harness checks to AgentView or Workbench core. To add composer behavior, use prompt contributors and the existing `agent.composer.support` widget slot.

## Validation

`npm test` covers adapter launch contracts, ANSI redraws, prompt controls and multiline content, native draft collisions, concurrent delivery, approval races, status/interrupt transitions, owner isolation, replay, process exit, and missing executables.

`npm run build && node scripts/qa-electron.mjs` runs Electron QA with isolated Workbench persistence. Set `QA_SEND=1` for a harmless live Codex response, or `QA_CLAUDE_SEND=1` for Claude delivery (requires native authentication and uses the user's CLI account). The Claude check follows the native workspace trust flow; it never selects a billing/model-credit option. No application account or API key is introduced.

Verified locally on macOS: Codex CLI 0.155.1 native startup and multiline send/response; Claude Code 2.1.237 startup/trust classification and 2.1.280 multiline delivery up to its native model/usage-credit choice. Claude updated itself during native startup. That account choice was left untouched, so a full Claude response remains unverified. Other operating systems also need live verification. Both providers have deterministic screen/delivery tests. New CLI versions and terminal input modes such as Vim mode may produce Unknown; direct terminal interaction remains available.
