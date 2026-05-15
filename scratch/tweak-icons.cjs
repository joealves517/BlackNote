const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '../src/components/App.tsx');
let appContent = fs.readFileSync(appPath, 'utf8');

// The block for the right toolbar starts at `<motion.div` right after `Vertical Right Toolbar`
const startIdx = appContent.indexOf('{/* ─── Vertical Right Toolbar ─── */}');
if (startIdx !== -1) {
  const endIdx = appContent.indexOf('</AnimatePresence>', startIdx);
  let toolbarStr = appContent.substring(startIdx, endIdx);

  // Replace size={22} with size={20}
  toolbarStr = toolbarStr.replace(/size=\{22\}/g, 'size={20}');
  
  // Replace strokeWidth={1.5} with strokeWidth={1.25}
  toolbarStr = toolbarStr.replace(/strokeWidth=\{1\.5\}/g, 'strokeWidth={1.25}');
  
  // Replace text-muted-foreground hover:text-foreground
  toolbarStr = toolbarStr.replace(/text-muted-foreground hover:text-foreground/g, 'text-muted-foreground/70 hover:text-muted-foreground');

  // Replace the block back
  appContent = appContent.substring(0, startIdx) + toolbarStr + appContent.substring(endIdx);
  fs.writeFileSync(appPath, appContent);
  console.log('Icons tweaked successfully.');
} else {
  console.log('Could not find right toolbar block.');
}
