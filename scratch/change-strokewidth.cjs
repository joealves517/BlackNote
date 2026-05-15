const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '../src/components/App.tsx');
let appContent = fs.readFileSync(appPath, 'utf8');

// We want to replace inside the Vertical Right Toolbar block
const rtStart = appContent.indexOf('{/* ─── Vertical Right Toolbar ─── */}');
const rtEnd = appContent.indexOf('</AnimatePresence>', rtStart);
let rtBlock = appContent.substring(rtStart, rtEnd);

// Replace the forced CSS stroke-width class
rtBlock = rtBlock.replace(/\[&_svg\]:!\[stroke-width:1\.25px\]/g, '[&_svg]:![stroke-width:1.5px]');

// Replace remaining strokeWidth={1.25} props just to be clean
rtBlock = rtBlock.replace(/strokeWidth=\{1\.25\}/g, 'strokeWidth={1.5}');

appContent = appContent.substring(0, rtStart) + rtBlock + appContent.substring(rtEnd);
fs.writeFileSync(appPath, appContent);

// Also update chevron-first.tsx if it was hardcoded to 1.25
const chevronPath = path.join(__dirname, '../src/components/icons/chevron-first.tsx');
if (fs.existsSync(chevronPath)) {
  let chevronContent = fs.readFileSync(chevronPath, 'utf8');
  chevronContent = chevronContent.replace(/strokeWidth="1\.25"/g, 'strokeWidth="1.5"');
  fs.writeFileSync(chevronPath, chevronContent);
}

console.log('Changed stroke width to 1.5px');
