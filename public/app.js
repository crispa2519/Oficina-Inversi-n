import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// =====================================================================
//  Estado
// =====================================================================
const state = {
  roster: null,
  agents: new Map(), // id -> { def, state, message, log:[], report, mesh refs }
  sectors: new Map(),
  selected: null,
  running: false,
  finalReport: null,
  finalFile: null,
  demo: false,
};
const $ = (s) => document.querySelector(s);
const STATE_COLORS = { idle: 0x64748b, queued: 0xa78bfa, working: 0xf59e0b, done: 0x22c55e, error: 0xef4444 };
const STATE_LABEL = { idle: 'Inactivo', queued: 'En cola', working: 'Trabajando', done: 'Informe entregado', error: 'Error' };
const ROLE_SHIRT = { fundamental: 0x1e3a8a, technical: 0x065f46, manager: 0x1f2937, director: 0x111111 };

// =====================================================================
//  Escena
// =====================================================================
const container = $('#scene');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
container.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(innerWidth, innerHeight);
Object.assign(labelRenderer.domElement.style, { position: 'absolute', top: '0', pointerEvents: 'none' });
container.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1020);
scene.fog = new THREE.Fog(0x0b1020, 60, 120);

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 400);
const HOME = { pos: new THREE.Vector3(0, 36, 52), target: new THREE.Vector3(0, 0, 2) };
camera.position.copy(HOME.pos);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.47;
controls.minDistance = 8;
controls.maxDistance = 95;
controls.target.copy(HOME.target);

scene.add(new THREE.HemisphereLight(0xbfd7ff, 0x1a1f2e, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(25, 45, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 120 });
scene.add(sun);

// Piso y paredes
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(48, 96),
  new THREE.MeshStandardMaterial({ color: 0x1b2236, roughness: 0.85, metalness: 0.05 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const grid = new THREE.PolarGridHelper(48, 12, 8, 96, 0x26304a, 0x222a40);
grid.position.y = 0.01;
scene.add(grid);
const wall = new THREE.Mesh(
  new THREE.CylinderGeometry(48, 48, 7, 96, 1, true),
  new THREE.MeshStandardMaterial({ color: 0x131a2e, side: THREE.BackSide, roughness: 0.9 }),
);
wall.position.y = 3.5;
scene.add(wall);
// Franja de luz en la pared
const strip = new THREE.Mesh(new THREE.TorusGeometry(47.8, 0.06, 6, 160), new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
strip.rotation.x = Math.PI / 2;
strip.position.y = 6.2;
scene.add(strip);

// =====================================================================
//  Utilidades de construcción
// =====================================================================
const mats = {
  desk: new THREE.MeshStandardMaterial({ color: 0xd7c8ae, roughness: 0.6 }),
  deskDark: new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.5, metalness: 0.4 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x9aa3b2, roughness: 0.35, metalness: 0.8 }),
  chair: new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.7 }),
  skin: [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 })),
  hair: [0x1f1309, 0x3b2314, 0x6b4423, 0x111111, 0x9c7a4b].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 })),
  pot: new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.6 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x2f7d4a, roughness: 0.8, flatShading: true }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0x9cc7ff, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.1, side: THREE.DoubleSide }),
};

function shadowed(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeDesk(w = 3.2, d = 1.6, executive = false) {
  const g = new THREE.Group();
  const top = shadowed(new THREE.Mesh(new RoundedBoxGeometry(w, 0.12, d, 2, 0.04), executive ? mats.deskDark : mats.desk));
  top.position.y = 1.05;
  g.add(top);
  if (executive) {
    const front = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, 1.0, 0.08), mats.deskDark));
    front.position.set(0, 0.52, d / 2 - 0.1);
    g.add(front);
  }
  for (const sx of [-1, 1]) {
    const leg = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, d * 0.9), mats.metal));
    leg.position.set(sx * (w / 2 - 0.15), 0.5, 0);
    g.add(leg);
  }
  return g;
}

// Pantallas con textura de canvas animada
const screens = [];
function makeScreen(kind, color, w = 1.3, h = 0.8) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 160;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const g = new THREE.Group();
  const frame = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, h + 0.08, 0.05), mats.deskDark));
  g.add(frame);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  panel.position.z = 0.03;
  g.add(panel);
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.4), mats.metal);
  stand.position.y = -h / 2 - 0.2;
  g.add(stand);
  const s = { canvas, ctx: canvas.getContext('2d'), tex, kind, color, active: false, seed: Math.random() * 1000, data: null };
  drawScreen(s, 0);
  screens.push(s);
  return { group: g, screen: s };
}

