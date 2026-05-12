
export default defineContentScript({
  matches: ["*://meet.google.com/*"],
  runAt: "document_idle",
  main() {
    console.log("BlackNote: Google Meet Live Sync initialized.");

    let isSyncing = false;
    let scanInterval: ReturnType<typeof setInterval> | null = null;
    let lastStatus = "";
    let hasEverJoined = false;

    // Track state per speaker for debouncing
    interface SpeakerState {
       text: string;
       timer: ReturnType<typeof setTimeout> | null;
    }
    const speakerStates = new Map<string, SpeakerState>();
    const speakerLastCaptured = new Map<string, string>();
    const DEBOUNCE_DELAY = 1200; // 1.2 seconds of silence before finalizing

    const flushStableText = (speaker: string, text: string, isNewSpeaker: boolean) => {
        browser.runtime.sendMessage({
            type: "MEET_CAPTION",
            speaker: speaker,
            text: text,
            isNewSpeaker: isNewSpeaker,
            timestamp: new Date().toISOString()
        });
    };

    const executeFlush = (speakerKey: string, text: string) => {
        const lastCaptured = speakerLastCaptured.get(speakerKey) || "";
        
        let diffText = text;
        let isNewSpeaker = !speakerLastCaptured.has(speakerKey);

        // Smart Diffing: Calculate what part of the text is actually new
        if (!isNewSpeaker && text.startsWith(lastCaptured)) {
            // Simple append
            diffText = text.substring(lastCaptured.length).trim();
        } else if (!isNewSpeaker) {
            // Meet modified past punctuation (e.g. "Hello." became "Hello,")
            // We match by word roots to find the newly appended words
            const oldWords = lastCaptured.split(/\s+/);
            const newWords = text.split(/\s+/);
            let matchCount = 0;
            const minLen = Math.min(oldWords.length, newWords.length);
            for (let i = 0; i < minLen; i++) {
                const w1 = oldWords[i].replace(/[.,!?]/g, "").toLowerCase();
                const w2 = newWords[i].replace(/[.,!?]/g, "").toLowerCase();
                if (w1 === w2) {
                    matchCount++;
                } else {
                    break;
                }
            }
            if (matchCount > 0) {
                diffText = newWords.slice(matchCount).join(" ").trim();
                // Even though it's appended, we don't want a new paragraph for it
                isNewSpeaker = false; 
            }
        }

        if (diffText) {
            flushStableText(speakerKey, diffText, isNewSpeaker);
        }
        
        speakerLastCaptured.set(speakerKey, text);
    };

    const processSpeakerCaption = (speaker: string, text: string) => {
       const speakerKey = speaker || "Unknown";
       
       // If this exact string was already fully captured, ignore to prevent infinite loops
       if (speakerLastCaptured.get(speakerKey) === text) {
          return;
       }

       let state = speakerStates.get(speakerKey);
       const isNewText = !state || state.text !== text;

       if (isNewText) {
          if (state && state.timer) {
             clearTimeout(state.timer);
          }

          state = {
             text: text,
             timer: setTimeout(() => {
                 executeFlush(speakerKey, text);
             }, DEBOUNCE_DELAY)
          };
          
          speakerStates.set(speakerKey, state);
       }
    };

    const extractCaptionBlocks = (): { speaker: string, text: string }[] => {
      const blocks: { speaker: string, text: string }[] = [];
      const viewportHeight = window.innerHeight;

      // METHOD 1: Look for standard Google Meet caption classes (often changes)
      const standardItems = document.querySelectorAll('.nMcdL.bj4p3b');
      if (standardItems.length > 0) {
        standardItems.forEach((item) => {
          const speakerEl = item.querySelector('.NWpY1d') as HTMLElement;
          const textEl = item.querySelector('.ygicle.VbkSUe') as HTMLElement;
          const speaker = speakerEl?.textContent?.trim() || "Unknown";
          const text = textEl?.textContent?.trim() || "";
          if (text) blocks.push({ speaker, text });
        });
        if (blocks.length > 0) return blocks;
      }

      // METHOD 2: Structural Avatar/Speaker block discovery (Robust against class changes)
      // Look for avatars (img) or initial-based avatars (divs with specific styling)
      const potentialAvatars = Array.from(document.querySelectorAll('img[src*="googleusercontent.com/a/"], img[src*="googleusercontent.com/u/"]'));
      
      // Add text nodes that look like single initials (fallback avatars)
      const allDivs = document.querySelectorAll('div');
      for (const div of allDivs) {
        if (div.textContent?.length === 1 && div.className.length > 0 && window.getComputedStyle(div).borderRadius === '50%') {
          potentialAvatars.push(div as HTMLElement);
        }
      }

      potentialAvatars.forEach(avatar => {
        const container = avatar.closest('div');
        if (!container || !container.parentElement) return;

        // The caption block is usually the parent of the avatar container
        const parentNode = container.parentElement;
        
        // Ensure this parent node is near the bottom of the screen (captions area)
        const rect = parentNode.getBoundingClientRect();
        if (rect.top < viewportHeight * 0.4) return; // Skip if it's high up (participant list)

        // Extract all text nodes within this block
        const textNodes: string[] = [];
        const walk = document.createTreeWalker(parentNode, NodeFilter.SHOW_TEXT, null);
        let node;
        while ((node = walk.nextNode())) {
          const content = node.textContent?.trim();
          if (content && content.length > 0 && !content.includes("BETA")) {
            textNodes.push(content);
          }
        }

        // The first text node is typically the speaker's name
        if (textNodes.length >= 2) {
          // If the first node is just 1 character (the avatar letter), ignore it
          let speakerIndex = 0;
          if (textNodes[0].length === 1 && textNodes.length >= 3) {
            speakerIndex = 1;
          }
          
          const speaker = textNodes[speakerIndex];
          const text = textNodes.slice(speakerIndex + 1).join(" ");
          
          if (speaker.length < 40 && text.length > 0) {
            blocks.push({ speaker, text });
          }
        }
      });

      if (blocks.length > 0) return blocks;

      // METHOD 3: ARIA Live Region Discovery
      const liveRegions = document.querySelectorAll('[aria-live="polite"], [role="region"][aria-label*="caption" i], [role="region"][aria-label*="자막"]');
      liveRegions.forEach(region => {
         const rect = region.getBoundingClientRect();
         if (rect.bottom > viewportHeight * 0.5 && rect.height > 10) {
            const textNodes: string[] = [];
            const walk = document.createTreeWalker(region, NodeFilter.SHOW_TEXT, null);
            let node;
            while ((node = walk.nextNode())) {
              const content = node.textContent?.trim();
              if (content && content.length > 0 && !content.includes("BETA")) {
                textNodes.push(content);
              }
            }
            if (textNodes.length >= 2) {
              const speaker = textNodes[0];
              const text = textNodes.slice(1).join(" ");
              blocks.push({ speaker, text });
            } else if (textNodes.length === 1) {
              blocks.push({ speaker: "Unknown", text: textNodes[0] });
            }
         }
      });

      return blocks;
    };

    const checkMeetStatus = () => {
        // Robust indicators that we are in an ACTIVE meeting (not the green room)
        const inMeetingIndicators = [
            document.querySelector('[data-meeting-started-timestamp]'), // The meeting clock
            document.querySelector('[data-self-name]'), // Your own video block
            document.querySelector('[data-tooltip*="leave" i], [data-tooltip*="rời" i]'), // Leave button tooltip
            document.querySelector('button[aria-label*="leave" i], button[aria-label*="rời khỏi" i]') // Leave button ARIA
        ];
        
        const isInMeeting = inMeetingIndicators.some(el => el !== null);
        if (!isInMeeting) return "NOT_JOINED";
        
        const ccButton = document.querySelector('button[jsname="r8qRCE"], button[aria-label*="caption" i], button[aria-label*="phụ đề" i]');
        if (ccButton) {
            const label = (ccButton.getAttribute("aria-label") || "").toLowerCase();
            if (label.includes("turn on") || label.includes("bật")) {
                return "CC_OFF";
            }
            if (ccButton.getAttribute("aria-pressed") === "false" && !label.includes("turn off") && !label.includes("tắt")) {
                return "CC_OFF";
            }
        }
        
        return "READY";
    };

    const scanDOM = () => {
      const status = checkMeetStatus();
      
      if (status === "NOT_JOINED" && hasEverJoined) {
          browser.runtime.sendMessage({ type: "MEET_SYNC_FINISHED" });
          hasEverJoined = false;
          return;
      }

      if (status !== lastStatus) {
         browser.runtime.sendMessage({ type: "MEET_STATUS", status });
         lastStatus = status;
      }

      if (status === "READY") {
          hasEverJoined = true;
      }

      if (status !== "READY") return;

      const blocks = extractCaptionBlocks();
      blocks.forEach(block => {
        processSpeakerCaption(block.speaker, block.text);
      });
    };

    // Listen for messages from BlackNote to start/stop syncing
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.action === "start-meet-sync") {
        isSyncing = true;
        speakerStates.clear();
        speakerLastCaptured.clear();
        lastStatus = ""; // Reset so it immediately broadcasts status
        hasEverJoined = false; // Reset session
        console.log("BlackNote: Live Sync STARTED");
        if (!scanInterval) {
          scanInterval = setInterval(scanDOM, 500); // Poll DOM frequently, debounce handles the rest
        }
        sendResponse({ success: true });
        return true;
      }
      if (message.action === "stop-meet-sync") {
        isSyncing = false;
        console.log("BlackNote: Live Sync STOPPED");
        if (scanInterval) {
          clearInterval(scanInterval);
          scanInterval = null;
        }
        
        // Force flush any pending text when stopped
        for (const [speakerKey, state] of speakerStates.entries()) {
           if (state.timer) {
              clearTimeout(state.timer);
              executeFlush(speakerKey, state.text);
           }
        }
        speakerStates.clear();
        speakerLastCaptured.clear();
        sendResponse({ success: true });
        return true;
      }
    });
  },
});
