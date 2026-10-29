import { promises as fs, watch, type FSWatcher } from "node:fs";
import path from "node:path";
import type { FileContent, FileEntry } from "../shared/models";

const HIDDEN = new Set([".git", ".DS_Store"]);
const SKIP_WHEN_SEARCHING = new Set([".git", "node_modules"]);
const READ_LIMIT = 2 * 1024 * 1024;
const LIST_LIMIT = 5_000;
const WALK_LIMIT = 50_000;
const INDEX_TTL = 10_000;

function isInside(target: string, base: string): boolean {
  const relative = path.relative(base, target);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function toPortable(relative: string): string {
  return relative.split(path.sep).join("/");
}

/** Worktrees for a workspace are created beside it, in `<workspace>-worktrees/`. */
export function worktreeContainer(root: string): string {
  return `${path.resolve(root)}-worktrees`;
}

/**
 * The directories the renderer may read from: workspace paths and the worktrees created
 * beside them. Every file or source-control request names one of these roots.
 */
export class WorkspaceRoots {
  private roots = new Set<string>();

  replace(paths: string[]): void {
    this.roots = new Set(paths.map((item) => path.resolve(item)));
  }

  add(root: string): void {
    this.roots.add(path.resolve(root));
  }

  isAllowed(root: string): boolean {
    const requested = path.resolve(root);
    return [...this.roots].some((allowed) => requested === allowed || isInside(requested, worktreeContainer(allowed)));
  }

  async resolve(root: string): Promise<string> {
    if (!this.isAllowed(root)) throw new Error("That folder is not part of a workspace.");
    return fs.realpath(path.resolve(root));
  }
}

async function resolveInside(base: string, relative: string): Promise<string> {
  if (path.isAbsolute(relative)) throw new Error("Paths must be relative to the workspace.");
  const target = await fs.realpath(path.resolve(base, relative || "."));
  if (target !== base && !isInside(target, base)) throw new Error("Path is outside the workspace.");
  return target;
}

interface Watch {
  watcher: FSWatcher;
  listeners: Set<(paths: string[]) => void>;
  pending: Set<string>;
  timer?: ReturnType<typeof setTimeout>;
}

export class WorkspaceFiles {
  private readonly indexes = new Map<string, { files: string[]; at: number }>();
  private readonly watches = new Map<string, Watch>();

  constructor(private readonly roots: WorkspaceRoots) {}

  async list(root: string, relative: string): Promise<FileEntry[]> {
    const base = await this.roots.resolve(root);
    const directory = await resolveInside(base, relative);
    const entries = (await fs.readdir(directory, { withFileTypes: true })).filter((entry) => !HIDDEN.has(entry.name)).slice(0, LIST_LIMIT);
    const listed = await Promise.all(entries.map(async (entry): Promise<FileEntry | undefined> => {
      const absolute = path.join(directory, entry.name);
      try {
        if (entry.isSymbolicLink()) await resolveInside(base, path.relative(base, absolute));
        const stats = await fs.stat(absolute);
        if (!stats.isFile() && !stats.isDirectory()) return undefined;
        return { name: entry.name, path: toPortable(path.relative(base, absolute)), kind: stats.isDirectory() ? "directory" : "file", size: stats.isFile() ? stats.size : 0 };
      } catch { return undefined; }
    }));
    return listed.filter((entry): entry is FileEntry => Boolean(entry)).sort((a, b) =>
      a.kind === b.kind ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }) : a.kind === "directory" ? -1 : 1);
  }

  async read(root: string, relative: string): Promise<FileContent> {
    const base = await this.roots.resolve(root);
    const file = await resolveInside(base, relative);
    const stats = await fs.stat(file);
    if (!stats.isFile()) throw new Error("Only files can be opened.");
    const handle = await fs.open(file, "r");
    try {
      const buffer = Buffer.alloc(Math.min(stats.size, READ_LIMIT));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      const bytes = buffer.subarray(0, bytesRead);
      const binary = bytes.subarray(0, 8000).includes(0);
      return { path: toPortable(path.relative(base, file)), content: binary ? "" : bytes.toString("utf8"), size: stats.size, truncated: stats.size > bytesRead, binary };
    } finally { await handle.close(); }
  }

  async find(root: string, query: string, limit = 200): Promise<string[]> {
    const base = await this.roots.resolve(root);
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const files = await this.index(base);
    const scored: { file: string; score: number }[] = [];
    for (const file of files) {
      const score = matchScore(file.toLowerCase(), needle);
      if (score > 0) scored.push({ file, score });
    }
    return scored.sort((a, b) => b.score - a.score || a.file.length - b.file.length).slice(0, limit).map((item) => item.file);
  }

  /** Watches a workspace root; listeners for the same root share one recursive watcher. */
  async watch(root: string, listener: (paths: string[]) => void): Promise<() => void> {
    const base = await this.roots.resolve(root);
    let entry = this.watches.get(base);
    if (!entry) {
      const created: Watch = { listeners: new Set(), pending: new Set(), watcher: watch(base, { recursive: true }, (_type, name) => {
        const changed = name ? toPortable(String(name)) : "";
        created.pending.add(changed.startsWith(".git/") ? ".git" : changed);
        this.indexes.delete(base);
        clearTimeout(created.timer);
        created.timer = setTimeout(() => {
          const paths = [...created.pending]; created.pending.clear();
          created.listeners.forEach((notify) => notify(paths));
        }, 150);
      }) };
      created.watcher.on("error", (error) => console.warn("Workspace watcher failed", String(error)));
      this.watches.set(base, created);
      entry = created;
    }
    const active = entry;
    active.listeners.add(listener);
    return () => {
      active.listeners.delete(listener);
      if (active.listeners.size) return;
      clearTimeout(active.timer); active.watcher.close(); this.watches.delete(base);
    };
  }

  private async index(base: string): Promise<string[]> {
    const cached = this.indexes.get(base);
    if (cached && Date.now() - cached.at < INDEX_TTL) return cached.files;
    const files: string[] = [];
    const queue = [base];
    while (queue.length && files.length < WALK_LIMIT) {
      const directory = queue.shift()!;
      let entries;
      try { entries = await fs.readdir(directory, { withFileTypes: true }); } catch { continue; }
      for (const entry of entries) {
        if (SKIP_WHEN_SEARCHING.has(entry.name) || entry.name === ".DS_Store") continue;
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) queue.push(absolute);
        else if (entry.isFile()) files.push(toPortable(path.relative(base, absolute)));
        if (files.length >= WALK_LIMIT) break;
      }
    }
    this.indexes.set(base, { files, at: Date.now() });
    return files;
  }
}

/** Ranks file-name matches above path matches above in-order character matches; zero means no match. */
export function matchScore(file: string, needle: string): number {
  const name = file.slice(file.lastIndexOf("/") + 1);
  if (name === needle) return 1000;
  if (name.startsWith(needle)) return 800;
  if (name.includes(needle)) return 600;
  if (file.includes(needle)) return 400;
  let position = 0;
  for (const character of needle) {
    position = file.indexOf(character, position);
    if (position < 0) return 0;
    position += 1;
  }
  return 100;
}