function drawScreen(s, t) {
  const { ctx, canvas } = s;
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = s.active ? '#07101f' : '#0a0f1a';
  ctx.fillRect(0, 0, W, H);
  const col = s.color;
  if (!s.active && !s.done) {
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('◆', W / 2 - 8, H / 2 + 6);
    s.tex.needsUpdate = true;
    return;
  }
  ctx.strokeStyle = 'rgba(148,163,184,.12)';
  for (let y = 20; y < H; y += 28) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  const shift = s.active ? Math.floor(t * 4) : 0;
  if (s.kind === 'technical') {
    // velas
    let p = 80;
    for (let i = 0; i < 26; i++) {
      const r = Math.sin((i + shift + s.seed) * 1.7) * 0.5 + Math.sin((i + shift) * 0.37 + s.seed) * 0.8;
      const o = p, c = p - r * 9;
      const hi = Math.min(o, c) - 6, lo = Math.max(o, c) + 6;
      const x = 8 + i * 9.4;
      ctx.strokeStyle = ctx.fillStyle = c < o ? '#22c55e' : '#ef4444';
      ctx.beginPath(); ctx.moveTo(x + 3, hi); ctx.lineTo(x + 3, lo); ctx.stroke();
      ctx.fillRect(x, Math.min(o, c), 6, Math.max(2, Math.abs(c - o)));
      p = Math.max(30, Math.min(135, c));
    }
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i < 26; i++) { const y = 80 + Math.sin((i + shift) * 0.25 + s.seed) * 22; i ? ctx.lineTo(11 + i * 9.4, y) : ctx.moveTo(11, y); }
    ctx.stroke(); ctx.lineWidth = 1;
  } else if (s.kind === 'fundamental') {
    for (let i = 0; i < 8; i++) {
      const v = 30 + Math.abs(Math.sin(i * 1.3 + s.seed + shift * 0.15)) * 90;
      ctx.fillStyle = i % 2 ? col : '#38bdf8';
      ctx.fillRect(14 + i * 29, H - 14 - v, 18, v);
    }
    ctx.fillStyle = '#cbd5e1'; ctx.font = '11px monospace';
    ctx.fillText('P/E  EV/EBITDA  FCF', 10, 14);
  } else {
    // dashboard del gerente / director
    ctx.fillStyle = col; ctx.font = 'bold 13px sans-serif';
    ctx.fillText(s.kind === 'director' ? 'COMITÉ DE INVERSIÓN' : 'SÍNTESIS DEL RUBRO', 10, 18);
    for (let i = 0; i < 5; i++) {
      const w = 40 + Math.abs(Math.sin(i * 2.1 + s.seed + shift * 0.1)) * 170;
      ctx.fillStyle = 'rgba(148,163,184,.25)'; ctx.fillRect(10, 32 + i * 24, 230, 12);
      ctx.fillStyle = i === 0 ? '#22c55e' : i === 4 ? '#ef4444' : col; ctx.fillRect(10, 32 + i * 24, w, 12);
    }
  }
  if (s.done && !s.active) {
    ctx.fillStyle = 'rgba(34,197,94,.9)'; ctx.font = 'bold 14px sans-serif'; ctx.fillText('✔ ENTREGADO', W - 112, H - 10);
  }
  s.tex.needsUpdate = true;
}

function makeChair() {
  const g = new THREE.Group();
  const seat = shadowed(new THREE.Mesh(new RoundedBoxGeometry(0.8, 0.12, 0.8, 2, 0.04), mats.chair));
  seat.position.y = 0.65;
  const back = shadowed(new THREE.Mesh(new RoundedBoxGeometry(0.8, 0.9, 0.1, 2, 0.04), mats.chair));
  back.position.set(0, 1.15, 0.38);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.55), mats.metal);
  post.position.y = 0.32;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.05, 5), mats.metal);
  base.position.y = 0.05;
  g.add(seat, back, post, base);
  return g;
}

