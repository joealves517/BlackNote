import { marked } from 'marked';
const html = marked.parse('- [ ] Buy milk\n- [x] Done', { breaks: true, gfm: true });
console.log("HTML:", html);
