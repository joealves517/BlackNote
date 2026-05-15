const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '../src/components/App.tsx');
let appContent = fs.readFileSync(appPath, 'utf8');

const rtStart = appContent.indexOf('{/* ─── Vertical Right Toolbar ─── */}');
const rtEnd = appContent.indexOf('</AnimatePresence>', rtStart);
let rtBlock = appContent.substring(rtStart, rtEnd);

// Remove the forced CSS stroke-width class
rtBlock = rtBlock.replace(/ \[\&_svg\]:\!\[stroke-width:1\.5px\]/g, '');

// Remove remaining strokeWidth={1.5} props
rtBlock = rtBlock.replace(/ strokeWidth=\{1\.5\}/g, '');

appContent = appContent.substring(0, rtStart) + rtBlock + appContent.substring(rtEnd);
fs.writeFileSync(appPath, appContent);

// Also update chevron-first.tsx back to 2
const chevronPath = path.join(__dirname, '../src/components/icons/chevron-first.tsx');
if (fs.existsSync(chevronPath)) {
  let chevronContent = fs.readFileSync(chevronPath, 'utf8');
  chevronContent = chevronContent.replace(/strokeWidth="1\.5"/g, 'strokeWidth="2"');
  fs.writeFileSync(chevronPath, chevronContent);
}

console.log('Reset stroke width to 2px (default)');
