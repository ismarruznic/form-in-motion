/* FORM. IN MOTION. — interactions (Ismar Ruznic) */
(function () {
  var SCRIPT = document.currentScript;
  var BASE = window.FIM_ASSETS || (SCRIPT ? SCRIPT.src.replace(/[^/]*$/, '') + 'assets/' : 'assets/');
  var MV_SRC = 'https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js';
  var GSAP_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js';
  var ST_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var noHover = window.matchMedia('(hover: none)');

  document.documentElement.classList.add('fim-js');

  function load(src, module) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      if (module) s.type = 'module';
      s.src = src; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    var root = document.getElementById('fim');
    if (!root) return;

    var mvReady = window.customElements && customElements.get('model-viewer')
      ? Promise.resolve()
      : load(MV_SRC, true).then(function () { return customElements.whenDefined('model-viewer'); });
    var gsapReady = (window.gsap ? Promise.resolve() : load(GSAP_SRC))
      .then(function () { return window.ScrollTrigger ? null : load(ST_SRC); })
      .then(function () { gsap.registerPlugin(ScrollTrigger); });

    var models = {};
    root.querySelectorAll('.fim-model').forEach(function (wrap) {
      models[wrap.dataset.model] = { wrap: wrap, mv: wrap.querySelector('model-viewer') };
    });

    /* ---------- loading, progress & errors ---------- */
    mvReady.then(function () {
      function start(name) {
        var m = models[name];
        if (m.started) return;
        m.started = true;
        io.unobserve(m.wrap);
        m.mv.addEventListener('progress', function (ev) {
          m.wrap.style.setProperty('--p', ev.detail.totalProgress);
        });
        m.mv.addEventListener('load', function () {
          m.wrap.classList.add('is-loaded');
          onModelLoad(name, m.mv);
        });
        m.mv.addEventListener('error', function () { fail(m.wrap); });
        m.mv.src = BASE + name + '.glb';
      }
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) start(e.target.dataset.model); });
      }, { rootMargin: '150% 0px' });
      Object.keys(models).forEach(function (k) { io.observe(models[k].wrap); });
      // Warm the remaining models once the first view has settled
      setTimeout(function () { Object.keys(models).forEach(start); }, 3000);
    }).catch(function () {
      Object.keys(models).forEach(function (k) { fail(models[k].wrap); });
    });

    function fail(wrap) {
      wrap.classList.add('is-error');
      wrap.querySelector('.fim-loader span').textContent = 'This model could not be loaded. Please refresh to try again.';
    }

    function onModelLoad(name, mv) {
      if (name === 'watch') {
        mv.model.materials.forEach(function (mat) {
          if (/glass/i.test(mat.name)) {
            mat.setAlphaMode('BLEND');
            mat.pbrMetallicRoughness.setBaseColorFactor([0.9, 0.92, 0.95, 0.12]);
            mat.pbrMetallicRoughness.setRoughnessFactor(0.05);
          }
        });
      }
      if (name === "anatomy") {
        var tint = { muscles: [0.42, 0.09, 0.08], organs: [0.55, 0.26, 0.22], vessels: [0.40, 0.05, 0.07], skeleton: [0.86, 0.82, 0.72], skin: [0.85, 0.82, 0.76] };
        mv.model.materials.forEach(function (mat) { var c = tint[mat.name]; if (c) mat.pbrMetallicRoughness.setBaseColorFactor([c[0], c[1], c[2], 1]); });
        setLayer(currentLayer, true);
      }
    }

    /* ---------- 03 anatomy layers ---------- */
    var LAYERS = {
      all:      { skin: 0.10, muscles: 0.4, organs: 1, vessels: 1, skeleton: 1, note: 'Showing skeleton, muscles, organs and vessels.' },
      skeleton: { skin: 0.07, muscles: 0, organs: 0, vessels: 0, skeleton: 1, note: 'Skeleton isolated. Drag to study its proportions.' },
      muscles:  { skin: 0, muscles: 1, organs: 0, vessels: 0, skeleton: 0.16, note: 'Muscular system isolated over a faint skeleton.' }
    };
    var currentLayer = 'all';
    var layerState = {};
    var buttons = root.querySelectorAll('.fim-layers button');
    var note = root.querySelector('.fim-layer-note');

    function applyAlpha(mat, a) {
      var pbr = mat.pbrMetallicRoughness, c = pbr.baseColorFactor;
      if (a <= 0.001) { mat.setAlphaMode('MASK'); mat.setAlphaCutoff(0.5); }
      else if (a >= 0.999) mat.setAlphaMode('OPAQUE');
      else mat.setAlphaMode('BLEND');
      pbr.setBaseColorFactor([c[0], c[1], c[2], a]);
    }

    function setLayer(key, instant) {
      currentLayer = key;
      buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.layer === key)); });
      if (note) note.textContent = LAYERS[key].note;
      var mv = models.anatomy && models.anatomy.mv;
      if (!mv || !mv.model) return;
      mv.model.materials.forEach(function (mat) {
        var target = LAYERS[key][mat.name];
        if (target === undefined) return;
        var from = layerState[mat.name] === undefined ? 1 : layerState[mat.name];
        layerState[mat.name] = target;
        if (instant || reduce.matches || !window.gsap) { applyAlpha(mat, target); return; }
        var o = { a: from };
        if (from <= 0.001) mat.setAlphaMode('BLEND');
        gsap.to(o, { a: target, duration: 0.7, ease: 'power2.inOut', overwrite: true,
          onUpdate: function () { var c = mat.pbrMetallicRoughness.baseColorFactor; mat.setAlphaMode('BLEND'); mat.pbrMetallicRoughness.setBaseColorFactor([c[0], c[1], c[2], Math.max(o.a, 0.002)]); },
          onComplete: function () { applyAlpha(mat, target); } });
      });
    }
    buttons.forEach(function (b) {
      b.addEventListener('click', function () { setLayer(b.dataset.layer); });
    });

    /* ---------- 04 controller pointer tilt ---------- */
    (function () {
      var m = models.controller; if (!m) return;
      var section = document.getElementById('play');
      var hint = section.querySelector('.fim-hint__desk');
      var base = { t: 0, p: 70 }, target = { t: 0, p: 70 }, cur = { t: 0, p: 70 }, raf = null;
      if (noHover.matches || reduce.matches) {
        m.mv.setAttribute('camera-controls', '');
        if (hint) hint.textContent = 'Drag to rotate';
        return;
      }
      function tick() {
        cur.t += (target.t - cur.t) * 0.08;
        cur.p += (target.p - cur.p) * 0.08;
        m.mv.cameraOrbit = cur.t.toFixed(2) + 'deg ' + cur.p.toFixed(2) + 'deg 105%';
        if (Math.abs(target.t - cur.t) > 0.01 || Math.abs(target.p - cur.p) > 0.01) raf = requestAnimationFrame(tick);
        else raf = null;
      }
      function go() { if (!raf) raf = requestAnimationFrame(tick); }
      section.addEventListener('pointermove', function (e) {
        if (e.pointerType === 'touch') return;
        var r = m.wrap.getBoundingClientRect();
        var x = (e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2);
        var y = (e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2);
        x = Math.max(-1, Math.min(1, x)); y = Math.max(-1, Math.min(1, y));
        target.t = base.t - x * 32; target.p = base.p + y * 16; go();
      });
      section.addEventListener('pointerleave', function () { target.t = base.t; target.p = base.p; go(); });
    })();

    /* ---------- motion ---------- */
    gsapReady.then(function () {
      var mm = gsap.matchMedia();

      mm.add('(prefers-reduced-motion: no-preference)', function () {
        var ease = 'expo.out';
        // Hero entrance
        gsap.to('.fim-hero__title .fim-line > span', { yPercent: 0, y: 0, duration: 1.6, ease: ease, stagger: 0.12, delay: 0.15 });
        gsap.to('.fim-hero [data-reveal]', { opacity: 1, y: 0, duration: 1.4, ease: ease, stagger: 0.1, delay: 0.6 });

        // Section reveals: headline lines slide up, copy fades up, model slides in
        root.querySelectorAll('.fim-chapter, .fim-close').forEach(function (sec) {
          var trig = sec.querySelector('.fim-stage') || sec;
          var tl = gsap.timeline({ scrollTrigger: { trigger: trig, start: 'top 72%', once: true } });
          tl.to(sec.querySelectorAll('.fim-title .fim-line > span, .fim-close__title .fim-line > span'), { y: 0, yPercent: 0, duration: 1.4, ease: ease, stagger: 0.09 }, 0)
            .to(sec.querySelectorAll('[data-reveal="view"]'), { opacity: 1, x: 0, scale: 1, duration: 1.8, ease: ease }, 0.1)
            .to(sec.querySelectorAll('[data-reveal]:not([data-reveal="view"])'), { opacity: 1, y: 0, duration: 1.2, ease: ease, stagger: 0.08 }, 0.3);
        });

        // 01 — scroll-controlled orbit
        scrubOrbit('precision', models.watch, { t: [200, 42], p: [80, 68], r: [112, 92] }, false);
        // 03 — guided orbit (drag adds an offset on top of scroll)
        scrubOrbit('anatomy', models.anatomy, { t: [150, 330], p: [82, 76], r: [104, 94] }, true);
      });

      mm.add('(prefers-reduced-motion: reduce)', function () {
        gsap.set('#fim [data-reveal], #fim .fim-line > span', { clearProps: 'all', opacity: 1 });
      });

      function scrubOrbit(id, m, k, draggable) {
        if (!m) return;
        var sec = document.getElementById(id);
        var bar = sec.querySelector('.fim-progress i');
        var offset = 0, last = { t: k.t[0] };
        if (draggable) {
          var dragging = false;
          m.mv.addEventListener('pointerdown', function () { dragging = true; });
          window.addEventListener('pointerup', function () { dragging = false; });
          m.mv.addEventListener('camera-change', function (e) {
            if (!dragging || e.detail.source !== 'user-interaction') return;
            var o = m.mv.getCameraOrbit();
            offset = o.theta * 180 / Math.PI - last.t;
          });
        }
        ScrollTrigger.create({
          trigger: sec, start: 'top top', end: 'bottom bottom', scrub: 0.9,
          onUpdate: function (st) {
            var p = st.progress, e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
            var t = k.t[0] + (k.t[1] - k.t[0]) * e;
            var ph = k.p[0] + (k.p[1] - k.p[0]) * e;
            var r = k.r[0] + (k.r[1] - k.r[0]) * e;
            last.t = t;
            m.mv.cameraOrbit = (t + offset).toFixed(2) + 'deg ' + ph.toFixed(2) + 'deg ' + r.toFixed(1) + '%';
            m.mv.jumpCameraToGoal && !draggable && m.mv.jumpCameraToGoal();
            if (bar) bar.style.transform = 'scaleX(' + p + ')';
          }
        });
      }
    }).catch(function () {
      // GSAP unavailable: show everything statically
      root.querySelectorAll('[data-reveal], .fim-line > span').forEach(function (el) { el.style.opacity = 1; el.style.transform = 'none'; });
    });
  });
})();
