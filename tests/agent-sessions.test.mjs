import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";
import managerModule from "../dist-electron/main/agent-session-manager.js";
import codexModule from "../dist-electron/main/providers/codex-agent-provider.js";
import claudeModule from "../dist-electron/main/providers/claude-agent-provider.js";
import screenModule from "../dist-electron/main/providers/cli-screen.js";
import headless from "@xterm/headless";
import { setTimeout } from "node:timers";
const { Terminal } = headless;

const { AgentSessionManager } = managerModule;
const { CodexAgentProvider } = codexModule;
const { ClaudeAgentProvider } = claudeModule;
const { pastePrompt } = screenModule;
const request = (prompt, intent = "default") => ({ prompt, intent });
const screen = (cursorLine, other = [], cursorX = 2) => ({ lines: [...other, cursorLine], cursorLine, cursorX, cursorY: other.length, cursorCellDim: true, inputWasEdited: false, bracketedPaste: true });

test("native launch and resume belong to each adapter", () => {
  assert.deepEqual(new CodexAgentProvider().args(false), []);
  assert.deepEqual(new CodexAgentProvider().args(true), ["resume"]);
  assert.deepEqual(new ClaudeAgentProvider().args(true), ["--resume"]);
});
test("screen rules distinguish ready, native drafts, working, decisions and unknown", () => {
  const codex = new CodexAgentProvider(); const claude = new ClaudeAgentProvider();
  assert.equal(codex.detect(screen("› Ask Codex to do anything")).canSubmit, true);
  assert.equal(codex.detect(screen("› Implement my feature", [], 22)).canSubmit, false);
  assert.equal(codex.detect({ ...screen("› Ask Codex to do anything"), cursorCellDim: false }).canSubmit, false);
  assert.equal(claude.detect(screen("❯ ")).canSubmit, true);
  assert.equal(claude.detect(screen('❯ Try "fix lint errors"')).canSubmit, true);
  assert.equal(claude.detect({ ...screen('❯ Try "fix lint errors"'), inputWasEdited: true }).canSubmit, false);
  assert.equal(claude.detect(screen("❯ draft", [], 7)).canSubmit, false);
  assert.equal(codex.detect(screen("› ", ["• Working (esc to interrupt)"])).activity, "working");
  assert.equal(claude.detect(screen("❯ ", ["✻ Thinking… (esc to interrupt)"])).canSubmit, true);
  assert.equal(claude.detect(screen("❯ 1. Yes, I trust this folder", ["Enter to confirm"])).activity, "waiting-for-input");
  assert.equal(codex.detect(screen("› ", ["You can sign in later. Select an option below."])).canSubmit, true);
  assert.equal(claude.detect(screen("❯ ", ["Do you want to proceed? Enter to confirm."])).activity, "ready");
  assert.equal(codex.detect(screen("Unexpected new UI")).activity, "unknown");
  assert.equal(codex.detect({ ...screen("› "), bracketedPaste: false }).canSubmit, false);
  assert.equal(codex.detect(screen("  second line", ["› first line"], 13)).inputState, "draft");
});
test("paste preserves Unicode and large multiline text but rejects control injection", () => {
  const text = "Hello 世界 🧭\n".repeat(5000);
  assert.equal(pastePrompt(text), `\x1b[200~${text}\x1b[201~`);
  assert.equal(pastePrompt("a\r\nb"), "\x1b[200~a\nb\x1b[201~");
  for (const value of ["\x1b[201~rm -rf x", "a\x03", "\r", " "]) assert.throws(() => pastePrompt(value));
});

test("planning uses an adapter-owned command with bracketed content, normal send never switches modes", () => {
  for (const provider of [new CodexAgentProvider(), new ClaudeAgentProvider()]) {
    const prompt = "Be concise.\n\nTerminal selection 1:\n> /exit\n\nPlan 世界 🧭";
    assert.equal(provider.capabilities.planning, true);
    assert.equal(provider.submit(request(prompt, "plan")).prefix.input, "/plan ");
    assert.equal(provider.submit(request(prompt, "plan")).paste, pastePrompt(prompt));
    assert.equal(provider.submit(request(prompt)).paste, pastePrompt(prompt));
    assert.equal(provider.submit(request(prompt)).prefix, undefined);
    for (const text of ["/exit", "!rm anything", "text\x1b[201~\r", "text\x03"]) {
      assert.throws(() => provider.submit(request(text, "plan")));
    }
  }
});

