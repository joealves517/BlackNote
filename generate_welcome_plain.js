import fs from 'fs';
import path from 'path';

const API_KEY = 'AIzaSyB9Idi7DYIkSWnl1urpImbCIhNMztPVFSU';
const SCRIPT_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent?key=${API_KEY}`;
const VOICE_NAME = 'Puck';

async function generateGeminiTTS(text, outputPath) {
  const requestBody = {
    contents: [{
      role: 'user',
      parts: [{ text: text }]
    }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: VOICE_NAME
          }
        }
      }
    }
  };

  const response = await fetch(SCRIPT_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Error generating TTS`, response.status, errorText);
    return;
  }

  const data = await response.json();
  if (data.candidates && data.candidates[0].content.parts) {
    const audioPart = data.candidates[0].content.parts.find(p => p.inlineData && p.inlineData.mimeType.startsWith('audio/'));
    if (audioPart) {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, Buffer.from(audioPart.inlineData.data, 'base64'));
      console.log(`Saved: ${outputPath}`);
    } else {
      console.log('No audio part returned', JSON.stringify(data.candidates[0], null, 2));
    }
  } else {
    console.error('Error:', JSON.stringify(data, null, 2));
  }
}

const text = "Welcome to BlackNote, your intelligent workspace! Here are some powerful features to get you started. Click the Audio or Video icons in the Right Toolbar to record media directly into your note. Then, click the media block to transcribe, summarize, and even chat with your media to extract key points. With our new Autonomous AI Agent, use the Agent input box at the bottom of the editor to command the AI to autonomously write, edit, format, or translate content. Watch it work and review changes inline! You can also chat directly with your document by clicking the Message Square icon in the Right Toolbar. Ask questions, extract insights, and get instant answers. Type a slash anywhere to quickly insert text formatting. The Web Clipper lets you instantly capture web pages by clicking the Scan Line icon in the Right Toolbar, saving them directly to your notes. And with seamless sync, simply connect your Google account to keep all your ideas securely across your devices. Ready to elevate your productivity? Happy writing!";

generateGeminiTTS(text, 'src/public/welcome-blacknote-raw.mp3');
