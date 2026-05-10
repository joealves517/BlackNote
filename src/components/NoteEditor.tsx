import { DeleteIcon } from "@/components/icons/delete";
import { TerminalIcon } from "@/components/icons/terminal";
import { BookTextIcon } from "@/components/icons/book-text";
import { AlignLeftIcon } from "@/components/icons/align-left";
import { CircleCheckIcon } from "@/components/icons/circle-check";
import { MessageSquareIcon } from "@/components/icons/message-square";
import { FrameIcon } from "@/components/icons/frame";
import { AudioNode } from "@/extensions/AudioNode";
import { VideoNode } from "@/extensions/VideoNode";
import { AudioLinesIcon } from "@/components/icons/audio-lines";
import { MicIcon } from "@/components/icons/mic";
import { VideoIcon } from "@/components/icons/video";
import { Minus, Strikethrough } from "lucide-react";

import { BoldIcon } from "@/components/icons/bold";
import { ItalicIcon } from "@/components/icons/italic";
import { UnderlineIcon } from "@/components/icons/underline";
import { PlusIcon } from "@/components/icons/plus";
import { SparklesIcon } from "@/components/icons/sparkles";
import { AnimatedIcon } from "@/components/icons/AnimatedIcon";
import { AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
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
  useEditor,
  type JSONContent,
  type SuggestionItem,
} from "novel";
import { ImportExportSheetBridge } from "@/components/ImportExportSheet";
import { Extension } from "@tiptap/core";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";

import { Button } from "@/components/ui/button";
import { GenerativeMenuSwitch } from "@/components/generative/GenerativeMenuSwitch";
import { AISelector } from "@/components/generative/AISelector";
import { NoteChatSheet } from "@/components/generative/NoteChatSheet";
import TurndownService from "turndown";
import { MediaAIResultSheet } from "@/components/generative/MediaAIResultSheet";
import { getAuthToken } from "@/lib/auth-client";
import { AI_API_BASE } from "@/lib/constants";
import { markdownToProsemirror } from "@/lib/markdown-to-prosemirror";
import type { Note } from "@/hooks/use-notes";
import { useSpeech } from "@/hooks/use-speech";

/**
 * Bridge: listens for content insertion events.
 * - 'insert-ai-content': inserts at end of doc
 * - 'media-ai-result': opens MediaAIResultSheet for review/insert
 */
function AIContentInsertBridge() {
  const { editor } = useEditor();
  const [mediaResult, setMediaResult] = useState<{ text: string; mediaId: string } | null>(null);

  useEffect(() => {
    const handleInsert = (e: Event) => {
      const text = (e as CustomEvent).detail?.text;
      if (!editor || !text) return;
      try {
        const jsonStr = markdownToProsemirror(text);
        const json = JSON.parse(jsonStr);
        const parsed = json.content || text;
        editor.chain().focus().insertContentAt(editor.state.doc.content.size, parsed).run();
      } catch {
        editor.chain().focus().insertContentAt(editor.state.doc.content.size, text).run();
      }
    };

    const handleMediaResult = (e: Event) => {
      const { text, mediaId } = (e as CustomEvent).detail || {};
      if (!text || !mediaId) return;
      setMediaResult({ text, mediaId });
    };

    window.addEventListener("insert-ai-content", handleInsert);
    window.addEventListener("media-ai-result", handleMediaResult);
    return () => {
      window.removeEventListener("insert-ai-content", handleInsert);
      window.removeEventListener("media-ai-result", handleMediaResult);
    };
  }, [editor]);

  return (
    <>
      {mediaResult && (
        <MediaAIResultSheet
          completion={mediaResult.text}
          mediaId={mediaResult.mediaId}
          onClose={() => setMediaResult(null)}
        />
      )}
    </>
  );
}


/**
 * Lightweight bridge: listens for 'open-ai-sheet' event
 * and renders AISelector inside EditorContent context.
 */
function AISheetTrigger() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const handler = () => setShow(true);
    window.addEventListener("open-ai-sheet", handler);
    return () => window.removeEventListener("open-ai-sheet", handler);
  }, []);

  useEffect(() => {
    if (!show) {
      window.dispatchEvent(new CustomEvent("ai-sheet-closed"));
    }
  }, [show]);

  if (!show) return null;
  return <AISelector open={show} onOpenChange={setShow} />;
}