test("Claude recognizes a typed planning prefix with native argument hints, not a pasted body", () => {
  const prefix = new ClaudeAgentProvider().submit(request("task", "plan")).prefix;
  assert.equal(prefix.acknowledged(screen("❯\u00a0/plan  [open|<description>]", [], 8)), true);
  assert.equal(prefix.acknowledged(screen("❯ /plan task", [], 12)), false);
  assert.equal(prefix.acknowledged(screen("❯ /other", [], 8)), false);
});

function setup(provider = new CodexAgentProvider()) {
  const events = [], writes = [], processes = [];
  const owner = { isDestroyed: () => false, send: (_channel, event) => events.push(event) };
  // Discovery resolves a real executable; the test injects only the PTY boundary.
  provider.executable = process.execPath;
  const manager = new AgentSessionManager([provider], () => {
    const p = { onData: (cb) => { p.data = cb; }, onExit: (cb) => { p.exit = cb; }, write: (data) => {
      writes.push(data);
      if (data === "/plan ") p.data("\r\x1b[2K› /plan ");
      if (data.includes("\x1b[200~")) p.data("\r\x1b[2K› pasted draft");
      if (data === "\r") p.data("\r\x1b[2K› ");
    }, resize: () => {}, kill: () => { p.killed = true; } };
    processes.push(p); return p;
  });
  const options = { providerId: provider.id, workspacePath: "/tmp", viewId: "view", cols: 80, rows: 24 };
  const id = manager.create(options, owner);
  return { manager, options, id, owner, events, writes, processes, output: (data) => processes[0].data(data) };
}

test("create is idempotent, startup output is captured, ownership is enforced", async () => {
  const s = setup();
  try {
    assert.equal(s.manager.create(s.options, s.owner), s.id);
    assert.equal(s.processes.length, 1);
    s.output("\x1b[?2004h› \x1b[2mAsk Codex to do anything\r\x1b[2C");
    const snapshot = await s.manager.attach(s.id, s.owner);
    assert.match(snapshot.screen, /Ask Codex/);
    assert.equal(snapshot.status.canSubmit, true);
    const other = { ...s.owner };
    await assert.rejects(s.manager.attach(s.id, other));
    await assert.rejects(s.manager.sendPrompt(s.id, request("hello"), other));
    assert.throws(() => s.manager.input(s.id, "bad", other));
    assert.throws(() => s.manager.resize(s.id, 10, 10, other));
    assert.throws(() => s.manager.terminate(s.id, other));
    assert.equal(s.processes[0].killed, undefined);
  } finally { s.manager.terminateAll(); }
});
test("delivery serializes paste and submit, rejects double send and terminal drafts", async () => {
  const s = setup();
  try {
    s.output("\x1b[?2004h› \r\x1b[2C"); await s.manager.attach(s.id, s.owner);
    const pending = s.manager.sendPrompt(s.id, request("hello\nworld"), s.owner);
    assert.equal((await s.manager.sendPrompt(s.id, request("duplicate"), s.owner)).outcome, "not-sent");
    s.manager.input(s.id, "interleaved", s.owner);
    await pending;
    assert.deepEqual(s.writes, ["\x1b[200~hello\nworld\x1b[201~", "\r"]);
    s.output("\r\x1b[2K› native draft");
    await s.manager.attach(s.id, s.owner);
    assert.match((await s.manager.sendPrompt(s.id, request("new"), s.owner)).message, /draft/);
  } finally { s.manager.terminateAll(); }
});
test("decisions never receive a submit; exit retains screen and blocks input", async () => {
  const s = setup();
  try {
    s.output("\x1b[?2004hDo you want to proceed?\r\n› Yes, proceed");
    assert.equal((await s.manager.sendPrompt(s.id, request("hello"), s.owner)).outcome, "not-sent");
    assert.deepEqual(s.writes, []);
    s.processes[0].exit({ exitCode: 1 });
    const snapshot = await s.manager.attach(s.id, s.owner);
    assert.equal(snapshot.status.lifecycle, "failed");
    assert.match(snapshot.screen, /proceed/);
    s.manager.input(s.id, "not a shell command", s.owner);
    assert.deepEqual(s.writes, []);
  } finally { s.manager.terminateAll(); }
});
test("completion differs from interruption; unknown screens never imply completion", async () => {
  const s = setup();
  const render = async (text) => { s.output(`\x1b[2J\x1b[H\x1b[?2004h${text}`); return (await s.manager.attach(s.id, s.owner)).status; };
  try {
    assert.equal((await render("• Working (esc to interrupt)\r\n› ")).activity, "working");
    assert.equal((await render("new unknown display")).completed, 0);
    assert.equal((await render("› ")).completed, 1);
    await render("• Working (esc to interrupt)\r\n› ");
    s.manager.interrupt(s.id, s.owner);
    assert.equal((await render("› ")).completed, 1);
  } finally { s.manager.terminateAll(); }
});
test("chunked ANSI redraws and bounded screen snapshots replay independently of viewport", async () => {
  const s = setup();
  const restored = new Terminal({ cols: 80, rows: 24, allowProposedApi: true });
  try {
    s.output("old output\r\n\x1b["); s.output("2J\x1b[H\x1b[?2004h› ");
    const first = await s.manager.attach(s.id, s.owner);
    await new Promise((resolve) => restored.write(first.screen, resolve));
    assert.equal(restored.buffer.active.getLine(0).translateToString(true).trimEnd(), "›");
    s.output("native draft");
    const second = await s.manager.attach(s.id, s.owner);
    assert(second.sequence > first.sequence);
    assert.equal(second.status.canSubmit, false);
    assert(s.events.every((event, i) => i === 0 || event.sequence > s.events[i - 1].sequence));
    s.manager.terminateForOwner(s.owner);
    assert.equal(s.processes[0].killed, true);
  } finally { restored.dispose(); s.manager.terminateAll(); }
});

