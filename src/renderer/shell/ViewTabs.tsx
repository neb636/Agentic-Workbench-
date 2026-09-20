import {
  Button as AriaButton,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
  Tab,
  TabList,
  Tabs,
} from "react-aria-components";
import type { Workspace } from "../../shared/models";
import { services } from "../core/services";
import { useWorkbenchStore } from "../state/workbench-store";
import { ChevronDownIcon, CloseIcon, PlusIcon } from "../ui/icons";

export function ViewTabs({ workspace }: { workspace: Workspace }) {
  const selectView = useWorkbenchStore((state) => state.selectView);
  const activeView = workspace.views.find((view) => view.id === workspace.activeViewId);

  return (
    <>
      <div className="workspace-header">
        <div className="workspace-heading"><h1>{workspace.name}</h1><span>{workspace.path}</span></div>
        <div className="workspace-badge">Local workspace</div>
      </div>
      <div className="tab-row">
        <Tabs
          className="view-tabs"
          selectedKey={activeView?.id}
          onSelectionChange={(key) => selectView(workspace.id, String(key))}
        >
          <TabList aria-label="Workspace views" items={workspace.views}>
            {(view) => {
              const definition = services.views.get(view.type);
              const ViewIcon = definition?.icon;
              return (
                <Tab id={view.id} className="view-tab">
                  {ViewIcon && <ViewIcon size={14} />}
                  <span>{view.title}</span>
                  <AriaButton
                    className="tab-close"
                    aria-label={`Close ${view.title}`}
                    onPress={() => void services.commands.execute("view.close", { workspaceId: workspace.id, viewId: view.id })}
                  ><CloseIcon size={12} /></AriaButton>
                </Tab>
              );
            }}
          </TabList>
        </Tabs>
        <MenuTrigger>
          <AriaButton className="new-view-button" aria-label="Create view"><PlusIcon size={15} /><ChevronDownIcon size={11} /></AriaButton>
          <Popover className="wb-popover view-menu-popover" placement="bottom start">
            <Menu aria-label="View type" onAction={(key) => void services.commands.execute("view.create", { workspaceId: workspace.id, viewType: String(key) })}>
              {services.views.list().map((definition) => {
                const ViewIcon = definition.icon;
                return <MenuItem id={definition.id} key={definition.id} textValue={definition.label}><ViewIcon size={16} /><div><span>{definition.label}</span><small>{definition.description}</small></div></MenuItem>;
              })}
            </Menu>
          </Popover>
        </MenuTrigger>
      </div>
    </>
  );
}
