import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, tool } from "ai";
import { z } from "zod";

// The sandbox key provided by the user (read from env for safety)
const TEST_API_KEY = import.meta.env.VITE_GEMINI_TEST_API_KEY || (typeof window !== "undefined" ? localStorage.getItem("test_api_key") : "") || "";

export type AgentToolResult =
  | { type: "insert"; text: string }
  | { type: "replace"; blockId: string; newText: string }
  | { type: "delete"; blockId: string }
  | { type: "title"; newTitle: string };

export async function runFrontendAgentWithTools(
  prompt: string,
  contextMarkdown: string
): Promise<{ text: string; tools: AgentToolResult[] }> {
  // Initialize Google provider directly in the frontend
  const google = createGoogleGenerativeAI({
    apiKey: TEST_API_KEY,
  });

  const { text, toolCalls } = await generateText({
    model: google("gemini-3.1-flash-lite"),
    system: `You are an AI assistant acting directly on a document.
You have been provided with the current document content. The document is divided into blocks, each marked with an ID like «b0», «b1», etc.
Your task is to fulfill the user's request by calling the appropriate tools to modify the document.
- To change a specific block, use replaceBlock.
- To delete a block, use deleteBlock.
- To insert new content, use insertContent.
- To change the title, use updateTitle.
CRITICAL INSTRUCTION: If the user asks to modify, rewrite, or append to the document, you MUST use the provided tools (e.g. replaceBlock, insertContent) to apply the changes. DO NOT return the revised text in a normal chat message.
You can call multiple tools if necessary. If no tools are needed (e.g. general questions), just reply normally.

Current Document:
${contextMarkdown}
`,
    prompt: prompt,
    tools: {
      insertContent: tool({
        description: "Insert new content at the end of the document",
        parameters: z.object({
          text: z.string().describe("The markdown content to insert"),
        }),
      }),
      replaceBlock: tool({
        description: "Replace the content of a specific block",
        parameters: z.object({
          blockId: z.string().describe("The ID of the block to replace (e.g., b0, b1)"),
          newText: z.string().describe("The new markdown content for this block"),
        }),
      }),
      deleteBlock: tool({
        description: "Delete a specific block entirely",
        parameters: z.object({
          blockId: z.string().describe("The ID of the block to delete (e.g., b0, b1)"),
        }),
      }),
      updateTitle: tool({
        description: "Update the title of the document",
        parameters: z.object({
          newTitle: z.string().describe("The new title for the document"),
        }),
      }),
    },
    maxSteps: 1, // Only allow one step for now to keep it fast
  });

  console.log("[Agent Tool Calling] Raw response:", { text, toolCalls: JSON.stringify(toolCalls) });

  const results: AgentToolResult[] = [];

  for (const call of toolCalls) {
    if (!call.args) continue;
    
    const name = call.toolName.toLowerCase().replace(/_/g, "");
    const args = call.args as any;
    
    if (name === "insertcontent") {
      const text = args.text || args.content || args.new_text;
      if (text) results.push({ type: "insert", text });
    } else if (name === "replaceblock") {
      const blockId = args.blockId || args.block_id || args.id;
      const newText = args.newText || args.new_text || args.text || args.content;
      if (blockId && newText !== undefined) {
        const cleanId = blockId.replace(/[«»]/g, "");
        results.push({ type: "replace", blockId: cleanId, newText });
      }
    } else if (name === "deleteblock") {
      const blockId = args.blockId || args.block_id || args.id;
      if (blockId) {
        const cleanId = blockId.replace(/[«»]/g, "");
        results.push({ type: "delete", blockId: cleanId });
      }
    } else if (name === "updatetitle") {
      const newTitle = args.newTitle || args.new_title || args.title;
      if (newTitle) results.push({ type: "title", newTitle });
    }
  }

  console.log("[Agent Tool Calling] Extracted tools:", results);

  return { text, tools: results };
}
