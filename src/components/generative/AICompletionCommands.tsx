import { Check, TextQuote, Trash2 } from "lucide-react";
import { useEditor } from "novel";

interface AICompletionCommandsProps {
  completion: string;
  onDiscard: () => void;
}

export function AICompletionCommands({
  completion,
  onDiscard,
}: AICompletionCommandsProps) {
  const { editor } = useEditor();

  // Convert markdown string to ProseMirror-compatible content
  const parseMarkdown = (md: string) => {
    if (!editor) return md;
    try {
      const parser = editor.storage.markdown?.parser;
      if (parser) {
        const parsed = parser.parse(md);
        return parsed.content.toJSON() || md;
      }
    } catch {
      // Fallback to raw string if parser unavailable
    }
    return md;
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
