import { motion } from "framer-motion";
import { Mic, Monitor } from "lucide-react";
import { XIcon } from "@/components/icons/x";
import { CheckIcon } from "@/components/icons/check";
import { useState } from "react";
import { db } from "@/lib/local-db";

interface MediaActionSheetProps {
  mediaId: string;
  type: "audio" | "video";
  fileName: string;
  duration: number;
  onDeleteNode: () => void;
  onClose: () => void;
}

const formatTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

export function MediaActionSheet({
  mediaId,
  type,
  fileName,
  duration,
  onDeleteNode,
  onClose,
}: MediaActionSheetProps) {
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const handleDelete = () => {
    if (isConfirmingDelete) {
      // Actually delete
      onDeleteNode();
      db.media_files.delete(mediaId).catch(console.error);
      onClose();
    } else {
      // Show confirm state
      setIsConfirmingDelete(true);
      setTimeout(() => {
        setIsConfirmingDelete(false);
      }, 3000);
    }
  };

  return (
    <>
      <motion.div
        className="history-sheet-backdrop"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      />
      <motion.div
        className="history-sheet ai-shadow"
        style={{ height: "auto", paddingBottom: "24px" }}
        initial={{ bottom: "-100%" }}
        animate={{ bottom: 0 }}
        exit={{ bottom: "-100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 350, mass: 0.8 }}
      >
        <div className="history-sheet-handle" onClick={onClose}>
          <div className="history-sheet-handle-bar" />
        </div>

        <div className="history-sheet-content" style={{ padding: "0 16px" }}>
          <div className="history-sheet-section-label" style={{ marginTop: "12px", marginBottom: "8px" }}>
            <span>Media Options</span>
          </div>

          <div className="history-sheet-list" style={{ marginTop: 0 }}>
            <button
              className="history-sheet-item group"
              style={{ cursor: "default" }}
            >
              <div className="history-sheet-item-left relative flex items-center">
                <div className="flex items-center justify-center shrink-0 w-8 h-8 rounded-full bg-muted/50">
                  {type === "audio" ? (
                    <Mic className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <Monitor className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex flex-col items-start ml-3">
                  <span className="text-sm font-medium text-foreground">
                    {fileName || (type === "audio" ? "Audio Recording" : "Screen Recording")}
                  </span>
                  <span className="text-xs text-muted-foreground mt-0.5">
                    {type === "audio" ? "Audio" : "Video"} • {formatTime(duration)}
                  </span>
                </div>
              </div>

              <div className="history-sheet-item-right">
                <span
                  className="history-sheet-item-delete"
                  onClick={handleDelete}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 32,
                    height: 32,
                    padding: 0,
                    borderRadius: "50%",
                    cursor: "pointer",
                    backgroundColor: isConfirmingDelete ? "hsl(var(--destructive) / 0.15)" : "transparent",
                    color: isConfirmingDelete ? "hsl(var(--destructive))" : "hsl(var(--muted-foreground))",
                    opacity: 1,
                    transition: "all 0.2s"
                  }}
                  title={isConfirmingDelete ? "Confirm Delete" : "Delete Media"}
                >
                  {isConfirmingDelete ? (
                    <CheckIcon style={{ width: 16, height: 16 }} />
                  ) : (
                    <XIcon style={{ width: 16, height: 16 }} />
                  )}
                </span>
              </div>
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
}
