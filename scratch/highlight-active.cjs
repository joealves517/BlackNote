const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '../src/components/App.tsx');
let content = fs.readFileSync(appPath, 'utf8');

const rtStart = content.indexOf('{/* ─── Vertical Right Toolbar ─── */}');
const rtEnd = content.indexOf('</AnimatePresence>', rtStart);
let rtBlock = content.substring(rtStart, rtEnd);

// Replace button classes
const baseClass = "flex items-center justify-center w-9 h-9 rounded-[10px] transition-all group";
const inactiveClass = "text-muted-foreground opacity-40 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10";
const activeClass = "text-foreground opacity-100 bg-black/5 dark:bg-white/10";

function replaceBtn(targetPanel, oldOnClickStr) {
  // Regex to find the button
  const regex = new RegExp(`className="flex items-center justify-center w-9 h-9 rounded-\\[10px\\][\\s\\S]*?onClick=\\{${oldOnClickStr}\\}`, 'g');
  rtBlock = rtBlock.replace(regex, (match) => {
    return `className={\`${baseClass} \${activePanel === "${targetPanel}" ? "${activeClass}" : "${inactiveClass}"}\`}\n                onClick={${oldOnClickStr}}`;
  });
}

replaceBtn("note-chat", '\\(\\) => handleTogglePanel\\("note-chat"\\)');
replaceBtn("history", '\\(\\) => handleTogglePanel\\("history"\\)');
replaceBtn("clipper", '\\(\\) => handleTogglePanel\\("clipper"\\)');
replaceBtn("settings", '\\(\\) => handleTogglePanel\\("settings"\\)');

// Account button has different inner content, but we can do the same
replaceBtn("account", '\\(\\) => handleTogglePanel\\("account"\\)');

// Remove the inline style from clipper button
rtBlock = rtBlock.replace('style={{ backgroundColor: showClipper ? "hsl(var(--muted))" : "transparent" }}', '');

// Wait, the "Close menu" and "New note" buttons are NOT toggle panels. They should just have the inactive class + hover effects.
// Let's replace their classes explicitly so they don't lose them if they matched.
const staticBtnClass = `className="${baseClass} ${inactiveClass}"`;

// Close button
rtBlock = rtBlock.replace(
  /className="flex items-center justify-center w-9 h-9 rounded-\[10px\] hover:bg-black\/5 dark:hover:bg-white\/10 transition-all group text-muted-foreground opacity-40 hover:opacity-100"[\s\S]*?onClick=\{\(\) => setShowRightToolbar\(false\)\}/,
  `${staticBtnClass}\n                onClick={() => setShowRightToolbar(false)}`
);

// New Note button
rtBlock = rtBlock.replace(
  /className="flex items-center justify-center w-9 h-9 rounded-\[10px\] hover:bg-black\/5 dark:hover:bg-white\/10 transition-all group text-muted-foreground opacity-40 hover:opacity-100"[\s\S]*?onClick=\{handleCreateNote\}/,
  `${staticBtnClass}\n                onClick={handleCreateNote}`
);

content = content.substring(0, rtStart) + rtBlock + content.substring(rtEnd);
fs.writeFileSync(appPath, content);
console.log('Active highlighting applied');