function makePerson(shirtColor, accentColor, seed = 0, scale = 1) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.6 });
  const body = shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(0.33, 0.55, 6, 14), shirt));
  body.position.y = 1.25;
  const tie = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.4, 0.02), new THREE.MeshStandardMaterial({ color: accentColor, emissive: accentColor, emissiveIntensity: 0.25 }));
  tie.position.set(0, 1.38, -0.33);
  const head = new THREE.Group();
  head.position.y = 2.02;
  const skull = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.27, 20, 16), mats.skin[seed % mats.skin.length]));
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.285, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), mats.hair[(seed * 3) % mats.hair.length]);
  hair.position.y = 0.02;
  hair.rotation.x = 0.25;
  head.add(skull, hair);
  const arms = [];
  for (const sx of [-1, 1]) {
    const arm = shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.5, 4, 8), shirt));
    arm.position.set(sx * 0.42, 1.3, -0.25);
    arm.rotation.x = -1.1;
    arms.push(arm);
    g.add(arm);
  }
  g.add(body, tie, head);
  g.scale.setScalar(scale);
  return { group: g, head, arms };
}

function makePlant(x, z, s = 1) {
  const g = new THREE.Group();
  const pot = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.3, 0.7, 14), mats.pot));
  pot.position.y = 0.35;
  g.add(pot);
  for (let i = 0; i < 4; i++) {
    const leaf = shadowed(new THREE.Mesh(new THREE.IcosahedronGeometry(0.45 - i * 0.05, 0), mats.leaf));
    leaf.position.set(Math.sin(i * 2) * 0.2, 1.0 + i * 0.35, Math.cos(i * 2) * 0.2);
    g.add(leaf);
  }
  g.position.set(x, 0, z);
  g.scale.setScalar(s);
  scene.add(g);
}

function statusRing() {
  const m = new THREE.MeshBasicMaterial({ color: STATE_COLORS.idle, transparent: true, opacity: 0.85 });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 40), m);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  return ring;
}

function label(text, sub = '') {
  const div = document.createElement('div');
  div.className = 'label3d';
  div.innerHTML = `<div class="n"></div><div class="s"></div>`;
  div.querySelector('.n').textContent = text;
  div.querySelector('.s').textContent = sub;
  return { obj: new CSS2DObject(div), div };
}

// =====================================================================
//  Construcción de la oficina
// =====================================================================
const pickables = [];
const POD_RADIUS = 24;
const sectorBars = new Map();

function placeAgent(def, worldPos, faceTarget, kind, color, opts = {}) {
  const root = new THREE.Group();
  root.position.copy(worldPos);
  root.lookAt(faceTarget.x, 0, faceTarget.z);
  root.rotateY(Math.PI); // los modelos miran a -Z; dejamos el escritorio delante, hacia el objetivo
  scene.add(root);

  // escritorio adelante (hacia -Z local)
  const desk = makeDesk(opts.deskW ?? 3.0, opts.deskD ?? 1.5, opts.executive);
  desk.position.z = -1.2;
  root.add(desk);
  const screenCount = opts.screens ?? 2;
  const scr = [];
  for (let i = 0; i < screenCount; i++) {
    const { group, screen } = makeScreen(kind, color, opts.screenW ?? 1.15, opts.screenH ?? 0.72);
    const off = (i - (screenCount - 1) / 2) * ((opts.screenW ?? 1.15) + 0.1);
    group.position.set(off, 1.1 + 0.4 + (opts.screenH ?? 0.72) / 2, -1.6);
    group.rotation.y = -off * 0.25; // panel hacia la persona
    root.add(group);
    scr.push(screen);
  }
  const chair = makeChair();
  chair.rotation.y = 0;
  root.add(chair);
  const seed = [...def.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const person = makePerson(ROLE_SHIRT[def.role], color, seed, opts.scale ?? 1);
  person.group.position.set(0, -0.15, 0.05);
  root.add(person.group);
  const ring = statusRing();
  ring.scale.setScalar(opts.scale ?? 1);
  root.add(ring);

  // Hitbox invisible para clics
  const hit = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 2.6, 10), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = 1.3;
  hit.userData.agentId = def.id;
  root.add(hit);
  pickables.push(hit);

  const { obj, div } = label(def.name.split(' · ')[0], STATE_LABEL.idle);
  obj.position.set(0, 2.9 * (opts.scale ?? 1), 0);
  root.add(obj);

  // punto luminoso para animación de "pensando"
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), new THREE.MeshBasicMaterial({ color: STATE_COLORS.working }));
  bulb.position.set(0, 2.55 * (opts.scale ?? 1), 0);
  bulb.visible = false;
  root.add(bulb);

  const a = state.agents.get(def.id);
  Object.assign(a, { root, person, ring, screens: scr, labelDiv: div, bulb, anchor: new THREE.Vector3() });
  root.updateMatrixWorld(true);
  a.anchor.setFromMatrixPosition(person.head.matrixWorld);
}

