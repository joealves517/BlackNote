import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "@/components/App";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { setWasmUrl } from "@lottiefiles/dotlottie-react";
import "@/index.css";

// Fix Lottie WebAssembly CSP by using local bundled wasm instead of CDN
setWasmUrl(chrome.runtime.getURL("dotlottie-player.wasm"));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
