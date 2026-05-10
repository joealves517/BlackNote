import { AlignCenterIcon } from "@/components/icons/align-center";
import { AlignLeftIcon } from "@/components/icons/align-left";
import { ChevronRightIcon } from "@/components/icons/chevron-right";
import { RefreshCCWDotIcon } from "@/components/icons/refresh-ccw-dot";
import { CheckCheckIcon } from "@/components/icons/check-check";
import { LanguagesIcon } from "@/components/icons/languages";
import { CircleCheckIcon } from "@/components/icons/circle-check";
import { getPrevText, useEditor } from "novel";

import { AnimatedIcon } from "@/components/icons/AnimatedIcon";

interface AISelectorCommandsProps {
  onSelect: (option: string, overrideText?: string) => void;
}

const editOptions = [
  { value: "improve", label: "Improve writing", description: "Rewrite to enhance flow and clarity", icon: RefreshCCWDotIcon },
  { value: "fix", label: "Fix grammar", description: "Correct spelling and grammar errors", icon: CheckCheckIcon },
  { value: "shorter", label: "Make shorter", description: "Condense and summarize", icon: AlignCenterIcon },
  { value: "longer", label: "Make longer", description: "Expand and add more details", icon: AlignLeftIcon },
  { value: "translate", label: "Translate", description: "Translate text between languages", icon: LanguagesIcon },
  { value: "todo", label: "To-do list", description: "Extract tasks and action items", icon: CircleCheckIcon },
];

export function AISelectorCommands({ onSelect }: AISelectorCommandsProps) {
  const { editor } = useEditor();

  return (
    <div className="ai-cmd-groups">
      <div className="ai-cmd-group">
        {editOptions.map((option) => (
          <button
            key={option.value}
            className="novel-slash-item w-full text-left"
            onClick={() => onSelect(option.value)}
          >
            <div className="novel-slash-icon">
              <AnimatedIcon animation="hover">
                <option.icon className="h-4 w-4" />
              </AnimatedIcon>
            </div>
            <div>
              <p className="text-[13px] font-medium">{option.label}</p>
              <p className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                {option.description}
              </p>
            </div>
          </button>
        ))}
        <button
          className="novel-slash-item w-full text-left"
          onClick={() => {
            if (!editor) return;
            const pos = editor.state.selection.from;
            const text = getPrevText(editor, pos);
            onSelect("continue", text);
          }}
        >
          <div className="novel-slash-icon">
            <ChevronRightIcon className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[13px] font-medium">Continue writing</p>
            <p className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
              AI continues from cursor position
            </p>
          </div>
        </button>
      </div>
    </div>
  );
}
