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

    // Pre-check: distinguish "no hardware" from "no permission"
    try {
      const perm = await navigator.permissions.query({ name: "microphone" as PermissionName });
      if (perm.state === "denied") {
        // Permission explicitly denied → show permission sheet
        window.dispatchEvent(new CustomEvent("stt-error", { detail: { code: "NOT_ALLOWED" } }));
        return;
      }
      if (perm.state === "granted") {
        // Permission granted but mic might be missing → quick test
        try {
          const testStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          testStream.getTracks().forEach(t => t.stop());
        } catch (hwErr: any) {
          if (hwErr.name === "NotFoundError") {
            window.dispatchEvent(new CustomEvent("stt-error", { detail: { code: "NO_DEVICE" } }));
          } else {
            window.dispatchEvent(new CustomEvent("stt-error", { detail: { code: "NOT_ALLOWED" } }));
          }
          return;
        }
      }
      // "prompt" state → SpeechRecognition will trigger Chrome's permission dialog
    } catch {
      // permissions.query not available — proceed and let SpeechRecognition handle it
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
