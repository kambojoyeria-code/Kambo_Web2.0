/**
 * KAMBO — Emerald 3D Gem
 * Realistic faceted emerald with caustic sparkling, spectral fire,
 * inner glow layers and physically-based material.
 */
(function () {
  'use strict';

  var canvas = document.getElementById('emerald-canvas');
  if (!canvas) return;

  function loadScript(src, cb) {
    var s = document.createElement('script');
    s.src = src;
    s.onload = cb;
    s.onerror = function () { console.warn('[Emerald] Three.js failed.'); };
    document.head.appendChild(s);
  }

  loadScript(
    'https://cdn.jsdelivr.net/npm/three@0.148.0/build/three.min.js',
    initScene
  );

  /* ══════════════════════════════════════════
     Build a proper gem-cut BufferGeometry.
     Profile:
       • Table  : flat hexagonal top cap
       • Crown  : 8 trapezoidal facets angled outward
       • Girdle : thin equatorial ring of triangles
       • Pavilion: 8 triangular facets narrowing to culet
       • Culet  : tiny bottom point
     All faces non-indexed → hard normals → flat shading.
  ══════════════════════════════════════════ */
  function buildGemGeometry() {
    var THREE = window.THREE;

    var positions = [];
    var N = 8;           // facet count (octagonal brilliant)
    var tableR   = 0.55; // table radius (top flat face)
    var crownR   = 1.00; // crown outer radius at girdle
    var tableY   = 0.55; // table height
    var girdleY  = 0.0;  // girdle (equator)
    var culetY   = -1.20;// culet depth

    // Helper: push a triangle (3 × vec3)
    function tri(ax,ay,az, bx,by,bz, cx,cy,cz) {
      positions.push(ax,ay,az, bx,by,bz, cx,cy,cz);
    }

    for (var i = 0; i < N; i++) {
      var a0 = (i / N)       * Math.PI * 2;
      var a1 = ((i + 1) / N) * Math.PI * 2;

      // Table cap (top face, N triangles fan from centre)
      var tx0 = Math.cos(a0) * tableR, tz0 = Math.sin(a0) * tableR;
      var tx1 = Math.cos(a1) * tableR, tz1 = Math.sin(a1) * tableR;
      tri(0, tableY, 0,  tx0, tableY, tz0,  tx1, tableY, tz1);

      // Crown facet (trapezoid = 2 triangles)
      var cx0 = Math.cos(a0) * crownR, cz0 = Math.sin(a0) * crownR;
      var cx1 = Math.cos(a1) * crownR, cz1 = Math.sin(a1) * crownR;
      // Lower crown triangle
      tri(cx0, girdleY, cz0,  tx0, tableY, tz0,  tx1, tableY, tz1);
      tri(cx0, girdleY, cz0,  tx1, tableY, tz1,  cx1, girdleY, cz1);

      // Upper star facet (small triangles between table & crown)
      var smr = 0.77; // intermediate radius
      var amid = (a0 + a1) / 2;
      var smx = Math.cos(amid) * smr, smz = Math.sin(amid) * smr;
      var smy = tableY * 0.62 + girdleY * 0.38;
      tri(tx0, tableY, tz0,  smx, smy, smz,  tx1, tableY, tz1);
      tri(cx0, girdleY, cz0,  smx, smy, smz,  tx0, tableY, tz0);
      tri(cx1, girdleY, cz1,  tx1, tableY, tz1,  smx, smy, smz);

      // Pavilion facet (triangle: girdle edge → culet)
      // Main pavilion facets (N of them)
      var pmid = (a0 + a1) / 2;
      var pr   = crownR * 0.82;
      var px   = Math.cos(pmid) * pr, pz = Math.sin(pmid) * pr;
      var pavilionMidY = girdleY - 0.35;

      tri(cx0, girdleY, cz0,  0, culetY, 0,  px, pavilionMidY, pz);
      tri(cx1, girdleY, cz1,  px, pavilionMidY, pz,  0, culetY, 0);

      // Lower pavilion star facets
      tri(cx0, girdleY, cz0,  cx1, girdleY, cz1,  px, pavilionMidY, pz);
    }

    var buf = new THREE.BufferGeometry();
    buf.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3)
    );
    buf.computeVertexNormals();
    return buf;
  }

  /* ══════════════════════════════════════════
     Main scene
  ══════════════════════════════════════════ */
  function initScene() {
    var THREE = window.THREE;
    if (!THREE) return;

    function cw() { return canvas.clientWidth  || canvas.offsetWidth  || 400; }
    function ch() { return canvas.clientHeight || canvas.offsetHeight || 400; }

    /* ── Scene / camera ────────────────────────────── */
    var scene  = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(38, cw() / ch(), 0.1, 100);
    camera.position.set(0, 0.3, 5.5);
    camera.lookAt(0, 0, 0);

    /* ── Renderer ──────────────────────────────────── */
    /* ── Renderer ──────────────────────────────────── */
    var renderer = new THREE.WebGLRenderer({
      canvas:     canvas,
      alpha:      true,
      antialias:  true,
      powerPreference: 'low-power', // Sigue siendo performante para este uso
      precision: 'mediump'         // Suficiente para una joya de fondo
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(cw(), ch());
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = false;
    renderer.toneMapping        = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.4;

    /* ── Gem geometry ──────────────────────────────── */
    var gemGeo = buildGemGeometry();

    /* ── Main gem material (physical, high-fidelity) ── */
    var gemMat = new THREE.MeshPhysicalMaterial({
      color:              0x0b5c25,   // deep emerald forest green
      emissive:           0x01180a,
      emissiveIntensity:  0.5,
      roughness:          0.02,       // polished — like a real cut gem
      metalness:          0.0,
      transmission:       0.78,       // high transparency (emerald is translucent)
      ior:                1.583,      // real emerald refractive index
      thickness:          2.2,
      clearcoat:          1.0,
      clearcoatRoughness: 0.02,
      reflectivity:       0.95,
      flatShading:        true,       // hard facets — critical for gem look
      transparent:        true,
      opacity:            0.97,
      side:               THREE.DoubleSide
    });

    /* ── Gem Group (for combined rotation/parallax) ── */
    var gemGroup = new THREE.Group();
    scene.add(gemGroup);

    var gem = new THREE.Mesh(gemGeo, gemMat);
    gem.rotation.y = Math.PI / 8;    // nice starting angle
    gemGroup.add(gem);

    /* ── Backface shell — deep refraction depth ──── */
    var shellGeo = buildGemGeometry();
    var shellMat = new THREE.MeshPhysicalMaterial({
      color:              0x062e12,
      emissive:           0x000000,
      roughness:          0.0,
      metalness:          0.0,
      transmission:       0.3,
      ior:                1.583,
      flatShading:        true,
      transparent:        true,
      opacity:            0.35,
      side:               THREE.BackSide
    });
    var shell = new THREE.Mesh(shellGeo, shellMat);
    shell.scale.setScalar(1.015);    // fractionally larger to peek through facets
    gemGroup.add(shell);

    /* ── Cream edge wireframe (Brand matched) ────── */
    var edgeGeo = new THREE.EdgesGeometry(gemGeo);
    var edgeMat = new THREE.LineBasicMaterial({
      color:       0xF5F0E8, // Soft cream from the brand palette
      transparent: true,
      opacity:     0.45
    });
    var edges = new THREE.LineSegments(edgeGeo, edgeMat);
    gemGroup.add(edges);

    /* ── Inner glow core ─────────────────────────── */
    var coreGeo = new THREE.SphereGeometry(0.28, 16, 16);
    var coreMat = new THREE.MeshBasicMaterial({
      color:       0x00ff66,
      transparent: true,
      opacity:     0.55,
      blending:    THREE.AdditiveBlending,
      depthWrite:  false
    });
    var core = new THREE.Mesh(coreGeo, coreMat);
    core.position.y = -0.1;
    gemGroup.add(core);

    /* ── Soft glow halo behind gem (circular gradient — no square edges) ── */
    var haloCanvas2D = document.createElement('canvas');
    haloCanvas2D.width  = 256;
    haloCanvas2D.height = 256;
    var ctx2d = haloCanvas2D.getContext('2d');
    var radGrad = ctx2d.createRadialGradient(128, 128, 0, 128, 128, 128);
    radGrad.addColorStop(0.00, 'rgba(0,190,80,0.75)');
    radGrad.addColorStop(0.38, 'rgba(0,160,60,0.32)');
    radGrad.addColorStop(0.70, 'rgba(0,100,40,0.08)');
    radGrad.addColorStop(1.00, 'rgba(0,0,0,0)');
    ctx2d.fillStyle = radGrad;
    ctx2d.fillRect(0, 0, 256, 256);
    var haloTex = new THREE.CanvasTexture(haloCanvas2D);

    var haloGeo = new THREE.PlaneGeometry(4.6, 4.6);
    var haloMat = new THREE.MeshBasicMaterial({
      map:        haloTex,
      transparent: true,
      blending:   THREE.AdditiveBlending,
      depthWrite: false,
      side:       THREE.DoubleSide
    });
    var halo = new THREE.Mesh(haloGeo, haloMat);
    halo.position.z = -0.8;
    scene.add(halo);

    /* ── Lights ──────────────────────────────────── */

    // Soft ambient — base visibility
    var ambient = new THREE.AmbientLight(0xffffff, 0.35);
    scene.add(ambient);

    // Key light — bright white from above-front
    var keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
    keyLight.position.set(1.5, 3.0, 3.0);
    scene.add(keyLight);

    // Orbiting colored lights for caustic fire
    var lightDefs = [
      // Emerald green  — main facet illumination
      { color: 0x22ff77, intensity: 7.0, radius: 2.4, speed:  0.70, oy:  0.9, oz: 1.8, phase: 0.00 },
      // Gold           — warm fire from side
      { color: 0xffcc00, intensity: 5.5, radius: 2.0, speed: -0.55, oy: -0.5, oz: 1.5, phase: 1.57 },
      // Ice blue        — spectral dispersion
      { color: 0x55ccff, intensity: 4.5, radius: 2.8, speed:  1.10, oy:  0.3, oz: 2.0, phase: 3.14 },
      // Deep violet    — secondary dispersion
      { color: 0x9955ff, intensity: 3.0, radius: 2.2, speed: -0.90, oy: -0.3, oz: 1.6, phase: 4.71 },
      // Warm white     — fill from below
      { color: 0xfff0cc, intensity: 2.8, radius: 3.2, speed:  0.40, oy: -1.2, oz: 1.0, phase: 0.80 }
    ];

    var orbitLights = lightDefs.map(function (d) {
      var pl = new THREE.PointLight(d.color, d.intensity, 10);
      scene.add(pl);
      return Object.assign({ light: pl, angle: d.phase }, d);
    });

    // Sparkle light — random caustic flashes
    var sparkle = new THREE.PointLight(0xffffff, 0, 4);
    sparkle.position.set(0, 1, 1);
    scene.add(sparkle);

    /* ── Mouse parallax ──────────────────────────── */
    /* ── Mouse parallax (Buffered for smoothness) ── */
    var mx = 0, my = 0;
    var tmx = 0, tmy = 0;
    var raycaster = new THREE.Raycaster();
    var mouse2D = new THREE.Vector2();

    function updateMouse(x, y) {
      var r = canvas.getBoundingClientRect();
      tmx =  Math.max(-1.5, Math.min(1.5, ((x - r.left) / r.width  - 0.5) * 2));
      tmy = -Math.max(-1.5, Math.min(1.5, ((y - r.top)  / r.height - 0.5) * 2));
      mouse2D.x = ((x - r.left) / r.width) * 2 - 1;
      mouse2D.y = -((y - r.top) / r.height) * 2 + 1;
    }

    /* ── Burst Effect Logic ── */
    var burstProgress = 0; // 0 to 1
    function triggerBurst() {
      if (burstProgress > 0.1) return; // Debounce
      burstProgress = 1.0;
      // Bonus: add haptic if available
      if (window.navigator && window.navigator.vibrate) window.navigator.vibrate(15);
    }

    function checkClick() {
      raycaster.setFromCamera(mouse2D, camera);
      var intersects = raycaster.intersectObject(gem, false);
      if (intersects.length > 0) {
        triggerBurst();
      }
    }

    document.addEventListener('mousemove', function (e) {
      updateMouse(e.clientX, e.clientY);
    }, { passive: true });

    document.addEventListener('mousedown', checkClick);

    document.addEventListener('touchstart', function (e) {
      var t = e.touches[0];
      updateMouse(t.clientX, t.clientY);
      // Wait a frame for mouse2D to update
      requestAnimationFrame(checkClick);
    }, { passive: true });

    document.addEventListener('touchmove', function (e) {
      var t = e.touches[0];
      updateMouse(t.clientX, t.clientY);
    }, { passive: true });

    /* ── Resize ──────────────────────────────────── */
    window.addEventListener('resize', function () {
      var w = cw(), h = ch();
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }, { passive: true });

    /* ── Visibility ──────────────────────────────── */
    /* ── Visibility (Only animate when in viewport) ── */
    var isVisible = false;
    var observer = new IntersectionObserver(function (entries) {
      isVisible = entries[0].isIntersecting;
      if (isVisible) {
        lastTime = performance.now();
        renderer.setAnimationLoop(animate);
      } else {
        renderer.setAnimationLoop(null);
      }
    }, { threshold: 0.05 });
    observer.observe(canvas);

    setTimeout(function () { canvas.classList.add('loaded'); }, 150);

    /* ── Sparkle state ───────────────────────────── */
    var sparkCooldown   = 0;
    var sparkFade       = 0;  // active when > 0
    var sparkIntensity  = 0;

    /* ── Animation Loop ── */
    var t          = 0;
    var lastTime   = performance.now();
    var lastRender = 0;
    var FRAME_MS   = 1000 / 45; // Subimos a 45fps para mayor fluidez sin sacrificar mucha batería

    function animate(now) {
      // Skip frame if we haven't hit the budget yet (Throttle GPU)
      if (now - lastRender < FRAME_MS) return;
      lastRender = now;

      var dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      t += dt;

      /* ── Input smoothing ── */
      mx += (tmx - mx) * 0.08;
      my += (tmy - my) * 0.08;

      /* ── Gem interactivity: Parallax Tilt + Rotation ── */
      // Mouse Parallax Intensity (how much it leans)
      var targetTiltY = mx * 1.25; // Significant horizontal tilt
      var targetTiltX = my * 0.70; // Significant vertical tilt

      // Vertical Limits (Clamp) - requested by user
      var vLimit = 0.55; // ~31 degrees max up/down
      var clampedTiltX = Math.max(-vLimit, Math.min(vLimit, targetTiltX));

      // Smoothing (lerp)
      var lerp = 0.065; 

      // Apply tilt to the group (parallax)
      gemGroup.rotation.y += (targetTiltY - gemGroup.rotation.y) * lerp;
      gemGroup.rotation.x += (clampedTiltX - gemGroup.rotation.x) * lerp;

      // Inner constant spin on the gem itself for extra "life"
      gem.rotation.y += 0.006;
      gem.rotation.z += 0.0012;
      
      // Update other objects to match gem's internal spin
      shell.rotation.copy(gem.rotation);
      edges.rotation.copy(gem.rotation);

      /* ── Gentle float + Mouse position shift ── */
      var fy = Math.sin(t * 0.6) * 0.1;
      
      // The group floats and also moves slightly with mouse for depth sensation
      gemGroup.position.x = mx * 0.15;
      gemGroup.position.y = fy + (my * 0.08); 
      
      halo.position.y  = fy * 0.3;

      /* ── Inner core pulsing glow ── */
      coreMat.opacity = 0.50 + Math.sin(t * 1.8) * 0.18;

      /* ── Emissive pulse ── */
      gemMat.emissiveIntensity = 0.45 + Math.sin(t * 1.4) * 0.18;

      /* ── Orbit lights ── */
      orbitLights.forEach(function (ol) {
        ol.angle += (ol.speed + (burstProgress * 0.35)) * dt;
        ol.light.position.set(
          Math.cos(ol.angle) * ol.radius,
          ol.oy + Math.sin(t * 0.55 + ol.phase) * 0.5,
          ol.oz + Math.sin(ol.angle * 0.7) * 0.4
        );
        // Base intensity + pulse + Minor Burst flash
        ol.light.intensity = ol.intensity * (0.85 + Math.sin(t * (2 + ol.speed) + ol.phase) * 0.15) + (burstProgress * 6.5);
      });

      /* ── Sparkle / caustic flashes ── */
      sparkCooldown -= dt;
      if (sparkFade > 0) {
        sparkFade -= dt * 4.5;
        sparkle.intensity = sparkIntensity * Math.max(0, sparkFade);
        if (sparkFade <= 0) sparkle.intensity = 0;
      }
      // Trigger normal or burst sparkles (Reduced burst rate)
      if ((sparkCooldown <= 0 || (burstProgress > 0.5 && Math.random() < 0.1)) && sparkFade <= 0) {
        sparkCooldown  = 0.22 + Math.random() * 0.55;
        sparkFade      = 1.0;
        sparkIntensity = (8 + Math.random() * 14) * (1 + burstProgress * 1.5);

        var theta = Math.random() * Math.PI * 2;
        var phi   = Math.random() * Math.PI;
        var sr    = 1.05 + Math.random() * 0.3;
        sparkle.position.set(
          sr * Math.sin(phi) * Math.cos(theta),
          sr * Math.cos(phi) * 0.8,
          sr * Math.sin(phi) * Math.sin(theta)
        );
        var hues = [0xffffff, 0xffee88, 0x88ffff, 0x88ffcc, 0xffeebb];
        sparkle.color.setHex(hues[Math.floor(Math.random() * hues.length)]);
      }

      /* ── Burst Animation Handling ── */
      if (burstProgress > 0) {
        burstProgress -= dt * 1.1; // Slightly faster decay
        if (burstProgress < 0) burstProgress = 0;

        // 1. Subtle scale pulse
        var s = 1.0 + Math.sin(burstProgress * Math.PI) * 0.12;
        gemGroup.scale.set(s, s, s);

        // 2. Extra fast rotation spin
        gem.rotation.y += burstProgress * 0.08;
        gemGroup.rotation.z += burstProgress * 0.02;

        // 3. Subtle intensity flash (Emissive + Core)
        gemMat.emissiveIntensity += burstProgress * 0.7;
        coreMat.opacity = Math.min(0.8, coreMat.opacity + burstProgress * 0.5);
      }

      renderer.render(scene, camera);
    }

    animate(performance.now());

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        renderer.setAnimationLoop(null);
      } else if (isVisible) {
        lastTime = performance.now();
        renderer.setAnimationLoop(animate);
      }
    });
  }
}());
