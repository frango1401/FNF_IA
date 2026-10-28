const $ = s => document.querySelector(s);
const C = $('#c');
const X = C.getContext('2d');
const OV = $('#ov');

// Variáveis globais e de estado
let W = 960, H = 600, SP = 84, STR = 100, wide = true;
let ac, master, nbuf, G = null, diff = 1;

// Constantes de configuração e estilo
const COL = ['#c24b99', '#00e5ff', '#12fa05', '#f9393f'];
const ROT = [Math.PI, Math.PI / 2, -Math.PI / 2, 0];
const KEYS = { ArrowLeft: 0, a: 0, A: 0, ArrowDown: 1, s: 1, S: 1, ArrowUp: 2, w: 2, W: 2, ArrowRight: 3, d: 3, D: 3 };

// Constantes de tempo e música
const BPM = 150;
const BEAT = 60 / BPM;
const STEP = BEAT / 4;
const BAR = BEAT * 4;
const BARS = 37;
const TOTAL = BARS * 16;
const END = BARS * BAR + 1.2;

const CH = [
  [220, 261.6, 329.6], 
  [174.6, 220, 261.6], 
  [261.6, 329.6, 392], 
  [196, 246.9, 293.7]
];
const ROOT = [110, 87.3, 130.8, 98];
const DF = [
  { n: 'Fácil', d: 0.3, a: 1.35 },
  { n: 'Normal', d: 0.48, a: 1.15 },
  { n: 'Difícil', d: 0.68, a: 0.95 }
];
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Áudio ---------- */
function tone(f, t, d, type, v, slide) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  
  if (slide) {
    o.frequency.exponentialRampToValueAtTime(slide, t + d);
  }
  
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + d);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + d + 0.02);
}

function noise(t, d, v, hp) {
  const s = ac.createBufferSource();
  const f = ac.createBiquadFilter();
  const g = ac.createGain();
  
  s.buffer = nbuf;
  f.type = 'highpass';
  f.frequency.value = hp;
  
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + d);
  s.connect(f).connect(g).connect(master);
  s.start(t);
  s.stop(t + d);
}

function music(st) {
  const bar = st >> 4;
  const s = st & 15;
  const t = G.start + st * STEP;
  
  if (s % 4 === 0 || (s === 10 && bar > 0)) {
    tone(130, t, 0.18, 'sine', 0.9, 40);
  }
  if (bar > 0 && (s === 4 || s === 12)) {
    noise(t, 0.12, 0.3, 1500);
    tone(190, t, 0.08, 'triangle', 0.25);
  }
  if (s % 2 === 0) {
    noise(t, 0.04, 0.1, 7000);
  }
  if (bar === 0 && s % 4 === 0) {
    tone(s === 12 ? 1320 : 880, t, 0.08, 'square', 0.12);
  }
  if (bar > 0 && [0, 3, 6, 8, 11, 14].includes(s)) {
    tone(ROOT[bar % 4] * (s === 6 || s === 14 ? 2 : 1), t, STEP * 2.2, 'square', 0.15);
  }
}

