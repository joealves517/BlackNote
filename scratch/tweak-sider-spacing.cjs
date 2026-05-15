const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/components/App.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add Sparkles to imports
if (!content.includes('Sparkles,')) {
  content = content.replace('import { Mic, MicOff, Menu, PanelRightClose } from "lucide-react";', 'import { Mic, MicOff, Menu, PanelRightClose, Sparkles } from "lucide-react";');
}

// 2. Reduce shadow on editor to remove 3D effect
content = content.replace(
  'className="flex-1 flex flex-col min-w-0 h-full bg-background shadow-[4px_0_24px_rgba(0,0,0,0.06)] dark:shadow-[4px_0_24px_rgba(0,0,0,0.4)] transition-all z-10 overflow-hidden relative"',
  'className={`flex-1 flex flex-col min-w-0 h-full bg-background transition-all z-10 overflow-hidden relative ${showRightToolbar ? "border-r border-border/20 shadow-[1px_0_8px_rgba(0,0,0,0.02)]" : ""}`}'
);

// 3. Remove mb-1 from PanelRightClose
content = content.replace(
  'className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground mb-1"',
  'className="flex items-center justify-center w-9 h-9 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground"'
);

// 4. Change PlusIcon to have no background
content = content.replace(
  'className="flex items-center justify-center w-8 h-8 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 transition-colors"',
  'className="flex items-center justify-center w-9 h-9 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-purple-600 dark:text-purple-400 transition-colors"'
);

// 5. Change span ✦ to Sparkles
content = content.replace(
  '<span style={{ fontSize: 20, lineHeight: 1, color: "var(--foreground)" }}>✦</span>',
  '<Sparkles size={22} strokeWidth={1.5} />'
);

// 6. Change all w-8 h-8 to w-9 h-9
content = content.replace(/w-8 h-8/g, 'w-9 h-9');

// 7. Change all size={20} to size={22}
content = content.replace(/size=\{20\}/g, 'size={22}');

fs.writeFileSync(filePath, content);
console.log('Spacing and icons updated.');
