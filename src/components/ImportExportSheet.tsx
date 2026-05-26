import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useEditor } from "novel";
import { createPortal } from "react-dom";
import { AI_API_BASE } from "@/lib/constants";
import { getAuthToken } from "@/lib/auth-client";
import TurndownService from "turndown";
import * as mammoth from "mammoth";
import { PlusIcon } from "@/components/icons/plus";
import { HardDriveUploadIcon } from "@/components/icons/hard-drive-upload";
import { HardDriveDownloadIcon } from "@/components/icons/hard-drive-download";
import { ToggleLeftIcon } from "@/components/animate-ui/icons/toggle-left";
import { ToggleRightIcon } from "@/components/animate-ui/icons/toggle-right";
import { MoonIcon } from "@/components/icons/moon";
import { SunIcon } from "@/components/icons/sun";
import { SparklesIcon } from "@/components/icons/sparkles";
import { RedoDotIcon } from "@/components/icons/redo-dot";
import { DownloadIcon } from "@/components/icons/download";
import { showAILoaderToast, updateAISuccessToast, updateAIErrorToast } from "@/lib/toast";
import { Monitor } from "lucide-react";

interface ImportExportSheetProps {
  noteId: string;
  noteTitle: string;
  theme?: "light" | "dark";
  themeMode?: "light" | "dark" | "system";
  setThemeMode?: (mode: "light" | "dark" | "system") => void;
  toggleTheme?: () => void;
  onClose: () => void;
  onCreateNote: (title: string, markdownContent: string) => void;
}

