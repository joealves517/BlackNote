const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '../src/components/App.tsx');
let appContent = fs.readFileSync(appPath, 'utf8');

// 1. Root container background
appContent = appContent.replace(
  'className="relative flex h-screen w-full overflow-hidden bg-black/10 dark:bg-white/5"',
  'className="relative flex h-screen w-full overflow-hidden bg-[#f5f5f5] dark:bg-[#1c1c1c]"'
);

// 2. RightToolbar background
appContent = appContent.replace(
  'className="h-full flex-shrink-0 flex flex-col items-center py-4 z-0 overflow-hidden bg-transparent"',
  'className="h-full flex-shrink-0 flex flex-col items-center py-4 z-0 overflow-hidden bg-[#f5f5f5] dark:bg-[#1c1c1c]"'
);

// 3. Icon colors (replace text-muted-foreground/40 hover:text-muted-foreground/90 with reliable opacity classes)
appContent = appContent.replace(
  /text-muted-foreground\/40 hover:text-muted-foreground\/90/g,
  'text-muted-foreground opacity-40 hover:opacity-100'
);

// We had one for Menu toggle: text-muted-foreground/40 hover:text-muted-foreground/90 hover:bg-black/5
// It will match the regex above and become: text-muted-foreground opacity-40 hover:opacity-100 hover:bg-black/5

fs.writeFileSync(appPath, appContent);
console.log('Fixed CSS.');