function buildOffice(roster) {
  const center = new THREE.Vector3(0, 0, 0);
  roster.sectors.forEach((sector, i) => {
    const ang = (i / roster.sectors.length) * Math.PI * 2 - Math.PI / 2;
    const dir = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
    const podCenter = dir.clone().multiplyScalar(POD_RADIUS);
    const color = new THREE.Color(sector.color);
    const side = new THREE.Vector3(-dir.z, 0, dir.x);

    // alfombra del rubro
    const rug = new THREE.Mesh(
      new THREE.CircleGeometry(7.2, 6),
      new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.35), roughness: 0.95 }),
    );
    rug.rotation.x = -Math.PI / 2;
    rug.rotation.z = -ang;
    rug.position.set(podCenter.x, 0.02, podCenter.z);
    rug.receiveShadow = true;
    scene.add(rug);
    const edge = new THREE.Mesh(new THREE.RingGeometry(7.05, 7.25, 6), new THREE.MeshBasicMaterial({ color }));
    edge.rotation.copy(rug.rotation);
    edge.position.set(podCenter.x, 0.03, podCenter.z);
    scene.add(edge);

    // Cartel del rubro
    const sign = document.createElement('div');
    sign.className = 'sector3d';
    sign.style.background = sector.color;
    sign.innerHTML = `${sector.name}<small>Mesa de research</small>`;
    const signObj = new CSS2DObject(sign);
    const signPos = dir.clone().multiplyScalar(POD_RADIUS + 6.5);
    signObj.position.set(signPos.x, 5.6, signPos.z);
    scene.add(signObj);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5), mats.metal);
    post.position.set(signPos.x, 2.5, signPos.z);
    scene.add(post);

    // Analistas (atrás) y gerente (adelante, más cerca del director)
    const fundPos = podCenter.clone().add(side.clone().multiplyScalar(-3.2)).add(dir.clone().multiplyScalar(2.6));
    const techPos = podCenter.clone().add(side.clone().multiplyScalar(3.2)).add(dir.clone().multiplyScalar(2.6));
    const mgrPos = podCenter.clone().add(dir.clone().multiplyScalar(-3.4));
    const fundDef = state.agents.get(`${sector.id}-fundamental`).def;
    const techDef = state.agents.get(`${sector.id}-technical`).def;
    const mgrDef = state.agents.get(`${sector.id}-manager`).def;
    // analistas miran hacia afuera (escritorio contra el exterior), gerente mira al centro
    placeAgent(fundDef, fundPos, fundPos.clone().add(dir), 'fundamental', sector.color);
    placeAgent(techDef, techPos, techPos.clone().add(dir), 'technical', sector.color);
    placeAgent(mgrDef, mgrPos, center, 'manager', sector.color, { executive: true, deskW: 3.4, screens: 1, screenW: 1.6, screenH: 0.9, scale: 1.05 });

    makePlant(podCenter.x + side.x * 6, podCenter.z + side.z * 6, 0.9);
    makePlant(podCenter.x - side.x * 6, podCenter.z - side.z * 6, 0.9);

    // Barra de convicción alrededor del director
    const barPos = dir.clone().multiplyScalar(9.2);
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 1, 0.7),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, transparent: true, opacity: 0.85 }),
    );
    bar.position.set(barPos.x, 0.05, barPos.z);
    bar.scale.y = 0.1;
    scene.add(bar);
    const bdiv = document.createElement('div');
    bdiv.className = 'label3d';
    bdiv.innerHTML = `<div class="n" style="border-color:${sector.color}">—</div>`;
    const bl = new CSS2DObject(bdiv);
    bl.position.set(barPos.x, 1, barPos.z);
    scene.add(bl);
    sectorBars.set(sector.id, { bar, label: bl, div: bdiv, target: 0.1 });
  });

  // Plataforma del director
  const plat = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(7, 7.4, 0.5, 64), mats.deskDark));
  plat.position.y = 0.25;
  scene.add(plat);
  const platRing = new THREE.Mesh(new THREE.TorusGeometry(7.05, 0.05, 6, 100), new THREE.MeshBasicMaterial({ color: 0xf5c451 }));
  platRing.rotation.x = Math.PI / 2;
  platRing.position.y = 0.52;
  scene.add(platRing);
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(6.8, 6.8, 3.2, 64, 1, true, 0.5, Math.PI * 2 - 1), mats.glass);
  glass.position.y = 2.1;
  scene.add(glass);

  const dirDef = state.agents.get('director').def;
  placeAgent(dirDef, new THREE.Vector3(0, 0.5, -1.2), new THREE.Vector3(0, 0, 30), 'director', '#f5c451', {
    executive: true, deskW: 4.2, deskD: 1.9, screens: 3, screenW: 1.25, screenH: 0.8, scale: 1.12,
  });

  // Holograma central
  const holo = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.9, 1),
    new THREE.MeshBasicMaterial({ color: 0xf5c451, wireframe: true, transparent: true, opacity: 0.7 }),
  );
  holo.position.set(0, 5.2, 0);
  holo.name = 'holo';
  scene.add(holo);

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    makePlant(Math.cos(a) * 42, Math.sin(a) * 42, 1.3);
  }
}

