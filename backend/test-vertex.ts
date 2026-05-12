import { GoogleGenAI } from "@google/genai";
import { execSync } from "child_process";

async function testModel(modelName: string) {
  try {
    const ai = new GoogleGenAI({
      vertexai: {
        project: "ask-this-page",
        location: "us-central1"
      }
    });
    // @ts-ignore
    ai.auth = undefined; 
    
    // Actually we can just run curl to the vertex endpoint!
  } catch (e) {}
}
