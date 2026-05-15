import fs from 'fs';
import path from 'path';

const API_KEY = 'AIzaSyB9Idi7DYIkSWnl1urpImbCIhNMztPVFSU';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${API_KEY}`;
// Note: using gemini-2.0-flash-exp or similar endpoint that supports TTS.
// Let's use the exact url from the script
const EXACT_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;
// Actually the script uses `gemini-3.1-flash-tts-preview` but let me use `gemini-2.0-flash-exp` which is known to support audio out, or I'll just use the exact string from the user's script `gemini-3.1-flash-tts-preview`. I will use what's in the script!
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

const text = "Hey there! Welcome to BlackNote, your intelligent workspace. Let's quickly go over some powerful features to get you started. First off, you can click the Audio or Video icons in the Right Toolbar to start recording media directly into your note. Once recorded, just click the media block to instantly transcribe, summarize, and even chat with your media to extract key points. Next, check out our new Autonomous A I Agent. Just use the Agent input box at the bottom of the editor to command the A I. It can autonomously write, edit, format, or translate your content. You can literally watch it work, and review all changes inline. Need to ask something about your notes? You can chat directly with your document by clicking the Message Square icon in the Right Toolbar. Ask questions, extract insights, and get instant answers. Oh, and don't forget the Web Clipper. By clicking the Scan Line icon in the Right Toolbar, you can instantly capture entire web pages and save them directly to your notes. And of course, everything syncs seamlessly. Just connect your Google account, and all your ideas will be securely available across your devices. Ready to elevate your productivity? Happy writing!";

generateGeminiTTS(text, 'src/public/welcome-blacknote.mp3');
