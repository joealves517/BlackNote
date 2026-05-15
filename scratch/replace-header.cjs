const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/components/App.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Chunk 1: Replace header
const headerRegex = /<div\s+ref=\{headerRef\}\s+className="absolute z-30 flex items-center justify-between gap-1\.5 pointer-events-none"[\s\S]*?<\/div>\s*<\/div>\s*\)\}/;

const newHeader = `<div className="absolute top-4 left-4 z-40">
          <button 
            className="flex items-center justify-center w-[34px] h-[34px] rounded-lg bg-background/80 backdrop-blur-md border border-border/20 text-muted-foreground hover:text-foreground hover:bg-accent transition-all shadow-sm pointer-events-auto"
            onClick={() => setShowRightToolbar(!showRightToolbar)}
            data-tooltip="Toggle menu"
          >
            <Menu size={18} />
          </button>
        </div>
      )}`;

content = content.replace(headerRegex, newHeader);

// Chunk 2: Add Right Sidebar
const mainContentRegex = /(<div className="flex-1 flex flex-col min-w-0 h-full">[\s\S]*?<NoteEditor[\s\S]*?\/>\s*<\/div>)/;

const newRightSidebar = `$1

      {/* ─── Vertical Right Toolbar ─── */}
      <AnimatePresence>
        {showRightToolbar && !isRecording && !isSTTActive && !isMeetSyncActive && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 60, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="h-full flex-shrink-0 border-l border-border/10 bg-background/50 backdrop-blur-xl flex flex-col items-center py-5 z-30 overflow-hidden shadow-[-4px_0_24px_rgba(0,0,0,0.02)]"
          >
            <div className="flex flex-col items-center gap-3 w-full opacity-100 min-w-[60px]">
              <button
                className="flex items-center justify-center w-10 h-10 rounded-full bg-[hsl(45,90%,55%)] text-black hover:scale-105 transition-transform shadow-sm"
                onClick={handleCreateNote}
                data-tooltip="New note"
                data-placement="left"
              >
                <PlusIcon className="w-5 h-5" />
              </button>
              
              <button
                className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                onClick={() => window.dispatchEvent(new CustomEvent("open-note-chat"))}
                data-tooltip="Ask AI"
                data-placement="left"
              >
                <span style={{ fontSize: 18, lineHeight: 1, color: "var(--foreground)" }}>✦</span>
              </button>

              <div className="w-6 h-[1px] bg-border/20 my-1" />

              <button
                className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-muted-foreground hover:text-foreground"
                onClick={handleOpenHistory}
                data-tooltip="History"
                data-placement="left"
              >
                <LayoutListIcon size={18} />
              </button>

              <button
                className="flex items-center justify-center w-10 h-10 rounded-full transition-colors text-muted-foreground hover:text-foreground"
                onClick={() => setShowClipper(!showClipper)}
                data-tooltip="Clip page"
                data-placement="left"
                style={{ backgroundColor: showClipper ? "hsl(var(--muted))" : "transparent" }}
              >
                <GlobeIcon size={18} />
              </button>
            </div>

            <div className="mt-auto flex flex-col items-center gap-3 w-full min-w-[60px]">
              <button
                className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-muted-foreground hover:text-foreground"
                onClick={() => window.dispatchEvent(new CustomEvent("open-import-export-sheet"))}
                data-tooltip="Settings"
                data-placement="left"
              >
                <SettingsIcon size={18} />
              </button>

              <button
                className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-all"
                onClick={() => setShowAccountMenu(!showAccountMenu)}
                data-tooltip={!user ? "Sign in / Account" : "Account"}
                data-placement="left"
              >
                {!user ? (
                  <GuestAvatarIcon />
                ) : getUserAvatar(user) ? (
                  <img src={getUserAvatar(user)!} alt="" className="w-[28px] h-[28px] rounded-full object-cover border border-border/20" />
                ) : (
                  <div className="w-[28px] h-[28px] rounded-full bg-muted flex items-center justify-center text-xs font-bold border border-border/20">
                    {(user.displayName || user.user_metadata?.full_name || user.email || "U").charAt(0).toUpperCase()}
                  </div>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>`;

content = content.replace(mainContentRegex, newRightSidebar);

fs.writeFileSync(filePath, content);
console.log('App.tsx updated.');
