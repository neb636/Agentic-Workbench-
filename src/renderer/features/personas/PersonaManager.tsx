import { useEffect, useState } from "react";
import {
  Button as AriaButton,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Select,
  SelectValue,
  TextArea,
  TextField,
} from "react-aria-components";
import type { Persona } from "../../../shared/models";
import { createId } from "../../core/id";
import { useWorkbenchStore } from "../../state/workbench-store";
import { ChevronDownIcon, PlusIcon, TrashIcon } from "../../ui/icons";
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

export function PersonaManager({ workspaceId }: { workspaceId: string }) {
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
        <ListBox className="persona-list" aria-label="Personas" items={personas} selectionMode="single" disallowEmptySelection
          selectedKeys={editing ? [editing.id] : []} onSelectionChange={(keys) => { if (keys !== "all" && keys.size) setEditingId(String([...keys][0])); }}
          renderEmptyState={() => <p className="empty-copy">No personas yet.</p>}>
          {(persona) => (
            <ListBoxItem className="persona-list-item" id={persona.id} textValue={persona.name}>
              <span>{persona.name}</span>
              <small>{persona.scope === "global" ? "Global" : "Workspace"}</small>
            </ListBoxItem>
          )}
        </ListBox>
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