/**
 * Bridge for NoteChatSheet inside EditorContent so it has useEditor() access.
 */
function ChatSheetBridge({ note, noteTitle, onUpdateNote }: {
  note: Note | null;
  noteTitle: string;
  onUpdateNote?: (noteId: string, updates: Partial<Note>) => void;
}) {
  const [show, setShow] = useState(false);
  const { editor } = useEditor();

  useEffect(() => {
    const handler = () => setShow(true);
    window.addEventListener("open-note-chat", handler);
    return () => window.removeEventListener("open-note-chat", handler);
  }, []);

  if (!show || !note) return null;

  // Convert current editor state to Markdown to preserve formatting in AI context
  let markdownContent = note.content;
  if (editor) {
    const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
    markdownContent = turndown.turndown(editor.getHTML());
  }

  return createPortal(
    <AnimatePresence>
      <NoteChatSheet
        noteId={note.id}
        noteTitle={noteTitle || "Untitled"}
        noteContent={markdownContent}
        initialHistory={note.chatHistory || []}
        onHistoryChange={(newHistory) => {
          if (onUpdateNote) {
            onUpdateNote(note.id, { chatHistory: newHistory });
          }
        }}
        onClose={() => setShow(false)}
      />
    </AnimatePresence>,
    document.body
  );
}

interface NoteEditorProps {
  note: Note | null;
  theme: "light" | "dark";
  onContentChange: (noteId: string, content: string) => void;
  onTitleChange: (noteId: string, title: string) => void;
  onCreateNote: (title: string, content: string) => void;
  onScrollProgress: (progress: number) => void;
  onUpdateNote: (note: Partial<Note>) => void;
  toggleTheme?: () => void;
}

