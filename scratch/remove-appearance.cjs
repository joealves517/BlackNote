const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/components/ImportExportSheet.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// The block to remove:
/*
                      <div className="flex items-center justify-between p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer group" onClick={toggleTheme}>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-9 h-9 rounded-[10px] bg-[#f5f5f5] dark:bg-[#1c1c1c] group-hover:bg-white dark:group-hover:bg-[#2c2c2c] transition-colors shadow-sm">
                            <SunIcon ref={iconRefs.theme} size={16} className="w-4 h-4" />
                          </div>
                          <div className="flex flex-col">
                            <p className="text-[13px] font-medium">Appearance</p>
                            <p className="text-[11px] text-muted-foreground">{theme === "light" ? "Light Mode" : "Dark Mode"}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
                          <ToggleRightIcon size={16} className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </div>
*/

const blockRegex = /<div className="flex items-center justify-between p-2 rounded-lg hover:bg-black\/5 dark:hover:bg-white\/5 transition-colors cursor-pointer group" onClick=\{toggleTheme\}>[\s\S]*?<\/div>\n\s*<\/div>/;

// Wait, the regex needs to be precise. Let's just find the Appearance string and remove the surrounding div manually using string manipulation.
const index = content.indexOf('Appearance');
if (index !== -1) {
    const startDiv = content.lastIndexOf('<div className="flex items-center justify-between p-2', index);
    // Find the end of this item. It ends with:
    // <ToggleRightIcon size={16} className="w-4 h-4 text-muted-foreground" />
    // </div>
    // </div>
    const endIcon = content.indexOf('<ToggleRightIcon', index);
    const endDiv1 = content.indexOf('</div>', endIcon);
    const endDiv2 = content.indexOf('</div>', endDiv1 + 6);
    
    if (startDiv !== -1 && endDiv2 !== -1) {
        content = content.substring(0, startDiv) + content.substring(endDiv2 + 7);
        fs.writeFileSync(filePath, content);
        console.log("Removed Appearance section");
    } else {
        console.log("Could not find boundaries");
    }
} else {
    console.log("Could not find Appearance text");
}

