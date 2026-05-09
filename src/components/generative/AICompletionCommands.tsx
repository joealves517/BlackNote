import { MessageSquareIcon } from "@/components/icons/message-square";
import { DeleteIcon } from "@/components/icons/delete";
import { CheckIcon } from "@/components/icons/check";
import { useEditor } from "novel";
import { markdownToProsemirror } from "@/lib/markdown-to-prosemirror";

import { AnimatedIcon } from "@/components/icons/AnimatedIcon";

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
      const cleanMd = md.trim();
      const jsonStr = markdownToProsemirror(cleanMd);
      const json = JSON.parse(jsonStr);
      return json.content || cleanMd;
    } catch (err) {
      console.error(err);
      return md.trim();
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
            onDiscard();
          }}
        >
          <CheckIcon className="ai-cmd-icon" />
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
              .insertContentAt(selection.to, parseMarkdown(completion))
              .run();
            onDiscard();
          }}
        >
          <MessageSquareIcon className="ai-cmd-icon" />
          Insert below
        </button>
        <button className="ai-cmd-item ai-cmd-discard" onClick={onDiscard}>
          <DeleteIcon className="ai-cmd-icon" />
          Discard
        </button>
      </div>
    </div>
  );
}
