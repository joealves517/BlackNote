import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, "../src/public/welcome-blacknote.mp3");

const VOICE_NAME = "en-US-Chirp3-HD-Puck";
const TTS_API_URL = `https://texttospeech.googleapis.com/v1beta1/text:synthesize`;

const text = "Welcome to BlackNote, your intelligent workspace! Here are some powerful features to get you started. You can chat directly with your document by clicking the Sparkles icon on the top right. Ask questions, extract insights, and get instant answers. Type a slash to record Audio or Screen Video directly into your note. Then, click the media block to transcribe, summarize, and even chat with your media to extract key points. Use the slash command anywhere to quickly insert formatting, or highlight any text and press Ask AI to rewrite, translate, and polish your writing like a pro. The Web Clipper lets you instantly capture content, even from YouTube videos, saving it directly to your notes. And with seamless sync, simply connect your Google account to keep all your ideas securely across your devices. Ready to elevate your productivity? Happy writing!";

async function generateWelcomeTTS() {
  try {
    console.log("Generating audio with Google Cloud TTS (Chirp3-HD-Puck)...");
    
    // Grab authentication token from gcloud
    const token = execSync("gcloud auth print-access-token", { encoding: "utf-8" }).trim();
    const projectId = execSync("gcloud config get-value project", { encoding: "utf-8" }).trim();

    const audioResponse = await fetch(
      TTS_API_URL,
      {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
          "x-goog-user-project": projectId
        },
        body: JSON.stringify({
          input: { text: text },
          voice: { languageCode: "en-US", name: VOICE_NAME },
          audioConfig: {
            audioEncoding: "MP3",
            speakingRate: 1.0,
            pitch: 0.0,
            volumeGainDb: 0.0,
          },
        }),
      }
    );

    if (!audioResponse.ok) {
      const error = await audioResponse.text();
      console.error(`❌ API error (Audio) (${audioResponse.status}): ${error}`);
      return false;
    }

    const audioData = (await audioResponse.json()) as {
      audioContent: string;
    };

    const audioBuffer = Buffer.from(audioData.audioContent, "base64");
    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, audioBuffer);
    console.log(`✅ Saved: ${OUTPUT_PATH}`);
  } catch (err) {
    console.error("Error generating TTS:", err);
  }
}

generateWelcomeTTS();
