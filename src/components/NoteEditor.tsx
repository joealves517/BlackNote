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
import { MeetIcon } from "@/components/icons/meet";
import { ScanTextIcon } from "@/components/icons/scan-text";
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
import ImageResize from "tiptap-extension-resize-image";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import { AgentDecorationExtension } from "@/extensions/AgentDecoration";

import { Button } from "@/components/ui/button";
import { GenerativeMenuSwitch } from "@/components/generative/GenerativeMenuSwitch";
import { AISelector } from "@/components/generative/AISelector";
import { ColorSelector } from "@/components/generative/ColorSelector";
import { NoteChatSheet } from "@/components/generative/NoteChatSheet";
import { AgentInput } from "@/components/generative/AgentInput";
import TurndownService from "turndown";
import { MediaAIResultSheet } from "@/components/generative/MediaAIResultSheet";
import { getAuthToken } from "@/lib/auth-client";
import { AI_API_BASE } from "@/lib/constants";
import { markdownToProsemirror } from "@/lib/markdown-to-prosemirror";
import { HashtagExtension } from "@/components/generative/HashtagSuggestion";
import type { Note } from "@/hooks/use-notes";
import { useSpeech } from "@/hooks/use-speech";

/**
 * Bridge: listens for content insertion events.
 * - 'insert-ai-content': inserts at end of doc
 * - 'insert-media-ai-result': inserts directly below the specified media node
 */
function AIContentInsertBridge() {
  const { editor } = useEditor();

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
      if (!editor || !text || !mediaId) return;

      let pos = editor.state.doc.content.size;
      editor.state.doc.descendants((node, p) => {
        if ((node.type.name === "audioNode" || node.type.name === "videoNode") && node.attrs.mediaId === mediaId) {
           pos = p + node.nodeSize;
        }
      });

      try {
        const jsonStr = markdownToProsemirror(text);
        const json = JSON.parse(jsonStr);
        const parsed = json.content || text;
        editor.chain().focus().insertContentAt(pos, parsed).run();
      } catch {
        editor.chain().focus().insertContentAt(pos, text).run();
      }
    };

    window.addEventListener("insert-ai-content", handleInsert);
    window.addEventListener("insert-media-ai-result", handleMediaResult);
    
    // Expose for external toolbar actions
    (window as any).activeBlackNoteEditor = editor;

    return () => {
      window.removeEventListener("insert-ai-content", handleInsert);
      window.removeEventListener("insert-media-ai-result", handleMediaResult);
      if ((window as any).activeBlackNoteEditor === editor) {
        (window as any).activeBlackNoteEditor = null;
      }
    };
  }, [editor]);

  return null;
}

/**
 * Bridge: swaps editor content when the active note changes,
 * avoiding full Tiptap remount (which causes visible flicker).
 */
function ContentSwapBridge({ noteId, content }: { noteId: string; content: string }) {
  const { editor } = useEditor();
  const prevNoteIdRef = useRef(noteId);

  useEffect(() => {
    if (!editor || noteId === prevNoteIdRef.current) return;
    prevNoteIdRef.current = noteId;

    const emptyDoc = { type: "doc", content: [{ type: "paragraph" }] };
    let parsed: JSONContent = emptyDoc;
    if (content) {
      try {
        const json = JSON.parse(content);
        if (json && json.type === "doc") parsed = json;
      } catch { /* fallback to empty */ }
    }

    // Swap content without triggering onUpdate (emitUpdate: false)
    editor.commands.setContent(parsed, false);
  }, [editor, noteId, content]);

  return null;
}


/**
 * Lightweight bridge: listens for 'open-ai-sheet' event
 * and renders AISelector inside EditorContent context.
 */
function AISheetTrigger() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const handler = () => setShow(true);
    const closeHandler = () => setShow(false);
    window.addEventListener("close-note-chat", closeHandler);
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
    const closeHandler = () => setShow(false);
    window.addEventListener("open-note-chat", handler);
    window.addEventListener("close-note-chat", closeHandler);
    return () => {
      window.removeEventListener("open-note-chat", handler);
      window.removeEventListener("close-note-chat", closeHandler);
    };
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
        onClose={() => { setShow(false); window.dispatchEvent(new CustomEvent("panel-closed")); }}
      />
    </AnimatePresence>,
    document.getElementById("blacknote-root") || document.body
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