export function ImportExportSheet({
  noteId,
  noteTitle,
  theme = "dark",
  themeMode = "system",
  setThemeMode,
  toggleTheme,
  onClose,
  onCreateNote,
}: ImportExportSheetProps) {
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { editor } = useEditor();

  const [hideAgent, setHideAgent] = useState(() => localStorage.getItem("blacknote_hide_agent") === "true");

  const isMac = typeof window !== "undefined" && navigator.userAgent.toLowerCase().includes("mac");
  const shortcutText = isMac ? "⌘J" : "Ctrl+J";

  const toggleAgent = () => {
    const newValue = !hideAgent;
    setHideAgent(newValue);
    localStorage.setItem("blacknote_hide_agent", newValue ? "true" : "false");
    window.dispatchEvent(new CustomEvent("blacknote_agent_visibility", { detail: !newValue }));
  };

  const iconRefs = {
    upload: useRef<any>(null),
    download: useRef<any>(null),
    theme: useRef<any>(null),
  };

  const handleFileUpload = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      setFileError("File is too large. Max size is 5MB.");
      return;
    }
    if (file.type.startsWith("image/")) {
      setFileError("Images are not supported for import. Please use PDF or DOCX.");
      return;
    }

    setFileError(null);

    const toastId = `doc-import-toast-${Date.now()}`;
    onClose(); // Close sheet immediately!

    if (file.name.endsWith(".docx")) {
      showAILoaderToast(toastId, "Import Word Document", "Reading Word file content...");
      const reader = new FileReader();
      reader.onload = async (e) => {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        try {
          const result = await mammoth.convertToHtml({ arrayBuffer });
          const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
          const markdown = turndown.turndown(result.value);
          onCreateNote(file.name.replace(".docx", ""), markdown || "No content found.");
          updateAISuccessToast(toastId, "Import Word Document", "Document imported successfully!");
        } catch (err) {
          console.error("Mammoth error:", err);
          updateAIErrorToast(toastId, "Import Word Document", "Failed to parse document");
        }
      };
      reader.readAsArrayBuffer(file);
      return;
    }

    // PDF Import using AI
    showAILoaderToast(toastId, "Import PDF Document", "Converting pages and extracting text with AI...");

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64Url = e.target?.result as string;
      const base64Data = base64Url.split(",")[1];

      try {
        const currentToken = await getAuthToken();
        const endpoint = currentToken ? `${AI_API_BASE}/api/ai` : `${AI_API_BASE}/api/ai/free`;

        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
          },
          body: JSON.stringify({
            prompt: "First line MUST be a short title: # [Title of the document]. Then convert the rest of the content into well-formatted Markdown.",
            option: "import_file",
            files: [{ mimeType: file.type, data: base64Data }]
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`AI error (${response.status}): ${errorText}`);
        }

        const readerStream = response.body?.getReader();
        if (!readerStream) throw new Error("No response stream");

        let result = "";
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await readerStream.read();
          if (done) break;
          result += decoder.decode(value, { stream: true });
        }

        if (result.includes("We are facing high traffic") || result.includes("You have reached your daily limit")) {
          throw new Error(result.trim());
        }

        const cleanResult = result.trim();
        if (!cleanResult) {
          throw new Error("Received empty response from AI");
        }

        let extractedTitle = "Imported Document";
        let finalContent = cleanResult;

        // Extract title from the first line if it's an H1
        const lines = cleanResult.split("\n");
        const firstH1Index = lines.findIndex(line => line.trim().startsWith("# "));
        
        if (firstH1Index >= 0 && firstH1Index <= 2) {
          extractedTitle = lines[firstH1Index].replace(/^#\s*/, "").trim();
          lines.splice(firstH1Index, 1);
          finalContent = lines.join("\n").trim();
        }

        onCreateNote(extractedTitle, finalContent);
        updateAISuccessToast(toastId, "Import PDF Document", "Document imported successfully!");

      } catch (err) {
        const msg = err instanceof Error ? err.message : "Import failed";
        console.error("[Import] Error:", msg);
        if (msg.includes("402") || msg.includes("insufficient") || msg.includes("401")) {
          window.dispatchEvent(new CustomEvent("ai-error"));
        }
        updateAIErrorToast(toastId, "Import PDF Document", msg.includes("traffic") || msg.includes("limit") ? msg : "Failed to import document");
      }
    };
    reader.readAsDataURL(file);
  };

  const handleExportPdf = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editor) return;

    const htmlContent = `
        <html>
          <head>
            <meta charset="UTF-8">
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
            <script>
              setTimeout(() => { window.print(); }, 500);
            </script>
          </body>
        </html>
    `;

    const blob = new Blob([htmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");

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
        style={{ display: "flex", flexDirection: "column", maxWidth: 400, margin: "0 auto", height: "auto" }}
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
          <div className="flex flex-col gap-3">
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept=".pdf,.docx"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileUpload(e.target.files[0]);
                }
              }}
            />

            <div className="ai-cmd-groups">
              <div className="ai-cmd-group">

                {/* Import Row */}
                <div
                  className="novel-slash-item w-full text-left cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                  onMouseEnter={() => iconRefs.upload.current?.startAnimation()}
                  onMouseLeave={() => iconRefs.upload.current?.stopAnimation()}
                >
                  <div className="novel-slash-icon" style={{
                    background: "linear-gradient(135deg, rgba(59, 130, 246, var(--icon-bg-start)) 0%, rgba(59, 130, 246, var(--icon-bg-end)) 100%)",
                    border: "1px solid rgba(59, 130, 246, var(--icon-border))",
                    color: "rgba(59, 130, 246, 1)",
                  }}>
                    <HardDriveUploadIcon ref={iconRefs.upload} size={16} className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[13px] font-medium">Import File</p>
                    {fileError ? (
                      <p className="text-[11px] text-destructive">{fileError}</p>
                    ) : (
                      <p className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                        PDF, DOCX
                      </p>
                    )}
                  </div>
                </div>

                {/* Export Row */}
                <div
                  className="novel-slash-item w-full text-left cursor-pointer"
                  onClick={handleExportPdf}
                  onMouseEnter={() => iconRefs.download.current?.startAnimation()}
                  onMouseLeave={() => iconRefs.download.current?.stopAnimation()}
                >
                  <div className="novel-slash-icon" style={{
                    background: "linear-gradient(135deg, rgba(16, 185, 129, var(--icon-bg-start)) 0%, rgba(16, 185, 129, var(--icon-bg-end)) 100%)",
                    border: "1px solid rgba(16, 185, 129, var(--icon-border))",
                    color: "rgba(16, 185, 129, 1)",
                  }}>
                    <HardDriveDownloadIcon ref={iconRefs.download} size={16} className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[13px] font-medium">Export Note</p>
                    <p className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                      Save as PDF
                    </p>
                  </div>
                </div>

                {/* Agent Toggle Row */}
                <div
                  className="novel-slash-item w-full text-left cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); toggleAgent(); }}
                >
                  <div className="novel-slash-icon text-[17px] leading-none flex items-center justify-center select-none" style={{
                    background: "linear-gradient(135deg, rgba(139, 92, 246, var(--icon-bg-start)) 0%, rgba(139, 92, 246, var(--icon-bg-end)) 100%)",
                    border: "1px solid rgba(139, 92, 246, var(--icon-border))",
                    color: "rgba(139, 92, 246, 1)",
                  }}>
                    ✦
                  </div>
                  <div className="flex-1">
                    <p className="text-[13px] font-medium">AI Agent</p>
                    <p className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                      {hideAgent ? "Hidden" : `Visible • ${shortcutText}`}
                    </p>
                  </div>
                  <div className="mr-1 flex items-center justify-center w-7 h-7 text-muted-foreground group-hover:text-foreground transition-colors">
                    {hideAgent ? (
                      <ToggleLeftIcon size={18} className="w-4.5 h-4.5" />
                    ) : (
                      <ToggleRightIcon size={18} className="w-4.5 h-4.5 text-foreground" />
                    )}
                  </div>
                </div>

                {/* Theme Selector Row */}
                {setThemeMode && (
                  <div className="w-full flex flex-col gap-2.5 p-2 pb-3 text-left items-stretch">
                    <div className="novel-slash-item w-full hover:bg-transparent" style={{ cursor: "default", background: "transparent", padding: 0 }}>
                      <div className="novel-slash-icon text-[17px] leading-none flex items-center justify-center select-none" style={{
                        background: "linear-gradient(135deg, rgba(245, 158, 11, var(--icon-bg-start)) 0%, rgba(245, 158, 11, var(--icon-bg-end)) 100%)",
                        border: "1px solid rgba(245, 158, 11, var(--icon-border))",
                        color: "rgba(245, 158, 11, 1)",
                      }}>
                        {themeMode === "light" ? <SunIcon className="w-4 h-4" /> : themeMode === "dark" ? <MoonIcon className="w-4 h-4" /> : <Monitor size={15} />}
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-[13px] font-medium text-foreground">Appearance</p>
                        <p className="text-[11px] text-muted-foreground">
                          {themeMode === "light" ? "Light theme active" : themeMode === "dark" ? "Dark theme active" : "System theme active"}
                        </p>
                      </div>
                    </div>
                    
                    {/* 3 tabs grid */}
                    <div className="grid grid-cols-3 gap-1 bg-black/10 dark:bg-white/5 p-1 rounded-xl border border-black/5 dark:border-white/5 relative w-full mt-1">
                      {(["light", "dark", "system"] as const).map((mode) => {
                        const isActive = themeMode === mode;
                        return (
                          <button
                            key={mode}
                            onClick={(e) => { e.stopPropagation(); setThemeMode(mode); }}
                            className={`relative flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all duration-200 cursor-pointer ${
                              isActive
                                ? "bg-background text-foreground shadow-sm border border-border/80 dark:border-white/10"
                                : "text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
                            }`}
                          >
                            {mode === "light" && <SunIcon className={`w-3.5 h-3.5 ${isActive ? "text-amber-500" : "text-muted-foreground"}`} />}
                            {mode === "dark" && <MoonIcon className={`w-3.5 h-3.5 ${isActive ? "text-blue-400" : "text-muted-foreground"}`} />}
                            {mode === "system" && <Monitor size={13} className={isActive ? "text-foreground" : "text-muted-foreground"} />}
                            <span className="capitalize">{mode}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </motion.div>
    </>
  );
}

export function ImportExportSheetBridge({
  noteId,
  noteTitle,
  theme,
  themeMode,
  setThemeMode,
  toggleTheme,
  onCreateNote,
}: {
  noteId: string;
  noteTitle: string;
  theme?: "light" | "dark";
  themeMode?: "light" | "dark" | "system";
  setThemeMode?: (mode: "light" | "dark" | "system") => void;
  toggleTheme?: () => void;
  onCreateNote: (title: string, content: string) => void;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const handler = () => setShow(true);
    const closeHandler = () => setShow(false);
    window.addEventListener("close-import-export-sheet", closeHandler);
    window.addEventListener("open-import-export-sheet", handler);
    return () => {
      window.removeEventListener("open-import-export-sheet", handler);
      window.removeEventListener("close-import-export-sheet", closeHandler);
    };
  }, []);

  if (!show) return null;
  return createPortal(
    <AnimatePresence>
      <ImportExportSheet
        noteId={noteId}
        noteTitle={noteTitle}
        theme={theme}
        themeMode={themeMode}
        setThemeMode={setThemeMode}
        toggleTheme={toggleTheme}
        onClose={() => { setShow(false); window.dispatchEvent(new CustomEvent("panel-closed")); }}
        onCreateNote={onCreateNote}
      />
    </AnimatePresence>,
    document.getElementById("blacknote-root") || document.body
  );
}
