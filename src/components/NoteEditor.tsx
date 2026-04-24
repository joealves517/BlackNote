import { useEffect, useRef, useState, useCallback } from "react";
import {
  EditorRoot,
  EditorContent,
  EditorBubbleItem,
  EditorCommand,
  EditorCommandItem,
  EditorCommandEmpty,
  EditorCommandList,
  StarterKit,
  TaskList,
  TaskItem,
  TiptapUnderline,
  TiptapLink,
  TextStyle,
  Color,
  Placeholder,
  HorizontalRule,
  CharacterCount,
  Command,
  AIHighlight,
  createSuggestionItems,
  handleCommandNavigation,
  renderItems,
  UpdatedImage,
  handleImagePaste,
  handleImageDrop,
  UploadImagesPlugin,
  type JSONContent,
  type SuggestionItem,
} from "novel";
import { Extension } from "@tiptap/core";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Minus,
  CodeSquare,
  Plus,
  Pilcrow,
  Image as ImageIcon,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { GenerativeMenuSwitch } from "@/components/generative/GenerativeMenuSwitch";
import type { Note } from "@/hooks/use-notes";

interface NoteEditorProps {
  note: Note | null;
  theme: "light" | "dark";
  onContentChange: (noteId: string, content: string) => void;
  onTitleChange: (noteId: string, title: string) => void;
  onCreateNote: () => void;
}

// Slash command suggestions — block types only, AI moved to bubble menu
const suggestionItems = createSuggestionItems([
  {
    title: "Text",
    description: "Plain text block",
    searchTerms: ["paragraph", "p", "text"],
    icon: <Pilcrow className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode("paragraph").run();
    },
  },
  {
    title: "Heading 1",
    description: "Large heading",
    searchTerms: ["title", "h1", "heading"],
    icon: <Heading1 className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run();
    },
  },
  {
    title: "Heading 2",
    description: "Medium heading",
    searchTerms: ["subtitle", "h2"],
    icon: <Heading2 className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run();
    },
  },
  {
    title: "Heading 3",
    description: "Small heading",
    searchTerms: ["h3"],
    icon: <Heading3 className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run();
    },
  },
  {
    title: "Bullet List",
    description: "Unordered list",
    searchTerms: ["bullet", "unordered", "ul"],
    icon: <List className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    title: "Numbered List",
    description: "Ordered list",
    searchTerms: ["ordered", "ol", "number"],
    icon: <ListOrdered className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    title: "To-do List",
    description: "Track tasks with checkboxes",
    searchTerms: ["todo", "task", "checkbox"],
    icon: <CheckSquare className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run();
    },
  },
  {
    title: "Quote",
    description: "Block quote",
    searchTerms: ["blockquote", "quote"],
    icon: <Quote className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run();
    },
  },
  {
    title: "Code Block",
    description: "Capture a code snippet.",
    searchTerms: ["codeblock"],
    icon: <CodeSquare size={18} />,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    title: "Image",
    description: "Upload an image from your computer.",
    searchTerms: ["image", "picture", "photo"],
    icon: <ImageIcon size={18} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = async () => {
        if (input.files?.length) {
          const file = input.files[0];
          const url = await uploadFn(file);
          editor.chain().focus().setImage({ src: url }).run();
        }
      };
      input.click();
    },
  },
  {
    title: "Divider",
    description: "Horizontal separator",
    searchTerms: ["hr", "divider", "separator", "line"],
    icon: <Minus className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
    },
  },
  {
    title: "Clip Page",
    description: "Clip current page as Markdown",
    searchTerms: ["clip", "web", "page", "capture", "save"],
    icon: <Globe className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      window.dispatchEvent(new CustomEvent("open-web-clipper"));
    },
  },
]);

const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 1000;
        const MAX_HEIGHT = 1000;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/webp", 0.75));
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
};

const uploadFn = async (file: File): Promise<string> => {
  return compressImage(file);
};

// All extensions
const extensions = [
  StarterKit.configure({
    horizontalRule: false,
    codeBlock: {
      HTMLAttributes: { class: "novel-code-block" },
    },
  }),
  HorizontalRule,
  TaskList,
  TaskItem.configure({ nested: true }),
  TiptapUnderline,
  TiptapLink.configure({
    openOnClick: false,
    autolink: true,
    HTMLAttributes: { class: "novel-link" },
  }),
  TextStyle,
  Color,
  Placeholder.configure({
    placeholder: "Type '/' for commands...",
  }),
  CharacterCount,
  AIHighlight,
  Command.configure({
    suggestion: {
      items: () => suggestionItems,
      render: renderItems,
    },
  }),
  UpdatedImage.configure({
    HTMLAttributes: {
      class: "rounded-lg border max-w-full my-4",
    },
  }),
  Extension.create({
    name: "imageUpload",
    addProseMirrorPlugins() {
      return [UploadImagesPlugin({ imageClass: "opacity-40 rounded-lg border max-w-full my-4" })];
    },
  }),
  // Open links in new Chrome tab (extension side panel can't navigate directly)
  Extension.create({
    name: "linkClickHandler",
    addGlobalAttributes() {
      return [];
    },
    onCreate() {
      const editorEl = this.editor.view.dom;
      editorEl.addEventListener("click", (event: Event) => {
        const e = event as MouseEvent;
        const target = e.target as HTMLElement;
        const link = target.closest("a");
        if (link?.href) {
          e.preventDefault();
          e.stopPropagation();
          if (typeof chrome !== "undefined" && chrome.tabs) {
            chrome.tabs.create({ url: link.href });
          } else {
            window.open(link.href, "_blank");
          }
        }
      });
    },
  }),
];

