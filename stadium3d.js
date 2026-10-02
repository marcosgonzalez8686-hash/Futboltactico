// Estadio 3D del Modo Carrera.
// Cada grada (norte, sur, este, oeste) crece con su nivel (1 a 5):
//   nivel 1: unas pocas filas · 2: más filas y vallas publicitarias · 3: cubierta
//   nivel 4: segundo anfiteatro · 5: anfiteatro completo, cubierta grande y videomarcador.
// Las torres de focos y las esquinas aparecen según el nivel medio del estadio.
import * as THREE from './vendor/three.module.min.js';

const PITCH_L = 10.5, PITCH_W = 6.8;       // campo 105 x 68 m a escala 1:10
const HALF_L = PITCH_L/2, HALF_W = PITCH_W/2;
const GAP = 0.9;                            // distancia de la línea a la primera fila
const ROW_DEPTH = 0.32, ROW_RISE = 0.17, UPPER_RISE = 0.24;
const LOW_ROWS = [0, 3, 5, 7, 8, 9];
const UP_ROWS  = [0, 0, 0, 0, 5, 8];
// Posición de las 4 gradas alrededor de un campo de semilados halfL (eje X) y halfW (eje Z)
function sidesFor(halfL, halfW, gap){
  return {
    south: {len: 2*halfL + 2*gap, pos: [0, 0,  halfW + gap], rot: 0},
    north: {len: 2*halfL + 2*gap, pos: [0, 0, -halfW - gap], rot: Math.PI},
    east:  {len: 2*halfW + 2*gap, pos: [ halfL + gap, 0, 0], rot: Math.PI/2},
    west:  {len: 2*halfW + 2*gap, pos: [-halfL - gap, 0, 0], rot: -Math.PI/2},
  };
}
const SIDES = sidesFor(HALF_L, HALF_W, GAP);
const STAND_KEYS = ['north','south','east','west'];
const LABELS = {north:'Norte', south:'Sur', east:'Este', west:'Oeste'};

function standDims(level){
  const nLow = LOW_ROWS[level], nUp = UP_ROWS[level];
  const d1 = nLow*ROW_DEPTH, h1 = 0.3 + nLow*ROW_RISE;
  const upZ0 = d1 + 0.25, upY0 = h1 + 0.55;
  const depth = nUp ? upZ0 + nUp*ROW_DEPTH : d1;
  const height = nUp ? upY0 + nUp*UPPER_RISE : h1;
  return {nLow, nUp, d1, h1, upZ0, upY0, depth, height};
}

function shade(hex, f){
  const c = new THREE.Color(hex);
  const hsl = {}; c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l*f)));
  return c;
}

