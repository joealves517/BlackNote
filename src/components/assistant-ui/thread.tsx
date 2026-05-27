"use client";

import { cn } from "@/lib/utils";
import {
  ActionBarPrimitive,
  AuiIf,
  AttachmentPrimitive,
  BranchPickerPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAui,
  useAuiState,
} from "@assistant-ui/react";
import {
  ArrowUpIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  Cross2Icon,
  Pencil1Icon,
  ReloadIcon,
} from "@radix-ui/react-icons";
import { useEffect, useState, type FC } from "react";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { useShallow } from "zustand/shallow";
import {
  AudioLines,
  Globe,
  ImageIcon,
  Lightbulb,
  Mic,
  MoreHorizontal,
  PlusIcon,
  Share,
  SlidersHorizontal,
  Sparkles,
  Telescope,
  Search,
  FileText,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWebClipper } from "@/hooks/use-web-clipper";
import { PageContext } from "@/components/generative/AssistantChat";
import { useContext } from "react";

export const Thread: FC = () => {
  return (
    <ThreadPrimitive.Root className="flex h-full flex-col items-stretch bg-white px-4 text-[#0d0d0d] dark:bg-[#212121] dark:text-[#ececec]">
      <AuiIf condition={(s) => s.thread.isEmpty}>
        <EmptyState />
      </AuiIf>

      <AuiIf condition={(s) => !s.thread.isEmpty}>
        <ThreadPrimitive.Viewport className="flex grow flex-col gap-8 overflow-y-scroll pt-16">
          <ThreadPrimitive.Messages>
            {({ message }) => {
              if (message.composer.isEditing) return <EditComposer />;
              if (message.role === "user") return <UserMessage />;
              return <AssistantMessage />;
            }}
          </ThreadPrimitive.Messages>

          <ThreadPrimitive.ViewportFooter className="sticky bottom-0 mx-auto mt-auto flex w-full max-w-3xl flex-col gap-2 overflow-visible rounded-t-3xl bg-white pb-2 dark:bg-[#212121]">
            <ThreadScrollToBottom />
            <Composer placeholder="Ask anything" />
            <p className="text-center text-xs text-[#5d5d5d] dark:text-[#a8a8a8]">
              ChatGPT can make mistakes. Check important info.
            </p>
          </ThreadPrimitive.ViewportFooter>
        </ThreadPrimitive.Viewport>
      </AuiIf>
    </ThreadPrimitive.Root>
  );
};

const EmptyState: FC = () => {
  return (
    <div className="flex grow flex-col items-center justify-center px-4">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-stretch gap-6">
        <h1 className="text-center text-2xl font-medium text-[#0d0d0d] sm:text-3xl dark:text-[#ececec]">
          Where should we begin?
        </h1>
        <Composer placeholder="Ask anything" />
      </div>
    </div>
  );
};

const Composer: FC<{ placeholder: string }> = ({ placeholder }) => {
  return (
    <ComposerPrimitive.Root className="group/composer flex w-full flex-col rounded-[28px] border border-[#e5e5e5] bg-white px-2 py-2 shadow-[0_2px_6px_-2px_rgba(0,0,0,0.05)] focus-within:border-[#d0d0d0] dark:border-transparent dark:bg-[#303030] dark:shadow-none dark:focus-within:border-transparent">
      <AuiIf condition={(s) => s.composer.attachments.length > 0}>
        <div className="flex flex-row flex-wrap gap-2 px-1 pt-1 pb-2">
          <ComposerPrimitive.Attachments
            components={{ Attachment: ChatGPTAttachmentUI }}
          />
        </div>
      </AuiIf>
      <AttachmentChips />

      <ComposerPrimitive.Input
        id="blacknote-composer-input"
        placeholder={placeholder}
        rows={1}
        className="min-h-9 w-full resize-none bg-transparent px-3 pt-2 text-base text-[#0d0d0d] outline-none placeholder:text-[#8e8e8e] dark:text-[#ececec] dark:placeholder:text-[#8e8e8e]"
      />

      <div className="flex items-center justify-between gap-2 px-1 pt-1">
        <div className="flex items-center gap-1">
          <ComposerPrimitive.AddAttachment asChild>
            <button
              type="button"
              className="flex size-9 items-center justify-center rounded-full text-[#5d5d5d] transition-colors hover:bg-[#0d0d0d]/5 hover:text-[#0d0d0d] dark:text-[#cdcdcd] dark:hover:bg-white/10 dark:hover:text-white"
              aria-label="Add attachment"
            >
              <PlusIcon size={18} />
            </button>
          </ComposerPrimitive.AddAttachment>
        </div>

        <div className="flex items-center gap-1">
          <ChatGPTToolsMenu />
          <ComposerPrimaryAction />
        </div>
      </div>
    </ComposerPrimitive.Root>
  );
};

