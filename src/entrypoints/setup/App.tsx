import { useState, useEffect } from "react";
import { Mic, CheckCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";

export default function OptionsApp() {
  const { theme } = useTheme();
  const [permissionState, setPermissionState] = useState<PermissionState | "unsupported">("prompt");

  useEffect(() => {
    checkPermission();
  }, []);

  const checkPermission = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setPermissionState("unsupported");
      return;
    }
    
    try {
      const result = await navigator.permissions.query({ name: "microphone" as PermissionName });
      setPermissionState(result.state);
      result.onchange = () => {
        setPermissionState(result.state);
      };
    } catch (e) {
      // Firefox or some environments might not support querying microphone directly
      console.error(e);
    }
  };

  const requestPermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stop the tracks immediately since we only want permission
      stream.getTracks().forEach((track) => track.stop());
      setPermissionState("granted");
    } catch (err) {
      console.error("Failed to get microphone permission", err);
      setPermissionState("denied");
    }
  };

  const openSettings = () => {
    chrome.runtime.sendMessage({ type: "OPEN_EXTENSION_SETTINGS" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-8">
      <div className="max-w-md w-full space-y-8 p-8 border rounded-2xl bg-card text-card-foreground shadow-sm">
        <div className="text-center">
          <div className="mx-auto w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mb-4">
            <Mic className="w-8 h-8 text-blue-500" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">Microphone Access</h1>
          <p className="text-muted-foreground">
            BlackNote needs access to your microphone to enable the Speech-to-Text feature.
          </p>
        </div>

        <div className="space-y-4">
          {permissionState === "granted" && (
            <div className="p-4 bg-green-500/10 text-green-600 rounded-lg flex items-center gap-3">
              <CheckCircle className="w-5 h-5 shrink-0" />
              <p className="text-sm font-medium">Permission granted! You can now use voice typing in BlackNote.</p>
            </div>
          )}

          {permissionState === "denied" && (
            <div className="p-4 bg-red-500/10 text-red-600 rounded-lg flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium">Permission denied</p>
                <p className="opacity-90 mt-1">Please enable microphone access in your browser site settings and reload.</p>
              </div>
            </div>
          )}

          {permissionState === "unsupported" && (
            <div className="p-4 bg-yellow-500/10 text-yellow-600 rounded-lg flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <p className="text-sm font-medium">Your browser does not support audio recording.</p>
            </div>
          )}

          {permissionState === "prompt" && (
            <Button 
              className="w-full h-12 text-lg font-medium" 
              onClick={requestPermission}
            >
              Grant Permission
            </Button>
          )}

          {permissionState === "denied" && (
            <Button 
              className="w-full h-12 text-lg font-medium" 
              variant="destructive"
              onClick={openSettings}
            >
              Open Site Settings
            </Button>
          )}

          {permissionState === "granted" && (
            <Button 
              className="w-full h-12 text-lg font-medium" 
              variant="outline"
              onClick={() => window.close()}
            >
              Close Window
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
