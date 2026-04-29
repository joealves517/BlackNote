import { LoaderCircleIcon } from "@/components/icons/loader-circle";
import { CircleHelpIcon } from "@/components/icons/circle-help";
import { SparklesIcon } from "@/components/icons/sparkles";
import { XIcon } from "@/components/icons/x";
import { SendIcon } from "@/components/icons/send";
import { useState, useEffect, useRef, useCallback } from "react";
import { checkAIAvailability, streamAI, destroyAISession } from "@/lib/ai";
import { Button } from "@/components/ui/button";

interface AIAssistantProps {
  selectedText: string;
  onInsertText: (text: string) => void;
  onClose: () => void;
}

const QUICK_ACTIONS = [
  { label: "Improve writing", prompt: "Improve this text, make it clearer and more professional:\n\n" },
  { label: "Fix grammar", prompt: "Fix any grammar and spelling errors in this text:\n\n" },
  { label: "Make shorter", prompt: "Make this text more concise while keeping the meaning:\n\n" },
  { label: "Make longer", prompt: "Expand this text with more detail and examples:\n\n" },
  { label: "Summarize", prompt: "Summarize the key points of this text:\n\n" },
  { label: "Translate to English", prompt: "Translate this text to English:\n\n" },
];

export function AIAssistant({ selectedText, onInsertText, onClose }: AIAssistantProps) {
  const [customPrompt, setCustomPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [aiStatus, setAiStatus] = useState<"checking" | "ready" | "unavailable">("checking");
  const abortRef = useRef(false);

  // Check AI availability on mount
  useEffect(() => {
    checkAIAvailability().then((status) => {
      setAiStatus(status === "no" ? "unavailable" : "ready");
    });
  }, []);

  const handlePrompt = useCallback(async (prompt: string) => {
    if (isStreaming) return;

    const fullPrompt = selectedText
      ? `${prompt}${selectedText}`
      : prompt;

    setIsStreaming(true);
    setResponse("");
    abortRef.current = false;

    try {
      let accumulated = "";
      for await (const chunk of streamAI(fullPrompt)) {
        if (abortRef.current) break;
        accumulated = chunk; // Chrome AI streams full text, not deltas
        setResponse(accumulated);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "AI request failed";
      setResponse(`⚠️ ${message}`);
    } finally {
      setIsStreaming(false);
    }
  }, [selectedText, isStreaming]);

  const handleQuickAction = (action: typeof QUICK_ACTIONS[0]) => {
    handlePrompt(action.prompt);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customPrompt.trim()) return;
    handlePrompt(customPrompt + (selectedText ? "\n\n" + selectedText : ""));
  };

  const handleStop = () => {
    abortRef.current = true;
    destroyAISession();
  };

  if (aiStatus === "unavailable") {
    return (
      <div
        className="border-t px-4 py-3"
        style={{
          borderColor: "hsl(var(--border))",
          backgroundColor: "hsl(var(--secondary) / 0.5)",
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <CircleHelpIcon className="h-4 w-4" style={{ color: "hsl(var(--muted-foreground))" }} />
            <span className="text-xs font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>
              AI Unavailable
            </span>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <XIcon className="h-3 w-3" />
          </Button>
        </div>
        <p className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
          Enable Chrome Built-in AI: visit{" "}
          <code className="text-[10px] px-1 py-0.5 rounded" style={{ backgroundColor: "hsl(var(--muted))" }}>
            chrome://flags/#prompt-api-for-gemini-nano
          </code>
          {" "}and set to Enabled.
        </p>
      </div>
    );
  }

  return (
    <div
      className="border-t flex flex-col"
      style={{
        borderColor: "hsl(var(--border))",
        backgroundColor: "hsl(var(--secondary) / 0.3)",
        maxHeight: "50%",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-1.5">
          <SparklesIcon className="h-3.5 w-3.5" style={{ color: "hsl(var(--foreground))" }} />
          <span className="text-xs font-medium" style={{ color: "hsl(var(--foreground))" }}>
            AI Assistant
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{
            backgroundColor: "hsl(var(--muted))",
            color: "hsl(var(--muted-foreground))",
          }}>
            on-device
          </span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <XIcon className="h-3 w-3" />
        </Button>
      </div>

      {/* Quick Actions */}
      {!response && !isStreaming && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-2">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.label}
              onClick={() => handleQuickAction(action)}
              className="text-[11px] px-2.5 py-1 rounded-full border transition-colors cursor-pointer"
              style={{
                borderColor: "hsl(var(--border))",
                color: "hsl(var(--foreground))",
                backgroundColor: "hsl(var(--background))",
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLElement).style.backgroundColor = "hsl(var(--accent))";
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLElement).style.backgroundColor = "hsl(var(--background))";
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Response area */}
      {(response || isStreaming) && (
        <div
          className="mx-4 mb-2 p-3 rounded-lg text-sm overflow-y-auto"
          style={{
            backgroundColor: "hsl(var(--background))",
            color: "hsl(var(--foreground))",
            maxHeight: "200px",
            whiteSpace: "pre-wrap",
            lineHeight: "1.6",
          }}
        >
          {response || (
            <span className="flex items-center gap-2" style={{ color: "hsl(var(--muted-foreground))" }}>
              <LoaderCircleIcon className="h-3 w-3 animate-spin" />
              Thinking...
            </span>
          )}
        </div>
      )}

      {/* Action buttons for response */}
      {response && !isStreaming && (
        <div className="flex gap-2 px-4 pb-2">
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              onInsertText(response);
              onClose();
            }}
          >
            Insert below
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              setResponse("");
            }}
          >
            Try again
          </Button>
        </div>
      )}

      {/* Stop button */}
      {isStreaming && (
        <div className="px-4 pb-2">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleStop}>
            Stop
          </Button>
        </div>
      )}

      {/* Custom prompt input */}
      <form onSubmit={handleCustomSubmit} className="flex gap-2 px-4 pb-3">
        <input
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          placeholder="Ask AI anything..."
          disabled={isStreaming}
          className="flex-1 h-8 px-3 text-xs rounded-md border bg-transparent outline-none"
          style={{
            borderColor: "hsl(var(--border))",
            color: "hsl(var(--foreground))",
          }}
        />
        <Button
          type="submit"
          size="icon"
          className="h-8 w-8 shrink-0"
          disabled={isStreaming || !customPrompt.trim()}
        >
          <SendIcon className="h-3.5 w-3.5" />
        </Button>
      </form>
    </div>
  );
}
