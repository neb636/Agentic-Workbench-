/// <reference types="vite/client" />

import type { WorkbenchApi } from "../shared/models";

declare global {
  interface Window {
    workbench: WorkbenchApi;
  }
}

export {};
