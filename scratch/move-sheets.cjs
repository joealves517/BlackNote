const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/components/App.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Find the end of NoteEditor inside motion.div
const noteEditorEndRegex = /(<NoteEditor[\s\S]*?\/>\s*)(<\/motion\.div>\s*\{\/\* ─── Vertical Right Toolbar ─── \*\/\}[\s\S]*?<\/AnimatePresence>)/;

// We need to cut everything from "Web Clipper Bottom Sheet" to "MediaActionSheet" (inclusive)
// It starts at `{/* ─── Web Clipper Bottom Sheet ─── */}` and ends before `<GlobalTooltip />`
const sheetsRegex = /(\s*\{\/\* ─── Web Clipper Bottom Sheet ─── \*\/\}[\s\S]*?<\/AnimatePresence>\s*)<GlobalTooltip \/>/;

const matchSheets = content.match(sheetsRegex);
if (matchSheets) {
  const sheetsCode = matchSheets[1];
  
  // Remove sheets from bottom
  content = content.replace(sheetsRegex, '\n      <GlobalTooltip />');
  
  // Insert sheets into the motion.div
  content = content.replace(noteEditorEndRegex, `$1\n\n        {/* -- SHEETS MOVED HERE TO NOT OVERLAP RIGHT SIDEBAR -- */}${sheetsCode}\n      $2`);
  
  fs.writeFileSync(filePath, content);
  console.log('Successfully moved sheets into Editor container!');
} else {
  console.log('Failed to match sheets regex.');
}