const AttachmentChips: FC = () => {
  const pageCtxProvider = useContext(PageContext);
  const isActive = !!pageCtxProvider?.pageContext;

  if (!isActive) return null;

  return (
    <div className="flex flex-wrap gap-2 px-2 pt-2 pb-2">
      <div className="flex items-center gap-2 rounded-xl border border-[#e5e5e5] bg-[#f9f9f9] px-3 py-2 text-sm max-w-[200px] shadow-sm dark:border-transparent dark:bg-[#404040]">
        {pageCtxProvider.pageContext?.favicon ? (
          <img src={pageCtxProvider.pageContext.favicon} alt="" className="size-4 rounded-sm" />
        ) : (
          <Globe className="size-4 text-[#5d5d5d] dark:text-[#cdcdcd]" />
        )}
        <span className="truncate flex-1 text-[#0d0d0d] dark:text-[#ececec]">{pageCtxProvider.pageContext?.title}</span>
        <button
          onClick={() => pageCtxProvider.setPageContext(null)}
          className="text-[#8e8e8e] hover:text-[#0d0d0d] transition-colors dark:hover:text-[#ececec]"
        >
          <Cross2Icon className="size-3.5" />
        </button>
      </div>
    </div>
  );
};

const CHATGPT_TOOLS = [
  { id: "search", label: "Search the web", Icon: Search },
  { id: "note", label: "Ask this note", Icon: FileText },
];

