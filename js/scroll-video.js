/**
 * KAMBO FINE JEWELRY -- Scroll-Driven Frame Animation
 * Inspirado en Apple: el video se reproduce cuadro a cuadro al hacer scroll.
 * Si no hay frames extraidos, scrubbing del video por scroll (sin autoplay).
 */
(function () {
  'use strict';

  const cfg = typeof FRAME_CONFIG !== 'undefined' ? FRAME_CONFIG : { count: 0 };
  const section = document.getElementById('scroll-video-section');
  const stickyEl = document.getElementById('scroll-sticky');
  const canvas = document.getElementById('scroll-canvas');
  const videoFallback = document.getElementById('scroll-video-fallback');
  const loaderEl = document.getElementById('scroll-loader');
  const loaderBar = document.getElementById('scroll-loader-bar');
  const loaderPct = document.getElementById('scroll-loader-pct');
  const overlays = document.querySelectorAll('.scroll-overlay');
  const indicator = document.querySelector('.scroll-video__indicator');

  if (!section || !stickyEl) return;

  const USE_FRAMES = cfg.count > 0;
  const dpr = window.devicePixelRatio || 1;

  // Overlay text management
  function updateOverlays(fraction) {
    overlays.forEach(function (el) {
      var showAt = parseFloat(el.dataset.showAt || 0);
      var hideAt = parseFloat(el.dataset.hideAt || 1);
      var active = fraction >= showAt && fraction < hideAt;
      el.classList.toggle('is-active', active);
    });
    // Hide scroll indicator once user starts scrolling
    if (indicator) {
      indicator.style.opacity = fraction < 0.04 ? '1' : '0';
    }
  }

  // Compute scroll fraction [0..1] for the section
  function getScrollFrac() {
    var rect = section.getBoundingClientRect();
    var total = section.offsetHeight - window.innerHeight;
    return Math.max(0, Math.min(1, -rect.top / total));
  }

  // ── FALLBACK: scroll-driven video scrub (no autoplay) ───────
  if (!USE_FRAMES) {
    if (canvas) canvas.style.display = 'none';
    if (loaderEl) loaderEl.style.display = 'none';
    if (videoFallback) {
      videoFallback.style.display = 'block';
      videoFallback.pause();
      videoFallback.currentTime = 0;
    }

    var dur = 0;

    function scrubFallback() {
      var frac = getScrollFrac();
      if (videoFallback && dur > 0) {
        videoFallback.currentTime = frac * dur;
      }
      updateOverlays(frac);
    }

    if (videoFallback) {
      if (videoFallback.readyState >= 1) {
        dur = videoFallback.duration;
        scrubFallback();
      } else {
        videoFallback.addEventListener('loadedmetadata', function () {
          dur = videoFallback.duration;
          scrubFallback();
        }, { once: true });
      }
    }

    // Initial state (first overlay visible on load)
    updateOverlays(0);
    window.addEventListener('scroll', scrubFallback, { passive: true });
    return;
  }

  // ── FRAME MODE ───────────────────────────────────────────────
  if (videoFallback) videoFallback.style.display = 'none';

  var ctx = canvas.getContext('2d');
  var frameCount = cfg.count;
  var frames = new Array(frameCount).fill(null);
  var loadedCount = 0;
  var currentFrameIndex = -1;
  var rafPending = false;

  // Size canvas to COVER the viewport (object-fit: cover equivalent — no black bars on any device)
  function resizeCanvas() {
    var aspect = cfg.width / cfg.height;
    var vw = window.innerWidth;
    var vh = window.innerHeight;

    var cw, ch;
    // Cover: scale so canvas fills the viewport in both axes (one axis may overflow and be centered)
    if (vw / vh > aspect) {
      // Viewport wider than video → fit width, canvas taller than viewport
      cw = vw;
      ch = vw / aspect;
    } else {
      // Viewport taller than video (portrait mobile) → fit height, canvas wider than viewport
      ch = vh;
      cw = vh * aspect;
    }

    canvas.style.width  = cw + 'px';
    canvas.style.height = ch + 'px';
    // Center the canvas (negative offset when canvas overflows viewport)
    canvas.style.left   = ((vw - cw) / 2) + 'px';
    canvas.style.top    = ((vh - ch) / 2) + 'px';

    canvas.width  = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    ctx.scale(dpr, dpr);

    drawFrame(currentFrameIndex >= 0 ? currentFrameIndex : 0);
  }

  // Draw a single frame
  function drawFrame(index) {
    var img = frames[index];
    if (!img || !img.complete || img.naturalWidth === 0) return;
    var w = canvas.width / dpr;
    var h = canvas.height / dpr;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    currentFrameIndex = index;
  }

  // Render on scroll — renders as soon as at least the target frame is loaded
  function onScroll() {
    if (!rafPending) {
      rafPending = true;
      requestAnimationFrame(function () {
        rafPending = false;
        var frac = getScrollFrac();
        var idx  = Math.min(frameCount - 1, Math.floor(frac * frameCount));
        // Find the nearest loaded frame (target or closest earlier frame)
        var renderIdx = idx;
        while (renderIdx > 0 && (!frames[renderIdx] || !frames[renderIdx].complete || frames[renderIdx].naturalWidth === 0)) {
          renderIdx--;
        }
        if (renderIdx !== currentFrameIndex) drawFrame(renderIdx);
        updateOverlays(frac);
      });
    }
  }

  // Pad number to 4 digits
  function pad4(n) {
    return String(n + 1).padStart(4, '0');
  }

  // Preload all frames
  function preload() {
    for (var i = 0; i < frameCount; i++) {
      (function (idx) {
        var img = new Image();
        img.onload = img.onerror = function () {
          loadedCount++;
          var pct = Math.round((loadedCount / frameCount) * 100);
          if (loaderBar) loaderBar.style.width = pct + '%';
          if (loaderPct) loaderPct.textContent = pct + '%';

          // Show canvas and enable scroll after first ~10% of frames loaded
          if (loadedCount === Math.ceil(frameCount * 0.1)) {
            canvas.style.opacity = '1';
            resizeCanvas();
            onScroll();
          }

          if (loadedCount === frameCount) {
            if (loaderEl) {
              loaderEl.style.opacity = '0';
              setTimeout(function () { loaderEl.style.display = 'none'; }, 600);
            }
            onScroll(); // Re-render with accurate frame after all loaded
          }
        };
        img.src = cfg.folder + cfg.prefix + pad4(idx) + cfg.extension;
        frames[idx] = img;
      })(i);
    }
  }

  // Init
  canvas.style.opacity = '0';
  canvas.style.transition = 'opacity 0.6s ease';
  updateOverlays(0);

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', resizeCanvas, { passive: true });

  preload();
})();
