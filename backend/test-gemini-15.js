import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  vertexai: true,
  project: "ask-this-page",
  location: "us-central1",
});

async function run() {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: "Hello, is gemini-1.5-flash available?",
    });
    console.log("RESULT:", response.text);
  } catch (err) {
    console.error("FAILED:", err.message || err);
  }
}
run();
