const { generateJSON } = require('@tiptap/core');
const { TaskList, TaskItem, StarterKit } = require('novel');
const { marked } = require('marked');

const extensions = [
  StarterKit.configure({ horizontalRule: false }),
  TaskList,
  TaskItem.configure({ nested: true }),
];

const html = marked.parse('- [ ] Buy milk', { breaks: true, gfm: true });
console.log("HTML:", html);

const json = generateJSON(html, extensions);
console.log("JSON:", JSON.stringify(json, null, 2));