const ChatGPTToolsMenu: FC = () => {
  const { clip, status } = useWebClipper();
  const pageCtxProvider = useContext(PageContext);
  const [tabInfo, setTabInfo] = useState<{ url: string; favicon: string } | null>(null);

  useEffect(() => {
    try {
      browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
        const url = tabs[0]?.url || "";
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
          setTabInfo(null);
        } else {
          setTabInfo({
            url: url,
            favicon: tabs[0]?.favIconUrl || "",
          });
        }
      });
    } catch (err) {
      // Ignore if browser.tabs is not available
    }
  }, []);

  const handleAskPage = async () => {
    if (!tabInfo) return;
    const pageContent = await clip();
    if (pageContent && pageContent.markdown) {
      pageCtxProvider?.setPageContext({
        title: pageContent.title,
        url: pageContent.url,
        favicon: tabInfo.favicon,
        markdown: pageContent.markdown.slice(0, 10000),
      });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-[#5d5d5d] transition-colors hover:bg-[#0d0d0d]/5 hover:text-[#0d0d0d] dark:text-[#cdcdcd] dark:hover:bg-white/10 dark:hover:text-white">
        <SlidersHorizontal className="size-4" />
        <span>Tools</span>
        <ChevronDownIcon className="size-3.5 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56 bg-white dark:bg-[#212121] border-[#e5e5e5] dark:border-white/10 shadow-lg rounded-2xl p-2">
        {tabInfo && (
          <DropdownMenuItem 
            onClick={handleAskPage} 
            disabled={status === "clipping"}
            className="flex items-center gap-3 rounded-xl px-2 py-2.5 cursor-pointer text-[#0d0d0d] dark:text-[#ececec] focus:bg-[#f5f5f5] dark:focus:bg-white/10"
          >
            {status === "clipping" ? <ReloadIcon className="size-4 animate-spin" /> : <Globe className="size-4" />}
            Ask this page
          </DropdownMenuItem>
        )}
        {CHATGPT_TOOLS.map(({ id, label, Icon }) => (
          <DropdownMenuItem
            key={id}
            onClick={() => {
              const textarea = document.getElementById("blacknote-composer-input") as HTMLTextAreaElement;
              if (!textarea) return;
              const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
              const prefix = id === "search" ? "@search: " : "@note: ";
              if (nativeInputValueSetter) {
                nativeInputValueSetter.call(textarea, prefix + textarea.value);
                textarea.dispatchEvent(new Event("input", { bubbles: true }));
                textarea.focus();
              }
            }}
            className="flex items-center gap-3 rounded-xl px-2 py-2.5 cursor-pointer text-[#0d0d0d] dark:text-[#ececec] focus:bg-[#f5f5f5] dark:focus:bg-white/10"
          >
            <Icon className="size-4" />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const ComposerPrimaryAction: FC = () => {
  return (
    <div className="flex items-center gap-1">
      <AuiIf condition={(s) => s.thread.isRunning}>
        <ComposerPrimitive.Cancel className="flex size-9 items-center justify-center rounded-full bg-[#0d0d0d] text-white dark:bg-white dark:text-black">
          <div className="size-2.5 rounded-[2px] bg-current" />
        </ComposerPrimitive.Cancel>
      </AuiIf>

      <AuiIf
        condition={(s) => !s.thread.isRunning && s.composer.dictation != null}
      >
        <ComposerPrimitive.StopDictation
          className="flex size-9 items-center justify-center rounded-full bg-[#ff5d1f] text-white"
          aria-label="Stop dictation"
        >
          <div className="size-2.5 animate-pulse rounded-[2px] bg-current" />
        </ComposerPrimitive.StopDictation>
      </AuiIf>

      <AuiIf
        condition={(s) =>
          !s.thread.isRunning &&
          s.composer.dictation == null
        }
      >
        <ComposerPrimitive.Send className="flex size-9 items-center justify-center rounded-full bg-[#0d0d0d] text-white transition-opacity disabled:opacity-30 dark:bg-white dark:text-black">
          <ArrowUpIcon className="size-5" />
        </ComposerPrimitive.Send>
      </AuiIf>
    </div>
  );
};

const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <TooltipIconButton
        tooltip="Scroll to bottom"
        className="bg-background absolute -top-10 z-10 self-center rounded-full border p-2 shadow-sm disabled:invisible dark:border-white/15 dark:bg-[#2a2a2a]"
      >
        <ChevronDownIcon />
      </TooltipIconButton>
    </ThreadPrimitive.ScrollToBottom>
  );
};

const UserMessage: FC = () => {
  return (
    <MessagePrimitive.Root className="relative mx-auto flex w-full max-w-3xl flex-col items-end gap-1">
      <div className="flex flex-row flex-wrap justify-end gap-2">
        <MessagePrimitive.Attachments
          components={{ Attachment: ChatGPTAttachmentUI }}
        />
      </div>

      <div className="flex items-start gap-4">
        <ActionBarPrimitive.Root
          hideWhenRunning
          autohide="not-last"
          autohideFloat="single-branch"
          className="mt-2"
        >
          <ActionBarPrimitive.Edit asChild>
            <TooltipIconButton tooltip="Edit" className="text-[#b4b4b4]">
              <Pencil1Icon />
            </TooltipIconButton>
          </ActionBarPrimitive.Edit>
        </ActionBarPrimitive.Root>

        <div className="bg-secondary text-foreground rounded-3xl px-5 py-2 dark:bg-white/5 dark:text-[#eee]">
          <MessagePrimitive.Parts />
        </div>
      </div>

      <BranchPicker className="mt-2 mr-3" />
    </MessagePrimitive.Root>
  );
};

const EditComposer: FC = () => {
  return (
    <ComposerPrimitive.Root className="bg-secondary mx-auto flex w-full max-w-3xl flex-col justify-end gap-1 rounded-3xl dark:bg-white/15">
      <ComposerPrimitive.Input className="text-foreground flex h-8 w-full resize-none bg-transparent p-5 pb-0 outline-none dark:text-white" />

      <div className="m-3 mt-2 flex items-center justify-center gap-2 self-end">
        <ComposerPrimitive.Cancel className="bg-background text-foreground hover:bg-muted rounded-full px-3 py-2 text-sm font-semibold dark:bg-zinc-900 dark:text-white dark:hover:bg-zinc-800">
          Cancel
        </ComposerPrimitive.Cancel>
        <ComposerPrimitive.Send className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-3 py-2 text-sm font-semibold dark:bg-white dark:text-black dark:hover:bg-white/90">
          Send
        </ComposerPrimitive.Send>
      </div>
    </ComposerPrimitive.Root>
  );
};

const assistantActionClassName =
  "flex size-8 items-center justify-center rounded-md text-[#5d5d5d] transition-colors hover:bg-[#0d0d0d]/5 hover:text-[#0d0d0d] dark:text-[#afafaf] dark:hover:bg-white/10 dark:hover:text-white";

const AssistantMessage: FC = () => {
  return (
    <MessagePrimitive.Root className="relative mx-auto flex w-full max-w-3xl flex-col">
      <div className="text-[#0d0d0d] dark:text-[#ececec]">
        <MessagePrimitive.Parts />
      </div>

      <div className="-ml-2 flex items-center pt-1">
        <ActionBarPrimitive.Root
          hideWhenRunning
          className="flex items-center gap-0.5"
        >
          <ActionBarPrimitive.Copy className={assistantActionClassName}>
            <AuiIf condition={(s) => s.message.isCopied}>
              <CheckIcon />
            </AuiIf>
            <AuiIf condition={(s) => !s.message.isCopied}>
              <CopyIcon />
            </AuiIf>
          </ActionBarPrimitive.Copy>
          <ActionBarPrimitive.Reload className={assistantActionClassName}>
            <ReloadIcon />
          </ActionBarPrimitive.Reload>
        </ActionBarPrimitive.Root>
        <BranchPicker className="ml-1" />
      </div>
    </MessagePrimitive.Root>
  );
};

const BranchPicker: FC<{ className?: string }> = ({ className }) => {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn(
        "text-muted-foreground inline-flex items-center text-sm font-semibold dark:text-[#b4b4b4]",
        className,
      )}
    >
      <BranchPickerPrimitive.Previous asChild>
        <TooltipIconButton tooltip="Previous" className="text-[#b4b4b4]">
          <ChevronLeftIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Previous>
      <BranchPickerPrimitive.Number />/<BranchPickerPrimitive.Count />
      <BranchPickerPrimitive.Next asChild>
        <TooltipIconButton tooltip="Next" className="text-[#b4b4b4]">
          <ChevronRightIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
};

const useFileSrc = (file: File | undefined) => {
  const [src, setSrc] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!file) {
      setSrc(undefined);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setSrc(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  return src;
};

const useAttachmentSrc = () => {
  const { file, src } = useAuiState(
    useShallow((s): { file?: File; src?: string } => {
      if (s.attachment.type !== "image") return {};
      if (s.attachment.file) return { file: s.attachment.file };
      const src = s.attachment.content?.filter((c) => c.type === "image")[0]
        ?.image;
      if (!src) return {};
      return { src };
    }),
  );

  return useFileSrc(file) ?? src;
};

const ChatGPTAttachmentUI: FC = () => {
  const aui = useAui();
  const isComposer = aui.attachment.source !== "message";
  const src = useAttachmentSrc();

  return (
    <AttachmentPrimitive.Root className="group/attachment relative">
      <div className="bg-secondary flex items-center gap-2 overflow-hidden rounded-2xl border dark:bg-white/5">
        <AuiIf condition={(s) => s.attachment.type === "image"}>
          {src ? (
            // biome-ignore lint/performance/noImgElement: example component
            <img
              className="size-32 rounded-md object-cover"
              alt="Attachment"
              src={src}
            />
          ) : (
            <div className="flex h-full w-12 items-center justify-center rounded-md">
              <AttachmentPrimitive.unstable_Thumb className="text-xs" />
            </div>
          )}
        </AuiIf>
        <AuiIf condition={(s) => s.attachment.type !== "image"}>
          <div className="bg-background flex h-full w-12 items-center justify-center rounded-[9px] text-[#6b6b6b] dark:bg-[#3a3a3a] dark:text-[#9a9a9a]">
            <AttachmentPrimitive.unstable_Thumb className="text-xs" />
          </div>
        </AuiIf>
      </div>
      {isComposer && (
        <AttachmentPrimitive.Remove className="absolute -top-1.5 -right-1.5 flex size-7 items-center justify-center rounded-full border border-[#e5e5e5] bg-white text-[#6b6b6b] transition-all hover:bg-[#f5f5f5] hover:text-[#0d0d0d] dark:border-[#3a3a3a] dark:bg-[#1a1a1a] dark:text-[#9a9a9a] dark:hover:bg-[#252525] dark:hover:text-white">
          <Cross2Icon fontSize={8} />
        </AttachmentPrimitive.Remove>
      )}
    </AttachmentPrimitive.Root>
  );
};
