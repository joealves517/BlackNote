import { ScanTextIcon } from "@/components/icons/scan-text";
import { CircleHelpIcon } from "@/components/icons/circle-help";
import { PlusIcon } from "@/components/icons/plus";
import { LayoutListIcon } from "@/components/icons/layout-list";
import { MoonIcon } from "@/components/icons/moon";
import { SunIcon } from "@/components/icons/sun";
import { ChevronFirstIcon } from "@/components/icons/chevron-first";
import { ScanLineIcon } from "@/components/icons/scan-line";
import { MicIcon } from "@/components/icons/mic";
import { AudioLinesIcon } from "@/components/icons/audio-lines";
import { VideoIcon } from "@/components/icons/video";
import { MeetIcon } from "@/components/icons/meet";
import { MessageSquareMoreIcon } from "@/components/icons/message-square-more";
import { SettingsIcon } from "@/components/ui/settings";
import { AnimatedIcon } from "@/components/icons/AnimatedIcon";
import { motion, AnimatePresence } from "framer-motion";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { useState, useCallback, useEffect, useRef } from "react";
import { Mic, MicOff, Menu, Sparkles, AppWindow, PanelRight } from "lucide-react";
import { NoteEditor } from "@/components/NoteEditor";
import { RecordingHeader } from "@/components/RecordingHeader";
import { AIErrorSheet } from "@/components/AIErrorSheet";
import { RecordingErrorSheet, classifyRecordingError, type RecordingErrorInfo } from "@/components/RecordingErrorSheet";
import { RecordingLimitSheet } from "@/components/RecordingLimitSheet";
import { SignOutConfirmSheet } from "@/components/SignOutConfirmSheet";
import { HistorySheet } from "@/components/HistorySheet";
import { MediaActionSheet } from "@/components/MediaActionSheet";
import { AccountPopup } from "@/components/AccountPopup";
import { SupportActionSheet } from "@/components/SupportActionSheet";
import { WebClipper } from "@/components/WebClipper";
import { ImageClipper } from "@/components/ImageClipper";
import { LoaderIcon } from "@/components/ui/loader";
import { GripIcon } from "@/components/icons/grip";
import { GlobalTooltip } from "@/components/Tooltip";
import { db } from "@/lib/local-db";
import { useNotes } from "@/hooks/use-notes";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { useCredits } from "@/hooks/use-credits";
import { useRecorder } from "@/hooks/use-recorder";
import { ArrowBigUpDashIcon } from "@/components/icons/arrow-big-up-dash";
import { ChessKingIcon } from "@/components/icons/chess-king";
import { HandMetalIcon } from "@/components/icons/hand-metal";
import { HeartHandshakeIcon } from "@/components/icons/heart-handshake";

import { CHECKOUT_BASE } from "@/lib/constants";
import { openSparkAIWithContext } from "@/lib/ecosystem";
import { analyzeMedia } from "@/lib/media-ai-service";

function GoogleIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.16v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.16C1.43 8.55 1 10.22 1 12s.43 3.45 1.16 4.93l3.68-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.16 7.07l3.68 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function getUserAvatar(user: any): string | null {
  return user?.picture || user?.user_metadata?.avatar_url || null;
}

