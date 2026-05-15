const fs = require('fs');
const path = require('path');

// --- 1. Update NoteEditor.tsx ---
const noteEditorPath = path.join(__dirname, '../src/components/NoteEditor.tsx');
let neContent = fs.readFileSync(noteEditorPath, 'utf8');

neContent = neContent.replace(
  'const handler = () => setShow(true);',
  `const handler = () => setShow(true);
    const closeHandler = () => setShow(false);
    window.addEventListener("close-note-chat", closeHandler);`
);

neContent = neContent.replace(
  'return () => window.removeEventListener("open-note-chat", handler);',
  `return () => {
      window.removeEventListener("open-note-chat", handler);
      window.removeEventListener("close-note-chat", closeHandler);
    };`
);

neContent = neContent.replace(
  '<NoteChatSheet\n        noteId={note.id}',
  `<NoteChatSheet\n        noteId={note.id}`
);

// We need to inject window.dispatchEvent(new CustomEvent("panel-closed")) into the onClose prop.
// Currently it is onClose={() => setShow(false)}
neContent = neContent.replace(
  'onClose={() => setShow(false)}',
  'onClose={() => { setShow(false); window.dispatchEvent(new CustomEvent("panel-closed")); }}'
);

fs.writeFileSync(noteEditorPath, neContent);

// --- 2. Update ImportExportSheet.tsx ---
const iePath = path.join(__dirname, '../src/components/ImportExportSheet.tsx');
let ieContent = fs.readFileSync(iePath, 'utf8');

ieContent = ieContent.replace(
  'const handler = () => setShow(true);',
  `const handler = () => setShow(true);
    const closeHandler = () => setShow(false);
    window.addEventListener("close-import-export-sheet", closeHandler);`
);

ieContent = ieContent.replace(
  'return () => window.removeEventListener("open-import-export-sheet", handler);',
  `return () => {
      window.removeEventListener("open-import-export-sheet", handler);
      window.removeEventListener("close-import-export-sheet", closeHandler);
    };`
);

ieContent = ieContent.replace(
  'onClose={() => setShow(false)}',
  'onClose={() => { setShow(false); window.dispatchEvent(new CustomEvent("panel-closed")); }}'
);

fs.writeFileSync(iePath, ieContent);

console.log('Updated NoteEditor and ImportExportSheet bridges');
