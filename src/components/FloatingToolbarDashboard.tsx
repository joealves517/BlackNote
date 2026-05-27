import { motion } from "framer-motion";
import {
  Code2,
  Bell,
  Smartphone,
  Settings,
  User as UserIcon
} from "lucide-react";
import { PlusIcon } from "@/components/icons/plus";
import { LayoutListIcon } from "@/components/icons/layout-list";
import { ChevronFirstIcon } from "@/components/icons/chevron-first";
import { ScanLineIcon } from "@/components/icons/scan-line";
import { MicIcon } from "@/components/icons/mic";
import { AudioLinesIcon } from "@/components/icons/audio-lines";
import { VideoIcon } from "@/components/icons/video";
import { MeetIcon } from "@/components/icons/meet";
import { MessageSquareMoreIcon } from "@/components/icons/message-square-more";
import { AppWindow } from "lucide-react";

interface FloatingToolbarDashboardProps {
  user: any;
  activePanel: string | null;
  onTogglePanel: (panel: string) => void;
  onCreateNote: () => void;
  onToolbarMediaAction: (action: "stt" | "audio" | "screen" | "meet") => void;
  onTogglePiP: () => void;
  onShowToolbar: () => void;
  onAccountClick: () => void;
}

export function FloatingToolbarDashboard({
  user,
  activePanel,
  onTogglePanel,
  onCreateNote,
  onToolbarMediaAction,
  onTogglePiP,
  onShowToolbar,
  onAccountClick,
}: FloatingToolbarDashboardProps) {

  const getUserAvatar = (user: any): string | null => {
    return user?.picture || user?.user_metadata?.avatar_url || null;
  };

  const dashboardItems = [
    {
      id: "new-note",
      label: "New",
      icon: PlusIcon,
      action: onCreateNote,
      isActive: false,
      colorClass: "from-zinc-700 to-zinc-900 dark:from-zinc-200 dark:to-zinc-100",
    },
    {
      id: "note-chat",
      label: "Chat",
      icon: MessageSquareMoreIcon,
      action: () => onTogglePanel("note-chat"),
      isActive: activePanel === "note-chat",
      colorClass: "from-violet-600 to-indigo-500",
      activeTextClass: "text-violet-600 dark:text-violet-400 font-semibold",
    },
    {
      id: "history",
      label: "Notes",
      icon: LayoutListIcon,
      action: () => onTogglePanel("history"),
      isActive: activePanel === "history",
      colorClass: "from-violet-600 to-indigo-500",
      activeTextClass: "text-violet-600 dark:text-violet-400 font-semibold",
    },
    {
      id: "clipper",
      label: "Clip",
      icon: ScanLineIcon,
      action: () => onTogglePanel("clipper"),
      isActive: activePanel === "clipper",
      colorClass: "from-violet-600 to-indigo-500",
      activeTextClass: "text-violet-600 dark:text-violet-400 font-semibold",
    },
    {
      id: "stt",
      label: "STT",
      icon: MicIcon,
      action: () => onToolbarMediaAction("stt"),
      isActive: false,
    },
    {
      id: "audio",
      label: "Audio",
      icon: AudioLinesIcon,
      action: () => onToolbarMediaAction("audio"),
      isActive: false,
    },
    {
      id: "screen",
      label: "Screen",
      icon: VideoIcon,
      action: () => onToolbarMediaAction("screen"),
      isActive: false,
    },
    {
      id: "meet",
      label: "Meet",
      icon: MeetIcon,
      action: () => onToolbarMediaAction("meet"),
      isActive: false,
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: -10, x: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: -10, x: 10 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="absolute top-0 right-0 w-[210px] backdrop-blur-md border-none shadow-[0_20px_50px_rgba(0,0,0,0.15)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.4)] rounded-[20px] pt-1.5 px-3 pb-3 flex flex-col gap-2.5 select-none z-[100]"
      style={{
        backgroundColor: "hsl(var(--sidebar-bg))",
      }}
    >
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between text-zinc-400 dark:text-zinc-500 h-5">
        <button
          onClick={onShowToolbar}
          className="p-1 rounded-lg text-zinc-400 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-100 hover:bg-sidebar-hover transition-all cursor-pointer flex items-center justify-center"
          title="Ghim thanh công cụ"
        >
          <ChevronFirstIcon size={15} className="rotate-180" />
        </button>
      </div>

      {/* ─── Lưới Chức Năng (Grid Layout) ─── */}
      <div className="grid grid-cols-3 gap-y-3 gap-x-2 justify-items-center">
        {dashboardItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={item.action}
              className="flex flex-col items-center gap-1 group cursor-pointer w-14"
            >
              {/* Icon Container */}
              <div
                className={`w-9 h-9 rounded-[10px] flex items-center justify-center transition-all duration-200 group-hover:scale-105 ${item.isActive
                  ? "bg-sidebar-active text-foreground font-semibold shadow-sm"
                  : "bg-transparent border-none text-zinc-500 dark:text-zinc-400 group-hover:bg-sidebar-hover group-hover:text-foreground"
                  }`}
              >
                <Icon className="w-5 h-5" size={20} />
              </div>

              {/* Label */}
              <span
                className={`text-[10px] tracking-tight text-center truncate w-full transition-colors ${item.isActive
                  ? "text-foreground font-semibold"
                  : "text-zinc-500 dark:text-zinc-400 group-hover:text-foreground"
                  }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* ─── Footer (Grid 3 cột đồng nhất) ─── */}
      <div className="grid grid-cols-3 gap-x-2 justify-items-center mt-2.5 w-full">
        {/* Cột 1: Popup và Settings sát nhau, căn lề trái pl-[12px] thẳng hàng chữ S của Screen */}
        <div className="w-14 flex items-center justify-start gap-1.5 pl-[12px]">
          <button
            onClick={onTogglePiP}
            className="p-1 rounded-lg text-zinc-400 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-100 hover:bg-sidebar-hover transition-all cursor-pointer flex items-center justify-center"
            title="Mở dạng cửa sổ nổi"
          >
            <AppWindow size={15} />
          </button>
          <button
            onClick={() => onTogglePanel("settings")}
            className="p-1 rounded-lg text-zinc-400 dark:text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-100 hover:bg-sidebar-hover transition-all cursor-pointer flex items-center justify-center"
            title="Cài đặt"
          >
            <Settings size={15} />
          </button>
        </div>

        {/* Cột 2: Để trống để duy trì khoảng cách grid */}
        <div className="w-14" />

        {/* Cột 3: Avatar căn lề phải pr-[2px] đối xứng tuyệt đối với nút < ở header */}
        <div className="w-14 flex items-center justify-end pr-[2px]">
          <button
            onClick={onAccountClick}
            className="w-7 h-7 rounded-full flex items-center justify-center overflow-hidden border border-zinc-200/50 dark:border-zinc-800/50 hover:scale-105 transition-transform duration-200 cursor-pointer"
            title="Tài khoản"
          >
            {!user ? (
              <div className="w-full h-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 flex items-center justify-center">
                <UserIcon className="w-3.5 h-3.5" />
              </div>
            ) : getUserAvatar(user) ? (
              <img
                src={getUserAvatar(user)!}
                alt="Avatar"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center justify-center text-[10px] font-bold">
                {(user.displayName || user.user_metadata?.full_name || user.email || "U").charAt(0).toUpperCase()}
              </div>
            )}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
