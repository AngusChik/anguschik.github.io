const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
const start = source.indexOf('(function initGalleryViewer()');
assert(start >= 0, 'Gallery viewer must exist');
const viewer = source.slice(start, source.indexOf('\n})();', start) + 6);

function setup({ reducedMotion = false, missingGallery = false, random = () => 0.999999, photoCount = 4 } = {}) {
  let now = 1000;
  let nextId = 1;
  let document;
  const timers = new Map();
  const frames = new Map();
  const preloads = [];
  const animations = [];

  class Element {
    constructor(tag = 'div', parent = null) {
      this.tag = tag;
      this.parent = parent;
      this.events = {};
      this.attributes = {};
      this.children = [];
      this.style = { removeProperty(name) { delete this[name]; } };
      this.classes = new Set();
      this.classList = {
        add: name => this.classes.add(name),
        remove: name => this.classes.delete(name)
      };
      this.captures = new Set();
      this.clientWidth = 390;
      this.clientHeight = 844;
    }
    addEventListener(type, fn, capture = false) {
      (this.events[type] ||= []).push({ fn, capture: capture === true });
    }
    dispatch(type, details = {}) {
      const event = {
        target: this, defaultPrevented: false, stopped: false,
        preventDefault() { this.defaultPrevented = true; },
        stopImmediatePropagation() { this.stopped = true; },
        ...details
      };
      const chain = [];
      for (let el = this; el; el = el.parent) chain.push(el);
      for (const capture of [true, false]) {
        for (const el of capture ? [...chain].reverse() : chain) {
          for (const listener of el.events[type] || []) {
            if (!event.stopped && listener.capture === capture) listener.fn(event);
          }
        }
      }
      return event;
    }
    closest(selector) { return selector === 'button' && this.tag === 'button' ? this : this.parent?.closest(selector); }
    setAttribute(name, value) { this.attributes[name] = value; }
    removeAttribute(name) { delete this.attributes[name]; }
    append(...nodes) {
      this.children = this.children.filter(node => !nodes.includes(node));
      this.children.push(...nodes);
    }
    focus() { document.activeElement = this; }
    getClientRects() { return this.hidden ? [] : [{}]; }
    setPointerCapture(id) { this.captures.add(id); }
    hasPointerCapture(id) { return this.captures.has(id); }
    releasePointerCapture(id) {
      this.captures.delete(id);
      this.dispatch('lostpointercapture', { pointerId: id });
    }
    animate(keyframes, options) {
      const animation = { keyframes, options, cancelled: false, cancel() { this.cancelled = true; } };
      animations.push(animation);
      return animation;
    }
  }

  document = new Element();
  document.body = new Element();
  const window = new Element();
  window.visualViewport = { scale: 1 };
  window.setTimeout = (fn, ms) => { const id = nextId++; timers.set(id, { fn, at: now + ms }); return id; };
  window.clearTimeout = id => timers.delete(id);
  window.requestAnimationFrame = fn => { const id = nextId++; frames.set(id, fn); return id; };
  window.cancelAnimationFrame = id => frames.delete(id);

  const gallery = new Element();
  const frame = new Element();
  const lightbox = new Element();
  lightbox.hidden = true;
  const stage = new Element('figure', lightbox);
  const image = new Element('img', stage);
  const close = new Element('button', lightbox);
  const previous = new Element('button', lightbox);
  const next = new Element('button', lightbox);
  const count = new Element('p', lightbox);
  const buttons = Array.from({ length: photoCount }, (_, i) => {
    const tile = new Element('figure', gallery);
    const button = new Element('button', tile);
    const photo = { src: `photo-${i + 1}.jpg` };
    button.querySelector = () => photo;
    tile.children.push(button);
    gallery.children.push(tile);
    return button;
  });
  gallery.querySelectorAll = selector => selector === '.gallery-item'
    ? gallery.children
    : gallery.children.map(tile => tile.children[0]);
  lightbox.querySelector = selector => ({
    '[data-gallery-image]': image, '[data-gallery-close]': close,
    '[data-gallery-prev]': previous, '[data-gallery-next]': next,
    '[data-gallery-count]': count, '.gallery-lightbox-stage': stage
  })[selector];
  document.querySelector = selector => ({
    '.gallery-grid': missingGallery ? null : gallery,
    '[data-gallery-lightbox]': lightbox, '.site-frame': frame
  })[selector];

  const testMath = Object.create(Math);
  testMath.random = random;
  vm.runInNewContext(viewer, {
    document, window, reduceMotion: reducedMotion, Date: { now: () => now },
    Math: testMath,
    Image: class { constructor() { preloads.push(this); } }
  });

  const flushFrames = () => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach(fn => fn());
  };
  const advance = ms => {
    now += ms;
    for (const [id, timer] of timers) {
      if (timer.at <= now) { timers.delete(id); timer.fn(); }
    }
  };
  const pointer = (type, x, y, options = {}) => {
    const { target = lightbox, ...details } = options;
    return target.dispatch(`pointer${type}`, {
      pointerType: 'touch', isPrimary: true, pointerId: 1,
      clientX: x, clientY: y, ...details
    });
  };
  const swipe = (dx, dy, target = image) => {
    pointer('down', 190, 300, { target });
    pointer('move', 190 + dx, 300 + dy);
    flushFrames();
    pointer('up', 190 + dx, 300 + dy);
  };
  return { document, window, gallery, frame, lightbox, stage, image, close, previous, next, count,
    buttons, pointer, swipe, advance, flushFrames, frames, timers, preloads, animations };
}

