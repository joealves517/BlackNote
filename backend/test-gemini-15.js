import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  vertexai: true,
  project: "ask-this-page",
  location: "us-east4",
});

async function run() {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: "Hello, is gemini-2.5-flash-lite available?",
    });
    console.log("RESULT:", response.text);
  } catch (err) {
    console.error("FAILED:", err.message || err);
  }
}
run();
