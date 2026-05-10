const TurndownService = require('turndown');
const turndown = new TurndownService();
const html = `<div><li><p>Item 1</p></li><li><p>Item 2</p></li></div>`;
console.log(turndown.turndown(html));
