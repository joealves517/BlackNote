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
  { value: "improve", label: "Improve writing", description: "Rewrite to enhance flow and clarity", icon: RefreshCCWDotIcon, colorRgb: "59, 130, 246" },
  { value: "fix", label: "Fix grammar", description: "Correct spelling and grammar errors", icon: CheckCheckIcon, colorRgb: "16, 185, 129" },
  { value: "shorter", label: "Make shorter", description: "Condense and summarize", icon: AlignCenterIcon, colorRgb: "245, 158, 11" },
  { value: "longer", label: "Make longer", description: "Expand and add more details", icon: AlignLeftIcon, colorRgb: "168, 85, 247" },
  { value: "translate", label: "Translate", description: "Translate text between languages", icon: LanguagesIcon, colorRgb: "236, 72, 153" },
  { value: "todo", label: "To-do list", description: "Extract tasks and action items", icon: CircleCheckIcon, colorRgb: "99, 102, 241" },
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
            <div className="novel-slash-icon" style={{
              background: `linear-gradient(135deg, rgba(${option.colorRgb}, var(--icon-bg-start)) 0%, rgba(${option.colorRgb}, var(--icon-bg-end)) 100%)`,
              border: `1px solid rgba(${option.colorRgb}, var(--icon-border))`,
              color: `rgba(${option.colorRgb}, 1)`,
            }}>
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
          <div className="novel-slash-icon" style={{
            background: "linear-gradient(135deg, rgba(148, 163, 184, var(--icon-bg-start)) 0%, rgba(148, 163, 184, var(--icon-bg-end)) 100%)",
            border: "1px solid rgba(148, 163, 184, var(--icon-border))",
            color: "rgba(148, 163, 184, 1)",
          }}>
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
