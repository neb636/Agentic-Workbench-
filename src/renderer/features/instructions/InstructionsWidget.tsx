import { useMemo } from "react";
import { Checkbox, TextArea } from "react-aria-components";
import type { WidgetProps } from "../../core/widget-registry";
import { useWorkbenchStore } from "../../state/workbench-store";
import { PlusIcon, SlidersIcon, TrashIcon } from "../../ui/icons";
import { IconButton } from "../../ui/controls";

export function InstructionsWidget({ workspaceId }: WidgetProps) {
  const allInstructions = useWorkbenchStore((state) => state.appendedInstructions);
  const instructions = useMemo(
    () => allInstructions.filter((item) => item.workspaceId === workspaceId),
    [allInstructions, workspaceId],
  );
  const addInstruction = useWorkbenchStore((state) => state.addInstruction);
  const updateInstruction = useWorkbenchStore((state) => state.updateInstruction);
  const deleteInstruction = useWorkbenchStore((state) => state.deleteInstruction);

  return (
    <div className="support-card">
      <div className="support-card-header">
        <div><SlidersIcon size={15} /><span>Appended instructions</span></div>
        <IconButton label="Add instruction" onPress={() => addInstruction(workspaceId)}><PlusIcon size={15} /></IconButton>
      </div>
      {instructions.length === 0 ? (
        <button className="instruction-empty" onClick={() => addInstruction(workspaceId)}><PlusIcon size={14} /> Add workspace instructions</button>
      ) : (
        <div className="instruction-list">
          {instructions.map((instruction, index) => (
            <div className={`instruction-item ${instruction.enabled ? "" : "is-disabled"}`} key={instruction.id}>
              <div className="instruction-item-toolbar">
                <Checkbox isSelected={instruction.enabled} onChange={(enabled) => updateInstruction(instruction.id, { enabled })} className="wb-checkbox">
                  <span className="checkbox-box">✓</span><span>Instruction {index + 1}</span>
                </Checkbox>
                <IconButton label="Delete instruction" onPress={() => deleteInstruction(instruction.id)}><TrashIcon size={13} /></IconButton>
              </div>
              <TextArea
                aria-label={`Instruction ${index + 1}`}
                placeholder="Always run tests before finishing…"
                value={instruction.content}
                onChange={(event) => updateInstruction(instruction.id, { content: event.currentTarget.value })}
                rows={3}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
