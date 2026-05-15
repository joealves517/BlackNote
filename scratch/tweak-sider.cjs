const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/components/App.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Move Menu toggle inside the Editor container (so it stays on the right edge of the editor)
// Remove the absolute toggle from root:
const menuButtonRegex = /<AnimatePresence>\s*\{\!showRightToolbar[\s\S]*?<\/AnimatePresence>\s*\)\}/;
content = content.replace(menuButtonRegex, ')}');

// Insert the toggle button inside the Editor container:
const editorContainerStartRegex = /<motion\.div\s+animate=\{\{\s+borderTopRightRadius: showRightToolbar \? 16 : 0,\s+borderBottomRightRadius: showRightToolbar \? 16 : 0,\s+\}\}\s+className="flex-1 flex flex-col min-w-0 h-full bg-background shadow-\[4px_0_24px_rgba\(0,0,0,0\.06\)\] dark:shadow-\[4px_0_24px_rgba\(0,0,0,0\.4\)\] transition-all z-10 overflow-hidden"\s+>/;

const newEditorStart = `<motion.div 
        animate={{ 
          borderTopRightRadius: showRightToolbar ? 16 : 0, 
          borderBottomRightRadius: showRightToolbar ? 16 : 0,
        }}
        className="flex-1 flex flex-col min-w-0 h-full bg-background shadow-[4px_0_24px_rgba(0,0,0,0.06)] dark:shadow-[4px_0_24px_rgba(0,0,0,0.4)] transition-all z-10 overflow-hidden relative"
      >
        <AnimatePresence>
          {!showRightToolbar && !isRecording && !isSTTActive && !isMeetSyncActive && (
            <motion.button 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute top-4 right-4 z-40 flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              onClick={() => setShowRightToolbar(true)}
              data-tooltip="Open menu"
            >
              <Menu size={20} strokeWidth={1.5} />
            </motion.button>
          )}
        </AnimatePresence>`;

content = content.replace(editorContainerStartRegex, newEditorStart);

// 2. Adjust Right Sidebar: Make it w-[40px] (which is thinner than 48px) and icons larger
const rightSidebarRegex = /<motion\.div\s+initial=\{\{ width: 0, opacity: 0 \}\}\s+animate=\{\{ width: 48, opacity: 1 \}\}\s+exit=\{\{ width: 0, opacity: 0 \}\}\s+transition=\{\{ duration: 0\.2, ease: "easeInOut" \}\}\s+className="h-full flex-shrink-0 flex flex-col items-center py-3 z-0 overflow-hidden bg-transparent"\s+>\s+<div className="flex flex-col items-center gap-2 w-full opacity-100 min-w-\[48px\]">/;

const newRightSidebarStart = `<motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 40, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="h-full flex-shrink-0 flex flex-col items-center py-4 z-0 overflow-hidden bg-transparent"
          >
            <div className="flex flex-col items-center gap-3 w-full opacity-100 min-w-[40px]">`;

content = content.replace(rightSidebarRegex, newRightSidebarStart);

// Also replace the mt-auto div min-w-[48px] with min-w-[40px]
content = content.replace(/<div className="mt-auto flex flex-col items-center gap-2 w-full min-w-\[48px\]">/, '<div className="mt-auto flex flex-col items-center gap-3 w-full min-w-[40px]">');

// Now let's increase all icon sizes inside the sidebar: 
// PanelRightClose size={16} -> size={20}
content = content.replace(/<PanelRightClose size=\{16\} \/>/, '<PanelRightClose size={20} strokeWidth={1.5} />');

// PlusIcon className="w-4 h-4" -> className="w-5 h-5"
content = content.replace(/<PlusIcon className="w-4 h-4" \/>/, '<PlusIcon className="w-5 h-5" strokeWidth={1.5} />');

// span fontSize: 15 -> fontSize: 20
content = content.replace(/<span style=\{\{ fontSize: 15, lineHeight: 1, color: "var\(--foreground\)" \}\}>✦<\/span>/, '<span style={{ fontSize: 20, lineHeight: 1, color: "var(--foreground)" }}>✦</span>');

// LayoutListIcon size={16} -> size={20}
content = content.replace(/<LayoutListIcon size=\{16\} \/>/, '<LayoutListIcon size={20} strokeWidth={1.5} />');

// GlobeIcon size={16} -> size={20}
content = content.replace(/<GlobeIcon size=\{16\} \/>/, '<GlobeIcon size={20} strokeWidth={1.5} />');

// SettingsIcon size={16} -> size={20}
content = content.replace(/<SettingsIcon size=\{16\} \/>/, '<SettingsIcon size={20} strokeWidth={1.5} />');

// Adjust button styles to match the thinner width, use w-[32px] h-[32px] instead of w-8 h-8 (wait w-8 IS 32px), but since width is 40px, w-8 is fine.
// But the Sider icons look like they don't even have a circle background, they are just transparent until hovered.
// My buttons are `rounded-full hover:bg-black/5 dark:hover:bg-white/10`. They will look very flush with the edge. 

fs.writeFileSync(filePath, content);
console.log('App.tsx tweaked.');
