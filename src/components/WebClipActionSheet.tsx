import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, Download, Maximize2, Globe, AlertCircle, Loader2, Smartphone } from "lucide-react";
import { db } from "@/lib/local-db";

interface WebClipActionSheetProps {
  clipId: string;
  onClose: () => void;
}

export function WebClipActionSheet({ clipId, onClose }: WebClipActionSheetProps) {
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [title, setTitle] = useState("Offline Web Clip");
  const [originalUrl, setOriginalUrl] = useState("");
  const [hostname, setHostname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fitWidth, setFitWidth] = useState(false);
  const [panelWidth, setPanelWidth] = useState(360);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setPanelWidth(window.innerWidth);
      const handleResize = () => setPanelWidth(window.innerWidth);
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }
  }, []);

  useEffect(() => {
    let active = true;

    db.web_clips.get(clipId)
      .then((clip) => {
        if (!active) return;
        if (!clip || !clip.htmlBlob) {
          setError("Web clip not found or has been deleted.");
          setLoading(false);
          return;
        }

        setTitle(clip.title || "Offline Web Clip");
        setOriginalUrl(clip.url);

        try {
          setHostname(new URL(clip.url).hostname);
        } catch {
          setHostname(clip.url);
        }

        const url = URL.createObjectURL(clip.htmlBlob);
        setClipUrl(url);
        setLoading(false);
      })
      .catch((err) => {
        console.error("[WebClipActionSheet] Failed to load web clip:", err);
        if (active) {
          setError("Failed to load web clip from database.");
          setLoading(false);
        }
      });

    return () => {
      active = false;
      if (clipUrl) {
        URL.revokeObjectURL(clipUrl);
      }
    };
  }, [clipId]);

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!clipUrl) return;
    const a = document.createElement("a");
    a.href = clipUrl;
    const sanitizedTitle = title.replace(/[^a-zA-Z0-9.-]/g, "_");
    a.download = `${sanitizedTitle || "web_clip"}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleOpenOriginal = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (originalUrl) {
      chrome.tabs.create({ url: originalUrl });
    }
  };

  const handleMaximize = (e: React.MouseEvent) => {
    e.stopPropagation();
    chrome.tabs.create({
      url: chrome.runtime.getURL(`html-viewer.html?id=${clipId}`)
    });
  };

  const scale = panelWidth / 1024;
  const iframeStyle = fitWidth && scale < 1
    ? {
        width: "1024px",
        height: `${100 / scale}%`,
        transform: `scale(${scale})`,
        transformOrigin: "top left",
        border: "none",
      }
    : {
        width: "100%",
        height: "100%",
        border: "none",
      };

  return (
    <>
      {/* Dark backdrop for smooth transitions */}
      <motion.div
        className="fixed inset-0 bg-black/60 z-[900]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />

      {/* Premium Full-height Slide Sheet */}
      <motion.div
        className="fixed top-0 bottom-0 right-0 left-0 bg-zinc-950 flex flex-col z-[910] overflow-hidden"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 240, mass: 0.9 }}
      >
        {/* Header Bar */}
        <header className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800/80 bg-zinc-900/90 backdrop-blur-md flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-foreground hover:bg-zinc-800 transition-colors border border-zinc-800/50 cursor-pointer flex-shrink-0"
              data-tooltip="Back to Note"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div className="min-w-0 flex-1">
              <h1 className="text-[12px] font-semibold text-foreground truncate max-w-[150px] leading-tight">
                {title}
              </h1>
              <p className="text-[9px] text-muted-foreground leading-tight mt-0.5 flex items-center gap-1 truncate">
                <Globe className="w-2.5 h-2.5 flex-shrink-0" />
                <span className="truncate">{hostname}</span>
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1 flex-shrink-0 ml-1.5">
            <button
              onClick={() => setFitWidth(!fitWidth)}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                fitWidth
                  ? "text-primary bg-primary/10 border border-primary/20"
                  : "text-zinc-400 hover:text-foreground hover:bg-zinc-800 border border-transparent"
              }`}
              data-tooltip={fitWidth ? "Disable Desktop Scaling" : "Scale to Fit Width"}
            >
              <Smartphone className="w-4 h-4" />
            </button>

            <button
              onClick={handleOpenOriginal}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-foreground hover:bg-zinc-800 transition-colors cursor-pointer"
              data-tooltip="Open original website"
            >
              <ExternalLink className="w-4 h-4" />
            </button>

            <button
              onClick={handleDownload}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-foreground hover:bg-zinc-800 transition-colors cursor-pointer"
              data-tooltip="Export HTML file"
            >
              <Download className="w-4 h-4" />
            </button>

            <button
              onClick={handleMaximize}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-foreground hover:bg-zinc-800 transition-colors cursor-pointer"
              data-tooltip="Open in new full tab"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Content Viewer body */}
        <div className="flex-1 w-full bg-white relative overflow-hidden">
          {loading && (
            <div className="absolute inset-0 bg-zinc-950 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground animate-pulse">Loading offline snapshot...</p>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 bg-zinc-950 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <AlertCircle className="w-10 h-10 text-destructive opacity-80" />
              <p className="text-sm font-medium text-foreground">{error}</p>
              <button
                onClick={onClose}
                className="mt-4 px-4 py-2 rounded-xl bg-zinc-850 text-xs font-semibold text-foreground hover:bg-zinc-800 border border-zinc-750 transition-colors cursor-pointer"
              >
                Close Viewer
              </button>
            </div>
          )}

          {clipUrl && !loading && !error && (
            <iframe
              src={clipUrl}
              style={iframeStyle}
              sandbox="allow-same-origin allow-popups"
              title="Offline Web Clip Sidepanel View"
            />
          )}
        </div>
      </motion.div>
    </>
  );
}