// =====================================================================
//  Paquetes de información (handoffs)
// =====================================================================
const packets = [];
function sendPacket(fromId, toId, color = 0x38bdf8) {
  const a = state.agents.get(fromId), b = state.agents.get(toId);
  if (!a?.root || !b?.root) return;
  const p0 = a.anchor.clone().add(new THREE.Vector3(0, 0.6, 0));
  const p2 = b.anchor.clone().add(new THREE.Vector3(0, 0.6, 0));
  const mid = p0.clone().lerp(p2, 0.5);
  mid.y += 4 + p0.distanceTo(p2) * 0.15;
  const curve = new THREE.QuadraticBezierCurve3(p0, mid, p2);
  const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), new THREE.MeshBasicMaterial({ color }));
  const trailGeo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(40));
  const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35 }));
  scene.add(mesh, trail);
  packets.push({ curve, mesh, trail, t: 0, speed: 0.35 + Math.random() * 0.1 });
}

// =====================================================================
//  UI: organigrama y panel
// =====================================================================
function buildOrg(roster) {
  const list = $('#orgList');
  list.innerHTML = '';
  const dir = document.createElement('div');
  dir.className = 'org-dir';
  dir.appendChild(orgRow('director', '★ Director de Inversiones'));
  list.appendChild(dir);
  for (const s of roster.sectors) {
    const box = document.createElement('div');
    box.className = 'org-sector';
    const h = document.createElement('div');
    h.className = 'sh';
    h.innerHTML = `<span class="sw" style="background:${s.color}"></span><span></span><span class="score" id="score-${s.id}"></span>`;
    h.children[1].textContent = s.name;
    box.appendChild(h);
    box.appendChild(orgRow(`${s.id}-manager`, 'Gerente'));
    box.appendChild(orgRow(`${s.id}-fundamental`, 'Analista Fundamental'));
    box.appendChild(orgRow(`${s.id}-technical`, 'Analista Técnico'));
    list.appendChild(box);
  }
}
function orgRow(id, text) {
  const row = document.createElement('div');
  row.className = 'org-agent';
  row.dataset.id = id;
  row.innerHTML = `<i class="dot idle"></i><span></span>`;
  row.children[1].textContent = text;
  row.onclick = () => selectAgent(id, true);
  return row;
}

function renderMarkdown(el, md) {
  el.innerHTML = DOMPurify.sanitize(marked.parse(md || ''));
  el.querySelectorAll('a').forEach((a) => { a.target = '_blank'; a.rel = 'noopener'; });
}

