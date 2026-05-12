import * as Popover from "@radix-ui/react-popover";
import * as Tooltip from "@radix-ui/react-tooltip";
import { ChevronDown } from "lucide-react";
import { useEditor } from "novel";
import { useState } from "react";

export interface BubbleColorMenuItem {
  name: string;
  color: string;
}

const TEXT_COLORS: BubbleColorMenuItem[] = [
  { name: "Default", color: "inherit" },
  { name: "Gray", color: "var(--color-text-gray)" },
  { name: "Brown", color: "var(--color-text-brown)" },
  { name: "Orange", color: "var(--color-text-orange)" },
  { name: "Yellow", color: "var(--color-text-yellow)" },
  { name: "Green", color: "var(--color-text-green)" },
  { name: "Blue", color: "var(--color-text-blue)" },
  { name: "Purple", color: "var(--color-text-purple)" },
  { name: "Pink", color: "var(--color-text-pink)" },
  { name: "Red", color: "var(--color-text-red)" },
];

const HIGHLIGHT_COLORS: BubbleColorMenuItem[] = [
  { name: "Default", color: "transparent" },
  { name: "Gray", color: "var(--color-bg-gray)" },
  { name: "Brown", color: "var(--color-bg-brown)" },
  { name: "Orange", color: "var(--color-bg-orange)" },
  { name: "Yellow", color: "var(--color-bg-yellow)" },
  { name: "Green", color: "var(--color-bg-green)" },
  { name: "Blue", color: "var(--color-bg-blue)" },
  { name: "Purple", color: "var(--color-bg-purple)" },
  { name: "Pink", color: "var(--color-bg-pink)" },
  { name: "Red", color: "var(--color-bg-red)" },
];

