import { useEffect } from "react";
import { services } from "../core/services";
import { useWorkbenchStore } from "../state/workbench-store";
import { AgentIcon, FolderIcon, PlusIcon, TerminalIcon } from "../ui/icons";
import { Button } from "../ui/controls";
import { Sidebar } from "./Sidebar";
import { ViewTabs } from "./ViewTabs";

export function WorkbenchShell() {
  const workspaces = useWorkbenchStore((state) => state.workspaces);
  const activeWorkspaceId = useWorkbenchStore((state) => state.activeWorkspaceId);
  const isHydrated = useWorkbenchStore((state) => state.isHydrated);
  const hydrate = useWorkbenchStore((state) => state.hydrate);
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaces[0];
  const activeView = activeWorkspace?.views.find((view) => view.id === activeWorkspace.activeViewId);
  const definition = activeView ? services.views.get(activeView.type) : undefined;

  useEffect(() => { void hydrate(); }, [hydrate]);

  if (!isHydrated) return <div className="launch-screen"><div className="brand-mark large"><span>AW</span></div><p>Opening workbench…</p></div>;

  return (
    <div className="app-shell">
      <div className="window-drag-region" />
      <Sidebar workspaces={workspaces} activeWorkspaceId={activeWorkspace?.id} />
      <main className="workspace-shell">
        {!activeWorkspace ? (
          <div className="welcome-view">
            <div className="welcome-icon"><FolderIcon size={25} /></div>
            <h1>Bring your work into one place</h1>
            <p>Add a local directory to create a workspace. Everything stays on this machine.</p>
            <Button className="primary-button" onPress={() => void services.commands.execute("workspace.add")}><PlusIcon size={16} /> Add workspace</Button>
          </div>
        ) : (
          <>
            <ViewTabs workspace={activeWorkspace} />
            <div className="active-view-region">
              {activeView && definition ? (
                <definition.component key={activeView.id} view={activeView} workspace={activeWorkspace} />
              ) : activeView ? (
                <div className="missing-view"><h2>View unavailable</h2><p>No view is registered for <code>{activeView.type}</code>.</p></div>
              ) : (
                <div className="empty-workspace">
                  <h2>Open a view</h2><p>This workspace has no open views.</p>
                  <div className="empty-actions">
                    <Button onPress={() => void services.commands.execute("view.create", { workspaceId: activeWorkspace.id, viewType: "agent" })}><AgentIcon size={16} />Agent</Button>
                    <Button onPress={() => void services.commands.execute("view.create", { workspaceId: activeWorkspace.id, viewType: "terminal" })}><TerminalIcon size={16} />Terminal</Button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
