import React, { useEffect, useState, useRef } from "react";
import ReactDOM from "react-dom/client";
import { db } from "@/lib/local-db";
import { AlertCircle } from "lucide-react";
import "@/index.css";

function Viewer() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("BlackNote Media Viewer");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    const src = params.get("src");
    const title = params.get("title");

    // If an external or direct URL is provided, play it directly
    if (src && (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("blob:"))) {
      const displayTitle = title || "Video Recording";
      setFileName(displayTitle);
      document.title = displayTitle;
      setVideoUrl(src);
      return;
    }

    if (!id) {
      setError("No media ID provided.");
      return;
    }

    let createdUrl: string | null = null;

    db.media_files.get(id)
      .then((file) => {
        if (!file || !file.blob) {
          setError("Media not found or has been deleted.");
          return;
        }
        const displayTitle = file.fileName || "Video Recording";
        setFileName(displayTitle);
        document.title = displayTitle;
        createdUrl = URL.createObjectURL(file.blob);
        setVideoUrl(createdUrl);
      })
      .catch((err) => {
        console.error("Failed to load media:", err);
        setError("Failed to load media.");
      });

    return () => {
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, []);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full text-muted-foreground bg-background">
        <AlertCircle className="w-12 h-12 mb-4 opacity-50" />
        <p className="text-lg">{error}</p>
      </div>
    );
  }

  if (!videoUrl) {
    return (
      <div className="flex items-center justify-center w-full h-full bg-black">
        <div className="animate-pulse w-12 h-12 rounded-full bg-muted/20" />
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-full bg-black">
      <div className="flex-1 w-full h-full overflow-hidden relative group">
        <video
          src={videoUrl}
          controls
          autoPlay
          className="w-full h-full object-contain"
        />
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Viewer />
  </React.StrictMode>
);
