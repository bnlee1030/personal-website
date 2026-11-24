/* Swim: makes a fish swim like a fish while it travels.
   While a fish swims, its picture is redrawn with WebGL and bent by a wave
   that runs from head to tail along its backbone (small at the head, widest
   at the tail), while the pectoral fins row back and forth.
   Usage: const s = makeSwimmer(fishEl, spine, box, tailSweep); s.start(); s.set(freq, amp); s.stop();
   Returns null if WebGL isn't available; the fish then just glides. */
(() => {
  const MARGIN = 150; // room around the sprite for the tail to swing into (painting px)
  const FIELD_STEP = 4; // backbone map resolution (painting px)

  const VERT = `
    attribute vec2 a; varying vec2 v;
    void main() { v = vec2(a.x * .5 + .5, .5 - a.y * .5); gl_Position = vec4(a, 0., 1.); }`;
  const FRAG = `
    precision highp float;
    varying vec2 v;
    uniform sampler2D img, field;
    uniform vec2 size, off, imgSize;
    uniform float phase, finPhase, amp, len, tail;
    // how far the point that starts at q (canvas px) is moved
    vec2 disp(vec2 q) {
      vec4 f = texture2D(field, q / size);
      vec2 n = f.rg * 2. - 1.;       // backbone normal
      vec2 t = vec2(n.y, -n.x);      // backbone direction
      float s = f.b;                 // 0 at the head, 1 at the tail
      float d = f.a;                 // distance from the backbone
      // body wave: one wavelength along the body, travelling head -> tail,
      // plus an extra side-to-side sweep of the tail itself
      float wave = amp * len * .028 * (.05 + .95 * pow(s, 1.7)) * sin(6.2832 * s * .9 - phase);
      // the tail sweeps as one piece, a little behind the body wave
      float sweep = amp * len * tail * smoothstep(.5, 1., s) * sin(6.2832 * .8 - phase);
      float lat = wave + sweep;
      // fins: parts far from the backbone in the front half row to and fro
      float fin = amp * len * .014 * smoothstep(.36, .56, d) * (1. - smoothstep(.42, .66, s)) * sin(finPhase);
      return n * lat + t * fin;
    }
    void main() {
      // find the source point that lands here: solve q + disp(q) = p
      vec2 p = v * size, q = p;
      for (int i = 0; i < 5; i++) q = p - disp(q);
      vec2 uv = (q - off) / imgSize;
      if (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) { gl_FragColor = vec4(0.); return; }
      gl_FragColor = texture2D(img, uv);
    }`;

  function boxBlur(A, w, h, r) {
    const tmp = new Float32Array(A.length);
    for (let y = 0; y < h; y++) {           // rows
      let acc = 0, n = 0;
      for (let x = -r; x < w + r; x++) {
        if (x + r < w) { acc += A[y * w + x + r]; n++; }
        if (x - r - 1 >= 0) { acc -= A[y * w + x - r - 1]; n--; }
        if (x >= 0 && x < w) tmp[y * w + x] = acc / n;
      }
    }
    for (let x = 0; x < w; x++) {           // columns
      let acc = 0, n = 0;
      for (let y = -r; y < h + r; y++) {
        if (y + r < h) { acc += tmp[(y + r) * w + x]; n++; }
        if (y - r - 1 >= 0) { acc -= tmp[(y - r - 1) * w + x]; n--; }
        if (y >= 0 && y < h) A[y * w + x] = acc / n;
      }
    }
  }

  // For every point around the fish: nearest point on the backbone polyline
  // -> normal, how far along (head 0 .. tail 1), and distance.
  function buildField(box, spine) {
    const w = box.w + 2 * MARGIN, h = box.h + 2 * MARGIN;
    const fw = Math.ceil(w / FIELD_STEP), fh = Math.ceil(h / FIELD_STEP);
    const segs = [];
    let total = 0;
    for (let i = 1; i < spine.length; i++) {
      const [ax, ay] = spine[i - 1], [bx, by] = spine[i];
      const l = Math.hypot(bx - ax, by - ay);
      segs.push({ ax, ay, dx: (bx - ax) / l, dy: (by - ay) / l, l, start: total });
      total += l;
    }
    const N = fw * fh;
    const NX = new Float32Array(N), NY = new Float32Array(N), S = new Float32Array(N), D = new Float32Array(N);
    const maxD = total * 0.25;
    for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) {
      const px = box.x - MARGIN + (i + .5) * FIELD_STEP, py = box.y - MARGIN + (j + .5) * FIELD_STEP;
      let best = Infinity, bs = 0, bnx = 0, bny = 0;
      for (const g of segs) {
        const along = Math.max(0, Math.min(g.l, (px - g.ax) * g.dx + (py - g.ay) * g.dy));
        const qx = g.ax + g.dx * along, qy = g.ay + g.dy * along;
        const d2 = (px - qx) ** 2 + (py - qy) ** 2;
        if (d2 < best) { best = d2; bs = (g.start + along) / total; bnx = -g.dy; bny = g.dx; }
      }
      const k = j * fw + i;
      NX[k] = bnx; NY[k] = bny; S[k] = bs; D[k] = Math.min(Math.sqrt(best) / maxD, 1);
    }
    // Smooth the map: where two parts of the backbone are equally near
    // (inside a curve, around a joint) the nearest point jumps, which would
    // tear the picture once it bends. Blurring turns jumps into gentle turns.
    for (const A of [NX, NY, S]) for (let pass = 0; pass < 3; pass++) boxBlur(A, fw, fh, 5);
    const data = new Uint8Array(N * 4);
    for (let k = 0; k < N; k++) {
      const l = Math.hypot(NX[k], NY[k]) || 1;
      data[k * 4] = (NX[k] / l * .5 + .5) * 255;
      data[k * 4 + 1] = (NY[k] / l * .5 + .5) * 255;
      data[k * 4 + 2] = S[k] * 255;
      data[k * 4 + 3] = D[k] * 255;
    }
    return { data, fw, fh, total };
  }

  window.makeSwimmer = function (fishEl, spine, box, tail = 0.03) {
    const img = fishEl.querySelector("img");
    const holder = fishEl.querySelector(".fish__sway");
    const canvas = document.createElement("canvas");
    canvas.className = "swimmer";
    canvas.width = box.w + 2 * MARGIN; canvas.height = box.h + 2 * MARGIN;
    canvas.style.cssText = `left:${-MARGIN}px;top:${-MARGIN}px;width:${canvas.width}px;height:${canvas.height}px`;
    const gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true });
    if (!gl) return null;
    let prog, U = {};
    try {
      const sh = (type, src) => {
        const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
      };
      prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog); gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, "a");
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      for (const n of ["img", "field", "size", "off", "imgSize", "phase", "finPhase", "amp", "len", "tail"]) U[n] = gl.getUniformLocation(prog, n);

      const tex = (unit, setup) => {
        const t = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
        for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        setup();
      };
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      tex(0, () => gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)); // throws on file://
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      const field = buildField(box, spine);
      tex(1, () => gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, field.fw, field.fh, 0, gl.RGBA, gl.UNSIGNED_BYTE, field.data));
      gl.uniform1i(U.img, 0); gl.uniform1i(U.field, 1);
      gl.uniform2f(U.size, canvas.width, canvas.height);
      gl.uniform2f(U.off, MARGIN, MARGIN);
      gl.uniform2f(U.imgSize, box.w, box.h);
      gl.uniform1f(U.len, field.total);
      gl.uniform1f(U.tail, tail);
    } catch (e) {
      return null;
    }

    let raf = 0, last = 0, phase = 0, finPhase = 0, freq = 1, amp = 1;
    const draw = () => {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(U.phase, phase); gl.uniform1f(U.finPhase, finPhase); gl.uniform1f(U.amp, amp);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    const tick = (now) => {
      const dt = Math.min(.05, (now - (last || now)) / 1000); last = now;
      phase += dt * freq * 6.2832;
      finPhase += dt * freq * 0.8 * 6.2832;
      draw();
      raf = requestAnimationFrame(tick);
    };
    return {
      set(f, a) { freq = f; amp = a; },
      start() {
        if (!canvas.isConnected) holder.appendChild(canvas);
        fishEl.classList.add("gl-swim");
        draw();
        if (!raf) { last = 0; raf = requestAnimationFrame(tick); }
      },
      pause() { cancelAnimationFrame(raf); raf = 0; },
      stop() {
        cancelAnimationFrame(raf); raf = 0;
        fishEl.classList.remove("gl-swim");
        phase = finPhase = 0;
      },
    };
  };
})();