// Color map for slash command icon backgrounds
const SLASH_ICON_COLORS: Record<string, string> = {
  "Speech to Text": "168, 85, 247",
  "Record Audio": "236, 72, 153",
  "Record Screen": "16, 185, 129",
  "Meet Live Sync": "52, 168, 83",
  "Text": "148, 163, 184",
  "Heading 1": "59, 130, 246",
  "Heading 2": "59, 130, 246",
  "Heading 3": "59, 130, 246",
  "Bullet List": "245, 158, 11",
  "Numbered List": "245, 158, 11",
  "To-do List": "16, 185, 129",
  "Quote": "168, 85, 247",
  "Code Block": "99, 102, 241",
  "Image": "236, 72, 153",
  "Divider": "148, 163, 184",
};

// Slash command suggestions — block types only, AI moved to bubble menu
const suggestionItems = createSuggestionItems([

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
  let finalUrl = compressedDataUrl;

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

      if (presignRes.ok) {
        const { uploadUrl, publicUrl } = await presignRes.json();

        // Step 2: Upload directly to S3
        const blobRes = await fetch(compressedDataUrl);
        const blob = await blobRes.blob();

        const uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": "image/webp" },
          body: blob,
        });

        if (uploadRes.ok) {
          finalUrl = publicUrl;
        } else {
          console.error("S3 upload failed:", uploadRes.status);
        }
      } else {
        console.error("Presign request failed:", presignRes.status);
      }
    }
  } catch (err) {
    console.error("Failed to upload image to S3, falling back to local:", err);
  }

  // Auto-caption in background
  getAuthToken().then(token => {
    const endpoint = token ? `${AI_API_BASE}/api/ai` : `${AI_API_BASE}/api/ai/free`;
    fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        option: "describe_image",
        files: [{ mimeType: "image/png", data: compressedDataUrl.split(",")[1] }]
      }),
    })
    .then(res => res.body?.getReader())
    .then(async reader => {
      if (!reader) return;
      const decoder = new TextDecoder();
      let caption = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        caption += decoder.decode(value, { stream: true });
      }
      
      const cleanCaption = caption.replace(/^#\s+(.+)$/m, "").trim();
      
      if (cleanCaption) {
        window.dispatchEvent(new CustomEvent("image-caption-ready", { 
          detail: { src: finalUrl, alt: cleanCaption } 
        }));
      }
    })
    .catch(err => console.error("Auto-caption failed:", err));
  });

  return finalUrl;
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
  Highlight.configure({ multicolor: true }),
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  Placeholder.configure({
    placeholder: "Type '/' for commands...",
  }),
  CharacterCount,
  AIHighlight,
  AgentDecorationExtension,
  Command.configure({
    suggestion: {
      items: () => suggestionItems,
      render: renderItems,
    },
  }),
  ImageResize.extend({ name: "image" }).configure({
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
  HashtagExtension,
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
  }, [note?.id]);

  useEffect(() => {
    if (note) {
      setTitleValue(note.title);
    }
  }, [note?.id]);

  useEffect(() => {
    autoResizeTitle();
  }, [titleValue, autoResizeTitle]);

  useEffect(() => {
    const handleCaptionReady = (e: Event) => {
      const { src, alt } = (e as CustomEvent).detail;
      const editor = (window as any).blackNoteSTTEditor;
      if (!editor) return;

      editor.state.doc.descendants((node: any, pos: number) => {
        if (node.type.name === 'image' && node.attrs.src === src) {
          editor.chain().setNodeSelection(pos).updateAttributes('image', { alt }).run();
        }
      });
    };

    window.addEventListener("image-caption-ready", handleCaptionReady);
    return () => window.removeEventListener("image-caption-ready", handleCaptionReady);
  }, []);

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
            immediatelyRender={true}
          >

            {/* Generative Menu — toggles between formatting + AI */}
            <GenerativeMenuSwitch>
              <ColorSelector />
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
                    <div className="novel-slash-icon" style={SLASH_ICON_COLORS[item.title] ? {
                      background: `linear-gradient(135deg, rgba(${SLASH_ICON_COLORS[item.title]}, var(--icon-bg-start)) 0%, rgba(${SLASH_ICON_COLORS[item.title]}, var(--icon-bg-end)) 100%)`,
                      border: `1px solid rgba(${SLASH_ICON_COLORS[item.title]}, var(--icon-border))`,
                      color: `rgba(${SLASH_ICON_COLORS[item.title]}, 1)`,
                    } : undefined}>{item.icon}</div>
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
            <ContentSwapBridge noteId={note.id} content={note.content} />
            <ChatSheetBridge note={note} noteTitle={titleValue} onUpdateNote={onUpdateNote} />
            <ImportExportSheetBridge 
              noteId={note.id} 
              noteTitle={titleValue} 
              onCreateNote={onCreateNote} 
              theme={theme}
              toggleTheme={toggleTheme}
            />
            <AgentInput />
          </EditorContent>
        </EditorRoot>
      </div>
    </div>
  );
}