function pitchTexture(){
  const W = 1024, H = Math.round(W*PITCH_W/PITCH_L);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const stripes = 14;
  for(let i=0;i<stripes;i++){
    g.fillStyle = i%2 ? '#2f7a4c' : '#2a6d44';
    g.fillRect(i*W/stripes, 0, W/stripes+1, H);
  }
  const m = W*0.03, sx = (W-2*m)/105, sy = (H-2*m)/68;
  const X = v=> m+v*sx, Y = v=> m+v*sy;
  g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 3;
  g.strokeRect(X(0), Y(0), 105*sx, 68*sy);
  g.beginPath(); g.moveTo(X(52.5), Y(0)); g.lineTo(X(52.5), Y(68)); g.stroke();
  g.beginPath(); g.ellipse(X(52.5), Y(34), 9.15*sx, 9.15*sy, 0, 0, Math.PI*2); g.stroke();
  [[0,1],[105,-1]].forEach(([gx,dir])=>{
    const bx = dir>0 ? gx : gx-16.5, sbx = dir>0 ? gx : gx-5.5;
    g.strokeRect(X(bx), Y(13.84), 16.5*sx, 40.32*sy);
    g.strokeRect(X(sbx), Y(24.84), 5.5*sx, 18.32*sy);
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(X(gx+dir*11), Y(34), 3, 0, Math.PI*2); g.fill();
  });
  g.beginPath(); g.arc(X(52.5), Y(34), 3, 0, Math.PI*2); g.fill();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function adBoardTexture(primary, secondary){
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 32;
  const g = cv.getContext('2d');
  for(let i=0;i<4;i++){
    g.fillStyle = i%2 ? primary : secondary;
    g.fillRect(i*128, 0, 128, 32);
    g.fillStyle = i%2 ? secondary : '#ffffff';
    g.font = 'bold 18px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(i%2 ? 'FÚTBOL TÁCTICO' : '¡VAMOS!', i*128+64, 17);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping;
  return t;
}

// Construye una grada en coordenadas locales: a lo largo de X, hacia fuera en +Z, arriba en +Y
function buildStand(level, len, kit, mats, opts){
  const grp = new THREE.Group();
  const dm = standDims(level);
  const box = (w,h,d, mat, x,y,z)=>{
    const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
    m.position.set(x,y,z); m.castShadow = true; m.receiveShadow = true; grp.add(m); return m;
  };
  const seatA = new THREE.MeshLambertMaterial({color: shade(kit.primary, 1)});
  const seatB = new THREE.MeshLambertMaterial({color: shade(kit.primary, 0.78)});
  const seatC = new THREE.MeshLambertMaterial({color: shade(kit.secondary, 1)});
  const seatD = new THREE.MeshLambertMaterial({color: shade(kit.secondary, 0.78)});

  // Muro frontal
  box(len, 0.3, 0.08, mats.wall, 0, 0.15, -0.04);
  // Anfiteatro inferior: filas escalonadas macizas
  const rows = [];
  for(let i=0;i<dm.nLow;i++){
    const top = 0.3 + (i+1)*ROW_RISE;
    box(len, top, ROW_DEPTH, i%2 ? seatB : seatA, 0, top/2, i*ROW_DEPTH + ROW_DEPTH/2);
    rows.push({y: top, z: i*ROW_DEPTH + ROW_DEPTH/2});
  }
  // Anfiteatro superior (niveles 4 y 5)
  if(dm.nUp){
    // Pasillo / zona de servicios entre anfiteatros, con ventanas iluminadas
    box(len, dm.upY0, dm.upZ0 - dm.d1 + 0.02, mats.concrete, 0, dm.upY0/2, (dm.d1 + dm.upZ0)/2);
    const win = new THREE.Mesh(new THREE.BoxGeometry(len*0.96, 0.12, 0.02), mats.windows);
    win.position.set(0, dm.h1 + 0.3, dm.d1 + 0.01); grp.add(win);
    for(let i=0;i<dm.nUp;i++){
      const top = dm.upY0 + (i+1)*UPPER_RISE;
      box(len, top, ROW_DEPTH, i%2 ? seatD : seatC, 0, top/2, dm.upZ0 + i*ROW_DEPTH + ROW_DEPTH/2);
      rows.push({y: top, z: dm.upZ0 + i*ROW_DEPTH + ROW_DEPTH/2});
    }
  }
  // Muro trasero
  box(len, dm.height + 0.25, 0.1, mats.wall, 0, (dm.height+0.25)/2, dm.depth + 0.05);

  // Vallas publicitarias (nivel 2+)
  if(level >= 2){
    const t = mats.adTex.clone(); t.needsUpdate = true; t.repeat.set(len/4, 1);
    const ad = new THREE.Mesh(new THREE.BoxGeometry(len*0.92, 0.16, 0.04),
      new THREE.MeshBasicMaterial({map: t}));
    ad.position.set(0, 0.08, -0.42); grp.add(ad);
  }
  // Cubierta (nivel 3+): más grande y volada al subir de nivel
  if(level >= 3){
    const front = level===3 ? dm.depth*0.45 : (level===4 ? dm.depth*0.2 : -0.35);
    const back = dm.depth + 0.15;
    const roofY = dm.height + (level===5 ? 1.0 : 0.75);
    const roofD = back - front;
    const roof = box(len + (level===5 ? 0.4 : 0), 0.07, roofD, mats.roof, 0, roofY, front + roofD/2);
    roof.rotation.x = -0.06;
    // Pilares traseros
    const n = Math.max(2, Math.round(len/2.6));
    for(let i=0;i<=n;i++){
      const x = -len/2 + i*len/n;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, roofY, 8), mats.steel);
      col.position.set(x, roofY/2, back); col.castShadow = true; grp.add(col);
    }
    if(level === 5){
      // Borde luminoso de la cubierta
      const edge = new THREE.Mesh(new THREE.BoxGeometry(len + 0.4, 0.05, 0.05), mats.light);
      edge.position.set(0, roofY - front*0.06 - 0.04, front); grp.add(edge);
    }
  }
  // Videomarcador en las gradas de fondo a nivel 5
  if(level === 5 && opts && opts.isEnd){
    const scr = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 0.08), mats.screen);
    scr.position.set(0, dm.height + 0.75, dm.depth + 0.15); scr.rotation.x = 0; grp.add(scr);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.35, 1.05, 0.06), mats.steel);
    frame.position.set(0, dm.height + 0.75, dm.depth + 0.2); grp.add(frame);
  }

  // Público: cuantas más filas, más gente
  const per = Math.floor(len/0.24);
  const total = rows.length*per;
  if(total){
    const fans = new THREE.InstancedMesh(new THREE.BoxGeometry(0.13, 0.2, 0.1), mats.fan, total);
    const palette = [new THREE.Color(kit.primary), new THREE.Color(kit.primary), new THREE.Color(kit.secondary),
      new THREE.Color('#f1f1f1'), new THREE.Color('#2b2b2b'), new THREE.Color('#d9b38c')];
    const mtx = new THREE.Matrix4();
    let k = 0;
    rows.forEach(r=>{
      for(let s=0;s<per;s++){
        if(Math.random() < 0.18) continue; // asientos vacíos
        const x = -len/2 + 0.12 + s*(len-0.24)/Math.max(1,per-1) + (Math.random()-0.5)*0.05;
        mtx.makeTranslation(x, r.y + 0.1, r.z + 0.04);
        fans.setMatrixAt(k, mtx);
        fans.setColorAt(k, palette[(Math.random()*palette.length)|0]);
        k++;
      }
    });
    fans.count = k;
    grp.add(fans);
    grp.userData.fans = fans;
  }
  grp.userData.dims = dm;
  return grp;
}

