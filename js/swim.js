/* Swim: makes a fish swim like a fish while it travels.
   While a fish swims, its picture is redrawn with WebGL and bent by a wave
   that runs from head to tail along its backbone (small at the head, widest
   at the tail), while the pectoral fins row back and forth.
   Usage: const s = makeSwimmer(fishEl, spine, box); s.start(); s.set(freq, amp); s.stop();
   Returns null if WebGL isn't available; the fish then just glides. */
(() => {
  const MARGIN = 70; // room around the sprite for the tail to swing into (painting px)
  const FIELD_STEP = 4; // backbone map resolution (painting px)

  const VERT = `
    attribute vec2 a; varying vec2 v;
    void main() { v = vec2(a.x * .5 + .5, .5 - a.y * .5); gl_Position = vec4(a, 0., 1.); }`;
  const FRAG = `
    precision mediump float;
    varying vec2 v;
    uniform sampler2D img, field;
    uniform vec2 size, off, imgSize;
    uniform float phase, finPhase, amp, len;
    void main() {
      vec4 f = texture2D(field, v);
      vec2 n = f.rg * 2. - 1.;       // backbone normal
      vec2 t = vec2(n.y, -n.x);      // backbone direction
      float s = f.b;                 // 0 at the head, 1 at the tail
      float d = f.a;                 // distance from the backbone
      // body wave: one wavelength along the body, travelling head -> tail
      float a = amp * len * .032 * (.06 + .94 * pow(s, 1.7));
      float lat = a * sin(6.2832 * s * .9 - phase);
      // fins: parts far from the backbone in the front half row to and fro
      float fin = amp * len * .014 * smoothstep(.36, .56, d) * (1. - smoothstep(.42, .66, s)) * sin(finPhase);
      vec2 p = v * size - n * lat - t * fin;
      vec2 uv = (p - off) / imgSize;
      if (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) { gl_FragColor = vec4(0.); return; }
      gl_FragColor = texture2D(img, uv);
    }`;

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
    const data = new Uint8Array(fw * fh * 4);
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
      const k = (j * fw + i) * 4;
      data[k] = (bnx * .5 + .5) * 255;
      data[k + 1] = (bny * .5 + .5) * 255;
      data[k + 2] = bs * 255;
      data[k + 3] = Math.min(Math.sqrt(best) / maxD, 1) * 255;
    }
    return { data, fw, fh, total };
  }

  window.makeSwimmer = function (fishEl, spine, box) {
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
      for (const n of ["img", "field", "size", "off", "imgSize", "phase", "finPhase", "amp", "len"]) U[n] = gl.getUniformLocation(prog, n);

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
