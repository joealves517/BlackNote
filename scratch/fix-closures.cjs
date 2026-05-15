const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '../src/components/App.tsx');
let content = fs.readFileSync(appPath, 'utf8');

// We want to replace local closure actions with setActivePanel(null) or emit panel-closed.
// Let's just emit panel-closed or call setActivePanel(null).
// Wait, we are inside App.tsx, so setActivePanel(null) is available!

content = content.replace(/setShowHistory\(false\)/g, 'setActivePanel(null); setShowHistory(false)');
content = content.replace(/setShowClipper\(false\)/g, 'setActivePanel(null); setShowClipper(false)');
content = content.replace(/setShowAccountMenu\(false\)/g, 'setActivePanel(null); setShowAccountMenu(false)');

fs.writeFileSync(appPath, content);
console.log('Fixed local closures');