function buildFloodlight(height, mats){
  const g = new THREE.Group();
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, height, 8), mats.steel);
  mast.position.y = height/2; mast.castShadow = true; g.add(mast);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.1), mats.light);
  panel.position.y = height + 0.2; g.add(panel);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.65, 0.06), mats.steel);
  back.position.set(0, height + 0.2, -0.07); g.add(back);
  g.userData.panel = panel;
  return g;
}

function makeMats(){
  return {
    wall: new THREE.MeshLambertMaterial({color: 0x8d9497}),
    concrete: new THREE.MeshLambertMaterial({color: 0x5d6569}),
    roof: new THREE.MeshLambertMaterial({color: 0xe3e7ea, side: THREE.DoubleSide, transparent: true, opacity: 0.55, depthWrite: false}),
    steel: new THREE.MeshLambertMaterial({color: 0xb7bec4}),
    light: new THREE.MeshBasicMaterial({color: 0xfffbe6}),
    windows: new THREE.MeshBasicMaterial({color: 0xffd98a}),
    screen: new THREE.MeshBasicMaterial({color: 0x1a4cff}),
    fan: new THREE.MeshLambertMaterial({color: 0xffffff}),
    adTex: null,
  };
}

// Esquinas cerradas y torres de focos según el conjunto del estadio
function buildExtras(levels, kit, mats, halfL, halfW, gap){
  const out = [];
  const corners = [['north','east', 1,-1], ['north','west',-1,-1], ['south','east', 1, 1], ['south','west',-1, 1]];
  corners.forEach(([a, b, sx, sz])=>{
    const la = levels[a]||1, lb = levels[b]||1;
    const da = standDims(la), db = standDims(lb);
    const x0 = halfL + gap, z0 = halfW + gap;
    if(Math.min(la, lb) >= 3){
      // Esquina cerrada: bloque con la altura de la grada más baja
      const h = Math.min(da.height, db.height)*0.85;
      const corner = new THREE.Mesh(new THREE.BoxGeometry(db.depth, h, da.depth),
        new THREE.MeshLambertMaterial({color: shade(kit.primary, 0.6)}));
      corner.position.set(sx*(x0 + db.depth/2), h/2, sz*(z0 + da.depth/2));
      corner.castShadow = true; corner.receiveShadow = true; out.push(corner);
    }
  });
  const avg = STAND_KEYS.reduce((s,k)=> s + (levels[k]||1), 0)/4;
  if(avg >= 2){
    const reach = Math.max(...STAND_KEYS.map(k=> standDims(levels[k]||1).depth));
    const h = 2.6 + avg*1.3;
    corners.forEach(([, , sx, sz])=>{
      const f = buildFloodlight(h, mats);
      f.position.set(sx*(halfL + gap + reach*0.7 + 0.6), 0, sz*(halfW + gap + reach*0.7 + 0.6));
      f.lookAt(0, 0, 0);
      out.push(f);
    });
  }
  return out;
}

