import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerFirstPartyContributions } from "./app/register-first-party";
import { WorkbenchShell } from "./shell/WorkbenchShell";
import "./theme/tokens.css";
import "./theme/base.css";
import "./theme/shell.css";
import "./theme/composer.css";
import "./theme/panels.css";
import "./theme/code.css";

registerFirstPartyContributions();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WorkbenchShell />
  </StrictMode>,
);
