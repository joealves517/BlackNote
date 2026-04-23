import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function run() {
  try {
    const res = await ai.models.generateContentStream({
      model: "gemini-2.5-flash-lite",
      contents: "Hello"
    });
    for await (const chunk of res) {
      console.log("Chunk:", chunk.text);
    }
  } catch (e) {
    console.error("Error:", e);
  }
}
run();
