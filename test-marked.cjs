const { marked } = require('marked');
try {
  console.log(marked.parse('Hello world', { breaks: true, gfm: true, silent: false }));
} catch (e) {
  console.log("CRASH:", e);
}
