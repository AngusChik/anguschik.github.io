const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
const start = source.indexOf('(function initSpotlight()');
assert(start >= 0, 'Pointer spotlight must exist');
const spotlight = source.slice(start, source.indexOf('\n})();', start) + 6);

function setup({ page = 'gallery', reducedMotion = false, finePointer = true } = {}) {
  const frames = new Map();
  let id = 0;
  let layoutReads = 0;
  let bounds = { left: 10, top: 20 };
  const frameWrites = [];
  const target = () => ({
    events: {}, style: {}, attributes: {}, children: [],
    addEventListener(type, handler) { this.events[type] = handler; },
    dispatch(type, event = {}) { this.events[type]?.(event); },
    setAttribute(name, value) { this.attributes[name] = value; },
    prepend(child) { this.children.unshift(child); }
  });
  const frame = target();
  frame.style.setProperty = (name, value) => frameWrites.push([name, value]);
  frame.getBoundingClientRect = () => { layoutReads++; return bounds; };
  const document = target();
  document.body = { dataset: { page } };
  document.querySelector = () => frame;
  document.createElement = () => target();
  const window = target();
  vm.runInNewContext(spotlight, {
    document, window, reduceMotion: reducedMotion, finePointer,
    requestAnimationFrame(fn) { frames.set(++id, fn); return id; },
    cancelAnimationFrame(frameId) { frames.delete(frameId); }
  });
  return {
    frame, document, window, frames, frameWrites,
    get layoutReads() { return layoutReads; },
    setBounds(value) { bounds = value; },
    flush() {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach(fn => fn());
    }
  };
}

test('gallery pointer updates one isolated layer, without inherited frame writes', () => {
  const s = setup();
  assert.equal(s.frame.children.length, 1);
  const glow = s.frame.children[0];
  assert.equal(glow.className, 'gallery-spotlight');
  assert.equal(glow.attributes['aria-hidden'], 'true');
  for (let i = 0; i < 100; i++) {
    s.frame.dispatch('pointermove', { clientX: 100 + i, clientY: 200 + i });
  }
  assert.equal(s.frames.size, 1);
  assert.equal(s.layoutReads, 0, 'No synchronous layout reads in pointer events');
  s.flush();
  assert.equal(s.layoutReads, 1, 'One geometry read per frame, not per event');
  assert.equal(glow.style.transform, 'translate3d(189px, 279px, 0) translate(-50%, -50%)');
  assert.equal(glow.style.opacity, '1');
  assert.deepEqual(s.frameWrites, []);
});

test('pointer geometry stays accurate after resizing or page scrolling', () => {
  const s = setup();
  s.frame.dispatch('pointermove', { clientX: 100, clientY: 200 });
  s.setBounds({ left: 5, top: -50 });
  s.flush();
  assert.equal(s.frame.children[0].style.transform,
    'translate3d(95px, 250px, 0) translate(-50%, -50%)');
});

test('leaving, cancellation, blur and hidden tabs cancel pending pointer work', () => {
  for (const reason of ['pointerleave', 'pointercancel', 'blur', 'visibilitychange']) {
    const s = setup();
    s.frame.dispatch('pointermove', { clientX: 10, clientY: 20 });
    if (reason === 'blur') s.window.dispatch(reason);
    else if (reason === 'visibilitychange') {
      s.document.hidden = true;
      s.document.dispatch(reason);
    } else s.frame.dispatch(reason);
    s.flush();
    assert.equal(s.frames.size, 0);
    assert.equal(s.layoutReads, 0);
    assert.equal(s.frame.children[0].style.opacity, '0');
    assert.deepEqual(s.frameWrites, []);
  }
});

test('coarse pointers and reduced motion do not add decorative work', () => {
  for (const options of [{ finePointer: false }, { reducedMotion: true }]) {
    const s = setup(options);
    assert.equal(s.frame.children.length, 0);
    assert.deepEqual(s.frame.events, {});
    assert.equal(s.frames.size, 0);
  }
});

test('other pages retain their existing pseudo-element spotlight', () => {
  const s = setup({ page: 'about' });
  s.frame.dispatch('pointermove', { clientX: 100, clientY: 200 });
  s.flush();
  assert.equal(s.frame.children.length, 0);
  assert.deepEqual(s.frameWrites, [
    ['--sx', '90px'], ['--sy', '180px'], ['--spotlight-opacity', '1']
  ]);
});

test('photo wall avoids oversized entrance layers and filtered animation surfaces', () => {
  const html = fs.readFileSync(path.join(root, 'gallery.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  assert.match(html, /class="gallery-grid"/);
  assert.equal((html.match(/data-gallery-open/g) || []).length, 46);
  assert.doesNotMatch(html, /class="gallery-grid[^\"]*reveal/);
  assert.doesNotMatch(css.match(/\.gallery-item img\s*\{([^}]+)\}/)[1], /\bfilter\s*:/);
  assert.doesNotMatch(css.match(/\.gallery-item:hover img\s*\{([^}]+)\}/)[1], /\bfilter\s*:/);
  assert.doesNotMatch(css.match(/\.gallery-lightbox\s*\{([^}]+)\}/)[1], /backdrop-filter\s*:/);
  assert.match(html, /<img alt="" decoding="async" draggable="false" data-gallery-image/);
});
