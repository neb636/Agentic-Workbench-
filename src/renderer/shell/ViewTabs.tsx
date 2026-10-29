import { useEffect, useRef, useState } from "react";
import { Button as AriaButton, Menu, MenuItem, MenuTrigger, Popover, Tab, TabList, Tabs } from "react-aria-components";
import type { WorkbenchView, Workspace } from "../../shared/models";
import { services } from "../core/services";
import { useViewStatuses, viewStatus } from "../core/view-status";
import { useWorkbenchStore } from "../state/workbench-store";
import { IconButton } from "../ui/controls";
import { ChevronDownIcon, CloseIcon, PlusIcon, SidebarLeftIcon, SidebarRightIcon } from "../ui/icons";

const TAB_WIDTH = 176;

/** Tabs that fit are shown; the rest move into a "+N more" menu, keeping the active tab visible. */
function splitTabs(views: WorkbenchView[], activeId: string | undefined, capacity: number) {
  if (views.length <= capacity) return { visible: views, hidden: [] };
  let visible = views.slice(0, capacity);
  const active = views.find((view) => view.id === activeId);
  if (active && !visible.includes(active)) visible = [...views.slice(0, capacity - 1), active];
  return { visible, hidden: views.filter((view) => !visible.includes(view)) };
}

export function ViewTabs({ workspace, showLeftToggle, showRightToggle, onShowLeft, onShowRight }: {
  workspace?: Workspace;
  showLeftToggle: boolean;
  showRightToggle: boolean;
  onShowLeft: () => void;
  onShowRight: () => void;
}) {
  const statuses = useViewStatuses();
  const selectView = useWorkbenchStore((state) => state.selectView);
  const stripRef = useRef<HTMLDivElement>(null);
  const [capacity, setCapacity] = useState(Infinity);
  useEffect(() => {
    const element = stripRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setCapacity(Math.max(1, Math.floor(element.clientWidth / TAB_WIDTH))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const views = workspace?.views ?? [];
  const { visible, hidden } = splitTabs(views, workspace?.activeViewId, capacity);
  const close = (view: WorkbenchView) => void services.commands.execute("view.close", { workspaceId: view.workspaceId, viewId: view.id });

  return <div className={`tab-strip ${showLeftToggle ? "has-traffic-lights" : ""}`}>
    {showLeftToggle && <IconButton label="Show sidebar" onPress={onShowLeft}><SidebarLeftIcon size={16} /></IconButton>}
    <div className="tab-strip-tabs" ref={stripRef}>
      {workspace && <Tabs className="view-tabs" selectedKey={workspace.activeViewId}
        onSelectionChange={(key) => selectView(workspace.id, String(key))}>
        <TabList aria-label="Open views" className="view-tab-list" items={visible} dependencies={[statuses]}>
          {(view) => {
            const Icon = services.views.get(view.type)?.icon;
            const status = viewStatus(view, statuses);
            return <Tab id={view.id} className="view-tab" aria-label={view.title}>
              {Icon && <Icon size={14} />}
              <span className="view-tab-title">{view.title}</span>
              {status && <span className={`status-dot tone-${status.tone} ${status.unseen ? "is-unseen" : ""}`} aria-label={status.unseen ? "Completed" : status.label} role="img" />}
              <AriaButton className="tab-close" aria-label={`Close ${view.title}`} onPress={() => close(view)}><CloseIcon size={11} /></AriaButton>
            </Tab>;
          }}
        </TabList>
      </Tabs>}
    </div>
    {workspace && hidden.length > 0 && <MenuTrigger>
      <AriaButton className="tab-overflow" aria-label={`${hidden.length} more views`}>+{hidden.length} more<ChevronDownIcon size={12} /></AriaButton>
      <Popover className="wb-popover" placement="bottom end">
        <Menu aria-label="More views" items={hidden} onAction={(key) => selectView(workspace.id, String(key))}>
          {(view) => {
            const Icon = services.views.get(view.type)?.icon;
            return <MenuItem id={view.id} textValue={view.title}>{Icon && <Icon size={14} />}<span>{view.title}</span></MenuItem>;
          }}
        </Menu>
      </Popover>
    </MenuTrigger>}
    {workspace && <MenuTrigger>
      <AriaButton className="new-view-button" aria-label="Create view"><PlusIcon size={15} /></AriaButton>
      <Popover className="wb-popover view-menu-popover" placement="bottom end">
        <Menu aria-label="View type" onAction={(key) => void services.commands.execute("view.create", { workspaceId: workspace.id, viewType: String(key) })}>
          {services.views.list().filter((definition) => definition.creatable !== false).map((definition) => {
            const Icon = definition.icon;
            return <MenuItem id={definition.id} key={definition.id} textValue={definition.label}><Icon size={16} /><div><span>{definition.label}</span><small>{definition.description}</small></div></MenuItem>;
          })}
        </Menu>
      </Popover>
    </MenuTrigger>}
    {showRightToggle && <IconButton label="Show side panel" onPress={onShowRight}><SidebarRightIcon size={16} /></IconButton>}
  </div>;
}