function selectAgent(id, focus = false) {
  state.selected = id;
  document.querySelectorAll('.org-agent').forEach((r) => r.classList.toggle('sel', r.dataset.id === id));
  const a = state.agents.get(id);
  const sector = a.def.sector ? state.sectors.get(a.def.sector) : null;
  $('#panel').classList.remove('hidden');
  const chip = $('#pSector');
  chip.textContent = sector ? sector.name : 'Dirección';
  chip.style.background = sector ? sector.color : '#f5c451';
  $('#pName').textContent = a.def.name;
  $('#pTitle').textContent = a.def.title;
  refreshPanel();
  if (focus && a.root) focusOn(a.anchor);
}

function refreshPanel() {
  const id = state.selected;
  if (!id) return;
  const a = state.agents.get(id);
  $('#pState').innerHTML = `<i class="dot ${a.state}"></i><span></span>`;
  $('#pState span').textContent = `${STATE_LABEL[a.state]}${a.message && a.state !== 'done' ? ' — ' + a.message : ''}`;
  const log = $('#pLog');
  log.innerHTML = '';
  for (const l of a.log.slice(-60)) {
    const li = document.createElement('li');
    li.textContent = l;
    log.appendChild(li);
  }
  log.scrollTop = log.scrollHeight;
  if (a.report) {
    if (a._rendered !== a.report) { renderMarkdown($('#pReport'), a.report); a._rendered = a.report; }
  } else {
    $('#pReport').innerHTML = `<p class="muted">${a.state === 'working' ? 'Trabajando en el informe…' : 'Todavía no hay informe.'}</p>`;
    a._rendered = null;
  }
  $('#pDownload').disabled = !a.report;
}

function download(name, text) {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('#panelClose').onclick = () => { $('#panel').classList.add('hidden'); state.selected = null; document.querySelectorAll('.org-agent').forEach((r) => r.classList.remove('sel')); };
$('#pDownload').onclick = () => { const a = state.agents.get(state.selected); if (a?.report) download(`${a.def.id}.md`, a.report); };
$('#finalBtn').onclick = openFinal;
$('#mClose').onclick = () => $('#modal').classList.add('hidden');
$('#modal').onclick = (e) => { if (e.target.id === 'modal') $('#modal').classList.add('hidden'); };
$('#mPrint').onclick = () => window.print();
$('#mDownload').onclick = () => state.finalReport && download(state.finalFile || 'informe-director.md', state.finalReport);
function openFinal() {
  if (!state.finalReport) return;
  renderMarkdown($('#mReport'), state.finalReport);
  $('#modal').classList.remove('hidden');
}

function toast(msg, ms = 4000) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), ms);
}

// =====================================================================
//  Cámara
// =====================================================================
let camTween = null;
function focusOn(target) {
  const to = target.clone();
  const offset = camera.position.clone().sub(controls.target).normalize().multiplyScalar(14);
  offset.y = Math.max(offset.y, 6);
  camTween = { fromT: controls.target.clone(), toT: to, fromP: camera.position.clone(), toP: to.clone().add(offset), k: 0 };
}

function goHome() {
  camTween = { fromT: controls.target.clone(), toT: HOME.target.clone(), fromP: camera.position.clone(), toP: HOME.pos.clone(), k: 0 };
}
$('#homeBtn').onclick = goHome;
addEventListener('keydown', (e) => { if (e.key === 'Escape') { $('#modal').classList.add('hidden'); } });

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downAt = null;
renderer.domElement.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(pickables, false)[0];
  if (hit) selectAgent(hit.object.userData.agentId, true);
});
renderer.domElement.addEventListener('pointermove', (e) => {
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  renderer.domElement.style.cursor = raycaster.intersectObjects(pickables, false).length ? 'pointer' : 'grab';
});

// =====================================================================
//  Estado de agentes
// =====================================================================
function setAgentState(id, st, message = '') {
  const a = state.agents.get(id);
  if (!a) return;
  a.state = st;
  a.message = message;
  if (a.ring) a.ring.material.color.setHex(STATE_COLORS[st]);
  if (a.labelDiv) {
    a.labelDiv.className = `label3d ${st}`;
    a.labelDiv.querySelector('.s').textContent = STATE_LABEL[st];
  }
  for (const s of a.screens || []) { s.active = st === 'working'; s.done = st === 'done'; drawScreen(s, 0); }
  if (a.bulb) a.bulb.visible = st === 'working';
  const row = document.querySelector(`.org-agent[data-id="${id}"] .dot`);
  if (row) row.className = `dot ${st}`;
  updateProgress();
  if (state.selected === id) refreshPanel();
}

