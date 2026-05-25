const fs = require('fs');

const toastPath = 'src/lib/toast.tsx';
let toastContent = fs.readFileSync(toastPath, 'utf-8');

const newFunc = `
import { goeyToast } from "goey-toast";

export async function customGoeyPromise(promise, messages) {
  const loadingDesc = messages.description && messages.description.loading;
  const toastId = goeyToast.loading(messages.loading, { description: loadingDesc });
  try {
    const p = typeof promise === "function" ? promise() : promise;
    const result = await p;
    goeyToast.dismiss(toastId);
    setTimeout(() => {
      const successTitle = typeof messages.success === "function" ? messages.success(result) : messages.success;
      const successDesc = messages.description && (typeof messages.description.success === "function" ? messages.description.success(result) : messages.description.success);
      goeyToast.success(successTitle, { description: successDesc });
    }, 50);
    return result;
  } catch (err) {
    goeyToast.dismiss(toastId);
    setTimeout(() => {
      const errorTitle = typeof messages.error === "function" ? messages.error(err) : messages.error;
      const errorDesc = messages.description && (typeof messages.description.error === "function" ? messages.description.error(err) : messages.description.error);
      goeyToast.error(errorTitle, { description: errorDesc });
    }, 50);
    throw err;
  }
}
`;

if (!toastContent.includes('customGoeyPromise')) {
  fs.writeFileSync(toastPath, toastContent + "\\n" + newFunc);
}

const files = [
  'src/components/ImportExportSheet.tsx',
  'src/components/MediaActionSheet.tsx',
  'src/hooks/use-notes.ts',
  'src/components/generative/AISelector.tsx',
  'src/components/App.tsx'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf-8');
  if (content.includes('goeyToast.promise')) {
    content = content.replace(/goeyToast\\.promise/g, 'customGoeyPromise');
    if (!content.includes('customGoeyPromise }')) {
      content = 'import { customGoeyPromise } from "@/lib/toast";\\n' + content;
    }
    fs.writeFileSync(file, content);
    console.log('Updated', file);
  }
}
