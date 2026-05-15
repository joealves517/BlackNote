const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '../src/components/App.tsx');
let content = fs.readFileSync(appPath, 'utf8');

// We need to inject event listeners into the App.tsx useEffect that already handles "panel-closed"
const targetHook = `  useEffect(() => {
    const handlePanelClosed = () => setActivePanel(null);
    window.addEventListener("panel-closed", handlePanelClosed);
    return () => window.removeEventListener("panel-closed", handlePanelClosed);
  }, []);`;

const newHook = `  useEffect(() => {
    const handlePanelClosed = () => setActivePanel(null);
    
    const syncPanelState = (panel: "history" | "clipper" | "account" | "note-chat" | "settings") => {
      setActivePanel(panel);
      setShowHistory(panel === "history");
      setShowClipper(panel === "clipper");
      setShowAccountMenu(panel === "account");
      if (panel !== "note-chat") window.dispatchEvent(new CustomEvent("close-note-chat"));
      if (panel !== "settings") window.dispatchEvent(new CustomEvent("close-import-export-sheet"));
    };

    const onOpenNoteChat = () => syncPanelState("note-chat");
    const onOpenSettings = () => syncPanelState("settings");
    const onOpenClipper = () => syncPanelState("clipper");
    const onOpenHistory = () => syncPanelState("history");

    window.addEventListener("panel-closed", handlePanelClosed);
    window.addEventListener("open-note-chat", onOpenNoteChat);
    window.addEventListener("open-import-export-sheet", onOpenSettings);
    window.addEventListener("open-web-clipper", onOpenClipper);
    window.addEventListener("trigger-clipper", onOpenClipper);

    return () => {
      window.removeEventListener("panel-closed", handlePanelClosed);
      window.removeEventListener("open-note-chat", onOpenNoteChat);
      window.removeEventListener("open-import-export-sheet", onOpenSettings);
      window.removeEventListener("open-web-clipper", onOpenClipper);
      window.removeEventListener("trigger-clipper", onOpenClipper);
    };
  }, []);`;

content = content.replace(targetHook, newHook);

// Now, remove the old fragmented listeners for web clipper!
// The old code had:
/*
  // Listen for slash command "/clip" → open clipper
  useEffect(() => {
    const handleOpenClipper = () => setShowClipper(true);
    window.addEventListener("open-web-clipper", handleOpenClipper);

    return () => {
      window.removeEventListener("open-web-clipper", handleOpenClipper);
    };
  }, []);

  // Also listen for "trigger-clipper" (legacy event from sidebar)
  useEffect(() => {
    const handler = () => setShowClipper(true);
    window.addEventListener("trigger-clipper", handler);
    return () => window.removeEventListener("trigger-clipper", handler);
  }, []);
*/

content = content.replace(/\/\/ Listen for slash command "\/clip" → open clipper[\s\S]*?\/\/ Also listen for "trigger-clipper" \(legacy event from sidebar\)\n  useEffect\(\(\) => \{[\s\S]*?\}, \[\]\);\n/m, '');

fs.writeFileSync(appPath, content);
console.log('Synchronized event listeners globally');