test('tap expands; controls, keyboard, focus trap and focus restoration remain available', () => {
  const s = setup();
  s.buttons[1].dispatch('click');
  assert.equal(s.lightbox.hidden, false);
  assert.equal(s.image.src, 'photo-2.jpg');
  assert.equal(s.count.textContent, '2 / 4');
  assert.equal(s.frame.attributes.inert, '');
  assert.equal(s.document.activeElement, s.close);
  s.next.dispatch('click');
  assert.equal(s.image.src, 'photo-3.jpg');
  s.document.dispatch('keydown', { key: 'ArrowLeft' });
  assert.equal(s.image.src, 'photo-2.jpg');
  s.document.dispatch('keydown', { key: 'Tab', shiftKey: true });
  assert.equal(s.document.activeElement, s.next);
  s.document.dispatch('keydown', { key: 'Escape' });
  assert.equal(s.lightbox.hidden, true);
  assert.equal(s.frame.attributes.inert, undefined);
  assert.equal(s.document.activeElement, s.buttons[1]);
});

test('horizontal swipes navigate once and wrap, including from the empty backdrop', () => {
  const s = setup();
  s.buttons[0].dispatch('click');
  s.swipe(-130, 10);
  assert.equal(s.count.textContent, '2 / 4');
  assert.equal(s.lightbox.dispatch('click').defaultPrevented, true);
  assert.equal(s.lightbox.hidden, false, 'Swipe-generated backdrop click must not close');
  s.swipe(130, 0, s.lightbox);
  assert.equal(s.count.textContent, '1 / 4');
  s.swipe(130, 0);
  assert.equal(s.count.textContent, '4 / 4');
  assert.equal(s.animations.at(-1).options.duration, 180);
  assert.equal(s.frames.size, 0);
});

test('mobile focus skips hidden arrows while swipes and keyboard navigation still work', () => {
  const s = setup();
  s.previous.hidden = true;
  s.next.hidden = true;
  s.buttons[0].dispatch('click');
  for (const shiftKey of [false, true]) {
    s.document.dispatch('keydown', { key: 'Tab', shiftKey });
    assert.equal(s.document.activeElement, s.close);
  }
  s.swipe(-130, 0);
  assert.equal(s.count.textContent, '2 / 4');
  s.document.dispatch('keydown', { key: 'ArrowRight' });
  assert.equal(s.count.textContent, '3 / 4');
  s.swipe(0, 150);
  s.advance(160);
  assert.equal(s.lightbox.hidden, true);
});

test('downward swipe closes from image, stage or surrounding space and restores focus', () => {
  for (const targetName of ['image', 'stage', 'lightbox', 'count']) {
    const s = setup();
    s.buttons[2].dispatch('click');
    s.swipe(10, 140, s[targetName]);
    assert(s.lightbox.classes.has('is-closing'));
    assert.equal(s.lightbox.hidden, false);
    s.advance(160);
    assert.equal(s.lightbox.hidden, true);
    assert.equal(s.document.activeElement, s.buttons[2]);
    assert.equal(s.stage.style.transform, undefined);
    assert.equal(s.lightbox.captures.size, 0);
    s.buttons[0].dispatch('click');
    assert.equal(s.lightbox.hidden, true, 'Do not reopen from the gesture follow-up click');
    s.advance(350);
    s.buttons[0].dispatch('click');
    assert.equal(s.lightbox.hidden, false);
  }
});

