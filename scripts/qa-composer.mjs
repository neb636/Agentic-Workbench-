import { _electron as electron } from "playwright";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";

// QA inventory: native selection -> quote/removal, exact preview/send, planning,
// recall/current-draft recovery, edit-during-send, uncertain delivery + terminal
// handoff/copy, tab switching, persistence, keyboard controls, minimum-size layout.
const directory = await mkdtemp(join(tmpdir(), "workbench-composer-qa-"));
const executable = join(directory, "fixture-cli");
const log = join(directory, "prompts.jsonl");
const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
await writeFile(executable, `#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(resolve("scripts/fixtures/composer-cli.mjs"))}\n`, { mode: 0o755 });
await writeFile(join(directory, "workbench-state.json"), JSON.stringify({
  workspaces: [{ id: "qa", name: "Composer QA", path: process.cwd(), activeViewId: "agent", views: [
    { id: "agent", workspaceId: "qa", type: "agent", title: "Composer", state: { providerId: "codex.cli" } },
    { id: "other", workspaceId: "qa", type: "agent", title: "Other" },
  ] }], activeWorkspaceId: "qa", personas: [{ id: "p", name: "Concise", instructions: "Be concise.", description: "Brief answers", scope: "global" }],
  selectedPersonaByWorkspace: { qa: "p" }, appendedInstructions: [{ id: "i", workspaceId: "qa", content: "Explain the tradeoffs.", enabled: true }],
}));
let app;
try {
  const launch = async () => {
    app = await electron.launch({ args: ["."], env: { ...process.env, WORKBENCH_USER_DATA_DIR: directory, WORKBENCH_CODEX_PATH: executable, COMPOSER_QA_LOG: log } });
    const window = await app.firstWindow();
    window.setDefaultTimeout(10_000);
    return window;
  };
  let page = await launch();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  const shot = async (name) => {
    const bytes = await app.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      const [width, height] = win.getContentSize();
      return (await win.capturePage()).resize({ width, height }).toPNG();
    });
    await writeFile(join(directory, `${name}.png`), Buffer.from(bytes));
  };
  const fit = async () => {
    const bounds = await page.locator(".composer-panel, .composer-tools, .composer-actions, .composer-feedback, .composer-plan-note, .composer-handoff, .composer-panel textarea").evaluateAll((els) => els.map((el) => {
      const r = el.getBoundingClientRect(); const p = el.closest(".composer-panel").getBoundingClientRect();
      return { name: el.className, width: r.width, height: r.height, inside: r.top >= p.top && r.bottom <= p.bottom + 1 && r.right <= innerWidth && r.bottom <= innerHeight };
    }));
    assert(bounds.every((r) => r.width > 0 && r.height > 0 && r.inside), JSON.stringify(bounds));
  };
  const prompt = () => page.getByRole("textbox", { name: "Prompt", exact: true });
  const plan = () => page.getByRole("checkbox", { name: "Plan this prompt" });
  const waitFeedback = (value) => page.waitForFunction((text) => document.querySelector(".composer-feedback")?.textContent.includes(text), value);
  await page.getByRole("button", { name: "Start session", exact: true }).click();
  await waitFeedback("Ready for a prompt");
  await shot("initial");
  const row = page.locator(".xterm-rows > div").filter({ hasText: "ERROR: Connection refused" });
  await row.click({ clickCount: 3 });
  await page.getByRole("button", { name: "Add to prompt", exact: true }).click();
  assert(await prompt().evaluate((el) => el === document.activeElement));
  await page.getByText("Terminal selection 1", { exact: true }).click();
  assert.match(await page.locator(".composer-quotation pre").innerText(), /ERROR: Connection refused/);
  await page.getByText("Terminal selection 1", { exact: true }).click();
  await prompt().fill("Explain this failure.\nSuggest a plan, 世界 🧭.");
  await plan().focus(); await page.keyboard.press("Space");
  await fit(); await shot("quote-plan");
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 640));
  await page.waitForTimeout(250);
  await shot("minimum-plan"); await fit();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const preview = page.getByRole("dialog", { name: "Prompt preview" });
  const expected = await preview.locator("pre").innerText();
  assert.match(expected, /Be concise\.\n\nExplain the tradeoffs\.\n\nTerminal selection 1:\n> ERROR: Connection refused/);
  assert(expected.endsWith("Explain this failure.\nSuggest a plan, 世界 🧭."));
  await shot("preview");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Send for planning", exact: true }).click();
  await waitFeedback("Planning request handed");
  assert.equal(await prompt().inputValue(), "");
  assert.equal(await plan().isChecked(), false);
  assert.equal(await page.locator(".composer-quotation").count(), 0);
  assert(await prompt().evaluate((el) => el === document.activeElement));
  assert.equal(JSON.parse((await readFile(log, "utf8")).trim()).prompt, `/plan ${expected}`);
  await prompt().fill("Do not lose this draft");
  await page.getByRole("button", { name: "Recent prompts" }).click();
  await shot("history");
  await page.getByRole("button", { name: "Use as draft" }).click();
  assert.equal(await prompt().inputValue(), "Explain this failure.\nSuggest a plan, 世界 🧭.");
  assert.equal(await plan().isChecked(), true);
  await page.getByRole("button", { name: "Recent prompts" }).click();
  const saved = page.getByRole("option", { name: /Do not lose this draft/ });
  await saved.click();
  await page.getByRole("button", { name: "Use as draft" }).click();
  assert.equal(await prompt().inputValue(), "Do not lose this draft");
  assert.equal(await page.locator(".composer-quotation").count(), 0);
  await prompt().fill("Delayed response");
  await prompt().press("Control+Enter");
  await prompt().fill("New edits during delivery");
  await page.getByRole("tab", { name: /Other/ }).click();
  await page.getByRole("tab", { name: /Composer/ }).click();
  await waitFeedback("Prompt handed");
  assert.equal(await prompt().inputValue(), "New edits during delivery");
  await row.click({ clickCount: 3 });
  await page.getByRole("button", { name: "Add to prompt", exact: true }).click();
  await row.click({ clickCount: 3 });
  await page.getByRole("button", { name: "Add to prompt", exact: true }).click();
  await page.getByText("Terminal selection 1", { exact: true }).click();
  await plan().focus(); await page.keyboard.press("Space");
  await prompt().fill("UNCERTAIN");
  await page.getByRole("button", { name: "Send for planning", exact: true }).click();
  await waitFeedback("Delivery uncertain");
  assert.equal(await prompt().inputValue(), "UNCERTAIN");
  await shot("uncertain-minimum"); await fit();
  await page.getByRole("button", { name: "Copy composed prompt" }).click();
  await page.getByRole("button", { name: "Copied prompt" }).waitFor();
  assert.match(await page.locator(".composer-feedback").innerText(), /Delivery uncertain/);
  const copied = await app.evaluate(({ clipboard }) => clipboard.readText());
  assert.match(copied, /Be concise\.\n\nExplain the tradeoffs\./);
  assert(copied.endsWith("UNCERTAIN"));
  await page.getByRole("button", { name: "Focus terminal", exact: true }).click();
  assert(await page.locator(".xterm-helper-textarea").evaluate((el) => el === document.activeElement));
  await page.keyboard.press("Control+c");
  await page.getByRole("button", { name: "Remove terminal selection 2" }).click();
  await page.getByRole("button", { name: "Remove terminal selection 1" }).click();
  await plan().focus(); await page.keyboard.press("Space");
  await row.click({ clickCount: 3 });
  await page.getByRole("button", { name: "Add to prompt", exact: true }).click();
  await page.getByRole("button", { name: "Remove terminal selection 1" }).click();
  assert.equal(await page.locator(".composer-quotation").count(), 0);
  await row.click({ clickCount: 3 });
  await page.getByRole("button", { name: "Add to prompt", exact: true }).click();
  await plan().focus(); await page.keyboard.press("Space");
  await prompt().fill("Persist my planning draft");
  await page.waitForTimeout(350);
  assert.deepEqual(errors, []);
  await app.close();
  page = await launch();
  await page.getByRole("button", { name: "Start session", exact: true }).click();
  assert.equal(await prompt().inputValue(), "Persist my planning draft");
  assert.equal(await plan().isChecked(), true);
  assert.equal(await page.locator(".composer-quotation").count(), 1);
  assert.equal(await page.getByRole("button", { name: "Recent prompts" }).isDisabled(), true);
  console.log("Composer QA passed. Artifacts:", directory);
} finally { if (app) await app.close(); console.log("QA artifacts:", directory); }