/* ---------- Fase / Chart ---------- */
function rng(s) {
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

function chart(d) {
  const r = rng(7 + d * 3);
  const pl = [], op = [];
  let last = -1;
  
  for (let b = 1; b < BARS; b++) {
    const out = ((b - 1) >> 1) % 2 ? pl : op;
    let skip = 0;
    
    for (let s = 0; s < 16; s += 2) {
      if (s < skip) continue;
      if (r() > DF[d].d * (s % 4 === 0 ? 1.3 : 0.85)) continue;
      
      let l = (r() * 4) | 0;
      if (l === last && r() < 0.6) {
        l = (l + 1 + ((r() * 3) | 0)) % 4;
      }
      last = l;
      let len = 0;
      
      if (s % 4 === 0 && r() < 0.1) {
        len = STEP * (r() < 0.5 ? 4 : 6);
        skip = s + len / STEP + 2;
      }
      
      const add = (l, len) => out.push({ t: (b * 16 + s) * STEP, l, len, f: CH[b % 4][l % 3] * (l > 2 ? 2 : 1), s: 0 });
      add(l, len);
      
      if (d === 2 && !len && r() < 0.1) {
        add((l + 2) % 4, 0);
      }
      
      if (d === 2 && !len && r() < 0.12) {
        out.push({ t: (b * 16 + s + 1) * STEP, l: (l + 1) % 4, len: 0, f: CH[b % 4][(l + 1) % 3], s: 0 });
      }
    }
  }
  return { pl, op };
}

/* ---------- Controlo do Jogo ---------- */
function startGame() {
  wide = innerWidth / innerHeight >= 0.95;
  W = wide ? 960 : 480;
  H = wide ? 600 : 800;
  SP = wide ? 84 : 96;
  STR = wide ? 100 : 110;
  C.width = W;
  C.height = H;
  fit();
  
  if (ac) ac.close();
  ac = new AudioContext();
  master = ac.createGain();
  master.gain.value = 0.6;
  master.connect(ac.destination);
  
  nbuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const dd = nbuf.getChannelData(0);
  for (let i = 0; i < dd.length; i++) {
    dd[i] = Math.random() * 2 - 1;
  }
  
  const c = chart(diff);
  G = {
    start: ac.currentTime + 0.4,
    pl: c.pl.map(n => ({ ...n, side: 'p' })).sort((a, b) => a.t - b.t),
    op: c.op.map(n => ({ ...n, side: 'o' })).sort((a, b) => a.t - b.t),
    hp: 0.5,
    score: 0,
    combo: 0,
    max: 0,
    cnt: { sick: 0, good: 0, bad: 0, miss: 0 },
    held: [0, 0, 0, 0],
    pt: [-9, -9, -9, -9],
    of: [0, 0, 0, 0],
    pop: null,
    step: 0,
    oi: 0,
    state: 'play',
    sp: (H - STR - 110) / DF[diff].a
  };
  
  OV.hidden = true;
}

const nowT = () => ac.currentTime - G.start;

function stop(kind) {
  G.state = 'over';
  const n = G.cnt;
  const j = n.sick + n.good + n.bad + n.miss;
  const acc = j ? Math.round((n.sick + n.good * 0.75 + n.bad * 0.4) / j * 100) : 0;
  const rk = acc >= 95 ? 'S' : acc >= 85 ? 'A' : acc >= 70 ? 'B' : acc >= 50 ? 'C' : 'D';
  
  ac.close();
  OV.hidden = false;
  OV.innerHTML = `<div class="card"><h2>${kind === 'win' ? 'Vitória!' : 'Você caiu'}</h2>
    ${kind === 'win' ? `<div class="rank">${rk}</div>` : '<p>A barra de vida chegou a zero. Tente de novo.</p>'}
    <div class="stats">
      <span>Pontos<b>${G.score}</b></span>
      <span>Precisão<b>${acc}%</b></span>
      <span>Combo máx.<b>${G.max}</b></span>
      <span>Erros<b>${n.miss}</b></span>
      <span>Perfeitos<b>${n.sick}</b></span>
      <span>Bons / Ruins<b>${n.good} / ${n.bad}</b></span>
    </div>
    <div class="row">
      <button data-a="play">Jogar de novo</button>
      <button class="alt" data-a="menu">Menu</button>
    </div>
  </div>`;
}

/* ---------- Entrada (Input) ---------- */
function press(l) {
  const g = G;
  if (!g || g.state !== 'play' || g.held[l]) return;
  
  g.held[l] = 1;
  const now = nowT();
  g.pt[l] = now;
  
  for (const n of g.pl) {
    if (n.l !== l || n.s !== 0) continue;
    const d = n.t - now;
    
    if (d > 0.135) break;
    if (d < -0.135) continue;
    
    const a = Math.abs(d) * 1000;
    const k = a <= 45 ? 'sick' : a <= 90 ? 'good' : 'bad';
    
    g.cnt[k]++;
    g.score += { sick: 350, good: 200, bad: 100 }[k];
    g.hp = Math.min(1, g.hp + { sick: 0.03, good: 0.015, bad: -0.01 }[k]);
    
    if (k === 'bad') g.combo = 0;
    else g.combo++;
    
    g.max = Math.max(g.max, g.combo);
    g.pop = {
      t: now,
      txt: { sick: 'PERFEITO!', good: 'BOM', bad: 'RUIM' }[k],
      col: { sick: '#ffd23f', good: '#12fa05', bad: '#f9393f' }[k]
    };
    
    n.s = n.len ? 3 : 1;
    tone(n.f * 2, ac.currentTime, 0.16, 'square', 0.1);
    return;
  }
}

function release(l) {
  if (G) G.held[l] = 0;
}

addEventListener('keydown', e => {
  if (e.key in KEYS) {
    e.preventDefault();
    if (!e.repeat) press(KEYS[e.key]);
  } else if ((e.key === 'Escape' || e.key === 'p') && G && !e.repeat) {
    G.state === 'play' ? pause() : G.state === 'pause' && resume();
  }
});

addEventListener('keyup', e => {
  if (e.key in KEYS) release(KEYS[e.key]);
});

const ptr = {};
function laneAt(e) {
  const r = C.getBoundingClientRect();
  const x = (e.clientX - r.left) * W / r.width;
  const x0 = wide ? W - 40 - 4 * SP : (W - 4 * SP) / 2;
  const l = Math.floor((x - x0) / SP);
  return l >= 0 && l < 4 ? l : -1;
}

C.addEventListener('pointerdown', e => {
  const l = laneAt(e);
  if (l < 0) return;
  ptr[e.pointerId] = l;
  press(l);
});

['pointerup', 'pointercancel'].forEach(t => 
  C.addEventListener(t, e => {
    if (e.pointerId in ptr) {
      release(ptr[e.pointerId]);
      delete ptr[e.pointerId];
    }
  })
);

function pause() {
  G.state = 'pause';
  ac.suspend();
  OV.hidden = false;
  OV.innerHTML = `<div class="card">
    <h2>Pausado</h2>
    <div class="row">
      <button data-a="resume">Continuar</button>
      <button class="alt" data-a="menu">Sair</button>
    </div>
  </div>`;
}

function resume() {
  OV.hidden = true;
  ac.resume();
  G.state = 'play';
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && G && G.state === 'play') pause();
});

