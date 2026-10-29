// Scroll-driven entrance: the velvet rope swings open and the camera walks you
// through the crowd, under the arch, to the tables.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const root = document.documentElement;
const journey = document.querySelector(".journey");
const canvas = document.getElementById("rope");
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const seg = (p, a, b) => clamp01((p - a) / (b - a));
// seeded so the crowd is the same every load
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const rand = (a, b) => a + rnd() * (b - a);

boot().catch((e) => {
  console.warn("[grokmark site] 3D hero unavailable:", e);
  root.classList.add("no-3d");
});

async function boot() {
  if (reduced) root.classList.add("reduced");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setClearColor(0x0c0a10);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0c0a10, 0.04);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);
  scene.add(camera);

  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

  // lights: a warm lamp that rides with the camera, plus rim and key
  scene.add(new THREE.HemisphereLight(0x8a7ab0, 0x1a1220, 0.8));
  const lamp = new THREE.PointLight(0xffd9a0, 28, 18, 2);
  lamp.position.set(0, 0.4, 0.5);
  camera.add(lamp);
  const key = new THREE.DirectionalLight(0xffe0b0, 2.6);
  key.position.set(3, 6, 8);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8a7bff, 1.4);
  rim.position.set(0, 3, -12);
  scene.add(rim);
  const spot = new THREE.SpotLight(0xffe2b8, 220, 22, 0.55, 0.5, 1.5);
  spot.position.set(0, 7, -21);
  spot.target.position.set(0, 0, -26);
  scene.add(spot, spot.target);

  // materials
  const brass = new THREE.MeshStandardMaterial({ color: 0xd8ab4f, metalness: 1, roughness: 0.25, envMapIntensity: 1.2 });
  const velvet = new THREE.MeshPhysicalMaterial({ color: 0x9c1230, roughness: 0.9, sheen: 1, sheenColor: new THREE.Color(0xff5a78), sheenRoughness: 0.5 });
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

  // stanchions: one instanced set along both sides of the carpet
  const SP = 4.4, POSTS = 6, PX = 2.2;
  const posts = [];
  for (let k = 0; k < POSTS; k++) for (const sx of [-1, 1]) posts.push([sx * PX, -SP * k]);
  const baseI = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.55, 0.62, 0.14, 40), brass, posts.length);
  const poleI = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.07, 2.1, 20), brass, posts.length);
  const topI = new THREE.InstancedMesh(new THREE.SphereGeometry(0.17, 24, 16), brass, posts.length);
  const m4 = new THREE.Matrix4();
  posts.forEach(([x, z], i) => {
    baseI.setMatrixAt(i, m4.makeTranslation(x, 0.07, z));
    poleI.setMatrixAt(i, m4.makeTranslation(x, 1.19, z));
    topI.setMatrixAt(i, m4.makeTranslation(x, 2.27, z));
  });
  scene.add(baseI, poleI, topI);

  // ropes: instanced segments running along z, plus the animated gate rope
  const ropePoints = (len, along) =>
    Array.from({ length: 25 }, (_, i) => {
      const t = i / 24, sag = -0.75 * 4 * t * (1 - t);
      return along === "x" ? new THREE.Vector3(len * t, sag, 0) : new THREE.Vector3(0, sag, -len * t);
    });
  const zRope = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ropePoints(SP, "z")), 80, 0.09, 14);
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
  gate.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ropePoints(PX * 2, "x")), 80, 0.09, 14), velvet));
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), brass);
  cap.position.set(PX * 2, 0, 0);
  gate.add(cap);
  scene.add(gate);

  // crowd of Grok Bots: soft colored blobs with two tilted pill eyes
  const PALETTE = [0x111111, 0x00b9a6, 0x925cff, 0x1186ff, 0xff6a00, 0xff9a00, 0xff3399, 0x787878, 0x986a40];
  const squash = (g, x, y, z) => (g.scale(x, y, z), g);
  // eyeY / eyeZ place the eyes on each shape's front face
  const SHAPES = [
    { geo: new THREE.SphereGeometry(0.45, 32, 24), cy: 0.45, eyeY: 0.52, eyeZ: 0.42 },
    { geo: squash(new THREE.SphereGeometry(0.45, 32, 24), 1.2, 0.85, 1), cy: 0.38, eyeY: 0.43, eyeZ: 0.43 },
    { geo: new RoundedBoxGeometry(0.8, 0.8, 0.8, 6, 0.22), cy: 0.4, eyeY: 0.45, eyeZ: 0.4 },
    { geo: squash(new THREE.SphereGeometry(0.42, 32, 24), 0.85, 1.25, 0.85), cy: 0.52, eyeY: 0.62, eyeZ: 0.34 },
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
  for (let i = 0; i < 120; i++) { // the line outside the rope
    const sx = rnd() < 0.5 ? -1 : 1;
    addPerson(sx * rand(3.0, 7.5), rand(-12, 9), 0.04, rand(1.2, 2));
  }
  for (let i = 0; i < 150; i++) { // dancing inside
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
  const eyesGeo = squash(new THREE.CapsuleGeometry(0.045, 0.12, 4, 10), 1, 1, 0.45);
  const eyesI = new THREE.InstancedMesh(eyesGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), people.length * 2);
  scene.add(...blobs, eyesI);
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
    for (const m of [...blobs, eyesI]) m.instanceMatrix.needsUpdate = true;
  }

  // club: arch, overhead light bars, tables
  try { await Promise.race([document.fonts.load('italic 120px "Instrument Serif"'), new Promise((r) => setTimeout(r, 1500))]); } catch { /* fall back to serif */ }
  const label = (text, w, h, size, color, glow) => {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");
    g.textAlign = "center"; g.textBaseline = "middle";
    g.font = `italic ${size}px "Instrument Serif", Georgia, serif`;
    g.shadowColor = glow; g.shadowBlur = size * 0.25;
    g.fillStyle = color;
    g.fillText(text, w / 2, h / 2 + size * 0.04);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
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
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.06, 40), brass);
    top.position.set(x, 1.0, -26);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 16), brass);
    stem.position.set(x, 0.5, -26);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(1.6, 48), new THREE.MeshBasicMaterial({ color: 0xff4de1, transparent: true, opacity: 0.12, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(x, 0.02, -26);
    const card = label(tableLabels[i], 640, 200, 120, "#a89f8f", "#000000");
    card.material.opacity = 0.45; // set dressing: legible up close, not from the door
    card.scale.setScalar(0.42);
    card.position.set(x, 1.55, -26);
    scene.add(top, stem, glow, card);
  });

  // overlay elements
  const fades = [...document.querySelectorAll("[data-fade]")].map((el) => ({ el, r: el.dataset.fade.split(",").map(Number) }));
  const shows = [...document.querySelectorAll("[data-show]")].map((el) => ({ el, r: el.dataset.show.split(",").map(Number) }));
  const trapezoid = (p, [a, b, c, d]) => clamp01(Math.min(seg(p, a, b), 1 - seg(p, c, d)));

  let size = { w: 0, h: 0, narrow: false };
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w === size.w && h === size.h) return;
    size = { w, h, narrow: w / h < 0.85 };
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  addEventListener("resize", resize);

  let target = 0, p = 0, visible = true;
  const onScroll = () => {
    const span = journey.offsetHeight - innerHeight;
    target = reduced ? 0 : clamp01((scrollY - journey.offsetTop) / span);
  };
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(journey);

  const start = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    if (!visible) return;
    resize();
    p += (target - p) * 0.08;
    const t = (now - start) / 1000;

    const travel = smooth(seg(p, 0.2, 0.92));
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

    animateCrowd(t, travel * 1.4);

    for (const { el, r } of fades) {
      const k = 1 - seg(p, r[0], r[1]);
      el.style.opacity = k;
      el.style.transform = `translateY(${(1 - k) * -40}px)`;
      el.style.pointerEvents = k > 0.5 ? "auto" : "none";
    }
    for (const { el, r } of shows) {
      const k = trapezoid(p, r);
      el.style.opacity = k;
      el.classList.toggle("on", k > 0.5);
    }
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}
