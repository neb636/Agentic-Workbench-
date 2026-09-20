import { Button as AriaButton } from "react-aria-components";
import type { Workspace } from "../../shared/models";
import { services } from "../core/services";
import { FolderIcon, PlusIcon, SettingsIcon, SparkIcon } from "../ui/icons";
import { IconButton } from "../ui/controls";

interface SidebarProps {
  workspaces: Workspace[];
  activeWorkspaceId?: string;
}

export function Sidebar({ workspaces, activeWorkspaceId }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark"><SparkIcon size={16} /></div>
        <span>Agent Workbench</span>
      </div>
      <div className="sidebar-section-header">
        <span>Workspaces</span>
        <IconButton label="Add workspace" onPress={() => void services.commands.execute("workspace.add")}><PlusIcon size={15} /></IconButton>
      </div>
      <nav className="workspace-list" aria-label="Workspaces">
        {workspaces.map((workspace) => (
          <AriaButton
            key={workspace.id}
            className={`workspace-item ${workspace.id === activeWorkspaceId ? "is-active" : ""}`}
            onPress={() => void services.commands.execute("workspace.select", workspace.id)}
          >
            <span className="workspace-icon"><FolderIcon size={16} /></span>
            <span className="workspace-item-copy"><strong>{workspace.name}</strong><small>{workspace.path}</small></span>
            <span className="workspace-view-count">{workspace.views.length}</span>
          </AriaButton>
        ))}
        {workspaces.length === 0 && <p className="sidebar-empty">Local directories you add will appear here.</p>}
      </nav>
      <div className="sidebar-footer"><SettingsIcon size={15} /><span>Local-first workbench</span></div>
    </aside>
  );
}
