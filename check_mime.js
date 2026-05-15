import fs from 'fs';
const API_KEY = 'AIzaSyB9Idi7DYIkSWnl1urpImbCIhNMztPVFSU';
const SCRIPT_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent?key=${API_KEY}`;
const requestBody = {
  contents: [{ role: 'user', parts: [{ text: "Hello" }] }],
  generationConfig: {
    responseModalities: ["AUDIO"],
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } } }
  }
};
fetch(SCRIPT_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) })
  .then(r => r.json())
  .then(d => console.log(d.candidates[0].content.parts.find(p => p.inlineData).inlineData.mimeType));
