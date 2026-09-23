// ---------------------------------------------------------------------------
// A.C. portfolio — interaction layer
// Kept intentionally lean: year stamp, smooth page transitions, entrance
// reveals, and a soft pointer spotlight. All motion respects reduced-motion.
// ---------------------------------------------------------------------------

// Signal that JS is available so CSS can opt into progressive enhancements
// (entrance reveals). Without this class, content renders fully visible.
document.documentElement.classList.add("js");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = window.matchMedia("(pointer: fine)").matches;

// Current year in the footer
document.querySelectorAll("[data-year]").forEach((node) => {
  node.textContent = String(new Date().getFullYear());
});

// ---------------------------------------------------------------------------
// Smooth cross-document transitions (progressive enhancement)
// ---------------------------------------------------------------------------
if (document.startViewTransition && !reduceMotion) {
  document.addEventListener("click", (e) => {
    const link = e.target.closest("a[href]");
    if (!link || link.origin !== location.origin) return;
    if (link.target === "_blank" || link.hasAttribute("download")) return;
    if (link.hash && link.pathname === location.pathname) return;
    e.preventDefault();
    document.startViewTransition(() => {
      location.href = link.href;
    });
  });
}

// ---------------------------------------------------------------------------
// Entrance reveals — staggered, triggered as elements enter the viewport
// ---------------------------------------------------------------------------
(function initReveals() {
  const items = document.querySelectorAll(".reveal");
  if (!items.length) return;

  if (reduceMotion || !("IntersectionObserver" in window)) {
    items.forEach((el) => el.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        if (el.dataset.revealDelay) {
          el.style.transitionDelay = `${Number(el.dataset.revealDelay)}ms`;
        }
        el.classList.add("is-visible");
        obs.unobserve(el);
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
  );

  items.forEach((el) => observer.observe(el));
})();

// ---------------------------------------------------------------------------
// Pointer spotlight — a soft light that tracks the cursor across the frame.
// Purely decorative; skipped for coarse pointers and reduced-motion.
// ---------------------------------------------------------------------------
(function initSpotlight() {
  if (reduceMotion || !finePointer) return;
  const frame = document.querySelector(".site-frame");
  if (!frame) return;

  // On the photo-heavy gallery, move a single decorative layer instead of
  // changing inherited CSS variables across every photo on each pointer frame.
  const galleryGlow = document.body.dataset.page === "gallery"
    ? document.createElement("span")
    : null;
  if (galleryGlow) {
    galleryGlow.className = "gallery-spotlight";
    galleryGlow.setAttribute("aria-hidden", "true");
    frame.prepend(galleryGlow);
  }

  // CSS centers the glow so resizing it cannot offset it from the pointer.
  let raf = 0;
  let px = 0;
  let py = 0;

  const hide = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (galleryGlow) galleryGlow.style.opacity = "0";
    else frame.style.setProperty("--spotlight-opacity", "0");
  };

  frame.addEventListener("pointermove", (e) => {
    px = e.clientX;
    py = e.clientY;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      // Read geometry once per rendered frame, not once per pointer event.
      const rect = frame.getBoundingClientRect();
      const x = px - rect.left;
      const y = py - rect.top;
      if (galleryGlow) {
        galleryGlow.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
        galleryGlow.style.opacity = "1";
      } else {
        frame.style.setProperty("--sx", `${x}px`);
        frame.style.setProperty("--sy", `${y}px`);
        frame.style.setProperty("--spotlight-opacity", "1");
      }
      raf = 0;
    });
  });

  frame.addEventListener("pointerleave", hide);
  frame.addEventListener("pointercancel", hide);
  window.addEventListener("blur", hide);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) hide();
  });
})();

