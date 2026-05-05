const yearNodes = document.querySelectorAll("[data-year]");
const currentYear = new Date().getFullYear();

yearNodes.forEach((node) => {
  node.textContent = String(currentYear);
});

// Custom cursor (mouse only, respects reduced-motion)
const useCursor =
  window.matchMedia("(pointer: fine)").matches &&
  window.matchMedia("(prefers-reduced-motion: no-preference)").matches;

if (useCursor) {
  const cursor = document.createElement("div");
  cursor.id = "cursor";
  document.body.appendChild(cursor);

  document.addEventListener("mousemove", (e) => {
    cursor.style.left = e.clientX + "px";
    cursor.style.top = e.clientY + "px";
  });

  document.querySelectorAll("a, button").forEach((el) => {
    el.addEventListener("mouseenter", () => cursor.classList.add("expanded"));
    el.addEventListener("mouseleave", () => cursor.classList.remove("expanded"));
  });
}

// Page transitions
if (document.startViewTransition) {
  document.addEventListener("click", (e) => {
    const link = e.target.closest("a[href]");
    if (!link || link.origin !== location.origin) return;
    if (link.hash && link.pathname === location.pathname) return;
    e.preventDefault();
    document.startViewTransition(() => {
      location.href = link.href;
    });
  });
}

// DVD bounce (about page)
(function initDvd() {
  const visual = document.querySelector(".about-visual");
  const logo = document.querySelector(".dvd-logo");
  if (!visual || !logo) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const cs = getComputedStyle(document.documentElement);
  const COLORS = [
    cs.getPropertyValue("--accent").trim(),
    cs.getPropertyValue("--muted").trim(),
    cs.getPropertyValue("--paper-text").trim(),
  ].filter(Boolean).concat(["#938d66", "#6b6450", "#1f1d18"]).slice(0, 3);

  let colorIdx = 0;
  let x = 32, y = 28;
  let dx = 1.1, dy = 0.75;

  logo.style.color = COLORS[0];

  function tick() {
    const vw = visual.offsetWidth;
    const vh = visual.offsetHeight;
    const lw = logo.offsetWidth  || 7;
    const lh = logo.offsetHeight || 7;

    if (vw <= 0 || vh <= 0) { requestAnimationFrame(tick); return; }

    x += dx;
    y += dy;

    const PAD = 6;
    let hit = false;
    if (x <= PAD)            { x = PAD;           dx =  Math.abs(dx); hit = true; }
    if (x + lw >= vw - PAD) { x = vw - lw - PAD; dx = -Math.abs(dx); hit = true; }
    if (y <= PAD)            { y = PAD;           dy =  Math.abs(dy); hit = true; }
    if (y + lh >= vh - PAD) { y = vh - lh - PAD; dy = -Math.abs(dy); hit = true; }

    if (hit) {
      colorIdx = (colorIdx + 1) % COLORS.length;
      logo.style.color = COLORS[colorIdx];
    }

    logo.style.transform = `translate(${x}px, ${y}px)`;
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
})();

// Psyduck
(function initPsyduck() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const S = 4;
  const _ = null;
  const Y = "#f8d030";
  const H = "#2a1a06";
  const B = "#4878e8";
  const W = "#f8f8d0";
  const E = "#101010";
  const O = "#e07030";

  const BODY = [
    [_,_,_,H,_,H,_,H,_,_,_,_],
    [_,_,Y,Y,Y,Y,Y,Y,Y,_,_,_],
    [_,Y,Y,Y,Y,Y,Y,Y,Y,Y,_,_],
    [_,B,B,B,Y,Y,Y,B,B,B,_,_],
    [_,W,W,W,Y,Y,Y,W,W,W,_,_],
    [_,W,E,W,Y,Y,Y,W,E,W,_,_],
    [_,_,Y,Y,O,O,O,Y,Y,_,_,_],
    [_,Y,Y,Y,W,W,W,Y,Y,Y,_,_],
    [Y,Y,Y,Y,W,W,W,Y,Y,Y,Y,_],
    [_,_,Y,Y,Y,Y,Y,Y,Y,_,_,_],
  ];

  const LEGS = [
    [
      [_,_,_,Y,Y,_,Y,Y,_,_,_,_],
      [_,_,_,Y,Y,_,Y,Y,_,_,_,_],
    ],
    [
      [_,_,Y,Y,_,_,_,Y,Y,_,_,_],
      [_,_,Y,Y,_,_,_,Y,Y,_,_,_],
    ],
  ];

  const COLS = 12;
  const TOTAL_ROWS = BODY.length + LEGS[0].length;
  const W_PX = COLS * S;
  const H_PX = TOTAL_ROWS * S;

  const topbar = document.querySelector(".topbar");
  const canvas = document.createElement("canvas");
  canvas.id = "psyduck";
  canvas.width = W_PX;
  canvas.height = H_PX;
  canvas.setAttribute("aria-hidden", "true");
  canvas.title = "Psyduck (click me)";
  topbar.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  function draw(frame) {
    ctx.clearRect(0, 0, W_PX, H_PX);
    BODY.forEach((row, r) => {
      row.forEach((color, c) => {
        if (!color) return;
        ctx.fillStyle = color;
        ctx.fillRect(c * S, r * S, S, S);
      });
    });
    LEGS[frame].forEach((row, r) => {
      row.forEach((color, c) => {
        if (!color) return;
        ctx.fillStyle = color;
        ctx.fillRect(c * S, (BODY.length + r) * S, S, S);
      });
    });
  }

  const saved = JSON.parse(sessionStorage.getItem("psyduck") || "null");
  let x   = saved ? saved.x   : 60;
  let dir = saved ? saved.dir :  1;
  let frame = 0;
  let isAching = false;
  let lastStepTs = 0;

  const STEP_MS = 175;
  const SPEED = 0.75;

  canvas.addEventListener("click", (e) => {
    e.stopPropagation();
    if (isAching) return;
    isAching = true;
    canvas.classList.add("psyduck-ache");
    canvas.addEventListener("animationend", () => {
      canvas.classList.remove("psyduck-ache");
      isAching = false;
    }, { once: true });
  });

  if (useCursor) {
    const cursorEl = document.getElementById("cursor");
    canvas.addEventListener("mouseenter", () => cursorEl?.classList.add("expanded"));
    canvas.addEventListener("mouseleave", () => cursorEl?.classList.remove("expanded"));
  }

  function tick(ts) {
    if (!isAching) {
      if (ts - lastStepTs > STEP_MS) {
        frame = (frame + 1) % 2;
        lastStepTs = ts;
      }

      const maxX = topbar.offsetWidth - W_PX;
      x = Math.min(Math.max(x + SPEED * dir, 0), maxX);
      if (x >= maxX) dir = -1;
      if (x <= 0)    dir =  1;

      canvas.style.left = x + "px";
      sessionStorage.setItem("psyduck", JSON.stringify({ x, dir }));
    }

    draw(frame);
    requestAnimationFrame(tick);
  }

  canvas.style.left = x + "px";
  draw(0);
  requestAnimationFrame(tick);
})();
