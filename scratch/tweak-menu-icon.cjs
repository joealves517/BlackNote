const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '../src/components/App.tsx');
let appContent = fs.readFileSync(appPath, 'utf8');

// Find the Menu toggle block
const menuToggleRegex = /<Menu size=\{22\} strokeWidth=\{1\.5\} \/>/g;
if (menuToggleRegex.test(appContent)) {
  appContent = appContent.replace(menuToggleRegex, '<Menu size={20} strokeWidth={1.25} />');
  
  // Also update its color class if necessary
  // className="absolute top-4 right-4 z-40 flex items-center justify-center w-9 h-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
  appContent = appContent.replace(
    'className="absolute top-4 right-4 z-40 flex items-center justify-center w-9 h-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-colors"',
    'className="absolute top-4 right-4 z-40 flex items-center justify-center w-9 h-9 rounded-md text-muted-foreground/70 hover:text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-colors"'
  );

  fs.writeFileSync(appPath, appContent);
  console.log('Menu toggle tweaked.');
} else {
  console.log('Could not find Menu toggle.');
}
