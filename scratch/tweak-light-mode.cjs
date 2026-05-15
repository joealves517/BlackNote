const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '../src/components/App.tsx');
let appContent = fs.readFileSync(appPath, 'utf8');

// 1. Change the root container background to be more distinct in light mode
// old: bg-black/5 dark:bg-white/5
// new: bg-black/10 dark:bg-white/5
appContent = appContent.replace(
  'className="relative flex h-screen w-full overflow-hidden bg-black/5 dark:bg-white/5"',
  'className="relative flex h-screen w-full overflow-hidden bg-black/10 dark:bg-white/5"'
);

// 2. Change the icons in the right toolbar to be even lighter
// currently: text-muted-foreground/70 hover:text-muted-foreground
// new: text-muted-foreground/40 hover:text-muted-foreground/90
appContent = appContent.replace(
  /text-muted-foreground\/70 hover:text-muted-foreground/g,
  'text-muted-foreground/40 hover:text-muted-foreground/90'
);

// Menu toggle is also using text-muted-foreground/70
appContent = appContent.replace(
  /text-muted-foreground\/70 hover:text-muted-foreground hover:bg-black\/5/g,
  'text-muted-foreground/40 hover:text-muted-foreground/90 hover:bg-black/5'
);

fs.writeFileSync(appPath, appContent);
console.log('Light mode and icon colors tweaked successfully.');
