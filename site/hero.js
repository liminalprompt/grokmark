// Scroll-driven entrance: the velvet rope swings open and the camera walks you
// through the crowd, under the arch, to the tables.
//
// The page is complete without this file: a static poster sits behind the headline.
// The inline script in index.html picks a tier (none / lite / full) and only injects
// the three.js preloads when 3D will run. Here we wait for first paint and an idle
// moment, build the scene in small chunks, and render on demand.
const root = document.documentElement;
const tier = root.dataset.tier;
const lite = tier === "lite";

const journey = document.querySelector(".journey");
const canvas = document.getElementById("rope");

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const seg = (p, a, b) => clamp01((p - a) / (b - a));
// seeded so the crowd is the same every load
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const rand = (a, b) => a + rnd() * (b - a);

const yieldMain = () => new Promise((r) => setTimeout(r, 0));
const afterPaint = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const whenIdle = () => new Promise((r) => ("requestIdleCallback" in window ? requestIdleCallback(r, { timeout: 1500 }) : setTimeout(r, 200)));

if (tier === "full" || tier === "lite") {
  boot().catch((e) => {
    console.warn("[grokmark site] 3D hero unavailable:", e);
    canvas.classList.remove("ready");
    root.classList.add("no-3d");
  });
}

async function boot() {
  await afterPaint();
  await whenIdle();

  const [THREE, { RoomEnvironment }, { RoundedBoxGeometry }] = await Promise.all([
    import("three"),
    import("three/addons/environments/RoomEnvironment.js"),
    import("three/addons/geometries/RoundedBoxGeometry.js"),
  ]);
  await yieldMain();

  // quality knobs: lite is the phone scene
  const Q = lite
    ? { aa: false, pr: 1.25, sphere: [12, 8], boxSeg: 2, tube: [24, 6], pts: 13, post: [16, 1], pole: 8, top: [10, 6], cap: [8, 6], table: 16, eyes: [1, 4], line: 26, dance: 31 }
    : { aa: true, pr: 1.75, sphere: [32, 24], boxSeg: 6, tube: [80, 14], pts: 25, post: [40, 1], pole: 20, top: [24, 16], cap: [16, 12], table: 40, eyes: [4, 10], line: 120, dance: 150 };

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: Q.aa, powerPreference: "high-performance" });
  renderer.setClearColor(0x0c0a10);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0c0a10, 0.04);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);
  scene.add(camera);
  await yieldMain();

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  await yieldMain();

  // lights: a warm lamp that rides with the camera, plus key (and on desktop rim and spot)
  scene.add(new THREE.HemisphereLight(0x8a7ab0, 0x1a1220, lite ? 1.1 : 0.8));
  const lamp = new THREE.PointLight(0xffd9a0, 28, 18, 2);
  lamp.position.set(0, 0.4, 0.5);
  camera.add(lamp);
  const key = new THREE.DirectionalLight(0xffe0b0, 2.6);
  key.position.set(3, 6, 8);
  scene.add(key);
  if (!lite) {
    const rim = new THREE.DirectionalLight(0x8a7bff, 1.4);
    rim.position.set(0, 3, -12);
    scene.add(rim);
    const spot = new THREE.SpotLight(0xffe2b8, 220, 22, 0.55, 0.5, 1.5);
    spot.position.set(0, 7, -21);
    spot.target.position.set(0, 0, -26);
    scene.add(spot, spot.target);
  }

  // materials
  const brass = new THREE.MeshStandardMaterial({ color: 0xd8ab4f, metalness: 1, roughness: 0.25, envMapIntensity: 1.2 });
  const velvet = lite
    ? new THREE.MeshStandardMaterial({ color: 0x9c1230, roughness: 0.9, emissive: 0x3a0612 })
    : new THREE.MeshPhysicalMaterial({ color: 0x9c1230, roughness: 0.9, sheen: 1, sheenColor: new THREE.Color(0xff5a78), sheenRoughness: 0.5 });
  const carpet = new THREE.MeshStandardMaterial({ color: 0x3d0a19, roughness: 0.95 });
  const floor = new THREE.MeshStandardMaterial({ color: 0x0f0c14, roughness: 0.5, metalness: 0.25 });

  // floor + carpet
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 80), floor);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, -20);
  scene.add(ground);
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 60), carpet);
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.005, -17);
  scene.add(rug);
  for (const sx of [-1, 1]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 60), new THREE.MeshBasicMaterial({ color: 0xd8ab4f, transparent: true, opacity: 0.55 }));
    strip.position.set(sx * 1.72, 0.015, -17);
    scene.add(strip);
  }
  await yieldMain();

  // stanchions: one instanced set along both sides of the carpet
  const SP = 4.4, POSTS = 6, PX = 2.2;
  const posts = [];
  for (let k = 0; k < POSTS; k++) for (const sx of [-1, 1]) posts.push([sx * PX, -SP * k]);
  const baseI = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.55, 0.62, 0.14, Q.post[0], Q.post[1]), brass, posts.length);
  const poleI = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.07, 2.1, Q.pole, 1), brass, posts.length);
  const topI = new THREE.InstancedMesh(new THREE.SphereGeometry(0.17, Q.top[0], Q.top[1]), brass, posts.length);
  const m4 = new THREE.Matrix4();
  posts.forEach(([x, z], i) => {
    baseI.setMatrixAt(i, m4.makeTranslation(x, 0.07, z));
    poleI.setMatrixAt(i, m4.makeTranslation(x, 1.19, z));
    topI.setMatrixAt(i, m4.makeTranslation(x, 2.27, z));
  });
  scene.add(baseI, poleI, topI);

  // ropes: instanced segments running along z, plus the animated gate rope
  const ropePoints = (len, along) =>
    Array.from({ length: Q.pts }, (_, i) => {
      const t = i / (Q.pts - 1), sag = -0.75 * 4 * t * (1 - t);
      return along === "x" ? new THREE.Vector3(len * t, sag, 0) : new THREE.Vector3(0, sag, -len * t);
    });
  const zRope = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ropePoints(SP, "z")), Q.tube[0], 0.09, Q.tube[1]);
  const segs = [];
  for (let k = 0; k < POSTS - 1; k++) {
    segs.push([PX, -SP * k]); // right side from the gate on
    if (k > 0) segs.push([-PX, -SP * k]); // left side starts after the gate rope
  }
  const zRopes = new THREE.InstancedMesh(zRope, velvet, segs.length);
  segs.forEach(([x, z], i) => zRopes.setMatrixAt(i, m4.makeTranslation(x, 1.95, z)));
  scene.add(zRopes);

  const gate = new THREE.Group(); // pivots on the left gate post, swings open toward the club
  gate.position.set(-PX, 1.95, 0);
  gate.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ropePoints(PX * 2, "x")), Q.tube[0], 0.09, Q.tube[1]), velvet));
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.12, Q.cap[0], Q.cap[1]), brass);
  cap.position.set(PX * 2, 0, 0);
  gate.add(cap);
  scene.add(gate);
  await yieldMain();

  // crowd of Grok Bots: soft colored blobs with two tilted pill eyes
  const PALETTE = [0x111111, 0x00b9a6, 0x925cff, 0x1186ff, 0xff6a00, 0xff9a00, 0xff3399, 0x787878, 0x986a40];
  const squash = (g, x, y, z) => (g.scale(x, y, z), g);
  const [sw, sh_] = Q.sphere;
  // eyeY / eyeZ place the eyes on each shape's front face
  const SHAPES = [
    { geo: new THREE.SphereGeometry(0.45, sw, sh_), cy: 0.45, eyeY: 0.52, eyeZ: 0.42 },
    { geo: squash(new THREE.SphereGeometry(0.45, sw, sh_), 1.2, 0.85, 1), cy: 0.38, eyeY: 0.43, eyeZ: 0.43 },
    { geo: new RoundedBoxGeometry(0.8, 0.8, 0.8, Q.boxSeg, 0.22), cy: 0.4, eyeY: 0.45, eyeZ: 0.4 },
    { geo: squash(new THREE.SphereGeometry(0.42, sw, sh_), 0.85, 1.25, 0.85), cy: 0.52, eyeY: 0.62, eyeZ: 0.34 },
  ];
  const people = [];
  const addPerson = (x, z, amp, speed) => {
    const toward = x < 0 ? 1 : -1; // face the carpet, some turned toward the camera
    people.push({
      x, z, s: rand(0.85, 1.15), ph: rand(0, 6.28), amp, speed,
      yaw: toward * (Math.PI / 2 - rand(0, 0.8)),
      shape: Math.floor(rnd() * SHAPES.length), color: PALETTE[Math.floor(rnd() * PALETTE.length)],
    });
  };
  for (let i = 0; i < Q.line; i++) { // the line outside the rope
    const sx = rnd() < 0.5 ? -1 : 1;
    addPerson(sx * rand(3.0, 7.5), rand(-12, 9), 0.04, rand(1.2, 2));
  }
  for (let i = 0; i < Q.dance; i++) { // dancing inside
    const sx = rnd() < 0.5 ? -1 : 1, z = rand(-27, -12);
    addPerson(sx * rand(z < -20 ? 4.6 : 3.2, 10), z, 0.18, rand(3, 5));
  }
  // one bot at each table, bouncing behind it (shape 0 sphere, 3 egg, 2 cube)
  [[-3, 2, 0xff3399], [0, 0, 0x1186ff], [3, 3, 0xff9a00]].forEach(([x, shape, color], k) => {
    people.push({ x, z: -27.3, s: 1.25, ph: k * 2.1, amp: 0.45, speed: 4.2, lift: 0.35, yaw: 0, shape, color });
  });
  const col = new THREE.Color();
  const blobs = SHAPES.map((sh, k) => {
    const mine = people.filter((p) => p.shape === k);
    mine.forEach((p, i) => (p.slot = i));
    const mesh = new THREE.InstancedMesh(sh.geo, new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0, envMapIntensity: 0.5 }), Math.max(1, mine.length));
    mesh.count = mine.length;
    mine.forEach((p, i) => {
      col.set(p.color);
      mesh.setColorAt(i, col);
    });
    return mesh;
  });
  const eyesGeo = squash(new THREE.CapsuleGeometry(0.045, 0.12, Q.eyes[0], Q.eyes[1]), 1, 1, 0.45);
  const eyesI = new THREE.InstancedMesh(eyesGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), people.length * 2);
  scene.add(...blobs, eyesI);
  const crowdMeshes = [...blobs, eyesI];
  const dummy = new THREE.Object3D();
  dummy.rotation.order = "YXZ"; // tilt in the eye's own frame, then turn to face
  const put = (mesh, i, x, y, z, ry, sx, sy, sz, rz = 0) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, ry, rz);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  };
  function animateCrowd(t, excite) {
    people.forEach((p, i) => {
      const sh = SHAPES[p.shape];
      const hop = Math.abs(Math.sin(t * p.speed + p.ph));
      const y = hop * p.amp * (1 + excite);
      const sq = 1 + (hop - 0.5) * 0.14 * (1 + excite); // squash and stretch
      const s = p.s, sy = s * sq, sxz = s / Math.sqrt(sq);
      const ry = p.yaw + Math.sin(t * p.speed * 0.6 + p.ph) * 0.3; // looks around
      const cy = sh.cy * sy + y + (p.lift || 0);
      put(blobs[p.shape], p.slot, p.x, cy, p.z, ry, sxz, sy, sxz);
      const fx = Math.sin(ry), fz = Math.cos(ry), rx = Math.cos(ry), rz = -Math.sin(ry);
      const ey = (sh.eyeY - sh.cy) * sy + cy, ez = sh.eyeZ * sxz, side = 0.13 * sxz;
      put(eyesI, i * 2, p.x + fx * ez - rx * side, ey, p.z + fz * ez - rz * side, ry, s, s, s, 0.22);
      put(eyesI, i * 2 + 1, p.x + fx * ez + rx * side, ey, p.z + fz * ez + rz * side, ry, s, s, s, -0.22);
    });
    for (const m of crowdMeshes) m.instanceMatrix.needsUpdate = true;
  }
  animateCrowd(0, 0);
  await yieldMain();

  // club: arch, overhead light bars, tables
  // Labels are drawn right away with whatever font is ready, then redrawn when the web font lands.
  const labels = [];
  const label = (text, w, h, size, color, glow) => {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");
    const draw = () => {
      g.clearRect(0, 0, w, h);
      g.textAlign = "center"; g.textBaseline = "middle";
      g.font = `italic ${size}px "Instrument Serif", Georgia, serif`;
      g.shadowColor = glow; g.shadowBlur = size * 0.25;
      g.fillStyle = color;
      g.fillText(text, w / 2, h / 2 + size * 0.04);
    };
    draw();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = lite ? 1 : 8;
    labels.push({ draw, tex });
    return new THREE.Mesh(new THREE.PlaneGeometry(w / h * 1.4, 1.4), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  };
  const archZ = -12;
  for (const sx of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5.2, 0.5), brass);
    pillar.position.set(sx * 3.4, 2.6, archZ);
    scene.add(pillar);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(7.3, 0.5, 0.5), brass);
  beam.position.set(0, 5.2, archZ);
  scene.add(beam);
  for (let i = 0; i < 6; i++) { // overhead bars, a speed cue
    const bar = new THREE.Mesh(new THREE.BoxGeometry(9, 0.05, 0.12), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xd8ab4f : 0xc0163a }));
    bar.position.set(0, 4.4, archZ - 2.4 * (i + 1));
    scene.add(bar);
  }
  const tableLabels = ["Build", "Research", "Read later"];
  [-3, 0, 3].forEach((x, i) => {
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.06, Q.table), brass);
    top.position.set(x, 1.0, -26);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 16), brass);
    stem.position.set(x, 0.5, -26);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(1.6, lite ? 24 : 48), new THREE.MeshBasicMaterial({ color: 0xff4de1, transparent: true, opacity: 0.12, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(x, 0.02, -26);
    const card = label(tableLabels[i], 640, 200, 120, "#a89f8f", "#000000");
    card.material.opacity = 0.45; // set dressing: legible up close, not from the door
    card.scale.setScalar(0.42);
    card.position.set(x, 1.55, -26);
    scene.add(top, stem, glow, card);
  });
  await yieldMain();

  // overlay elements, with the last written values cached so we only touch the DOM on change
  const fades = [...document.querySelectorAll("[data-fade]")].map((el) => ({ el, r: el.dataset.fade.split(",").map(Number), o: 1, ty: 0, pe: true }));
  const shows = [...document.querySelectorAll("[data-show]")].map((el) => ({ el, r: el.dataset.show.split(",").map(Number), o: 0, on: false }));
  const trapezoid = (p, [a, b, c, d]) => clamp01(Math.min(seg(p, a, b), 1 - seg(p, c, d)));

  // layout is measured on resize only, never per frame
  let size = { w: 0, h: 0, narrow: false };
  let span = 1, top0 = 0;
  let needsResize = true;
  const measure = () => {
    span = Math.max(1, journey.offsetHeight - innerHeight);
    top0 = journey.offsetTop;
    needsResize = true;
    onScroll();
  };
  function applySize() {
    needsResize = false;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(devicePixelRatio, Q.pr));
    renderer.setSize(w, h, false);
    size = { w, h, narrow: w / h < 0.85 };
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    dirty = true;
  }

  let target = 0, p = 0, dirty = true;
  function onScroll() {
    const t = clamp01((scrollY - top0) / span);
    if (t !== target) { target = t; wake(); }
  }

  // render-on-demand loop
  const CROWD_MS = lite ? 1000 / 15 : 1000 / 20;
  const IDLE_STOP_MS = lite ? 4000 : Infinity; // phones stop dancing when left alone
  const start = performance.now();
  let raf = 0, inView = true, pageVisible = !document.hidden, lost = false;
  let lastCrowd = -1e9, lastActive = start, ready = false;
  const canRun = () => inView && pageVisible && !lost;
  function wake() {
    lastActive = performance.now();
    if (!raf && canRun()) raf = requestAnimationFrame(frame);
  }

  function frame(now) {
    raf = 0;
    if (!canRun()) return;
    if (needsResize) applySize();
    if (!size.w) return; // not laid out yet; the ResizeObserver will wake us

    let moving = false;
    const diff = target - p;
    if (Math.abs(diff) >= 0.0005) {
      p += diff * 0.08;
      moving = true;
      dirty = true;
      lastActive = now;
    } else if (diff !== 0) {
      p = target; // one final frame at the exact target
      dirty = true;
    }
    const crowdLive = now - lastActive < IDLE_STOP_MS;
    const crowdDue = crowdLive && now - lastCrowd >= CROWD_MS;
    if (dirty || crowdDue) {
      if (dirty) updateCamera();
      animateCrowd((now - start) / 1000, excite);
      lastCrowd = now;
      if (dirty) updateOverlays();
      dirty = false;
      renderer.render(scene, camera);
      if (!ready) {
        ready = true;
        canvas.classList.add("ready");
      }
    }
    if (moving || crowdLive) raf = requestAnimationFrame(frame);
  }

  let excite = 0;
  function updateCamera() {
    const travel = smooth(seg(p, 0.2, 0.92));
    excite = travel * 1.4;
    const open = smooth(seg(p, 0.1, 0.3));
    const zStart = size.narrow ? 12.5 : 9;
    const xStart = size.narrow ? 0 : -1.7;
    const x = lerp(xStart, 0, smooth(seg(p, 0.1, 0.4)));
    const z = lerp(zStart, -17, travel);
    const walking = travel > 0 && travel < 1 ? 1 : 0;
    const y = lerp(size.narrow ? 2.0 : 1.5, 1.65, travel) + Math.sin(travel * 70) * 0.03 * walking;
    camera.position.set(x + Math.sin(travel * 35) * 0.04 * walking, y, z);
    camera.lookAt(x, lerp(1.3, 1.9, travel), z - 10);
    // a phone's narrow frame crops the crowd at the sides, so open the lens there
    camera.fov = lerp(size.narrow ? 52 : 32, size.narrow ? 82 : 64, smooth(seg(p, 0.25, 0.7)));
    camera.updateProjectionMatrix();

    gate.rotation.y = open * 1.5;
    gate.position.y = 1.95 - open * 0.05;
  }
  function updateOverlays() {
    for (const f of fades) {
      const k = Math.round((1 - seg(p, f.r[0], f.r[1])) * 1000) / 1000;
      if (k !== f.o) { f.o = k; f.el.style.opacity = k; }
      const ty = Math.round((1 - k) * -400) / 10;
      if (ty !== f.ty) { f.ty = ty; f.el.style.transform = `translateY(${ty}px)`; }
      const pe = k > 0.5;
      if (pe !== f.pe) { f.pe = pe; f.el.style.pointerEvents = pe ? "auto" : "none"; }
    }
    for (const s of shows) {
      const k = Math.round(trapezoid(p, s.r) * 1000) / 1000;
      if (k !== s.o) { s.o = k; s.el.style.opacity = k; }
      const on = k > 0.5;
      if (on !== s.on) { s.on = on; s.el.classList.toggle("on", on); }
    }
  }

  // wake / sleep triggers
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", measure);
  new ResizeObserver(() => { needsResize = true; wake(); }).observe(canvas);
  new IntersectionObserver(([e]) => { inView = e.isIntersecting; if (inView) { dirty = true; wake(); } }).observe(journey);
  document.addEventListener("visibilitychange", () => {
    pageVisible = !document.hidden;
    if (pageVisible) { dirty = true; wake(); }
  });
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    lost = true;
    ready = false;
    canvas.classList.remove("ready"); // back to the poster
  });
  canvas.addEventListener("webglcontextrestored", () => { lost = false; dirty = true; wake(); });

  // redraw table labels once the web font is ready, without blocking anything on it
  document.fonts.load('italic 120px "Instrument Serif"').then(() => {
    for (const l of labels) { l.draw(); l.tex.needsUpdate = true; }
    dirty = true;
    wake();
  }, () => {});

  measure();
  // compile shaders without freezing the thread, so the first frame is a plain draw
  if (renderer.compileAsync) { try { await renderer.compileAsync(scene, camera); } catch { /* compiled on first render */ } }
  wake();
}
