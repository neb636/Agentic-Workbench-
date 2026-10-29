import { services } from "../core/services";

export function StatusBar() {
  const render = (slot: string) => services.widgets.forSlot(slot).map((widget) => {
    const Widget = widget.component;
    return <Widget key={widget.id} />;
  });
  return <footer className="status-bar" aria-label="Status">
    <div className="status-bar-group">{render("statusbar.start")}</div>
    <div className="status-bar-group">{render("statusbar.end")}</div>
  </footer>;
}