test('small movements, upward swipes and ambiguous diagonals do not navigate or close', () => {
  for (const [dx, dy] of [[5, 5], [30, 0], [0, 40], [0, -160], [100, 100]]) {
    const s = setup();
    s.buttons[0].dispatch('click');
    s.swipe(dx, dy);
    assert.equal(s.count.textContent, '1 / 4');
    assert.equal(s.lightbox.hidden, false);
    assert.equal(s.timers.size, 0);
    assert.equal(s.stage.style.transform, undefined);
  }
});

test('touching an image without swiping stays open; tapping backdrop or close still dismisses', () => {
  const s = setup();
  s.buttons[0].dispatch('click');
  s.pointer('down', 100, 200, { target: s.image });
  assert.equal(s.lightbox.captures.size, 0, 'Do not retarget ordinary taps to the backdrop');
  s.pointer('up', 100, 200, { target: s.image });
  s.image.dispatch('click');
  assert.equal(s.lightbox.hidden, false);
  s.lightbox.dispatch('click');
  assert.equal(s.lightbox.hidden, true);
  s.buttons[0].dispatch('click');
  s.close.dispatch('click');
  assert.equal(s.lightbox.hidden, true);
});

test('touch controls and mouse drags retain their existing behaviour', () => {
  const s = setup();
  s.buttons[0].dispatch('click');
  s.swipe(-150, 0, s.next);
  assert.equal(s.count.textContent, '1 / 4');
  s.next.dispatch('click');
  assert.equal(s.count.textContent, '2 / 4');
  s.pointer('down', 200, 300, { pointerType: 'mouse' });
  s.pointer('move', 10, 300, { pointerType: 'mouse' });
  s.pointer('up', 10, 300, { pointerType: 'mouse' });
  assert.equal(s.count.textContent, '2 / 4');
});

test('cancel, capture loss, blur and multi-touch clear all pending drag work', () => {
  for (const cancel of ['cancel', 'lostpointercapture', 'blur', 'multitouch']) {
    const s = setup();
    s.buttons[0].dispatch('click');
    s.pointer('down', 200, 300);
    s.pointer('move', 60, 300);
    assert.equal(s.frames.size, 1);
    if (cancel === 'cancel') s.pointer('cancel', 60, 300);
    if (cancel === 'lostpointercapture') s.lightbox.releasePointerCapture(1);
    if (cancel === 'blur') s.window.dispatch('blur');
    if (cancel === 'multitouch') s.pointer('down', 230, 310, { pointerId: 2, isPrimary: false });
    assert.equal(s.frames.size, 0);
    assert.equal(s.lightbox.classes.has('is-dragging'), false);
    s.pointer('up', 60, 300);
    assert.equal(s.count.textContent, '1 / 4');
  }
});

test('native zoom is not treated as photo navigation', () => {
  const s = setup();
  s.buttons[0].dispatch('click');
  s.window.visualViewport.scale = 2;
  s.swipe(-150, 0);
  assert.equal(s.count.textContent, '1 / 4');
  assert.equal(s.frames.size, 0);
});

test('transferring implicit image capture to the viewer does not cancel the swipe', () => {
  const s = setup();
  s.buttons[0].dispatch('click');
  s.pointer('down', 200, 300, { target: s.image });
  s.pointer('move', 60, 300, { target: s.image });
  s.image.dispatch('lostpointercapture', { pointerId: 1 });
  s.pointer('cancel', 250, 300, { pointerId: 2 });
  assert.equal(s.frames.size, 1);
  assert.equal(s.lightbox.classes.has('is-dragging'), true);
  s.flushFrames();
  s.pointer('up', 60, 300);
  assert.equal(s.count.textContent, '2 / 4');
});

test('drag updates are coalesced to one frame and only two neighbours are preloaded', () => {
  const s = setup();
  s.buttons[1].dispatch('click');
  assert.equal(s.preloads.length, 2);
  assert.deepEqual(s.preloads.map(image => image.src), ['photo-1.jpg', 'photo-3.jpg']);
  s.pointer('down', 200, 300);
  for (let x = 180; x >= 80; x -= 10) s.pointer('move', x, 300);
  assert.equal(s.frames.size, 1);
  s.flushFrames();
  assert.equal(s.stage.style.transform, 'translate3d(-78px, 0px, 0)');
  s.pointer('up', 80, 300);
  assert.equal(s.count.textContent, '3 / 4');
  assert.equal(s.preloads.length, 2);
});

