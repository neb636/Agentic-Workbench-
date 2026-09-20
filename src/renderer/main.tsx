import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerFirstPartyContributions } from "./app/register-first-party";
import { WorkbenchShell } from "./shell/WorkbenchShell";
import "./theme/workbench.css";

registerFirstPartyContributions();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WorkbenchShell />
  </StrictMode>,
);
