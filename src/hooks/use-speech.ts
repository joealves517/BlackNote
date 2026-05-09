import { useState, useEffect, useCallback, useRef } from "react";

export function useSpeech() {
  const [isRecording, setIsRecording] = useState(false);
  
  // ==================== SPEECH TO TEXT (STT) ====================
  const recognitionRef = useRef<any>(null);
  const shouldAutoRestartRef = useRef(false);

  const startRecording = useCallback((onResult: (interim: string, isFinal: boolean) => void) => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    if (recognitionRef.current) {
      shouldAutoRestartRef.current = false;
      recognitionRef.current.stop();
    }

    shouldAutoRestartRef.current = true;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => setIsRecording(true);
    
    recognition.onresult = (event: any) => {
      let interimTranscript = "";
      let finalTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      
      if (finalTranscript) {
        onResult(finalTranscript, true);
      }
      if (interimTranscript) {
        onResult(interimTranscript, false);
      }
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      if (event.error === "not-allowed") {
        shouldAutoRestartRef.current = false;
        const setupUrl = chrome.runtime.getURL("setup.html");
        chrome.tabs.create({ url: setupUrl });
      }
      // If error is network or no-speech, we might still want to auto-restart
      if (event.error === "aborted") {
         shouldAutoRestartRef.current = false;
      }
    };

    recognition.onend = () => {
      if (shouldAutoRestartRef.current) {
        try {
          recognition.start();
        } catch (e) {
          setIsRecording(false);
          shouldAutoRestartRef.current = false;
        }
      } else {
        setIsRecording(false);
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch (e) {
      console.error("Failed to start speech recognition", e);
      setIsRecording(false);
    }
  }, []);

  const stopRecording = useCallback(() => {
    shouldAutoRestartRef.current = false;
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  // ==================== CLEANUP ====================
  useEffect(() => {
    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
    };
  }, []);

  return {
    // STT
    isRecording,
    startRecording,
    stopRecording,
  };
}
