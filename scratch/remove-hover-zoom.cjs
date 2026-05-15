const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, '../src/index.css');
let cssContent = fs.readFileSync(cssPath, 'utf8');

// I will just replace all instances of `.hover-zoom-icon` with `.hover-zoom-icon-removed`
cssContent = cssContent.replace(/\.hover-zoom-icon/g, '.hover-zoom-icon-removed');

fs.writeFileSync(cssPath, cssContent);
console.log('Removed hover-zoom-icon references.');
