const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '../src/components/App.tsx');
let content = fs.readFileSync(appPath, 'utf8');

content = content.replace(/\\(\(|\))/g, '$1');
content = content.replace(/\\"/g, '"');

fs.writeFileSync(appPath, content);
console.log('Fixed escape characters in App.tsx');
