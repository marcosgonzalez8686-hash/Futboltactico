// Vista 3D del partido: jugadores de bloques con animaciones sobre el tablero.
// No contiene reglas: recibe el estado ya calculado por index.html y avisa de los toques
// sobre fichas o casillas para que el juego los procese igual que en el tablero 2D.
import * as THREE from './vendor/three.module.min.js';
import { buildStadiumShell } from './stadium3d.js?v=46';

const COLS = 14, ROWS = 9;
const GOAL_COL_W = 0.62;
const HALF_L = 6 + GOAL_COL_W;   // incluye las columnas de portería
const HALF_W = ROWS/2;
const GOAL_DEPTH = 0.55, GOAL_H = 0.85, GOAL_HALF = 1.5; // boca: filas 3 a 5
const BALL_R = 0.12;

// Centro de una casilla en coordenadas 3D (X a lo largo del campo, Z a lo ancho)
function cellX(col){
  if(col <= 0) return -6 - GOAL_COL_W/2;
  if(col >= COLS-1) return 6 + GOAL_COL_W/2;
  return col - 6.5;
}
function cellZ(row){ return row - 4; }

function pitchTexture(){
  const PX = 100;
  const W = Math.round(2*HALF_L*PX), H = ROWS*PX;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const X = x=> (x + HALF_L)*PX, Z = z=> (z + HALF_W)*PX;
  // Zona exterior (columnas de portería)
  g.fillStyle = '#163b2a'; g.fillRect(0, 0, W, H);
  // Franjas por columna, como en el tablero
  for(let c=1;c<=12;c++){
    const grad = g.createLinearGradient(0, 0, 0, H);
    const base = c%2===0 ? ['#25573d','#214f37'] : ['#2e6a4a','#2a6243'];
    grad.addColorStop(0, base[0]); grad.addColorStop(0.5, base[1]); grad.addColorStop(1, base[0]);
    g.fillStyle = grad;
    g.fillRect(X(c-7), 0, PX+1, H);
  }
  // Rejilla suave para leer las casillas
  g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1.5;
  for(let c=0;c<=12;c++){ g.beginPath(); g.moveTo(X(c-6), 0); g.lineTo(X(c-6), H); g.stroke(); }
  for(let r=0;r<=ROWS;r++){ g.beginPath(); g.moveTo(X(-6), r*PX); g.lineTo(X(6), r*PX); g.stroke(); }
  // Líneas del campo (mismas medidas que el tablero 2D)
  g.strokeStyle = 'rgba(241,250,238,.85)'; g.lineWidth = 4;
  const line = (x1,z1,x2,z2)=>{ g.beginPath(); g.moveTo(X(x1),Z(z1)); g.lineTo(X(x2),Z(z2)); g.stroke(); };
  g.strokeRect(X(-6), Z(-4.46), 12*PX, 8.92*PX);
  line(0,-4.5,0,4.5);
  g.beginPath(); g.arc(X(0), Z(0), 1.3*PX, 0, Math.PI*2); g.stroke();
  g.fillStyle = 'rgba(241,250,238,.9)';
  g.beginPath(); g.arc(X(0), Z(0), 6, 0, Math.PI*2); g.fill();
  [[-6,1],[6,-1]].forEach(([gx,dir])=>{
    const bx = dir>0 ? gx : gx-2, sx = dir>0 ? gx : gx-0.8;
    g.strokeRect(X(bx), Z(-3), 2*PX, 6*PX);
    g.strokeRect(X(sx), Z(-1.9), 0.8*PX, 3.8*PX);
    g.beginPath(); g.arc(X(gx+dir*1.45), Z(0), 6, 0, Math.PI*2); g.fill();
    const ax = gx + dir*1.45, a0 = Math.acos(0.55);
    g.beginPath();
    if(dir>0) g.arc(X(ax), Z(0), PX, -a0, a0); else g.arc(X(ax), Z(0), PX, Math.PI-a0, Math.PI+a0);
    g.stroke();
  });
  // Córners
  [[-6,-4.46,0],[6,-4.46,Math.PI/2],[6,4.46,Math.PI],[-6,4.46,-Math.PI/2]].forEach(([x,z,a])=>{
    g.beginPath(); g.arc(X(x), Z(z), 0.36*PX, a, a+Math.PI/2); g.stroke();
  });
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function netTexture(){
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 2;
  for(let i=0;i<=64;i+=16){
    g.beginPath(); g.moveTo(i,0); g.lineTo(i,64); g.stroke();
    g.beginPath(); g.moveTo(0,i); g.lineTo(64,i); g.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function ballTexture(){
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = '#f7f7f2'; g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#1d1d1d';
  const spots = [[32,64],[96,30],[96,98],[160,64],[224,30],[224,98],[0,30],[0,98],[256,30],[256,98],[128,0],[128,128]];
  spots.forEach(([x,y])=>{
    g.beginPath();
    for(let i=0;i<5;i++){
      const a = -Math.PI/2 + i*2*Math.PI/5;
      g.lineTo(x + Math.cos(a)*13, y + Math.sin(a)*13);
    }
    g.closePath(); g.fill();
  });
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Camiseta: color del equipo y dorsal (grande en la espalda, pequeño en el pecho)
const shirtTexCache = new Map();
function shirtTexture(kit, text, label, big, isGK){
  const key = [kit, text, label, big ? 1 : 0, isGK ? 1 : 0].join('|');
  if(shirtTexCache.has(key)) return shirtTexCache.get(key);
  const S = 128;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = kit; g.fillRect(0, 0, S, S);
  if(isGK){
    // Portero: bandas horizontales para distinguirlo
    g.fillStyle = 'rgba(0,0,0,.22)';
    for(let y=8; y<S; y+=28) g.fillRect(0, y, S, 12);
  }
  g.fillStyle = text;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if(big){
    g.font = `900 ${label.length > 1 ? 74 : 86}px "Arial Black", Arial, sans-serif`;
    g.fillText(label, S/2, S/2 + 6);
  } else {
    g.font = '900 34px "Arial Black", Arial, sans-serif';
    g.fillText(label, S*0.68, S*0.32);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  shirtTexCache.set(key, t);
  return t;
}
// Dorsal flotante (se ve en la cámara cenital o al seleccionar)
const labelTexCache = new Map();
function labelTexture(kit, text, label){
  const key = [kit, text, label].join('|');
  if(labelTexCache.has(key)) return labelTexCache.get(key);
  const S = 96;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.beginPath(); g.arc(S/2, S/2, S/2 - 4, 0, Math.PI*2);
  g.fillStyle = kit; g.fill();
  g.lineWidth = 6; g.strokeStyle = 'rgba(255,255,255,.9)'; g.stroke();
  g.fillStyle = text; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `900 ${label.length > 1 ? 40 : 48}px "Arial Black", Arial, sans-serif`;
  g.fillText(label, S/2, S/2 + 3);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  labelTexCache.set(key, t);
  return t;
}

const ease = t=> 1 - Math.pow(1-t, 3);
const lerp = (a,b,t)=> a + (b-a)*t;

export function mountMatch3D(container, handlers){
  const canvas = document.createElement('canvas');
  container.insertBefore(canvas, container.firstChild);

  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0c1c2a, 40, 80);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 200); // near 0.5: más precisión de profundidad (Safari)

  scene.add(new THREE.HemisphereLight(0xd6e8ff, 0x2a3a2c, 1.5));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.1);
  sun.position.set(-8, 18, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {left:-12, right:12, top:10, bottom:-10, near:1, far:50});
  sun.shadow.bias = -0.001;
  scene.add(sun);

  // Suelo, zona alrededor del campo y césped
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshLambertMaterial({color: 0x24312a}));
  ground.rotation.x = -Math.PI/2; ground.position.y = -0.02; ground.receiveShadow = true; scene.add(ground);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(2*HALF_L + 2.2, 2*HALF_W + 2.2), new THREE.MeshLambertMaterial({color: 0x1f4a33}));
  apron.rotation.x = -Math.PI/2; apron.position.y = -0.01; apron.receiveShadow = true; scene.add(apron);
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(2*HALF_L, 2*HALF_W), new THREE.MeshLambertMaterial({map: pitchTexture()}));
  pitch.rotation.x = -Math.PI/2; pitch.receiveShadow = true; scene.add(pitch);

  // Porterías con red
  const nets = {};
  const netTex = netTexture();
  [-1, 1].forEach(dir=>{
    const goal = new THREE.Group();
    const postMat = new THREE.MeshLambertMaterial({color: 0xffffff});
    const post = (h)=> new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, h, 10), postMat);
    [-GOAL_HALF, GOAL_HALF].forEach(z=>{
      const p = post(GOAL_H); p.position.set(0, GOAL_H/2, z); p.castShadow = true; goal.add(p);
    });
    const bar = post(2*GOAL_HALF + 0.09); bar.rotation.x = Math.PI/2; bar.position.set(0, GOAL_H, 0); bar.castShadow = true; goal.add(bar);
    const netGrp = new THREE.Group();
    const mk = (w, h, repX, repY)=>{
      const t = netTex.clone(); t.needsUpdate = true; t.repeat.set(repX, repY);
      return new THREE.Mesh(new THREE.PlaneGeometry(w, h),
        new THREE.MeshLambertMaterial({map: t, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false}));
    };
    const back = mk(2*GOAL_HALF, GOAL_H, 12, 4); back.rotation.y = Math.PI/2; back.position.set(-dir*GOAL_DEPTH, GOAL_H/2, 0); netGrp.add(back);
    const top = mk(GOAL_DEPTH, 2*GOAL_HALF, 2, 12); top.rotation.x = Math.PI/2; top.position.set(-dir*GOAL_DEPTH/2, GOAL_H, 0); netGrp.add(top);
    [-GOAL_HALF, GOAL_HALF].forEach(z=>{
      const s = mk(GOAL_DEPTH, GOAL_H, 2, 4); s.position.set(-dir*GOAL_DEPTH/2, GOAL_H/2, z); netGrp.add(s);
    });
    goal.add(netGrp);
    goal.position.x = dir*6;
    scene.add(goal);
    nets[dir>0 ? 'right' : 'left'] = {grp: netGrp, shakeT0: -1, dir};
  });

  // Estadio alrededor (se cambia con setVenue)
  let venue = null, venueExtent = 12;
  function setVenue(levels, kit, occupancy){
    if(venue){
      scene.remove(venue);
      venue.traverse(o=>{
        if(o.geometry) o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(m=>{ if(m){ if(m.map) m.map.dispose(); m.dispose(); } });
      });
    }
    const shell = buildStadiumShell(levels, kit, {halfL: HALF_L, halfW: HALF_W, gap: 1.1}, {occupancy});
    venue = shell.group; venueExtent = shell.extent;
    scene.add(venue);
  }

  // ---------- Jugadores (figuras de bloques) ----------
  // Cada jugador: root (posición en el campo) > fig (rumbo) > pose (inclinaciones y caídas, pivota en los pies)
  const HIP_Y = 0.465, SHOULDER_Y = 0.77;
  const SKINS = ['#f1c7a5', '#e0ac85', '#c68b62', '#a86f4b', '#8a5636', '#f5d6bd'];
  const HAIRS = ['#2b1d14', '#4a3020', '#1a1a1a', '#7a4f2a', '#c9a35a', '#5c5c5c', '#a0522d'];
  const bx = (w,h,d)=> new THREE.BoxGeometry(w,h,d);
  const GEO = {
    thigh: bx(0.13, 0.15, 0.12), shin: bx(0.105, 0.25, 0.105), boot: bx(0.17, 0.065, 0.115),
    torso: bx(0.2, 0.33, 0.31), arm: bx(0.085, 0.27, 0.085), hand: bx(0.08, 0.075, 0.08), glove: bx(0.12, 0.1, 0.12),
    head: bx(0.18, 0.18, 0.18), hair: bx(0.195, 0.06, 0.195), hairBack: bx(0.05, 0.12, 0.195), neck: bx(0.08, 0.04, 0.08),
  };
  const bootMat = new THREE.MeshLambertMaterial({color: 0x161616});
  const gloveMat = new THREE.MeshLambertMaterial({color: 0xf2f2f2});
  const hitGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.15, 12);
  const hitMat = new THREE.MeshBasicMaterial({visible: false});
  const cardGeo = bx(0.12, 0.17, 0.02);
  const cardMat = new THREE.MeshLambertMaterial({color: 0xf4d03f, emissive: 0x3a3000});
  const ringGeo = new THREE.RingGeometry(0.34, 0.42, 40); ringGeo.rotateX(-Math.PI/2);
  // Las marcas pegadas al césped se dibujan con un desplazamiento de profundidad: en Safari (GPU de Apple)
  // si no, el césped las tapa a ratos según la distancia de la cámara
  function overlayMat(m){ m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -8; m.depthWrite = false; return m; }
  const ringMat = overlayMat(new THREE.MeshBasicMaterial({color: 0xffd23f, transparent: true, opacity: 0.95}));
  const baseGeo = new THREE.RingGeometry(0.22, 0.3, 32); baseGeo.rotateX(-Math.PI/2);
  const players = new Map();
  const hitTargets = [];
  const leaving = []; // expulsados camino de la banda

  function hashStr(s){ let h = 7; for(let i=0;i<s.length;i++) h = (h*31 + s.charCodeAt(i)) | 0; return Math.abs(h); }

  function makePlayer(st){
    const h = hashStr(st.seed || st.id);
    const root = new THREE.Group(), fig = new THREE.Group(), pose = new THREE.Group();
    root.add(fig); fig.add(pose);
    const mats = {
      shirt: new THREE.MeshLambertMaterial({color: st.kit}),
      front: new THREE.MeshLambertMaterial({}),
      back: new THREE.MeshLambertMaterial({}),
      shorts: new THREE.MeshLambertMaterial({color: st.text}),
      socks: new THREE.MeshLambertMaterial({color: st.kit}),
      skin: new THREE.MeshLambertMaterial({color: SKINS[h % SKINS.length]}),
      hair: new THREE.MeshLambertMaterial({color: HAIRS[(h >> 3) % HAIRS.length]}),
      base: overlayMat(new THREE.MeshBasicMaterial({color: st.kit, transparent: true, opacity: 0.9})),
      label: new THREE.SpriteMaterial({transparent: true, depthWrite: false}),
    };
    const add = (parent, geo, mat, x, y, z)=>{
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
    };
    // Piernas (pivote en la cadera)
    const legs = [-1, 1].map(side=>{
      const piv = new THREE.Group(); piv.position.set(0, HIP_Y, side*0.075); pose.add(piv);
      add(piv, GEO.thigh, mats.shorts, 0, -0.075, 0);
      add(piv, GEO.shin, mats.socks, 0, -0.275, 0);
      add(piv, GEO.boot, bootMat, 0.03, -0.432, 0);
      return piv;
    });
    // Tronco con dorsal delante y detrás (caras +X y -X de la caja)
    const torso = add(pose, GEO.torso, [mats.front, mats.back, mats.shirt, mats.shirt, mats.shirt, mats.shirt], 0, HIP_Y + 0.165, 0);
    // Brazos (pivote en el hombro)
    const isGK = st.role === 'GK';
    const arms = [-1, 1].map(side=>{
      const piv = new THREE.Group(); piv.position.set(0, SHOULDER_Y, side*0.2); pose.add(piv);
      add(piv, GEO.arm, mats.shirt, 0, -0.135, 0);
      add(piv, isGK ? GEO.glove : GEO.hand, isGK ? gloveMat : mats.skin, 0, -0.3, 0);
      return piv;
    });
    add(pose, GEO.neck, mats.skin, 0, 0.815, 0);
    const head = add(pose, GEO.head, mats.skin, 0, 0.925, 0);
    add(pose, GEO.hair, mats.hair, -0.005, 1.035, 0);
    if((h >> 5) % 3) add(pose, GEO.hairBack, mats.hair, -0.075, 0.96, 0);
    // Base de color (indica el equipo y si tiene el turno), anillo de selección, tarjeta y dorsal flotante
    const base = new THREE.Mesh(baseGeo, mats.base); base.position.y = 0.011; root.add(base);
    const ring = new THREE.Mesh(ringGeo, ringMat.clone()); ring.position.y = 0.013; ring.visible = false; root.add(ring);
    const card = new THREE.Mesh(cardGeo, cardMat); card.position.set(0.12, 1.3, 0); card.rotation.z = 0.25; card.visible = false; root.add(card);
    const label = new THREE.Sprite(mats.label); label.scale.set(0.42, 0.42, 1); label.position.y = 1.32; label.renderOrder = 5; root.add(label);
    const hit = new THREE.Mesh(hitGeo, hitMat); hit.position.y = 0.55; hit.userData.pieceId = st.id; root.add(hit);
    hitTargets.push(hit);
    scene.add(root);
    return {id: st.id, team: st.team, role: st.role, root, fig, pose, legs, arms, torso, head, base, ring, card, label, hit, mats,
      disp: null, tw: null, heading: st.team === 'A' ? 0 : Math.PI, action: null, phase: (h % 100)/16, key: '', fatigue: 0};
  }
  function applyLook(p, st){
    const key = [st.kit, st.text, st.label].join('|');
    if(p.key === key) return;
    p.key = key;
    p.mats.shirt.color.set(st.kit); p.mats.socks.color.set(st.kit); p.mats.shorts.color.set(st.text); p.mats.base.color.set(st.kit);
    p.mats.front.map = shirtTexture(st.kit, st.text, st.label, false, st.role === 'GK'); p.mats.front.needsUpdate = true;
    p.mats.back.map = shirtTexture(st.kit, st.text, st.label, true, st.role === 'GK'); p.mats.back.needsUpdate = true;
    p.mats.label.map = labelTexture(st.kit, st.text, st.label); p.mats.label.needsUpdate = true;
  }
  function disposePlayer(p){
    scene.remove(p.root);
    Object.values(p.mats).forEach(m=> m.dispose());
    p.ring.material.dispose();
  }
  function removePlayer(id){
    const p = players.get(id); if(!p) return;
    const i = hitTargets.indexOf(p.hit); if(i >= 0) hitTargets.splice(i, 1);
    players.delete(id);
    // Sale andando hacia la banda más cercana y desaparece
    const sz = p.disp && p.disp.z < 0 ? -1 : 1;
    p.tw = {from: {...p.disp}, to: {x: p.disp.x, z: sz*(HALF_W + 0.9)}, t0: performance.now(), dur: 1700};
    p.action = null; p.ring.visible = false; p.label.visible = false;
    leaving.push(p);
  }
  function startAction(p, type, data, dur){
    if(p) p.action = {type, data: data || {}, t0: performance.now(), dur};
  }

  // ---------- Balón ----------
  const ballMat = new THREE.MeshLambertMaterial({map: ballTexture(), transparent: true});
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 16), ballMat);
  ball.castShadow = true; scene.add(ball);
  const looseRing = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.26, 32), overlayMat(new THREE.MeshBasicMaterial({color: 0xffffff, transparent: true})));
  looseRing.rotation.x = -Math.PI/2; looseRing.position.y = 0.015; scene.add(looseRing);
  const ballState = {disp: null, tw: null, carried: false, carrierId: null, goalSeq: null};

  // ---------- Casillas resaltadas ----------
  const hlGroup = new THREE.Group(); scene.add(hlGroup);
  const hlGeo = {
    move: (()=>{ const g = new THREE.RingGeometry(0.17, 0.25, 32); g.rotateX(-Math.PI/2); return g; })(),
    moveFill: (()=>{ const g = new THREE.CircleGeometry(0.17, 32); g.rotateX(-Math.PI/2); return g; })(),
    pass: (()=>{ const g = new THREE.RingGeometry(0.2, 0.27, 6); g.rotateX(-Math.PI/2); return g; })(),
    dot: (()=>{ const g = new THREE.CircleGeometry(0.07, 16); g.rotateX(-Math.PI/2); return g; })(),
    dribble: (()=>{ const g = new THREE.RingGeometry(0.22, 0.3, 32); g.rotateX(-Math.PI/2); return g; })(),
    shoot: (()=>{ const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI/2); return g; })(),
  };
  const hlMat = {
    move: new THREE.MeshBasicMaterial({color: 0xffd23f, transparent: true, opacity: 0.95}),
    moveFill: new THREE.MeshBasicMaterial({color: 0xffd23f, transparent: true, opacity: 0.3}),
    pass: new THREE.MeshBasicMaterial({color: 0x7cfc94, transparent: true, opacity: 0.95}),
    dribble: new THREE.MeshBasicMaterial({color: 0xff8c1a, transparent: true, opacity: 0.95}),
    shoot: new THREE.MeshBasicMaterial({color: 0xe74c3c, transparent: true, opacity: 0.22, depthWrite: false}),
  };
  Object.values(hlMat).forEach(overlayMat);
  function setHighlights(hl){
    hlGroup.clear();
    const add = (geo, mat, c, r, y)=>{ const m = new THREE.Mesh(geo, mat); m.position.set(cellX(c), y + 0.01, cellZ(r)); m.renderOrder = 2; hlGroup.add(m); return m; };
    (hl.shoot||[]).forEach(([c,r])=> add(hlGeo.shoot, hlMat.shoot, c, r, 0.004));
    (hl.move||[]).forEach(([c,r])=>{ add(hlGeo.moveFill, hlMat.moveFill, c, r, 0.02).userData.pulse = 1; add(hlGeo.move, hlMat.move, c, r, 0.021).userData.pulse = 1; });
    (hl.pass||[]).forEach(([c,r])=>{ add(hlGeo.pass, hlMat.pass, c, r, 0.021).userData.spin = 1; add(hlGeo.dot, hlMat.pass, c, r, 0.022); });
    (hl.dribble||[]).forEach(([c,r])=> add(hlGeo.dribble, hlMat.dribble, c, r, 0.021).userData.pulse = 1);
  }

  // ---------- Cámara ----------
  const CAMS = {
    side:   {theta: 0, phi: 0.82, radius: 15.5},
    top:    {theta: 0, phi: 0.06, radius: 15.5},
    behind: {theta: -Math.PI/2, phi: 1.02, radius: 12},
    ball:   {theta: null, phi: 0.9, radius: 8},
  };
  const orbit = {theta: 0, phi: 0.82, radius: 15.5, target: new THREE.Vector3(0, 0, 0)};
  let camMode = 'side', camGoal = {...CAMS.side}, shakeT0 = -1;
  let userAdjusted = false, lastFit = 1; // userAdjusted: el usuario ha girado o hecho zoom desde que eligió cámara
  function setCamera(mode){
    camMode = CAMS[mode] ? mode : 'side';
    camGoal = {...CAMS[camMode]};
    userAdjusted = false;
    if(camGoal.theta === null) camGoal.theta = orbit.theta;
    container.querySelectorAll('[data-cam]').forEach(b=> b.classList.toggle('active', b.dataset.cam === camMode));
  }
  function placeCamera(now){
    if(camGoal){
      let d = camGoal.theta - orbit.theta; d = Math.atan2(Math.sin(d), Math.cos(d));
      orbit.theta += d*0.12;
      orbit.phi = lerp(orbit.phi, camGoal.phi, 0.12);
      orbit.radius = lerp(orbit.radius, camGoal.radius, 0.12);
      if(Math.abs(d) < 0.002 && Math.abs(orbit.phi - camGoal.phi) < 0.002 && Math.abs(orbit.radius - camGoal.radius) < 0.01) camGoal = null;
    }
    orbit.phi = Math.max(0.03, Math.min(1.4, orbit.phi));
    orbit.radius = Math.max(4, Math.min(Math.max(22, venueExtent*2.2), orbit.radius));
    // El objetivo sigue al balón en los modos "Balón" y "Detrás"
    const follow = (camMode === 'ball' || camMode === 'behind') && ballState.disp;
    const tx = follow ? ballState.disp.x*(camMode === 'ball' ? 1 : 0.5) : 0;
    const tz = follow ? ballState.disp.z*(camMode === 'ball' ? 1 : 0.4) : 0;
    orbit.target.x = lerp(orbit.target.x, tx, 0.08);
    orbit.target.z = lerp(orbit.target.z, tz, 0.08);
    const sp = Math.sin(orbit.phi);
    camera.position.set(
      orbit.target.x + orbit.radius*sp*Math.sin(orbit.theta),
      orbit.target.y + orbit.radius*Math.cos(orbit.phi),
      orbit.target.z + orbit.radius*sp*Math.cos(orbit.theta));
    if(shakeT0 >= 0){
      const t = (now - shakeT0)/450;
      if(t < 1){ const a = (1-t)*0.12; camera.position.x += Math.sin(now*0.09)*a; camera.position.y += Math.cos(now*0.11)*a; }
      else shakeT0 = -1;
    }
    camera.lookAt(orbit.target);
  }
  container.querySelectorAll('[data-cam]').forEach(b=> b.addEventListener('click', ()=> setCamera(b.dataset.cam)));

  // ---------- Toques: girar, acercar o seleccionar ----------
  const pointers = new Map();
  let pinchDist = 0, tapCandidate = null;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hitPoint = new THREE.Vector3();
  canvas.addEventListener('pointerdown', e=>{
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
    tapCandidate = pointers.size === 1 ? {x: e.clientX, y: e.clientY, t: performance.now(), slop: e.pointerType === 'mouse' ? 6 : 16} : null;
  });
  canvas.addEventListener('pointermove', e=>{
    const p = pointers.get(e.pointerId); if(!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if(tapCandidate && Math.hypot(e.clientX - tapCandidate.x, e.clientY - tapCandidate.y) > tapCandidate.slop) tapCandidate = null;
    if(pointers.size === 1 && !tapCandidate){
      camGoal = null; userAdjusted = true;
      orbit.theta -= dx*0.008;
      orbit.phi -= dy*0.006;
    }
    p.x = e.clientX; p.y = e.clientY;
    if(pointers.size === 2){
      camGoal = null; userAdjusted = true;
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x-b.x, a.y-b.y);
      if(pinchDist) orbit.radius *= pinchDist/d;
      pinchDist = d;
    }
  });
  const endPointer = e=>{
    const wasTap = tapCandidate && pointers.size === 1 && performance.now() - tapCandidate.t < 700;
    pointers.delete(e.pointerId);
    if(pointers.size < 2) pinchDist = 0;
    if(wasTap && e.type === 'pointerup') handleTap(e.clientX, e.clientY);
    tapCandidate = null;
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', e=>{
    e.preventDefault(); camGoal = null; userAdjusted = true;
    const px = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
    const k = e.ctrlKey ? 0.01 : 0.0025; // ctrl = pellizco en el trackpad
    orbit.radius *= Math.exp(Math.max(-0.25, Math.min(0.25, px * k)));
  }, {passive: false});
  // Safari: gestos de pellizco propios (trackpad del Mac y zoom de página en iPhone)
  let gestureBase = 0;
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(type=> container.addEventListener(type, e=>{
    e.preventDefault();
    if(pointers.size >= 2) return; // en el iPhone el pellizco ya llega por los dedos (pointer events)
    if(type === 'gesturestart'){ gestureBase = orbit.radius; return; }
    if(type === 'gesturechange' && gestureBase && e.scale){ camGoal = null; userAdjusted = true; orbit.radius = gestureBase / e.scale; }
    if(type === 'gestureend') gestureBase = 0;
  }, {passive: false}));

  function handleTap(clientX, clientY){
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left)/r.width)*2 - 1, -((clientY - r.top)/r.height)*2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(hitTargets, false);
    if(hits.length){ handlers.onPiece && handlers.onPiece(hits[0].object.userData.pieceId); return; }
    if(raycaster.ray.intersectPlane(groundPlane, hitPoint)){
      const col = Math.round(hitPoint.x + 6.5), row = Math.round(hitPoint.z + 4);
      if(col >= 1 && col <= 12 && row >= 0 && row < ROWS && Math.abs(hitPoint.x) <= 6) handlers.onCell && handlers.onCell(col, row);
    }
  }

  // ---------- Estado recibido del juego ----------
  function piecePos(st){ return {x: cellX(st.col), z: cellZ(st.row)}; }
  function update(state){
    const now = performance.now();
    const reset = !!state.reset;
    const seen = new Set();
    state.pieces.forEach(st=>{
      seen.add(st.id);
      let p = players.get(st.id);
      if(!p){ p = makePlayer(st); players.set(st.id, p); }
      applyLook(p, st);
      p.idle = st.idle; p.selected = st.selected; p.fatigue = st.fatigue || 0;
      p.mats.base.opacity = st.idle ? 0.3 : 0.9;
      p.base.visible = !st.spent; // ficha ya usada en este turno
      p.ring.visible = st.selected;
      p.card.visible = !!st.yellow;
      const to = piecePos(st);
      if(reset || !p.disp){ p.disp = {...to}; p.tw = null; p.action = null; p.heading = st.team === 'A' ? 0 : Math.PI; }
      else if(!p.tw || p.tw.to.x !== to.x || p.tw.to.z !== to.z){
        if(Math.abs(p.disp.x - to.x) > 0.01 || Math.abs(p.disp.z - to.z) > 0.01){
          const d = Math.hypot(to.x - p.disp.x, to.z - p.disp.z);
          p.tw = {from: {...p.disp}, to, t0: now, dur: state.goalFx ? 1100 : Math.min(560, 220 + d*130)};
        }
      }
    });
    [...players.keys()].forEach(id=>{ if(!seen.has(id)) removePlayer(id); });

    // Avisos de lo ocurrido (pase, tiro, entrada, falta…) para animar a los jugadores
    let kickDelay = 0;
    (state.events || []).forEach(ev=>{
      const p = players.get(ev.id);
      if(ev.type === 'kick' && p){
        const bt = {x: cellX(state.ball.col), z: cellZ(state.ball.row)};
        startAction(p, ev.power ? 'shoot' : 'kick', {face: Math.atan2(-(bt.z - p.disp.z), bt.x - p.disp.x)}, ev.power ? 520 : 440);
        kickDelay = 170;
      } else if(ev.type === 'save' && p){
        startAction(p, 'catch', {}, 800);
      } else if(ev.type === 'tackle' && p){
        const t = players.get(ev.targetId);
        const tp = t ? t.disp : p.disp;
        startAction(p, 'tackle', {dx: tp.x - p.disp.x, dz: tp.z - p.disp.z, face: Math.atan2(-(tp.z - p.disp.z), tp.x - p.disp.x)}, 560);
      } else if(ev.type === 'fall' && p){
        startAction(p, 'fall', {}, 1700);
      } else if(ev.type === 'dribble' && p){
        startAction(p, 'dribble', {}, 480);
      } else if(ev.type === 'goal'){
        if(p) kickDelay = 170;
        const gk = players.get(ev.gkId);
        if(gk) startAction(gk, 'dive', {side: (state.goalFx && state.goalFx.goalRow < 4) ? -1 : 1}, 1500);
        players.forEach(q=>{
          if(q === gk) return;
          if(q.team === ev.team) startAction(q, 'celebrate', {delay: 600}, 2400);
          else startAction(q, 'sad', {delay: 600}, 1800);
        });
        if(p) startAction(p, 'shoot', {face: p.team === 'A' ? 0 : Math.PI, then: 'celebrate'}, 520);
      }
    });

    // Balón: a los pies del portador o en el centro de su casilla
    const carrier = state.ball.carrierId ? players.get(state.ball.carrierId) : null;
    const carrierDir = state.ball.carrierTeam === 'A' ? 1 : -1;
    const bto = state.ball.carried
      ? {x: cellX(state.ball.col) + carrierDir*0.27, z: cellZ(state.ball.row)}
      : {x: cellX(state.ball.col), z: cellZ(state.ball.row)};
    const sameCarrier = state.ball.carried && ballState.carried && ballState.carrierId === state.ball.carrierId;
    ballState.carried = state.ball.carried;
    ballState.carrierId = carrier ? carrier.id : null;
    if(reset || !ballState.disp){ ballState.disp = {...bto, y: BALL_R}; ballState.tw = null; ballState.goalSeq = null; }
    else if(state.goalFx){
      const net = {x: cellX(state.goalFx.goalCol) + (state.goalFx.goalCol > 6 ? 0.1 : -0.1), z: cellZ(state.goalFx.goalRow)*0.85};
      const fromX = cellX(state.goalFx.fromCol), fromZ = cellZ(state.goalFx.fromRow);
      ballState.goalSeq = {t0: now + kickDelay, from: {x: fromX, z: fromZ}, net, after: bto, side: state.goalFx.goalCol > 6 ? 'right' : 'left', shook: false};
      ballState.tw = null;
    } else if(ballState.goalSeq){
      ballState.goalSeq.after = bto;
    } else if(sameCarrier && !ballState.tw){
      // Conducción: el balón sigue al jugador (se coloca en stepBall)
    } else if(!ballState.tw || ballState.tw.to.x !== bto.x || ballState.tw.to.z !== bto.z){
      if(Math.abs(ballState.disp.x - bto.x) > 0.01 || Math.abs(ballState.disp.z - bto.z) > 0.01){
        const d = Math.hypot(bto.x - ballState.disp.x, bto.z - ballState.disp.z);
        ballState.tw = {from: {...ballState.disp}, to: bto, t0: now + kickDelay, dur: Math.min(700, 160 + d*75), arc: d > 1.6 ? Math.min(1.4, d*0.18) : 0};
      }
    }
    setHighlights(state.hl || {});
    start();
  }

  // ---------- Animación ----------
  function angleTo(cur, target, k){
    let d = target - cur; d = Math.atan2(Math.sin(d), Math.cos(d));
    return cur + d*k;
  }
  // Postura de un jugador en este fotograma: carrera, reposo y acciones (chutar, entrar, caer…)
  function posePlayer(p, now, dt){
    let moving = false, speed = 0;
    if(p.tw){
      const t = Math.min(1, Math.max(0, (now - p.tw.t0)/p.tw.dur)), e = t < 1 ? t*(2 - t) : 1;
      const nx = lerp(p.tw.from.x, p.tw.to.x, e), nz = lerp(p.tw.from.z, p.tw.to.z, e);
      speed = Math.hypot(nx - p.disp.x, nz - p.disp.z);
      if(speed > 1e-5) p.moveDir = Math.atan2(-(nz - p.disp.z), nx - p.disp.x);
      p.disp.x = nx; p.disp.z = nz; moving = t < 1;
      if(t >= 1) p.tw = null;
    }
    // Rumbo: hacia donde corre; si no, el portador mira a la portería rival y el resto al balón
    let face = p.team === 'A' ? 0 : Math.PI;
    if(moving && p.moveDir !== undefined) face = p.moveDir;
    else if(ballState.disp && ballState.carrierId !== p.id){
      const dx = ballState.disp.x - p.disp.x, dz = ballState.disp.z - p.disp.z;
      if(Math.hypot(dx, dz) > 0.35) face = Math.atan2(-dz, dx);
    }
    const a = p.action;
    let at = -1;
    if(a){
      const delay = a.data.delay || 0;
      at = (now - a.t0 - delay)/a.dur;
      if(at >= 1){
        p.action = a.data.then ? {type: a.data.then, data: {}, t0: now, dur: 2000} : null;
        at = -1;
      } else if(at >= 0 && a.data.face !== undefined) face = a.data.face;
    }
    p.heading = angleTo(p.heading, face, Math.min(1, dt*0.012));

    // Valores por defecto (reposo)
    let legL = 0, legR = 0, armL = 0, armR = 0, armSpread = 0.08, lean = 0, roll = 0, y = 0, ox = 0, oz = 0;
    const breathe = Math.sin(now*0.003 + p.phase)*0.015;
    if(moving){
      p.phase += speed*15;
      const s = Math.sin(p.phase);
      legL = s*0.75; legR = -s*0.75; armL = -s*0.6; armR = s*0.6;
      y = Math.abs(Math.cos(p.phase))*0.035; lean = -0.14;
    } else if(p.fatigue >= 70){
      // Cansado: inclinado con las manos en las rodillas
      lean = -0.38; armL = armR = 0.55; legL = legR = 0.1;
    } else {
      armL = armR = breathe*2;
      if(p.selected) y = Math.abs(Math.sin(now*0.007))*0.06;
    }
    if(a && at >= 0){
      const t = at, bell = Math.sin(Math.PI*t);
      switch(a.type){
        case 'kick': case 'shoot': {
          const pw = a.type === 'shoot' ? 1.45 : 1.1;
          legR = t < 0.38 ? -0.9*(t/0.38) : (t < 0.62 ? lerp(-0.9, pw, (t-0.38)/0.24) : lerp(pw, 0, (t-0.62)/0.38));
          armL = 0.6*bell; armR = -0.4*bell; lean = 0.12*bell; legL = 0;
          break;
        }
        case 'tackle':
          ox = a.data.dx*0.35*bell; oz = a.data.dz*0.35*bell;
          lean = -0.55*bell; legR = 1.1*bell; legL = -0.3*bell; armL = -0.5*bell; armR = 0.4*bell;
          break;
        case 'dribble':
          roll = 0.32*Math.sin(t*Math.PI*2); legL = 0.5*Math.sin(t*Math.PI*4); legR = -legL; ox = 0.06*bell;
          break;
        case 'fall': {
          const k = t < 0.18 ? ease(t/0.18) : (t < 0.7 ? 1 : 1 - ease((t-0.7)/0.3));
          lean = 1.45*k; armL = armR = 2.2*k; legL = 0.3*k; legR = 0.15*k;
          break;
        }
        case 'dive': {
          const k = t < 0.22 ? ease(t/0.22) : (t < 0.68 ? 1 : 1 - ease((t-0.68)/0.32));
          roll = a.data.side*1.35*k; oz = -a.data.side*0.0; y = 0.18*Math.sin(Math.PI*Math.min(1, t/0.3));
          armL = armR = 2.9*k; armSpread = 0.08 + 0.3*k;
          break;
        }
        case 'catch':
          y = 0.22*bell; armL = armR = 2.7*bell; break;
        case 'celebrate': {
          const j = Math.abs(Math.sin(t*Math.PI*4));
          y = 0.2*j; armL = armR = 2.9 - 0.25*j; armSpread = 0.35; lean = 0.1;
          break;
        }
        case 'sad':
          lean = -0.25*bell; armL = armR = 2.3*bell; armSpread = 0.05 + 0.25*bell; break;
      }
    }
    // El tronco se mueve con la respiración
    p.torso.scale.y = 1 + breathe;
    p.legs[0].rotation.z = legL; p.legs[1].rotation.z = legR;
    p.arms[0].rotation.z = armL; p.arms[1].rotation.z = armR;
    p.arms[0].rotation.x = armSpread; p.arms[1].rotation.x = -armSpread;
    p.pose.rotation.z = lean; p.pose.rotation.x = roll;
    p.fig.rotation.y = p.heading;
    p.fig.position.set(ox, y, oz);
    p.root.position.set(p.disp.x, 0, p.disp.z);
    p.label.visible = !p.leaving && (orbit.phi < 0.55 || p.selected);
    if(p.selected){
      const s = 1 + 0.12*(0.5 + 0.5*Math.sin(now*0.008));
      p.ring.scale.set(s, 1, s);
      p.ring.material.opacity = 0.65 + 0.3*Math.sin(now*0.008);
    }
  }
  let lastFrame = 0;
  function stepPlayers(now){
    const dt = lastFrame ? Math.min(100, now - lastFrame) : 16; lastFrame = now;
    players.forEach(p=> posePlayer(p, now, dt));
    for(let i = leaving.length - 1; i >= 0; i--){
      const p = leaving[i]; p.leaving = true;
      posePlayer(p, now, dt);
      if(!p.tw){ disposePlayer(p); leaving.splice(i, 1); }
    }
  }
  function stepBall(now){
    const b = ballState;
    if(!b.disp) return;
    let y = BALL_R, prevX = b.disp.x, prevZ = b.disp.z;
    if(b.goalSeq){
      const g = b.goalSeq, t = Math.max(0, (now - g.t0)/620);
      if(t < 1){
        const e = t*t*(3 - 2*t);
        b.disp.x = lerp(g.from.x, g.net.x, e);
        b.disp.z = lerp(g.from.z, g.net.z, e);
        y = BALL_R + Math.sin(Math.PI*Math.min(1, t*1.1))*0.9 + t*0.25;
        ballMat.opacity = 1; ball.scale.setScalar(1);
        if(t > 0.8 && !g.shook){ g.shook = true; nets[g.side].shakeT0 = now; shakeT0 = now; }
      } else if(t < 1.5){
        b.disp.x = g.net.x; b.disp.z = g.net.z; y = BALL_R + 0.25;
        ballMat.opacity = Math.max(0, 1 - (t-1)*2);
      } else {
        b.disp.x = g.after.x; b.disp.z = g.after.z; y = BALL_R;
        const k = Math.min(1, (t-1.5)*2.5);
        ballMat.opacity = k; ball.scale.setScalar(Math.max(0.01, k));
        if(k >= 1){ b.goalSeq = null; ballMat.opacity = 1; ball.scale.setScalar(1); }
      }
    } else if(b.tw){
      const t = Math.min(1, Math.max(0, (now - b.tw.t0)/b.tw.dur)), e = b.tw.arc ? t : ease(t);
      b.disp.x = lerp(b.tw.from.x, b.tw.to.x, e);
      b.disp.z = lerp(b.tw.from.z, b.tw.to.z, e);
      y = BALL_R + Math.sin(Math.PI*t)*b.tw.arc;
      if(t >= 1) b.tw = null;
    } else if(b.carried && b.carrierId && players.has(b.carrierId)){
      // Conducción: delante del pie del portador, con pequeños toques al correr
      const c = players.get(b.carrierId);
      const reach = 0.26 + (c.tw ? 0.05*Math.abs(Math.sin(c.phase*0.5)) : 0);
      b.disp.x = lerp(b.disp.x, c.disp.x + Math.cos(c.heading)*reach, 0.35);
      b.disp.z = lerp(b.disp.z, c.disp.z - Math.sin(c.heading)*reach, 0.35);
    }
    ball.position.set(b.disp.x, y, b.disp.z);
    // Rodar: girar según el desplazamiento
    const mx = b.disp.x - prevX, mz = b.disp.z - prevZ;
    ball.rotation.z -= mx/BALL_R; ball.rotation.x += mz/BALL_R;
    const loose = !b.carried && !b.tw && !b.goalSeq;
    looseRing.visible = loose;
    if(loose){
      const k = ((now % 1300)/1300);
      looseRing.position.set(b.disp.x, 0.015, b.disp.z);
      looseRing.scale.setScalar(0.6 + k*0.9);
      looseRing.material.opacity = 0.9*(1-k);
    }
  }
  function stepFx(now){
    Object.values(nets).forEach(n=>{
      if(n.shakeT0 < 0) return;
      const t = (now - n.shakeT0)/600;
      if(t >= 1){ n.grp.scale.set(1,1,1); n.grp.position.x = 0; n.shakeT0 = -1; return; }
      const a = Math.sin(t*Math.PI*5)*(1-t);
      n.grp.scale.set(1 + a*0.35, 1 + a*0.05, 1);
      n.grp.position.x = -n.dir*a*0.12;
    });
    hlGroup.children.forEach(m=>{
      if(m.userData.pulse){ const s = 0.9 + 0.15*(0.5 + 0.5*Math.sin(now*0.0045)); m.scale.set(s, 1, s); }
      if(m.userData.spin) m.rotation.y = now*0.0015;
    });
  }

  function resize(){
    const w = container.clientWidth, h = container.clientHeight;
    if(!w || !h) return false;
    const pr = renderer.getPixelRatio();
    if(canvas.width !== Math.round(w*pr) || canvas.height !== Math.round(h*pr)){
      renderer.setSize(w, h, false);
      camera.aspect = w/h; camera.updateProjectionMatrix();
      // En pantallas estrechas se aleja un poco para que quepa el campo entero
      const ar = w/h, fit = lastFit > 1 ? (ar > 1.3 ? 1 : 1.25) : (ar < 1.1 ? 1.25 : 1); // con margen: la barra de Safari no lo hace saltar
      CAMS.side.radius = 15.5*fit; CAMS.top.radius = 15.5*fit*1.05;
      // Solo al girar el móvil (cambia el encuadre necesario) y si el usuario no ha tocado la cámara;
      // los pequeños cambios de tamaño (barra del navegador) no deshacen el zoom
      if(fit !== lastFit){
        lastFit = fit;
        if(!userAdjusted && (camMode === 'side' || camMode === 'top')) camGoal = {...CAMS[camMode]};
        else if(camGoal && CAMS[camMode].radius) camGoal.radius = CAMS[camMode].radius;
      }
    }
    return true;
  }
  let raf = 0, running = false;
  function frame(now){
    if(!container.isConnected || !resize()){ running = false; return; }
    stepPlayers(now); stepBall(now); stepFx(now);
    placeCamera(now);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  function start(){ if(!running){ running = true; raf = requestAnimationFrame(frame); } }
  const ro = new ResizeObserver(()=>{ if(container.clientWidth) start(); });
  ro.observe(container);
  document.addEventListener('visibilitychange', ()=>{
    if(document.hidden){ cancelAnimationFrame(raf); running = false; } else start();
  });

  setCamera('side');
  orbit.theta = CAMS.side.theta; orbit.phi = CAMS.side.phi; orbit.radius = CAMS.side.radius;
  return {update, setVenue, setCamera};
}
