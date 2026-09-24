const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const pages = fs.readdirSync(root).filter(name => name.endsWith('.html'));

test('previously excluded photos stay off every website page', () => {
  for (const page of pages) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.doesNotMatch(html, /(?:pic-3|pic-1-2|_?dsc1662|test8[-_]4866|test15[-_]0731)\.(?:jpe?g|png|webp)/i, page);
    assert.doesNotMatch(html, /images\/dsc_8473\.jpg/i, 'Only use the blurred BMW image');
  }
  for (const image of fs.readdirSync(path.join(root, 'images'), { recursive: true })) {
    assert.doesNotMatch(image, /test8[-_]4866/i);
  }
});

test('all local photo references exist, including cache-versioned updates', () => {
  for (const page of pages) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    for (const image of html.matchAll(/<img\b[^>]*\bsrc="(\.\/images\/[^\"]+)"/g)) {
      assert(fs.existsSync(path.join(root, image[1].split('?')[0])), `${page}: ${image[1]}`);
    }
  }
});

test('gallery labels match its 57 approved folder photos, including without JavaScript', () => {
  const html = fs.readFileSync(path.join(root, 'gallery.html'), 'utf8');
  const labels = [...html.matchAll(/aria-label="Expand image (\d+) of (\d+)"/g)];
  assert.equal(labels.length, 57);
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

test('September refresh includes all new photos once and only features gallery photos on About', () => {
  const gallery = fs.readFileSync(path.join(root, 'gallery.html'), 'utf8');
  const about = fs.readFileSync(path.join(root, 'about.html'), 'utf8');
  const sources = html => [...html.matchAll(/<img\b[^>]*\bsrc="([^\"]+)"/g)].map(match => match[1].split('?')[0]);
  const gallerySources = sources(gallery);
  assert.equal(new Set(gallerySources).size, gallerySources.length);
  for (const name of ['dsc0378', 'dsc2204', 'dsc2273', 'dsc2450', 'dsc2484', 'dsc8821',
    'dsc9465', 'dsc9767', 'dsc9788', 'dsc9815', 'test15-2-10', 'test15-4899', 'test15-6558', 'test15-7818']) {
    assert(gallerySources.includes(`./images/portfolio/${name}.jpg`), name);
  }
  for (const source of sources(about)) assert(gallerySources.includes(source), source);
  assert.match(gallery, /dsc2498\.jpg\?v=20260924" width="1600" height="948"/);
});
