const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const pages = fs.readdirSync(root).filter(name => name.endsWith('.html'));

test('excluded photo is neither referenced on a page nor included in published images', () => {
  for (const page of pages) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.doesNotMatch(html, /test8[-_]4866/i, page);
  }
  for (const image of fs.readdirSync(path.join(root, 'images'), { recursive: true })) {
    assert.doesNotMatch(image, /test8[-_]4866/i);
  }
});

test('all local photo references still exist after the removal', () => {
  for (const page of pages) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    for (const image of html.matchAll(/<img\b[^>]*\bsrc="(\.\/images\/[^\"]+)"/g)) {
      assert(fs.existsSync(path.join(root, image[1])), `${page}: ${image[1]}`);
    }
  }
});

test('gallery labels match its 46 remaining photos, including without JavaScript', () => {
  const html = fs.readFileSync(path.join(root, 'gallery.html'), 'utf8');
  const labels = [...html.matchAll(/aria-label="Expand image (\d+) of (\d+)"/g)];
  assert.equal(labels.length, 46);
  labels.forEach((label, index) => {
    assert.equal(Number(label[1]), index + 1);
    assert.equal(Number(label[2]), labels.length);
  });
});

test('About retains four complete three-photo compositions', () => {
  const html = fs.readFileSync(path.join(root, 'about.html'), 'utf8');
  const slides = html.split(' data-about-slide aria-hidden=').slice(1);
  assert.equal(slides.length, 4);
  for (const slide of slides) assert.equal((slide.match(/<img\b/g) || []).length, 3);
  assert.match(html, /src="\.\/images\/portfolio\/dsc9692\.jpg"/);
});
