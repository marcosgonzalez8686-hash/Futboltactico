// Vista 3D del partido (nivel 1: fichas tipo chapa sobre el tablero).
// No contiene reglas: recibe el estado ya calculado por index.html y avisa de los toques
// sobre fichas o casillas para que el juego los procese igual que en el tablero 2D.
import * as THREE from './vendor/three.module.min.js';
import { buildStadiumShell } from './stadium3d.js';

const COLS = 14, ROWS = 9;
const GOAL_COL_W = 0.62;
const HALF_L = 6 + GOAL_COL_W;   // incluye las columnas de portería
const HALF_W = ROWS/2;
const GOAL_DEPTH = 0.55, GOAL_H = 0.85, GOAL_HALF = 1.5; // boca: filas 3 a 5
const PIECE_R = 0.36, PIECE_H = 0.2, BALL_R = 0.13;

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

// Cara superior de la ficha: color del equipo, aro claro y dorsal
const topTexCache = new Map();
function pieceTopTexture(kit, text, label, isGK){
  const key = kit+'|'+text+'|'+label+'|'+(isGK?1:0);
  if(topTexCache.has(key)) return topTexCache.get(key);
  const S = 128;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = kit; g.fillRect(0, 0, S, S);
  const grad = g.createRadialGradient(S*0.35, S*0.3, 4, S*0.5, S*0.5, S*0.6);
  grad.addColorStop(0, 'rgba(255,255,255,.45)'); grad.addColorStop(0.55, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, S, S);
  if(isGK){
    g.strokeStyle = 'rgba(255,236,160,.95)'; g.lineWidth = 7; g.strokeRect(14, 14, S-28, S-28);
  } else {
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 7;
    g.beginPath(); g.arc(S/2, S/2, S/2-12, 0, Math.PI*2); g.stroke();
  }
  g.fillStyle = text; g.font = `900 ${label.length>1 ? 52 : 60}px "Arial Black", Arial, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(label, S/2, S/2 + 3);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  // La tapa del cilindro se ve girada 90°: se compensa para que el dorsal mire hacia la cámara lateral
  t.center.set(0.5, 0.5); t.rotation = Math.PI/2;
  topTexCache.set(key, t);
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
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);

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
  function setVenue(levels, kit){
    if(venue){
      scene.remove(venue);
      venue.traverse(o=>{
        if(o.geometry) o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(m=>{ if(m){ if(m.map) m.map.dispose(); m.dispose(); } });
      });
    }
    const shell = buildStadiumShell(levels, kit, {halfL: HALF_L, halfW: HALF_W, gap: 1.1});
    venue = shell.group; venueExtent = shell.extent;
    scene.add(venue);
  }

  // ---------- Fichas ----------
  const pieceGeo = new THREE.CylinderGeometry(PIECE_R, PIECE_R*1.04, PIECE_H, 40);
  // Portero: prisma cuadrado (4 lados, girado 45° con thetaStart para que el dorsal quede recto)
  const gkGeo = new THREE.CylinderGeometry(PIECE_R*1.25, PIECE_R*1.3, PIECE_H, 4, 1, false, Math.PI/4);
  const hitGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.7, 12);
  const hitMat = new THREE.MeshBasicMaterial({visible: false});
  const cardGeo = new THREE.BoxGeometry(0.16, 0.22, 0.02);
  const cardMat = new THREE.MeshLambertMaterial({color: 0xf4d03f, emissive: 0x3a3000});
  const ringGeo = new THREE.RingGeometry(PIECE_R + 0.05, PIECE_R + 0.13, 40);
  ringGeo.rotateX(-Math.PI/2);
  const ringMat = new THREE.MeshBasicMaterial({color: 0xffd23f, transparent: true, opacity: 0.95});
  const pieces = new Map(); // id -> {grp, body, sideMat, topMat, ring, card, hit, disp:{x,z}, tw}
  const hitTargets = [];

  function makePiece(st){
    const grp = new THREE.Group();
    const sideMat = new THREE.MeshLambertMaterial({color: st.kit});
    const topMat = new THREE.MeshLambertMaterial({map: pieceTopTexture(st.kit, st.text, st.label, st.role==='GK')});
    const rimMat = new THREE.MeshLambertMaterial({color: 0x222222});
    const body = new THREE.Mesh(st.role==='GK' ? gkGeo : pieceGeo, [sideMat, topMat, rimMat]);
    body.position.y = PIECE_H/2; body.castShadow = true; body.receiveShadow = true;
    grp.add(body);
    const ring = new THREE.Mesh(ringGeo, ringMat.clone()); ring.position.y = 0.012; ring.visible = false; grp.add(ring);
    const card = new THREE.Mesh(cardGeo, cardMat); card.position.set(0.28, PIECE_H + 0.32, 0); card.rotation.z = 0.25; card.visible = false; grp.add(card);
    const hit = new THREE.Mesh(hitGeo, hitMat); hit.position.y = 0.35; hit.userData.pieceId = st.id; grp.add(hit);
    hitTargets.push(hit);
    scene.add(grp);
    return {grp, body, sideMat, topMat, ring, card, hit, disp: null, tw: null, key: ''};
  }
  function removePiece(id){
    const p = pieces.get(id); if(!p) return;
    scene.remove(p.grp);
    p.sideMat.dispose(); p.topMat.dispose(); p.ring.material.dispose();
    hitTargets.splice(hitTargets.indexOf(p.hit), 1);
    pieces.delete(id);
  }

  // ---------- Balón ----------
  const ballMat = new THREE.MeshLambertMaterial({map: ballTexture(), transparent: true});
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 16), ballMat);
  ball.castShadow = true; scene.add(ball);
  const looseRing = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.26, 32), new THREE.MeshBasicMaterial({color: 0xffffff, transparent: true}));
  looseRing.rotation.x = -Math.PI/2; looseRing.position.y = 0.015; scene.add(looseRing);
  const ballState = {disp: null, tw: null, carried: false, goalSeq: null};

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
  function setHighlights(hl){
    hlGroup.clear();
    const add = (geo, mat, c, r, y)=>{ const m = new THREE.Mesh(geo, mat); m.position.set(cellX(c), y, cellZ(r)); hlGroup.add(m); return m; };
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
  function setCamera(mode){
    camMode = CAMS[mode] ? mode : 'side';
    camGoal = {...CAMS[camMode]};
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
    tapCandidate = pointers.size === 1 ? {x: e.clientX, y: e.clientY, t: performance.now()} : null;
  });
  canvas.addEventListener('pointermove', e=>{
    const p = pointers.get(e.pointerId); if(!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if(tapCandidate && Math.hypot(e.clientX - tapCandidate.x, e.clientY - tapCandidate.y) > 9) tapCandidate = null;
    if(pointers.size === 1 && !tapCandidate){
      camGoal = null;
      orbit.theta -= dx*0.008;
      orbit.phi -= dy*0.006;
    }
    p.x = e.clientX; p.y = e.clientY;
    if(pointers.size === 2){
      camGoal = null;
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x-b.x, a.y-b.y);
      if(pinchDist) orbit.radius *= pinchDist/d;
      pinchDist = d;
    }
  });
  const endPointer = e=>{
    const wasTap = tapCandidate && pointers.size === 1 && performance.now() - tapCandidate.t < 600;
    pointers.delete(e.pointerId);
    if(pointers.size < 2) pinchDist = 0;
    if(wasTap && e.type === 'pointerup') handleTap(e.clientX, e.clientY);
    tapCandidate = null;
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', e=>{
    e.preventDefault(); camGoal = null; orbit.radius *= e.deltaY > 0 ? 1.08 : 0.93;
  }, {passive: false});

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
      let p = pieces.get(st.id);
      if(!p){ p = makePiece(st); pieces.set(st.id, p); }
      const key = st.kit+'|'+st.text+'|'+st.label;
      if(p.key !== key){
        p.key = key;
        p.sideMat.color.set(st.kit);
        p.topMat.map = pieceTopTexture(st.kit, st.text, st.label, st.role==='GK'); p.topMat.needsUpdate = true;
      }
      p.idle = st.idle; p.selected = st.selected;
      const dim = st.idle ? 0.72 : 1;
      p.sideMat.color.set(st.kit).multiplyScalar(dim);
      p.topMat.color.setScalar(dim);
      p.ring.visible = st.selected;
      p.card.visible = !!st.yellow;
      const to = piecePos(st);
      if(reset || !p.disp){ p.disp = {...to}; p.tw = null; }
      else if(!p.tw || p.tw.to.x !== to.x || p.tw.to.z !== to.z){
        if(Math.abs(p.disp.x - to.x) > 0.01 || Math.abs(p.disp.z - to.z) > 0.01){
          const d = Math.hypot(to.x - p.disp.x, to.z - p.disp.z);
          p.tw = {from: {...p.disp}, to, t0: now, dur: state.goalFx ? 700 : Math.min(420, 150 + d*70), hop: state.goalFx ? 0.05 : 0.14};
        }
      }
    });
    [...pieces.keys()].forEach(id=>{ if(!seen.has(id)) removePiece(id); });

    // Balón: a los pies del portador (hacia la portería rival) o en el centro de su casilla
    const carrierDir = state.ball.carrierTeam === 'A' ? 1 : -1;
    const bto = state.ball.carried
      ? {x: cellX(state.ball.col) + carrierDir*0.32, z: cellZ(state.ball.row) + 0.24}
      : {x: cellX(state.ball.col), z: cellZ(state.ball.row)};
    ballState.carried = state.ball.carried;
    if(reset || !ballState.disp){ ballState.disp = {...bto, y: BALL_R}; ballState.tw = null; ballState.goalSeq = null; }
    else if(state.goalFx){
      const net = {x: cellX(state.goalFx.goalCol) + (state.goalFx.goalCol > 6 ? 0.1 : -0.1), z: cellZ(state.goalFx.goalRow)*0.85};
      const fromX = cellX(state.goalFx.fromCol), fromZ = cellZ(state.goalFx.fromRow);
      ballState.goalSeq = {t0: now, from: {x: fromX, z: fromZ}, net, after: bto, side: state.goalFx.goalCol > 6 ? 'right' : 'left', shook: false};
      ballState.tw = null;
    } else if(!ballState.goalSeq && (!ballState.tw || ballState.tw.to.x !== bto.x || ballState.tw.to.z !== bto.z)){
      if(Math.abs(ballState.disp.x - bto.x) > 0.01 || Math.abs(ballState.disp.z - bto.z) > 0.01){
        const d = Math.hypot(bto.x - ballState.disp.x, bto.z - ballState.disp.z);
        ballState.tw = {from: {...ballState.disp}, to: bto, t0: now, dur: Math.min(700, 160 + d*75), arc: d > 1.6 ? Math.min(1.4, d*0.18) : 0};
      }
    } else if(ballState.goalSeq){
      ballState.goalSeq.after = bto;
    }
    setHighlights(state.hl || {});
    start();
  }

  // ---------- Animación ----------
  function stepPieces(now){
    pieces.forEach(p=>{
      let y = 0;
      if(p.tw){
        const t = Math.min(1, (now - p.tw.t0)/p.tw.dur), e = ease(t);
        p.disp.x = lerp(p.tw.from.x, p.tw.to.x, e);
        p.disp.z = lerp(p.tw.from.z, p.tw.to.z, e);
        y = Math.sin(Math.PI*t)*p.tw.hop;
        if(t >= 1) p.tw = null;
      }
      const lift = p.selected ? 0.1 + Math.sin(now*0.006)*0.03 : 0;
      p.grp.position.set(p.disp.x, 0, p.disp.z);
      p.body.position.y = PIECE_H/2 + y + lift;
      p.card.position.y = PIECE_H + 0.32 + y + lift;
      if(p.selected){
        const s = 1 + 0.12*(0.5 + 0.5*Math.sin(now*0.008));
        p.ring.scale.set(s, 1, s);
        p.ring.material.opacity = 0.65 + 0.3*Math.sin(now*0.008);
      }
    });
  }
  function stepBall(now){
    const b = ballState;
    if(!b.disp) return;
    let y = BALL_R, prevX = b.disp.x, prevZ = b.disp.z;
    if(b.goalSeq){
      const g = b.goalSeq, t = (now - g.t0)/620;
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
      const t = Math.min(1, (now - b.tw.t0)/b.tw.dur), e = b.tw.arc ? t : ease(t);
      b.disp.x = lerp(b.tw.from.x, b.tw.to.x, e);
      b.disp.z = lerp(b.tw.from.z, b.tw.to.z, e);
      y = BALL_R + Math.sin(Math.PI*t)*b.tw.arc;
      if(t >= 1) b.tw = null;
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
      const fit = w/h < 1.2 ? 1.25 : 1;
      CAMS.side.radius = 15.5*fit; CAMS.top.radius = 15.5*fit*1.05;
      if(camGoal && camMode in CAMS && CAMS[camMode].radius) camGoal.radius = CAMS[camMode].radius;
    }
    return true;
  }
  let raf = 0, running = false;
  function frame(now){
    if(!container.isConnected || !resize()){ running = false; return; }
    stepPieces(now); stepBall(now); stepFx(now);
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
