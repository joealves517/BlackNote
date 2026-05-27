import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, tool } from "ai";
import { z } from "zod";

// The sandbox key provided by the user (read from local storage or env for safety)
const TEST_API_KEY = typeof window !== "undefined" ? localStorage.getItem("test_api_key") || import.meta.env.VITE_GEMINI_TEST_API_KEY || "" : "";

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
    temperature: 0, // Force precision and deterministic tool calling
    system: `You are an AI assistant acting directly on a document.
You have been provided with the current document content. The document is divided into blocks, each marked with an ID like «b0», «b1», etc.
Your task is to fulfill the user's request by calling the appropriate tools to modify the document.
- To change a specific block, use replaceBlock.
- To delete a block, use deleteBlock.
- To insert new content, use insertContent.
- To change the title, use updateTitle.

CRITICAL INSTRUCTIONS:
1. If the user asks to modify, rewrite, or append to the document, you MUST use the provided tools. DO NOT return the revised text in a normal chat message.
2. You can call MULTIPLE tools in parallel at the same time to fulfill all parts of the user's request. For example, if the user asks you to rewrite block 2 («b1») and delete block 3 («b2»), you MUST output BOTH tool calls in parallel (replaceBlock for «b1» and deleteBlock for «b2»). Do not just perform one of them!
3. Pay close attention to block IDs:
   - Block 1 corresponds to «b0»
   - Block 2 corresponds to «b1»
   - Block 3 corresponds to «b2»
   - Block 4 corresponds to «b3»
   - And so on.
4. **Empty Blocks:** Trailing paragraphs may be serialized as '«bN» [empty]'. If the user asks to delete the "last block" or modify the "end" of the document, ignore these empty trailing blocks and target the last **non-empty** block instead. Do not just delete or modify the empty block at the end.

RICH FORMATTING SUPERPOWERS:
The editor (Tiptap) supports full HTML styling. You can format the 'newText' or 'text' in your tools with inline HTML for premium styling whenever the user requests colors, highlights, underlining, or alignment:
- **Text Colors:** Use '<span style="color: #HEX_CODE">text</span>' (e.g., '<span style="color: #E74C3C">Red Text</span>', '<span style="color: #3498DB">Blue Text</span>', '<span style="color: #2ECC71">Green Text</span>').
- **Coloring Links:** To add color to a link, wrap the link in the span tag, for example: '<span style="color: #3498DB">[Link Text](URL)</span>' or '[<span style="color: #3498DB">Link Text</span>](URL)'. DO NOT make links bold (do not use '**' or '<strong>' on links) unless the user explicitly requests bold links.
- **Highlights:** Use '<mark style="background-color: #HEX_CODE">highlighted text</mark>' (e.g., '<mark style="background-color: #F1C40F">Yellow Highlight</mark>').
- **Underline:** Use '<u>underlined text</u>'.
- **Text Alignment:** Use '<p style="text-align: center">centered text</p>' or '<p style="text-align: right">right text</p>'. You can also align headings: '<h2 style="text-align: center">Centered Heading</h2>'.
- **Strikethrough:** Use '~~strikethrough text~~'.
- **Task Lists:** Use '- [ ] Task item' or '- [x] Completed item'.
- **Tables, Code blocks, Lists:** Use standard Markdown or HTML tables and lists.
Feel free to combine these styles to make the document beautiful and structured when the user asks for it!

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
    const rawArgs = call.args || (call as any).input;
    if (!rawArgs) {
      console.log("Skipped tool call because no args or input:", call);
      continue;
    }
    
    console.log("Evaluating tool call:", call);
    
    const name = call.toolName.toLowerCase().replace(/_/g, "");
    let args = rawArgs as any;
    
    if (typeof args === "string") {
      try {
        args = JSON.parse(args);
      } catch (e) {
        console.log("Could not parse args string:", args);
      }
    }
    
    console.log("Parsed name:", name, "args:", args);
    
    if (name === "insertcontent") {
      const text = args.text || args.content || args.new_text || args.newtext;
      if (text) {
        results.push({ type: "insert", text });
      } else {
        console.log("Missing text in insertcontent:", args);
      }
    } else if (name === "replaceblock") {
      const blockId = args.blockId || args.block_id || args.id || args.blockid;
      const newText = args.newText || args.new_text || args.text || args.content || args.newtext;
      console.log("Extracted replaceblock blockId:", blockId, "newText length:", newText?.length);
      if (blockId && newText !== undefined) {
        const cleanId = blockId.replace(/[«»]/g, "");
        results.push({ type: "replace", blockId: cleanId, newText });
      } else {
        console.log("Missing blockId or newText in replaceblock:", args);
      }
    } else if (name === "deleteblock") {
      const blockId = args.blockId || args.block_id || args.id || args.blockid;
      if (blockId) {
        const cleanId = blockId.replace(/[«»]/g, "");
        results.push({ type: "delete", blockId: cleanId });
      }
    } else if (name === "updatetitle") {
      const newTitle = args.newTitle || args.new_title || args.title || args.newtitle;
      if (newTitle) results.push({ type: "title", newTitle });
    }
  }

  console.log("[Agent Tool Calling] Extracted tools:", results);

  return { text, tools: results };
}
