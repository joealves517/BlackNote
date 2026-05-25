const fs = require('fs');
const files = [
  'src/components/ImportExportSheet.tsx',
  'src/components/MediaActionSheet.tsx',
  'src/hooks/use-notes.ts',
  'src/components/generative/AISelector.tsx',
  'src/components/App.tsx',
  'src/lib/toast.tsx'
];
for (const f of files) {
  let c = fs.readFileSync(f, 'utf-8');
  if (c.includes('\\\\n')) {
    c = c.split('\\\\n').join('\\n');
    fs.writeFileSync(f, c);
  }
}
