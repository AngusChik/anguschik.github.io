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

  // Half the blob's size (see .site-frame::before width/height) so the gradient
  // is centred on the pointer. Moving via transform keeps this off the paint
  // path entirely.
  const HALF = 380;
  let raf = 0;
  let px = 0;
  let py = 0;

  const rest = () => {
    const rect = frame.getBoundingClientRect();
    frame.style.setProperty("--sx", `${rect.width / 2 - HALF}px`);
    frame.style.setProperty("--sy", `${rect.height * 0.3 - HALF}px`);
  };
  rest();

  frame.addEventListener("pointermove", (e) => {
    const rect = frame.getBoundingClientRect();
    px = e.clientX - rect.left - HALF;
    py = e.clientY - rect.top - HALF;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      frame.style.setProperty("--sx", `${px}px`);
      frame.style.setProperty("--sy", `${py}px`);
      raf = 0;
    });
  });

  frame.addEventListener("pointerleave", rest);
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
