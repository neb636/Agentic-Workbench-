import { useState } from "react";
import {
  Button as AriaButton,
  Checkbox,
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
import type { StoredPromptOption } from "../../../shared/models";
import { choice, select, textInput, toggle, type PromptOptionChoice, type PromptOptionDefinition } from "../../../shared/prompt-options";
import { createId } from "../../core/id";
import { useWorkbenchStore } from "../../state/workbench-store";
import { CheckIcon, ChevronDownIcon, PlusIcon, TrashIcon } from "../../ui/icons";
import { Button, IconButton } from "../../ui/controls";

type Kind = "toggle" | "select" | "text";

function Picker<T extends string>({ label, value, onChange, items }: { label: string; value: T; onChange: (value: T) => void; items: [T, string][] }) {
  return <Select selectedKey={value} onSelectionChange={(key) => onChange(key as T)}>
    <Label>{label}</Label>
    <AriaButton className="select-trigger"><SelectValue /><ChevronDownIcon size={14} /></AriaButton>
    <Popover className="wb-popover"><ListBox>{items.map(([id, text]) => <ListBoxItem key={id} id={id}>{text}</ListBoxItem>)}</ListBox></Popover>
  </Select>;
}

function InstructionForm({ stored, workspaceId, onSave }: { stored?: StoredPromptOption; workspaceId: string; onSave: (stored: StoredPromptOption) => void }) {
  const option = stored?.option;
  const [kind, setKind] = useState<Kind>(option?.kind === "multiSelect" ? "select" : option?.kind ?? "toggle");
  const [label, setLabel] = useState(option?.label ?? "");
  const [category, setCategory] = useState(option?.category ?? "Custom");
  const [description, setDescription] = useState(option?.description ?? "");
  const [text, setText] = useState(option?.kind === "toggle" ? option.text : option?.kind === "text" ? option.template : "");
  const [defaultOn, setDefaultOn] = useState(option?.kind === "toggle" ? option.defaultOn : false);
  const [choices, setChoices] = useState<PromptOptionChoice[]>(option?.kind === "select" ? option.choices : [choice("none", "None"), choice(createId("choice"), "")]);
  const [defaultChoice, setDefaultChoice] = useState(option?.kind === "select" ? option.defaultChoice : "none");
  const [display, setDisplay] = useState<"segmented" | "dropdown" | "list">(option?.display ?? "segmented");
  const [placeholder, setPlaceholder] = useState(option?.kind === "text" ? option.placeholder : "");
  const [resetAfterSend, setResetAfterSend] = useState(option?.resetAfterSend ?? false);
  const [scope, setScope] = useState<"global" | "workspace">(stored?.scope ?? "workspace");
  const [error, setError] = useState("");

  const build = (): PromptOptionDefinition | string => {
    const id = option?.id ?? createId("instruction");
    const fields = { label: label.trim(), category: category.trim() || undefined, description: description.trim() || undefined, resetAfterSend };
    if (!fields.label) return "Give the option a label.";
    if (kind === "toggle") return text.trim() ? toggle(id, { ...fields, text: text.trim(), defaultOn }) : "Add the text this option appends.";
    if (kind === "text") return text.includes("{{value}}") ? textInput(id, { ...fields, template: text.trim(), placeholder }) : "The template must include {{value}}.";
    const named = choices.filter((item) => item.label.trim()).map((item) => ({ ...item, label: item.label.trim(), text: item.text.trim() }));
    if (named.length < 2) return "Add at least two named choices.";
    return select(id, { ...fields, display, choices: named, default: named.some((item) => item.id === defaultChoice) ? defaultChoice : named[0].id });
  };

  return <form className="persona-form instruction-form" onSubmit={(event) => {
    event.preventDefault();
    const built = build();
    if (typeof built === "string") { setError(built); return; }
    setError("");
    onSave({ scope, workspaceId: scope === "workspace" ? workspaceId : undefined, option: built });
  }}>
    <div className="form-row">
      <Picker label="Kind" value={kind} onChange={setKind} items={[["toggle", "Toggle"], ["select", "Choice"], ["text", "Text input"]]} />
      <Picker label="Scope" value={scope} onChange={setScope} items={[["workspace", "This workspace"], ["global", "All workspaces"]]} />
    </div>
    <div className="form-row">
      <TextField value={label} onChange={setLabel} isRequired><Label>Label</Label><Input placeholder="e.g. Update the changelog" autoFocus /></TextField>
      <TextField value={category} onChange={setCategory}><Label>Category</Label><Input placeholder="Shown as a heading" /></TextField>
    </div>
    <TextField value={description} onChange={setDescription}><Label>Description</Label><Input placeholder="Optional hint shown under the label" /></TextField>
    {kind === "toggle" && <>
      <TextField value={text} onChange={setText} isRequired><Label>Appended text</Label><TextArea rows={4} placeholder="Also update CHANGELOG.md with a short entry." /></TextField>
      <Checkbox className="wb-checkbox" isSelected={defaultOn} onChange={setDefaultOn}><span className="checkbox-box"><CheckIcon size={11} /></span><span>On by default</span></Checkbox>
    </>}
    {kind === "text" && <>
      <TextField value={text} onChange={setText} isRequired><Label>Template</Label><TextArea rows={3} placeholder="Request review from {{value}}." /></TextField>
      <TextField value={placeholder} onChange={setPlaceholder}><Label>Placeholder</Label><Input /></TextField>
    </>}
    {kind === "select" && <fieldset className="choice-editor">
      <legend>Choices</legend>
      {choices.map((item, index) => <div className="choice-row" key={item.id}>
        <TextField aria-label={`Choice ${index + 1} label`} value={item.label} onChange={(value) => setChoices(choices.map((c) => c.id === item.id ? { ...c, label: value } : c))}><Input placeholder="Label" /></TextField>
        <TextField aria-label={`Choice ${index + 1} text`} value={item.text} onChange={(value) => setChoices(choices.map((c) => c.id === item.id ? { ...c, text: value } : c))}><Input placeholder="Appended text (empty adds nothing)" /></TextField>
        <IconButton label={`Remove choice ${index + 1}`} onPress={() => setChoices(choices.filter((c) => c.id !== item.id))}><TrashIcon size={13} /></IconButton>
      </div>)}
      <Button onPress={() => setChoices([...choices, choice(createId("choice"), "")])}><PlusIcon size={13} />Add choice</Button>
      <div className="form-row">
        <Picker label="Default" value={defaultChoice} onChange={setDefaultChoice} items={choices.filter((c) => c.label.trim()).map((c) => [c.id, c.label])} />
        <Picker label="Display" value={display} onChange={setDisplay} items={[["segmented", "Segmented"], ["dropdown", "Dropdown"], ["list", "List"]]} />
      </div>
    </fieldset>}
    <Checkbox className="wb-checkbox" isSelected={resetAfterSend} onChange={setResetAfterSend}><span className="checkbox-box"><CheckIcon size={11} /></span><span>Reset after each send</span></Checkbox>
    {error && <p role="alert" className="agent-error">{error}</p>}
    <Button type="submit" className="primary-button">Save option</Button>
  </form>;
}

export function InstructionsManager({ workspaceId }: { workspaceId: string }) {
  const all = useWorkbenchStore((state) => state.instructionOptions);
  const upsert = useWorkbenchStore((state) => state.upsertInstructionOption);
  const remove = useWorkbenchStore((state) => state.deleteInstructionOption);
  const options = all.filter((stored) => stored.scope === "global" || stored.workspaceId === workspaceId);
  const [editingId, setEditingId] = useState<string>(options[0]?.option.id ?? "new");
  const editing = options.find((stored) => stored.option.id === editingId);

  return <div className="persona-manager">
    <div className="persona-list-pane">
      <div className="dialog-section-header">
        <span>Your options</span>
        <IconButton label="Create option" onPress={() => setEditingId("new")}><PlusIcon size={15} /></IconButton>
      </div>
      <ListBox className="persona-list" aria-label="Your options" items={options.map((stored) => ({ ...stored, id: stored.option.id }))} selectionMode="single" disallowEmptySelection
        selectedKeys={editing ? [editing.option.id] : []} onSelectionChange={(keys) => { if (keys !== "all" && keys.size) setEditingId(String([...keys][0])); }}
        renderEmptyState={() => <p className="empty-copy">Built-in options are always available. Options you create appear here.</p>}>
        {(stored) => <ListBoxItem className="persona-list-item" id={stored.id} textValue={stored.option.label}>
          <span>{stored.option.label}</span><small>{stored.option.category ?? "Uncategorized"} · {stored.scope === "global" ? "Global" : "Workspace"}</small>
        </ListBoxItem>}
      </ListBox>
    </div>
    <div className="persona-editor-pane">
      <div className="dialog-section-header">
        <span>{editing ? "Edit option" : "Create option"}</span>
        {editing && <IconButton label="Delete option" onPress={() => { remove(editing.option.id); setEditingId("new"); }}><TrashIcon size={15} /></IconButton>}
      </div>
      <InstructionForm key={editing?.option.id ?? "new"} stored={editing} workspaceId={workspaceId} onSave={(stored) => { upsert(stored); setEditingId(stored.option.id); }} />
    </div>
  </div>;
}
