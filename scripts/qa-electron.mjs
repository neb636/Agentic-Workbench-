import { _electron as electron } from "playwright";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const profile = await mkdtemp(path.join(tmpdir(), "agent-workbench-qa-"));
const workspacePath = process.cwd();
const artifacts = {
  agent: path.join(profile, "agent-view.png"),
  terminal: path.join(profile, "terminal-view.png"),
  compact: path.join(profile, "compact-view.png"),
};
const report = { checks: [], errors: [], artifacts, profile };
const check = (name, passed, detail = "") => {
  report.checks.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}: ${detail}`);
};

async function launch() {
  const app = await electron.launch({ args: [".", `--user-data-dir=${profile}`], cwd: workspacePath });
  const page = await app.firstWindow();
  page.on("console", (message) => {
    if (message.type() === "error") report.errors.push(message.text());
  });
  page.on("pageerror", (error) => report.errors.push(error.message));
  await page.waitForLoadState("domcontentloaded");
  return { app, page };
}

let { app, page } = await launch();
try {
  check("secure renderer boundary", await app.evaluate(({ BrowserWindow }) => {
    const prefs = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
    return prefs.contextIsolation === true && prefs.nodeIntegration === false;
  }));

  check("empty workspace onboarding", await page.getByRole("heading", { name: "Bring your work into one place" }).isVisible());
  await app.evaluate(({ dialog }, directory) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
  }, workspacePath);
  await page.getByRole("button", { name: "Add workspace" }).last().click();
  await page.getByRole("heading", { name: "agent-workbench" }).waitFor();
  check("workspace added", await page.getByText(workspacePath).first().isVisible());
  check("agent view opens by default", await page.getByRole("region", { name: "Agent session" }).isVisible());
  check("registry widgets visible", await page.getByText("Persona", { exact: true }).isVisible() && await page.getByText("Appended instructions", { exact: true }).isVisible());

  await page.locator(".support-card .select-trigger").first().click();
  await page.getByRole("option", { name: /Thoughtful collaborator/ }).click();
  await page.getByRole("button", { name: "Add instruction" }).click();
  await page.getByRole("textbox", { name: "Instruction 1" }).fill("Keep the final answer focused on observable outcomes.");
  await page.getByRole("textbox", { name: "Prompt" }).fill("Outline the next milestone.");
  await page.getByRole("button", { name: "Send prompt" }).click();
  check("prompt submitted", await page.getByText("Outline the next milestone.").isVisible());
  check("prompt contributions assembled", await page.getByText("2 prompt contributions").isVisible());

  await page.getByRole("button", { name: "Manage personas" }).click();
  await page.getByRole("dialog", { name: "Manage personas" }).waitFor();
  await page.getByRole("button", { name: "Create persona" }).click();
  await page.getByRole("textbox", { name: "Name" }).fill("QA persona");
  await page.getByRole("textbox", { name: "Description" }).fill("Created in the interaction pass");
  await page.getByRole("textbox", { name: "Instructions" }).fill("Check assumptions and show evidence.");
  await page.getByRole("button", { name: "Save persona" }).click();
  check("persona created", await page.getByRole("button", { name: /QA persona/ }).isVisible());
  await page.getByRole("textbox", { name: "Description" }).fill("Edited in the interaction pass");
  await page.getByRole("button", { name: "Save persona" }).click();
  check("persona edited", await page.getByRole("textbox", { name: "Description" }).inputValue() === "Edited in the interaction pass");
  await page.getByRole("button", { name: "Delete persona" }).click();
  check("persona deleted", await page.getByRole("button", { name: /QA persona/ }).count() === 0);
  await page.getByRole("button", { name: "Done" }).click();
  await page.screenshot({ path: artifacts.agent });

  await page.getByRole("button", { name: "Create view" }).click();
  await page.getByRole("menuitem", { name: /Terminal/ }).click();
  await page.getByRole("region", { name: "Terminal session" }).waitFor();
  await page.getByText("Running").waitFor({ timeout: 10_000 });
  const terminal = page.locator(".terminal-host");
  await terminal.click();
  await page.keyboard.type("printf '\\127ORKBENCH_PTY_OK\\n'");
  await page.keyboard.press("Enter");
  await page.getByText("WORKBENCH_PTY_OK", { exact: true }).waitFor({ timeout: 10_000 });
  check("real PTY input and output", true);
  await page.screenshot({ path: artifacts.terminal });

  await page.getByRole("tab", { name: /New session/ }).click();
  check("tab switching", await page.getByRole("region", { name: "Agent session" }).isVisible());
  await page.getByRole("tab", { name: /Terminal/ }).getByRole("button", { name: /Close Terminal/ }).click();
  check("tab closing", await page.getByRole("tab", { name: /Terminal/ }).count() === 0);
  await page.getByRole("tab", { name: /New session/ }).getByRole("button", { name: /Close New session/ }).click();
  check("closing final tab exposes recovery state", await page.getByRole("heading", { name: "Open a view" }).isVisible());
  await page.getByRole("button", { name: "Agent", exact: true }).click();
  check("view can be reopened after closing final tab", await page.getByRole("region", { name: "Agent session" }).isVisible());

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1040, 700));
  await page.waitForTimeout(250);
  const fit = await page.evaluate(() => {
    const selectors = [".sidebar", ".workspace-header", ".tab-row", ".active-view-region", ".agent-composer-row"];
    return {
      viewport: { width: innerWidth, height: innerHeight },
      documentOverflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight,
      regions: selectors.map((selector) => {
        const rect = document.querySelector(selector)?.getBoundingClientRect();
        return { selector, bottom: rect?.bottom, right: rect?.right, top: rect?.top, left: rect?.left };
      }),
    };
  });
  check("compact fixed-shell fit", !fit.documentOverflow && fit.regions.every((region) => (region.bottom ?? 0) <= fit.viewport.height + 1 && (region.right ?? 0) <= fit.viewport.width + 1), JSON.stringify(fit));
  await page.screenshot({ path: artifacts.compact });

  await page.waitForTimeout(350);
  await app.close();
  ({ app, page } = await launch());
  await page.getByRole("heading", { name: "agent-workbench" }).waitFor();
  check("workspace persisted after relaunch", await page.getByText(workspacePath).first().isVisible());
  await app.evaluate(({ dialog }, directory) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
  }, workspacePath);
  await page.getByRole("button", { name: "Add workspace" }).click();
  await page.waitForTimeout(250);
  check("re-adding existing workspace is idempotent", await page.locator(".workspace-item").count() === 1);

  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ...report, fatal: String(error) }, null, 2));
  process.exitCode = 1;
} finally {
  await app?.close().catch(() => {});
  console.error(`QA artifacts retained at ${profile}`);
}
