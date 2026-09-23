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

  // CSS centers the glow so resizing it cannot offset it from the pointer.
  let raf = 0;
  let px = 0;
  let py = 0;

  const hide = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    frame.style.setProperty("--spotlight-opacity", "0");
  };

  frame.addEventListener("pointermove", (e) => {
    const rect = frame.getBoundingClientRect();
    px = e.clientX - rect.left;
    py = e.clientY - rect.top;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      frame.style.setProperty("--sx", `${px}px`);
      frame.style.setProperty("--sy", `${py}px`);
      frame.style.setProperty("--spotlight-opacity", "1");
      raf = 0;
    });
  });

  frame.addEventListener("pointerleave", hide);
  frame.addEventListener("pointercancel", hide);
  window.addEventListener("blur", hide);
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
// Gallery viewer — accessible click-to-expand navigation.
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

  if (!sourceImages.length || !expandedImage || !closeButton || !previousButton || !nextButton || !count) {
    return;
  }

  let currentIndex = 0;
  let lastTrigger = null;

  const showImage = (index) => {
    currentIndex = (index + sourceImages.length) % sourceImages.length;
    const source = sourceImages[currentIndex];
    expandedImage.src = source.currentSrc || source.src;
    expandedImage.alt = `Expanded gallery image ${currentIndex + 1} of ${sourceImages.length}`;
    count.textContent = `${currentIndex + 1} / ${sourceImages.length}`;
  };

  const open = (index, trigger) => {
    lastTrigger = trigger;
    showImage(index);
    lightbox.hidden = false;
    frame?.setAttribute("inert", "");
    document.body.classList.add("gallery-lightbox-open");
    closeButton.focus({ preventScroll: true });
  };

  const close = () => {
    if (lightbox.hidden) return;
    lightbox.hidden = true;
    frame?.removeAttribute("inert");
    document.body.classList.remove("gallery-lightbox-open");
    lastTrigger?.focus({ preventScroll: true });
  };

  openButtons.forEach((button, index) => {
    button.addEventListener("click", () => open(index, button));
  });

  closeButton.addEventListener("click", close);
  previousButton.addEventListener("click", () => showImage(currentIndex - 1));
  nextButton.addEventListener("click", () => showImage(currentIndex + 1));

  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox || event.target === stage) close();
  });

  document.addEventListener("keydown", (event) => {
    if (lightbox.hidden) return;

    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      showImage(currentIndex - 1);
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      showImage(currentIndex + 1);
      return;
    }

    if (event.key === "Tab") {
      const controls = [closeButton, previousButton, nextButton];
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
