import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, tool } from "ai";
import { z } from "zod";

// The sandbox key provided by the user (read from local storage for safety)
const TEST_API_KEY = typeof window !== "undefined" ? localStorage.getItem("test_api_key") || "" : "";

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
Do not output raw block markers (like «b0») in your text. Only use the tools to modify the document.
You can call multiple tools if necessary. If no tools are needed, just reply normally.

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

  const results: AgentToolResult[] = [];

  for (const call of toolCalls) {
    if (call.toolName === "insertContent") {
      results.push({ type: "insert", text: call.args.text });
    } else if (call.toolName === "replaceBlock") {
      results.push({ type: "replace", blockId: call.args.blockId, newText: call.args.newText });
    } else if (call.toolName === "deleteBlock") {
      results.push({ type: "delete", blockId: call.args.blockId });
    } else if (call.toolName === "updateTitle") {
      results.push({ type: "title", newTitle: call.args.newTitle });
    }
  }

  return { text, tools: results };
}
