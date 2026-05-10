import { useState, useEffect, useCallback, useRef } from "react";

export function useSpeech() {
  const [isRecording, setIsRecording] = useState(false);
  
  // ==================== SPEECH TO TEXT (STT) ====================
  const recognitionRef = useRef<any>(null);
  const shouldAutoRestartRef = useRef(false);

  const startRecording = useCallback(async (onResult: (interim: string, isFinal: boolean) => void) => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      window.dispatchEvent(new CustomEvent("stt-error", { detail: { code: "NOT_SUPPORTED" } }));
      return;
    }

    // Pre-check: is there any microphone hardware available?
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasMic = devices.some(d => d.kind === "audioinput" && d.deviceId !== "");
      if (!hasMic) {
        window.dispatchEvent(new CustomEvent("stt-error", { detail: { code: "NO_DEVICE" } }));
        return;
      }
    } catch {
      // enumerateDevices not available — proceed and let SpeechRecognition handle it
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
        window.dispatchEvent(new CustomEvent("stt-error", { detail: { code: "NOT_ALLOWED" } }));
      }
      if (event.error === "audio-capture") {
        shouldAutoRestartRef.current = false;
        window.dispatchEvent(new CustomEvent("stt-error", { detail: { code: "NO_DEVICE" } }));
      }
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