test('reduced motion retains gestures without drag effects or closing delay', () => {
  const s = setup({ reducedMotion: true });
  s.buttons[0].dispatch('click');
  s.swipe(-150, 0);
  assert.equal(s.count.textContent, '2 / 4');
  assert.equal(s.animations.length, 0);
  assert.equal(s.frames.size, 0);
  s.swipe(0, 150);
  assert.equal(s.lightbox.hidden, true);
  assert.equal(s.timers.size, 0);
});

test('other pages are left untouched', () => {
  const s = setup({ missingGallery: true });
  assert.equal(s.preloads.length, 0);
  assert.equal(Object.keys(s.lightbox.events).length, 0);
});

test('shuffle moves every existing photo exactly once and synchronizes labels and viewer order', () => {
  const s = setup({ random: () => 0 });
  const ordered = s.gallery.querySelectorAll('[data-gallery-open]');
  assert.deepEqual(ordered, [s.buttons[1], s.buttons[2], s.buttons[3], s.buttons[0]]);
  assert.equal(new Set(ordered).size, s.buttons.length);
  ordered.forEach((button, index) => {
    assert.equal(button.attributes['aria-label'], `Expand image ${index + 1} of 4`);
    button.dispatch('click');
    assert.equal(s.image.src, button.querySelector('img').src);
    assert.equal(s.count.textContent, `${index + 1} / 4`);
    s.close.dispatch('click');
    assert.equal(s.document.activeElement, button);
  });
  ordered[0].dispatch('click');
  s.next.dispatch('click');
  assert.equal(s.image.src, 'photo-3.jpg');
  s.swipe(-130, 0);
  assert.equal(s.image.src, 'photo-4.jpg');
  assert.deepEqual(s.preloads.map(photo => photo.src), ['photo-3.jpg', 'photo-1.jpg']);
});

test('new visits shuffle afresh, while opening, closing and resizing preserve the current order', () => {
  const first = setup({ random: () => 0 });
  const second = setup({ random: () => 0.5 });
  const order = s => s.gallery.querySelectorAll('[data-gallery-open]').map(button => button.querySelector('img').src);
  assert.notDeepEqual(order(first), order(second));
  const initialOrder = order(first);
  first.buttons[0].dispatch('click');
  first.close.dispatch('click');
  first.window.dispatch('resize');
  first.window.dispatch('pageshow', { persisted: false });
  assert.deepEqual(order(first), initialOrder);
  assert.equal(first.frames.size, 0);
  assert.equal(first.timers.size, 0);
});

test('Back/Forward restores reshuffle and keep existing click handlers and focus working', () => {
  const s = setup({ random: () => 0 });
  s.buttons[0].dispatch('click');
  s.window.dispatch('pageshow', { persisted: true });
  assert.equal(s.lightbox.hidden, true);
  assert.equal(s.frame.attributes.inert, undefined);
  const ordered = s.gallery.querySelectorAll('[data-gallery-open]');
  assert.deepEqual(ordered, [s.buttons[2], s.buttons[3], s.buttons[0], s.buttons[1]]);
  ordered[2].dispatch('click');
  assert.equal(s.count.textContent, '3 / 4');
  assert.equal(s.image.src, 'photo-1.jpg');
  s.next.dispatch('click');
  assert.equal(s.image.src, 'photo-2.jpg');
  s.close.dispatch('click');
  assert.equal(s.document.activeElement, ordered[2]);
  for (const button of ordered) assert.equal(button.events.click.length, 1);
});

test('shuffle supports reduced motion, single photos and an empty gallery', () => {
  const reduced = setup({ reducedMotion: true, random: () => 0 });
  reduced.gallery.querySelectorAll('[data-gallery-open]')[0].dispatch('click');
  assert.equal(reduced.image.src, 'photo-2.jpg');
  assert.equal(reduced.animations.length, 0);
  const single = setup({ photoCount: 1 });
  single.buttons[0].dispatch('click');
  single.next.dispatch('click');
  assert.equal(single.image.src, 'photo-1.jpg');
  assert.equal(single.count.textContent, '1 / 1');
  const empty = setup({ photoCount: 0 });
  assert.equal(empty.preloads.length, 0);
  assert.equal(Object.keys(empty.lightbox.events).length, 0);
});
