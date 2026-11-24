/* Pond: fish that sway, ripple, and swim off to a section. No dependencies. */
(() => {
  const W = 1922, H = 1381;                    // painting size in px
  const FISH_BOX = { x0: 100, y0: 280, x1: 1680, y1: 1170 }; // area that must stay visible
  const SECTION_BG = {                         // which part of the pond each section shows
    about: "8% 62%", blog: "30% 18%", music: "96% 22%", professional: "45% 100%",
  };
  const SITE_TITLE = document.title;

  const body = document.body;
  const pond = document.getElementById("pond");
  const stage = document.getElementById("stage");
  const ripples = document.getElementById("ripples");
  const bgImg = stage.querySelector(".stage__bg");
  const signature = document.getElementById("signature");
  const shore = document.getElementById("shore");
  const shoreBg = shore.querySelector(".shore__bg");
  const sections = [...shore.querySelectorAll(".section")];
  const fishEls = [...stage.querySelectorAll(".fish")];
  const legendLinks = [...document.querySelectorAll(".legend a")];
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const fish = Object.fromEntries(fishEls.map((el) => {
    const cs = el.style;
    const [hx, hy] = el.dataset.heading.split(",").map(Number);
    const len = Math.hypot(hx, hy);
    return [el.dataset.fish, {
      el, name: el.dataset.fish,
      x: +cs.getPropertyValue("--x"), y: +cs.getPropertyValue("--y"),
      w: +cs.getPropertyValue("--w"), h: +cs.getPropertyValue("--h"),
      hx: hx / len, hy: hy / len,
      alpha: null,
    }];
  }));
  // hit-test order: top-most first (later in DOM = on top)
  const hitOrder = fishEls.map((el) => fish[el.dataset.fish]).reverse();

  /* ---------- evening: moonlit from 7pm to 6am, visitor's local time ----------
     Preview either look any time with ?mode=evening or ?mode=day. */
  function isEvening() {
    const forced = new URLSearchParams(location.search).get("mode");
    if (forced === "evening" || forced === "day") return forced === "evening";
    const h = new Date().getHours();
    return h >= 19 || h < 6;
  }
  const applyMode = () => body.classList.toggle("evening", isEvening());
  applyMode();
  setInterval(applyMode, 5 * 60 * 1000); // pick up dusk/dawn if the page stays open

  /* ---------- layout: fit the painting to the viewport ----------
     On tall, narrow screens (phones) the pond is turned a quarter turn, so the
     fish swim up the screen and the painting fills it instead of sitting in a
     thin band. Seen from above, a pond has no "up", so nothing looks wrong. */
  let scale = 0.5, tx = 0, ty = 0, rotated = false;
  function layout() {
    const vw = innerWidth, vh = innerHeight;
    rotated = vw / vh < 0.75;
    body.classList.toggle("rotated", rotated);
    const small = vw < 560;
    const top = small ? 60 : 72, bottom = small ? 56 : 80, side = small ? 8 : 40;
    // work in the frame as it appears on screen
    const RW = rotated ? H : W, RH = rotated ? W : H;
    const b = FISH_BOX;
    const box = rotated
      ? { x0: b.y0, x1: b.y1, y0: W - b.x1, y1: W - b.x0 }
      : b;
    const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
    const cover = Math.max(vw / RW, vh / RH);
    const fit = Math.min((vw - side * 2) / bw, (vh - top - bottom) / bh);
    scale = Math.min(cover, fit);
    tx = vw / 2 - (box.x0 + box.x1) / 2 * scale;
    ty = (top + vh - bottom) / 2 - (box.y0 + box.y1) / 2 * scale;
    // when the painting is larger than the screen, never show past its edges
    if (RW * scale >= vw) tx = Math.min(0, Math.max(vw - RW * scale, tx));
    if (RH * scale >= vh) ty = Math.min(0, Math.max(vh - RH * scale, ty));
    stage.style.setProperty("--s", scale);
    stage.style.setProperty("--tx", tx + "px");
    stage.style.setProperty("--ty", (rotated ? ty + W * scale : ty) + "px");
    stage.style.setProperty("--rot", rotated ? "-90deg" : "0deg");
    // the signature would read sideways when turned: swap in a copy without it
    // and show the signature upright in the corner instead
    const bgSrc = rotated ? "assets/background-nosig.webp" : "assets/background.webp";
    if (!bgImg.src.endsWith(bgSrc)) bgImg.src = bgSrc;
    signature.style.width = Math.round(112 * scale) + "px";
  }
  addEventListener("resize", layout);
  layout();

  // direction of a fish's heading as seen on screen
  const screenHeading = (f) => (rotated ? { x: f.hy, y: -f.hx } : { x: f.hx, y: f.hy });

  /* ---------- pixel-accurate hit testing on the fish ---------- */
  const A = 4; // alpha map downsample
  function buildAlpha(f) {
    const img = f.el.querySelector("img");
    const make = () => {
      try {
        const c = document.createElement("canvas");
        c.width = Math.ceil(f.w / A); c.height = Math.ceil(f.h / A);
        const g = c.getContext("2d", { willReadFrequently: true });
        g.drawImage(img, 0, 0, c.width, c.height);
        f.alpha = { w: c.width, data: g.getImageData(0, 0, c.width, c.height).data };
      } catch { f.alpha = "box"; } // e.g. opened from file:// - fall back to the box
    };
    img.complete ? make() : img.addEventListener("load", make, { once: true });
  }
  Object.values(fish).forEach(buildAlpha);

  function toPainting(e) {
    const u = (e.clientX - tx) / scale, v = (e.clientY - ty) / scale;
    return rotated ? { x: W - v, y: u } : { x: u, y: v };
  }
  function fishAt(p) {
    for (const f of hitOrder) {
      const lx = p.x - f.x, ly = p.y - f.y;
      if (lx < 0 || ly < 0 || lx >= f.w || ly >= f.h) continue;
      if (!f.alpha || f.alpha === "box") return f;
      // look in a small neighbourhood so thin fins and tails are easy to hit
      const ax = Math.floor(lx / A), ay = Math.floor(ly / A), aw = f.alpha.w;
      const ah = f.alpha.data.length / 4 / aw;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const x = ax + dx, y = ay + dy;
        if (x < 0 || y < 0 || x >= aw || y >= ah) continue;
        if (f.alpha.data[(y * aw + x) * 4 + 3] > 60) return f;
      }
    }
    return null;
  }

  /* ---------- highlight ---------- */
  let lit = null;
  function light(name) {
    if (lit === name) return;
    lit = name;
    fishEls.forEach((el) => el.classList.toggle("lit", el.dataset.fish === name));
    legendLinks.forEach((a) => a.classList.toggle("lit", a.dataset.for === name));
    stage.classList.toggle("has-lit", !!name);
  }

  let busy = false;
  pond.addEventListener("pointermove", (e) => {
    if (busy || e.pointerType === "touch") return;
    const p = toPainting(e);
    const f = fishAt(p);
    light(f ? f.name : null);
    if (finePointer) { cursor = p; setTargets(); kick(); }
    pond.style.cursor = f ? "pointer" : "";
  });
  pond.addEventListener("pointerleave", () => {
    if (busy) return;
    light(null);
    cursor = null; setTargets(); kick();
  });
  pond.addEventListener("click", (e) => {
    if (busy || e.target.closest(".legend")) return;
    e.preventDefault();
    const p = toPainting(e);
    const f = fishAt(p);
    if (f) location.hash = "#/" + f.name;
    else { ripple(p.x, p.y); startle(p); }
  });
  fishEls.forEach((el) => {
    el.addEventListener("focus", () => light(el.dataset.fish));
    el.addEventListener("blur", () => light(null));
  });
  legendLinks.forEach((a) => {
    a.addEventListener("pointerenter", () => light(a.dataset.for));
    a.addEventListener("pointerleave", () => light(null));
    a.addEventListener("focus", () => light(a.dataset.for));
    a.addEventListener("blur", () => light(null));
  });

  /* ---------- ripples ---------- */
  function ripple(x, y, size = 1) {
    if (reduceMotion) return;
    for (const cls of ["ripple", "ripple r2"]) {
      const r = document.createElement("span");
      r.className = cls;
      r.style.left = x + "px"; r.style.top = y + "px";
      r.style.scale = size;
      ripples.appendChild(r);
      r.addEventListener("animationend", () => r.remove());
    }
  }
  // now and then, a fish breaks the surface near its mouth, or a ring drifts by
  (function idle() {
    setTimeout(() => {
      if (body.dataset.view === "pond" && !busy && !document.hidden) {
        const all = Object.values(fish);
        const f = all[Math.floor(Math.random() * all.length)];
        const p = Math.random() < 0.6
          ? { x: f.x + f.w * (f.hx > 0 ? 0.97 : 0.05), y: f.y + f.h * 0.3 }
          : { x: 200 + Math.random() * 1500, y: 200 + Math.random() * 1000 };
        ripple(p.x + (Math.random() - .5) * 40, p.y + (Math.random() - .5) * 30, 0.6 + Math.random() * 0.5);
      }
      idle();
    }, 3800 + Math.random() * 3500);
  })();

  /* ---------- swimming ---------- */
  const swimAnims = new Map();
  function swimOff(f) {
    const d = 2600;
    f.el.classList.add("swimming");
    const sway = f.el.querySelector(".fish__sway");
    sway.style.animationDuration = "1.2s";
    const a = f.el.animate([
      { transform: "translate(0,0)", opacity: 1 },
      { transform: `translate(${-f.hx * 24}px, ${-f.hy * 24}px)`, opacity: 1, offset: 0.14 },
      { transform: `translate(${f.hx * d * 0.35}px, ${f.hy * d * 0.35}px)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${f.hx * d}px, ${f.hy * d}px) scale(.92)`, opacity: 0 },
    ], { duration: 1500, easing: "cubic-bezier(.45,0,.7,.55)", fill: "forwards" });
    swimAnims.set(f.name, a);
    // the others flinch away a little
    Object.values(fish).forEach((o) => {
      if (o === f) return;
      const dx = (o.x + o.w / 2) - (f.x + f.w / 2), dy = (o.y + o.h / 2) - (f.y + f.h / 2);
      const l = Math.hypot(dx, dy) || 1;
      o.el.animate([
        { transform: "translate(0,0)" },
        { transform: `translate(${dx / l * 18}px, ${dy / l * 18}px)`, offset: 0.3 },
        { transform: "translate(0,0)" },
      ], { duration: 1800, easing: "ease-out" });
    });
    ripple(f.x + f.w / 2, f.y + f.h / 2, 1.6);
    return a.finished;
  }
  function swimIn(f) {
    const a = swimAnims.get(f.name);
    if (a) a.cancel();
    swimAnims.delete(f.name);
    f.el.classList.remove("swimming");
    const sway = f.el.querySelector(".fish__sway");
    sway.style.animationDuration = "";
    if (reduceMotion) return;
    const d = 900;
    f.el.animate([
      { transform: `translate(${-f.hx * d}px, ${-f.hy * d}px)`, opacity: 0 },
      { opacity: 1, offset: 0.35 },
      { transform: "translate(0,0)", opacity: 1 },
    ], { duration: 1900, easing: "cubic-bezier(.2,.7,.25,1)" });
  }

  /* ---------- the fish notice you ----------
     A fish near the cursor turns its head a degree or two toward it and
     edges a few pixels closer. Clicking the water nearby makes it dart away
     a little, then settle back. Movement is a damped spring, so it eases in
     and out; nothing is 3D, it's all flat shifts and tiny turns. */
  const NOTICE_RADIUS = 520;   // painting px
  const LEAN = 14;             // furthest a fish edges toward you, painting px
  const TURN = 2.2;            // furthest it turns, degrees
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const motion = Object.values(fish).map((f) => {
    const cs = f.el.style;
    return {
      f, sway: f.el.querySelector(".fish__sway"),
      head: {
        x: f.x + f.w * parseFloat(cs.getPropertyValue("--px")) / 100,
        y: f.y + f.h * parseFloat(cs.getPropertyValue("--py")) / 100,
      },
      x: 0, y: 0, r: 0, vx: 0, vy: 0, vr: 0, tx: 0, ty: 0, tr: 0,
    };
  });
  let cursor = null, rafId = 0;

  function setTargets() {
    for (const m of motion) {
      m.tx = m.ty = m.tr = 0;
      if (!cursor) continue;
      const dx = cursor.x - m.head.x, dy = cursor.y - m.head.y;
      const d = Math.hypot(dx, dy);
      if (d > NOTICE_RADIUS || d < 1) continue;
      const pull = Math.sin((1 - d / NOTICE_RADIUS) * Math.PI / 2); // strongest close by
      m.tx = dx / d * LEAN * pull;
      m.ty = dy / d * LEAN * pull;
      // turn toward the cursor: sign of the angle between heading and cursor
      const cross = m.f.hx * dy - m.f.hy * dx, dot = m.f.hx * dx + m.f.hy * dy;
      const ang = Math.atan2(cross, dot); // -pi..pi
      m.tr = Math.max(-1, Math.min(1, ang / (Math.PI / 2))) * TURN * pull;
    }
  }
  function startle(p) {
    for (const m of motion) {
      const dx = m.head.x - p.x, dy = m.head.y - p.y, d = Math.hypot(dx, dy);
      if (d > 600 || d < 1) continue;
      const k = (1 - d / 600) * 9;
      m.vx += dx / d * k; m.vy += dy / d * k;
      m.vr += (Math.random() - .5) * k * .4;
    }
    kick();
  }
  function step() {
    let moving = false;
    for (const m of motion) {
      // damped spring toward the target
      m.vx = (m.vx + (m.tx - m.x) * 0.018) * 0.9;
      m.vy = (m.vy + (m.ty - m.y) * 0.018) * 0.9;
      m.vr = (m.vr + (m.tr - m.r) * 0.018) * 0.9;
      m.x += m.vx; m.y += m.vy; m.r += m.vr;
      if (Math.abs(m.vx) + Math.abs(m.vy) + Math.abs(m.vr) > 0.003 ||
          Math.abs(m.tx - m.x) + Math.abs(m.ty - m.y) > 0.05) moving = true;
      m.sway.style.translate = `${m.x.toFixed(2)}px ${m.y.toFixed(2)}px`;
      m.sway.style.rotate = `${m.r.toFixed(3)}deg`;
    }
    rafId = moving ? requestAnimationFrame(step) : 0;
  }
  function kick() { if (!rafId && !reduceMotion) rafId = requestAnimationFrame(step); }

  /* ---------- views ---------- */
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let current = null; // null = pond, else section name
  let leftBy = null;  // fish that swam off

  async function showSection(name, animate) {
    const f = fish[name];
    busy = true;
    cursor = null; setTargets(); kick();
    if (animate && current === null && !reduceMotion) {
      body.classList.add("leaving");
      light(name);
      leftBy = f;
      await Promise.race([swimOff(f), wait(700)]);
      const sh = screenHeading(f);
      pond.style.transform = `translate(${-sh.x * 6}vw, ${-sh.y * 6}vh) scale(1.03)`;
      pond.classList.add("away");
      await wait(450);
    } else {
      pond.classList.add("away");
      if (current !== null) { shore.classList.remove("shown"); await wait(350); }
    }

    sections.forEach((s) => (s.hidden = s.dataset.route !== name));
    const sec = sections.find((s) => s.dataset.route === name);
    const dir = screenHeading(f);
    sec.style.setProperty("--in", f.hx > 0 ? -1 : 1);
    shoreBg.style.setProperty("--bgpos", SECTION_BG[name] || "50% 50%");
    shoreBg.style.setProperty("--bgx", dir.x * 80 + "px");
    shoreBg.style.setProperty("--bgy", dir.y * 80 + "px");
    shore.hidden = false;
    shore.scrollTop = 0;
    shore.getBoundingClientRect(); // commit start state before transitioning
    shore.classList.add("shown");
    body.dataset.view = "section";
    body.classList.remove("leaving");
    light(null);
    current = name;
    const label = fish[name].el.getAttribute("aria-label");
    document.title = `${label} · ${SITE_TITLE}`;
    const h1 = sec.querySelector("h1");
    h1.tabIndex = -1; h1.focus({ preventScroll: true });
    busy = false;
  }

  async function showPond(animate) {
    if (current === null) return;
    busy = true;
    shore.classList.remove("shown");
    await wait(animate ? 450 : 0);
    shore.hidden = true;
    pond.style.transform = "";
    pond.classList.remove("away");
    body.dataset.view = "pond";
    if (leftBy) swimIn(leftBy);
    leftBy = null;
    current = null;
    document.title = SITE_TITLE;
    await wait(animate ? 600 : 0);
    busy = false;
  }

  function route(animate) {
    const name = location.hash.replace(/^#\/?/, "");
    if (fish[name]) showSection(name, animate);
    else showPond(animate);
  }
  addEventListener("hashchange", () => route(true));
  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && current !== null) location.hash = "#/";
  });
  route(false);
})();
