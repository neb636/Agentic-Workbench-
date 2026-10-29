import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { SourceControlChange } from "../../shared/models";
import { executablePath } from "../executables";
import type { ProviderStatus, SourceControlProvider } from "../source-control/source-control-provider";

const OUTPUT_LIMIT = 8 * 1024 * 1024;
const CHANGE_LIMIT = 5_000;
// Mirrors git-check-ref-format rules closely enough to reject anything git would; git re-checks below.
const BRANCH_PATTERN = /^(?!-)(?!.*(?:\.\.|\/\/|@\{|\\|\.lock(?:\/|$)|\/\.|\/$|\.$))[A-Za-z0-9._\-/]+$/;

function letterKind(code: string): SourceControlChange["kind"] {
  switch (code) {
    case "A": case "C": return "added";
    case "D": return "deleted";
    case "R": return "renamed";
    default: return "modified";
  }
}

/** Parses `git status --porcelain=v2 --branch -z` output. */
export function parsePorcelainV2(output: string): ProviderStatus {
  const status: ProviderStatus = { ahead: 0, behind: 0, changes: [], truncated: false };
  const records = output.split("\0");
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) continue;
    if (record.startsWith("# branch.head ")) {
      const head = record.slice(14);
      if (head !== "(detached)") status.branch = head;
    } else if (record.startsWith("# branch.upstream ")) {
      status.upstream = record.slice(18);
    } else if (record.startsWith("# branch.ab ")) {
      const [ahead, behind] = record.slice(12).split(" ");
      status.ahead = Math.abs(Number(ahead)) || 0;
      status.behind = Math.abs(Number(behind)) || 0;
    } else if (record.startsWith("1 ") || record.startsWith("2 ")) {
      const fields = record.split(" ");
      const [staged, unstaged] = fields[1];
      const ordinary = record.startsWith("1 ");
      const filePath = fields.slice(ordinary ? 8 : 9).join(" ");
      const change: SourceControlChange = { path: filePath, kind: letterKind(unstaged !== "." ? unstaged : staged), staged: staged !== "." };
      if (!ordinary) { change.originalPath = records[index + 1]; index += 1; }
      status.changes.push(change);
    } else if (record.startsWith("u ")) {
      status.changes.push({ path: record.split(" ").slice(10).join(" "), kind: "conflicted", staged: false });
    } else if (record.startsWith("? ")) {
      status.changes.push({ path: record.slice(2), kind: "untracked", staged: false });
    }
    if (status.changes.length >= CHANGE_LIMIT) { status.truncated = true; break; }
  }
  return status;
}

export function isValidBranchName(branch: string): boolean {
  return BRANCH_PATTERN.test(branch) && branch !== "@" && branch !== "HEAD";
}

export class GitSourceControlProvider implements SourceControlProvider {
  readonly id = "git";
  readonly label = "Git";

  constructor(private readonly executable = () => executablePath("git")) {}

  async detect(root: string): Promise<boolean> {
    if (!this.executable()) return false;
    return (await this.git(root, ["rev-parse", "--is-inside-work-tree"]).catch(() => "")).trim() === "true";
  }

  async status(root: string): Promise<ProviderStatus> {
    return parsePorcelainV2(await this.git(root, ["-c", "core.quotePath=false", "status", "--porcelain=v2", "--branch", "--untracked-files=all", "-z"]));
  }

  async commit(root: string, message: string): Promise<{ commitId: string }> {
    await this.git(root, ["add", "--all"]);
    await this.git(root, ["commit", "--quiet", "-m", message]);
    return { commitId: (await this.git(root, ["rev-parse", "HEAD"])).trim() };
  }

  async createWorktree(root: string, branch: string, target: string): Promise<{ path: string; branch: string }> {
    if (!isValidBranchName(branch)) throw new Error(`"${branch}" is not a valid branch name.`);
    await this.git(root, ["check-ref-format", "--branch", branch]);
    await mkdir(path.dirname(target), { recursive: true });
    await this.git(root, ["worktree", "add", "-b", branch, "--", target]);
    return { path: target, branch };
  }

  private git(cwd: string, args: string[]): Promise<string> {
    const executable = this.executable();
    if (!executable) return Promise.reject(new Error("Git was not found on this machine."));
    return new Promise((resolve, reject) => {
      execFile(executable, args, { cwd, maxBuffer: OUTPUT_LIMIT, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0" } }, (error, stdout, stderr) => {
        if (error) reject(new Error(String(stderr || error.message).trim()));
        else resolve(stdout);
      });
    });
  }
}