test("approval appearing during paste prevents Enter and preserves the native decision", async () => {
  const s = setup();
  try {
    s.output("\x1b[?2004h› "); await s.manager.attach(s.id, s.owner);
    s.processes[0].write = (data) => { s.writes.push(data); s.output("\x1b[2J\x1b[HDo you want to proceed?\r\n› Yes, proceed"); };
    const result = await s.manager.sendPrompt(s.id, request("hello"), s.owner);
    assert.equal(result.outcome, "uncertain");
    assert.equal(result.stage, "paste");
    assert.match(result.message, /may be pasted/);
    assert.equal(s.writes.length, 1);
    assert.notEqual(s.writes[0], "\r");
  } finally { s.manager.terminateAll(); }
});

test("missing executable and spawn failure are actionable and do not create sessions", () => {
  const provider = new ClaudeAgentProvider(); provider.executable = "/missing/workbench-test-cli";
  const manager = new AgentSessionManager([provider]);
  assert.equal(manager.discover()[0].available, false);
  const options = { providerId: provider.id, workspacePath: "/tmp", viewId: "missing", cols: 80, rows: 24 };
  assert.throws(() => manager.create(options, {}), /not found/);
  provider.executable = process.execPath;
  const broken = new AgentSessionManager([provider], () => { throw new Error("spawn failed"); });
  assert.throws(() => broken.create(options, {}), /spawn failed/);
  manager.terminateAll(); broken.terminateAll();
});

test("Claude placeholders survive focus reports, while user-authored text remains a draft", async () => {
  const s = setup(new ClaudeAgentProvider());
  try {
    s.output('\x1b[?2004h❯ Try "fix lint errors"\r\x1b[2C');
    assert.equal((await s.manager.attach(s.id, s.owner)).status.canSubmit, true);
    s.manager.input(s.id, "\x1b[I", s.owner);
    s.manager.input(s.id, "\x1b", s.owner);
    s.output("\r\x1b[2C");
    assert.equal((await s.manager.attach(s.id, s.owner)).status.canSubmit, true);
    s.manager.input(s.id, "Try", s.owner);
    s.output("\r\x1b[2C");
    assert.equal((await s.manager.attach(s.id, s.owner)).status.canSubmit, false);
  } finally { s.manager.terminateAll(); }
});

