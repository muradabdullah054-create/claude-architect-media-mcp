// lib/floor3d.js — State-driven Three.js r128 scene module for Elfarida Reel
(function (global) {
  'use strict';

  function mulberry32(a) {
    return function () {
      var t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function lerp(a, b, t) {
    return a + (b - a) * clamp(t, 0, 1);
  }

  function smoothstep(edge0, edge1, x) {
    var t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function createFloorScene(canvas, width, height) {
    var renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true
    });
    renderer.setSize(width, height, false);
    renderer.setPixelRatio(1);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.82;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    var scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04162b);
    scene.fog = new THREE.FogExp2(0x04162b, 0.022);

    var camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 100);

    var ambient = new THREE.AmbientLight(0xd8e8ff, 0.58);
    scene.add(ambient);

    var keyLight = new THREE.DirectionalLight(0xfff6e5, 1.15);
    keyLight.position.set(7, 14, 9);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 35;
    var d = 4.5;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    scene.add(keyLight);

    var rimLight = new THREE.DirectionalLight(0x4fc3f7, 0.55);
    rimLight.position.set(-9, 8, -7);
    scene.add(rimLight);

    var redWarnLight = new THREE.PointLight(0xe0453a, 0, 12);
    redWarnLight.position.set(0, 3.5, 0);
    scene.add(redWarnLight);

    var root = new THREE.Group();
    scene.add(root);

    var FLOOR_SIZE = 4.0;
    var DRAIN_POS = new THREE.Vector2(1.15, -1.15);

    function badHeight(x, z) {
      var wrongTilt = -0.045 * x + 0.045 * z;
      var dip1 = -0.19 * Math.exp(-((x + 1.15) * (x + 1.15) + (z - 1.1) * (z - 1.1)) / 0.65);
      var dip2 = -0.14 * Math.exp(-((x - 0.15) * (x - 0.15) + (z - 1.25) * (z - 1.25)) / 0.45);
      var ridge = 0.06 * Math.exp(-((x - 0.55) * (x - 0.55) + (z + 0.45) * (z + 0.45)) / 0.5);
      return wrongTilt + dip1 + dip2 + ridge;
    }

    function goodHeight(x, z) {
      var dx = x - DRAIN_POS.x;
      var dz = z - DRAIN_POS.y;
      var dist = Math.sqrt(dx * dx + dz * dz);
      return -0.16 + 0.065 * dist;
    }

    function blendedHeight(x, z, goodBlend) {
      return lerp(badHeight(x, z), goodHeight(x, z), goodBlend);
    }

    // 1. Concrete Slab
    var slabGeo = new THREE.BoxGeometry(FLOOR_SIZE, 0.26, FLOOR_SIZE);
    var slabMat = new THREE.MeshStandardMaterial({
      color: 0x3b4654,
      roughness: 0.88,
      metalness: 0.08
    });
    var slabMesh = new THREE.Mesh(slabGeo, slabMat);
    slabMesh.position.y = -0.42;
    slabMesh.receiveShadow = true;
    root.add(slabMesh);

    // 2. Waterproofing Membrane
    var wpGeo = new THREE.BoxGeometry(FLOOR_SIZE - 0.02, 0.045, FLOOR_SIZE - 0.02);
    var wpMat = new THREE.MeshStandardMaterial({
      color: 0x02528f,
      roughness: 0.45,
      metalness: 0.15
    });
    var wpMesh = new THREE.Mesh(wpGeo, wpMat);
    wpMesh.position.y = -0.24;
    root.add(wpMesh);

    // 3. Deformable Screed (48x48 segments)
    var SEG = 48;
    var screedGeo = new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE, SEG, SEG);
    screedGeo.rotateX(-Math.PI / 2);
    var screedMat = new THREE.MeshStandardMaterial({
      color: 0x7c8794,
      roughness: 0.78,
      metalness: 0.08,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0
    });
    var screedMesh = new THREE.Mesh(screedGeo, screedMat);
    screedMesh.receiveShadow = true;
    root.add(screedMesh);

    var screedSkirtGeo = new THREE.BoxGeometry(FLOOR_SIZE - 0.01, 0.16, FLOOR_SIZE - 0.01);
    var screedSkirtMat = new THREE.MeshStandardMaterial({
      color: 0x6b7685,
      roughness: 0.75,
      metalness: 0.1,
      emissive: new THREE.Color(0xffcc00),
      emissiveIntensity: 0
    });
    var screedSkirt = new THREE.Mesh(screedSkirtGeo, screedSkirtMat);
    screedSkirt.position.y = -0.09;
    screedMesh.add(screedSkirt);

    // 4. Tile Adhesive Layer
    var adhGeo = new THREE.PlaneGeometry(FLOOR_SIZE - 0.04, FLOOR_SIZE - 0.04, 32, 32);
    adhGeo.rotateX(-Math.PI / 2);
    var adhPos = adhGeo.attributes.position;
    for (var i = 0; i < adhPos.count; i++) {
      var ax = adhPos.getX(i);
      adhPos.setY(i, 0.012 * Math.sin(ax * 28));
    }
    adhGeo.computeVertexNormals();
    var adhMat = new THREE.MeshStandardMaterial({
      color: 0xc5ccd6,
      roughness: 0.65,
      metalness: 0.05,
      transparent: true,
      opacity: 0.0
    });
    var adhMesh = new THREE.Mesh(adhGeo, adhMat);
    root.add(adhMesh);

    // 5. Ceramic Tile Grid (8x8 separate boxes)
    var TILE_N = 8;
    var tileGroup = new THREE.Group();
    root.add(tileGroup);
    var tiles = [];
    var cell = FLOOR_SIZE / TILE_N;
    var tileSize = cell - 0.025;
    var tileGeo = new THREE.BoxGeometry(tileSize, 0.045, tileSize);
    var tileBaseMat = new THREE.MeshStandardMaterial({
      color: 0xdce3ec,
      roughness: 0.25,
      metalness: 0.12,
      transparent: true,
      opacity: 1.0
    });

    var rng = mulberry32(2026);
    for (var gx = 0; gx < TILE_N; gx++) {
      for (var gz = 0; gz < TILE_N; gz++) {
        var tx = -FLOOR_SIZE / 2 + (gx + 0.5) * cell;
        var tz = -FLOOR_SIZE / 2 + (gz + 0.5) * cell;
        var mat = tileBaseMat.clone();
        var shade = 0.96 + 0.05 * rng();
        mat.color.setRGB(0.84 * shade, 0.88 * shade, 0.92 * shade);
        var mesh = new THREE.Mesh(tileGeo, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        tileGroup.add(mesh);
        tiles.push({
          mesh: mesh,
          mat: mat,
          gx: gx,
          gz: gz,
          baseX: tx,
          baseZ: tz,
          idx: gx * TILE_N + gz,
          randTiltX: (rng() - 0.5) * 0.6,
          randTiltZ: (rng() - 0.5) * 0.6
        });
      }
    }

    // Two Bathroom Walls
    var wallMat = new THREE.MeshStandardMaterial({
      color: 0x16293f,
      roughness: 0.5,
      metalness: 0.15
    });
    var backWall = new THREE.Mesh(new THREE.BoxGeometry(FLOOR_SIZE + 0.16, 1.35, 0.14), wallMat);
    backWall.position.set(0, 0.45, -FLOOR_SIZE / 2 - 0.07);
    backWall.receiveShadow = true;
    root.add(backWall);

    var leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.35, FLOOR_SIZE + 0.16), wallMat);
    leftWall.position.set(-FLOOR_SIZE / 2 - 0.07, 0.45, 0);
    leftWall.receiveShadow = true;
    root.add(leftWall);

    // Metal Floor Drain
    var drainGroup = new THREE.Group();
    var drainRim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.24, 0.06, 32),
      new THREE.MeshStandardMaterial({ color: 0x9fb1c4, roughness: 0.25, metalness: 0.85 })
    );
    var drainWell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.19, 0.19, 0.065, 32),
      new THREE.MeshStandardMaterial({ color: 0x05101c, roughness: 0.6, metalness: 0.3 })
    );
    drainGroup.add(drainRim);
    drainGroup.add(drainWell);
    for (var s = -2; s <= 2; s++) {
      var bar = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.015, 0.022),
        new THREE.MeshStandardMaterial({ color: 0xcad6e2, roughness: 0.2, metalness: 0.9 })
      );
      bar.position.set(0, 0.032, s * 0.06);
      drainGroup.add(bar);
    }
    root.add(drainGroup);

    // Survey Topographic Contour Overlay (CanvasTexture with sRGBEncoding)
    var contourCanvas = document.createElement('canvas');
    contourCanvas.width = 512;
    contourCanvas.height = 512;
    var cctx = contourCanvas.getContext('2d');
    var contourTex = new THREE.CanvasTexture(contourCanvas);
    contourTex.encoding = THREE.sRGBEncoding;

    var contourGeo = new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE, SEG, SEG);
    contourGeo.rotateX(-Math.PI / 2);
    var contourMat = new THREE.MeshBasicMaterial({
      map: contourTex,
      transparent: true,
      opacity: 0.9,
      depthWrite: false
    });
    var contourMesh = new THREE.Mesh(contourGeo, contourMat);
    root.add(contourMesh);

    function updateContourCanvas(goodBlend, tighten, redPulse) {
      var W = 512;
      var H = 512;
      cctx.clearRect(0, 0, W, H);
      var img = cctx.createImageData(W, H);
      var data = img.data;
      var freq = lerp(26, 42, tighten);

      for (var py = 0; py < H; py++) {
        var z = (py / (H - 1) - 0.5) * FLOOR_SIZE;
        for (var px = 0; px < W; px++) {
          var x = (px / (W - 1) - 0.5) * FLOOR_SIZE;
          var h = blendedHeight(x, z, goodBlend);

          var lowFactor = clamp((-h - 0.04) * 5.2, 0, 1);
          var iso = Math.abs(Math.sin(h * freq * Math.PI));
          var isLine = iso > 0.92 ? (iso - 0.92) / 0.08 : 0;

          var gx = Math.abs(((x + 2) * 4) % 1);
          var gz = Math.abs(((z + 2) * 4) % 1);
          var gridLine = gx < 0.03 || gz < 0.03 ? 0.25 : 0;

          var r = lerp(4, 2, lowFactor);
          var g = lerp(38, 82, 1 - lowFactor);
          var b = lerp(88, 143, 1 - lowFactor);

          if (redPulse > 0 && lowFactor > 0.25) {
            var rp = lowFactor * redPulse;
            r = lerp(r, 224, rp);
            g = lerp(g, 69, rp);
            b = lerp(b, 58, rp);
          }

          if (isLine > 0) {
            r = lerp(r, 79, isLine);
            g = lerp(g, 195, isLine);
            b = lerp(b, 247, isLine);
          }

          var alpha = clamp(0.32 + lowFactor * 0.45 + isLine * 0.55 + gridLine, 0, 0.95);
          var idx = (py * W + px) * 4;
          data[idx] = r | 0;
          data[idx + 1] = g | 0;
          data[idx + 2] = b | 0;
          data[idx + 3] = (alpha * 255) | 0;
        }
      }
      cctx.putImageData(img, 0, 0);
      contourTex.needsUpdate = true;
    }

    // Water Puddles
    var puddleMat1 = new THREE.MeshStandardMaterial({
      color: 0x4fc3f7,
      emissive: 0x02528f,
      emissiveIntensity: 0.35,
      roughness: 0.08,
      metalness: 0.1,
      transparent: true,
      opacity: 0.78
    });
    var puddleGeo1 = new THREE.CircleGeometry(0.95, 40);
    puddleGeo1.rotateX(-Math.PI / 2);
    var puddle1 = new THREE.Mesh(puddleGeo1, puddleMat1);
    root.add(puddle1);

    var puddleGeo2 = new THREE.CircleGeometry(0.68, 36);
    puddleGeo2.rotateX(-Math.PI / 2);
    var puddle2 = new THREE.Mesh(puddleGeo2, puddleMat1.clone());
    root.add(puddle2);

    // Water Flow Streak Particles
    var STREAK_COUNT = 90;
    var streaksGroup = new THREE.Group();
    root.add(streaksGroup);
    var streaks = [];
    var streakGeo = new THREE.BoxGeometry(0.028, 0.012, 0.18);
    var streakMat = new THREE.MeshBasicMaterial({
      color: 0x8be0ff,
      transparent: true,
      opacity: 0.85
    });
    for (var k = 0; k < STREAK_COUNT; k++) {
      var sm = new THREE.Mesh(streakGeo, streakMat.clone());
      streaksGroup.add(sm);
      streaks.push({
        mesh: sm,
        seedX: (rng() - 0.5) * 3.2,
        seedZ: (rng() - 0.5) * 3.2,
        phase: rng()
      });
    }

    // Slope Arrows
    var arrowGroup = new THREE.Group();
    root.add(arrowGroup);
    var arrows = [];

    function makeArrowMesh() {
      var g = new THREE.Group();
      var shaft = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.018, 0.26),
        new THREE.MeshBasicMaterial({ color: 0x4fc3f7, transparent: true, opacity: 0.9 })
      );
      shaft.position.z = -0.05;
      var head = new THREE.Mesh(new THREE.ConeGeometry(0.095, 0.16, 4), shaft.material);
      head.rotation.x = Math.PI / 2;
      head.rotation.y = Math.PI / 4;
      head.position.z = 0.12;
      g.add(shaft);
      g.add(head);
      return { group: g, mat: shaft.material };
    }

    for (var ax = -1.35; ax <= 1.36; ax += 0.9) {
      for (var az = -1.35; az <= 1.36; az += 0.9) {
        if (Math.hypot(ax - DRAIN_POS.x, az - DRAIN_POS.y) < 0.45) continue;
        var ar = makeArrowMesh();
        arrowGroup.add(ar.group);
        arrows.push({ group: ar.group, mat: ar.mat, x: ax, z: az });
      }
    }

    // Specialist Laser Level on Tripod
    var laserGroup = new THREE.Group();
    var tripodHub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.18, 0.24, 24),
      new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.3, metalness: 0.6 })
    );
    tripodHub.position.y = 0.52;
    laserGroup.add(tripodHub);

    var laserHead = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.11, 0.16, 24),
      new THREE.MeshStandardMaterial({ color: 0x1a2430, roughness: 0.2, metalness: 0.8 })
    );
    laserHead.position.y = 0.70;
    laserGroup.add(laserHead);

    for (var legIdx = 0; legIdx < 3; legIdx++) {
      var ang = (legIdx * Math.PI * 2) / 3 + 0.4;
      var leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.02, 0.68, 12),
        new THREE.MeshStandardMaterial({ color: 0xd0d8e0, metalness: 0.8, roughness: 0.25 })
      );
      leg.position.set(Math.cos(ang) * 0.18, 0.24, Math.sin(ang) * 0.18);
      leg.rotation.z = -Math.cos(ang) * 0.32;
      leg.rotation.x = Math.sin(ang) * 0.32;
      laserGroup.add(leg);
    }

    var laserDiscGeo = new THREE.RingGeometry(0.12, 2.65, 64);
    laserDiscGeo.rotateX(-Math.PI / 2);
    var laserDiscMat = new THREE.MeshBasicMaterial({
      color: 0xe0453a,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.22
    });
    var laserDisc = new THREE.Mesh(laserDiscGeo, laserDiscMat);
    laserDisc.position.y = 0.32;
    laserGroup.add(laserDisc);

    var laserBeamGeo = new THREE.BoxGeometry(0.035, 0.015, 5.2);
    var laserBeamMat = new THREE.MeshBasicMaterial({
      color: 0xff3b30,
      transparent: true,
      opacity: 0.95
    });
    var laserBeam = new THREE.Mesh(laserBeamGeo, laserBeamMat);
    laserBeam.position.y = 0.325;
    laserGroup.add(laserBeam);

    laserGroup.position.set(-0.2, 0, 0.1);
    root.add(laserGroup);

    // 3D Yellow Wipe Bar
    var wipeBarGeo = new THREE.BoxGeometry(FLOOR_SIZE + 0.5, 0.06, 0.12);
    var wipeBarMat = new THREE.MeshBasicMaterial({
      color: 0xffcc00,
      transparent: true,
      opacity: 0
    });
    var wipeBar = new THREE.Mesh(wipeBarGeo, wipeBarMat);
    root.add(wipeBar);

    var lastContourKey = '';

    function set(state) {
      var goodBlend = clamp(state.goodBlend || 0, 0, 1);
      var surveyOpacity = clamp(state.surveyOpacity !== undefined ? state.surveyOpacity : 1, 0, 1);
      var contourTighten = clamp(state.contourTighten || 0, 0, 1);
      var redPulse = clamp(state.redPulse || 0, 0, 1);
      var tileOpacity = clamp(state.tileOpacity !== undefined ? state.tileOpacity : 1, 0, 1);
      var tileLift = clamp(state.tileLift || 0, 0, 1);
      var tilePopBad = clamp(state.tilePopBad || 0, 0, 1);
      var explode = clamp(state.explode || 0, 0, 1);
      var screedHighlight = clamp(state.screedHighlight || 0, 0, 1);
      var puddleBad = clamp(state.puddleBad || 0, 0, 1);
      var flowGood = clamp(state.flowGood || 0, 0, 1);
      var arrowMode = state.arrowMode || 'survey';
      var arrowAlpha = clamp(state.arrowAlpha !== undefined ? state.arrowAlpha : 1, 0, 1);
      var laserActive = clamp(state.laserActive || 0, 0, 1);
      var floorTilt = state.floorTilt || 0;
      var redTint = clamp(state.redTint || 0, 0, 1);
      var wipeProgress = state.wipeProgress !== undefined ? state.wipeProgress : -1;
      var time = state.time || 0;

      root.rotation.x = floorTilt * 0.22;
      root.rotation.z = -floorTilt * 0.18;

      redWarnLight.intensity = redTint * 2.2 + redPulse * 0.9;

      var slabY = -0.42 - explode * 0.95;
      var wpY = -0.24 - explode * 0.48;
      var screedBaseY = explode * 0.05;
      var adhY = 0.04 + explode * 0.52;
      var tileBaseY = 0.055 + explode * 0.98;

      slabMesh.position.y = slabY;
      wpMesh.position.y = wpY;
      adhMesh.position.y = adhY;
      adhMat.opacity = clamp(explode * 1.25, 0, 0.92);

      screedMat.emissive.setHex(0xffcc00);
      screedMat.emissiveIntensity = screedHighlight * 0.55;
      screedSkirtMat.emissiveIntensity = screedHighlight * 0.75;

      var pos = screedGeo.attributes.position;
      var cpos = contourGeo.attributes.position;
      for (var i = 0; i < pos.count; i++) {
        var vx = pos.getX(i);
        var vz = pos.getZ(i);
        var h = blendedHeight(vx, vz, goodBlend);
        pos.setY(i, screedBaseY + h);
        cpos.setY(i, screedBaseY + h + 0.068);
      }
      pos.needsUpdate = true;
      cpos.needsUpdate = true;
      screedGeo.computeVertexNormals();

      var drainH = blendedHeight(DRAIN_POS.x, DRAIN_POS.y, goodBlend);
      drainGroup.position.set(DRAIN_POS.x, screedBaseY + drainH + 0.015, DRAIN_POS.y);

      var cKey = goodBlend.toFixed(2) + '_' + contourTighten.toFixed(2) + '_' + redPulse.toFixed(2);
      if (surveyOpacity > 0.01 && cKey !== lastContourKey) {
        updateContourCanvas(goodBlend, contourTighten, redPulse);
        lastContourKey = cKey;
      }
      contourMesh.visible = surveyOpacity > 0.01;
      contourMat.opacity = surveyOpacity * 0.88;

      for (var ti = 0; ti < tiles.length; ti++) {
        var tl = tiles[ti];
        var th = blendedHeight(tl.baseX, tl.baseZ, goodBlend);
        var y = tileBaseY + th;
        var x = tl.baseX;
        var z = tl.baseZ;
        var rx = 0;
        var rz = 0;

        if (tileLift > 0) {
          var wave = clamp(tileLift * 1.3 - (tl.gx + tl.gz) * 0.03, 0, 1);
          y += wave * 2.35;
        }

        if (tilePopBad > 0) {
          var popOrder = (tl.idx % 16) / 16;
          var p = clamp((tilePopBad - popOrder * 0.35) / 0.65, 0, 1);
          var easeP = p * p * (3 - 2 * p);
          var stackCol = tl.idx % 4;
          var stackRow = Math.floor(tl.idx / 4);
          var targetX = -1.4 + stackCol * 0.52;
          var targetZ = -1.4 + (stackRow % 2) * 0.52;
          var targetY = 0.12 + Math.floor(stackRow / 2) * 0.065;
          x = lerp(x, targetX, easeP);
          z = lerp(z, targetZ, easeP);
          y = lerp(y, targetY + Math.sin(p * Math.PI) * 0.65, easeP);
          rx = tl.randTiltX * Math.sin(p * Math.PI);
          rz = tl.randTiltZ * Math.sin(p * Math.PI);
        }

        tl.mesh.position.set(x, y, z);
        tl.mesh.rotation.set(rx, 0, rz);

        var effOpacity = tileOpacity * (1 - clamp(tileLift * 1.15, 0, 1));
        tl.mesh.visible = effOpacity > 0.02;
        tl.mat.opacity = effOpacity;
        tl.mat.roughness = lerp(0.12, 0.25, effOpacity);
      }

      puddle1.visible = puddleBad > 0.01;
      puddle2.visible = puddleBad > 0.01;
      if (puddleBad > 0.01) {
        var h1 = blendedHeight(-1.12, 1.08, goodBlend);
        puddle1.position.set(-1.12, screedBaseY + h1 + 0.072, 1.08);
        puddle1.scale.setScalar(0.15 + puddleBad * 0.92);
        puddleMat1.color.setHex(redPulse > 0.2 ? 0xe05252 : 0x4fc3f7);

        var h2 = blendedHeight(0.12, 1.22, goodBlend);
        puddle2.position.set(0.12, screedBaseY + h2 + 0.072, 1.22);
        puddle2.scale.setScalar(0.12 + puddleBad * 0.85);
      }

      var showStreaks = (puddleBad > 0.1 || flowGood > 0.05) && explode < 0.1;
      streaksGroup.visible = showStreaks;
      if (showStreaks) {
        for (var si = 0; si < streaks.length; si++) {
          var st = streaks[si];
          var cyc = (time * (flowGood > 0.1 ? 0.95 : 0.45) + st.phase) % 1;
          var sx, sz, tx, tz;
          if (flowGood > 0.1) {
            sx = st.seedX;
            sz = st.seedZ;
            tx = DRAIN_POS.x;
            tz = DRAIN_POS.y;
          } else {
            sx = st.seedX * 0.8 + 0.3;
            sz = st.seedZ * 0.8 - 0.3;
            tx = -1.15;
            tz = 1.12;
          }
          var px = lerp(sx, tx, cyc);
          var pz = lerp(sz, tz, cyc);
          var py = screedBaseY + blendedHeight(px, pz, goodBlend) + 0.085;
          st.mesh.position.set(px, py, pz);
          st.mesh.rotation.y = Math.atan2(tx - sx, tz - sz);
          st.mesh.material.opacity =
            Math.sin(cyc * Math.PI) * (flowGood > 0.1 ? flowGood : puddleBad) * 0.85;
        }
      }

      arrowGroup.visible = arrowAlpha > 0.02 && arrowMode !== 'none';
      if (arrowGroup.visible) {
        for (var ai = 0; ai < arrows.length; ai++) {
          var arw = arrows[ai];
          var ah = blendedHeight(arw.x, arw.z, goodBlend);
          arw.group.position.set(arw.x, screedBaseY + ah + 0.09, arw.z);
          var targetVecX, targetVecZ;
          if (arrowMode === 'good') {
            targetVecX = DRAIN_POS.x - arw.x;
            targetVecZ = DRAIN_POS.y - arw.z;
            arw.mat.color.setHex(0xffcc00);
          } else {
            targetVecX = -1.18 - arw.x;
            targetVecZ = 1.15 - arw.z;
            arw.mat.color.setHex(arrowMode === 'wrong' ? 0xe0453a : 0x4fc3f7);
          }
          arw.group.rotation.y = Math.atan2(targetVecX, targetVecZ);
          var pulse = 1 + 0.12 * Math.sin(time * 7 + ai * 0.5);
          arw.group.scale.setScalar(pulse);
          arw.mat.opacity = arrowAlpha;
        }
      }

      laserGroup.visible = laserActive > 0.01;
      if (laserGroup.visible) {
        laserGroup.scale.setScalar(smoothstep(0, 1, laserActive));
        laserBeam.rotation.y = time * 3.6;
        laserDiscMat.opacity = 0.18 * laserActive;
        laserBeamMat.opacity = 0.95 * laserActive;
      }

      if (wipeProgress >= 0 && wipeProgress <= 1) {
        wipeBar.visible = true;
        wipeBar.position.set(0, 0.22, lerp(-FLOOR_SIZE / 2, FLOOR_SIZE / 2, wipeProgress));
        wipeBarMat.opacity = Math.sin(wipeProgress * Math.PI);
      } else {
        wipeBar.visible = false;
      }
    }

    function shot(camState) {
      camera.fov = camState.fov || 34;
      camera.updateProjectionMatrix();

      var az = camState.azimuth || 0;
      var rad = camState.radius || 19.5;
      var h = camState.height || 11.5;
      var ty = camState.targetY !== undefined ? camState.targetY : -1.2;
      var shakeX = camState.shakeX || 0;
      var shakeY = camState.shakeY || 0;

      camera.position.set(Math.sin(az) * rad + shakeX, h + shakeY, Math.cos(az) * rad);
      camera.lookAt(shakeX * 0.4, ty + shakeY * 0.4, 0);
      renderer.render(scene, camera);
    }

    function projectToScreen(x, y, z) {
      var v = new THREE.Vector3(x, y, z);
      root.localToWorld(v);
      v.project(camera);
      return {
        x: (v.x * 0.5 + 0.5) * width,
        y: (-v.y * 0.5 + 0.5) * height
      };
    }

    return {
      set: set,
      shot: shot,
      projectToScreen: projectToScreen
    };
  }

  global.Floor3D = { create: createFloorScene };
})(window);
