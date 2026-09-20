import { create } from "zustand";
import type {
  AppendedInstruction,
  PersistedState,
  Persona,
  WorkbenchView,
  Workspace,
} from "../../shared/models";
import { createId } from "../core/id";

interface WorkbenchStore extends PersistedState {
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  addWorkspace: (path: string) => string;
  selectWorkspace: (workspaceId: string) => void;
  createView: (workspaceId: string, type: string, title: string, state?: unknown) => string;
  selectView: (workspaceId: string, viewId: string) => void;
  closeView: (workspaceId: string, viewId: string) => void;
  upsertPersona: (persona: Persona) => void;
  deletePersona: (personaId: string) => void;
  selectPersona: (workspaceId: string, personaId?: string) => void;
  addInstruction: (workspaceId: string, content?: string) => string;
  updateInstruction: (instructionId: string, patch: Partial<AppendedInstruction>) => void;
  deleteInstruction: (instructionId: string) => void;
}

const initialState: PersistedState = {
  workspaces: [],
  personas: [],
  selectedPersonaByWorkspace: {},
  appendedInstructions: [],
};

function workspaceName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

export const useWorkbenchStore = create<WorkbenchStore>((set, get) => ({
  ...initialState,
  isHydrated: false,
  hydrate: async () => {
    const persisted = await window.workbench.persistence.load();
    set({ ...persisted, isHydrated: true });
  },
  addWorkspace: (path) => {
    const existing = get().workspaces.find((workspace) => workspace.path === path);
    if (existing) {
      set({ activeWorkspaceId: existing.id });
      return existing.id;
    }
    const workspaceId = createId("workspace");
    const initialView: WorkbenchView = {
      id: createId("view"),
      type: "agent",
      workspaceId,
      title: "New session",
    };
    const workspace: Workspace = {
      id: workspaceId,
      name: workspaceName(path),
      path,
      views: [initialView],
      activeViewId: initialView.id,
    };
    set((state) => ({
      workspaces: [...state.workspaces, workspace],
      activeWorkspaceId: workspaceId,
    }));
    return workspaceId;
  },
  selectWorkspace: (workspaceId) => set({ activeWorkspaceId: workspaceId }),
  createView: (workspaceId, type, title, viewState) => {
    const viewId = createId("view");
    set((state) => ({
      workspaces: state.workspaces.map((workspace) =>
        workspace.id === workspaceId
          ? {
              ...workspace,
              views: [...workspace.views, { id: viewId, type, workspaceId, title, state: viewState }],
              activeViewId: viewId,
            }
          : workspace,
      ),
    }));
    return viewId;
  },
  selectView: (workspaceId, viewId) =>
    set((state) => ({
      workspaces: state.workspaces.map((workspace) =>
        workspace.id === workspaceId ? { ...workspace, activeViewId: viewId } : workspace,
      ),
    })),
  closeView: (workspaceId, viewId) =>
    set((state) => ({
      workspaces: state.workspaces.map((workspace) => {
        if (workspace.id !== workspaceId) return workspace;
        const index = workspace.views.findIndex((view) => view.id === viewId);
        const views = workspace.views.filter((view) => view.id !== viewId);
        const replacement = views[Math.min(Math.max(index, 0), views.length - 1)];
        return {
          ...workspace,
          views,
          activeViewId: workspace.activeViewId === viewId ? replacement?.id : workspace.activeViewId,
        };
      }),
    })),
  upsertPersona: (persona) =>
    set((state) => {
      const exists = state.personas.some((item) => item.id === persona.id);
      return { personas: exists ? state.personas.map((item) => (item.id === persona.id ? persona : item)) : [...state.personas, persona] };
    }),
  deletePersona: (personaId) =>
    set((state) => ({
      personas: state.personas.filter((persona) => persona.id !== personaId),
      selectedPersonaByWorkspace: Object.fromEntries(
        Object.entries(state.selectedPersonaByWorkspace).map(([workspaceId, selectedId]) => [
          workspaceId,
          selectedId === personaId ? undefined : selectedId,
        ]),
      ),
    })),
  selectPersona: (workspaceId, personaId) =>
    set((state) => ({
      selectedPersonaByWorkspace: { ...state.selectedPersonaByWorkspace, [workspaceId]: personaId },
    })),
  addInstruction: (workspaceId, content = "") => {
    const id = createId("instruction");
    set((state) => ({
      appendedInstructions: [...state.appendedInstructions, { id, workspaceId, content, enabled: true }],
    }));
    return id;
  },
  updateInstruction: (instructionId, patch) =>
    set((state) => ({
      appendedInstructions: state.appendedInstructions.map((instruction) =>
        instruction.id === instructionId ? { ...instruction, ...patch } : instruction,
      ),
    })),
  deleteInstruction: (instructionId) =>
    set((state) => ({
      appendedInstructions: state.appendedInstructions.filter((instruction) => instruction.id !== instructionId),
    })),
}));

function persistedSnapshot(state: WorkbenchStore): PersistedState {
  return {
    workspaces: state.workspaces,
    activeWorkspaceId: state.activeWorkspaceId,
    personas: state.personas,
    selectedPersonaByWorkspace: state.selectedPersonaByWorkspace,
    appendedInstructions: state.appendedInstructions,
  };
}

let persistenceTimer: ReturnType<typeof setTimeout> | undefined;
useWorkbenchStore.subscribe((state) => {
  if (!state.isHydrated) return;
  clearTimeout(persistenceTimer);
  persistenceTimer = setTimeout(() => {
    void window.workbench.persistence.save(persistedSnapshot(useWorkbenchStore.getState()));
  }, 180);
});
