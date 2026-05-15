const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '../src/components/App.tsx');
let content = fs.readFileSync(appPath, 'utf8');

// Add activePanel state
const stateDeclarations = '  const [showHistory, setShowHistory] = useState(false);';
const newStates = `  const [activePanel, setActivePanel] = useState<"history" | "clipper" | "account" | "note-chat" | "settings" | null>(null);
  const [showHistory, setShowHistory] = useState(false);`;
content = content.replace(stateDeclarations, newStates);

// Add useEffect for panel-closed and togglePanel function
const effectHook = `  useEffect(() => {`;
const newHooks = `  useEffect(() => {
    const handlePanelClosed = () => setActivePanel(null);
    window.addEventListener("panel-closed", handlePanelClosed);
    return () => window.removeEventListener("panel-closed", handlePanelClosed);
  }, []);

  const handleTogglePanel = useCallback((panel: "history" | "clipper" | "account" | "note-chat" | "settings") => {
    // Dismiss tooltips
    document.querySelectorAll("[data-tippy-root]").forEach((el) => {
      const instance = (el as any)._tippy;
      if (instance) instance.hide();
    });
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    window.getSelection()?.removeAllRanges();

    setActivePanel(prev => {
      const next = prev === panel ? null : panel;
      
      // Close all locally managed sheets
      setShowHistory(false);
      setShowClipper(false);
      setShowAccountMenu(false);
      
      // Close all remotely managed sheets
      window.dispatchEvent(new CustomEvent("close-note-chat"));
      window.dispatchEvent(new CustomEvent("close-import-export-sheet"));

      // Open the target sheet
      if (next === "history") setShowHistory(true);
      if (next === "clipper") setShowClipper(true);
      if (next === "account") setShowAccountMenu(true);
      if (next === "note-chat") window.dispatchEvent(new CustomEvent("open-note-chat"));
      if (next === "settings") window.dispatchEvent(new CustomEvent("open-import-export-sheet"));

      return next;
    });
  }, []);

  useEffect(() => {`;
content = content.replace(effectHook, newHooks);

// Replace handleOpenHistory usage with handleTogglePanel("history")
content = content.replace(/handleOpenHistory/g, '() => handleTogglePanel("history")');

// Wait, the original handleOpenHistory function is:
// const handleOpenHistory = () => { ... }
// Let's remove the original handleOpenHistory declaration
content = content.replace(/  const handleOpenHistory = \(\) => {[\s\S]*?setShowHistory\(true\);\n  };\n/m, '');

// Replace showClipper toggle
content = content.replace(/onClick=\{\(\) => setShowClipper\(!showClipper\)\}/g, 'onClick={() => handleTogglePanel("clipper")}');

// Replace showAccountMenu toggle
content = content.replace(/onClick=\{\(\) => setShowAccountMenu\(!showAccountMenu\)\}/g, 'onClick={() => handleTogglePanel("account")}');

// Replace note-chat open event with handleTogglePanel("note-chat")
// The button has: onClick={() => window.dispatchEvent(new CustomEvent("open-note-chat"))}
content = content.replace(/onClick=\{\(\) => window\.dispatchEvent\(new CustomEvent\("open-note-chat"\)\)\}/g, 'onClick={() => handleTogglePanel("note-chat")}');

// Replace import-export open event with handleTogglePanel("settings")
// The button has: onClick={() => window.dispatchEvent(new CustomEvent("open-import-export-sheet"))}
content = content.replace(/onClick=\{\(\) => window\.dispatchEvent\(new CustomEvent\("open-import-export-sheet"\)\)\}/g, 'onClick={() => handleTogglePanel("settings")}');

// Now, update styling so that the active panel icon has a background!
// The clipper button currently has: style={{ backgroundColor: showClipper ? "hsl(var(--muted))" : "transparent" }}
// And its className is ...
// Let's replace the inline styles and classNames for ALL panel toggles to use activePanel.

// Wait, it's easier to just use standard React logic. I'll write a regex to inject style attribute.
// But wait, the toolbar is inside <div className="flex flex-col items-center gap-3 w-full ...">
fs.writeFileSync(appPath, content);
console.log('Centralized state updated.');