function updateProgress() {
  const total = state.agents.size;
  const done = [...state.agents.values()].filter((a) => a.state === 'done' || a.state === 'error').length;
  $('#progressBar').style.width = `${(done / total) * 100}%`;
  $('#progressText').textContent = `${done} / ${total} agentes`;
}

function resetAll() {
  for (const [id, a] of state.agents) { a.log = []; a.report = null; setAgentState(id, 'idle'); }
  for (const [sid, b] of sectorBars) { b.target = 0.1; b.div.firstElementChild.textContent = '—'; const el = $(`#score-${sid}`); if (el) el.textContent = ''; }
  state.finalReport = null;
  $('#finalBtn').disabled = true;
}

function setRunning(r) {
  state.running = r;
  $('#runBtn').disabled = r;
  $('#stopBtn').disabled = !r;
}

// =====================================================================
//  Eventos del servidor (SSE)
// =====================================================================
function handleEvent(e) {
  switch (e.type) {
    case 'hello':
      setRunning(e.running);
      break;
    case 'start':
      resetAll();
      state.demo = e.demo;
      setRunning(true);
      if (!e.replay) toast(e.demo ? 'Análisis iniciado en MODO DEMO (datos simulados).' : 'Análisis en vivo iniciado: los agentes están investigando el mercado.');
      break;
    case 'status':
      setAgentState(e.agentId, e.state, e.message);
      if (e.state === 'error') state.agents.get(e.agentId)?.log.push(`✖ ${e.message}`);
      break;
    case 'activity': {
      const a = state.agents.get(e.agentId);
      if (!a) break;
      if (e.kind === 'search') a.log.push(`🔎 ${e.query}`);
      else if (e.kind === 'info') a.log.push(`ℹ ${e.message}`);
      else if (e.kind === 'text') a.log.push(`✍ redactando… (${e.chars.toLocaleString('es-AR')} caracteres)`);
      if (e.kind === 'search') {
        a.message = `Buscando: ${e.query}`;
        if (a.labelDiv) a.labelDiv.querySelector('.s').textContent = `🔎 ${e.query}`;
      }
      if (state.selected === e.agentId) refreshPanel();
      break;
    }
    case 'report': {
      const a = state.agents.get(e.agentId);
      if (!a) break;
      a.report = e.markdown;
      if (e.usage) a.log.push(`Σ ${e.usage.searches} búsquedas · ${e.usage.input_tokens.toLocaleString('es-AR')} tokens entrada · ${e.usage.output_tokens.toLocaleString('es-AR')} salida`);
      if (e.agentId === 'director') { state.finalReport = e.markdown; $('#finalBtn').disabled = false; }
      if (state.selected === e.agentId) refreshPanel();
      break;
    }
    case 'handoff':
      if (!e.replay) {
        const color = e.to === 'director' ? 0xf5c451 : 0x38bdf8;
        e.from.forEach((f, i) => setTimeout(() => sendPacket(f, e.to, color), i * 180));
      }
      break;
    case 'sector-summary': {
      const b = sectorBars.get(e.sector);
      if (b && e.conviction) {
        b.target = e.conviction * 0.6;
        b.div.firstElementChild.textContent = `${e.conviction}/10${e.recommendation ? ' · ' + e.recommendation.slice(0, 5) + '.' : ''}`;
      }
      const el = $(`#score-${e.sector}`);
      if (el && e.conviction) el.textContent = `Convicción ${e.conviction}/10 · ${e.recommendation ?? ''}`;
      break;
    }
    case 'complete':
      setRunning(false);
      state.finalFile = e.file;
      if (!e.replay) { toast('✅ El Director entregó el informe centralizado.', 6000); openFinal(); }
      break;
    case 'fatal':
      setRunning(false);
      if (!e.replay) toast(`⚠ ${e.message}`, 7000);
      break;
  }
}

function connect() {
  const es = new EventSource('/api/events');
  es.onmessage = (m) => { try { handleEvent(JSON.parse(m.data)); } catch (err) { console.error(err); } };
  es.onerror = () => { /* EventSource reintenta solo */ };
}