function menu() {
  if (ac) ac.close();
  G = null;
  OV.hidden = false;
  OV.innerHTML = `<div class="card">
    <h1>Duelo de Setas</h1>
    <p>Responda ao rival acertando as setas no tempo da batida.</p>
    <div class="row" role="group" aria-label="Dificuldade">
      ${DF.map((d, i) => `<button class="alt ${i === diff ? 'on' : ''}" data-a="d${i}">${d.n}</button>`).join('')}
    </div>
    <div class="row"><button data-a="play">Jogar</button></div>
    <small>Setas do teclado ou A S W D. No telemóvel, toque nas colunas. Esc pausa.</small>
  </div>`;
}

OV.addEventListener('click', e => {
  const a = e.target.dataset.a;
  if (!a) return;
  if (a === 'play') startGame();
  else if (a === 'menu') menu();
  else if (a === 'resume') resume();
  else if (a[0] === 'd') { diff = +a[1]; menu(); }
});

/* ---------- Lógica de Atualização ---------- */
function update(dt) {
  const now = nowT(), look = now + 0.15;
  
  while (G.step < TOTAL && G.step * STEP <= look) {
    music(G.step++);
  }
  
  while (G.oi < G.op.length && G.op[G.oi].t <= look) {
    const n = G.op[G.oi++];
    tone(n.f, G.start + n.t, 0.18, 'sawtooth', 0.09);
  }
  
  for (const n of G.op) {
    if (n.s === 0 && now >= n.t) {
      n.s = 1;
      G.of[n.l] = now + Math.max(0.14, n.len);
    }
  }
  
  for (const n of G.pl) {
    if (n.s === 0 && now - n.t > 0.15) {
      n.s = 2;
      G.cnt.miss++;
      G.combo = 0;
      G.hp -= 0.05;
      G.score -= 10;
      G.pop = { t: now, txt: 'ERROU', col: '#9b8bb8' };
      tone(70, ac.currentTime, 0.12, 'sawtooth', 0.12);
    } else if (n.s === 3) {
      if (now >= n.t + n.len) {
        n.s = 1;
      } else if (!G.held[n.l]) {
        n.s = 2;
        G.hp -= 0.03;
        G.combo = 0;
      } else {
        G.hp = Math.min(1, G.hp + 0.1 * dt);
        G.score += Math.round(150 * dt);
      }
    }
  }
  
  if (G.hp <= 0) stop('lose');
  else if (now > END) stop('win');
}