// Gradas, esquinas y focos listos para rodear otro campo (lo usa el partido en 3D)
export function buildStadiumShell(levels, kitColors, dims){
  const kit = {primary: (kitColors && kitColors.primary) || '#e8871e', secondary: (kitColors && kitColors.secondary) || '#2b4c7e'};
  const mats = makeMats();
  mats.adTex = adBoardTexture(kit.primary, kit.secondary);
  const group = new THREE.Group();
  const sides = sidesFor(dims.halfL, dims.halfW, dims.gap);
  STAND_KEYS.forEach(k=>{
    const sd = sides[k];
    const g = buildStand(levels[k] || 1, sd.len, kit, mats, {isEnd: k==='east' || k==='west'});
    g.position.set(...sd.pos); g.rotation.y = sd.rot;
    group.add(g);
  });
  buildExtras(levels, kit, mats, dims.halfL, dims.halfW, dims.gap).forEach(o=> group.add(o));
  const ext = Math.max(...STAND_KEYS.map(k=>{
    const d = standDims(levels[k]||1); return (k==='east'||k==='west' ? dims.halfL : dims.halfW) + dims.gap + d.depth + d.height*0.4;
  }));
  return {group, extent: ext, mats};
}

export function mountStadium(container){
  const canvas = document.createElement('canvas');
  container.appendChild(canvas);
  const labelsEl = document.createElement('div');
  labelsEl.className = 'st3d-labels';
  container.appendChild(labelsEl);
  const hint = document.createElement('div');
  hint.className = 'st3d-hint';
  hint.textContent = 'Arrastra para girar · pellizca para acercar';
  container.appendChild(hint);

  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0c1c2a, 30, 60);
  const camera = new THREE.PerspectiveCamera(42, 1.6, 0.1, 200);

  scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x2a3a2c, 1.4));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
  sun.position.set(-9, 16, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {left:-14, right:14, top:12, bottom:-12, near:1, far:45});
  sun.shadow.bias = -0.0015;
  scene.add(sun);

  const mats = makeMats();

  // Suelo, pista alrededor y césped
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshLambertMaterial({color: 0x24312a}));
  ground.rotation.x = -Math.PI/2; ground.position.y = -0.01; ground.receiveShadow = true; scene.add(ground);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(PITCH_L + 2*GAP + 0.2, PITCH_W + 2*GAP + 0.2),
    new THREE.MeshLambertMaterial({color: 0x2c5a3d}));
  apron.rotation.x = -Math.PI/2; apron.receiveShadow = true; scene.add(apron);
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(PITCH_L, PITCH_W), new THREE.MeshLambertMaterial({map: pitchTexture()}));
  pitch.rotation.x = -Math.PI/2; pitch.position.y = 0.005; pitch.receiveShadow = true; scene.add(pitch);
  // Porterías
  [-1, 1].forEach(dir=>{
    const goal = new THREE.Group();
    const postMat = new THREE.MeshLambertMaterial({color: 0xffffff});
    const gw = 0.73, gh = 0.24;
    [-gw/2, gw/2].forEach(z=>{
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, gh, 6), postMat);
      p.position.set(0, gh/2, z); goal.add(p);
    });
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, gw, 6), postMat);
    bar.rotation.x = Math.PI/2; bar.position.set(0, gh, 0); goal.add(bar);
    const net = new THREE.Mesh(new THREE.BoxGeometry(0.2, gh, gw),
      new THREE.MeshLambertMaterial({color: 0xffffff, transparent: true, opacity: 0.25}));
    net.position.set(dir*0.1, gh/2, 0); goal.add(net);
    goal.position.x = dir*HALF_L;
    scene.add(goal);
  });

  const standGroups = {};
  const extras = new THREE.Group(); scene.add(extras);
  let prevLevels = null, kit = {primary: '#e8871e', secondary: '#2b4c7e'};
  const growAnims = [];

  // Cámara orbital sencilla
  const orbit = {theta: 0.55, phi: 0.95, radius: 19, target: new THREE.Vector3(0, 0.6, 0)};
  let fitRadius = 19;
  let goalTheta = null, lastInteraction = 0;
  function placeCamera(){
    orbit.phi = Math.max(0.25, Math.min(1.35, orbit.phi));
    orbit.radius = Math.max(8, Math.min(fitRadius*1.6, orbit.radius));
    const sp = Math.sin(orbit.phi);
    camera.position.set(
      orbit.target.x + orbit.radius*sp*Math.sin(orbit.theta),
      orbit.target.y + orbit.radius*Math.cos(orbit.phi),
      orbit.target.z + orbit.radius*sp*Math.cos(orbit.theta));
    camera.lookAt(orbit.target);
  }
  const pointers = new Map();
  let pinchDist = 0;
  canvas.addEventListener('pointerdown', e=>{
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
    lastInteraction = performance.now(); goalTheta = null; hint.style.opacity = '0';
  });
  canvas.addEventListener('pointermove', e=>{
    const p = pointers.get(e.pointerId); if(!p) return;
    if(pointers.size === 1){
      orbit.theta -= (e.clientX - p.x)*0.008;
      orbit.phi -= (e.clientY - p.y)*0.006;
    }
    p.x = e.clientX; p.y = e.clientY;
    if(pointers.size === 2){
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x-b.x, a.y-b.y);
      if(pinchDist) orbit.radius *= pinchDist/d;
      pinchDist = d;
    }
    lastInteraction = performance.now();
  });
  const endPointer = e=>{ pointers.delete(e.pointerId); if(pointers.size < 2) pinchDist = 0; };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', e=>{
    e.preventDefault(); orbit.radius *= e.deltaY > 0 ? 1.08 : 0.93; lastInteraction = performance.now();
  }, {passive: false});

  function rebuild(levels, animateKeys){
    if(mats.adTex) mats.adTex.dispose();
    mats.adTex = adBoardTexture(kit.primary, kit.secondary);
    Object.keys(SIDES).forEach(k=>{
      const old = standGroups[k];
      if(old){ scene.remove(old); old.traverse(o=>{ if(o.geometry) o.geometry.dispose(); }); }
      const s = SIDES[k];
      const g = buildStand(levels[k] || 1, s.len, kit, mats, {isEnd: k==='east' || k==='west'});
      g.position.set(...s.pos); g.rotation.y = s.rot;
      scene.add(g); standGroups[k] = g;
      if(animateKeys.includes(k)){ g.scale.y = 0.02; growAnims.push({g, t0: performance.now()}); }
    });
    // Esquinas y focos según el conjunto del estadio
    extras.children.slice().forEach(o=>{ extras.remove(o); o.traverse(c=>{ if(c.geometry) c.geometry.dispose(); }); });
    buildExtras(levels, kit, mats, HALF_L, HALF_W, GAP).forEach(o=> extras.add(o));
    // Encuadre: la cámara se aleja según el tamaño del estadio
    const ext = Math.max(...Object.keys(SIDES).map(k=>{
      const d = standDims(levels[k]||1); return (k==='east'||k==='west' ? HALF_L : HALF_W) + GAP + d.depth + d.height*0.4;
    }));
    fitRadius = 10 + ext*1.5;
    orbit.radius = fitRadius;
    renderer.shadowMap.needsUpdate = true;
  }

  function update(levels, kitColors, opts){
    opts = opts || {};
    const prevKit = kit;
    kit = {primary: (kitColors && kitColors.primary) || '#e8871e', secondary: (kitColors && kitColors.secondary) || '#2b4c7e'};
    const changed = !prevLevels || Object.keys(SIDES).some(k=> prevLevels[k] !== levels[k])
      || prevKit.primary !== kit.primary || prevKit.secondary !== kit.secondary;
    const grown = (prevLevels && !opts.reset) ? Object.keys(SIDES).filter(k=> (levels[k]||1) > (prevLevels[k]||1)) : [];
    if(changed) rebuild(levels, grown);
    // Al ampliar una grada, la cámara gira hacia ella
    if(grown.length){
      const s = SIDES[grown[0]];
      goalTheta = Math.atan2(-s.pos[0], -s.pos[2]); // cámara en el lado opuesto, mirando a la grada
      lastInteraction = 0;
    }
    prevLevels = {...levels};
    start();
  }

  function resize(){
    const w = container.clientWidth, h = container.clientHeight;
    if(!w || !h) return false;
    if(canvas.width !== Math.round(w*renderer.getPixelRatio()) || canvas.height !== Math.round(h*renderer.getPixelRatio())){
      renderer.setSize(w, h, false);
      camera.aspect = w/h; camera.updateProjectionMatrix();
    }
    return true;
  }

  const labelEls = {};
  Object.keys(SIDES).forEach(k=>{
    const el = document.createElement('span'); el.textContent = LABELS[k];
    labelsEl.appendChild(el); labelEls[k] = el;
  });
  const tmp = new THREE.Vector3();
  function placeLabels(){
    const w = container.clientWidth, h = container.clientHeight;
    Object.keys(SIDES).forEach(k=>{
      const g = standGroups[k]; if(!g) return;
      const dm = g.userData.dims;
      tmp.set(0, dm.height*g.scale.y + 0.5, dm.depth/2).applyMatrix4(g.matrixWorld);
      tmp.project(camera);
      const el = labelEls[k];
      const lvl = (prevLevels && prevLevels[k]) || 1;
      el.textContent = `${LABELS[k]} · Nv${lvl}`;
      el.style.transform = `translate(-50%,-50%) translate(${(tmp.x*0.5+0.5)*w}px, ${(-tmp.y*0.5+0.5)*h}px)`;
      el.style.display = tmp.z < 1 ? '' : 'none';
    });
  }

  let raf = 0, running = false;
  function frame(now){
    if(!container.isConnected || !resize()){ running = false; return; }
    // Giro automático suave mientras no se toca
    if(goalTheta !== null){
      let d = goalTheta - orbit.theta;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      orbit.theta += d*0.06;
      if(Math.abs(d) < 0.01) goalTheta = null;
    } else if(now - lastInteraction > 3500){
      orbit.theta += 0.0016;
    }
    for(let i=growAnims.length-1;i>=0;i--){
      const a = growAnims[i];
      const t = Math.min(1, (now - a.t0)/1100);
      const e = 1 - Math.pow(1-t, 3);
      a.g.scale.y = 0.02 + 0.98*(t < 1 ? e*(1 + 0.08*Math.sin(t*Math.PI)) : 1);
      if(t >= 1){ a.g.scale.y = 1; growAnims.splice(i, 1); }
    }
    placeCamera();
    renderer.render(scene, camera);
    placeLabels();
    raf = requestAnimationFrame(frame);
  }
  function start(){
    if(running) return;
    running = true; raf = requestAnimationFrame(frame);
  }
  // Pausa cuando la pantalla no se ve; se reanuda al volver a mostrarla
  const ro = new ResizeObserver(()=>{ if(container.clientWidth) start(); });
  ro.observe(container);
  document.addEventListener('visibilitychange', ()=>{
    if(document.hidden){ cancelAnimationFrame(raf); running = false; } else start();
  });

  return {update};
}