export const ColorSelector = () => {
  const { editor } = useEditor();
  const [isOpen, setIsOpen] = useState(false);
  
  if (!editor) return null;

  const activeColorItem = TEXT_COLORS.find(({ color }) => editor.isActive("textStyle", { color }));
  const activeHighlightItem = HIGHLIGHT_COLORS.find(({ color }) => editor.isActive("highlight", { color }));

  return (
    <Tooltip.Provider delayDuration={200}>
      <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <Popover.Trigger asChild>
              <button
                className="flex items-center justify-center gap-0.5 px-1.5 h-8 rounded-md transition-colors"
                style={{ color: "hsl(var(--foreground))" }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "hsl(var(--muted))"}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
              >
                <span
                  className="flex items-center justify-center font-medium text-[12px] w-[18px] h-[18px] rounded-full border"
                  style={{
                    color: activeColorItem && activeColorItem.name !== "Default" ? activeColorItem.color : "inherit",
                    borderColor: activeColorItem && activeColorItem.name !== "Default" ? activeColorItem.color : "hsl(var(--border))",
                    backgroundColor: activeHighlightItem && activeHighlightItem.name !== "Default" ? activeHighlightItem.color : "transparent",
                  }}
                >
                  A
                </span>
                <ChevronDown className="h-3 w-3 opacity-60" strokeWidth={2.5} />
              </button>
            </Popover.Trigger>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              className="z-[100000] px-2 py-1 text-xs rounded-md shadow-md animate-in fade-in zoom-in-95"
              style={{ backgroundColor: "hsl(var(--foreground))", color: "hsl(var(--background))" }}
              sideOffset={5}
            >
              Color
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>

        <Popover.Portal container={document.getElementById("blacknote-root") || document.body}>
          <Popover.Content
            className="z-[99999] w-[184px] rounded-[14px] border p-3 shadow-xl flex flex-col gap-4 animate-in fade-in zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95"
            align="start"
            sideOffset={8}
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              editor.chain().focus().run();
            }}
            style={{
              backgroundColor: "hsl(var(--background) / 0.85)",
              backdropFilter: "blur(16px) saturate(180%)",
              borderColor: "hsl(var(--border) / 0.4)"
            }}
          >
            <div className="flex flex-col gap-2">
              <span
                className="text-[11px] font-bold px-1"
                style={{ color: "hsl(var(--muted-foreground))" }}
              >
                Text Color
              </span>
              <div className="grid grid-cols-5 gap-y-2 gap-x-1.5">
                {TEXT_COLORS.map(({ name, color }) => (
                  <Tooltip.Root key={name}>
                    <Tooltip.Trigger asChild>
                      <button
                        onClick={() => {
                          if (name === "Default") {
                            editor.chain().focus().unsetColor().run();
                          } else {
                            editor.chain().focus().setColor(color).run();
                          }
                          setIsOpen(false);
                        }}
                        className="relative flex items-center justify-center w-7 h-7 rounded-md transition-colors"
                        style={{
                          backgroundColor: editor.isActive("textStyle", { color }) ? "hsl(var(--muted))" : "transparent"
                        }}
                        onMouseEnter={(e) => {
                          if (!editor.isActive("textStyle", { color })) {
                            e.currentTarget.style.backgroundColor = "hsl(var(--muted))";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!editor.isActive("textStyle", { color })) {
                            e.currentTarget.style.backgroundColor = "transparent";
                          }
                        }}
                      >
                        <span
                          className="font-medium text-[14px] flex items-center justify-center w-[22px] h-[22px] rounded-full border bg-transparent"
                          style={{
                            color: name === "Default" ? "hsl(var(--foreground))" : color,
                            borderColor: name === "Default" ? "hsl(var(--border))" : color,
                            opacity: name === "Default" ? 0.7 : 1
                          }}
                        >
                          A
                        </span>
                      </button>
                    </Tooltip.Trigger>
                    <Tooltip.Portal container={document.getElementById("blacknote-root") || document.body}>
                      <Tooltip.Content
                        className="z-[100000] px-2 py-1 text-xs rounded-md shadow-md animate-in fade-in zoom-in-95"
                        style={{
                          backgroundColor: "hsl(var(--background))",
                          color: "hsl(var(--foreground))",
                          border: "1px solid hsl(var(--border))"
                        }}
                        side="top"
                        sideOffset={4}
                      >
                        {name}
                      </Tooltip.Content>
                    </Tooltip.Portal>
                  </Tooltip.Root>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span
                className="text-[11px] font-bold px-1"
                style={{ color: "hsl(var(--muted-foreground))" }}
              >
                Highlight Color
              </span>
              <div className="grid grid-cols-5 gap-y-2 gap-x-1.5">
                {HIGHLIGHT_COLORS.map(({ name, color }) => (
                  <Tooltip.Root key={name}>
                    <Tooltip.Trigger asChild>
                      <button
                        onClick={() => {
                          if (name === "Default") {
                            editor.chain().focus().unsetHighlight().run();
                          } else {
                            editor.chain().focus().setHighlight({ color }).run();
                          }
                          setIsOpen(false);
                        }}
                        className="relative flex items-center justify-center w-7 h-7 rounded-md transition-colors"
                        style={{
                          backgroundColor: editor.isActive("highlight", { color }) ? "hsl(var(--muted))" : "transparent"
                        }}
                        onMouseEnter={(e) => {
                          if (!editor.isActive("highlight", { color })) {
                            e.currentTarget.style.backgroundColor = "hsl(var(--muted))";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!editor.isActive("highlight", { color })) {
                            e.currentTarget.style.backgroundColor = "transparent";
                          }
                        }}
                      >
                        <div
                          className="flex items-center justify-center w-[22px] h-[22px] rounded-full border"
                          style={{
                            backgroundColor: name === "Default" ? "transparent" : color,
                            borderColor: name === "Default" ? "hsl(var(--border))" : `var(--color-text-${name.toLowerCase()})`,
                          }}
                        >
                          {name === "Default" && (
                            <svg viewBox="0 0 24 24" className="w-full h-full p-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
                              <line x1="2" y1="22" x2="22" y2="2" stroke="currentColor" strokeWidth="2.5" />
                            </svg>
                          )}
                        </div>
                      </button>
                    </Tooltip.Trigger>
                    <Tooltip.Portal container={document.getElementById("blacknote-root") || document.body}>
                      <Tooltip.Content
                        className="z-[100000] px-2 py-1 text-xs rounded-md shadow-md animate-in fade-in zoom-in-95"
                        style={{
                          backgroundColor: "hsl(var(--background))",
                          color: "hsl(var(--foreground))",
                          border: "1px solid hsl(var(--border))"
                        }}
                        side="bottom"
                        sideOffset={4}
                      >
                        {name}
                      </Tooltip.Content>
                    </Tooltip.Portal>
                  </Tooltip.Root>
                ))}
              </div>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </Tooltip.Provider>
  );
};
