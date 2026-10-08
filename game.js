/*
 * Neon Dodge (versión web, un jugador)
 * Port simplificado de juego/neon_dodge.py para jugar en el navegador (Safari del iPad incluido).
 * Todo se dibuja en <canvas>, sin imágenes, fuentes ni librerías externas: una vez cargado anda sin internet.
 */
'use strict';
(function () {
  // ---------------------------------------------------------------------------
  // Constantes (mismos valores que la versión de Python)
  // ---------------------------------------------------------------------------
  const W = 960, H = 640, TAU = Math.PI * 2;
  const BG_DEEP = [8, 10, 24];
  const CYAN = [0, 240, 255], MAGENTA = [255, 40, 180], PINK = [255, 120, 220], YELLOW = [255, 220, 60];
  const ORANGE = [255, 150, 40], LIME = [80, 255, 120], WHITE = [240, 248, 255], DIM = [120, 140, 180];
  const RED = [255, 60, 90];

  const MAX_PARTICLES = 700, MAX_ENEMIES = 40, MAX_ENEMY_BULLETS = 260;
  const KILL_POINTS = { orb: 2, spinner: 3, hunter: 5 };
  const ENEMY_HP = { orb: 1, spinner: 2, hunter: 3 };
  const ENEMY_RADIUS = { orb: 12, spinner: 14, hunter: 16 };
  const ENEMY_COLOR = { orb: MAGENTA, spinner: YELLOW, hunter: RED };
  const BOSS_SCORES = [80, 220, 400];
  const SCORE_POWERUP = 10;
  const FIRE_COOLDOWN = 0.12, FIRE_COOLDOWN_RAPID = 0.065, BULLET_SPEED = 640;
  const WAVE_INTERVAL = 4.5;
  const POWERUP_COLORS = { heal: LIME, magnet: CYAN, score: YELLOW, rapid: ORANGE };
  const FONT = 'ui-monospace, Menlo, Consolas, "Courier New", monospace';
  const LS_NAME = 'neonDodge.nombre', LS_BEST = 'neonDodge.record';

  // ---------------------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------------------
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const rgb = (c, a) => (a === undefined ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`);
  const half = (c) => [c[0] >> 1, c[1] >> 1, c[2] >> 1];
  const deg = Math.PI / 180;
  function norm(x, y) {
    const l = Math.hypot(x, y);
    return l > 1e-6 ? [x / l, y / l] : [0, 0];
  }
  function lsGet(k, def) {
    try { const v = localStorage.getItem(k); return v === null ? def : v; } catch (e) { return def; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, String(v)); } catch (e) { /* modo privado: no pasa nada */ }
  }
  function cleanName(s) {
    s = String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 14);
    return s || 'Jugador';
  }

  // ---------------------------------------------------------------------------
  // Canvas, escala y glow
  // ---------------------------------------------------------------------------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const view = { w: 0, h: 0, dpr: 1, scale: 1, ox: 0, oy: 0, dprCap: 2 };

  function resize() {
    view.w = window.innerWidth;
    view.h = window.innerHeight;
    view.dpr = Math.min(window.devicePixelRatio || 1, view.dprCap);
    canvas.width = Math.round(view.w * view.dpr);
    canvas.height = Math.round(view.h * view.dpr);
    view.scale = Math.min(view.w / W, view.h / H);
    view.ox = (view.w - W * view.scale) / 2;
    view.oy = (view.h - H * view.scale) / 2;
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  resize();

  const toWorld = (sx, sy) => [(sx - view.ox) / view.scale, (sy - view.oy) / view.scale];

  // Sprite de glow por color (gradiente radial cacheado), se dibuja escalado con blend aditivo.
  const glowCache = new Map();
  function glowSprite(c) {
    const key = c[0] * 65536 + c[1] * 256 + c[2];
    let s = glowCache.get(key);
    if (!s) {
      s = document.createElement('canvas');
      s.width = s.height = 128;
      const g = s.getContext('2d');
      const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grd.addColorStop(0, rgb(c, 1));
      grd.addColorStop(0.22, rgb(c, 0.6));
      grd.addColorStop(0.55, rgb(c, 0.18));
      grd.addColorStop(1, rgb(c, 0));
      g.fillStyle = grd;
      g.fillRect(0, 0, 128, 128);
      glowCache.set(key, s);
    }
    return s;
  }
  // Requiere globalCompositeOperation = 'lighter' (usar dentro de additive()).
  function glow(x, y, r, c, k) {
    if (r < 1 || k <= 0.01) return;
    ctx.globalAlpha = k > 1 ? 1 : k;
    ctx.drawImage(glowSprite(c), x - r, y - r, r * 2, r * 2);
  }
  function additive(fn) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    fn();
    ctx.restore();
  }
  function poly(pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }
  function circle(x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.5, r), 0, TAU);
  }
  function text(str, x, y, size, color, opts) {
    opts = opts || {};
    ctx.font = `${opts.bold ? 'bold ' : ''}${size}px ${FONT}`;
    ctx.textAlign = opts.align || 'left';
    ctx.textBaseline = opts.base || 'top';
    if (opts.glow) {
      ctx.shadowColor = rgb(color);
      ctx.shadowBlur = opts.glow;
    }
    ctx.fillStyle = typeof color === 'string' ? color : rgb(color, opts.alpha);
    ctx.fillText(str, x, y);
    if (opts.glow) ctx.shadowBlur = 0;
  }

  // ---------------------------------------------------------------------------
  // Partículas, anillos y textos flotantes
  // ---------------------------------------------------------------------------
  class ParticleSystem {
    constructor() { this.parts = []; this.rings = []; }
    burst(x, y, c, n = 18, speed = 180, size = 5, life = 0.6, gravity = 60) {
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU), sp = rand(speed * 0.25, speed), l = rand(life * 0.5, life);
        this.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: l, max: l, c,
          size: rand(size * 0.5, size), g: rand(0, gravity), drag: 1.5 });
      }
      this.cap();
    }
    spray(x, y, dx, dy, c, n = 4, spread = 0.5, speed = 160, size = 3, life = 0.25) {
      const base = Math.atan2(dy, dx);
      for (let i = 0; i < n; i++) {
        const a = base + rand(-spread, spread), sp = rand(speed * 0.4, speed), l = rand(life * 0.5, life);
        this.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: l, max: l, c, size, g: 0, drag: 3 });
      }
      this.cap();
    }
    trail(x, y, c, size = 3, life = 0.25) {
      this.parts.push({ x: x + rand(-3, 3), y: y + rand(-3, 3), vx: rand(-20, 20), vy: rand(-20, 20),
        life, max: life, c, size, g: 0, drag: 0 });
      this.cap();
    }
    ring(x, y, c, radius, life = 0.6, width = 4) {
      this.rings.push({ x, y, c, radius, life, max: life, width });
    }
    cap() {
      if (this.parts.length > MAX_PARTICLES) this.parts.splice(0, this.parts.length - MAX_PARTICLES);
    }
    update(dt) {
      let j = 0;
      for (let i = 0; i < this.parts.length; i++) {
        const p = this.parts[i];
        if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; }
        p.vy += p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        if (p.life > 0) this.parts[j++] = p;
      }
      this.parts.length = j;
      this.rings = this.rings.filter((r) => (r.life -= dt) > 0);
    }
    draw() {
      additive(() => {
        for (const r of this.rings) {
          const t = 1 - r.life / r.max, fade = 1 - t;
          ctx.globalAlpha = fade;
          ctx.strokeStyle = rgb(r.c);
          ctx.lineWidth = Math.max(1, r.width * fade) + 1;
          circle(r.x, r.y, 8 + r.radius * (1 - (1 - t) * (1 - t)));
          ctx.stroke();
        }
        for (const p of this.parts) {
          const t = p.life / p.max;
          glow(p.x, p.y, p.size * (0.9 + 1.1 * t) * 1.5, p.c, t * 1.1);
        }
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Fondo en capas (estrellas lejanas, grilla que scrollea, estrellas cercanas, viñeta)
  // ---------------------------------------------------------------------------
  const bg = (() => {
    const far = Array.from({ length: 90 }, () => [rand(0, W), rand(0, H)]);
    const near = Array.from({ length: 36 }, () => [rand(0, W), rand(0, H), rand(1, 2.2)]);
    const vig = document.createElement('canvas');
    vig.width = vig.height = 256;
    const vg = vig.getContext('2d');
    const grd = vg.createRadialGradient(128, 128, 60, 128, 128, 182);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(0,0,0,0.72)');
    vg.fillStyle = grd;
    vg.fillRect(0, 0, 256, 256);
    const STEP = 48;
    const st = { off: 0, pulse: 0 };
    st.update = (dt) => { st.off += 30 * dt; st.pulse += dt; };
    st.draw = () => {
      ctx.fillStyle = rgb(BG_DEEP);
      ctx.fillRect(-40, -40, W + 80, H + 80);
      for (const [x, y] of far) {
        const a = Math.floor(70 + 40 * Math.sin(st.pulse * 2 + x));
        ctx.fillStyle = `rgb(${a},${a},${Math.min(255, a + 50)})`;
        ctx.fillRect(x, y, 1.6, 1.6);
      }
      const ox = st.off % STEP, oy = (st.off * 0.6) % STEP;
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgb(0,42,56)';
      ctx.beginPath();
      for (let x = ox - STEP; x <= W + STEP; x += STEP) { ctx.moveTo(x, -40); ctx.lineTo(x, H + 40); }
      ctx.stroke();
      ctx.strokeStyle = 'rgb(46,10,40)';
      ctx.beginPath();
      for (let y = oy - STEP; y <= H + STEP; y += STEP) { ctx.moveTo(-40, y); ctx.lineTo(W + 40, y); }
      ctx.stroke();
      additive(() => {
        for (const [x, y, s] of near) {
          glow(x, y, (5 + s * 2) * 1.6, [110, 150, 255], 0.3 + 0.4 * Math.abs(Math.sin(st.pulse * 2.5 + y)));
        }
      });
      ctx.fillStyle = rgb(WHITE);
      for (const [x, y, s] of near) { circle(x, y, Math.max(1, s / 2)); ctx.fill(); }
    };
    st.drawVignette = () => ctx.drawImage(vig, -20, -20, W + 40, H + 40);
    return st;
  })();

  // ---------------------------------------------------------------------------
  // Entidades
  // ---------------------------------------------------------------------------
  function makePlayer() {
    return { x: W / 2, y: H * 0.7, r: 14, speed: 280, hp: 3, invuln: 0, magnet: 0, rapid: 0, fireCd: 0,
      angle: -Math.PI / 2, trailAcc: 0, color: CYAN };
  }

  function drawPlayer(p) {
    if (p.invuln > 0 && Math.floor(p.invuln * 14) % 2 === 0) return;
    const px = p.x, py = p.y, a = p.angle, r = p.r;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(px, py + 18, 20, 7, 0, 0, TAU);
    ctx.fill();
    additive(() => glow(px, py, 52, p.rapid > 0 ? ORANGE : p.color, 0.6));
    const pt = (ang, rr) => [px + Math.cos(ang) * rr, py + Math.sin(ang) * rr];
    poly([pt(a, r + 5), pt(a + 2.5, r), pt(a + Math.PI, r * 0.45), pt(a - 2.5, r)]);
    ctx.fillStyle = rgb(half(p.color));
    ctx.fill();
    ctx.shadowColor = rgb(p.color);
    ctx.shadowBlur = 14;
    ctx.strokeStyle = rgb(p.color);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.shadowBlur = 0;
    const tip = pt(a, r + 9);
    ctx.strokeStyle = rgb(WHITE);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(tip[0], tip[1]);
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.fillStyle = rgb(WHITE);
    circle(px, py, 4);
    ctx.fill();
  }

  function drawEnemy(e) {
    const px = e.x, py = e.y, fl = e.flash > 0, r = e.r;
    if (e.kind === 'orb') {
      ctx.fillStyle = rgb(fl ? WHITE : MAGENTA);
      circle(px, py, r); ctx.fill();
      ctx.strokeStyle = rgb(WHITE); ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = 'rgb(255,190,225)';
      circle(px - 3, py - 3, Math.max(2, Math.floor(r / 3))); ctx.fill();
    } else if (e.kind === 'spinner') {
      const c = rgb(fl ? WHITE : YELLOW);
      ctx.strokeStyle = c; ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = e.angle + i * (Math.PI / 2);
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(a) * r * 1.4, py + Math.sin(a) * r * 1.4);
      }
      ctx.stroke();
      ctx.fillStyle = c;
      circle(px, py, r * 0.55); ctx.fill();
    } else {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const a = e.angle + i * (TAU / 10) - Math.PI / 2, rr = i % 2 === 0 ? r : r * 0.45;
        pts.push([px + Math.cos(a) * rr, py + Math.sin(a) * rr]);
      }
      poly(pts);
      ctx.fillStyle = rgb(fl ? WHITE : RED); ctx.fill();
      ctx.strokeStyle = rgb(WHITE); ctx.lineWidth = 1; ctx.stroke();
    }
  }

  function drawPowerup(u, t) {
    if (u.life < 2 && Math.floor(u.life * 8) % 2 === 0) return; // parpadea antes de desaparecer
    const px = u.x, py = u.y + Math.sin(u.bob) * 4, c = POWERUP_COLORS[u.kind];
    additive(() => glow(px, py, 34, c, 0.7));
    ctx.fillStyle = rgb(c);
    circle(px, py, u.r); ctx.fill();
    ctx.strokeStyle = rgb(WHITE); ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = rgb(WHITE);
    ctx.beginPath();
    if (u.kind === 'heal') {
      ctx.moveTo(px - 4, py); ctx.lineTo(px + 4, py); ctx.moveTo(px, py - 4); ctx.lineTo(px, py + 4); ctx.stroke();
    } else if (u.kind === 'magnet') {
      ctx.arc(px, py, 5, Math.PI + 0.3, Math.PI + 2.8); ctx.stroke();
    } else if (u.kind === 'rapid') {
      poly([[px - 1, py - 6], [px + 4, py - 1], [px, py], [px + 1, py + 6], [px - 4, py + 1], [px, py]]); ctx.fill();
    } else {
      poly([[px, py - 5], [px + 4, py + 3], [px - 4, py + 3]]); ctx.fill();
    }
  }

  // ---------------------------------------------------------------------------
  // Jefes (mismos patrones que en Python)
  // ---------------------------------------------------------------------------
  class Boss {
    constructor(def) {
      Object.assign(this, def);
      this.x = W / 2; this.y = -90;
      this.hp = this.maxHp;
      this.state = 'enter';
      this.t = 0; this.flash = 0; this.angle = 0; this.index = 0;
      this.phase2Announced = false;
    }
    get phase() { return this.hp <= this.maxHp * 0.5 ? 2 : 1; }
    get vulnerable() { return this.state !== 'enter'; }
    update(dt, g) {
      this.flash = Math.max(0, this.flash - dt);
      this.angle += dt;
      if (this.state === 'enter') {
        this.y = Math.min(this.enterY, this.y + 170 * dt);
        if (this.y >= this.enterY) this.state = 'fight';
        return;
      }
      this.t += dt;
      this.fight(dt, g);
    }
    damage(n) {
      if (!this.vulnerable) return false;
      this.hp -= n;
      this.flash = 0.06;
      return this.hp <= 0;
    }
    ringShot(g, n, speed, offset = 0, color = null, radius = 6) {
      for (let i = 0; i < n; i++) {
        const a = offset + i * TAU / n;
        g.enemyShot(this.x, this.y, Math.cos(a) * speed, Math.sin(a) * speed, color || this.color, radius);
      }
    }
    fanShot(g, tx, ty, n, spread, speed, color = null) {
      const base = Math.atan2(ty - this.y, tx - this.x);
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * spread;
        g.enemyShot(this.x, this.y, Math.cos(a) * speed, Math.sin(a) * speed, color || this.color, 6);
      }
    }
    bodyColor() { return this.flash > 0 ? WHITE : this.color; }
    drawAura(px, py) {
      additive(() => glow(px, py, this.r * 3.6, this.color, this.phase === 1 ? 0.6 : 0.9));
      if (this.state === 'enter') { // escudo mientras entra (invulnerable)
        const pulse = 0.5 + 0.5 * Math.sin(this.angle * 10);
        ctx.strokeStyle = `rgb(${Math.floor(120 * pulse)},${Math.floor(200 * pulse)},255)`;
        ctx.lineWidth = 2;
        circle(px, py, this.r + 12); ctx.stroke();
      }
    }
    strokeNeon(c, w) {
      ctx.shadowColor = rgb(this.color);
      ctx.shadowBlur = 16;
      ctx.strokeStyle = rgb(c);
      ctx.lineWidth = w;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  class Warden extends Boss {
    constructor() {
      super({ name: 'WARDEN', color: MAGENTA, maxHp: 70, r: 42, bonus: 50, enterY: 160 });
      this.burstCd = 1.2; this.spiralCd = 0; this.spiralAng = 0; this.burstOff = 0;
    }
    fight(dt, g) {
      const p2 = this.phase === 2;
      this.angle += dt * (p2 ? 1.4 : 0.6);
      this.x = W / 2 + Math.sin(this.t * 0.5) * 260;
      this.y = this.enterY + Math.sin(this.t * 0.9) * 60;
      this.burstCd -= dt;
      if (this.burstCd <= 0) {
        const n = p2 ? 18 : 14;
        this.ringShot(g, n, p2 ? 200 : 170, this.burstOff);
        this.burstOff += Math.PI / n;
        this.burstCd = p2 ? 2.6 : 1.9;
        g.particles.ring(this.x, this.y, this.color, 70, 0.4, 3);
      }
      if (p2) {
        this.spiralCd -= dt;
        while (this.spiralCd <= 0) {
          this.spiralCd += 0.11;
          this.spiralAng += 0.37;
          for (const k of [0, Math.PI]) {
            const a = this.spiralAng + k;
            g.enemyShot(this.x, this.y, Math.cos(a) * 160, Math.sin(a) * 160, PINK, 5);
          }
        }
      }
    }
    draw() {
      const px = this.x, py = this.y, c = this.bodyColor();
      this.drawAura(px, py);
      const layers = [[this.r, this.angle], [this.r * 0.7, -this.angle * 1.5]];
      layers.forEach(([r, rot], layer) => {
        const pts = [];
        for (let i = 0; i < 6; i++) pts.push([px + Math.cos(rot + i * TAU / 6) * r, py + Math.sin(rot + i * TAU / 6) * r]);
        poly(pts);
        if (layer === 0) { ctx.fillStyle = 'rgb(60,0,45)'; ctx.fill(); }
        this.strokeNeon(c, 3);
      });
      ctx.fillStyle = rgb(WHITE);
      circle(px, py, 10 + 3 * Math.sin(this.angle * 6)); ctx.fill();
      ctx.fillStyle = rgb(PINK);
      for (let i = 0; i < 6; i++) {
        const a = this.angle + i * TAU / 6;
        circle(px + Math.cos(a) * this.r, py + Math.sin(a) * this.r, 4); ctx.fill();
      }
    }
  }

  class Seeker extends Boss {
    constructor() {
      super({ name: 'SEEKER', color: YELLOW, maxHp: 100, r: 36, bonus: 80, enterY: 130 });
      this.aimCd = 1.0; this.summonCd = 4.0; this.ringCd = 3.0; this.lx = 0; this.ly = 1;
    }
    fight(dt, g) {
      const p2 = this.phase === 2;
      this.x = W / 2 + Math.sin(this.t * 0.7) * 330;
      this.y = this.enterY + Math.sin(this.t * 1.4) * 35;
      const [tx, ty] = g.targetFor(this.x, this.y);
      const [nx, ny] = norm(tx - this.x, ty - this.y);
      if (nx || ny) {
        const k = Math.min(1, 6 * dt);
        this.lx += (nx - this.lx) * k; this.ly += (ny - this.ly) * k;
      }
      this.aimCd -= dt;
      if (this.aimCd <= 0) {
        if (!p2) { this.fanShot(g, tx, ty, 3, 0.18, 260); this.aimCd = 1.1; }
        else { this.fanShot(g, tx, ty, 5, 0.16, 300); this.aimCd = 0.8; }
        g.particles.spray(this.x + this.lx * this.r, this.y + this.ly * this.r, this.lx, this.ly, YELLOW, 6, 0.4, 200);
      }
      this.summonCd -= dt;
      if (this.summonCd <= 0) {
        this.summonCd = p2 ? 5.0 : 6.5;
        let hunters = g.enemies.filter((e) => e.kind === 'hunter').length;
        for (const side of [-1, 1]) {
          if (hunters < 6) {
            g.enemies.push(g.makeEnemy(Math.max(3, g.wave), 'hunter', this.x + side * 50, this.y + 20));
            hunters++;
          }
        }
        g.particles.ring(this.x, this.y, YELLOW, 90, 0.5, 3);
      }
      if (p2) {
        this.ringCd -= dt;
        if (this.ringCd <= 0) { this.ringCd = 3.0; this.ringShot(g, 10, 120, rand(0, TAU), ORANGE, 7); }
      }
    }
    draw() {
      const px = this.x, py = this.y, r = this.r, c = this.bodyColor();
      this.drawAura(px, py);
      poly([[px, py - r * 1.25], [px + r * 1.5, py], [px, py + r * 1.25], [px - r * 1.5, py]]);
      ctx.fillStyle = 'rgb(55,45,0)'; ctx.fill();
      this.strokeNeon(c, 3);
      ctx.fillStyle = 'rgb(250,245,220)';
      ctx.beginPath(); ctx.ellipse(px, py, r * 0.9, r * 0.55, 0, 0, TAU); ctx.fill();
      const ex = px + this.lx * r * 0.35, ey = py + this.ly * r * 0.35;
      ctx.fillStyle = rgb(this.phase === 2 ? ORANGE : YELLOW);
      circle(ex, ey, r * 0.36); ctx.fill();
      ctx.fillStyle = 'rgb(20,10,0)';
      circle(ex, ey, r * 0.17); ctx.fill();
      ctx.fillStyle = rgb(c);
      for (const side of [-1, 1]) {
        const a = this.angle * 2 * side;
        circle(px + side * r * 1.9 + Math.cos(a) * 6, py + Math.sin(a) * 6, 5); ctx.fill();
      }
    }
  }

  class Titan extends Boss {
    constructor() {
      super({ name: 'TITAN', color: RED, maxHp: 160, r: 48, bonus: 150, enterY: 170 });
      this.mode = 'roam'; this.modeT = 2.0; this.burstCd = 1.0; this.burstOff = 0;
      this.dx = 0; this.dy = 1; this.rtx = W / 2; this.rty = H / 2 - 60;
    }
    fight(dt, g) {
      const p2 = this.phase === 2;
      this.angle += dt * (p2 ? 2.2 : 1.0);
      if (this.mode === 'roam') {
        const dx = this.rtx - this.x, dy = this.rty - this.y, d = Math.hypot(dx, dy);
        if (d < 20) { this.rtx = rand(120, W - 120); this.rty = rand(100, H - 160); }
        else { this.x += dx / d * 90 * dt; this.y += dy / d * 90 * dt; }
        this.burstCd -= dt;
        if (this.burstCd <= 0) {
          this.ringShot(g, p2 ? 16 : 12, 180, this.burstOff);
          this.burstOff += 0.2;
          this.burstCd = p2 ? 1.4 : 2.2;
        }
        this.modeT -= dt;
        if (this.modeT <= 0) {
          this.mode = 'tele';
          this.modeT = p2 ? 0.5 : 0.75;
          const [tx, ty] = g.targetFor(this.x, this.y);
          const [nx, ny] = norm(tx - this.x, ty - this.y);
          [this.dx, this.dy] = (nx || ny) ? [nx, ny] : [0, 1];
        }
      } else if (this.mode === 'tele') {
        this.modeT -= dt;
        if (this.modeT <= 0) { this.mode = 'charge'; this.modeT = 0.95; g.addShake(5); }
      } else if (this.mode === 'charge') {
        const sp = p2 ? 760 : 620;
        this.x += this.dx * sp * dt; this.y += this.dy * sp * dt;
        g.particles.trail(this.x - this.dx * this.r, this.y - this.dy * this.r, ORANGE, 6, 0.35);
        this.modeT -= dt;
        const hitWall = this.x < this.r || this.x > W - this.r || this.y < this.r || this.y > H - this.r;
        if (hitWall || this.modeT <= 0) {
          this.x = clamp(this.x, this.r, W - this.r);
          this.y = clamp(this.y, this.r, H - this.r);
          if (hitWall) {
            this.ringShot(g, p2 ? 14 : 10, 210, rand(0, TAU), ORANGE);
            g.particles.burst(this.x, this.y, ORANGE, 24, 260, 6);
            g.addShake(12);
          }
          if (p2) { const [tx, ty] = g.targetFor(this.x, this.y); this.fanShot(g, tx, ty, 5, 0.2, 280, YELLOW); }
          this.mode = 'recover';
          this.modeT = 0.6;
        }
      } else {
        this.modeT -= dt;
        if (this.modeT <= 0) { this.mode = 'roam'; this.modeT = p2 ? 1.6 : 2.6; }
      }
    }
    draw() {
      let px = this.x, py = this.y;
      const r = this.r, c = this.bodyColor();
      if (this.mode === 'tele' && Math.floor(this.modeT * 16) % 2 === 0) { // aviso de embestida
        ctx.strokeStyle = 'rgb(255,80,80)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + this.dx * 1400, py + this.dy * 1400); ctx.stroke();
        additive(() => glow(px + this.dx * (r + 20), py + this.dy * (r + 20), 44, RED, 1));
      }
      if (this.mode === 'tele') { px += rand(-3, 3); py += rand(-3, 3); }
      this.drawAura(px, py);
      const pts = [];
      for (let i = 0; i < 16; i++) {
        const a = this.angle + i * TAU / 16, rr = r * (i % 2 === 0 ? 1.15 : 0.78);
        pts.push([px + Math.cos(a) * rr, py + Math.sin(a) * rr]);
      }
      poly(pts);
      ctx.fillStyle = 'rgb(70,0,15)'; ctx.fill();
      this.strokeNeon(c, 3);
      const inner = [];
      for (let i = 0; i < 8; i++) {
        const a = -this.angle * 1.7 + i * TAU / 8;
        inner.push([px + Math.cos(a) * r * 0.55, py + Math.sin(a) * r * 0.55]);
      }
      poly(inner);
      ctx.strokeStyle = rgb(this.phase === 2 ? ORANGE : c); ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = rgb(WHITE);
      circle(px, py, 12 + 3 * Math.sin(this.angle * 8)); ctx.fill();
    }
  }
  const BOSS_TYPES = [Warden, Seeker, Titan];

  // ---------------------------------------------------------------------------
  // Estado del juego
  // ---------------------------------------------------------------------------
  const G = {
    state: 'menu', // menu | play | pause | over | win
    name: cleanName(lsGet(LS_NAME, 'Jugador')),
    best: parseInt(lsGet(LS_BEST, '0'), 10) || 0,
    god: false,
    fps: 60,
    stats: { frames: 0, playFrames: 0, bossFrames: 0, shots: 0, kills: 0, bossesKilled: 0, maxParticles: 0,
      maxEnemyBullets: 0, bossesSeen: [] },
  };

  function initRound() {
    G.player = makePlayer();
    G.enemies = []; G.bullets = []; G.ebullets = []; G.powerups = [];
    G.particles = new ParticleSystem();
    G.popups = []; G.pendingFx = [];
    G.boss = null; G.nextBossIdx = 0; G.bossesDefeated = 0; G.bossCooldown = 0;
    G.winTimer = 0; G.endTimer = 0;
    G.score = 0; G.wave = 0; G.waveTimer = 0.5; G.elapsed = 0; G.survivalAcc = 0;
    G.shake = 0;
    G.banner = { text: '', c: WHITE, t: 0 };
    G.newRecord = false;
  }
  initRound();

  G.addShake = (a) => { G.shake = Math.max(G.shake, a); };
  G.showBanner = (txt, c, t = 2.2) => { G.banner = { text: txt, c, t }; };
  G.popup = (x, y, txt, c, big = false) => {
    const life = big ? 1.3 : 0.8;
    G.popups.push({ x, y, txt, c, big, life, max: life });
  };
  G.enemyShot = (x, y, vx, vy, c, r = 6) => {
    if (G.ebullets.length < MAX_ENEMY_BULLETS) G.ebullets.push({ x, y, vx, vy, c, r });
  };
  G.targetFor = () => (G.player.hp > 0 ? [G.player.x, G.player.y] : [W / 2, H / 2]);

  G.makeEnemy = (w, kind, x, y) => {
    if (x === undefined) {
      const side = Math.floor(Math.random() * 4);
      if (side === 0) { x = rand(20, W - 20); y = -20; }
      else if (side === 1) { x = rand(20, W - 20); y = H + 20; }
      else if (side === 2) { x = -20; y = rand(20, H - 20); }
      else { x = W + 20; y = rand(20, H - 20); }
    }
    if (!kind) {
      const kinds = ['orb', 'orb', 'spinner'];
      if (w >= 3) kinds.push('hunter');
      if (w >= 6) kinds.push('hunter');
      kind = choice(kinds);
    }
    const speed = 60 + w * 8 + rand(0, 40);
    const [tx, ty] = G.targetFor(x, y);
    const ang = Math.atan2(ty - y, tx - x) + rand(-0.5, 0.5);
    return { x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r: ENEMY_RADIUS[kind], kind,
      hp: ENEMY_HP[kind], huntSpeed: Math.min(170, 90 + w * 4), angle: 0,
      spin: kind !== 'orb' ? rand(2, 5) : 0, flash: 0, alive: true };
  };

  function spawnPowerup(x, y, kind) {
    if (G.powerups.length >= 6) return;
    kind = kind || choice(['heal', 'magnet', 'score', 'score', 'rapid']);
    if (x === undefined) { x = rand(60, W - 60); y = rand(80, H - 60); }
    G.powerups.push({ x: clamp(x, 30, W - 30), y: clamp(y, 50, H - 30), kind, r: 10, life: 9, bob: rand(0, TAU) });
  }

  function spawnWave(minor) {
    if (!minor) G.wave++;
    const w = Math.max(1, G.wave);
    let n = minor ? Math.max(1, Math.floor((2 + w) / 3)) : 2 + w;
    n = Math.min(n, MAX_ENEMIES - G.enemies.length);
    for (let i = 0; i < n; i++) G.enemies.push(G.makeEnemy(w));
    if (!minor && Math.random() < 0.4) spawnPowerup();
  }

  function startBoss(idx) {
    const boss = new BOSS_TYPES[idx]();
    boss.index = idx;
    G.boss = boss;
    G.nextBossIdx = idx;
    G.stats.bossesSeen.push(boss.name);
    const fin = idx === BOSS_TYPES.length - 1 ? ' (FINAL)' : '';
    G.showBanner(`!! JEFE ${idx + 1}/${BOSS_TYPES.length}: ${boss.name}${fin} !!`, boss.color, 2.5);
    G.addShake(6);
    G.particles.ring(W / 2, 60, boss.color, 400, 1.0, 5);
  }

  function onBossKilled(boss) {
    G.stats.bossesKilled++;
    G.bossesDefeated++;
    G.score += boss.bonus;
    G.popup(boss.x, boss.y - 60, `+${boss.bonus}`, YELLOW, true);
    for (let i = 0; i < 7; i++) { // cadena de explosiones
      G.pendingFx.push([i * 0.13, boss.x + rand(-45, 45), boss.y + rand(-45, 45), choice([boss.color, ORANGE, WHITE]), 26, 260, 7]);
    }
    G.pendingFx.push([1.0, boss.x, boss.y, WHITE, 90, 440, 9]);
    G.particles.ring(boss.x, boss.y, boss.color, 260, 0.9, 6);
    G.particles.ring(boss.x, boss.y, WHITE, 160, 0.6, 3);
    G.addShake(16);
    for (const b of G.ebullets) G.particles.burst(b.x, b.y, b.c, 2, 60, 3, 0.3); // las balas enemigas se desintegran
    G.ebullets.length = 0;
    spawnPowerup(boss.x - 40, boss.y, 'heal');
    spawnPowerup(boss.x + 40, boss.y, choice(['rapid', 'magnet']));
    G.boss = null;
    G.nextBossIdx = boss.index + 1;
    G.bossCooldown = 8.0;
    if (boss.index === BOSS_TYPES.length - 1) {
      G.winTimer = 2.4;
      G.showBanner('¡JEFE FINAL DERROTADO!', YELLOW, 2.4);
    } else {
      G.showBanner(`${boss.name} DERROTADO  +${boss.bonus}`, boss.color, 2.0);
    }
  }

  function killEnemy(e, byPlayer) {
    e.alive = false;
    const col = ENEMY_COLOR[e.kind];
    G.particles.burst(e.x, e.y, col, 20, 220, 6);
    G.particles.ring(e.x, e.y, col, 40, 0.35, 2);
    if (byPlayer) {
      const pts = KILL_POINTS[e.kind];
      G.score += pts;
      G.stats.kills++;
      G.popup(e.x, e.y - 10, `+${pts}`, col);
      if (Math.random() < 0.05) spawnPowerup(e.x, e.y);
    }
  }

  function damagePlayer() {
    const p = G.player;
    if (G.winTimer > 0 || p.invuln > 0) return false;
    if (!G.god) p.hp--;
    p.invuln = 1.2;
    G.particles.burst(p.x, p.y, RED, 22, 220, 6);
    G.addShake(8);
    if (p.hp <= 0) {
      G.particles.burst(p.x, p.y, p.color, 50, 300, 8);
      G.particles.ring(p.x, p.y, p.color, 120, 0.7, 4);
      setState('over');
    }
    return true;
  }

  function fire(ax, ay) {
    const p = G.player;
    let [dx, dy] = norm(ax - p.x, ay - p.y);
    if (!dx && !dy) { dx = Math.cos(p.angle); dy = Math.sin(p.angle); }
    const a = Math.atan2(dy, dx) + rand(-1.5, 1.5) * deg;
    dx = Math.cos(a); dy = Math.sin(a);
    const mx = p.x + dx * (p.r + 8), my = p.y + dy * (p.r + 8);
    G.bullets.push({ x: mx, y: my, vx: dx * BULLET_SPEED, vy: dy * BULLET_SPEED, life: 1.1, r: 5, dmg: 1 });
    G.stats.shots++;
    if (p.rapid > 0) { // disparo doble con el powerup
      const a2 = a + 4 * deg;
      G.bullets.push({ x: mx - dy * 7, y: my + dx * 7, vx: Math.cos(a2) * BULLET_SPEED, vy: Math.sin(a2) * BULLET_SPEED,
        life: 1.1, r: 5, dmg: 1 });
      G.stats.shots++;
    }
    G.particles.spray(mx, my, dx, dy, WHITE, 3, 0.4, 180, 3, 0.15);
    p.fireCd = p.rapid > 0 ? FIRE_COOLDOWN_RAPID : FIRE_COOLDOWN;
  }

  // ---------------------------------------------------------------------------
  // Update (port de Game.update_play para un jugador)
  // ---------------------------------------------------------------------------
  function updatePlay(dt, inp) {
    const p = G.player;
    // jugador
    let [mx, my] = [inp.mx, inp.my];
    const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    const ox = p.x, oy = p.y;
    p.x = clamp(p.x + mx * p.speed * dt, p.r, W - p.r);
    p.y = clamp(p.y + my * p.speed * dt, p.r, H - p.r);
    if (Math.hypot(inp.ax - p.x, inp.ay - p.y) > 2) p.angle = Math.atan2(inp.ay - p.y, inp.ax - p.x);
    p.invuln = Math.max(0, p.invuln - dt);
    p.magnet = Math.max(0, p.magnet - dt);
    p.rapid = Math.max(0, p.rapid - dt);
    p.fireCd = Math.max(0, p.fireCd - dt);
    p.trailAcc += dt;
    if (Math.hypot(p.x - ox, p.y - oy) > 1 && p.trailAcc > 0.03) {
      G.particles.trail(p.x - Math.cos(p.angle) * 10, p.y - Math.sin(p.angle) * 10, p.color);
      p.trailAcc = 0;
    }
    G.firing = inp.fire;
    if (inp.fire && p.fireCd <= 0) fire(inp.ax, inp.ay);

    // proyectiles del jugador
    for (const b of G.bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) b.life = 0;
      if (b.life <= 0) continue;
      for (const e of G.enemies) {
        const rr = e.r + b.r;
        if (e.alive && (e.x - b.x) ** 2 + (e.y - b.y) ** 2 < rr * rr) {
          b.life = 0;
          e.hp -= b.dmg;
          e.flash = 0.06;
          G.particles.spray(b.x, b.y, -b.vx, -b.vy, WHITE, 3, 0.7, 140, 3, 0.2);
          if (e.hp <= 0) killEnemy(e, true);
          break;
        }
      }
      const boss = G.boss;
      if (b.life > 0 && boss) {
        const rr = boss.r + b.r;
        if ((boss.x - b.x) ** 2 + (boss.y - b.y) ** 2 < rr * rr) {
          b.life = 0;
          if (boss.vulnerable) {
            G.particles.spray(b.x, b.y, -b.vx, -b.vy, boss.color, 4, 0.8, 180, 4, 0.25);
            if (boss.damage(b.dmg)) onBossKilled(boss);
          } else {
            G.particles.spray(b.x, b.y, -b.vx, -b.vy, CYAN, 2, 0.9, 120, 3, 0.2); // rebota en el escudo
          }
        }
      }
    }
    G.bullets = G.bullets.filter((b) => b.life > 0);

    // enemigos comunes
    for (const e of G.enemies) {
      e.angle += e.spin * dt;
      e.flash = Math.max(0, e.flash - dt);
      if (e.kind === 'hunter' && p.hp > 0) {
        const [nx, ny] = norm(p.x - e.x, p.y - e.y);
        const k = Math.min(1, 2.5 * dt);
        e.vx += (nx * e.huntSpeed - e.vx) * k;
        e.vy += (ny * e.huntSpeed - e.vy) * k;
      }
      e.x += e.vx * dt; e.y += e.vy * dt;
      // rebote solo si se está yendo hacia afuera (deja entrar a los que nacen fuera)
      if ((e.x < e.r && e.vx < 0) || (e.x > W - e.r && e.vx > 0)) e.vx *= -1;
      if ((e.y < e.r && e.vy < 0) || (e.y > H - e.r && e.vy > 0)) e.vy *= -1;
      if (!e.alive || p.hp <= 0) continue;
      const rr = e.r + p.r;
      if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 < rr * rr) {
        if (damagePlayer()) killEnemy(e, false);
        else {
          const [ax, ay] = norm(e.x - p.x, e.y - p.y);
          if (ax || ay) { e.vx = ax * 200; e.vy = ay * 200; }
        }
      }
    }
    G.enemies = G.enemies.filter((e) => e.alive);

    // jefe
    if (G.boss && G.state === 'play') {
      const boss = G.boss;
      boss.update(dt, G);
      G.stats.bossFrames++;
      if (boss.phase === 2 && !boss.phase2Announced) {
        boss.phase2Announced = true;
        G.showBanner(`${boss.name}: FASE 2`, boss.color, 1.6);
        G.particles.ring(boss.x, boss.y, boss.color, 200, 0.8, 5);
        G.particles.burst(boss.x, boss.y, boss.color, 30, 260, 6);
        G.addShake(10);
      }
      const dx = p.x - boss.x, dy = p.y - boss.y, rr = boss.r + p.r * 0.8;
      if (p.hp > 0 && dx * dx + dy * dy < rr * rr && damagePlayer()) {
        const [nx, ny] = (dx || dy) ? norm(dx, dy) : [0, 1];
        p.x = clamp(p.x + nx * 40, p.r, W - p.r);
        p.y = clamp(p.y + ny * 40, p.r, H - p.r);
      }
    }

    // balas enemigas
    const keep = [];
    for (const b of G.ebullets) {
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < -30 || b.x > W + 30 || b.y < -30 || b.y > H + 30) continue;
      const rr = b.r + p.r * 0.7;
      if (p.hp > 0 && (b.x - p.x) ** 2 + (b.y - p.y) ** 2 < rr * rr && damagePlayer()) continue;
      keep.push(b);
    }
    G.ebullets = keep;

    // powerups
    for (const u of G.powerups) {
      if (p.magnet > 0 && p.hp > 0) {
        const [nx, ny] = norm(p.x - u.x, p.y - u.y);
        u.x += nx * 240 * dt; u.y += ny * 240 * dt;
      }
      u.life -= dt;
      u.bob += dt * 4;
    }
    G.powerups = G.powerups.filter((u) => u.life > 0);
    for (const u of G.powerups.slice()) {
      const rr = u.r + p.r;
      if (p.hp <= 0 || (u.x - p.x) ** 2 + (u.y - p.y) ** 2 >= rr * rr) continue;
      G.powerups.splice(G.powerups.indexOf(u), 1);
      G.particles.burst(u.x, u.y, POWERUP_COLORS[u.kind], 16, 150);
      if (u.kind === 'heal') { p.hp = Math.min(5, p.hp + 1); G.popup(u.x, u.y, '+1 VIDA', LIME); }
      else if (u.kind === 'magnet') { p.magnet = 6; G.popup(u.x, u.y, 'IMÁN', CYAN); }
      else if (u.kind === 'rapid') { p.rapid = 6; G.popup(u.x, u.y, 'DISPARO RÁPIDO', ORANGE); }
      else { G.score += SCORE_POWERUP; G.popup(u.x, u.y, `+${SCORE_POWERUP}`, YELLOW); }
    }

    // puntaje por supervivencia: +1 por segundo
    G.elapsed += dt;
    G.survivalAcc += dt;
    while (G.survivalAcc >= 1) { G.survivalAcc -= 1; G.score += 1; }

    // aparición de jefes
    G.bossCooldown = Math.max(0, G.bossCooldown - dt);
    if (!G.boss && G.winTimer <= 0 && G.nextBossIdx < BOSS_TYPES.length && G.state === 'play'
        && G.score >= BOSS_SCORES[G.nextBossIdx] && G.bossCooldown <= 0) {
      startBoss(G.nextBossIdx);
    }

    // oleadas (con jefe: menos enemigos y más espaciadas)
    G.waveTimer -= dt;
    if (G.waveTimer <= 0) {
      const base = Math.max(2, WAVE_INTERVAL - G.wave * 0.12);
      if (G.boss) { spawnWave(true); G.waveTimer = base * 2.2; }
      else { if (G.winTimer <= 0) spawnWave(false); G.waveTimer = base; }
    }

    // victoria tras el jefe final
    if (G.winTimer > 0) {
      G.winTimer -= dt;
      if (G.winTimer <= 0 && G.state === 'play') {
        G.particles.burst(p.x, p.y, YELLOW, 60, 320, 7);
        setState('win');
      }
    }
  }

  function updateFx(dt) {
    for (const fx of G.pendingFx) {
      fx[0] -= dt;
      if (fx[0] <= 0) {
        G.particles.burst(fx[1], fx[2], fx[3], fx[4], fx[5], fx[6], 0.9);
        G.particles.ring(fx[1], fx[2], fx[3], fx[5] * 0.4, 0.5, 3);
        G.addShake(8);
      }
    }
    G.pendingFx = G.pendingFx.filter((fx) => fx[0] > 0);
    G.particles.update(dt);
    G.popups = G.popups.filter((t) => { t.y -= 40 * dt; t.life -= dt; return t.life > 0; });
    G.banner.t = Math.max(0, G.banner.t - dt);
    G.shake *= Math.exp(-7 * dt);
    if (G.shake < 0.3) G.shake = 0;
  }

  // ---------------------------------------------------------------------------
  // Input: teclado, mouse y táctil (joystick virtual + botón/stick de disparo)
  // ---------------------------------------------------------------------------
  const STICK_R = 62;
  const input = {
    keys: new Set(),
    mouse: { x: W / 2, y: H / 2, buttons: 0 },
    mode: navigator.maxTouchPoints > 0 && window.matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse',
    hasTouch: navigator.maxTouchPoints > 0 || 'ontouchstart' in window,
    move: null, // {id, ox, oy, x, y} en coordenadas de pantalla (CSS px)
    fire: null,
  };

  function releaseSticks() { input.move = null; input.fire = null; input.mouse.buttons = 0; }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (e.pointerType === 'mouse') {
      input.mode = 'mouse';
      [input.mouse.x, input.mouse.y] = toWorld(e.clientX, e.clientY);
      input.mouse.buttons = e.buttons;
      return;
    }
    input.mode = 'touch';
    input.hasTouch = true;
    if (G.state !== 'play') return;
    const side = e.clientX < view.w / 2 ? 'move' : 'fire';
    if (input[side]) return;
    input[side] = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* puntero sintético */ }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') {
      input.mode = 'mouse';
      [input.mouse.x, input.mouse.y] = toWorld(e.clientX, e.clientY);
      input.mouse.buttons = e.buttons;
      return;
    }
    for (const side of ['move', 'fire']) {
      const s = input[side];
      if (s && s.id === e.pointerId) {
        s.x = e.clientX; s.y = e.clientY;
        if (side === 'move') { // joystick flotante: la base sigue al dedo si se pasa del borde
          const dx = s.x - s.ox, dy = s.y - s.oy, d = Math.hypot(dx, dy);
          if (d > STICK_R) { s.ox += dx / d * (d - STICK_R); s.oy += dy / d * (d - STICK_R); }
        }
      }
    }
  });
  function pointerEnd(e) {
    if (e.pointerType === 'mouse') { input.mouse.buttons = e.buttons || 0; return; }
    for (const side of ['move', 'fire']) if (input[side] && input[side].id === e.pointerId) input[side] = null;
  }
  canvas.addEventListener('pointerup', pointerEnd);
  canvas.addEventListener('pointercancel', pointerEnd);
  canvas.addEventListener('lostpointercapture', pointerEnd);
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  // iOS: sin scroll, sin rebote, sin pinch-zoom ni doble toque
  document.addEventListener('touchmove', (e) => { if (e.target !== nameInput) e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false });
  canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd < 300 && e.target === canvas) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });

  function nearestTarget() {
    const p = G.player;
    let best = null, bd = Infinity;
    for (const e of G.enemies) {
      if (e.x < -10 || e.x > W + 10 || e.y < -10 || e.y > H + 10) continue;
      const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    if (G.boss && G.boss.vulnerable) {
      const d = (G.boss.x - p.x) ** 2 + (G.boss.y - p.y) ** 2;
      if (d < bd * 1.5) best = G.boss;
    }
    return best;
  }

  function readInput() {
    const k = input.keys;
    let mx = 0, my = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) my -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) my += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    if (mx && my) { mx *= Math.SQRT1_2; my *= Math.SQRT1_2; }
    const ms = input.move;
    if (ms) {
      const dx = ms.x - ms.ox, dy = ms.y - ms.oy, d = Math.hypot(dx, dy);
      if (d > 8) { const s = Math.min(d, STICK_R) / STICK_R; mx += dx / d * s; my += dy / d * s; }
    }
    const p = G.player;
    let ax, ay, fireOn;
    if (input.mode === 'mouse' && !input.fire) {
      ax = input.mouse.x; ay = input.mouse.y;
      fireOn = (input.mouse.buttons & 3) !== 0; // clic izquierdo o derecho
    } else {
      const fs = input.fire;
      fireOn = !!fs;
      const dx = fs ? fs.x - fs.ox : 0, dy = fs ? fs.y - fs.oy : 0;
      if (fs && Math.hypot(dx, dy) > 14) { // arrastrando: apunta hacia donde movés el dedo
        const [nx, ny] = norm(dx, dy);
        ax = p.x + nx * 150; ay = p.y + ny * 150;
      } else { // sin arrastrar: apunta solo al enemigo más cercano
        const t = nearestTarget();
        if (t) { ax = t.x; ay = t.y; }
        else { ax = p.x + Math.cos(p.angle) * 150; ay = p.y + Math.sin(p.angle) * 150; }
      }
    }
    G.aim = [ax, ay];
    return { mx, my, ax, ay, fire: fireOn };
  }

  // ---------------------------------------------------------------------------
  // Dibujo
  // ---------------------------------------------------------------------------
  function drawWorld() {
    bg.draw();
    for (const u of G.powerups) drawPowerup(u);
    if (G.enemies.length) {
      additive(() => { for (const e of G.enemies) glow(e.x, e.y, e.r * 3, ENEMY_COLOR[e.kind], 0.65); });
      for (const e of G.enemies) drawEnemy(e);
    }
    if (G.boss) G.boss.draw();
    if (G.bullets.length) {
      additive(() => { for (const b of G.bullets) glow(b.x, b.y, 18, G.player.color, 0.9); });
      ctx.strokeStyle = rgb(WHITE);
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (const b of G.bullets) {
        const [nx, ny] = norm(b.vx, b.vy);
        ctx.moveTo(b.x - nx * 12, b.y - ny * 12);
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
      ctx.lineCap = 'butt';
    }
    G.particles.draw();
    if (G.ebullets.length) {
      additive(() => { for (const b of G.ebullets) glow(b.x, b.y, b.r * 3.4, b.c, 0.8); });
      for (const b of G.ebullets) { ctx.fillStyle = rgb(b.c); circle(b.x, b.y, b.r); ctx.fill(); }
      ctx.fillStyle = rgb(WHITE);
      ctx.beginPath();
      for (const b of G.ebullets) { ctx.moveTo(b.x + b.r * 0.5, b.y); ctx.arc(b.x, b.y, Math.max(2, b.r * 0.5), 0, TAU); }
      ctx.fill();
    }
    if ((G.state === 'play' || G.state === 'pause') && G.player.hp > 0) {
      drawPlayer(G.player);
      text(G.name, G.player.x, G.player.y - 40, 13, G.player.color, { align: 'center', alpha: 0.85 });
    }
    for (const t of G.popups) {
      const a = clamp(t.life / t.max * 1.5, 0, 1);
      text(t.txt, t.x, t.y, t.big ? 28 : 16, t.c, { align: 'center', bold: t.big, alpha: a });
    }
    bg.drawVignette();
  }

  function drawBossBar(boss) {
    const bw = 460, bh = 16, x = W / 2 - bw / 2, y = 34;
    const frac = clamp(boss.hp / Math.max(1, boss.maxHp), 0, 1);
    text(`${boss.name}  ${boss.phase === 2 ? 'FASE 2' : 'FASE 1'}`, W / 2, 12, 16, boss.color, { align: 'center', bold: true });
    ctx.fillStyle = 'rgb(25,20,40)';
    ctx.fillRect(x - 3, y - 3, bw + 6, bh + 6);
    if (frac > 0) {
      ctx.shadowColor = rgb(boss.color);
      ctx.shadowBlur = 14;
      ctx.fillStyle = rgb(boss.flash > 0 ? WHITE : boss.color);
      ctx.fillRect(x, y, bw * frac, bh);
      ctx.shadowBlur = 0;
      additive(() => glow(x + bw * frac, y + bh / 2, 30, boss.color, 0.8));
    }
    ctx.strokeStyle = rgb(WHITE);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + bw / 2, y - 3); ctx.lineTo(x + bw / 2, y + bh + 3); ctx.stroke(); // marca de fase 2
    ctx.strokeRect(x - 3, y - 3, bw + 6, bh + 6);
  }

  function drawHud() {
    const p = G.player;
    text(`SCORE  ${G.score}`, 16, 12, 22, WHITE, { bold: true, glow: 8 });
    // vidas (a la izquierda: arriba a la derecha están los botones de pausa/reinicio)
    for (let i = 0; i < p.hp; i++) {
      const x = 26 + i * 26, y = 52;
      additive(() => glow(x, y, 22, MAGENTA, 0.55));
      ctx.fillStyle = rgb(MAGENTA); circle(x, y, 8); ctx.fill();
      ctx.strokeStyle = rgb(WHITE); ctx.lineWidth = 1; ctx.stroke();
    }
    text(`OLA ${G.wave}   JEFES ${G.bossesDefeated}/${BOSS_TYPES.length}`, 16, 68, 15, DIM);
    if (!G.boss && G.nextBossIdx < BOSS_TYPES.length && G.winTimer <= 0) {
      const falta = Math.max(0, BOSS_SCORES[G.nextBossIdx] - G.score);
      text(falta === 0 ? 'JEFE ENTRANDO...' : `PRÓXIMO JEFE EN ${falta} PTS`, 16, 88, 15, PINK);
    }
    let y = H - 26;
    if (p.magnet > 0) { text(`IMÁN ${p.magnet.toFixed(1)}s`, W / 2, y, 15, CYAN, { align: 'center' }); y -= 20; }
    if (p.rapid > 0) text(`DISPARO RÁPIDO ${p.rapid.toFixed(1)}s`, W / 2, y, 15, ORANGE, { align: 'center' });
    if (G.boss) drawBossBar(G.boss);
    text(`${Math.round(G.fps)} FPS`, W - 12, H - 20, 13, G.fps >= 55 ? LIME : YELLOW, { align: 'right', alpha: 0.8 });
    if (G.banner.t > 0) {
      const k = clamp(G.banner.t / 0.4, 0, 1);
      text(G.banner.text, W / 2, 92, 28, G.banner.c, { align: 'center', base: 'middle', bold: true, alpha: k, glow: 12 });
    }
  }

  function drawCrosshair() {
    if (G.state !== 'play') return;
    let x, y;
    if (input.mode === 'mouse' && !input.fire) { x = input.mouse.x; y = input.mouse.y; }
    else if (input.fire && G.aim) { x = clamp(G.aim[0], 0, W); y = clamp(G.aim[1], 0, H); }
    else return;
    const c = G.firing ? ORANGE : CYAN;
    additive(() => glow(x, y, 30, c, 0.55));
    ctx.strokeStyle = rgb(c); ctx.lineWidth = 2;
    circle(x, y, 11); ctx.stroke();
    ctx.strokeStyle = rgb(WHITE);
    ctx.beginPath();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(x + dx * 6, y + dy * 6); ctx.lineTo(x + dx * 16, y + dy * 16); }
    ctx.stroke();
    ctx.fillStyle = rgb(WHITE); circle(x, y, 2); ctx.fill();
  }

  // Controles táctiles (en coordenadas de pantalla)
  function drawStick(s, gx, gy, color, label, active) {
    const ox = s ? s.ox : gx, oy = s ? s.oy : gy;
    let kx = ox, ky = oy;
    if (s) {
      const dx = s.x - s.ox, dy = s.y - s.oy, d = Math.hypot(dx, dy);
      const m = Math.min(d, STICK_R);
      if (d > 0.01) { kx = ox + dx / d * m; ky = oy + dy / d * m; }
    }
    ctx.globalAlpha = active ? 0.9 : 0.35;
    ctx.fillStyle = rgb(color, 0.08);
    circle(ox, oy, STICK_R + 8); ctx.fill();
    ctx.strokeStyle = rgb(color, 0.7); ctx.lineWidth = 2; ctx.stroke();
    additive(() => glow(kx, ky, 56, color, active ? 0.7 : 0.35));
    ctx.fillStyle = rgb(color, active ? 0.55 : 0.3);
    circle(kx, ky, 28); ctx.fill();
    ctx.strokeStyle = rgb(WHITE, 0.8); ctx.stroke();
    if (label && !active) text(label, ox, oy + STICK_R + 16, 13, color, { align: 'center', alpha: 0.9 });
    ctx.globalAlpha = 1;
  }

  function drawTouchControls() {
    if (G.state !== 'play' || !(input.hasTouch || input.mode === 'touch')) return;
    const m = 30 + STICK_R;
    drawStick(input.move, m, view.h - m - 10, CYAN, 'MOVER', !!input.move);
    drawStick(input.fire, view.w - m, view.h - m - 10, ORANGE, 'DISPARAR', !!input.fire);
  }

  function render() {
    const { dpr, scale, ox, oy } = view;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#04050d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    if (G.shake > 0) ctx.translate(rand(-G.shake, G.shake), rand(-G.shake, G.shake));
    drawWorld();
    ctx.restore();
    if (G.state !== 'menu') { drawHud(); drawCrosshair(); }
    ctx.strokeStyle = rgb(CYAN, 0.35); ctx.lineWidth = 2; ctx.strokeRect(0, 0, W, H);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawTouchControls();
  }

  // ---------------------------------------------------------------------------
  // Pantallas HTML (menú, pausa, fin) y estados
  // ---------------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const nameInput = $('name');
  const menuEl = $('menu'), pauseEl = $('pause'), endEl = $('end'), hudBtns = $('hud-buttons');
  nameInput.value = G.name === 'Jugador' ? '' : G.name;
  $('best').textContent = G.best;

  function setState(s) {
    G.state = s;
    menuEl.classList.toggle('hidden', s !== 'menu');
    pauseEl.classList.toggle('hidden', s !== 'pause');
    endEl.classList.add('hidden');
    hudBtns.classList.toggle('hidden', !(s === 'play' || s === 'pause'));
    canvas.classList.toggle('playing-mouse', s === 'play');
    if (s !== 'play') releaseSticks();
    if (s === 'over' || s === 'win') {
      if (G.score > G.best) { G.best = G.score; G.newRecord = true; lsSet(LS_BEST, G.best); }
      $('best').textContent = G.best;
      G.endTimer = s === 'win' ? 0.4 : 1.1; // deja ver la explosión antes del cartel
    }
    if (s === 'menu') $('best').textContent = G.best;
  }

  function showEnd() {
    const win = G.state === 'win';
    $('end-title').textContent = win ? '¡GANASTE!' : 'GAME OVER';
    $('end-title').style.color = win ? rgb(YELLOW) : rgb(RED);
    $('end-stats').textContent = `${G.name} · Puntaje ${G.score} · Olas ${G.wave} · Jefes ${G.bossesDefeated}/${BOSS_TYPES.length}`;
    $('end-record').textContent = G.newRecord ? '¡Nuevo récord!' : `Récord: ${G.best}`;
    endEl.classList.remove('hidden');
  }

  function startGame() {
    G.name = cleanName(nameInput.value);
    nameInput.value = G.name === 'Jugador' ? '' : G.name;
    lsSet(LS_NAME, G.name);
    nameInput.blur();
    initRound();
    setState('play');
  }
  function togglePause() {
    if (G.state === 'play') setState('pause');
    else if (G.state === 'pause') setState('play');
  }
  function toMenu() { initRound(); setState('menu'); }

  const tap = (el, fn) => el.addEventListener('click', (e) => { e.preventDefault(); fn(); });
  tap($('btn-play'), startGame);
  tap($('btn-pause'), togglePause);
  tap($('btn-restart'), startGame);
  tap($('btn-resume'), togglePause);
  tap($('btn-pause-restart'), startGame);
  tap($('btn-pause-menu'), toMenu);
  tap($('btn-retry'), startGame);
  tap($('btn-end-menu'), toMenu);
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); startGame(); } });
  nameInput.addEventListener('change', () => lsSet(LS_NAME, cleanName(nameInput.value)));

  window.addEventListener('keydown', (e) => {
    if (e.target === nameInput) return;
    const c = e.code;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(c)) e.preventDefault();
    if (e.repeat) { input.keys.add(c); return; }
    input.keys.add(c);
    const st = G.state;
    if (c === 'KeyP' || c === 'Enter' || c === 'NumpadEnter' || c === 'Space') {
      if (st === 'play' || st === 'pause') togglePause();
      else if (st === 'menu' && c !== 'Space') startGame();
      else if ((st === 'over' || st === 'win') && !endEl.classList.contains('hidden')) toMenu();
    } else if (c === 'KeyR' && st !== 'menu') {
      startGame();
    } else if (c === 'Escape') {
      if (st === 'play') setState('pause');
      else if (st !== 'menu') toMenu();
    }
  });
  window.addEventListener('keyup', (e) => input.keys.delete(e.code));
  window.addEventListener('blur', () => { input.keys.clear(); releaseSticks(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && G.state === 'play') setState('pause'); // pausa sola si cambian de app
  });

  // ---------------------------------------------------------------------------
  // Loop principal (requestAnimationFrame, ~60 fps)
  // ---------------------------------------------------------------------------
  let last = performance.now(), fpsAcc = 0, fpsFrames = 0, avgDt = 1 / 60, slowTime = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (!(dt > 0)) return;
    fpsAcc += dt; fpsFrames++;
    if (fpsAcc >= 0.5) { G.fps = fpsFrames / fpsAcc; fpsAcc = 0; fpsFrames = 0; }
    // calidad adaptativa: si el iPad no llega a ~50 fps, baja la resolución interna
    if (G.state === 'play' && dt < 0.25) {
      avgDt += (dt - avgDt) * 0.05;
      slowTime = avgDt > 1 / 52 ? slowTime + dt : Math.max(0, slowTime - dt);
      if (slowTime > 2 && view.dprCap > 1) { view.dprCap = 1; resize(); slowTime = 0; }
    }
    dt = Math.min(dt, 1 / 30);
    G.stats.frames++;

    bg.update(dt);
    if (G.state === 'play') {
      updatePlay(dt, readInput());
      updateFx(dt);
      G.stats.playFrames++;
    } else if (G.state === 'over' || G.state === 'win') {
      updateFx(dt);
      if (G.endTimer > 0) { G.endTimer -= dt; if (G.endTimer <= 0) showEnd(); }
    }
    G.stats.maxParticles = Math.max(G.stats.maxParticles, G.particles.parts.length);
    G.stats.maxEnemyBullets = Math.max(G.stats.maxEnemyBullets, G.ebullets.length);
    render();
  }
  setState('menu');
  requestAnimationFrame(frame);

  // Ganchos para pruebas automáticas / consola (no afectan el juego normal)
  window.NeonDodge = {
    G, view, startGame, startBoss, toMenu, togglePause,
    setGod(v) { G.god = !!v; },
    get state() { return G.state; },
  };
})();
