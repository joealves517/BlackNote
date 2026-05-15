const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '../src/components/App.tsx');
let content = fs.readFileSync(appPath, 'utf8');

// The block to move
const blockRegex = /  useEffect\(\(\) => \{\n    const handlePanelClosed = \(\) => setActivePanel\(null\);[\s\S]*?  \}, \[activePanel\]\);\n\n/m;
const match = content.match(blockRegex);
if (!match) {
  console.log("Could not find the block");
  process.exit(1);
}

const blockContent = match[0];

// Remove the block from its current position
content = content.replace(blockContent, '');

// Insert it right after the globalAiMessages state (line 324 or so)
const targetState = '  const [globalAiMessages, setGlobalAiMessages] = useState<string[]>(["Thinking"]);\n';
content = content.replace(targetState, targetState + '\n' + blockContent);

fs.writeFileSync(appPath, content);
console.log('Moved hooks below state declarations');