$('#runForm').onsubmit = async (ev) => {
  ev.preventDefault();
  const f = new FormData(ev.target);
  const body = { profile: { risk: f.get('risk'), horizon: f.get('horizon'), notes: f.get('notes') }, demo: f.get('demo') === 'on' };
  const r = await fetch('/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) toast((await r.json().catch(() => ({}))).error || 'No se pudo iniciar.');
};
$('#stopBtn').onclick = () => fetch('/api/stop', { method: 'POST' });

// =====================================================================
//  Bucle de animación
// =====================================================================
const clock = new THREE.Clock();
let screenTimer = 0;
function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (camTween) {
    camTween.k = Math.min(1, camTween.k + dt * 1.5);
    const k = 1 - Math.pow(1 - camTween.k, 3);
    controls.target.lerpVectors(camTween.fromT, camTween.toT, k);
    camera.position.lerpVectors(camTween.fromP, camTween.toP, k);
    if (camTween.k >= 1) camTween = null;
  }
  controls.update();

  for (const a of state.agents.values()) {
    if (!a.person) continue;
    const working = a.state === 'working';
    const ph = a.def.id.length;
    a.person.head.rotation.x = working ? Math.sin(t * 3 + ph) * 0.08 - 0.1 : Math.sin(t * 0.6 + ph) * 0.04;
    a.person.head.rotation.y = working ? Math.sin(t * 1.3 + ph) * 0.25 : Math.sin(t * 0.4 + ph) * 0.15;
    a.person.arms.forEach((arm, i) => { arm.rotation.x = -1.1 + (working ? Math.sin(t * 14 + i * Math.PI) * 0.12 : 0); });
    if (a.bulb?.visible) { a.bulb.position.y = 2.55 + Math.sin(t * 4) * 0.12; a.bulb.material.color.setHSL(0.1, 1, 0.5 + Math.sin(t * 6) * 0.2); }
    if (a.ring && a.state === 'working') a.ring.material.opacity = 0.55 + Math.sin(t * 5) * 0.3;
    else if (a.ring) a.ring.material.opacity = 0.85;
  }

  screenTimer += dt;
  if (screenTimer > 0.25) {
    screenTimer = 0;
    for (const s of screens) if (s.active) drawScreen(s, t);
  }

  for (const b of sectorBars.values()) {
    b.bar.scale.y += (b.target - b.bar.scale.y) * Math.min(1, dt * 2);
    b.bar.position.y = 0.5 + b.bar.scale.y / 2;
    b.label.position.y = 0.9 + b.bar.scale.y + 0.4;
  }

  for (let i = packets.length - 1; i >= 0; i--) {
    const p = packets[i];
    p.t += dt * p.speed;
    if (p.t >= 1) {
      scene.remove(p.mesh, p.trail);
      p.mesh.geometry.dispose(); p.trail.geometry.dispose();
      packets.splice(i, 1);
      continue;
    }
    p.mesh.position.copy(p.curve.getPoint(p.t));
    p.mesh.rotation.y += dt * 6;
    p.trail.material.opacity = 0.35 * (1 - p.t);
  }

  const holo = scene.getObjectByName('holo');
  if (holo) {
    holo.rotation.y += dt * 0.6;
    holo.rotation.x += dt * 0.2;
    const dirState = state.agents.get('director')?.state;
    holo.material.color.setHex(dirState === 'done' ? 0x22c55e : dirState === 'working' ? 0xf59e0b : 0xf5c451);
  }
  strip.material.color.setHSL(0.55 + Math.sin(t * 0.2) * 0.05, 0.9, 0.55);

  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
  requestAnimationFrame(animate);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  labelRenderer.setSize(innerWidth, innerHeight);
});

// =====================================================================
//  Inicio
// =====================================================================
(async function init() {
  const roster = await (await fetch('/api/roster')).json();
  state.roster = roster;
  for (const s of roster.sectors) state.sectors.set(s.id, s);
  for (const def of roster.agents) state.agents.set(def.id, { def, state: 'idle', message: '', log: [], report: null });
  const badge = $('#mode');
  badge.textContent = roster.live ? 'EN VIVO · CLAUDE + WEB' : 'MODO DEMO';
  badge.className = `badge ${roster.live ? 'live' : 'demo'}`;
  if (!roster.live) $('#demoWrap').style.display = 'none';
  buildOrg(roster);
  buildOffice(roster);
  updateProgress();
  connect();
  animate();
})();