// Slash command suggestions — block types only, AI moved to bubble menu
const suggestionItems = createSuggestionItems([
  {
    title: "Speech to Text",
    description: "Type with your voice",
    searchTerms: ["voice", "dictate", "speech", "mic", "microphone"],
    icon: <MicIcon className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      (window as any).blackNoteSTTEditor = editor;
      window.dispatchEvent(new CustomEvent("start-speech-to-text"));
    },
  },
  {
    title: "Record Audio",
    description: "Record voice memo or audio",
    searchTerms: ["record", "audio", "voice", "memo", "microphone"],
    icon: <AudioLinesIcon className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      window.dispatchEvent(new CustomEvent("start-audio-recording", { detail: { editor } }));
    },
  },
  {
    title: "Record Screen",
    description: "Record screen with audio",
    searchTerms: ["record", "screen", "video", "capture", "screencast"],
    icon: <VideoIcon className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      window.dispatchEvent(new CustomEvent("start-screen-recording", { detail: { editor } }));
    },
  },
  {
    title: "Text",
    description: "Plain text block",
    searchTerms: ["paragraph", "p", "text"],
    icon: <AlignLeftIcon className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().setNode("paragraph").run();
    },
  },
  {
    title: "Heading 1",
    description: "Large heading",
    searchTerms: ["title", "h1", "heading"],
    icon: <BookTextIcon className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run();
    },
  },
  {
    title: "Heading 2",
    description: "Medium heading",
    searchTerms: ["subtitle", "h2"],
    icon: <BookTextIcon className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run();
    },
  },
  {
    title: "Heading 3",
    description: "Small heading",
    searchTerms: ["h3"],
    icon: <BookTextIcon className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run();
    },
  },
  {
    title: "Bullet List",
    description: "Unordered list",
    searchTerms: ["bullet", "unordered", "ul"],
    icon: <AlignLeftIcon className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    title: "Numbered List",
    description: "Ordered list",
    searchTerms: ["ordered", "ol", "number"],
    icon: <AlignLeftIcon className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    title: "To-do List",
    description: "Track tasks with checkboxes",
    searchTerms: ["todo", "task", "checkbox"],
    icon: <CircleCheckIcon className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run();
    },
  },
  {
    title: "Quote",
    description: "Block quote",
    searchTerms: ["blockquote", "quote"],
    icon: <MessageSquareIcon className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run();
    },
  },
  {
    title: "Code Block",
    description: "Capture a code snippet.",
    searchTerms: ["codeblock"],
    icon: <TerminalIcon className="w-[18px] h-[18px]" />,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    title: "Image",
    description: "Upload an image from your computer.",
    searchTerms: ["image", "picture", "photo"],
    icon: <FrameIcon className="w-[18px] h-[18px]" />,
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
    icon: <Minus className="h-4 w-4 hover-zoom-icon" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
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

/**
 * Upload image to S3 via presigned URL from backend.
 * Falls back to base64 data URL if upload fails (offline support).
 */
const uploadFn = async (file: File): Promise<string> => {
  const compressedDataUrl = await compressImage(file);

  try {
    const token = await getAuthToken();
    if (token) {
      // Step 1: Get presigned URL from backend
      const presignRes = await fetch(`${AI_API_BASE}/api/upload/presign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fileName: file.name.replace(/[^a-zA-Z0-9.-]/g, '_') + ".webp",
          contentType: "image/webp",
        }),
      });

      if (!presignRes.ok) {
        console.error("Presign request failed:", presignRes.status);
        return compressedDataUrl;
      }

      const { uploadUrl, publicUrl } = await presignRes.json();

      // Step 2: Upload directly to S3
      const blobRes = await fetch(compressedDataUrl);
      const blob = await blobRes.blob();

      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "image/webp" },
        body: blob,
      });

      if (!uploadRes.ok) {
        console.error("S3 upload failed:", uploadRes.status);
        return compressedDataUrl;
      }

      return publicUrl;
    }
  } catch (err) {
    console.error("Failed to upload image to S3, falling back to local:", err);
  }

  return compressedDataUrl;
};

// All extensions
const extensions = [
  StarterKit.configure({
    horizontalRule: false,
    codeBlock: {
      HTMLAttributes: { class: "novel-code-block" },
    },
  }),
  Table.configure({
    resizable: true,
  }),
  TableRow,
  TableHeader,
  TableCell,
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
  AudioNode,
  VideoNode,
];

export function NoteEditor({
  note,
  theme,
  onContentChange,
  onTitleChange,
  onCreateNote,
  onScrollProgress,
  onUpdateNote,
  toggleTheme,
}: NoteEditorProps) {
  const [titleValue, setTitleValue] = useState(note?.title ?? "");
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editorKey, setEditorKey] = useState(note?.id ?? "empty");
  const titleRef = useRef<HTMLTextAreaElement>(null);
  
  const { startRecording, stopRecording, isRecording } = useSpeech();

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("stt-state-changed", { detail: isRecording }));
  }, [isRecording]);

  useEffect(() => {
    const handleStopSTT = () => stopRecording();
    window.addEventListener("stop-speech-to-text", handleStopSTT);
    return () => window.removeEventListener("stop-speech-to-text", handleStopSTT);
  }, [stopRecording]);

  useEffect(() => {
    let startPos = -1;
    let currentInterimLength = 0;

    const handleStartSTT = () => {
      const editor = (window as any).blackNoteSTTEditor;
      if (editor) {
        startPos = editor.state.selection.from;
      }
      currentInterimLength = 0;

      startRecording((text, isFinal) => {
        const editor = (window as any).blackNoteSTTEditor;
        if (!editor) return;

        // Delete previous interim text
        if (currentInterimLength > 0) {
          editor.chain().deleteRange({ from: startPos, to: startPos + currentInterimLength }).run();
        }

        const textToInsert = text + (isFinal ? " " : "");
        editor.chain().insertContentAt(startPos, textToInsert).run();

        if (isFinal) {
          startPos = startPos + textToInsert.length;
          currentInterimLength = 0;
        } else {
          currentInterimLength = textToInsert.length;
        }
      });
    };
    window.addEventListener("start-speech-to-text", handleStartSTT);
    return () => window.removeEventListener("start-speech-to-text", handleStartSTT);
  }, [startRecording]);

  const autoResizeTitle = useCallback(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, []);

  const getInitialContent = useCallback((): JSONContent | undefined => {
    const emptyDoc = { type: "doc", content: [{ type: "paragraph" }] };
    if (!note?.content) return emptyDoc;
    try {
      const parsed = JSON.parse(note.content);
      if (parsed && parsed.type === "doc") return parsed;
      return emptyDoc;
    } catch {
      return emptyDoc;
    }
  }, [note?.content]);

  useEffect(() => {
    if (note) {
      setTitleValue(note.title);
      setEditorKey(note.id);
    }
  }, [note?.id]);

  useEffect(() => {
    autoResizeTitle();
  }, [titleValue, autoResizeTitle]);

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
      className="flex-1 flex flex-col h-full overflow-hidden relative"
      style={{ backgroundColor: "hsl(var(--background))" }}
    >
      {/* Apple-style Top Fade Overlay */}
      <div 
        className="absolute top-0 left-0 right-0 h-10 z-20 pointer-events-none"
        style={{
          background: "linear-gradient(to bottom, hsl(var(--background)) 10%, transparent 100%)"
        }}
      />
      {/* Scrollable Container for Title + Editor */}
      <div
        className="flex-1 overflow-y-auto novel-wrapper"
        onScroll={(e) => {
          if (onScrollProgress) {
            const scrollY = e.currentTarget.scrollTop;
            const progress = Math.min(scrollY / 50, 1);
            onScrollProgress(progress);
          }
        }}
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
              handlePaste: (view, event) => {
                // Intercept raw image data from clipboard (e.g. screenshots)
                if (event.clipboardData && event.clipboardData.items) {
                  for (const item of Array.from(event.clipboardData.items)) {
                    if (item.type.indexOf("image") === 0) {
                      const file = item.getAsFile();
                      if (file) {
                        event.preventDefault();
                        uploadFn(file).then((url) => {
                          const { schema } = view.state;
                          const node = schema.nodes.image.create({ src: url });
                          const tr = view.state.tr.replaceSelectionWith(node);
                          view.dispatch(tr);
                        });
                        return true;
                      }
                    }
                  }
                }
                return handleImagePaste(view, event, uploadFn);
              },
              handleDrop: (view, event, _slice, moved) => {
                if (!moved && event.dataTransfer) {
                  // 1. Handle actual image files (e.g., dragged from desktop)
                  if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
                    const file = event.dataTransfer.files[0];
                    if (file.type.indexOf("image") === 0) {
                      event.preventDefault();
                      uploadFn(file).then((url) => {
                        const { schema } = view.state;
                        const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
                        const node = schema.nodes.image.create({ src: url });
                        const tr = view.state.tr;
                        if (coordinates) {
                          tr.insert(coordinates.pos, node);
                        } else {
                          tr.replaceSelectionWith(node);
                        }
                        view.dispatch(tr);
                      });
                      return true;
                    }
                  }

                  // 2. Handle image elements dragged from other websites
                  const html = event.dataTransfer.getData("text/html");
                  if (html) {
                    const match = html.match(/<img.*?src=["'](.*?)["']/i);
                    if (match && match[1]) {
                      event.preventDefault();
                      const { schema } = view.state;
                      const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
                      const node = schema.nodes.image.create({ src: match[1] });
                      const tr = view.state.tr;
                      if (coordinates) {
                        tr.insert(coordinates.pos, node);
                      } else {
                        tr.replaceSelectionWith(node);
                      }
                      view.dispatch(tr);
                      return true;
                    }
                  }
                }
                return handleImageDrop(view, event, moved, uploadFn);
              },
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
                <BoldIcon className="h-3.5 w-3.5" />
              </EditorBubbleItem>
              <EditorBubbleItem
                onSelect={(editor) => editor.chain().focus().toggleItalic().run()}
              >
                <ItalicIcon className="h-3.5 w-3.5" />
              </EditorBubbleItem>
              <EditorBubbleItem
                onSelect={(editor) => editor.chain().focus().toggleUnderline().run()}
              >
                <UnderlineIcon className="h-3.5 w-3.5" />
              </EditorBubbleItem>
              <EditorBubbleItem
                onSelect={(editor) => editor.chain().focus().toggleStrike().run()}
              >
                <Strikethrough className="h-3.5 w-3.5 hover-zoom-icon" />
              </EditorBubbleItem>
              <EditorBubbleItem
                onSelect={(editor) => editor.chain().focus().toggleCode().run()}
              >
                <TerminalIcon className="h-3.5 w-3.5" />
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

            {/* AI Bottom Sheet — inside EditorContent but portaled to prevent Prosemirror scroll jumps */}
            <AISheetTrigger />
            <AIContentInsertBridge />
            <ChatSheetBridge note={note} noteTitle={titleValue} onUpdateNote={onUpdateNote} />
            <ImportExportSheetBridge 
              noteId={note.id} 
              noteTitle={titleValue} 
              onCreateNote={onCreateNote} 
              theme={theme}
              toggleTheme={toggleTheme}
            />
          </EditorContent>
        </EditorRoot>
      </div>
    </div>
  );
}
