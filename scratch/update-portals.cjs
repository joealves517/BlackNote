const fs = require('fs');
const path = require('path');

const filesToUpdate = [
  '../src/components/ImportExportSheet.tsx',
  '../src/components/Tooltip.tsx',
  '../src/components/NoteEditor.tsx',
  '../src/components/generative/HashtagSuggestion.tsx'
];

for (const relPath of filesToUpdate) {
  const filePath = path.join(__dirname, relPath);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Replace `document.body` with `document.getElementById("blacknote-root") || document.body`
    // but only where it's used as a portal target.
    
    if (relPath.includes('ImportExportSheet.tsx')) {
      content = content.replace('document.body\n  );', 'document.getElementById("blacknote-root") || document.body\n  );');
    } else if (relPath.includes('Tooltip.tsx')) {
      content = content.replace('document.body\n  );', 'document.getElementById("blacknote-root") || document.body\n  );');
    } else if (relPath.includes('NoteEditor.tsx')) {
      content = content.replace('document.body\n  );', 'document.getElementById("blacknote-root") || document.body\n  );');
    } else if (relPath.includes('HashtagSuggestion.tsx')) {
      content = content.replace('appendTo: () => document.body,', 'appendTo: () => document.getElementById("blacknote-root") || document.body,');
    }
    
    fs.writeFileSync(filePath, content);
    console.log(`Updated ${relPath}`);
  }
}
