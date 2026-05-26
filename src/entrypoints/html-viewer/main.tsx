import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { db } from "@/lib/local-db";
import { AlertCircle, ExternalLink, Download, ArrowLeft, Globe } from "lucide-react";
import "@/index.css";

function HTMLViewer() {
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [title, setTitle] = useState("Offline Web Clip");
  const [originalUrl, setOriginalUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hostname, setHostname] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");

    if (!id) {
      setError("No web clip ID provided.");
      return;
    }

    db.web_clips.get(id)
      .then((clip) => {
        if (!clip || !clip.htmlBlob) {
          setError("Web clip not found or has been deleted.");
          return;
        }
        setTitle(clip.title || "Offline Web Clip");
        document.title = clip.title || "Offline Web Clip";
        setOriginalUrl(clip.url);
        
        try {
          setHostname(new URL(clip.url).hostname);
        } catch {
          setHostname(clip.url);
        }

        const url = URL.createObjectURL(clip.htmlBlob);
        setClipUrl(url);
      })
      .catch((err) => {
        console.error("Failed to load web clip:", err);
        setError("Failed to load web clip from database.");
      });

    return () => {
      if (clipUrl) {
        URL.revokeObjectURL(clipUrl);
      }
    };
  }, []);

  const handleDownload = () => {
    if (!clipUrl) return;
    const a = document.createElement("a");
    a.href = clipUrl;
    // Sanitize title for filename
    const sanitizedTitle = title.replace(/[^a-zA-Z0-9.-]/g, "_");
    a.download = `${sanitizedTitle || "web_clip"}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleOpenOriginal = () => {
    if (originalUrl) {
      chrome.tabs.create({ url: originalUrl });
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full text-muted-foreground bg-zinc-950">
        <AlertCircle className="w-12 h-12 mb-4 text-destructive opacity-80" />
        <p className="text-lg font-medium text-foreground">{error}</p>
        <button 
          onClick={() => window.close()}
          className="mt-6 px-5 py-2.5 rounded-xl bg-zinc-800 text-foreground hover:bg-zinc-700 transition-colors text-sm font-medium border border-zinc-700/50"
        >
          Close Tab
        </button>
      </div>
    );
  }

  if (!clipUrl) {
    return (
      <div className="flex items-center justify-center w-full h-full bg-zinc-950">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin w-10 h-10 rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground animate-pulse">Loading offline snapshot...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-full bg-zinc-950 font-sans">
      {/* Premium Glassmorphic Top Bar */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md z-10">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <button
            onClick={() => window.close()}
            className="p-2 rounded-xl text-zinc-400 hover:text-foreground hover:bg-zinc-800 transition-colors border border-zinc-800/50"
            title="Go back / Close"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          
          <div className="min-w-0 flex-1">
            <h1 className="text-[14px] font-semibold text-foreground truncate max-w-[500px]">
              {title}
            </h1>
            <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5 truncate">
              <Globe className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{hostname}</span>
              <span>·</span>
              <span className="text-[9px] bg-emerald-500/10 text-emerald-400 font-semibold px-1.5 py-0.5 rounded-[6px] border border-emerald-500/15">OFFLINE SNAPSHOT</span>
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3 ml-6 flex-shrink-0">
          <button
            onClick={handleOpenOriginal}
            className="flex items-center gap-2 px-3.5 py-1.8 rounded-xl text-[12px] font-medium text-zinc-400 hover:text-foreground hover:bg-zinc-800 border border-zinc-800/80 transition-all duration-150 cursor-pointer"
            title="Open original webpage in new tab"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Original Site</span>
          </button>

          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-semibold text-white bg-primary hover:bg-primary/95 shadow-lg shadow-primary/15 transition-all duration-150 cursor-pointer"
            title="Export page as static HTML file"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export HTML</span>
          </button>
        </div>
      </header>

      {/* Sandboxed Secure HTML Iframe */}
      <main className="flex-1 w-full overflow-hidden bg-white relative">
        <iframe
          src={clipUrl}
          className="w-full h-full border-none shadow-inner"
          sandbox="allow-same-origin allow-popups"
          title="Offline Web Clip View"
        />
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <HTMLViewer />
  </React.StrictMode>
);