test("planning requires a ready empty editor and declared capability, then sends exactly once", async () => {
  const s = setup();
  try {
    s.output("\x1b[?2004h• Working (esc to interrupt)\r\n› ");
    assert.equal((await s.manager.sendPrompt(s.id, request("plan", "plan"), s.owner)).outcome, "not-sent");
    assert.deepEqual(s.writes, []);
    s.output("\x1b[2J\x1b[H› ");
    const result = await s.manager.sendPrompt(s.id, request("persona\n\ntask", "plan"), s.owner);
    assert.equal(result.outcome, "submitted");
    assert.equal(result.stage, "enter");
    assert.deepEqual(s.writes, ["/plan ", "\x1b[200~persona\n\ntask\x1b[201~", "\r"]);
    // The CLI may already be in Plan mode; another explicit request still uses /plan.
    assert.equal((await s.manager.sendPrompt(s.id, request("follow up", "plan"), s.owner)).outcome, "submitted");
  } finally { s.manager.terminateAll(); }
  const provider = new CodexAgentProvider();
  provider.capabilities = undefined;
  const unsupported = setup(provider);
  try {
    unsupported.output("\x1b[?2004h› ");
    assert.equal((await unsupported.manager.sendPrompt(unsupported.id, request("plan", "plan"), unsupported.owner)).outcome, "not-sent");
    assert.deepEqual(unsupported.writes, []);
  } finally { unsupported.manager.terminateAll(); }
});

test("a decision after Enter reports uncertainty and never retries", async () => {
  const s = setup();
  try {
    s.output("\x1b[?2004h› ");
    s.processes[0].write = (data) => {
      s.writes.push(data);
      s.output(data === "/plan " ? "\r\x1b[2K› /plan " : data === "\r" ? "\x1b[2J\x1b[HDo you want to proceed?\r\n› Yes, proceed" : "\r\x1b[2K› draft");
    };
    const result = await s.manager.sendPrompt(s.id, request("task", "plan"), s.owner);
    assert.equal(result.outcome, "uncertain");
    assert.equal(result.stage, "enter");
    assert.equal(s.writes.length, 3);
  } finally { s.manager.terminateAll(); }
});

test("unrecognized editor and invalid content report not sent without any writes", async () => {
  const s = setup();
  try {
    s.output("Changed native UI");
    assert.equal((await s.manager.sendPrompt(s.id, request("task", "plan"), s.owner)).outcome, "not-sent");
    assert.equal((await s.manager.sendPrompt(s.id, request("bad\x1b", "plan"), s.owner)).stage, "none");
    assert.deepEqual(s.writes, []);
  } finally { s.manager.terminateAll(); }
});

test("planning waits for pasted content beyond its prefix before sending Enter", async () => {
  const s = setup();
  let pasted = false;
  try {
    s.output("\x1b[?2004h› ");
    s.processes[0].write = (data) => {
      s.writes.push(data);
      if (data === "/plan ") s.output("\r\x1b[2K› /plan ");
      if (data.startsWith("\x1b[200~")) setTimeout(() => { pasted = true; s.output("\r\x1b[2K› /plan pasted body"); }, 180);
      if (data === "\r") { assert.equal(pasted, true); s.output("\r\x1b[2K› "); }
    };
    assert.equal((await s.manager.sendPrompt(s.id, request("task", "plan"), s.owner)).outcome, "submitted");
  } finally { s.manager.terminateAll(); }
});

test("a decision during command entry prevents prompt paste and Enter", async () => {
  const s = setup();
  try {
    s.output("\x1b[?2004h› ");
    s.processes[0].write = (data) => { s.writes.push(data); s.output("\x1b[2J\x1b[HDo you want to proceed?\r\n› Yes, proceed"); };
    const result = await s.manager.sendPrompt(s.id, request("task", "plan"), s.owner);
    assert.equal(result.outcome, "uncertain");
    assert.equal(result.stage, "prefix");
    assert.deepEqual(s.writes, ["/plan "]);
  } finally { s.manager.terminateAll(); }
});
