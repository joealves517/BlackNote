import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useEditor } from "novel";
import { createPortal } from "react-dom";
import { useCompletion } from "@ai-sdk/react";
import { AI_API_BASE } from "@/lib/constants";
import { supabase } from "@/lib/supabase";
import TurndownService from "turndown";
import * as mammoth from "mammoth";
import { PlusIcon } from "@/components/icons/plus";
import { HardDriveUploadIcon } from "@/components/icons/hard-drive-upload";
import { HardDriveDownloadIcon } from "@/components/icons/hard-drive-download";
import { MoonIcon } from "@/components/icons/moon";
import { SunIcon } from "@/components/icons/sun";
import { SparklesIcon } from "@/components/icons/sparkles";
import { RedoDotIcon } from "@/components/icons/redo-dot";
import { GripIcon } from "@/components/icons/grip";
import { DownloadIcon } from "lucide-react";
import { DynamicThinking } from "@/components/ui/dynamic-thinking";

interface ImportExportSheetProps {
  noteId: string;
  noteTitle: string;
  theme?: "light" | "dark";
  toggleTheme?: () => void;
  onClose: () => void;
  onCreateNote: (title: string, markdownContent: string) => void;
}

export function ImportExportSheet({ noteId, noteTitle, theme = "dark", toggleTheme, onClose, onCreateNote }: ImportExportSheetProps) {
  const [token, setToken] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { editor } = useEditor();

  const iconRefs = {
    upload: useRef<any>(null),
    download: useRef<any>(null),
    theme: useRef<any>(null),
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token || null);
    });
  }, []);

  const { complete } = useCompletion({
    api: token ? `${AI_API_BASE}/api/ai` : `${AI_API_BASE}/api/ai/free`,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    streamProtocol: "text",
    onResponse: () => {
      // AI started streaming
    },
    onFinish: (prompt, completion) => {
      setIsProcessing(false);
      if (completion) {
        let extractedTitle = "Imported Document";
        let finalContent = completion;

        // Extract title from the first line if it's an H1
        const lines = completion.split("\n");
        const firstH1Index = lines.findIndex(line => line.trim().startsWith("# "));
        
        if (firstH1Index >= 0 && firstH1Index <= 2) {
          extractedTitle = lines[firstH1Index].replace(/^#\s*/, "").trim();
          // Remove the title line so it's not duplicated as the note content H1
          lines.splice(firstH1Index, 1);
          finalContent = lines.join("\n").trim();
        }

        onCreateNote(extractedTitle, finalContent);
        onClose();
      }
    },
    onError: (err) => {
      console.error("[Import] AI error:", err);
      setIsProcessing(false);
      window.dispatchEvent(new CustomEvent("ai-error"));
      onClose();
    },
  });

  const handleFileUpload = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      setFileError("File is too large. Max size is 5MB.");
      return;
    }
    setFileError(null);

    setIsProcessing(true);

    if (file.name.endsWith(".docx")) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        try {
          const result = await mammoth.convertToHtml({ arrayBuffer });
          const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
          const markdown = turndown.turndown(result.value);
          onCreateNote(file.name.replace(".docx", ""), markdown || "No content found.");
          setIsProcessing(false);
          onClose();
        } catch (err) {
          console.error("Mammoth error:", err);
          setIsProcessing(false);
        }
      };
      reader.readAsArrayBuffer(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64Url = e.target?.result as string;
      const base64Data = base64Url.split(",")[1];

      const payload = {
        option: "import_file",
        files: [{ mimeType: file.type, data: base64Data }]
      };
      await complete("First line MUST be a short title: # [Title of the document]. Then convert the rest of the content into well-formatted Markdown.", { body: payload });
    };
    reader.readAsDataURL(file);
  };

  const handleExportPdf = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editor) return;

    // Open a new window to print the content
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>${noteTitle || "Note"}</title>
            <style>
              body { font-family: sans-serif; padding: 2rem; max-width: 800px; margin: 0 auto; line-height: 1.6; }
              img { max-width: 100%; height: auto; }
              blockquote { border-left: 3px solid #ccc; padding-left: 1rem; color: #666; }
              pre { background: #f4f4f4; padding: 1rem; border-radius: 4px; overflow-x: auto; }
              code { background: #f4f4f4; padding: 0.2rem 0.4rem; border-radius: 3px; }
            </style>
          </head>
          <body>
            <h1>${noteTitle || "Note"}</h1>
            ${editor.getHTML()}
          </body>
        </html>
      `);
      printWindow.document.close();

      // Wait for the new window to render, then trigger print
      setTimeout(() => {
        printWindow.print();
      }, 500);
    }
    onClose();
  };

  return (
    <>
      <motion.div
        className="history-sheet-backdrop"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      <motion.div
        className="history-sheet ai-shadow"
        style={{ display: "flex", flexDirection: "column", maxWidth: 800, margin: "0 auto", height: "auto" }}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "tween", duration: 0.25, ease: "easeOut" }}
      >
        {/* Drag Handle */}
        <div className="history-sheet-handle" onClick={onClose}>
          <div className="history-sheet-handle-bar" />
        </div>

        <div className="flex flex-col gap-3 p-5">
          <AnimatePresence mode="wait">
            {isProcessing ? (
              <motion.div
                key="thinking"
                className="ai-loading"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <GripIcon loop className="ai-loading-icon" />
                <DynamicThinking messages={["Analyzing document", "Extracting structure", "Reading content", "Thinking"]} />
              </motion.div>
            ) : (
              <motion.div
                key="content"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col gap-3"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept=".pdf,.docx,.png,.jpg,.jpeg"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileUpload(e.target.files[0]);
                    }
                  }}
                />

                <div className="ai-cmd-groups">
                  <div className="ai-cmd-group">

                    {/* Import Row */}
                    {/* Import Row */}
                    <div
                      className="novel-slash-item w-full text-left"
                      onMouseEnter={() => iconRefs.upload.current?.startAnimation()}
                      onMouseLeave={() => iconRefs.upload.current?.stopAnimation()}
                    >
                      <div className="novel-slash-icon">
                        <HardDriveUploadIcon ref={iconRefs.upload} size={16} className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[13px] font-medium">Import File</p>
                        {fileError ? (
                          <p className="text-[11px] text-destructive">{fileError}</p>
                        ) : (
                          <p className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                            PDF, DOCX, Images
                          </p>
                        )}
                      </div>
                      <div className="mr-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                          className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                        >
                          <PlusIcon size={16} />
                        </button>
                      </div>
                    </div>

                    {/* Export Row */}
                    <div
                      className="novel-slash-item w-full text-left"
                      onMouseEnter={() => iconRefs.download.current?.startAnimation()}
                      onMouseLeave={() => iconRefs.download.current?.stopAnimation()}
                    >
                      <div className="novel-slash-icon">
                        <HardDriveDownloadIcon ref={iconRefs.download} size={16} className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[13px] font-medium">Export Note</p>
                        <p className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                          Save as PDF
                        </p>
                      </div>
                      <div className="mr-1">
                        <button
                          onClick={handleExportPdf}
                          className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                        >
                          <DownloadIcon size={16} />
                        </button>
                      </div>
                    </div>

                    {/* Theme Row */}
                    <div
                      className="novel-slash-item w-full text-left"
                      onMouseEnter={() => iconRefs.theme.current?.startAnimation()}
                      onMouseLeave={() => iconRefs.theme.current?.stopAnimation()}
                    >
                      <div className="novel-slash-icon">
                        {theme === "light" ? (
                          <MoonIcon ref={iconRefs.theme} size={16} className="w-4 h-4" />
                        ) : (
                          <SunIcon ref={iconRefs.theme} size={16} className="w-4 h-4" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="text-[13px] font-medium">Appearance</p>
                        <p className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                          {theme === "light" ? "Dark Mode" : "Light Mode"}
                        </p>
                      </div>
                      <div className="mr-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleTheme?.(); }}
                          className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                        >
                          <RedoDotIcon size={16} />
                        </button>
                      </div>
                    </div>

                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </>
  );
}

export function ImportExportSheetBridge({ noteId, noteTitle, theme, toggleTheme, onCreateNote }: { noteId: string, noteTitle: string, theme?: "light" | "dark", toggleTheme?: () => void, onCreateNote: (title: string, content: string) => void }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const handler = () => setShow(true);
    window.addEventListener("open-import-export-sheet", handler);
    return () => window.removeEventListener("open-import-export-sheet", handler);
  }, []);

  if (!show) return null;
  return createPortal(
    <AnimatePresence>
      <ImportExportSheet
        noteId={noteId}
        noteTitle={noteTitle}
        theme={theme}
        toggleTheme={toggleTheme}
        onClose={() => setShow(false)}
        onCreateNote={onCreateNote}
      />
    </AnimatePresence>,
    document.body
  );
}
