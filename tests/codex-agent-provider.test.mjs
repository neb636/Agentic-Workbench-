import assert from "node:assert/strict";
import test from "node:test";
import providerModule from "../dist-electron/main/providers/codex-agent-provider.js";

const { parseCodexEvent } = providerModule;

test("captures the native thread id without exposing a provider event", () => {
  assert.deepEqual(
    parseCodexEvent('{"type":"thread.started","thread_id":"thread-123"}'),
    { providerSessionId: "thread-123" },
  );
});

test("translates completed assistant messages to generic output", () => {
  assert.deepEqual(
    parseCodexEvent('{"type":"item.completed","item":{"type":"agent_message","text":"Done"}}'),
    { output: { kind: "assistant", text: "Done" } },
  );
});

test("translates command results to generic activity output", () => {
  assert.deepEqual(
    parseCodexEvent('{"type":"item.completed","item":{"type":"command_execution","command":"pwd","aggregated_output":"/tmp"}}'),
    { output: { kind: "activity", text: "$ pwd\n/tmp" } },
  );
});

test("preserves unexpected stdout as generic activity", () => {
  assert.deepEqual(
    parseCodexEvent("plain output"),
    { output: { kind: "activity", text: "plain output" } },
  );
});

test("translates provider failures to generic errors", () => {
  assert.deepEqual(
    parseCodexEvent('{"type":"turn.failed","error":{"message":"No connection"}}'),
    { error: "No connection" },
  );
});
