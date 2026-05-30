/**
 * Minimal test: call Gemini directly with function calling (no ADK).
 * This isolates whether the issue is with ADK or the model.
 */
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({
  vertexai: true,
  project: "ask-this-page",
  location: "us-central1",
});

const replaceBlockDeclaration = {
  name: "replaceBlock",
  description: "Replace the content of a specific block in the document",
  parameters: {
    type: Type.OBJECT,
    properties: {
      blockId: { type: Type.STRING, description: "Block ID to replace (e.g. b0, b1, replace_all)" },
      newText: { type: Type.STRING, description: "New markdown content" },
    },
    required: ["blockId", "newText"],
  },
};

const insertContentDeclaration = {
  name: "insertContent",
  description: "Insert new markdown content at the end of the document",
  parameters: {
    type: Type.OBJECT,
    properties: {
      text: { type: Type.STRING, description: "The markdown content to insert" },
    },
    required: ["text"],
  },
};

async function testFunctionCalling() {
  console.log("Testing Gemini function calling directly...\n");

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `USER REQUEST: Translate this to Vietnamese

--- DOCUMENT CONTEXT ---
Note Title: Test
Document Content:
«b1»Hello World
--- END DOCUMENT ---`,
          },
        ],
      },
    ],
    config: {
      systemInstruction: `You are BlackNote AI. When the user asks to modify a document, call the appropriate tool. For translation, use replaceBlock with blockId="replace_all".`,
      tools: [
        {
          functionDeclarations: [replaceBlockDeclaration, insertContentDeclaration],
        },
      ],
    },
  });

  console.log("Response:");
  console.log(JSON.stringify(response, null, 2));

  // Check for function calls
  const parts = response.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (part.functionCall) {
      console.log("\n✅ Function call detected:");
      console.log(`  Name: ${part.functionCall.name}`);
      console.log(`  Args: ${JSON.stringify(part.functionCall.args)}`);
    }
    if (part.text) {
      console.log(`\n📝 Text response: ${part.text}`);
    }
  }
}

testFunctionCalling().catch(console.error);
