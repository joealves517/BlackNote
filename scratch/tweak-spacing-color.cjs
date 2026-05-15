const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/components/App.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Remove the separator line
content = content.replace('<div className="w-5 h-[1px] bg-border/20 my-1" />', '');

// 2. Make PlusIcon color match the rest
// Currently it is: className="flex items-center justify-center w-9 h-9 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-purple-600 dark:text-purple-400 transition-colors"
// We want: className="flex items-center justify-center w-9 h-9 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground"
content = content.replace(
  'className="flex items-center justify-center w-9 h-9 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-purple-600 dark:text-purple-400 transition-colors"',
  'className="flex items-center justify-center w-9 h-9 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground"'
);

// Also verify there are no extra newlines left from the separator removal
content = content.replace(/\n\s*\n\s*\n/g, '\n\n');

fs.writeFileSync(filePath, content);
console.log('Spacing and color updated.');
