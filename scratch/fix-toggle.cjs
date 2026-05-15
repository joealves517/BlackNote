const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '../src/components/App.tsx');
let content = fs.readFileSync(appPath, 'utf8');

const targetRegex = /  const handleTogglePanel = useCallback\(\(panel: "history" \| "clipper" \| "account" \| "note-chat" \| "settings"\) => \{[\s\S]*?return next;\n    \}\);\n  \}, \[\]\);/m;

const replacement = `  const handleTogglePanel = useCallback((panel: "history" | "clipper" | "account" | "note-chat" | "settings") => {
    // Dismiss tooltips
    document.querySelectorAll("[data-tippy-root]").forEach((el) => {
      const instance = (el as any)._tippy;
      if (instance) instance.hide();
    });
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    window.getSelection()?.removeAllRanges();

    const next = activePanel === panel ? null : panel;

    setActivePanel(next);
    setShowHistory(next === "history");
    setShowClipper(next === "clipper");
    setShowAccountMenu(next === "account");

    if (next === "note-chat") {
      window.dispatchEvent(new CustomEvent("open-note-chat"));
    } else {
      window.dispatchEvent(new CustomEvent("close-note-chat"));
    }

    if (next === "settings") {
      window.dispatchEvent(new CustomEvent("open-import-export-sheet"));
    } else {
      window.dispatchEvent(new CustomEvent("close-import-export-sheet"));
    }
  }, [activePanel]);`;

content = content.replace(targetRegex, replacement);

fs.writeFileSync(appPath, content);
console.log('Fixed handleTogglePanel');