const GuestAvatarIcon = () => {
  const [lottie, setLottie] = useState<any>(null);
  return (
    <div
      className="w-[26px] h-[26px] rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
      onMouseDown={() => {
        if (lottie) {
          lottie.setFrame(0);
          lottie.play();
        }
      }}
    >
      <div style={{ width: "100%", height: "100%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", transform: "scale(2.2)" }}>
        <DotLottieReact
          src={chrome.runtime.getURL("guest-avatar.json")}
          autoplay={false}
          loop={false}
          backgroundColor="transparent"
          dotLottieRefCallback={setLottie}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
};

export function App() {
  const { user, loading: authLoading, signInWithGoogle, signOut } = useAuth();
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showWelcomeOverlay, setShowWelcomeOverlay] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  useEffect(() => {
    const handleMessage = (msg: any) => {
      if (msg.type === "REGION_CAPTURED" && msg.dataUrl) {
        setCapturedImage(msg.dataUrl);
      }
    };
    browser.runtime.onMessage.addListener(handleMessage);
    return () => {
      browser.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  const {
    notes,
    activeNote,
    activeNoteId,
    searchQuery,
    loading: notesLoading,
    syncProgress,
    setActiveNoteId,
    setSearchQuery,
    createNote,
    updateNote,
    deleteNote,
    createNoteWithContent,
  } = useNotes(user?.id);

  // Check for welcome note to show overlay
  useEffect(() => {
    const hasSeenWelcome = localStorage.getItem("blacknote_seen_welcome_overlay");
    if (!hasSeenWelcome && notes.length > 0) {
      const hasWelcomeNote = notes.some((n: any) => n.title.toLowerCase().includes("welcome"));
      if (hasWelcomeNote) {
        setShowWelcomeOverlay(true);
      }
    }
  }, [notes]);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      await signInWithGoogle();
    } finally {
      setIsLoggingIn(false);
    }
  };

  const { theme, toggleTheme } = useTheme();
  const { credits, refreshCredits } = useCredits(user?.id);
  const isPremium = credits?.tier === "premium";
  const isQuotaExhausted = isPremium && credits?.credits !== undefined && credits.credits <= 0;

  const recorder = useRecorder();
  const recorderRef2 = useRef(recorder);
  recorderRef2.current = recorder;
  const userRef = useRef(user);
  userRef.current = user;

  const isRecording = recorder.state === "requesting" || recorder.state === "recording" || recorder.state === "paused" || recorder.state === "saving";

  // Store editor ref for inserting media nodes after recording stops
  const recordingEditorRef = useRef<any>(null);

  const previousRecorderState = useRef(recorder.state);
  // Remove region overlay when recording stops
  useEffect(() => {
    if ((previousRecorderState.current === "recording" || previousRecorderState.current === "paused") && (recorder.state === "idle" || recorder.state === "saving")) {
      chrome.windows.getLastFocused({ windowTypes: ['normal'] }).then((win) => {
        if (win?.id) {
          chrome.tabs.query({ active: true, windowId: win.id }).then(([tab]) => {
            if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: "STOP_REGION_SELECTION" }).catch(() => { });
          });
        }
      });
    }
    previousRecorderState.current = recorder.state;
  }, [recorder.state]);

  const [activePanel, setActivePanel] = useState<"history" | "clipper" | "account" | "note-chat" | "settings" | "support" | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showRightToolbar, setShowRightToolbar] = useState(true);
  const [showClipper, setShowClipper] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [showSupportSheet, setShowSupportSheet] = useState(false);
  const [accountGuestText, setAccountGuestText] = useState<{ title?: string; subtitle?: string } | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [proIconIndex, setProIconIndex] = useState(() => Math.floor(Math.random() * 3));
  const headerProIconRef = useRef<any>(null);

  // Re-randomize Pro icon when extension is reopened (visibility changes)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        setProIconIndex(Math.floor(Math.random() * 3));
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);


  const [aiErrorVisible, setAiErrorVisible] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [recErrorInfo, setRecErrorInfo] = useState<{ info: RecordingErrorInfo; retryMode: "audio" | "screen" | "meet"; editor?: any } | null>(null);
  const [isSTTActive, setIsSTTActive] = useState(false);
  const [sttElapsed, setSttElapsed] = useState(0);
  const [meetStatus, setMeetStatus] = useState<string>("READY");

  const [isMeetSyncActive, setIsMeetSyncActive] = useState(false);
  const [meetElapsed, setMeetElapsed] = useState(0);

  // --- Recording Limit Logic ---
  const FREE_LIMIT_SECONDS = 1200; // 20 minutes
  const WARNING_SECONDS = 1140; // 19 minutes
  const [recordingLimitTimeLeft, setRecordingLimitTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!isPremium && isRecording) {
      if (recorder.elapsed >= FREE_LIMIT_SECONDS) {
        setRecordingLimitTimeLeft(0);
        // Force stop recording only if it's currently recording
        if (recorder.state === "recording" || recorder.state === "paused") {
          recorder.stopRecording();
        }
      } else if (recorder.elapsed >= WARNING_SECONDS) {
        setRecordingLimitTimeLeft(FREE_LIMIT_SECONDS - recorder.elapsed);
      } else {
        setRecordingLimitTimeLeft(null);
      }
    } else if (!isRecording && recordingLimitTimeLeft !== 0) {
      // Clear warning when recording stops manually, unless we hit the limit
      setRecordingLimitTimeLeft(null);
    }
  }, [recorder.elapsed, isRecording, isPremium, recorder.state]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isSTTActive) {
      setSttElapsed(0);
      interval = setInterval(() => setSttElapsed(prev => prev + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [isSTTActive]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isMeetSyncActive) {
      if (meetStatus === "READY") {
        interval = setInterval(() => setMeetElapsed(prev => prev + 1), 1000);
      }
    } else {
      setMeetElapsed(0);
    }
    return () => clearInterval(interval);
  }, [isMeetSyncActive, meetStatus]);
  const [mediaSheetConfig, setMediaSheetConfig] = useState<{
    mediaId: string;
    type: "audio" | "video";
    noteId: string;
    fileName: string;
    duration: number;
    onDeleteNode: () => void;
  } | null>(null);

  const [globalAiThinking, setGlobalAiThinking] = useState(false);
  const globalAiThinkingRef = useRef(false);
  const [globalAiMessages, setGlobalAiMessages] = useState<string[]>(["Thinking"]);

  useEffect(() => {
    const handlePanelClosed = () => setActivePanel(null);
    
    const syncPanelState = (panel: "history" | "clipper" | "account" | "note-chat" | "settings" | "support") => {
      setActivePanel(panel);
      setShowHistory(panel === "history");
      setShowClipper(panel === "clipper");
      setShowAccountMenu(panel === "account");
      setShowSupportSheet(panel === "support");
      if (panel !== "note-chat") window.dispatchEvent(new CustomEvent("close-note-chat"));
      if (panel !== "settings") window.dispatchEvent(new CustomEvent("close-import-export-sheet"));
    };

    const onOpenNoteChat = () => syncPanelState("note-chat");
    const onOpenSettings = () => syncPanelState("settings");
    const onOpenClipper = () => syncPanelState("clipper");
    const onOpenHistory = () => syncPanelState("history");
    const onOpenSupport = () => syncPanelState("support");

    window.addEventListener("panel-closed", handlePanelClosed);
    window.addEventListener("open-note-chat", onOpenNoteChat);
    window.addEventListener("open-import-export-sheet", onOpenSettings);
    window.addEventListener("open-web-clipper", onOpenClipper);
    window.addEventListener("trigger-clipper", onOpenClipper);
    window.addEventListener("open-support-sheet", onOpenSupport);

    return () => {
      window.removeEventListener("panel-closed", handlePanelClosed);
      window.removeEventListener("open-note-chat", onOpenNoteChat);
      window.removeEventListener("open-import-export-sheet", onOpenSettings);
      window.removeEventListener("open-web-clipper", onOpenClipper);
      window.removeEventListener("trigger-clipper", onOpenClipper);
      window.removeEventListener("open-support-sheet", onOpenSupport);
    };
  }, []);

  const handleTogglePanel = useCallback((panel: "history" | "clipper" | "account" | "note-chat" | "settings" | "support") => {
    // Dismiss tooltips
    document.querySelectorAll("[data-tippy-root]").forEach((el) => {
      const instance = (el as any)._tippy;
      if (instance) instance.hide();
    });
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    window.getSelection()?.removeAllRanges();

    const next = activePanel === panel ? null : panel;

    setActivePanel(next);
    setShowHistory(next === "history");
    setShowClipper(next === "clipper");
    setShowAccountMenu(next === "account");
    setShowSupportSheet(next === "support");

    if (next === "note-chat") {
      window.dispatchEvent(new CustomEvent("open-note-chat"));
    } else {
      window.dispatchEvent(new CustomEvent("close-note-chat"));
    }

    if (next === "settings") {
      window.dispatchEvent(new CustomEvent("open-import-export-sheet"));
    } else {
      window.dispatchEvent(new CustomEvent("close-import-export-sheet"));
    }
  }, [activePanel]);

  // ─── Always on Top (Pop-out Window) ───
  const [isPinnedToTop, setIsPinnedToTop] = useState(false);
  const pipWindowRef = useRef<number | null>(null);

  // Detect if THIS instance is the pop-out window (via URL param from background)
  const isPopoutInstance = useRef(
    new URLSearchParams(window.location.search).get("popout") === "1"
  );
  
  const sourceWindowId = useRef(
    new URLSearchParams(window.location.search).get("sourceWindowId")
  );

  // Track if a pop-out window is active (for the side panel instance to show placeholder)
  const [popoutActive, setPopoutActive] = useState(false);

  // On mount: check if a pop-out is already active; listen for changes
  useEffect(() => {
    // Mark this pop-out instance as active
    if (isPopoutInstance.current) {
      chrome.storage.local.set({ blacknote_popout_active: true });

      // When this pop-out window closes, clear the flag
      const handleBeforeUnload = () => {
        chrome.storage.local.set({ blacknote_popout_active: false });
      };
      window.addEventListener("beforeunload", handleBeforeUnload);
      return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }

    // Side panel instance: listen for pop-out state changes
    chrome.storage.local.get("blacknote_popout_active", (res) => {
      setPopoutActive(!!res.blacknote_popout_active);
    });

    const handleStoragePopout = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.blacknote_popout_active) {
        const isActive = !!changes.blacknote_popout_active.newValue;
        setPopoutActive(isActive);
        
        // If the side panel detects the popout just became active,
        // we can close the side panel to completely switch to the popout
        if (isActive && !isPopoutInstance.current) {
          window.close();
        }
      }
    };
    chrome.storage.local.onChanged.addListener(handleStoragePopout);
    return () => chrome.storage.local.onChanged.removeListener(handleStoragePopout);
  }, []);

  // ─── Pop-out toggle handler ───
  const handleTogglePiP = useCallback(async () => {
    // If THIS is the pop-out instance, clicking the pin button closes it and returns to side panel
    if (isPopoutInstance.current) {
      // Send the message synchronously to preserve the user gesture
      const winId = sourceWindowId.current ? parseInt(sourceWindowId.current, 10) : undefined;
      if (winId) {
        chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL", windowId: winId });
      }
      setTimeout(() => window.close(), 50); // Small delay to ensure message fires
      return;
    }

    // If already popped out from the side panel, close the window via background script
    if (isPinnedToTop && pipWindowRef.current) {
      chrome.runtime.sendMessage({
        type: "CLOSE_PIP_WINDOW",
        windowId: pipWindowRef.current,
      });
      pipWindowRef.current = null;
      setIsPinnedToTop(false);
      return;
    }

    try {
      const container = document.getElementById("blacknote-app-container");
      const width = container?.clientWidth || 420;
      const height = container?.clientHeight || 650;
      
      const currentWin = await chrome.windows.getCurrent();

      // Calculate position relative to the main browser window (assuming side panel is on the right)
      const left = currentWin.left !== undefined && currentWin.width !== undefined
        ? currentWin.left + currentWin.width - width
        : undefined;
      
      // Use the same top coordinate as the browser window
      const top = currentWin.top !== undefined ? currentWin.top : undefined;

      const response = await chrome.runtime.sendMessage({
        type: "OPEN_PIP_WINDOW",
        payload: { width, height, sourceWindowId: currentWin.id, left, top },
      });

      if (response?.windowId) {
        pipWindowRef.current = response.windowId;
        setIsPinnedToTop(true);
        // Automatically close the side panel when the pop-out is opened
        if (!isPopoutInstance.current) {
          window.close();
        }
      }
    } catch (err) {
      console.error("Failed to open pop-out window:", err);
    }
  }, [isPinnedToTop]);

  // Removed Global AI Thinking listener as all thinking states are now localized in bottom sheets.

  useEffect(() => {
    const handleOpenMediaSheet = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setMediaSheetConfig(detail);
    };
    window.addEventListener("open-media-sheet", handleOpenMediaSheet);
    return () => window.removeEventListener("open-media-sheet", handleOpenMediaSheet);
  }, []);

  useEffect(() => {
    const handleSTTState = (e: any) => setIsSTTActive(e.detail);
    window.addEventListener("stt-state-changed", handleSTTState);
    return () => window.removeEventListener("stt-state-changed", handleSTTState);
  }, []);

  useEffect(() => {
    const handleStartMeetSync = async () => {
      const tabs = await chrome.tabs.query({ url: "*://meet.google.com/*" });
      if (tabs.length === 0) {
        setRecErrorInfo({
          info: { code: "MEET_NO_TAB", title: "Google Meet Not Found", message: "No active Google Meet tab was found. Please open Google Meet and join a meeting first." },
          retryMode: "meet"
        });
        return;
      }
      setMeetStatus("PENDING");
      setIsMeetSyncActive(true);
      setMeetElapsed(0);
      tabs.forEach(tab => {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, { action: "start-meet-sync" }).catch(() => { });
        }
      });
    };

    const handleStopMeetSync = async () => {
      setIsMeetSyncActive(false);
      setMeetStatus("READY");
      setRecErrorInfo(prev => prev?.retryMode === "meet" ? null : prev);
      const tabs = await chrome.tabs.query({ url: "*://meet.google.com/*" });
      tabs.forEach(tab => {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, { action: "stop-meet-sync" }).catch(() => { });
        }
      });
    };

    window.addEventListener("start-meet-sync", handleStartMeetSync);
    window.addEventListener("stop-meet-sync", handleStopMeetSync);

    return () => {
      window.removeEventListener("start-meet-sync", handleStartMeetSync);
      window.removeEventListener("stop-meet-sync", handleStopMeetSync);
    };
  }, []);

  useEffect(() => {
    const handleMessage = (msg: any) => {
      if (msg.type === "MEET_STATUS") {
        setMeetStatus(msg.status);
        if (msg.status === "READY") {
          setRecErrorInfo(null); // Auto-dismiss the error sheet when resolved!
        } else if (msg.status === "NOT_JOINED") {
          setRecErrorInfo({
            info: { code: "MEET_NOT_JOINED", title: "Meeting Not Joined", message: "You haven't joined a Google Meet room yet. Please join the meeting before starting live sync." },
            retryMode: "meet"
          });
        } else if (msg.status === "CC_OFF") {
          setRecErrorInfo({
            info: { code: "MEET_CC_OFF", title: "Captions (CC) Disabled", message: "Please click the [CC] button in Google Meet so BlackNote can read the meeting transcript." },
            retryMode: "meet"
          });
        }
      }

      if (msg.type === "MEET_SYNC_FINISHED") {
        window.dispatchEvent(new CustomEvent("stop-meet-sync"));
      }

      if (msg.type === "MEET_CAPTION") {
        const editor = (window as any).blackNoteMeetEditor;
        if (editor) {
          // ALWAYS insert at the very end of the document to protect the user's active cursor
          // This allows the user to freely edit the note while meeting captions stream at the bottom
          const docSize = editor.state.doc.content.size;
          if (msg.isNewSpeaker) {
            const htmlToInsert = `<p><strong>${msg.speaker}:</strong> ${msg.text}</p>`;
            editor.chain().insertContentAt(docSize, htmlToInsert).run();
          } else {
            // Append to the last paragraph
            const insertPos = Math.max(0, docSize - 1);
            const textToInsert = ` ${msg.text}`;
            editor.chain().insertContentAt(insertPos, textToInsert).run();
          }
        }
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

  useEffect(() => {
    const handleSaveTranscript = async (e: Event) => {
      const { noteId, transcriptRecord } = (e as CustomEvent).detail;
      if (!noteId || !transcriptRecord) return;
      const note = await db.notes.get(noteId);
      if (note) {
        const currentTranscripts = note.mediaTranscripts ? JSON.parse(note.mediaTranscripts) : {};
        currentTranscripts[transcriptRecord.mediaId] = transcriptRecord;
        updateNote(noteId, { mediaTranscripts: JSON.stringify(currentTranscripts) });
      }
    };
    window.addEventListener("save-transcript", handleSaveTranscript);
    return () => window.removeEventListener("save-transcript", handleSaveTranscript);
  }, [updateNote]);

  // Listen for real-time background chunk transcription events
  useEffect(() => {
    const handler = (msg: any) => {
      if (msg.type === "TRANSCRIBE_CHUNK" && msg.payload) {
        const { mediaId, chunkId } = msg.payload;
        // Import dynamically to avoid top-level dependencies if needed, or just call it:
        import("@/lib/media-ai-service").then((mod) => {
          mod.transcribeChunk(mediaId, chunkId).catch(console.error);
        });
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  // ── Recording slash command listeners ──
  useEffect(() => {
    const removeEditorNode = (editor: any, nodeType: string, mediaId: string) => {
      editor.state.doc.descendants((node: any, pos: number) => {
        if (node.type.name === nodeType && node.attrs.mediaId === mediaId) {
          editor.chain().focus().command(({ tr }: { tr: any }) => {
            tr.delete(pos, pos + node.nodeSize);
            return true;
          }).run();
          return false;
        }
      });
    };

    const handleAudioRecording = async (e: Event) => {
      // Auth guard — require login
      if (!userRef.current) {
        setAccountGuestText({ title: "Unlock Recording", subtitle: "Sign in to record audio and capture your ideas." });
        setShowAccountMenu(true);
        return;
      }
      const detail = (e as CustomEvent).detail;
      const skipMic = detail?.skipMic || false;
      let insertedMediaId = "";
      if (detail?.editor) {
        recordingEditorRef.current = detail.editor;
        insertedMediaId = `media_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        detail.editor.chain().focus().insertContent({
          type: "audioNode",
          attrs: { mediaId: insertedMediaId, status: "recording", duration: 0, fileName: "Recording..." },
        }).run();
      }
      try {
        await recorderRef2.current.startAudioRecording(skipMic, isPremium);
      } catch (err: any) {
        console.warn("[App] Audio recording failed:", err?.name, err?.message);
        // Remove the inserted node since recording failed
        if (detail?.editor && insertedMediaId) {
          removeEditorNode(detail.editor, "audioNode", insertedMediaId);
        }
        recordingEditorRef.current = null;
        // Show the error sheet — preserve editor ref for retry
        setRecErrorInfo({ info: classifyRecordingError(err), retryMode: "audio", editor: detail?.editor });
      }
    };

    const handleScreenRecording = async (e: Event) => {
      // Auth guard — require login
      if (!userRef.current) {
        setAccountGuestText({ title: "Unlock Screen Capture", subtitle: "Sign in to record your screen and create video notes." });
        setShowAccountMenu(true);
        return;
      }
      const detail = (e as CustomEvent).detail;
      const skipMic = detail?.skipMic || false;
      let insertedMediaId = "";
      if (detail?.editor) {
        recordingEditorRef.current = detail.editor;
        insertedMediaId = `media_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        detail.editor.chain().focus().insertContent({
          type: "videoNode",
          attrs: { mediaId: insertedMediaId, status: "recording", duration: 0, fileName: "Recording..." },
        }).run();
      }
      try {
        const success = await recorderRef2.current.startScreenRecording(skipMic, isPremium);
        if (!success && detail?.editor && insertedMediaId) {
          removeEditorNode(detail.editor, "videoNode", insertedMediaId);
          recordingEditorRef.current = null;
        }
      } catch (err: any) {
        console.warn("[App] Screen recording failed:", err?.name, err?.message);
        if (detail?.editor && insertedMediaId) {
          removeEditorNode(detail.editor, "videoNode", insertedMediaId);
        }
        recordingEditorRef.current = null;
        setRecErrorInfo({ info: classifyRecordingError(err), retryMode: "screen", editor: detail?.editor });
      }
    };

    window.addEventListener("start-audio-recording", handleAudioRecording);
    window.addEventListener("start-screen-recording", handleScreenRecording);
    return () => {
      window.removeEventListener("start-audio-recording", handleAudioRecording);
      window.removeEventListener("start-screen-recording", handleScreenRecording);
    };
  }, []); // stable — uses ref

  // ── Shared stop/discard handlers (used by both Header and Toolbar) ──
  const handleRecordingStop = useCallback(async () => {
    const result = await recorder.stopRecording();
    if (result && recordingEditorRef.current) {
      const editor = recordingEditorRef.current;
      const nodeType = result.type === "audio" ? "audioNode" : "videoNode";
      const { doc } = editor.state;
      let targetPos: number | null = null;

      doc.descendants((node: any, pos: number) => {
        if (node.type.name === nodeType && node.attrs.status === "recording") {
          targetPos = pos;
          return false;
        }
      });

      if (targetPos !== null) {
        editor.chain().focus()
          .command(({ tr }: { tr: any }) => {
            tr.setNodeMarkup(targetPos!, undefined, {
              mediaId: result.mediaId,
              status: "saved",
              duration: result.duration,
              fileName: result.type === "audio"
                ? `Meeting Audio ${new Date().toLocaleDateString()}`
                : `Screen Recording ${new Date().toLocaleDateString()}`,
            });
            return true;
          })
          .run();
      }
      recordingEditorRef.current = null;

      // Auto-transcribe in background (so AI menu is ready when user clicks the node)
      if (result && activeNoteId) {
        analyzeMedia(result.mediaId, activeNoteId, (prog) => {
          window.dispatchEvent(
            new CustomEvent("bg-transcribe-progress", {
              detail: { mediaId: result.mediaId, ...prog },
            })
          );
        }).catch((err) => {
          console.warn("[Auto-transcribe]", err?.message);
          window.dispatchEvent(
            new CustomEvent("bg-transcribe-progress", {
              detail: { mediaId: result.mediaId, step: "error", message: err?.message || "Transcription failed", percent: 0 },
            })
          );
        });
      }
    }
  }, [recorder, activeNoteId]);

  const handleRecordingDiscard = useCallback(() => {
    const currentMode = recorder.mode;
    recorder.discardRecording();
    if (recordingEditorRef.current) {
      const editor = recordingEditorRef.current;
      const nodeType = currentMode === "audio" ? "audioNode" : "videoNode";
      const { doc } = editor.state;

      doc.descendants((node: any, pos: number) => {
        if (node.type.name === nodeType && node.attrs.status === "recording") {
          editor.chain().focus()
            .command(({ tr }: { tr: any }) => {
              tr.delete(pos, pos + node.nodeSize);
              return true;
            })
            .run();
          return false;
        }
      });
      recordingEditorRef.current = null;
    }
  }, [recorder]);

  // Listen for toolbar commands dispatched from use-recorder
  useEffect(() => {
    const onToolbarStop = () => handleRecordingStop();
    const onToolbarDiscard = () => handleRecordingDiscard();

    window.addEventListener("toolbar-stop-recording", onToolbarStop);
    window.addEventListener("toolbar-discard-recording", onToolbarDiscard);
    return () => {
      window.removeEventListener("toolbar-stop-recording", onToolbarStop);
      window.removeEventListener("toolbar-discard-recording", onToolbarDiscard);
    };
  }, [handleRecordingStop, handleRecordingDiscard]);

  // Listen for STT errors to show the error sheet
  useEffect(() => {
    const handleSttError = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const code = detail?.code;
      if (code === "NO_DEVICE") {
        setRecErrorInfo({
          info: {
            code: "STT_NO_MIC",
            title: "No Microphone Found",
            message: "Speech-to-Text requires a microphone. Please connect a microphone and try again.",
          },
          retryMode: "audio",
        });
      } else if (code === "NOT_ALLOWED") {
        setRecErrorInfo({
          info: {
            code: "NOT_ALLOWED",
            title: "Microphone Permission Required",
            message: "Speech-to-Text needs microphone access. Please grant permission and try again.",
          },
          retryMode: "audio",
        });
      }
    };
    window.addEventListener("stt-error", handleSttError);
    return () => window.removeEventListener("stt-error", handleSttError);
  }, []);

  const scrollProgressRef = useRef(0);
  const headerRef = useRef<HTMLDivElement>(null);

  const handleScrollProgress = useCallback((progress: number) => {
    // --- DYNAMIC ISLAND LOGIC COMMENTED OUT FOR APPLE GLASS BLOCKS ---
    /*
    scrollProgressRef.current = progress;
    const el = headerRef.current;
    if (!el) return;

    if (globalAiThinkingRef.current) {
      el.style.top = '0px';
      el.style.left = '0px';
      el.style.right = '0px';
      el.style.height = '44px';
      el.style.paddingLeft = '10px';
      el.style.paddingRight = '8px';
      el.style.borderRadius = '0px';
      el.style.backgroundColor = 'transparent';
      el.style.backdropFilter = 'none';
      (el.style as any).webkitBackdropFilter = 'none';
      el.style.boxShadow = 'none';
      return;
    }

    const t = progress; // 0 → 1

    // Measure actual content width to know where to stop shrinking
    const parentWidth = el.parentElement?.clientWidth || 400;
    let contentWidth = 0;
    for (let i = 0; i < el.children.length; i++) {
      // Bỏ qua lớp phủ AI island nếu có
      if ((el.children[i] as HTMLElement).classList.contains('recording-header-container')) continue;
      contentWidth += (el.children[i] as HTMLElement).offsetWidth;
    }
    contentWidth += 18; // 12px padding buffer + 6px gap between sections
    const maxSide = Math.max(0, (parentWidth - contentWidth) / 2);

    const topPx = t * 6;
    const sidePx = t * maxSide;
    const height = 44 - t * 8;
    const paddingLeft = 10 - t * 2; // 10 -> 8
    const paddingRight = 8 - t * 4; // 8 -> 4
    const radius = t * 20;
    const bgAlpha = t * 0.85;
    const blur = t * 16;
    const shadow = t * 0.15;

    el.style.top = `${topPx}px`;
    el.style.left = `${sidePx}px`;
    el.style.right = `${sidePx}px`;
    el.style.height = `${height}px`;
    el.style.paddingLeft = `${paddingLeft}px`;
    el.style.paddingRight = `${paddingRight}px`;
    el.style.borderRadius = `${radius}px`;
    el.style.backgroundColor = \`hsl(var(--background) / \${bgAlpha})\`;
    const filterValue = blur > 0 ? \`blur(\${blur}px) saturate(180%)\` : 'none';
    el.style.backdropFilter = filterValue;
    (el.style as any).webkitBackdropFilter = filterValue;
    const isDark = document.documentElement.classList.contains("dark");
    if (shadow > 0) {
      if (isDark) {
        el.style.boxShadow = \`inset 0 0 0 1px rgba(255, 255, 255, \${t * 0.05}), 0 4px 16px rgba(0,0,0,\${shadow * 1.5})\`;
      } else {
        el.style.boxShadow = \`0 2px 12px rgba(0,0,0,\${shadow})\`;
      }
    } else {
      el.style.boxShadow = 'none';
    }
    el.style.borderColor = 'transparent';
    */
  }, []);

  // Recalculate island width if internal content resizes (e.g., hover expansions)
  useEffect(() => {
    const el = headerRef.current;
    if (!el || !el.children[0]) return;

    let rafId: number;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        handleScrollProgress(scrollProgressRef.current || 0);
      });
    });

    observer.observe(el.children[0]);
    if (el.children[1]) observer.observe(el.children[1]);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(rafId);
    };
  }, [handleScrollProgress]);

  // Listen for AI error events from the editor
  useEffect(() => {
    const handler = () => setAiErrorVisible(true);
    window.addEventListener("ai-error", handler);
    window.addEventListener("ai-error-refunded", handler);
    return () => {
      window.removeEventListener("ai-error", handler);
      window.removeEventListener("ai-error-refunded", handler);
    };
  }, []);

  
  // Listen for Ask Note
  useEffect(() => {
    const handleOpenSparkAI = async (e: Event) => {
      const customEvent = e as CustomEvent;
      const content = customEvent.detail?.content || "";
      const success = await openSparkAIWithContext(content, activeNote?.title || "Untitled");
      if (!success) {
        chrome.tabs.create({
          url: "https://chromewebstore.google.com/detail/spark-ai/cainihlnefiebaigcjiniandhodkajaj",
        });
      }
    };
    window.addEventListener("open-spark-ai", handleOpenSparkAI);
    return () => window.removeEventListener("open-spark-ai", handleOpenSparkAI);
  }, [activeNote?.title]);

  // Listen for notes from sister extensions (Spark AI, AI Recorder)
  useEffect(() => {
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.ecosystem_pending_note?.newValue) {
        const { title, content } = changes.ecosystem_pending_note.newValue;
        if (title && content) {
          createNoteWithContent(title, content);
          chrome.storage.local.remove("ecosystem_pending_note");
        }
      }
    };
    chrome.storage.local.onChanged.addListener(handleStorageChange);

    // Also check on mount for any pending notes
    chrome.storage.local.get("ecosystem_pending_note").then((result) => {
      if (result.ecosystem_pending_note) {
        const { title, content } = result.ecosystem_pending_note;
        if (title && content) {
          createNoteWithContent(title, content);
          chrome.storage.local.remove("ecosystem_pending_note");
        }
      }
    });

    return () => chrome.storage.local.onChanged.removeListener(handleStorageChange);
  }, [createNoteWithContent]);

  // Clean up empty notes when switching away
  const cleanupEmptyNotes = useCallback(() => {
    notes.forEach((note) => {
      const hasTitle = note.title.trim() !== "" && note.title !== "Untitled";
      let hasContent = false;
      try {
        const parsed = JSON.parse(note.content);
        if (parsed?.type === "doc" && Array.isArray(parsed.content)) {
          hasContent = parsed.content.some((node: any) => {
            if (node.type === "paragraph" && Array.isArray(node.content)) {
              return node.content.some(
                (c: any) => c.text && c.text.trim() !== ""
              );
            }
            return node.type !== "paragraph";
          });
        }
      } catch {
        hasContent = false;
      }

      if (!hasTitle && !hasContent && note.id !== activeNoteId) {
        deleteNote(note.id);
      }
    });
  }, [notes, activeNoteId, deleteNote]);

  const handleContentChange = (noteId: string, content: string) => {
    updateNote(noteId, { content });
  };

  const handleTitleChange = (noteId: string, title: string) => {
    updateNote(noteId, { title });
  };

  const handleCreateNote = (title?: string, content?: string) => {
    if (title && content) {
      createNoteWithContent(title, content);
    } else {
      createNote();
    }
  };

  const handleToolbarMediaAction = async (action: "stt" | "audio" | "screen" | "meet") => {
    if (!user) {
      setAccountGuestText({ title: "Sign in required", subtitle: "Please sign in to use media features." });
      setShowAccountMenu(true);
      return;
    }

    if (!activeNoteId) {
      await createNote();
      // wait for editor to mount
      await new Promise(r => setTimeout(r, 400));
    }

    const editor = (window as any).activeBlackNoteEditor;
    if (!editor) {
      console.error("Editor not ready for media action");
      return;
    }

    if (action === "stt") {
      (window as any).blackNoteSTTEditor = editor;
      window.dispatchEvent(new CustomEvent("start-speech-to-text"));
    } else if (action === "meet") {
      (window as any).blackNoteMeetEditor = editor;
      window.dispatchEvent(new CustomEvent("start-meet-sync"));
    } else if (action === "audio") {
      window.dispatchEvent(new CustomEvent("start-audio-recording", { detail: { editor } }));
    } else if (action === "screen") {
      window.dispatchEvent(new CustomEvent("start-screen-recording", { detail: { editor } }));
    }
  };

  const handleClipSaveAsNote = useCallback(
    (title: string, markdown: string) => {
      createNoteWithContent(title, markdown);
      setActivePanel(null); setShowClipper(false);
    },
    [createNoteWithContent]
  );

  const handleSelectNote = (id: string) => {
    cleanupEmptyNotes();
    setActiveNoteId(id);
  };


  // When a pop-out window is active, the side panel shows a placeholder
  // to prevent dual-instance editing conflicts
  if (popoutActive && !isPopoutInstance.current) {
    return (
      <div
        className="relative flex h-screen w-full overflow-hidden items-center justify-center"
        style={{ backgroundColor: "hsl(var(--background))" }}
      >
        <div className="flex flex-col items-center gap-4 text-center px-6 max-w-[280px]">
          <div className="w-12 h-12 rounded-2xl bg-muted/50 flex items-center justify-center">
            <AppWindow className="w-6 h-6 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              Using pop-out window
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              BlackNote is open in a separate window. Close it to return here.
            </p>
          </div>
          <button
            className="text-xs px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            onClick={() => {
              chrome.storage.local.set({ blacknote_popout_active: false });
              // Also try to close the pop-out window if we have its ID
              if (pipWindowRef.current) {
                chrome.runtime.sendMessage({
                  type: "CLOSE_PIP_WINDOW",
                  windowId: pipWindowRef.current,
                });
                pipWindowRef.current = null;
                setIsPinnedToTop(false);
              }
            }}
          >
            Close pop-out & return
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      id="blacknote-app-container"
      className="relative flex h-screen w-full overflow-hidden"
      style={{ backgroundColor: "hsl(var(--sidebar-bg))" }}
    >
      {/* ─── Sign Out Overlay ─── */}
      <AnimatePresence>
        {isSigningOut && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm"
          >
            <LoaderIcon size={22} className="text-muted-foreground animate-spin" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Welcome Overlay ─── */}
      <AnimatePresence>
        {showWelcomeOverlay && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-background/80 backdrop-blur-md cursor-pointer px-6"
            onClick={() => {
              setShowWelcomeOverlay(false);
              localStorage.setItem("blacknote_seen_welcome_overlay", "true");
            }}
          >
            <div className="w-full max-w-[500px] aspect-square flex items-center justify-center pointer-events-none">
              <DotLottieReact src={chrome.runtime.getURL("welcome.json")} autoplay loop backgroundColor="transparent" style={{ width: "100%", height: "100%" }} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Header Bar ─── */}
      {isRecording || isSTTActive || isMeetSyncActive ? (
        <RecordingHeader
          state={isRecording ? recorder.state : "recording"}
          mode={isRecording ? recorder.mode : isMeetSyncActive ? "audio" : "audio"}
          elapsed={isRecording ? recorder.elapsed : isMeetSyncActive ? meetElapsed : sttElapsed}
          analyserNode={isRecording ? recorder.analyserNode : null}
          onPause={isRecording ? recorder.pauseRecording : undefined}
          onResume={isRecording ? recorder.resumeRecording : undefined}
          onStop={isRecording ? handleRecordingStop : isMeetSyncActive ? () => window.dispatchEvent(new CustomEvent("stop-meet-sync")) : () => window.dispatchEvent(new CustomEvent("stop-speech-to-text"))}
          onDiscard={isRecording ? handleRecordingDiscard : undefined}
        />
      ) : null}

      {/* ─── Main Content ─── */}
      <motion.div 
        id="blacknote-root"
        animate={{ 
          borderTopRightRadius: showRightToolbar ? 16 : 0, 
          borderBottomRightRadius: showRightToolbar ? 16 : 0,
        }}
        className={`flex-1 flex flex-col min-w-0 h-full bg-background transition-all z-10 overflow-hidden relative `}
      >
        <AnimatePresence>
          {!showRightToolbar && !isRecording && !isSTTActive && !isMeetSyncActive && (
            <motion.button 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute top-4 right-2 z-40 flex items-center justify-center w-9 h-9 rounded-md text-muted-foreground opacity-40 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              onClick={() => setShowRightToolbar(true)}
              data-tooltip="Open menu"
            >
              <Menu size={20} strokeWidth={1.25} />
            </motion.button>
          )}
        </AnimatePresence>
        <NoteEditor
          note={activeNote}
          theme={theme}
          onContentChange={handleContentChange}
          onTitleChange={handleTitleChange}
          onCreateNote={handleCreateNote}
          onScrollProgress={handleScrollProgress}
          onUpdateNote={(id, updates) => updateNote(id, updates)}
          toggleTheme={toggleTheme}
        />
      

        {/* -- SHEETS MOVED HERE TO NOT OVERLAP RIGHT SIDEBAR -- */}

      {/* ─── Web Clipper Bottom Sheet ─── */}
      <AnimatePresence>
        {showClipper && (
          <>
            <motion.div
              className="history-sheet-backdrop"
              onClick={() => { setActivePanel(null); setShowClipper(false); }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            />
            <motion.div
              className="clipper-sheet mx-auto max-w-[800px]"
              initial={{ bottom: "-100%" }}
              animate={{ bottom: 0 }}
              exit={{ bottom: "-100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 350, mass: 0.8 }}
            >
              <div className="history-sheet-handle" onClick={() => { setActivePanel(null); setShowClipper(false); }}>
                <div className="history-sheet-handle-bar" />
              </div>
              <div className="clipper-sheet-content">
                <WebClipper
                  onSaveAsNote={handleClipSaveAsNote}
                  onClose={() => { setActivePanel(null); setShowClipper(false); }}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {capturedImage && (
          <>
            <motion.div
              className="history-sheet-backdrop"
              onClick={() => setCapturedImage(null)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              className="clipper-sheet"
              initial={{ bottom: "-100%" }}
              animate={{ bottom: 0 }}
              exit={{ bottom: "-100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 350, mass: 0.8 }}
            >
              <div className="history-sheet-handle" onClick={() => setCapturedImage(null)}>
                <div className="history-sheet-handle-bar" />
              </div>
              <div className="clipper-sheet-content">
                <ImageClipper
                  dataUrl={capturedImage}
                  onSaveAsNote={handleClipSaveAsNote}
                  onClose={() => setCapturedImage(null)}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ─── History Bottom Sheet ─── */}
      <AnimatePresence>
        {showHistory && (
          <HistorySheet
            notes={notes}
            activeNoteId={activeNoteId ?? ""}
            loading={notesLoading}
            onSelectNote={handleSelectNote}
            onCreateNote={handleCreateNote}
            onDeleteNote={deleteNote}
            onTogglePin={(id) => {
              const note = notes.find((n) => n.id === id);
              if (note) updateNote(id, { isPinned: !note.isPinned });
            }}
            onClose={() => {
              cleanupEmptyNotes();
              setActivePanel(null); setShowHistory(false);
            }}
          />
        )}
      </AnimatePresence>

      {/* ─── Account Bottom Sheet ─── */}
      <AnimatePresence>
        {showAccountMenu && (
          <>
            <motion.div
              key="history-backdrop"
              className="history-sheet-backdrop"
              onClick={() => { setActivePanel(null); setShowAccountMenu(false); setAccountGuestText(null); }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            />
            <motion.div
              className="clipper-sheet account-sheet"
              initial={{ bottom: "-100%" }}
              animate={{ bottom: 0 }}
              exit={{ bottom: "-100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 350, mass: 0.8 }}
            >
              <div className="history-sheet-handle" onClick={() => { setActivePanel(null); setShowAccountMenu(false); setAccountGuestText(null); }}>
                <div className="history-sheet-handle-bar" />
              </div>
              <div style={{ padding: 0, overflow: "visible" }}>
                <AccountPopup
                  user={user}
                  credits={credits}
                  proIconIndex={proIconIndex}
                  onSignOut={async () => {
                    setActivePanel(null); setShowAccountMenu(false);
                    setShowSignOutConfirm(true);
                  }}
                  onLogin={handleLogin}
                  isLoggingIn={isLoggingIn}
                  onClose={() => { setActivePanel(null); setShowAccountMenu(false); setAccountGuestText(null); }}
                  onRefreshCredits={refreshCredits}
                  guestTitle={accountGuestText?.title}
                  guestSubtitle={accountGuestText?.subtitle}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSupportSheet && (
          <SupportActionSheet onClose={() => { setActivePanel(null); setShowSupportSheet(false); }} />
        )}
      </AnimatePresence>

      {/* ─── AI Error Sheet ─── */}
      <AIErrorSheet
        visible={aiErrorVisible}
        onDismiss={() => setAiErrorVisible(false)}
        user={user}
        isPremium={isPremium}
        isQuotaExhausted={isQuotaExhausted}
        onLogin={() => { setAiErrorVisible(false); signInWithGoogle(); }}
        onUpgrade={() => {
          setAiErrorVisible(false);
          if (user?.email) {
            const url = `${CHECKOUT_BASE}?checkout[email]=${encodeURIComponent(user.email)}&checkout[custom][user_id]=${user.id}`;
            chrome.tabs.create({ url });
          }
        }}
      />

      {/* Recording Limit Countdown/Error Sheet */}
      <RecordingLimitSheet
        visible={recordingLimitTimeLeft !== null}
        timeLeft={recordingLimitTimeLeft || 0}
        onDismiss={() => setRecordingLimitTimeLeft(null)}
        onUpgrade={() => {
          setRecordingLimitTimeLeft(null);
          if (user?.email) {
            const url = `${CHECKOUT_BASE}?checkout[email]=${encodeURIComponent(user.email)}&checkout[custom][user_id]=${user.id}`;
            chrome.tabs.create({ url });
          }
        }}
      />

      {/* ─── Recording Error Sheet ─── */}
      <RecordingErrorSheet
        visible={!!recErrorInfo}
        errorInfo={recErrorInfo?.info ?? null}
        onDismiss={() => {
          const mode = recErrorInfo?.retryMode;
          setRecErrorInfo(null);

          // Stop background polling if the user manually cancels Meet Live Sync
          if (mode === "meet") {
            window.dispatchEvent(new CustomEvent("stop-meet-sync"));
          }

          chrome.windows.getLastFocused({ windowTypes: ['normal'] }).then((win) => {
            if (win?.id) {
              chrome.tabs.query({ active: true, windowId: win.id }).then(([tab]) => {
                if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: "STOP_REGION_SELECTION" }).catch(() => { });
              });
            }
          });
        }}
        onRetry={() => {
          const mode = recErrorInfo?.retryMode;
          const editor = recErrorInfo?.editor;
          setRecErrorInfo(null);
          if (mode === "audio") {
            window.dispatchEvent(new CustomEvent("start-audio-recording", { detail: { editor } }));
          } else if (mode === "screen") {
            window.dispatchEvent(new CustomEvent("start-screen-recording", { detail: { editor } }));
          } else if (mode === "meet") {
            window.dispatchEvent(new CustomEvent("start-meet-sync"));
          }
        }}
        onContinueWithoutMic={() => {
          const mode = recErrorInfo?.retryMode;
          const editor = recErrorInfo?.editor;
          setRecErrorInfo(null);
          if (mode === "screen") {
            window.dispatchEvent(new CustomEvent("start-screen-recording", { detail: { skipMic: true, editor } }));
          } else {
            window.dispatchEvent(new CustomEvent("start-audio-recording", { detail: { skipMic: true, editor } }));
          }
        }}
        onOpenSettings={() => {
          chrome.tabs.create({ url: chrome.runtime.getURL("setup.html") });
          setRecErrorInfo(null);
        }}
      />

      {/* ─── Sign Out Confirm Sheet ─── */}
      <SignOutConfirmSheet
        visible={showSignOutConfirm}
        onDismiss={() => setShowSignOutConfirm(false)}
        onConfirm={async () => {
          setShowSignOutConfirm(false);
          setIsSigningOut(true);
          await signOut();
        }}
      />

      <AnimatePresence>
        {mediaSheetConfig && (
          <MediaActionSheet
            {...mediaSheetConfig}
            onClose={() => setMediaSheetConfig(null)}
            onInsertToNote={(text) => {
              window.dispatchEvent(
                new CustomEvent("insert-ai-content", { detail: { text } })
              );
            }}
          />
        )}
      </AnimatePresence>

      
      </motion.div>

      {/* ─── Vertical Right Toolbar ─── */}
      <AnimatePresence>
        {showRightToolbar && !isRecording && !isSTTActive && !isMeetSyncActive && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 40, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="h-full flex-shrink-0 flex flex-col items-center py-4 z-0 overflow-y-auto overflow-x-hidden no-scrollbar gap-3"
            style={{
              backgroundColor: "hsl(var(--sidebar-bg))",
            }}
          >
            <div className="flex flex-col items-center gap-3 w-full opacity-100 min-w-[40px]">
              <button
                className="flex items-center justify-center w-9 h-9 rounded-[10px] transition-all group text-muted-foreground opacity-85 dark:opacity-75 hover:opacity-100 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10"
                onClick={() => setShowRightToolbar(false)}
                data-tooltip="Close menu"
                data-placement="left"
              >
                <ChevronFirstIcon size={20} className="w-5 h-5 rotate-180" />
              </button>

              <button
                className="flex items-center justify-center w-9 h-9 rounded-[10px] transition-all group text-muted-foreground opacity-85 dark:opacity-75 hover:opacity-100 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10"
                onClick={handleCreateNote}
                data-tooltip="New note"
                data-placement="left"
              >
                <PlusIcon className="w-5 h-5" />
              </button>
              
              <button
                className={`flex items-center justify-center w-9 h-9 rounded-[10px] transition-all group ${activePanel === "note-chat" ? "text-foreground opacity-100 bg-black/5 dark:bg-white/10" : "text-muted-foreground opacity-85 dark:opacity-75 hover:opacity-100 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10"}`}
                onClick={() => handleTogglePanel("note-chat")}
                data-tooltip="Ask AI"
                data-placement="left"
              >
                <MessageSquareMoreIcon className="w-5 h-5" size={20} />
              </button>

              <button
                className={`flex items-center justify-center w-9 h-9 rounded-[10px] transition-all group ${activePanel === "history" ? "text-foreground opacity-100 bg-black/5 dark:bg-white/10" : "text-muted-foreground opacity-85 dark:opacity-75 hover:opacity-100 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10"}`}
                onClick={() => handleTogglePanel("history")}
                data-tooltip="History"
                data-placement="left"
              >
                <LayoutListIcon size={20} />
              </button>

              <button
                className={`flex items-center justify-center w-9 h-9 rounded-[10px] transition-all group ${activePanel === "clipper" ? "text-foreground opacity-100 bg-black/5 dark:bg-white/10" : "text-muted-foreground opacity-85 dark:opacity-75 hover:opacity-100 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10"}`}
                onClick={() => handleTogglePanel("clipper")}
                data-tooltip="Clip page"
                data-placement="left"
                
              >
                <ScanLineIcon size={20} />
              </button>

              <button
                className="flex items-center justify-center w-9 h-9 rounded-[10px] transition-all group text-muted-foreground opacity-85 dark:opacity-75 hover:opacity-100 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10"
                onClick={() => handleToolbarMediaAction("stt")}
                data-tooltip="Speech to Text"
                data-placement="left"
              >
                <MicIcon className="w-5 h-5" />
              </button>
              <button
                className="flex items-center justify-center w-9 h-9 rounded-[10px] transition-all group text-muted-foreground opacity-85 dark:opacity-75 hover:opacity-100 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10"
                onClick={() => handleToolbarMediaAction("audio")}
                data-tooltip="Record Audio"
                data-placement="left"
              >
                <AudioLinesIcon className="w-5 h-5" />
              </button>
              <button
                className="flex items-center justify-center w-9 h-9 rounded-[10px] transition-all group text-muted-foreground opacity-85 dark:opacity-75 hover:opacity-100 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10"
                onClick={() => handleToolbarMediaAction("screen")}
                data-tooltip="Record Screen"
                data-placement="left"
              >
                <VideoIcon className="w-5 h-5" />
              </button>
              <button
                className="flex items-center justify-center w-9 h-9 rounded-[10px] transition-all group text-muted-foreground opacity-85 dark:opacity-75 hover:opacity-100 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10"
                onClick={() => handleToolbarMediaAction("meet")}
                data-tooltip="Meet Live Sync"
                data-placement="left"
              >
                <MeetIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-auto flex flex-col items-center gap-3 w-full min-w-[40px]">
              <button
                className="flex items-center justify-center w-9 h-9 rounded-[10px] transition-all group text-muted-foreground opacity-85 dark:opacity-75 hover:opacity-100 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10"
                onClick={() => window.dispatchEvent(new CustomEvent("open-support-sheet"))}
                data-tooltip="Help"
                data-placement="left"
              >
                <CircleHelpIcon className="w-5 h-5" />
              </button>

              <button
                className="flex items-center justify-center w-9 h-9 rounded-[10px] transition-all group text-muted-foreground opacity-85 dark:opacity-75 hover:opacity-100 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10"
                onClick={toggleTheme}
                data-tooltip={theme === "light" ? "Dark mode" : "Light mode"}
                data-placement="left"
              >
                {theme === "light" ? (
                  <MoonIcon size={20} className="w-5 h-5" />
                ) : (
                  <SunIcon size={20} className="w-5 h-5" />
                )}
              </button>

              {/* Always on Top — Pop-out Window */}
              <button
                className="flex items-center justify-center w-9 h-9 rounded-[10px] transition-all group text-muted-foreground opacity-85 dark:opacity-75 hover:opacity-100 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10"
                onClick={handleTogglePiP}
                data-tooltip={
                  isPopoutInstance.current
                    ? "Back to side panel"
                    : isPinnedToTop
                    ? "Close pop-out"
                    : "Pop out window"
                }
                data-placement="left"
              >
                {isPinnedToTop || isPopoutInstance.current ? (
                  <PanelRight className="w-5 h-5" />
                ) : (
                  <AppWindow className="w-5 h-5" />
                )}
              </button>

              <button
                className={`flex items-center justify-center w-9 h-9 rounded-[10px] transition-all group ${activePanel === "settings" ? "text-foreground opacity-100 bg-black/5 dark:bg-white/10" : "text-muted-foreground opacity-85 dark:opacity-75 hover:opacity-100 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10"}`}
                onClick={() => handleTogglePanel("settings")}
                data-tooltip="Settings"
                data-placement="left"
              >
                <SettingsIcon size={20} />
              </button>

              <button
                className={`flex items-center justify-center w-9 h-9 rounded-full transition-all group ${activePanel === "account" ? "text-foreground opacity-100 bg-black/5 dark:bg-white/10" : "text-muted-foreground opacity-100 hover:bg-black/5 dark:hover:bg-white/10"}`}
                onClick={() => handleTogglePanel("account")}
                data-tooltip={!user ? "Sign in / Account" : "Account"}
                data-placement="left"
              >
                {!user ? (
                  <div className="scale-[0.85]"><GuestAvatarIcon /></div>
                ) : getUserAvatar(user) ? (
                  <img src={getUserAvatar(user)!} alt="" className="w-[30px] h-[30px] rounded-full object-cover border border-border/20 shadow-sm" />
                ) : (
                  <div className="w-[30px] h-[30px] rounded-full bg-muted flex items-center justify-center text-[12px] font-bold border border-border/20 shadow-sm">
                    {(user.displayName || user.user_metadata?.full_name || user.email || "U").charAt(0).toUpperCase()}
                  </div>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <GlobalTooltip />
    </div>
  );
}
