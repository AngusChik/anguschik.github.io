const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('every page uses Angus Chik as its accessible home-link brand', () => {
  const root = path.join(__dirname, '..');
  const pages = fs.readdirSync(root).filter(name => name.endsWith('.html'));
  assert(pages.length > 0);
  for (const page of pages) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    const brands = html.match(/<a\b[^>]*class="brand"[^>]*>[^<]*<\/a>/g) || [];
    assert.deepEqual(brands, [
      '<a class="brand" href="./index.html" aria-label="Angus Chik home">Angus Chik</a>',
    ], page);
  }
});
