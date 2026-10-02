// Sonido del partido, generado con Web Audio (sin ficheros de audio).
// Expone window.FTSound: silbatos, golpeos, ambiente de grada y celebraciones.
// La grada suena más o menos según el tamaño del estadio.
(function(){
  let ctx = null, master = null, noiseBuf = null;
  let muted = false;
  try{ muted = localStorage.getItem('ft_sound') === '0'; }catch(e){}
  let crowd = null;          // ambiente continuo
  let crowdLevel = 0.5;      // 0..1 según aforo

  function ensure(){
    if(ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    // Compresor para que los picos (gol) no saturen
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ctx.destination);
    // Ruido rosa de 2 s reutilizable
    const len = ctx.sampleRate*2;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let b0=0, b1=0, b2=0, b3=0, b4=0, b5=0, b6=0;
    for(let i=0;i<len;i++){
      const w = Math.random()*2 - 1;
      b0 = 0.99886*b0 + w*0.0555179; b1 = 0.99332*b1 + w*0.0750759; b2 = 0.969*b2 + w*0.153852;
      b3 = 0.8665*b3 + w*0.3104856; b4 = 0.55*b4 + w*0.5329522; b5 = -0.7616*b5 - w*0.016898;
      d[i] = (b0+b1+b2+b3+b4+b5+b6 + w*0.5362)*0.11; b6 = w*0.115926;
    }
    return ctx;
  }
  // Los navegadores solo permiten sonar tras un toque del usuario
  function unlock(){
    if(!ensure()) return;
    if(ctx.state === 'suspended') ctx.resume();
  }
  ['pointerdown', 'keydown', 'touchend'].forEach(ev=> document.addEventListener(ev, unlock, {passive: true}));

  function ready(){ return ensure() && !muted && ctx.state !== 'closed'; }
  const T = (delay)=> ctx.currentTime + (delay || 0);

  function noise(dest, start, dur, opts){
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    src.playbackRate.value = opts.rate || 1;
    const f = ctx.createBiquadFilter();
    f.type = opts.type || 'bandpass';
    f.frequency.setValueAtTime(opts.freq || 1000, start);
    if(opts.freqTo) f.frequency.exponentialRampToValueAtTime(opts.freqTo, start + dur);
    f.Q.value = opts.q || 1;
    const g = ctx.createGain();
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(start, Math.random()*1.5); src.stop(start + dur + 0.05);
    return g.gain;
  }
  function env(param, start, peak, attack, hold, release){
    param.setValueAtTime(0.0001, start);
    param.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + attack);
    param.setValueAtTime(Math.max(0.0002, peak), start + attack + hold);
    param.exponentialRampToValueAtTime(0.0001, start + attack + hold + release);
  }

  // Silbato: dos tonos agudos con el trino de la bolita
  function whistleBlow(start, dur, vol){
    const g = ctx.createGain(); g.connect(master);
    env(g.gain, start, vol, 0.02, Math.max(0, dur - 0.08), 0.06);
    [2650, 2780].forEach((fq, i)=>{
      const o = ctx.createOscillator(); o.type = i ? 'sine' : 'triangle';
      o.frequency.value = fq;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 28 + i*3;
      const lg = ctx.createGain(); lg.gain.value = 70;
      lfo.connect(lg); lg.connect(o.frequency);
      o.connect(g); o.start(start); o.stop(start + dur + 0.1); lfo.start(start); lfo.stop(start + dur + 0.1);
    });
    const air = noise(master, start, dur, {freq: 3000, q: 2});
    env(air, start, vol*0.25, 0.02, Math.max(0, dur - 0.08), 0.06);
  }
  function whistle(kind, delay){
    if(!ready()) return;
    const s = T(delay);
    if(kind === 'short') whistleBlow(s, 0.28, 0.16);
    else if(kind === 'foul') whistleBlow(s, 0.45, 0.2);
    else if(kind === 'card'){ whistleBlow(s, 0.25, 0.2); whistleBlow(s + 0.32, 0.55, 0.2); }
    else if(kind === 'half'){ whistleBlow(s, 0.35, 0.2); whistleBlow(s + 0.45, 0.7, 0.2); }
    else if(kind === 'end'){ whistleBlow(s, 0.35, 0.2); whistleBlow(s + 0.45, 0.35, 0.2); whistleBlow(s + 0.9, 1.0, 0.2); }
    else whistleBlow(s, 0.6, 0.18); // saque inicial
  }
  // Golpeo del balón: golpe grave + chasquido
  function kick(power, delay){
    if(!ready()) return;
    const s = T(delay), v = power ? 0.75 : 0.45;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(power ? 170 : 210, s);
    o.frequency.exponentialRampToValueAtTime(45, s + 0.12);
    const g = ctx.createGain(); env(g.gain, s, v, 0.004, 0.01, 0.12);
    o.connect(g); g.connect(master); o.start(s); o.stop(s + 0.2);
    const c = noise(master, s, 0.06, {freq: 1800, q: 1.5});
    env(c, s, v*0.5, 0.002, 0.005, 0.05);
  }
  // Entrada o choque
  function thud(delay){
    if(!ready()) return;
    const s = T(delay);
    const g = noise(master, s, 0.25, {type: 'lowpass', freq: 400, q: 0.7});
    env(g, s, 0.5, 0.005, 0.03, 0.18);
  }
  // Red: barrido de ruido agudo
  function net(delay){
    if(!ready()) return;
    const s = T(delay);
    const g = noise(master, s, 0.45, {type: 'highpass', freq: 2500, freqTo: 6000, q: 0.5});
    env(g, s, 0.25, 0.01, 0.05, 0.35);
  }
  // Reacción de la grada: "¡Uyyy!", ovación de gol, abucheo
  function crowdBurst(kind, delay){
    if(!ready()) return;
    const s = T(delay), L = crowdLevel;
    if(L <= 0.02) return;
    if(kind === 'goal'){
      const a = noise(master, s, 3.2, {freq: 700, freqTo: 1300, q: 0.6});
      env(a, s, 0.55*L + 0.08, 0.35, 1.4, 1.4);
      const b = noise(master, s + 0.15, 2.8, {freq: 1800, freqTo: 2400, q: 1.2});
      env(b, s + 0.15, 0.3*L + 0.04, 0.4, 1.0, 1.3);
    } else if(kind === 'ooh'){
      const a = noise(master, s, 1.3, {freq: 900, freqTo: 450, q: 1.5});
      env(a, s, 0.35*L + 0.04, 0.12, 0.35, 0.8);
    } else if(kind === 'boo'){
      const a = noise(master, s, 1.4, {freq: 320, freqTo: 260, q: 2});
      env(a, s, 0.4*L + 0.04, 0.2, 0.5, 0.6);
    } else if(kind === 'cheer'){
      const a = noise(master, s, 1.6, {freq: 1000, freqTo: 1400, q: 0.8});
      env(a, s, 0.3*L + 0.04, 0.2, 0.4, 0.9);
    }
  }
  // Ambiente continuo de grada (murmullo con oleadas lentas)
  function crowdStart(level){
    crowdLevel = Math.max(0, Math.min(1, level));
    if(!ensure()) return;
    crowdStop(0.2);
    const out = ctx.createGain(); out.gain.value = 0.0001; out.connect(master);
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 650; f.Q.value = 0.5;
    const swell = ctx.createGain(); swell.gain.value = 0.75;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13;
    const lg = ctx.createGain(); lg.gain.value = 0.25;
    lfo.connect(lg); lg.connect(swell.gain);
    src.connect(f); f.connect(swell); swell.connect(out);
    src.start(); lfo.start();
    const target = crowdLevel <= 0.02 ? 0.0001 : 0.03 + 0.17*crowdLevel;
    out.gain.exponentialRampToValueAtTime(target, ctx.currentTime + 1.5);
    crowd = {src, lfo, out, target};
  }
  function crowdStop(fade){
    if(!crowd || !ctx) return;
    const c = crowd; crowd = null;
    const t = ctx.currentTime + (fade === undefined ? 1.2 : fade);
    c.out.gain.cancelScheduledValues(ctx.currentTime);
    c.out.gain.setValueAtTime(Math.max(0.0001, c.out.gain.value), ctx.currentTime);
    c.out.gain.exponentialRampToValueAtTime(0.0001, t);
    c.src.stop(t + 0.05); c.lfo.stop(t + 0.05);
  }
  function crowdDim(){
    // Tras el final la grada se va apagando
    if(!crowd || !ctx) return;
    crowd.out.gain.setTargetAtTime(crowd.target*0.35, ctx.currentTime, 1.5);
  }
  // Toque suave al seleccionar
  function tick(){
    if(!ready()) return;
    const s = T(0);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 880;
    const g = ctx.createGain(); env(g.gain, s, 0.06, 0.003, 0.01, 0.06);
    o.connect(g); g.connect(master); o.start(s); o.stop(s + 0.1);
  }

  function setMuted(m){
    muted = !!m;
    try{ localStorage.setItem('ft_sound', muted ? '0' : '1'); }catch(e){}
    if(ctx && master) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.05);
  }

  // Sonido de lo que pasa en el partido (mismos avisos que usa la vista 3D)
  function onEvent(ev, delay){
    delay = delay || 0;
    switch(ev.type){
      case 'kick': kick(!!ev.power, delay); break;
      case 'save': crowdBurst('ooh', delay + 0.25); break;
      case 'goal':
        kick(true, delay); net(delay + 0.55);
        crowdBurst(ev.homeScored === false ? 'boo' : 'goal', delay + 0.6);
        whistle('short', delay + 2.6);
        break;
      case 'tackle': thud(0.1); break;
      case 'fall': whistle('foul', 0.35); break;
      case 'card': crowdBurst('boo', 0.7); break; // el silbato ya suena con la falta
      case 'dribble': crowdBurst('cheer', 0.3); break;
    }
  }

  window.FTSound = {
    unlock, onEvent, whistle, tick, crowdStart, crowdStop, crowdDim, setMuted,
    isMuted: ()=> muted,
  };
})();