// ---------------------------------------------------------------------------
// Magnetic hover on interactive cards/rows — a gentle lift toward the cursor.
// ---------------------------------------------------------------------------
(function initMagnetic() {
  if (reduceMotion || !finePointer) return;
  const targets = document.querySelectorAll("[data-magnetic]");

  targets.forEach((el) => {
    // Cache the rect on enter so the hot pointermove path never reads layout,
    // and coalesce writes to one per frame via rAF (mirrors the spotlight).
    let rect = null;
    let raf = 0;
    let mx = 0;
    let my = 0;

    const apply = () => {
      raf = 0;
      el.style.setProperty("--tilt-x", `${(-my * 3).toFixed(2)}deg`);
      el.style.setProperty("--tilt-y", `${(mx * 3).toFixed(2)}deg`);
    };

    el.addEventListener("pointerenter", () => {
      rect = el.getBoundingClientRect();
    });

    el.addEventListener("pointermove", (e) => {
      if (!rect) rect = el.getBoundingClientRect();
      mx = (e.clientX - rect.left) / rect.width - 0.5;
      my = (e.clientY - rect.top) / rect.height - 0.5;
      if (!raf) raf = requestAnimationFrame(apply);
    });

    el.addEventListener("pointerleave", () => {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      rect = null;
      el.style.setProperty("--tilt-x", "0deg");
      el.style.setProperty("--tilt-y", "0deg");
    });
  });
})();

// ---------------------------------------------------------------------------
// Home headline — alternate the two phrases every 20 seconds, without moving
// the layout. Reduced motion keeps the initial phrase static.
// ---------------------------------------------------------------------------
(function initHomeHeadline() {
  const headline = document.querySelector("[data-home-headline]");
  if (!headline || reduceMotion) return;

  const phrases = Array.from(headline.querySelectorAll("[data-home-phrase]"));
  if (phrases.length < 2) return;

  let currentIndex = 0;
  let timer = 0;

  const showNext = () => {
    phrases[currentIndex].classList.remove("is-active");
    currentIndex = (currentIndex + 1) % phrases.length;
    phrases[currentIndex].classList.add("is-active");
    headline.dataset.activePhrase = String(currentIndex + 1);
  };

  const stop = () => {
    if (timer) window.clearInterval(timer);
    timer = 0;
  };

  const start = () => {
    if (timer || document.hidden) return;
    timer = window.setInterval(showNext, 20000);
  };

  headline.dataset.activePhrase = "1";
  start();

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else start();
  });
})();

// ---------------------------------------------------------------------------
// About slideshow — four three-image compositions crossfade as complete sets.
// The first set remains static when reduced motion is requested.
// ---------------------------------------------------------------------------
(function initAboutSlideshow() {
  const slideshow = document.querySelector("[data-about-slideshow]");
  if (!slideshow) return;

  const slides = Array.from(slideshow.querySelectorAll("[data-about-slide]"));
  if (slides.length < 2 || reduceMotion) return;

  let currentIndex = 0;
  let timer = 0;

  const showNext = () => {
    const previous = slides[currentIndex];
    currentIndex = (currentIndex + 1) % slides.length;
    const next = slides[currentIndex];

    previous.classList.remove("is-active");
    previous.setAttribute("aria-hidden", "true");
    next.classList.add("is-active");
    next.setAttribute("aria-hidden", "false");
    slideshow.dataset.activeSlide = String(currentIndex + 1);
  };

  const start = () => {
    if (timer) return;
    timer = window.setInterval(showNext, 20000);
  };

  const stop = () => {
    if (!timer) return;
    window.clearInterval(timer);
    timer = 0;
  };

  slideshow.dataset.activeSlide = "1";
  start();

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else start();
  });
})();

// ---------------------------------------------------------------------------
// Portfolio image protection — deter casual copying across the photography
// pages. Public browser images cannot be made fully unrecoverable, but native
// dragging and the image context menu are disabled here.
// ---------------------------------------------------------------------------
(function initProtectedImages() {
  const protectedAreas = document.querySelectorAll(
    ".gallery-grid, .gallery-lightbox, .about-visual"
  );

  protectedAreas.forEach((area) => {
    area.addEventListener("contextmenu", (event) => {
      if (event.target instanceof Element && event.target.closest("img")) {
        event.preventDefault();
      }
    });

    area.addEventListener("dragstart", (event) => {
      if (event.target instanceof Element && event.target.closest("img")) {
        event.preventDefault();
      }
    });
  });
})();