/* ---------- Desenho e Renderização (Canvas) ---------- */
function arrow(x, y, s, rot, fill, stroke, al) {
  X.save();
  X.translate(x, y);
  X.rotate(rot);
  X.globalAlpha = al ?? 1;
  X.beginPath();
  X.moveTo(s * 0.95, 0);
  X.lineTo(-s * 0.1, -s * 0.85);
  X.lineTo(-s * 0.1, -s * 0.38);
  X.lineTo(-s * 0.9, -s * 0.38);
  X.lineTo(-s * 0.9, s * 0.38);
  X.lineTo(-s * 0.1, s * 0.38);
  X.lineTo(-s * 0.1, s * 0.85);
  X.closePath();
  
  if (fill) {
    X.fillStyle = fill;
    X.fill();
  }
  if (stroke) {
    X.strokeStyle = stroke;
    X.lineWidth = 3;
    X.lineJoin = 'round';
    X.stroke();
  }
  X.restore();
}

function face(x, y, col, sad) {
  X.fillStyle = col;
  X.beginPath();
  X.arc(x, y, 22, 0, 7);
  X.fill();
  X.strokeStyle = '#0008';
  X.lineWidth = 3;
  X.stroke();
  
  X.fillStyle = '#120a1f';
  X.beginPath();
  X.arc(x - 8, y - 5, 3, 0, 7);
  X.arc(x + 8, y - 5, 3, 0, 7);
  X.fill();
  
  X.beginPath();
  X.arc(x, y + (sad ? 10 : 3), 8, sad ? Math.PI * 1.1 : 0.1 * Math.PI, sad ? Math.PI * 1.9 : 0.9 * Math.PI);
  X.stroke();
}

const laneX = (side, i) => (side === 'o' ? 40 : wide ? W - 40 - 4 * SP : (W - 4 * SP) / 2) + i * SP + SP / 2;

