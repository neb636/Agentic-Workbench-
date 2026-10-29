import { execFileSync } from "node:child_process";

const MARKER = "__WORKBENCH_PATH__";

/**
 * Apps opened from Finder or the Dock inherit a minimal PATH, so CLIs installed through
 * Homebrew, npm, or version managers (and the `node` they run on) would not be found.
 * Adopt the PATH the user's login shell would have.
 */
export function adoptLoginShellPath(): void {
  if (process.platform === "win32") return;
  const shell = process.env.SHELL || "/bin/zsh";
  try {
    const output = execFileSync(shell, ["-ilc", `printf '${MARKER}%s${MARKER}' "$PATH"`], {
      encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"],
    });
    const path = output.split(MARKER)[1];
    if (path) process.env.PATH = [...new Set([...path.split(":"), ...(process.env.PATH ?? "").split(":")].filter(Boolean))].join(":");
  } catch (error) {
    console.warn("Could not read the login shell PATH", String(error));
  }
}
