import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewProps } from "@tiptap/react";
import { Globe, ExternalLink, Trash2 } from "lucide-react";
import { db } from "@/lib/local-db";
import { useState, useEffect } from "react";

function WebClipNodeView({ node, deleteNode }: NodeViewProps) {
  const { clipId, title, url } = node.attrs as {
    clipId: string;
    title: string;
    url: string;
    createdAt: number;
  };
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!deleteConfirm) return;
    const timer = setTimeout(() => setDeleteConfirm(false), 3000);
    return () => clearTimeout(timer);
  }, [deleteConfirm]);

  let hostname = "";
  try {
    hostname = new URL(url).hostname;
  } catch (e) {
    hostname = url;
  }

  const handleOpenOffline = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!clipId) return;

    window.dispatchEvent(new CustomEvent("open-web-clip-sheet", {
      detail: { clipId }
    }));
  };

  const handleOpenOriginal = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    chrome.runtime.sendMessage({
      type: "OPEN_URL",
      url
    });
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (deleteConfirm) {
      if (clipId) {
        db.web_clips.delete(clipId).catch(console.error);
      }
      deleteNode();
    } else {
      setDeleteConfirm(true);
    }
  };

  return (
    <NodeViewWrapper className="webclip-node-wrapper" data-type="webClipNode">
      <div 
        className="relative flex items-center justify-between p-4 my-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/50 backdrop-blur-md group hover:border-primary/40 dark:hover:border-primary/40 transition-all duration-200 cursor-pointer shadow-sm"
        onClick={handleOpenOffline}
      >
        <div className="flex items-center gap-3.5 min-w-0 flex-1">
          {/* Favicon / Globe icon container */}
          <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center border border-zinc-200/20 shadow-inner flex-shrink-0">
            {url ? (
              <img
                src={`https://www.google.com/s2/favicons?domain=${hostname}&sz=64`}
                alt=""
                className="w-5.5 h-5.5 rounded-[4px] object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                  const sib = (e.target as HTMLElement).nextElementSibling as HTMLElement;
                  if (sib) sib.style.display = "block";
                }}
              />
            ) : null}
            <Globe className="w-5 h-5 text-muted-foreground hidden" />
          </div>

          {/* Title and metadata */}
          <div className="min-w-0 flex-1">
            <h4 className="text-[13px] font-semibold text-foreground truncate group-hover:text-primary transition-colors duration-150">
              {title || "Untitled Web Clip"}
            </h4>
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate flex items-center gap-1.5">
              <span>{hostname}</span>
            </p>
          </div>
        </div>

        {/* Buttons / Actions */}
        <div className="flex items-center gap-2 ml-4 flex-shrink-0">
          <button
            onClick={handleOpenOriginal}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            data-tooltip="Open original website"
            type="button"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
          
          <button
            onClick={handleDelete}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
              deleteConfirm
                ? "text-red-500 bg-red-500/10 border border-red-500/20 opacity-100"
                : "text-zinc-500 hover:text-destructive hover:bg-zinc-100 dark:hover:bg-zinc-800 opacity-0 group-hover:opacity-100"
            }`}
            data-tooltip={deleteConfirm ? "Click again to confirm delete" : "Delete clip"}
            type="button"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </NodeViewWrapper>
  );
}

export const WebClipNode = Node.create({
  name: "webClipNode",
  group: "block",
  atom: true,
  draggable: true,

  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const { selection } = editor.state;
        if (editor.isActive(this.name)) return true;
        if (selection.empty && selection.$anchor.nodeBefore?.type.name === this.name) return true;
        return false;
      },
      Delete: ({ editor }) => {
        const { selection } = editor.state;
        if (editor.isActive(this.name)) return true;
        if (selection.empty && selection.$anchor.nodeAfter?.type.name === this.name) return true;
        return false;
      },
    };
  },

  addAttributes() {
    return {
      clipId: { default: null },
      title: { default: "Untitled Web Clip" },
      url: { default: "" },
      createdAt: { default: 0 },
      s3Url: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="webClipNode"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "webClipNode",
        style: "padding: 12px; border: 1px solid #ccc; border-radius: 8px; margin: 10px 0; background: #fafafa;"
      }),
      "🌐 Web Clip (HTML snapshot)"
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(WebClipNodeView);
  },
});
