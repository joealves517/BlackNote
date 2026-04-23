import {
  ArrowDownWideNarrow,
  CheckCheck,
  RefreshCcwDot,
  StepForward,
  WrapText,
  Languages,
} from "lucide-react";
import { getPrevText, useEditor } from "novel";

interface AISelectorCommandsProps {
  onSelect: (value: string, option: string) => void;
}

const editOptions = [
  { value: "improve", label: "Improve writing", description: "Rewrite to enhance flow and clarity", icon: RefreshCcwDot },
  { value: "fix", label: "Fix grammar", description: "Correct spelling and grammar errors", icon: CheckCheck },
  { value: "shorter", label: "Make shorter", description: "Condense and summarize", icon: ArrowDownWideNarrow },
  { value: "longer", label: "Make longer", description: "Expand and add more details", icon: WrapText },
  { value: "translate", label: "Translate", description: "Translate text between languages", icon: Languages },
];

export function AISelectorCommands({ onSelect }: AISelectorCommandsProps) {
  const { editor } = useEditor();

  const getSelectedText = (): string => {
    if (!editor) return "";
    const slice = editor.state.selection.content();
    return (
      editor.storage.markdown?.serializer?.serialize(slice.content) ||
      slice.content.textBetween(0, slice.content.size, "\n")
    );
  };

  return (
    <div className="ai-cmd-groups">
      <div className="ai-cmd-group">
        {editOptions.map((option) => (
          <button
            key={option.value}
            className="novel-slash-item w-full text-left"
            onClick={() => onSelect(getSelectedText(), option.value)}
          >
            <div className="novel-slash-icon">
              <option.icon className="h-4 w-4" strokeWidth={2} />
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
            onSelect(text, "continue");
          }}
        >
          <div className="novel-slash-icon">
            <StepForward className="h-4 w-4" strokeWidth={2} />
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
