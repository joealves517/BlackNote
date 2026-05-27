import { useEffect } from "react";
import { useEditor } from "novel";
import { DOMSerializer } from "prosemirror-model";
import TurndownService from "turndown";
import { getAuthToken } from "@/lib/auth-client";
import { AI_API_BASE } from "@/lib/constants";
import { markdownToProsemirror } from "@/lib/markdown-to-prosemirror";
import { showAILoaderToast, updateAISuccessToast, updateAIErrorToast } from "@/lib/toast";

export function AIImproverBridge() {
  const { editor } = useEditor();

  useEffect(() => {
    const handleImprove = async () => {
      if (!editor) return;

      const getSelectedText = (): string => {
        const slice = editor.state.selection.content();
        const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
        turndown.escape = (text) => text;

        if (slice.size === 0) {
          return turndown.turndown(editor.getHTML());
        }

        try {
          const dom = DOMSerializer.fromSchema(editor.schema).serializeFragment(slice.content);
          const div = document.createElement("div");
          div.appendChild(dom);

          const children = Array.from(div.children);
          if (children.length > 0 && children.every(c => c.nodeName === "LI")) {
            const ul = document.createElement("ul");
            children.forEach(c => ul.appendChild(c));
            div.innerHTML = "";
            div.appendChild(ul);
          }

          return turndown.turndown(div.innerHTML);
        } catch {
          return slice.content.textBetween(0, slice.content.size, "\n\n");
        }
      };

      const toastId = `ai-improver-toast-${Date.now()}`;
      const textToProcess = getSelectedText();
      const { from, to } = editor.state.selection;
      const isSelectionEmpty = from === to;

      if (!textToProcess.trim()) return;

      showAILoaderToast(toastId, "Improve Writing", "Improving writing flow and clarity...");

      try {
        const token = await getAuthToken();
        const endpoint = token ? `${AI_API_BASE}/api/ai` : `${AI_API_BASE}/api/ai/free`;

        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            prompt: textToProcess,
            option: "improve"
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`AI error (${response.status}): ${errorText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response stream");

        let result = "";
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          result += decoder.decode(value, { stream: true });
        }

        if (result.includes("We are facing high traffic") || result.includes("You have reached your daily limit")) {
          throw new Error(result.trim());
        }

        const cleanResult = result.trim();
        if (!cleanResult) {
          throw new Error("Received empty response from AI");
        }

        let parsedContent: any;
        try {
          const jsonStr = markdownToProsemirror(cleanResult);
          const json = JSON.parse(jsonStr);
          parsedContent = json.content || cleanResult;
        } catch {
          parsedContent = cleanResult;
        }

        if (isSelectionEmpty) {
          editor.chain().focus().insertContentAt(to, parsedContent).run();
        } else {
          editor.chain().focus().insertContentAt({ from, to }, parsedContent).run();
        }

        updateAISuccessToast(toastId, "Improve Writing", "Improved writing applied directly.");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "AI request failed";
        console.error("[AIImprover] Error:", msg);
        if (msg.includes("402") || msg.includes("insufficient") || msg.includes("401")) {
          window.dispatchEvent(new CustomEvent("ai-error"));
        }
        updateAIErrorToast(toastId, "Improve Writing", msg.includes("traffic") || msg.includes("limit") ? msg : "Please try again later.");
      }
    };

    window.addEventListener("trigger-ai-improve", handleImprove);
    return () => window.removeEventListener("trigger-ai-improve", handleImprove);
  }, [editor]);

  return null;
}
