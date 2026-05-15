const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '../src/components/App.tsx');
let appContent = fs.readFileSync(appPath, 'utf8');

// The common class for the buttons in Right Toolbar
const targetStr = 'opacity-40 hover:opacity-100"';
const replaceStr = 'opacity-40 hover:opacity-100 [&_svg]:![stroke-width:1.25px]"';

// We want to replace only inside the Vertical Right Toolbar block
const rtStart = appContent.indexOf('{/* ─── Vertical Right Toolbar ─── */}');
const rtEnd = appContent.indexOf('</AnimatePresence>', rtStart);
let rtBlock = appContent.substring(rtStart, rtEnd);

rtBlock = rtBlock.replace(new RegExp(targetStr, 'g'), replaceStr);

appContent = appContent.substring(0, rtStart) + rtBlock + appContent.substring(rtEnd);
fs.writeFileSync(appPath, appContent);

console.log('Fixed stroke width');