// ---------------------------------------------------------------------------
// Gallery viewer — tap to expand, swipe to browse, swipe down to dismiss.
// ---------------------------------------------------------------------------
(function initGalleryViewer() {
  const gallery = document.querySelector(".gallery-grid");
  const lightbox = document.querySelector("[data-gallery-lightbox]");
  if (!gallery || !lightbox) return;

  const frame = document.querySelector(".site-frame");
  const openButtons = Array.from(gallery.querySelectorAll("[data-gallery-open]"));
  const sourceImages = openButtons.map((button) => button.querySelector("img"));
  const expandedImage = lightbox.querySelector("[data-gallery-image]");
  const closeButton = lightbox.querySelector("[data-gallery-close]");
  const previousButton = lightbox.querySelector("[data-gallery-prev]");
  const nextButton = lightbox.querySelector("[data-gallery-next]");
  const count = lightbox.querySelector("[data-gallery-count]");
  const stage = lightbox.querySelector(".gallery-lightbox-stage");

  if (!sourceImages.length || !expandedImage || !closeButton || !previousButton || !nextButton || !count || !stage) {
    return;
  }

  let currentIndex = 0;
  let lastTrigger = null;
  let gesture = null;
  let dragFrame = 0;
  let closeTimer = 0;
  let ignoreClicksUntil = 0;
  let imageAnimation = null;
  // Only the two neighbouring photos are warmed, not the entire gallery.
  const neighbours = [new Image(), new Image()];

  const resetGesture = () => {
    const pointerId = gesture?.id;
    gesture = null;
    if (dragFrame) window.cancelAnimationFrame(dragFrame);
    dragFrame = 0;
    lightbox.classList.remove("is-dragging");
    stage.style.removeProperty("transform");
    stage.style.removeProperty("opacity");
    if (pointerId != null && lightbox.hasPointerCapture(pointerId)) {
      lightbox.releasePointerCapture(pointerId);
    }
  };

  const showImage = (index, direction = 0) => {
    resetGesture();
    imageAnimation?.cancel();
    currentIndex = (index + sourceImages.length) % sourceImages.length;
    const source = sourceImages[currentIndex];
    expandedImage.src = source.currentSrc || source.src;
    expandedImage.alt = `Expanded gallery image ${currentIndex + 1} of ${sourceImages.length}`;
    count.textContent = `${currentIndex + 1} / ${sourceImages.length}`;
    neighbours.forEach((image, offset) => {
      const adjacent = sourceImages[(currentIndex + (offset ? 1 : sourceImages.length - 1)) % sourceImages.length];
      image.decoding = "async";
      image.src = adjacent.currentSrc || adjacent.src;
    });
    if (direction && !reduceMotion) {
      imageAnimation = stage.animate([
        { transform: `translate3d(${direction * 24}px, 0, 0)`, opacity: 0.65 },
        { transform: "translate3d(0, 0, 0)", opacity: 1 }
      ], { duration: 180, easing: "ease-out" });
    }
  };

  const open = (index, trigger) => {
    if (Date.now() < ignoreClicksUntil) return;
    window.clearTimeout(closeTimer);
    closeTimer = 0;
    lightbox.classList.remove("is-closing");
    lastTrigger = trigger;
    showImage(index);
    lightbox.hidden = false;
    frame?.setAttribute("inert", "");
    document.body.classList.add("gallery-lightbox-open");
    closeButton.focus({ preventScroll: true });
  };

  const finishClose = () => {
    window.clearTimeout(closeTimer);
    closeTimer = 0;
    lightbox.hidden = true;
    lightbox.classList.remove("is-closing");
    resetGesture();
    imageAnimation?.cancel();
    frame?.removeAttribute("inert");
    document.body.classList.remove("gallery-lightbox-open");
    lastTrigger?.focus({ preventScroll: true });
  };

  const close = (animate = false) => {
    if (lightbox.hidden) return;
    if (animate && !reduceMotion) {
      if (closeTimer) return;
      lightbox.classList.add("is-closing");
      closeTimer = window.setTimeout(finishClose, 160);
    } else {
      finishClose();
    }
  };

  openButtons.forEach((button, index) => {
    button.addEventListener("click", () => open(index, button));
  });

  closeButton.addEventListener("click", () => close());
  previousButton.addEventListener("click", () => showImage(currentIndex - 1, -1));
  nextButton.addEventListener("click", () => showImage(currentIndex + 1, 1));

  // A swipe must not produce a follow-up click on the backdrop or a control.
  lightbox.addEventListener("click", (event) => {
    if (Date.now() < ignoreClicksUntil || closeTimer) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox || event.target === stage) close();
  });

  const cancelGesture = () => {
    if (!gesture) return;
    ignoreClicksUntil = Date.now() + 350;
    resetGesture();
  };

  lightbox.addEventListener("pointerdown", (event) => {
    if (lightbox.hidden || closeTimer || event.pointerType === "mouse") return;
    if (!event.isPrimary) {
      cancelGesture();
      return;
    }
    // Keep buttons and native pinch-zoom independent of photo navigation.
    if (event.target.closest("button") || (window.visualViewport?.scale || 1) > 1.05) return;
    imageAnimation?.cancel();
    gesture = {
      id: event.pointerId, x: event.clientX, y: event.clientY,
      dx: 0, dy: 0, axis: null, moved: false,
      width: lightbox.clientWidth, height: lightbox.clientHeight
    };
  });

  lightbox.addEventListener("pointermove", (event) => {
    if (!gesture || event.pointerId !== gesture.id || closeTimer) return;
    gesture.dx = event.clientX - gesture.x;
    gesture.dy = event.clientY - gesture.y;
    const x = Math.abs(gesture.dx);
    const y = Math.abs(gesture.dy);
    if (Math.max(x, y) < 12 && !gesture.moved) return;
    gesture.moved = true;
    if (!gesture.axis) {
      if (x > y * 1.2) gesture.axis = "x";
      else if (y > x * 1.2) gesture.axis = "y";
      else return;
      lightbox.setPointerCapture(event.pointerId);
      lightbox.classList.add("is-dragging");
    }
    if (reduceMotion || dragFrame) return;
    // One compositor-only update per frame; no layout reads while dragging.
    dragFrame = window.requestAnimationFrame(() => {
      dragFrame = 0;
      if (!gesture) return;
      const dragX = gesture.axis === "x" ? gesture.dx * 0.65 : 0;
      const dragY = gesture.axis === "y" ? Math.max(0, gesture.dy) * 0.75 : 0;
      stage.style.transform = `translate3d(${dragX}px, ${dragY}px, 0)`;
      stage.style.opacity = String(1 - Math.min(dragY / gesture.height, 0.45));
    });
  });

  lightbox.addEventListener("pointerup", (event) => {
    if (!gesture || event.pointerId !== gesture.id) return;
    const swipe = gesture;
    // Include the final touch position, even if its last frame was coalesced.
    swipe.dx = event.clientX - swipe.x;
    swipe.dy = event.clientY - swipe.y;
    if (swipe.moved) ignoreClicksUntil = Date.now() + 350;
    const horizontalThreshold = Math.max(45, Math.min(80, swipe.width * 0.14));
    const closeThreshold = Math.max(65, Math.min(110, swipe.height * 0.1));
    if (swipe.axis === "y" && swipe.dy > closeThreshold && swipe.dy > Math.abs(swipe.dx) * 1.2) {
      // Leave the photo at the finger's final position while the view fades.
      if (dragFrame) window.cancelAnimationFrame(dragFrame);
      dragFrame = 0;
      gesture = null;
      if (lightbox.hasPointerCapture(event.pointerId)) lightbox.releasePointerCapture(event.pointerId);
      close(true);
    } else if (swipe.axis === "x" && Math.abs(swipe.dx) > horizontalThreshold && Math.abs(swipe.dx) > Math.abs(swipe.dy) * 1.2) {
      const direction = swipe.dx < 0 ? 1 : -1;
      showImage(currentIndex + direction, direction);
    } else {
      resetGesture();
    }
  });

  lightbox.addEventListener("pointercancel", (event) => {
    if (event.pointerId === gesture?.id) cancelGesture();
  });
  lightbox.addEventListener("lostpointercapture", (event) => {
    // Touch starts with implicit capture on the image. Its bubbled capture-loss
    // event is expected when we transfer the swipe to the surrounding viewer.
    if (event.target === lightbox && event.pointerId === gesture?.id) cancelGesture();
  });
  window.addEventListener("blur", cancelGesture);

  document.addEventListener("keydown", (event) => {
    if (lightbox.hidden) return;

    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }

    if (closeTimer) return;

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      showImage(currentIndex - 1, -1);
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      showImage(currentIndex + 1, 1);
      return;
    }

    if (event.key === "Tab") {
      const controls = [closeButton, previousButton, nextButton].filter(
        (control) => control.getClientRects().length > 0
      );
      const activeIndex = controls.indexOf(document.activeElement);
      const direction = event.shiftKey ? -1 : 1;
      const nextIndex = activeIndex === -1
        ? 0
        : (activeIndex + direction + controls.length) % controls.length;
      event.preventDefault();
      controls[nextIndex].focus();
    }
  });

})();