export function NoteEditor({
  note,
  theme,
  onContentChange,
  onTitleChange,
  onCreateNote,
}: NoteEditorProps) {
  const [titleValue, setTitleValue] = useState(note?.title ?? "");
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editorKey, setEditorKey] = useState(note?.id ?? "empty");
  const titleRef = useRef<HTMLTextAreaElement>(null);

  const autoResizeTitle = useCallback(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, []);

  const getInitialContent = useCallback((): JSONContent | undefined => {
    if (!note?.content) return undefined;
    try {
      const parsed = JSON.parse(note.content);
      if (parsed && parsed.type === "doc") return parsed;
      return undefined;
    } catch {
      return undefined;
    }
  }, [note?.content]);

  useEffect(() => {
    if (note) {
      setTitleValue(note.title);
      setEditorKey(note.id);
      requestAnimationFrame(autoResizeTitle);
    }
  }, [note?.id, autoResizeTitle]);

  const handleTitleChange = (value: string) => {
    setTitleValue(value);
    if (!note) return;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      onTitleChange(note.id, value);
    }, 300);
  };

  if (!note) {
    return (
      <div
        className="flex-1"
        style={{ backgroundColor: "hsl(var(--background))" }}
      />
    );
  }

  return (
    <div
      className="flex-1 flex flex-col h-full overflow-hidden"
      style={{ backgroundColor: "hsl(var(--background))" }}
    >
      {/* Title — auto-growing textarea */}
      <div className="blacknote-title-area">
        <textarea
          ref={titleRef}
          value={titleValue}
          onChange={(e) => {
            handleTitleChange(e.target.value);
            autoResizeTitle();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
            }
          }}
          placeholder="Untitled"
          rows={1}
          className="blacknote-title-input"
          style={{ color: "hsl(var(--foreground))" }}
        />
      </div>

      {/* Novel Editor */}
      <div className="flex-1 overflow-y-auto novel-wrapper">
        <EditorRoot>
          <EditorContent
            key={editorKey}
            className="novel-editor"
            initialContent={getInitialContent()}
            extensions={extensions}
            editorProps={{
              handleDOMEvents: {
                keydown: (_view, event) => handleCommandNavigation(event),
              },
              handlePaste: (view, event) => handleImagePaste(view, event, uploadFn),
              handleDrop: (view, event, _slice, moved) => handleImageDrop(view, event, moved, uploadFn),
            }}
            onUpdate={({ editor }) => {
              if (!note) return;
              const json = editor.getJSON();
              onContentChange(note.id, JSON.stringify(json));
            }}
            immediatelyRender={false}
          >
            {/* Generative Menu — toggles between formatting + AI */}
            <GenerativeMenuSwitch>
              <EditorBubbleItem
                onSelect={(editor) => editor.chain().focus().toggleBold().run()}
              >
                <Bold className="h-3.5 w-3.5" />
              </EditorBubbleItem>
              <EditorBubbleItem
                onSelect={(editor) => editor.chain().focus().toggleItalic().run()}
              >
                <Italic className="h-3.5 w-3.5" />
              </EditorBubbleItem>
              <EditorBubbleItem
                onSelect={(editor) => editor.chain().focus().toggleUnderline().run()}
              >
                <Underline className="h-3.5 w-3.5" />
              </EditorBubbleItem>
              <EditorBubbleItem
                onSelect={(editor) => editor.chain().focus().toggleStrike().run()}
              >
                <Strikethrough className="h-3.5 w-3.5" />
              </EditorBubbleItem>
              <EditorBubbleItem
                onSelect={(editor) => editor.chain().focus().toggleCode().run()}
              >
                <Code className="h-3.5 w-3.5" />
              </EditorBubbleItem>
            </GenerativeMenuSwitch>

            {/* Slash Command */}
            <EditorCommand className="novel-slash-menu">
              <EditorCommandEmpty>No results</EditorCommandEmpty>
              <EditorCommandList>
                {suggestionItems.map((item: SuggestionItem) => (
                  <EditorCommandItem
                    key={item.title}
                    value={item.title}
                    onCommand={(val) => item.command?.(val)}
                    className="novel-slash-item"
                  >
                    <div className="novel-slash-icon">{item.icon}</div>
                    <div>
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                        {item.description}
                      </p>
                    </div>
                  </EditorCommandItem>
                ))}
              </EditorCommandList>
            </EditorCommand>
          </EditorContent>
        </EditorRoot>
      </div>
    </div>
  );
}
