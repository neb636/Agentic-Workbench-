import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button as AriaButton,
  GridList,
  GridListItem,
  Input,
  SearchField,
  Tree,
  TreeItem,
  TreeItemContent,
  type Key,
} from "react-aria-components";
import type { FileEntry } from "../../../shared/models";
import { errorMessage } from "../../core/errors";
import type { PanelProps } from "../../core/panel-registry";
import { services } from "../../core/services";
import { watchWorkspace } from "../../core/workspace-watch";
import { IconButton } from "../../ui/controls";
import { ChevronRightIcon, CloseIcon, FileIcon, FolderIcon, RefreshIcon, SearchIcon } from "../../ui/icons";

type Listing = FileEntry[] | { error: string };

export function FilesPanel({ workspace }: PanelProps) {
  const root = workspace.path;
  const [listings, setListings] = useState<Record<string, Listing>>({});
  const [expanded, setExpanded] = useState<Set<Key>>(new Set());
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<string[]>();
  const loaded = useRef<string[]>([]);
  useEffect(() => { loaded.current = Object.keys(listings); }, [listings]);

  const load = useCallback((directory: string) => {
    window.workbench.files.list(root, directory)
      .then((entries) => setListings((current) => ({ ...current, [directory]: entries })))
      .catch((e: unknown) => setListings((current) => ({ ...current, [directory]: { error: errorMessage(e) } })));
  }, [root]);

  useEffect(() => { setListings({}); setExpanded(new Set()); load(""); }, [load]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = watchWorkspace(root, () => {
      clearTimeout(timer);
      timer = setTimeout(() => loaded.current.forEach(load), 250);
    });
    return () => { clearTimeout(timer); off(); };
  }, [root, load]);
  useEffect(() => {
    if (!query.trim()) { setResults(undefined); return; }
    let active = true;
    const timer = setTimeout(() => {
      void window.workbench.files.find(root, query).then((found) => { if (active) setResults(found); }).catch(() => { if (active) setResults([]); });
    }, 120);
    return () => { active = false; clearTimeout(timer); };
  }, [root, query]);

  const open = (path: string) => void services.commands.execute("file.open", { workspaceId: workspace.id, root, path });
  const entryFor = (path: string): FileEntry | undefined => {
    const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    const listing = listings[parent];
    return Array.isArray(listing) ? listing.find((entry) => entry.path === path) : undefined;
  };
  const changeExpanded = (keys: Set<Key>) => {
    for (const key of keys) if (!expanded.has(key) && !listings[String(key)]) load(String(key));
    setExpanded(keys);
  };
  const renderEntries = (directory: string) => {
    const listing = listings[directory];
    if (!listing) return [<TreeItem key={`${directory}/…`} id={`${directory}/…`} textValue="Loading" className="file-tree-item is-placeholder">
      <TreeItemContent><span className="file-tree-note">Loading…</span></TreeItemContent></TreeItem>];
    if (!Array.isArray(listing)) return [<TreeItem key={`${directory}/!`} id={`${directory}/!`} textValue="Error" className="file-tree-item is-placeholder">
      <TreeItemContent><span className="file-tree-note">{listing.error}</span></TreeItemContent></TreeItem>];
    return listing.map((entry) => <TreeItem key={entry.path} id={entry.path} textValue={entry.name} className="file-tree-item" hasChildItems={entry.kind === "directory"}>
      <TreeItemContent>
        {({ level, isExpanded }) => <div className="file-tree-row" style={{ paddingInlineStart: 6 + (level - 1) * 14 }}>
          {entry.kind === "directory"
            ? <AriaButton slot="chevron" className={`tree-chevron ${isExpanded ? "is-expanded" : ""}`} aria-label={isExpanded ? `Collapse ${entry.name}` : `Expand ${entry.name}`}><ChevronRightIcon size={12} /></AriaButton>
            : <span className="tree-chevron-spacer" />}
          {entry.kind === "directory" ? <FolderIcon size={14} /> : <FileIcon size={14} />}
          <span className="file-tree-name">{entry.name}</span>
        </div>}
      </TreeItemContent>
      {entry.kind === "directory" && expanded.has(entry.path) && renderEntries(entry.path)}
    </TreeItem>);
  };

  return <div className="side-panel files-panel">
    <div className="side-panel-header">
      <h2>{workspace.name}</h2>
      <IconButton label="Refresh files" onPress={() => Object.keys(listings).forEach(load)}><RefreshIcon size={14} /></IconButton>
    </div>
    <SearchField aria-label="Search files" className="panel-search" value={query} onChange={setQuery}>
      <SearchIcon size={14} /><Input placeholder="Search files" />
      {query && <AriaButton aria-label="Clear search"><CloseIcon size={12} /></AriaButton>}
    </SearchField>
    {results ? (
      <GridList aria-label="Matching files" className="panel-list" items={results.map((path) => ({ id: path }))} onAction={(key) => open(String(key))}
        renderEmptyState={() => <p className="panel-empty">No files match “{query}”.</p>}>
        {(item) => <GridListItem id={item.id} textValue={item.id} className="panel-list-item">
          <FileIcon size={14} /><span className="file-tree-name">{item.id.split("/").at(-1)}</span><small>{item.id.split("/").slice(0, -1).join("/")}</small>
        </GridListItem>}
      </GridList>
    ) : (
      <Tree aria-label={`Files in ${workspace.name}`} className="file-tree" expandedKeys={expanded} onExpandedChange={changeExpanded}
        onAction={(key) => {
          const entry = entryFor(String(key));
          if (entry?.kind === "file") open(entry.path);
          else if (entry) changeExpanded(new Set(expanded.has(entry.path) ? [...expanded].filter((item) => item !== entry.path) : [...expanded, entry.path]));
        }}>
        {renderEntries("")}
      </Tree>
    )}
  </div>;
}
