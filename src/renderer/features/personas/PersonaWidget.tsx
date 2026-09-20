import { useEffect, useMemo, useState } from "react";
import {
  Button as AriaButton,
  Dialog,
  DialogTrigger,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Modal,
  ModalOverlay,
  Popover,
  Select,
  SelectValue,
  TextArea,
  TextField,
} from "react-aria-components";
import type { Persona } from "../../../shared/models";
import type { WidgetProps } from "../../core/widget-registry";
import { createId } from "../../core/id";
import { useWorkbenchStore } from "../../state/workbench-store";
import { ChevronDownIcon, EditIcon, PlusIcon, SparkIcon, TrashIcon } from "../../ui/icons";
import { Button, IconButton } from "../../ui/controls";

interface PersonaFormProps {
  persona?: Persona;
  workspaceId: string;
  onSave: (persona: Persona) => void;
}

function PersonaForm({ persona, workspaceId, onSave }: PersonaFormProps) {
  const [name, setName] = useState(persona?.name ?? "");
  const [description, setDescription] = useState(persona?.description ?? "");
  const [instructions, setInstructions] = useState(persona?.instructions ?? "");
  const [scope, setScope] = useState<"global" | "workspace">(persona?.scope ?? "global");

  useEffect(() => {
    setName(persona?.name ?? "");
    setDescription(persona?.description ?? "");
    setInstructions(persona?.instructions ?? "");
    setScope(persona?.scope ?? "global");
  }, [persona]);

  return (
    <form
      className="persona-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim() || !instructions.trim()) return;
        onSave({
          id: persona?.id ?? createId("persona"),
          name: name.trim(),
          description: description.trim(),
          instructions: instructions.trim(),
          scope,
          workspaceId: scope === "workspace" ? workspaceId : undefined,
        });
      }}
    >
      <TextField value={name} onChange={setName} isRequired>
        <Label>Name</Label>
        <Input placeholder="e.g. Product strategist" autoFocus />
      </TextField>
      <TextField value={description} onChange={setDescription}>
        <Label>Description</Label>
        <Input placeholder="A short description" />
      </TextField>
      <TextField value={instructions} onChange={setInstructions} isRequired>
        <Label>Instructions</Label>
        <TextArea placeholder="How should the agent approach the work?" rows={7} />
      </TextField>
      <Select selectedKey={scope} onSelectionChange={(key) => setScope(key as "global" | "workspace")}>
        <Label>Scope</Label>
        <AriaButton className="select-trigger"><SelectValue /><ChevronDownIcon size={14} /></AriaButton>
        <Popover className="wb-popover"><ListBox><ListBoxItem id="global">All workspaces</ListBoxItem><ListBoxItem id="workspace">This workspace</ListBoxItem></ListBox></Popover>
      </Select>
      <Button type="submit" className="primary-button">Save persona</Button>
    </form>
  );
}

function PersonaManager({ workspaceId }: { workspaceId: string }) {
  const personas = useWorkbenchStore((state) => state.personas);
  const upsertPersona = useWorkbenchStore((state) => state.upsertPersona);
  const deletePersona = useWorkbenchStore((state) => state.deletePersona);
  const [editingId, setEditingId] = useState<string | "new">(personas[0]?.id ?? "new");
  const editing = personas.find((persona) => persona.id === editingId);

  return (
    <div className="persona-manager">
      <div className="persona-list-pane">
        <div className="dialog-section-header">
          <span>Personas</span>
          <IconButton label="Create persona" onPress={() => setEditingId("new")}><PlusIcon size={15} /></IconButton>
        </div>
        <div className="persona-list">
          {personas.map((persona) => (
            <button className={`persona-list-item ${editingId === persona.id ? "is-selected" : ""}`} key={persona.id} onClick={() => setEditingId(persona.id)}>
              <span>{persona.name}</span>
              <small>{persona.scope === "global" ? "Global" : "Workspace"}</small>
            </button>
          ))}
          {personas.length === 0 && <p className="empty-copy">No personas yet.</p>}
        </div>
      </div>
      <div className="persona-editor-pane">
        <div className="dialog-section-header">
          <span>{editing ? "Edit persona" : "Create persona"}</span>
          {editing && <IconButton label="Delete persona" onPress={() => { deletePersona(editing.id); setEditingId("new"); }}><TrashIcon size={15} /></IconButton>}
        </div>
        <PersonaForm key={editing?.id ?? "new"} persona={editing} workspaceId={workspaceId} onSave={(persona) => { upsertPersona(persona); setEditingId(persona.id); }} />
      </div>
    </div>
  );
}

export function PersonaWidget({ workspaceId }: WidgetProps) {
  const allPersonas = useWorkbenchStore((state) => state.personas);
  const selectedId = useWorkbenchStore((state) => state.selectedPersonaByWorkspace[workspaceId]);
  const selectPersona = useWorkbenchStore((state) => state.selectPersona);
  const personas = useMemo(
    () => allPersonas.filter((persona) => persona.scope === "global" || persona.workspaceId === workspaceId),
    [allPersonas, workspaceId],
  );

  return (
    <div className="support-card">
      <div className="support-card-header">
        <div><SparkIcon size={15} /><span>Persona</span></div>
        <DialogTrigger>
          <IconButton label="Manage personas"><EditIcon size={14} /></IconButton>
          <ModalOverlay className="wb-modal-overlay" isDismissable>
            <Modal className="wb-modal">
              <Dialog aria-label="Manage personas" className="wb-dialog">
                {({ close }) => (
                  <>
                    <div className="dialog-header"><div><h2>Manage personas</h2><p>Create reusable instruction sets for agent sessions.</p></div><Button onPress={close}>Done</Button></div>
                    <PersonaManager workspaceId={workspaceId} />
                  </>
                )}
              </Dialog>
            </Modal>
          </ModalOverlay>
        </DialogTrigger>
      </div>
      <Select
        aria-label="Active persona"
        selectedKey={selectedId ?? "none"}
        onSelectionChange={(key) => selectPersona(workspaceId, key === "none" ? undefined : String(key))}
      >
        <AriaButton className="select-trigger"><SelectValue>{({ selectedText }) => selectedText || "No persona"}</SelectValue><ChevronDownIcon size={14} /></AriaButton>
        <Popover className="wb-popover" placement="bottom end">
          <ListBox>
            <ListBoxItem id="none" textValue="No persona"><div><span>No persona</span><small>Send only the prompt and instructions</small></div></ListBoxItem>
            {personas.map((persona) => <ListBoxItem id={persona.id} key={persona.id} textValue={persona.name}><div><span>{persona.name}</span><small>{persona.description || "No description"}</small></div></ListBoxItem>)}
          </ListBox>
        </Popover>
      </Select>
      <p className="support-card-copy">{personas.find((persona) => persona.id === selectedId)?.description ?? "Choose a reusable style and set of instructions."}</p>
    </div>
  );
}