function draw() {
  const now = G ? nowT() : performance.now() / 1000;
  const pulse = RM ? 0 : 1 - ((now / BEAT) % 1);
  
  X.globalAlpha = 1;
  const bg = X.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#1a0f2e');
  bg.addColorStop(1, '#2b1550');
  X.fillStyle = bg;
  X.fillRect(0, 0, W, H);
  
  for (const [cx, c] of [[W * 0.25, '194,75,153'], [W * 0.75, '0,229,255']]) {
    const g = X.createRadialGradient(cx, H, 10, cx, H, H * 0.9);
    g.addColorStop(0, `rgba(${c},${0.12 + 0.2 * pulse})`);
    g.addColorStop(1, `rgba(${c},0)`);
    X.fillStyle = g;
    X.fillRect(0, 0, W, H);
  }
  
  if (!G) return;
  
  const sp = G.sp;
  if (wide) {
    X.fillStyle = 'rgba(0,0,0,.25)';
    X.fillRect(laneX('p', 0) - SP / 2, 0, 4 * SP, H);
    X.fillRect(laneX('o', 0) - SP / 2, 0, 4 * SP, H);
  } else {
    X.fillStyle = 'rgba(0,0,0,.25)';
    X.fillRect(laneX('p', 0) - SP / 2, 0, 4 * SP, H);
  }
  
  const sides = wide ? ['o', 'p'] : ['p'];
  const s = SP * 0.36;
  
  for (const sd of sides) {
    for (let l = 0; l < 4; l++) {
      const x = laneX(sd, l);
      const on = sd === 'p' ? G.held[l] || now - G.pt[l] < 0.1 : now < G.of[l];
      arrow(x, STR, s, ROT[l], on ? COL[l] : null, on ? '#fff' : '#8c7aa8', on ? 1 : 0.8);
    }
  }
  
  for (const n of G.op.concat(G.pl)) {
    if (n.side === 'o' && !wide) continue;
    if (n.s === 1 && !n.len) continue;
    
    const yh = STR + (n.t - now) * sp;
    const yt = STR + (n.t + n.len - now) * sp;
    
    if (yt < STR - 30 || yh > H + 50) continue;
    
    const x = laneX(n.side, n.l);
    const al = n.s === 2 ? 0.3 : n.side === 'o' ? 0.75 : 1;
    const hold = (n.s === 1 || n.s === 3) && now > n.t;
    
    if (n.len) {
      const a = hold ? STR : yh;
      X.globalAlpha = al * 0.7;
      X.fillStyle = COL[n.l];
      X.fillRect(x - 11, Math.min(a, yt), 22, Math.abs(yt - a));
      X.globalAlpha = 1;
    }
    
    if (!hold) {
      arrow(x, yh, s, ROT[n.l], COL[n.l], '#000a', al);
    }
  }
  
  // Vida
  const bx = W / 2 - 200;
  const by = H - 76;
  const jx = bx + 400 - G.hp * 400;
  
  X.fillStyle = '#f9393f';
  X.fillRect(bx, by, 400, 16);
  X.fillStyle = '#12fa05';
  X.fillRect(jx, by, bx + 400 - jx, 16);
  X.strokeStyle = '#000';
  X.lineWidth = 4;
  X.strokeRect(bx, by, 400, 16);
  
  face(jx - 24, by + 8, '#c24b99', G.hp > 0.8);
  face(jx + 24, by + 8, '#00e5ff', G.hp < 0.2);
  
  const n = G.cnt;
  const j = n.sick + n.good + n.bad + n.miss;
  const acc = j ? Math.round((n.sick + n.good * 0.75 + n.bad * 0.4) / j * 100) : 100;
  
  X.fillStyle = '#f4eeff';
  X.font = "16px 'Chakra Petch', sans-serif";
  X.textAlign = 'center';
  X.fillText(`Pontos ${G.score}    Erros ${n.miss}    Precisão ${acc}%`, W / 2, H - 22);
  
  X.fillStyle = '#ffd23f';
  X.fillRect(0, 0, W * Math.max(0, Math.min(1, now / END)), 4);
  
  // Avaliação e contagem (Feedback visual)
  const py = wide ? 250 : H - 190;
  if (G.pop) {
    const a = now - G.pop.t;
    if (a < 0.7) {
      X.globalAlpha = 1 - a / 0.7;
      X.font = "34px Bungee, Impact, sans-serif";
      X.lineWidth = 6;
      X.strokeStyle = '#000';
      X.fillStyle = G.pop.col;
      X.strokeText(G.pop.txt, W / 2, py - a * 30);
      X.fillText(G.pop.txt, W / 2, py - a * 30);
      
      if (G.combo > 1) {
        X.font = "26px Bungee, Impact, sans-serif";
        X.fillStyle = '#fff';
        X.strokeText(G.combo + 'x', W / 2, py + 34 - a * 30);
        X.fillText(G.combo + 'x', W / 2, py + 34 - a * 30);
      }
      X.globalAlpha = 1;
    }
  }
  
  if (now > -0.4 && now < 4 * BEAT) {
    const b = Math.floor(now / BEAT);
    const t = ['3', '2', '1', 'VAI!'][Math.max(0, b)];
    X.font = "90px Bungee, Impact, sans-serif";
    X.lineWidth = 8;
    X.strokeStyle = '#000';
    X.fillStyle = '#ffd23f';
    X.globalAlpha = 1 - ((now / BEAT) % 1) * 0.6;
    X.strokeText(t, W / 2, H / 2);
    X.fillText(t, W / 2, H / 2);
    X.globalAlpha = 1;
  }
}

function fit() {
  const k = Math.min(innerWidth / W, innerHeight / H);
  C.style.width = W * k + 'px';
  C.style.height = H * k + 'px';
}

addEventListener('resize', fit);
let lastF = 0;

function frame(ts) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (ts - lastF) / 1000);
  lastF = ts;
  if (G && G.state === 'play') update(dt);
  draw();
}

fit();
menu();
requestAnimationFrame(frame);