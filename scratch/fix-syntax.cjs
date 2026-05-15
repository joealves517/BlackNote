const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '../src/components/App.tsx');
let content = fs.readFileSync(appPath, 'utf8');

// The replacement in the previous step created invalid syntax like:
// () => setActivePanel(null); setShowHistory(false)
// We need to find `() => setActivePanel(null); setShowHistory(false)` and wrap it in {}

content = content.replace(/\(\) => setActivePanel\(null\); setShowHistory\(false\)/g, '() => { setActivePanel(null); setShowHistory(false); }');
content = content.replace(/\(\) => setActivePanel\(null\); setShowClipper\(false\)/g, '() => { setActivePanel(null); setShowClipper(false); }');
content = content.replace(/\(\) => setActivePanel\(null\); setShowAccountMenu\(false\)/g, '() => { setActivePanel(null); setShowAccountMenu(false); }');

// Wait, what if it was already inside curly braces?
// e.g. onClose={() => { setActivePanel(null); setShowHistory(false) }}
// The regex won't match the closing `}` if it was already there, but replacing the string itself is safe because it will just turn into:
// onClose={() => { { setActivePanel(null); setShowHistory(false); } }} which is valid syntax.
// Let's just do it carefully.

fs.writeFileSync(appPath, content);
console.log('Fixed syntax error');
