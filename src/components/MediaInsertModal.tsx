import React, { useState, useEffect, useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Loader2, Image as ImageIcon, Video, UploadCloud, Link as LinkIcon, X, Plus } from "lucide-react";
import { AI_API_BASE } from "@/lib/constants";
import { getAuthToken } from "@/lib/auth-client";

interface MediaInsertModalProps {
  uploadFn: (file: File) => Promise<string>;
}

export function MediaInsertModal({ uploadFn }: MediaInsertModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [editor, setEditor] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"photos" | "videos" | "upload" | "embed">("photos");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [embedUrl, setEmbedUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Suggested category tags for quick searching
  const quickTags = ["Minimalist", "Workspace", "Nature", "Abstract", "City", "Wallpapers"];

  useEffect(() => {
    const handleOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setEditor(detail.editor);
      setIsOpen(true);
      // Reset state
      setSearchQuery("");
      setResults([]);
      setActiveTab("photos");
      setEmbedUrl("");
    };
    window.addEventListener("open-media-insert-modal", handleOpen);
    return () => window.removeEventListener("open-media-insert-modal", handleOpen);
  }, []);

  // Run initial search when opening
  useEffect(() => {
    if (isOpen && (activeTab === "photos" || activeTab === "videos")) {
      handleSearch(searchQuery || "Minimalist", true);
    }
  }, [isOpen, activeTab]);

  const handleSearch = async (queryStr: string, isNewSearch = true) => {
    setLoading(true);
    const nextPage = isNewSearch ? 1 : page + 1;
    try {
      const token = await getAuthToken();
      const res = await fetch(
        `${AI_API_BASE}/api/pexels/search?query=${encodeURIComponent(queryStr)}&type=${activeTab}&page=${nextPage}&perPage=16`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!res.ok) throw new Error("Search failed");

      const data = await res.json();
      const newItems = activeTab === "videos" ? (data.videos || []) : (data.photos || []);

      if (isNewSearch) {
        setResults(newItems);
      } else {
        setResults((prev) => [...prev, ...newItems]);
      }
      setPage(nextPage);
    } catch (err) {
      console.error("[Pexels Search] Error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleInsertMedia = (url: string, type: "image" | "video", titleStr?: string, videoDuration?: number) => {
    if (!editor) return;

    if (type === "image") {
      editor.chain().focus().setImage({ src: url }).run();
    } else {
      editor.chain().focus().insertContent({
        type: "videoNode",
        attrs: {
          mediaId: crypto.randomUUID(),
          status: "saved",
          fileName: titleStr || "Pexels Stock Video",
          duration: videoDuration || 15,
          src: url,
        },
      }).run();
    }
    setIsOpen(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length || !editor) return;
    setIsUploading(true);
    try {
      const file = e.target.files[0];
      const url = await uploadFn(file);
      editor.chain().focus().setImage({ src: url }).run();
      setIsOpen(false);
    } catch (err) {
      console.error("[MediaUpload] Upload failed:", err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleEmbedSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!embedUrl.trim() || !editor) return;

    const lowerUrl = embedUrl.toLowerCase();
    const isVideo = lowerUrl.endsWith(".mp4") || lowerUrl.endsWith(".webm") || lowerUrl.includes("youtube.com") || lowerUrl.includes("youtu.be");

    handleInsertMedia(embedUrl.trim(), isVideo ? "video" : "image");
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-[1000] bg-black/40 backdrop-blur-sm"
              />
            </Dialog.Overlay>

            <Dialog.Content asChild aria-describedby={undefined}>
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: "-47%", x: "-50%" }}
                animate={{ opacity: 1, scale: 1, y: "-50%", x: "-50%" }}
                exit={{ opacity: 0, scale: 0.96, y: "-47%", x: "-50%" }}
                transition={{ type: "spring", duration: 0.35 }}
                className="fixed top-1/2 left-1/2 z-[1001] w-full max-w-[520px] h-[600px] bg-background text-foreground border border-border shadow-2xl flex flex-col rounded-[24px] outline-none overflow-hidden"
              >
                {/* Header Ambient Blur */}
                <div className="absolute top-0 right-0 w-64 h-32 bg-[radial-gradient(circle_at_top_right,rgba(168,85,247,0.12),transparent_60%)] pointer-events-none" />
                <div className="absolute top-0 left-0 w-64 h-32 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.08),transparent_60%)] pointer-events-none" />

                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-4.5 pb-3.5 border-b border-border/40 relative z-10">
                  <Dialog.Title className="text-base font-bold tracking-tight">
                    Insert Media
                  </Dialog.Title>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-1.5 rounded-full hover:bg-muted/70 transition-colors text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <X size={15} />
                  </button>
                </div>

                {/* Tab Navigation */}
                <div className="flex items-center gap-1.5 px-5 py-2.5 bg-muted/30 border-b border-border/20 relative z-10">
                  {[
                    { id: "photos", label: "Stock Photos", icon: <ImageIcon size={14} /> },
                    { id: "videos", label: "Stock Videos", icon: <Video size={14} /> },
                    { id: "upload", label: "Upload", icon: <UploadCloud size={14} /> },
                    { id: "embed", label: "Embed Link", icon: <LinkIcon size={14} /> },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all cursor-pointer ${
                        activeTab === tab.id
                          ? "bg-foreground text-background shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      {tab.icon}
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Tab Contents */}
                <div className="flex-1 overflow-hidden flex flex-col p-5 relative z-10">
                  {(activeTab === "photos" || activeTab === "videos") && (
                    <div className="flex-1 flex flex-col overflow-hidden gap-3.5">
                      {/* Search Bar */}
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (searchQuery.trim()) handleSearch(searchQuery.trim(), true);
                        }}
                        className="relative w-full"
                      >
                        <input
                          ref={searchInputRef}
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder={`Search Pexels stock ${activeTab}...`}
                          className="w-full h-9.5 pl-9 pr-4 text-xs font-semibold bg-muted/65 focus:bg-background border border-border/60 focus:border-foreground/45 rounded-full outline-none transition-all placeholder:text-muted-foreground/60"
                        />
                        <Search className="absolute left-3 top-3 h-3.5 w-3.5 text-muted-foreground/60" />
                      </form>

                      {/* Quick suggested chips */}
                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        {quickTags.map((tag) => (
                          <button
                            key={tag}
                            onClick={() => {
                              setSearchQuery(tag);
                              handleSearch(tag, true);
                            }}
                            className="px-2.5 py-1 text-[10px] font-bold bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/20 rounded-full transition-all cursor-pointer"
                          >
                            {tag}
                          </button>
                        ))}
                      </div>

                      {/* Search Results Grid */}
                      <div className="flex-1 overflow-y-auto no-scrollbar pr-0.5">
                        {loading && results.length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
                            <Loader2 className="animate-spin text-muted-foreground/80" size={20} />
                            <span className="text-xs font-medium">Searching stock library...</span>
                          </div>
                        ) : results.length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                            <span className="text-xs font-medium">No media found. Try another query!</span>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-3.5 pb-4">
                            {results.map((item) => {
                              const isVid = activeTab === "videos";
                              const mediaUrl = isVid
                                ? item.video_files?.[0]?.link
                                : item.src?.large2x || item.src?.original;
                              const previewUrl = isVid
                                ? item.video_pictures?.[0]?.picture
                                : item.src?.medium || item.src?.small;
                              const author = isVid ? item.user?.name : item.photographer;

                              if (!mediaUrl) return null;

                              return (
                                <div
                                  key={item.id}
                                  onClick={() => handleInsertMedia(mediaUrl, isVid ? "video" : "image", `Pexels Video: ${author}`, item.duration)}
                                  className="relative aspect-[4/3] rounded-2xl overflow-hidden border border-border/30 hover:border-foreground/30 shadow-sm group cursor-pointer bg-muted transition-all"
                                >
                                  <img
                                    src={previewUrl}
                                    alt={author}
                                    className="w-full h-full object-cover group-hover:scale-[1.04] transition-all duration-300 select-none"
                                    loading="lazy"
                                  />
                                  {/* Hover overlay gradient */}
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                                    <div className="flex items-center justify-between text-white">
                                      <span className="text-[10px] font-bold truncate max-w-[120px]">
                                        by {author}
                                      </span>
                                      <div className="p-1 rounded-full bg-white text-black shrink-0">
                                        <Plus size={11} strokeWidth={2.5} />
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Load More Button */}
                        {results.length > 0 && (
                          <div className="flex justify-center pt-2 pb-5">
                            <button
                              onClick={() => handleSearch(searchQuery || "Minimalist", false)}
                              disabled={loading}
                              className="px-5 py-2 text-xs font-bold text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted/70 rounded-full border border-border/20 flex items-center gap-1.5 disabled:opacity-50 transition-all cursor-pointer"
                            >
                              {loading && <Loader2 className="animate-spin" size={12} />}
                              Load More
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {activeTab === "upload" && (
                    <div className="flex-1 flex flex-col items-center justify-center">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        id="media-file-input"
                        className="hidden"
                        disabled={isUploading}
                      />
                      <label
                        htmlFor="media-file-input"
                        className="w-full max-w-[320px] aspect-[4/3] rounded-3xl border border-dashed border-border/80 hover:border-foreground/45 flex flex-col items-center justify-center gap-3.5 bg-muted/20 hover:bg-muted/40 transition-all cursor-pointer group"
                      >
                        {isUploading ? (
                          <Loader2 className="animate-spin text-muted-foreground" size={26} />
                        ) : (
                          <UploadCloud className="text-muted-foreground group-hover:text-foreground group-hover:scale-105 transition-all duration-300" size={32} />
                        )}
                        <div className="flex flex-col items-center text-center">
                          <span className="text-xs font-bold">
                            {isUploading ? "Uploading file to S3..." : "Click or drag file to upload"}
                          </span>
                          <span className="text-[10px] font-semibold text-muted-foreground mt-1">
                            Supports PNG, JPG, WEBP, GIF
                          </span>
                        </div>
                      </label>
                    </div>
                  )}

                  {activeTab === "embed" && (
                    <div className="flex-1 flex flex-col items-center justify-center p-4">
                      <form onSubmit={handleEmbedSubmit} className="w-full max-w-[360px] flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-bold text-muted-foreground">
                            Media Link
                          </label>
                          <input
                            type="url"
                            value={embedUrl}
                            onChange={(e) => setEmbedUrl(e.target.value)}
                            placeholder="Paste direct URL to image or video..."
                            className="w-full h-10 px-4 text-xs font-semibold bg-muted/60 border border-border/70 focus:border-foreground/40 rounded-xl outline-none focus:bg-background transition-all placeholder:text-muted-foreground/60"
                            required
                          />
                        </div>

                        <button
                          type="submit"
                          className="w-full h-10 bg-foreground text-background hover:opacity-90 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm"
                        >
                          <Plus size={14} strokeWidth={2.5} />
                          Insert Link
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </AnimatePresence>
  );
}
