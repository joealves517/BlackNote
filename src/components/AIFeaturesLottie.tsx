import React from "react";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";

export const AIFeaturesLottie = () => {
  return (
    <div className="w-full relative flex items-center justify-center mb-5 mt-2 overflow-visible" style={{ height: "180px" }}>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] h-[480px] flex items-center justify-center pointer-events-auto">
        <DotLottieReact 
          src={chrome.runtime.getURL("ai-features.lottie")} 
          autoplay 
          loop 
          backgroundColor="transparent" 
          stateMachineId="StateMachine1" 
          style={{ width: "100%", height: "100%" }} 
        />
      </div>
    </div>
  );
};
