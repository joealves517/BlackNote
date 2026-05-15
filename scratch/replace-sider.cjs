const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/components/App.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add new icons if needed
if (!content.includes('PanelRightClose')) {
  content = content.replace('import { Mic, MicOff, Menu } from "lucide-react";', 'import { Mic, MicOff, Menu, PanelRightClose } from "lucide-react";');
}

// 2. Change root background
content = content.replace(
  '<div\n      id="blacknote-root"\n      className="relative flex h-screen w-full overflow-hidden"\n      style={{ backgroundColor: "hsl(var(--background))" }}\n    >',
  '<div\n      id="blacknote-root"\n      className="relative flex h-screen w-full overflow-hidden"\n      style={{ backgroundColor: "var(--sider-bg, rgba(0,0,0,0.03))" }}\n    >'
);
// We will add a dark mode class for `--sider-bg` in CSS or just use standard classes. Let's use standard Tailwind classes.
content = content.replace(
  '<div\n      id="blacknote-root"\n      className="relative flex h-screen w-full overflow-hidden"\n      style={{ backgroundColor: "var(--sider-bg, rgba(0,0,0,0.03))" }}\n    >',
  '<div\n      id="blacknote-root"\n      className="relative flex h-screen w-full overflow-hidden bg-black/5 dark:bg-white/5"\n    >'
);

// Actually let's just do a regex replace for the root div
content = content.replace(
  /<div\s+id="blacknote-root"[\s\S]*?>/,
  `<div\n      id="blacknote-root"\n      className="relative flex h-screen w-full overflow-hidden bg-black/5 dark:bg-white/5"\n    >`
);

// 3. Remove the absolute Menu button from lines 894-903
const menuButtonRegex = /<div className="absolute top-4 left-4 z-40">[\s\S]*?<\/div>\s*\}\)/;
content = content.replace(menuButtonRegex, `
      {/* Floating Menu Toggle when Sidebar is closed */}
      <AnimatePresence>
        {!showRightToolbar && !isRecording && !isSTTActive && !isMeetSyncActive && (
          <motion.button 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute top-4 right-4 z-40 flex items-center justify-center w-8 h-8 rounded-md bg-background border border-border/20 text-muted-foreground hover:text-foreground hover:bg-accent transition-all shadow-sm pointer-events-auto"
            onClick={() => setShowRightToolbar(true)}
            data-tooltip="Open menu"
          >
            <Menu size={16} />
          </motion.button>
        )}
      </AnimatePresence>
      )}`);

// 4. Update the Editor container
const editorContainerRegex = /<div className="flex-1 flex flex-col min-w-0 h-full">(\s*<NoteEditor[\s\S]*?\/>\s*)<\/div>/;
content = content.replace(editorContainerRegex, `<motion.div 
        animate={{ 
          borderTopRightRadius: showRightToolbar ? 16 : 0, 
          borderBottomRightRadius: showRightToolbar ? 16 : 0,
        }}
        className="flex-1 flex flex-col min-w-0 h-full bg-background shadow-[4px_0_24px_rgba(0,0,0,0.06)] dark:shadow-[4px_0_24px_rgba(0,0,0,0.4)] transition-all z-10 overflow-hidden"
      >$1</motion.div>`);

// 5. Update the Right Sidebar
const rightSidebarRegex = /<AnimatePresence>\s*\{showRightToolbar[\s\S]*?<\/AnimatePresence>/;

const newRightSidebar = `<AnimatePresence>
        {showRightToolbar && !isRecording && !isSTTActive && !isMeetSyncActive && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 48, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="h-full flex-shrink-0 flex flex-col items-center py-3 z-0 overflow-hidden bg-transparent"
          >
            <div className="flex flex-col items-center gap-2 w-full opacity-100 min-w-[48px]">
              <button
                className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground mb-1"
                onClick={() => setShowRightToolbar(false)}
                data-tooltip="Close menu"
                data-placement="left"
              >
                <PanelRightClose size={16} />
              </button>

              <button
                className="flex items-center justify-center w-8 h-8 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 transition-colors"
                onClick={handleCreateNote}
                data-tooltip="New note"
                data-placement="left"
              >
                <PlusIcon className="w-4 h-4" />
              </button>
              
              <button
                className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                onClick={() => window.dispatchEvent(new CustomEvent("open-note-chat"))}
                data-tooltip="Ask AI"
                data-placement="left"
              >
                <span style={{ fontSize: 15, lineHeight: 1, color: "var(--foreground)" }}>✦</span>
              </button>

              <div className="w-5 h-[1px] bg-border/20 my-1" />

              <button
                className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground"
                onClick={handleOpenHistory}
                data-tooltip="History"
                data-placement="left"
              >
                <LayoutListIcon size={16} />
              </button>

              <button
                className="flex items-center justify-center w-8 h-8 rounded-full transition-colors text-muted-foreground hover:text-foreground"
                onClick={() => setShowClipper(!showClipper)}
                data-tooltip="Clip page"
                data-placement="left"
                style={{ backgroundColor: showClipper ? "hsl(var(--muted))" : "transparent" }}
              >
                <GlobeIcon size={16} />
              </button>
            </div>

            <div className="mt-auto flex flex-col items-center gap-2 w-full min-w-[48px]">
              <button
                className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground"
                onClick={() => window.dispatchEvent(new CustomEvent("open-import-export-sheet"))}
                data-tooltip="Settings"
                data-placement="left"
              >
                <SettingsIcon size={16} />
              </button>

              <button
                className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-all"
                onClick={() => setShowAccountMenu(!showAccountMenu)}
                data-tooltip={!user ? "Sign in / Account" : "Account"}
                data-placement="left"
              >
                {!user ? (
                  <div className="scale-75"><GuestAvatarIcon /></div>
                ) : getUserAvatar(user) ? (
                  <img src={getUserAvatar(user)!} alt="" className="w-[24px] h-[24px] rounded-full object-cover border border-border/20" />
                ) : (
                  <div className="w-[24px] h-[24px] rounded-full bg-muted flex items-center justify-center text-[10px] font-bold border border-border/20">
                    {(user.displayName || user.user_metadata?.full_name || user.email || "U").charAt(0).toUpperCase()}
                  </div>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>`;

content = content.replace(rightSidebarRegex, newRightSidebar);

fs.writeFileSync(filePath, content);
console.log('App.tsx sider updated.');
