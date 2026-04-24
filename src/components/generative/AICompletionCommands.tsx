import { Check, TextQuote, Trash2 } from "lucide-react";
import { useEditor } from "novel";
import { markdownToProsemirror } from "@/lib/markdown-to-prosemirror";

interface AICompletionCommandsProps {
  completion: string;
  onDiscard: () => void;
}

export function AICompletionCommands({
  completion,
  onDiscard,
}: AICompletionCommandsProps) {
  const { editor } = useEditor();

  const parseMarkdown = (md: string) => {
    try {
      const jsonStr = markdownToProsemirror(md);
      const json = JSON.parse(jsonStr);
      return json.content || md;
    } catch (err) {
      console.error(err);
      return md;
    }
  };

  return (
    <div className="ai-cmd-groups">
      <div className="ai-cmd-group">
        <button
          className="ai-cmd-item"
          onClick={() => {
            if (!editor) return;
            const selection = editor.view.state.selection;
            editor
              .chain()
              .focus()
              .insertContentAt(
                { from: selection.from, to: selection.to },
                parseMarkdown(completion)
              )
              .run();
          }}
        >
          <Check className="ai-cmd-icon" />
          Replace selection
        </button>
        <button
          className="ai-cmd-item"
          onClick={() => {
            if (!editor) return;
            const selection = editor.view.state.selection;
            editor
              .chain()
              .focus()
              .insertContentAt(selection.to + 1, parseMarkdown(completion))
              .run();
          }}
        >
          <TextQuote className="ai-cmd-icon" />
          Insert below
        </button>
        <button className="ai-cmd-item ai-cmd-discard" onClick={onDiscard}>
          <Trash2 className="ai-cmd-icon" />
          Discard
        </button>
      </div>
    </div>
  );
}
