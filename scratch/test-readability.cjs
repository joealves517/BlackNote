const { Readability } = require('@mozilla/readability');
const { JSDOM } = require('jsdom');

const html = `<html><head></head><body>
  <div class="content">
    <h1>Test Article</h1>
    <a href="/link1">Link 1</a>
    <img src="/img.png" alt="Test image" />
  </div>
</body></html>`;

function testParse(useBase) {
  const dom = new JSDOM(html, { url: "https://example.com" });
  const doc = dom.window.document;
  
  if (useBase) {
    const base = doc.createElement("base");
    base.href = "https://example.com";
    doc.head.prepend(base);
  }
  
  const reader = new Readability(doc);
  const article = reader.parse();
  console.log("Use base:", useBase, "->", article.content);
}

testParse(true);
testParse(false);
