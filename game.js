/*
 * Neon Dodge v4 (versión web: un jugador + cooperativo online de 2 a 4)
 * v4: 3 armas (pistola, ametralladora, RPG), 5 vidas, menos enemigos, habilidades nuevas de los jefes y 3 mapas.
 * Los números siguen /workspace/v4/SPEC-neon-dodge-v4.md (iguales a la versión de compu).
 * Port de juego/neon_dodge.py para jugar en el navegador (Safari del iPad incluido).
 * Todo se dibuja en <canvas>, sin imágenes ni fuentes externas. El modo solo anda sin internet.
 * Multijugador: WebRTC peer-to-peer con PeerJS (peerjs.min.js, incluido en el repo). El navegador del
 * host simula todo; los demás mandan sus controles y reciben "fotos" del estado ~20 veces por segundo.
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

  const MAX_PARTICLES = 700, MAX_ENEMIES = 24, MAX_ENEMY_BULLETS = 260; // v3: MAX_ENEMIES = 40
  const KILL_POINTS = { orb: 2, spinner: 3, hunter: 5 };
  const ENEMY_HP = { orb: 1, spinner: 2, hunter: 3 };
  const ENEMY_RADIUS = { orb: 12, spinner: 14, hunter: 16 };
  const ENEMY_COLOR = { orb: MAGENTA, spinner: YELLOW, hunter: RED };
  const BOSS_SCORES = [80, 220, 400];
  const SCORE_POWERUP = 10;
  const FIRE_COOLDOWN = 0.12, FIRE_COOLDOWN_RAPID = 0.065, BULLET_SPEED = 640;
  const WAVE_INTERVAL = 4.5;
  // v4 "menos pelotitas": -40% enemigos por oleada y -40% de tasa de aparición (intervalo / 0,6)
  const ENEMY_COUNT_MULT = 0.6, SPAWN_RATE_MULT = 0.6;

  // ---- Armas (spec §1) ----
  // cd = segundos entre tiros; cdRapid = con el powerup naranja. Cada arma tiene su propia recarga que sigue
  // corriendo aunque cambies de arma (spec §8, 1.23) y hay una recarga global mínima igual a la del arma más rápida
  // (para que alternar armas no dispare más rápido, checklist 1.8).
  const WEAPONS = [
    { key: 'pistola', cd: 0.12, cdRapid: 0.065, dmg: 1, speed: 640, r: 5, spread: 1.5, life: 1.1 },
    // números finales (spec §8, 13:40): ametralladora 0,8 por bala (80% de la pistola); el disparo rápido solo
    // acelera la pistola; RPG a 330 px/s
    { key: 'ametralladora', cd: 1 / 12, cdRapid: 1 / 12, dmg: 0.8, speed: 640, r: 3, spread: 6, life: 1.0 },
    { key: 'rpg', cd: 1.2, cdRapid: 1.2, dmg: 6, speed: 330, r: 7, spread: 0, life: 3.5 },
  ];
  const RPG_RADIUS = 90, RPG_SPLASH = 3; // explosión: 3 de daño a todo lo que esté a <= 90 px (al jefe: una vez)
  // tope global: 12 tiros/s cambiando de arma; con el disparo rápido, el de la pistola rápida (0,065 s)
  const GLOBAL_CD = 1 / 12, GLOBAL_CD_RAPID = 0.065;

  // ---- Vidas (spec §3) ----
  const START_LIVES = 5, MAX_LIVES = 5, RESPAWN_SHORT = 2, RESPAWN_INVULN = 2;
  const POWERUP_COLORS = { heal: LIME, magnet: CYAN, score: YELLOW, rapid: ORANGE };
  const FONT = 'ui-monospace, Menlo, Consolas, "Courier New", monospace';
  const LS_NAME = 'neonDodge.nombre', LS_BEST = 'neonDodge.record', LS_MAP = 'neonDodge.mapa';

  // ---- Textos (de /workspace/v4/textos.md, de Juan) ----
  const TXT = {
    arma: ['Pistola', 'Ametralladora', 'RPG'],
    armaDesc: ['La de siempre. Precisa y confiable.', 'Muchas balas rápidas. ¡Barré todo!', 'Cohete lento que explota en área.'],
    armaHud: 'Arma: {arma}', armaCambio: '¡{arma}!', recargando: 'Recargando…', armaBoton: 'ARMA',
    mapaTitulo: 'Elegí el mapa', mapaLoEligeHost: 'El mapa lo elige el que creó la partida', mapaElegido: 'Mapa: {mapa}',
    mapa: ['Arena Neón', 'Pilares', 'Portales'],
    mapaDesc: ['La arena de siempre, abierta.', 'Escondete detrás de los pilares.', 'Entrá por uno, salí por el otro.'],
    wardenAnillo: '¡ANILLO! Buscá el hueco', wardenMinas: '¡MINAS! Rompelas a tiros',
    seekerTeleport: '¡TELETRANSPORTE!', seekerMisiles: '¡MISILES! Derribalos',
    titanLaser: '¡LÁSER! Salí de la línea', titanGolpe: '¡GOLPE! Saltá las ondas', titanFase2: '¡TITAN SE ENOJÓ!',
    vidasQuedan: 'Te quedan {n} vidas', vidasUltima: '¡Última vida! Cuidala', reaparece: 'Reapareciendo…',
    fueraCoop: 'Estás fuera: esperá que te revivan', revivido: '¡Te revivieron! Tenés 1 vida',
    otroFuera: '{nombre} está fuera', otroRevivido: '¡{nombre} volvió!',
    goSolo: 'Sin vidas. ¡Game over!', goCoop: 'Están todos fuera. ¡Game over!',
    version: 'Versión distinta: bajá la última del link',
    tips: ['Cambiá de arma con 1, 2, 3, la rueda del mouse o Q.',
      'El RPG explota en área: ideal contra muchos enemigos juntos.',
      'Tenés 5 vidas. Si perdés todas, tus amigos te pueden revivir.',
      'Antes de cada ataque, el jefe avisa. ¡Mirá la pantalla!',
      'En Pilares, los pilares frenan las balas. Usalos de escudo.'],
  };
  const fmt = (t, o) => t.replace(/\{(\w+)\}/g, (m, k) => (o[k] !== undefined ? o[k] : m));
  const PLAYER_COLORS = [CYAN, LIME, ORANGE, PINK];
  const MAX_PLAYERS = 4, RESPAWN_TIME = 12;

  // Estado de red. NET.rec = el host está grabando eventos visuales para mandarlos a los demás.
  const NET = { mode: 'solo', rec: false, ev: [], myId: 0 };
  const r0 = Math.round, r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;
  const ci = (c) => (c[0] << 16) | (c[1] << 8) | c[2]; // color -> entero (para la red)
  const colCache = new Map();
  for (const c of [CYAN, MAGENTA, PINK, YELLOW, ORANGE, LIME, WHITE, DIM, RED]) colCache.set(ci(c), c);
  function cd(n) { // entero -> color (mismo array para el mismo color)
    let c = colCache.get(n);
    if (!c) { c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; colCache.set(n, c); }
    return c;
  }

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
      if (NET.rec) NET.ev.push(['b', r0(x), r0(y), ci(c), n, speed, size, r2(life), gravity]);
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU), sp = rand(speed * 0.25, speed), l = rand(life * 0.5, life);
        this.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: l, max: l, c,
          size: rand(size * 0.5, size), g: rand(0, gravity), drag: 1.5 });
      }
      this.cap();
    }
    spray(x, y, dx, dy, c, n = 4, spread = 0.5, speed = 160, size = 3, life = 0.25) {
      const base = Math.atan2(dy, dx);
      if (NET.rec) NET.ev.push(['s', r0(x), r0(y), r2(base), ci(c), n, spread, speed, size, r2(life)]);
      for (let i = 0; i < n; i++) {
        const a = base + rand(-spread, spread), sp = rand(speed * 0.4, speed), l = rand(life * 0.5, life);
        this.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: l, max: l, c, size, g: 0, drag: 3 });
      }
      this.cap();
    }
    trail(x, y, c, size = 3, life = 0.25, local = false) {
      if (NET.rec && !local) NET.ev.push(['t', r0(x), r0(y), ci(c), size, r2(life)]);
      this.parts.push({ x: x + rand(-3, 3), y: y + rand(-3, 3), vx: rand(-20, 20), vy: rand(-20, 20),
        life, max: life, c, size, g: 0, drag: 0 });
      this.cap();
    }
    ring(x, y, c, radius, life = 0.6, width = 4) {
      if (NET.rec) NET.ev.push(['r', r0(x), r0(y), ci(c), r0(radius), r2(life), width]);
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
  // Mapas (spec §5). Formato interno; si está /workspace/v4/mapas.json, los números salen de ahí.
  // Obstáculos: { t: 'rect', x, y, w, h } o { t: 'circle', x, y, r }. Portales: pares a <-> b.
  // ---------------------------------------------------------------------------
  // Copia textual de /workspace/v4/mapas.json (de Viernes), embebida porque fetch() no anda con file://.
  const MAPAS_JSON = {"version":1,"convenciones":{"arena_px_referencia":{"web":[960,640],"compu":[960,640]},"origen":"esquina superior izquierda de la arena; x crece a la derecha, y crece hacia abajo","x_y":"normalizados 0..1: x_px = x * ancho_arena, y_px = y * alto_arena","rect":"x, y = esquina superior izquierda; w, h normalizados: w_px = w * ancho, h_px = h * alto","circulo":"x, y = centro; r normalizado a min(ancho, alto): r_px = r * min(ancho, alto) (con 960x640, r_px = r * 640). Así los círculos quedan redondos","radios":"TODOS los radios (círculos, portales, centro_libre, zonas circulares) usan r_px = r * min(ancho, alto)","salida_portal":"vector unitario (en píxeles) desde el centro del portal hacia el centro de la arena; el jugador sale en centro + salida * (r_portal_px + r_jugador + 6)","colores":"hex #RRGGBB","spawns_jugadores":"4 puntos, índice = orden de entrada del jugador (0 = host/solo)","zonas_prohibidas_enemigos":"formas (rect/circulo) donde no puede aparecer un enemigo, minas, ni el destino del teletransporte del SEEKER; los obstáculos SIEMPRE cuentan como prohibidos aunque no estén listados"},"centro_libre":{"x":0.5,"y":0.5,"r":0.18},"entrada_jefes":{"tipo":"rect","x":0.4167,"y":0.0,"w":0.1667,"h":0.375,"nota":"los jefes entran desde arriba al centro (x=480, y hasta 130-170 px); se deja libre de obstáculos y portales"},"mapas":[{"id":"arena_neon","nombre":"Arena Neón","paleta":{"fondo":"#080A18","grilla":"#002A38","grilla_horizontal":"#2E0A28","principal":"#00F0FF","acento":"#FF28B4"},"obstaculos":[],"portales":[],"spawns_jugadores":[{"x":0.4635,"y":0.75},{"x":0.5365,"y":0.75},{"x":0.3906,"y":0.75},{"x":0.6094,"y":0.75}],"zonas_prohibidas_enemigos":[{"tipo":"rect","x":0.3125,"y":0.6562,"w":0.375,"h":0.2344,"motivo":"spawns de jugadores"}]},{"id":"pilares","nombre":"Pilares","paleta":{"fondo":"#0D0618","grilla":"#2A1248","principal":"#A66BFF","acento":"#F0E0FF"},"obstaculos":[{"tipo":"circulo","x":0.2,"y":0.27,"r":0.07},{"tipo":"circulo","x":0.8,"y":0.27,"r":0.07},{"tipo":"circulo","x":0.2,"y":0.74,"r":0.07},{"tipo":"circulo","x":0.8,"y":0.74,"r":0.07},{"tipo":"rect","x":0.3125,"y":0.4219,"w":0.0417,"h":0.1562},{"tipo":"rect","x":0.6458,"y":0.4219,"w":0.0417,"h":0.1562}],"portales":[],"spawns_jugadores":[{"x":0.4635,"y":0.75},{"x":0.5365,"y":0.75},{"x":0.3906,"y":0.75},{"x":0.6094,"y":0.75}],"zonas_prohibidas_enemigos":[{"tipo":"rect","x":0.3125,"y":0.6562,"w":0.375,"h":0.2344,"motivo":"spawns de jugadores"},{"tipo":"circulo","x":0.2,"y":0.27,"r":0.1,"motivo":"pilar + margen"},{"tipo":"circulo","x":0.8,"y":0.27,"r":0.1,"motivo":"pilar + margen"},{"tipo":"circulo","x":0.2,"y":0.74,"r":0.1,"motivo":"pilar + margen"},{"tipo":"circulo","x":0.8,"y":0.74,"r":0.1,"motivo":"pilar + margen"},{"tipo":"rect","x":0.2925,"y":0.3919,"w":0.0817,"h":0.2162,"motivo":"pilar + margen"},{"tipo":"rect","x":0.6258,"y":0.3919,"w":0.0817,"h":0.2162,"motivo":"pilar + margen"}]},{"id":"portales","nombre":"Portales","paleta":{"fondo":"#03121A","grilla":"#0B3A44","principal":"#FFB02E","acento":"#B04DFF"},"obstaculos":[],"portales":[{"id":"A","nombre":"Ámbar","color":"#FFB02E","cooldown_s":1.0,"extremos":[{"x":0.13,"y":0.25,"r":0.05,"salida":{"dx":0.9118,"dy":0.4107}},{"x":0.87,"y":0.75,"r":0.05,"salida":{"dx":-0.9118,"dy":-0.4107}}]},{"id":"B","nombre":"Violeta","color":"#B04DFF","cooldown_s":1.0,"extremos":[{"x":0.87,"y":0.25,"r":0.05,"salida":{"dx":-0.9118,"dy":0.4107}},{"x":0.13,"y":0.75,"r":0.05,"salida":{"dx":0.9118,"dy":-0.4107}}]}],"spawns_jugadores":[{"x":0.4635,"y":0.75},{"x":0.5365,"y":0.75},{"x":0.3906,"y":0.75},{"x":0.6094,"y":0.75}],"zonas_prohibidas_enemigos":[{"tipo":"rect","x":0.3125,"y":0.6562,"w":0.375,"h":0.2344,"motivo":"spawns de jugadores"},{"tipo":"circulo","x":0.13,"y":0.25,"r":0.11,"motivo":"portal A"},{"tipo":"circulo","x":0.87,"y":0.75,"r":0.11,"motivo":"portal A"},{"tipo":"circulo","x":0.87,"y":0.25,"r":0.11,"motivo":"portal B"},{"tipo":"circulo","x":0.13,"y":0.75,"r":0.11,"motivo":"portal B"}]}]};
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const MIN_WH = Math.min(W, H);
  function toShape(o) { // desnormaliza (rect: esquina sup. izq.; círculo: centro y r * min(W, H))
    return o.tipo === 'rect' ? { t: 'rect', x: o.x * W, y: o.y * H, w: o.w * W, h: o.h * H }
      : { t: 'circle', x: o.x * W, y: o.y * H, r: o.r * MIN_WH };
  }
  const MAPS = MAPAS_JSON.mapas.map((m) => {
    const pal = m.paleta, principal = hex(pal.principal);
    const portals = [];
    for (const pp of m.portales || []) {
      const [e1, e2] = pp.extremos;
      const end = (e) => ({ x: e.x * W, y: e.y * H, r: e.r * MIN_WH, dx: e.salida.dx, dy: e.salida.dy });
      portals.push({ c: hex(pp.color), cooldown: pp.cooldown_s, ends: [end(e1), end(e2)] });
    }
    return {
      id: m.id, nombre: m.nombre,
      bg: hex(pal.fondo), gridV: hex(pal.grilla), gridH: hex(pal.grilla_horizontal || pal.grilla),
      principal, acento: hex(pal.acento),
      star: m.id === 'arena_neon' ? [110, 150, 255] : principal, // Arena Neón: igual que la v3
      obsFill: principal.map((v) => Math.round(v * 0.22)), obsStroke: principal, obsGlow: hex(pal.acento),
      obstacles: (m.obstaculos || []).map(toShape),
      zones: (m.zonas_prohibidas_enemigos || []).map(toShape),
      portals,
      spawns: m.spawns_jugadores.map((q) => [q.x * W, q.y * H]),
    };
  });
  let MAP = MAPS[0];
  function obstacleHit(x, y, pad) { // ¿el punto (con margen pad) toca algún obstáculo?
    for (const o of MAP.obstacles) {
      if (o.t === 'rect') {
        if (x > o.x - pad && x < o.x + o.w + pad && y > o.y - pad && y < o.y + o.h + pad) {
          // esquinas redondeadas: distancia real al rectángulo
          const cx = clamp(x, o.x, o.x + o.w), cy = clamp(y, o.y, o.y + o.h);
          if ((x - cx) ** 2 + (y - cy) ** 2 < pad * pad || (cx === x && cy === y)) return o;
        }
      } else if ((x - o.x) ** 2 + (y - o.y) ** 2 < (o.r + pad) ** 2) return o;
    }
    return null;
  }
  // empuja un círculo (q.x, q.y, radio r) fuera de los obstáculos; devuelve la normal del último choque o null
  function pushOut(q, r) {
    let n = null;
    for (const o of MAP.obstacles) {
      if (o.t === 'rect') {
        const cx = clamp(q.x, o.x, o.x + o.w), cy = clamp(q.y, o.y, o.y + o.h);
        let dx = q.x - cx, dy = q.y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2);
          dx /= d; dy /= d;
          q.x = cx + dx * r; q.y = cy + dy * r;
        } else { // el centro quedó adentro: sale por el lado más cercano
          const l = q.x - o.x, rr = o.x + o.w - q.x, t = q.y - o.y, b = o.y + o.h - q.y;
          const m = Math.min(l, rr, t, b);
          if (m === l) { dx = -1; dy = 0; q.x = o.x - r; }
          else if (m === rr) { dx = 1; dy = 0; q.x = o.x + o.w + r; }
          else if (m === t) { dx = 0; dy = -1; q.y = o.y - r; }
          else { dx = 0; dy = 1; q.y = o.y + o.h + r; }
        }
        n = [dx, dy];
      } else {
        let dx = q.x - o.x, dy = q.y - o.y;
        const d = Math.hypot(dx, dy), rr = o.r + r;
        if (d >= rr) continue;
        if (d > 1e-6) { dx /= d; dy /= d; } else { dx = 0; dy = -1; }
        q.x = o.x + dx * rr; q.y = o.y + dy * rr;
        n = [dx, dy];
      }
    }
    return n;
  }
  function nearPortal(x, y, pad) {
    for (const pp of MAP.portals) for (const e of pp.ends) if ((x - e.x) ** 2 + (y - e.y) ** 2 < (e.r + pad) ** 2) return true;
    return false;
  }
  function inShape(o, x, y, pad) {
    if (o.t === 'rect') return x > o.x - pad && x < o.x + o.w + pad && y > o.y - pad && y < o.y + o.h + pad;
    return (x - o.x) ** 2 + (y - o.y) ** 2 < (o.r + pad) ** 2;
  }
  // zonas donde no puede aparecer un enemigo, mina, power-up ni el destino del teletransporte (los obstáculos siempre cuentan)
  function forbidden(x, y, pad) {
    if (obstacleHit(x, y, pad)) return true;
    for (const z of MAP.zones) if (inShape(z, x, y, pad)) return true;
    return false;
  }
  // pone el mapa por id (si no existe, Arena Neón). save = guardarlo como preferencia (localStorage)
  function useMap(id, save) {
    const i = MAPS.findIndex((m) => m.id === id);
    MAP = MAPS[i >= 0 ? i : 0];
    if (typeof G !== 'undefined') G.mapIdx = MAPS.indexOf(MAP);
    if (save) lsSet(LS_MAP, MAP.id);
  }
  const prefMap = () => lsGet(LS_MAP, 'arena_neon');

  function drawMapGeometry() {
    if (MAP.obstacles.length) {
      const fill = rgb(MAP.obsFill), stroke = MAP.obsStroke;
      additive(() => { for (const o of MAP.obstacles) glow(o.t === 'rect' ? o.x + o.w / 2 : o.x, o.t === 'rect' ? o.y + o.h / 2 : o.y, (o.t === 'rect' ? Math.max(o.w, o.h) : o.r * 2) * 1.1, MAP.obsGlow, 0.3); });
      for (const o of MAP.obstacles) {
        ctx.beginPath();
        if (o.t === 'rect') ctx.rect(o.x, o.y, o.w, o.h); else ctx.arc(o.x, o.y, o.r, 0, TAU);
        ctx.fillStyle = fill; ctx.fill();
        ctx.shadowColor = rgb(stroke); ctx.shadowBlur = 12;
        ctx.strokeStyle = rgb(stroke); ctx.lineWidth = 3; ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }
    for (const pp of MAP.portals) {
      for (const e of pp.ends) {
        const t = bg.pulse;
        additive(() => glow(e.x, e.y, e.r * 2.6, pp.c, 0.55 + 0.2 * Math.sin(t * 4)));
        ctx.fillStyle = rgb(pp.c, 0.18); circle(e.x, e.y, e.r); ctx.fill();
        ctx.strokeStyle = rgb(pp.c); ctx.lineWidth = 3; ctx.stroke();
        ctx.strokeStyle = rgb(WHITE, 0.7); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 0.6, t * 3, t * 3 + 4); ctx.stroke();
        // flechita de salida (hacia el centro)
        ctx.strokeStyle = rgb(pp.c, 0.8);
        ctx.beginPath(); ctx.moveTo(e.x + e.dx * (e.r + 6), e.y + e.dy * (e.r + 6)); ctx.lineTo(e.x + e.dx * (e.r + 18), e.y + e.dy * (e.r + 18)); ctx.stroke();
      }
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
      ctx.fillStyle = rgb(MAP.bg);
      ctx.fillRect(-40, -40, W + 80, H + 80);
      for (const [x, y] of far) {
        const a = Math.floor(70 + 40 * Math.sin(st.pulse * 2 + x));
        ctx.fillStyle = `rgb(${a},${a},${Math.min(255, a + 50)})`;
        ctx.fillRect(x, y, 1.6, 1.6);
      }
      const ox = st.off % STEP, oy = (st.off * 0.6) % STEP;
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgb(MAP.gridV);
      ctx.beginPath();
      for (let x = ox - STEP; x <= W + STEP; x += STEP) { ctx.moveTo(x, -40); ctx.lineTo(x, H + 40); }
      ctx.stroke();
      ctx.strokeStyle = rgb(MAP.gridH);
      ctx.beginPath();
      for (let y = oy - STEP; y <= H + STEP; y += STEP) { ctx.moveTo(-40, y); ctx.lineTo(W + 40, y); }
      ctx.stroke();
      additive(() => {
        for (const [x, y, s] of near) {
          glow(x, y, (5 + s * 2) * 1.6, MAP.star, 0.3 + 0.4 * Math.abs(Math.sin(st.pulse * 2.5 + y)));
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

  function drawMine(m) {
    const blink = 0.5 + 0.5 * Math.sin(bg.pulse * 12 + m.id);
    additive(() => glow(m.x, m.y, MINE_R * 3, RED, 0.5 + 0.4 * blink));
    const pts = [];
    for (let i = 0; i < 16; i++) {
      const a = bg.pulse * 2 + i * TAU / 16, rr = i % 2 === 0 ? MINE_R + 4 : MINE_R - 2;
      pts.push([m.x + Math.cos(a) * rr, m.y + Math.sin(a) * rr]);
    }
    poly(pts);
    ctx.fillStyle = m.flash > 0 ? rgb(WHITE) : 'rgb(80,0,20)'; ctx.fill();
    ctx.strokeStyle = rgb(RED); ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = rgb(blink > 0.5 ? WHITE : ORANGE); circle(m.x, m.y, 4); ctx.fill();
  }
  function drawMissile(m) {
    const c = Math.cos(m.ang), s = Math.sin(m.ang), r = MISSILE_R;
    additive(() => glow(m.x, m.y, 28, ORANGE, 0.7));
    poly([[m.x + c * r * 1.6, m.y + s * r * 1.6], [m.x - c * r - s * r * 0.8, m.y - s * r + c * r * 0.8],
      [m.x - c * r * 0.5, m.y - s * r * 0.5], [m.x - c * r + s * r * 0.8, m.y - s * r - c * r * 0.8]]);
    ctx.fillStyle = rgb(m.flash > 0 ? WHITE : ORANGE); ctx.fill();
    ctx.strokeStyle = rgb(YELLOW); ctx.lineWidth = 1.5; ctx.stroke();
  }

  // ---------------------------------------------------------------------------
  // Jefes. Ataques de la v3 con ~30% menos balas (spec §2) + habilidades nuevas con aviso (spec §4).
  // Habilidad activa: this.ab = { k, t, a, b, c } (k = código, t = segundos de aviso que faltan).
  // ---------------------------------------------------------------------------
  const AB = { W_RING: 1, W_MINES: 2, S_TELE: 3, S_MISS: 4, T_LASER_WARN: 5, T_LASER: 6, T_SLAM: 7 };
  const WARN = { 1: 0.8, 2: 0.8, 3: 0.8, 4: 0.8, 5: 0.8, 7: 0.8 }; // aviso de 0,8 s para todas (spec §8)
  // números de las habilidades (iguales en web y compu)
  const RING_SLOTS = 18, RING_GAP = 4, RING_SPEED = 150;              // anillo: 14 balas, hueco de 100°
  const MINE_MAX = 4, MINE_ORBIT = 110, MINE_SPIN = 1.4, MINE_R = 12, MINE_HP = 3, MINE_PTS = 3;
  const TELE_DIST = 190, TELE_MIN = 150, TELE_HOLD = 1.2; // a 190 px de un jugador y a >= 150 px de todos
  const MISSILE_SPEED = 150, MISSILE_TURN = 2.0, MISSILE_HOMING = 4, MISSILE_LIFE = 8, MISSILE_HP = 2, MISSILE_R = 9, MISSILE_PTS = 2;
  const LASER_SWEEP = 1.75, LASER_TIME = 1.6, LASER_HALF = 13;       // barre ~100° en 1,6 s; rayo de 26 px
  const WAVE_SPEED = 240, WAVE_HALF = 8, WAVE_GAPS = 3, WAVE_GAP_W = 40 * Math.PI / 180;

  class Boss {
    constructor(def) {
      Object.assign(this, def);
      this.x = W / 2; this.y = -90;
      this.hp = this.maxHp;
      this.state = 'enter';
      this.t = 0; this.flash = 0; this.angle = 0; this.index = 0;
      this.phase2Announced = false;
      this.ab = null; this.waves = [];
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
      const prevAb = this.ab;
      this.fight(dt, g);
      // el aviso que empieza en este cuadro no se descuenta todavía: dura exactamente WARN (0,8 s = 48 cuadros)
      if (this.ab && this.ab === prevAb && this.ab.k !== AB.T_LASER) {
        this.ab.t -= dt;
        if (this.ab.t <= 1e-9) { const ab = this.ab; this.ab = null; logAbility(this.name + ':ya' + ab.k); this.execute(ab, g); }
      }
    }
    startAb(k, banner, a = 0, b = 0, c = 0) {
      this.ab = { k, t: WARN[k] || 0, a, b, c };
      logAbility(this.name + ':aviso' + k);
      if (banner) G.showBanner(banner, this.color, Math.max(1.2, WARN[k] + 0.4));
    }
    damage(n) {
      if (!this.vulnerable) return false;
      this.hp -= n;
      this.flash = 0.06;
      return this.hp <= 0.001;
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
    // avisos y efectos de las habilidades (lo usan el host y los clientes, sale de this.ab / this.waves)
    drawAbilities() {
      const ab = this.ab, blink = 0.55 + 0.45 * Math.sin(bg.pulse * 18);
      for (const w of this.waves) { // ondas del TITAN (con 3 huecos)
        ctx.strokeStyle = rgb(ORANGE, 0.95); ctx.lineWidth = WAVE_HALF * 2;
        ctx.shadowColor = rgb(RED); ctx.shadowBlur = 14;
        for (let i = 0; i < WAVE_GAPS; i++) {
          const g0 = w.rot + i * TAU / WAVE_GAPS + WAVE_GAP_W / 2, g1 = w.rot + (i + 1) * TAU / WAVE_GAPS - WAVE_GAP_W / 2;
          ctx.beginPath(); ctx.arc(this.x, this.y, Math.max(1, w.r), g0, g1); ctx.stroke();
        }
        ctx.shadowBlur = 0;
      }
      if (!ab) return;
      ctx.lineCap = 'round';
      if (ab.k === AB.W_RING) { // anillo con hueco: se marca el hueco en verde
        const r = this.r + 40 + (1 - ab.t / WARN[1]) * 30;
        const half = (RING_GAP + 1) * Math.PI / RING_SLOTS;
        ctx.strokeStyle = rgb(this.color, 0.4 + 0.5 * blink); ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(this.x, this.y, r, ab.a + half, ab.a - half + TAU); ctx.stroke();
        ctx.strokeStyle = rgb(LIME, 0.9); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(this.x, this.y, r + 14, ab.a - half, ab.a + half); ctx.stroke();
      } else if (ab.k === AB.W_MINES) {
        for (let i = 0; i < MINE_MAX; i++) {
          if (!(ab.b & (1 << i))) continue;
          const a = ab.a + (WARN[2] - ab.t) * MINE_SPIN + i * Math.PI / 2;
          const x = this.x + Math.cos(a) * MINE_ORBIT, y = this.y + Math.sin(a) * MINE_ORBIT;
          ctx.strokeStyle = rgb(RED, blink); ctx.lineWidth = 2;
          circle(x, y, MINE_R + 6 * blink); ctx.stroke();
        }
      } else if (ab.k === AB.S_TELE) { // marca del destino del teletransporte
        ctx.strokeStyle = rgb(YELLOW, 0.5 + 0.5 * blink); ctx.lineWidth = 3;
        circle(ab.a, ab.b, this.r + 4); ctx.stroke();
        ctx.beginPath();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(ab.a + dx * (this.r - 14), ab.b + dy * (this.r - 14)); ctx.lineTo(ab.a + dx * (this.r + 16), ab.b + dy * (this.r + 16)); }
        ctx.stroke();
        ctx.setLineDash([6, 10]); ctx.strokeStyle = rgb(YELLOW, 0.35); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(ab.a, ab.b); ctx.stroke(); ctx.setLineDash([]);
      } else if (ab.k === AB.S_MISS) {
        additive(() => glow(this.x, this.y + this.r, 40, ORANGE, blink));
      } else if (ab.k === AB.T_LASER_WARN) { // línea fina de aviso (no hace daño)
        ctx.strokeStyle = rgb(RED, 0.5 + 0.5 * blink); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.x + Math.cos(ab.a) * 1400, this.y + Math.sin(ab.a) * 1400); ctx.stroke();
        ctx.strokeStyle = rgb(RED, 0.25); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.r + 30, ab.b > 0 ? ab.a : ab.a - LASER_SWEEP, ab.b > 0 ? ab.a + LASER_SWEEP : ab.a); ctx.stroke();
      } else if (ab.k === AB.T_LASER) { // rayo grueso que barre
        const a = ab.a + ab.b * LASER_SWEEP * clamp(ab.c / LASER_TIME, 0, 1);
        const ex = this.x + Math.cos(a) * 1400, ey = this.y + Math.sin(a) * 1400;
        additive(() => {
          ctx.globalAlpha = 0.5; ctx.strokeStyle = rgb(RED); ctx.lineWidth = LASER_HALF * 4;
          ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(ex, ey); ctx.stroke();
          ctx.globalAlpha = 1;
        });
        ctx.strokeStyle = rgb(ORANGE); ctx.lineWidth = LASER_HALF * 2;
        ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.strokeStyle = rgb(WHITE); ctx.lineWidth = LASER_HALF * 0.7;
        ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(ex, ey); ctx.stroke();
      } else if (ab.k === AB.T_SLAM) { // golpe al suelo: círculo que crece y dónde van a estar los huecos
        const k = 1 - ab.t / WARN[7];
        ctx.fillStyle = rgb(RED, 0.18 + 0.2 * blink); circle(this.x, this.y, this.r + 80 * k); ctx.fill();
        ctx.strokeStyle = rgb(LIME, 0.8); ctx.lineWidth = 3;
        for (let i = 0; i < WAVE_GAPS; i++) {
          const a = ab.a + i * TAU / WAVE_GAPS;
          ctx.beginPath(); ctx.moveTo(this.x + Math.cos(a) * (this.r + 20), this.y + Math.sin(a) * (this.r + 20));
          ctx.lineTo(this.x + Math.cos(a) * (this.r + 120), this.y + Math.sin(a) * (this.r + 120)); ctx.stroke();
        }
      }
      ctx.lineCap = 'butt';
    }
  }

  // jugador vivo al azar (para habilidades que eligen un objetivo)
  function randomAlive() {
    const a = G.players.filter((p) => p.hp > 0);
    return a.length ? choice(a) : null;
  }

  class Warden extends Boss {
    constructor() {
      super({ name: 'WARDEN', color: MAGENTA, maxHp: 70, r: 42, bonus: 50, enterY: 160 });
      this.burstCd = 1.2; this.spiralCd = 0; this.spiralAng = 0; this.burstOff = 0;
      this.ringCd = 4; this.mineCd = 8;
    }
    fight(dt, g) {
      const p2 = this.phase === 2;
      this.angle += dt * (p2 ? 1.4 : 0.6);
      this.x = W / 2 + Math.sin(this.t * 0.5) * 260;
      this.y = this.enterY + Math.sin(this.t * 0.9) * 60;
      if (!this.ab) {
        this.ringCd -= dt; this.mineCd -= dt;
        if (this.ringCd <= 0) {
          const tg = randomAlive();
          const base = tg ? Math.atan2(tg.y - this.y, tg.x - this.x) : rand(0, TAU);
          this.startAb(AB.W_RING, TXT.wardenAnillo, base + rand(-0.7, 0.7));
          this.ringCd = p2 ? 6 : 8;
        } else if (this.mineCd <= 0) {
          let mask = 0;
          for (let i = 0; i < MINE_MAX; i++) if (!G.mines.some((m) => m.slot === i)) mask |= 1 << i;
          if (mask) this.startAb(AB.W_MINES, TXT.wardenMinas, G.mineOrbit, mask);
          this.mineCd = p2 ? 9 : 12;
        }
        this.burstCd -= dt; // anillo común: v3 14/18 balas -> v4 10/13
        if (this.burstCd <= 0) {
          const n = p2 ? 13 : 10;
          this.ringShot(g, n, p2 ? 200 : 170, this.burstOff);
          this.burstOff += Math.PI / n;
          this.burstCd = p2 ? 2.6 : 1.9;
          g.particles.ring(this.x, this.y, this.color, 70, 0.4, 3);
        }
      }
      if (p2) { // espiral: v3 cada 0,11 s -> v4 cada 0,157 s (-30%)
        this.spiralCd -= dt;
        while (this.spiralCd <= 0) {
          this.spiralCd += 0.11 / 0.7;
          this.spiralAng += 0.37;
          for (const k of [0, Math.PI]) {
            const a = this.spiralAng + k;
            g.enemyShot(this.x, this.y, Math.cos(a) * 160, Math.sin(a) * 160, PINK, 5);
          }
        }
      }
    }
    execute(ab, g) {
      if (ab.k === AB.W_RING) { // 18 lugares, faltan 4 seguidos centrados en ab.a
        const step = TAU / RING_SLOTS;
        for (let i = 0; i < RING_SLOTS; i++) {
          let d = Math.abs(((i * step - ab.a) % TAU + TAU + Math.PI) % TAU - Math.PI);
          if (d < (RING_GAP / 2) * step) continue;
          const a = i * step;
          g.enemyShot(this.x, this.y, Math.cos(a) * RING_SPEED, Math.sin(a) * RING_SPEED, PINK, 7);
        }
        g.particles.ring(this.x, this.y, PINK, 90, 0.5, 3);
      } else if (ab.k === AB.W_MINES) {
        G.mineOrbit = ab.a + WARN[2] * MINE_SPIN;
        for (let i = 0; i < MINE_MAX; i++) {
          if (!(ab.b & (1 << i)) || G.mines.some((m) => m.slot === i) || G.mines.length >= MINE_MAX) continue;
          const a = G.mineOrbit + i * Math.PI / 2;
          const x = this.x + Math.cos(a) * MINE_ORBIT, y = this.y + Math.sin(a) * MINE_ORBIT;
          if (forbidden(x, y, MINE_R)) continue; // no aparece adentro de un pilar/zona prohibida
          G.mines.push({ id: ++G.nid, slot: i, x, y, hp: MINE_HP, flash: 0 });
          g.particles.ring(x, y, RED, 30, 0.4, 2);
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
      this.teleCd = 5; this.missCd = 9; this.hold = 0;
    }
    teleDest() { // cerca de un jugador vivo, nunca en pilar/zona/portal/fuera ni pegado a nadie
      const tg = randomAlive();
      if (!tg) return null;
      for (let i = 0; i < 24; i++) {
        const a = rand(0, TAU), x = tg.x + Math.cos(a) * TELE_DIST, y = tg.y + Math.sin(a) * TELE_DIST;
        if (x < this.r + 20 || x > W - this.r - 20 || y < this.r + 20 || y > H - this.r - 20) continue;
        if (forbidden(x, y, this.r) || nearPortal(x, y, this.r + 20)) continue;
        if (G.players.some((p) => p.hp > 0 && Math.hypot(p.x - x, p.y - y) < TELE_MIN - 1e-6)) continue;
        return [x, y];
      }
      return null;
    }
    fight(dt, g) {
      const p2 = this.phase === 2;
      // se mueve hacia su recorrido de la v3 (así puede volver después de teletransportarse)
      const px = W / 2 + Math.sin(this.t * 0.7) * 330, py = this.enterY + Math.sin(this.t * 1.4) * 35;
      if (this.hold > 0) this.hold -= dt;
      else {
        const dx = px - this.x, dy = py - this.y, d = Math.hypot(dx, dy), mv = 260 * dt;
        if (d <= mv) { this.x = px; this.y = py; } else { this.x += dx / d * mv; this.y += dy / d * mv; }
      }
      const [tx, ty] = g.targetFor(this.x, this.y);
      const [nx, ny] = norm(tx - this.x, ty - this.y);
      if (nx || ny) {
        const k = Math.min(1, 6 * dt);
        this.lx += (nx - this.lx) * k; this.ly += (ny - this.ly) * k;
      }
      if (this.ab) return;
      this.teleCd -= dt; this.missCd -= dt;
      if (this.teleCd <= 0) {
        const d = this.teleDest();
        if (d) this.startAb(AB.S_TELE, TXT.seekerTeleport, d[0], d[1]);
        this.teleCd = p2 ? 7 : 9;
        if (d) return;
      } else if (this.missCd <= 0) {
        this.startAb(AB.S_MISS, TXT.seekerMisiles, p2 ? 3 : 2);
        this.missCd = p2 ? 7.5 : 10;
        return;
      }
      this.aimCd -= dt; // abanico: v3 3/5 balas -> v4 2/4
      if (this.aimCd <= 0) {
        if (!p2) { this.fanShot(g, tx, ty, 2, 0.18, 260); this.aimCd = 1.1; }
        else { this.fanShot(g, tx, ty, 4, 0.16, 300); this.aimCd = 0.8; }
        g.particles.spray(this.x + this.lx * this.r, this.y + this.ly * this.r, this.lx, this.ly, YELLOW, 6, 0.4, 200);
      }
      this.summonCd -= dt; // hunters: v3 tope 6 -> v4 tope 4
      if (this.summonCd <= 0) {
        this.summonCd = p2 ? 5.0 : 6.5;
        let hunters = g.enemies.filter((e) => e.kind === 'hunter').length;
        for (const side of [-1, 1]) {
          if (hunters >= 4) break;
          let x = this.x + side * 50, y = this.y + 20, ok = !forbidden(x, y, 18);
          for (let i = 0; i < 10 && !ok; i++) { x = this.x + rand(-90, 90); y = this.y + rand(-40, 90); ok = !forbidden(x, y, 18); }
          if (!ok) continue;
          g.enemies.push(g.makeEnemy(Math.max(3, g.wave), 'hunter', x, y));
          hunters++;
        }
        g.particles.ring(this.x, this.y, YELLOW, 90, 0.5, 3);
      }
      if (p2) { // anillo: v3 10 -> v4 7
        this.ringCd -= dt;
        if (this.ringCd <= 0) { this.ringCd = 3.0; this.ringShot(g, 7, 120, rand(0, TAU), ORANGE, 7); }
      }
    }
    execute(ab, g) {
      if (ab.k === AB.S_TELE) { // aparece exactamente en la marca
        g.particles.burst(this.x, this.y, YELLOW, 24, 220, 5);
        this.x = ab.a; this.y = ab.b;
        this.hold = TELE_HOLD;
        this.aimCd = Math.max(this.aimCd, 0.7);
        g.particles.ring(this.x, this.y, YELLOW, 110, 0.5, 4);
        g.addShake(4);
      } else if (ab.k === AB.S_MISS) {
        for (let i = 0; i < ab.a; i++) {
          const tg = randomAlive();
          const base = tg ? Math.atan2(tg.y - this.y, tg.x - this.x) : Math.PI / 2;
          const a = base + (i - (ab.a - 1) / 2) * 0.7;
          G.missiles.push({ id: ++G.nid, x: this.x + Math.cos(a) * this.r, y: this.y + Math.sin(a) * this.r, ang: a, t: 0,
            target: tg ? tg.id : -1, hp: MISSILE_HP, flash: 0 });
        }
        g.particles.spray(this.x, this.y + this.r, 0, 1, ORANGE, 10, 0.8, 200);
      }
    }
    draw() {
      const px = this.x, py = this.y, r = this.r, c = this.bodyColor();
      if (this.ab && this.ab.k === AB.S_TELE && Math.floor(bg.pulse * 20) % 2 === 0) ctx.globalAlpha = 0.45; // parpadea
      this.drawAura(px, py);
      poly([[px, py - r * 1.25], [px + r * 1.5, py], [px, py + r * 1.25], [px - r * 1.5, py]]);
      ctx.fillStyle = 'rgb(55,45,0)'; ctx.fill();
      this.strokeNeon(c, 3);
      ctx.fillStyle = 'rgb(250,245,220)';
      ctx.beginPath(); ctx.ellipse(px, py, r * 0.9, r * 0.55, 0, 0, TAU); ctx.fill();
      const ex = px + this.lx * r * 0.35, ey = py + this.ly * r * 0.35;
      ctx.fillStyle = rgb(this.phase === 2 || (this.ab && this.ab.k === AB.S_MISS) ? ORANGE : YELLOW);
      circle(ex, ey, r * 0.36); ctx.fill();
      ctx.fillStyle = 'rgb(20,10,0)';
      circle(ex, ey, r * 0.17); ctx.fill();
      ctx.fillStyle = rgb(c);
      for (const side of [-1, 1]) {
        const a = this.angle * 2 * side;
        circle(px + side * r * 1.9 + Math.cos(a) * 6, py + Math.sin(a) * 6, 5); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  class Titan extends Boss {
    constructor() {
      super({ name: 'TITAN', color: RED, maxHp: 160, r: 48, bonus: 150, enterY: 170 });
      this.mode = 'roam'; this.modeT = 2.0; this.burstCd = 1.0; this.burstOff = 0;
      this.dx = 0; this.dy = 1; this.rtx = W / 2; this.rty = H / 2 - 60;
      this.abCd = 6; this.nextAb = 'laser'; this.combo = false; this.wave2 = 0; this.wave2Rot = 0;
    }
    startLaser() {
      const [tx, ty] = G.targetFor(this.x, this.y);
      const dir = Math.random() < 0.5 ? 1 : -1;
      const a0 = Math.atan2(ty - this.y, tx - this.x) - dir * LASER_SWEEP / 2; // el barrido pasa por el objetivo
      this.startAb(AB.T_LASER_WARN, TXT.titanLaser, a0, dir);
    }
    fight(dt, g) {
      const p2 = this.phase === 2;
      this.angle += dt * (p2 ? 2.2 : 1.0);
      // ondas del golpe al suelo
      if (this.wave2 > 0) { this.wave2 -= dt; if (this.wave2 <= 0) this.waves.push({ r: this.r, rot: this.wave2Rot }); }
      for (const w of this.waves) w.r += WAVE_SPEED * dt;
      this.waves = this.waves.filter((w) => w.r < 1200);
      for (const w of this.waves) {
        for (const p of G.players) {
          if (p.hp <= 0) continue;
          const d = Math.hypot(p.x - this.x, p.y - this.y);
          if (Math.abs(d - w.r) > WAVE_HALF + p.r * 0.6) continue;
          const pa = Math.atan2(p.y - this.y, p.x - this.x);
          let inGap = false;
          for (let i = 0; i < WAVE_GAPS; i++) {
            const gc = w.rot + i * TAU / WAVE_GAPS;
            if (Math.abs(((pa - gc) % TAU + TAU + Math.PI) % TAU - Math.PI) < WAVE_GAP_W / 2) inGap = true;
          }
          if (!inGap) damagePlayer(p);
        }
      }
      // láser
      if (this.ab && this.ab.k === AB.T_LASER) {
        this.ab.c += dt;
        const a = this.ab.a + this.ab.b * LASER_SWEEP * clamp(this.ab.c / LASER_TIME, 0, 1);
        const cx = Math.cos(a), cy = Math.sin(a);
        for (const p of G.players) { // atraviesa los pilares (spec §8)
          if (p.hp <= 0) continue;
          const vx = p.x - this.x, vy = p.y - this.y, along = vx * cx + vy * cy;
          if (along > 0 && Math.abs(vx * cy - vy * cx) < LASER_HALF + p.r * 0.6) damagePlayer(p);
        }
        if (this.ab.c >= LASER_TIME) { this.ab = null; this.mode = 'roam'; this.modeT = p2 ? 1.6 : 2.6; this.abCd = p2 ? 9 : 11; }
        return;
      }
      if (this.mode === 'ab') return; // quieto mientras avisa
      if (this.mode === 'roam') {
        const dx = this.rtx - this.x, dy = this.rty - this.y, d = Math.hypot(dx, dy);
        if (d < 20) { this.rtx = rand(120, W - 120); this.rty = rand(100, H - 160); }
        else { this.x += dx / d * 90 * dt; this.y += dy / d * 90 * dt; }
        this.burstCd -= dt; // anillo: v3 12/16 -> v4 8/11
        if (this.burstCd <= 0) {
          this.ringShot(g, p2 ? 11 : 8, 180, this.burstOff);
          this.burstOff += 0.2;
          this.burstCd = p2 ? 1.4 : 2.2;
        }
        this.abCd -= dt;
        if (this.abCd <= 0) {
          this.mode = 'ab';
          if (p2) { this.combo = true; this.startAb(AB.T_SLAM, TXT.titanGolpe, rand(0, TAU)); } // fase 2: golpe + láser
          else if (this.nextAb === 'laser') { this.nextAb = 'slam'; this.startLaser(); }
          else { this.nextAb = 'laser'; this.startAb(AB.T_SLAM, TXT.titanGolpe, rand(0, TAU)); }
          return;
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
          if (hitWall) { // v3 10/14 -> v4 7/10
            this.ringShot(g, p2 ? 10 : 7, 210, rand(0, TAU), ORANGE);
            g.particles.burst(this.x, this.y, ORANGE, 24, 260, 6);
            g.addShake(12);
          }
          if (p2) { const [tx, ty] = g.targetFor(this.x, this.y); this.fanShot(g, tx, ty, 4, 0.2, 280, YELLOW); } // v3 5 -> v4 4
          this.mode = 'recover';
          this.modeT = 0.6;
        }
      } else {
        this.modeT -= dt;
        if (this.modeT <= 0) { this.mode = 'roam'; this.modeT = p2 ? 1.6 : 2.6; }
      }
    }
    execute(ab, g) {
      const p2 = this.phase === 2;
      if (ab.k === AB.T_LASER_WARN) {
        this.ab = { k: AB.T_LASER, t: 0, a: ab.a, b: ab.b, c: 0 };
      } else if (ab.k === AB.T_SLAM) {
        this.waves.push({ r: this.r, rot: ab.a });
        if (p2) { this.wave2 = 0.5; this.wave2Rot = ab.a + Math.PI / WAVE_GAPS; } // 2ª onda con los huecos corridos
        g.particles.burst(this.x, this.y, ORANGE, 30, 300, 7);
        g.addShake(14);
        if (this.combo) { this.combo = false; this.startLaser(); } // fase 2: encadena el láser
        else { this.mode = 'roam'; this.modeT = p2 ? 1.6 : 2.6; this.abCd = p2 ? 9 : 13; }
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
      if (this.mode === 'tele' || (this.ab && this.ab.k === AB.T_SLAM)) { px += rand(-3, 3); py += rand(-3, 3); }
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
  // Jugadores. hp = 1 vivo / 0 muerto (esperando reaparecer o "fuera"); lives = vidas que le quedan.
  // ---------------------------------------------------------------------------
  function spawnPoint(idx) { const s = MAP.spawns[(idx | 0) % MAP.spawns.length]; return [s[0], s[1]]; }
  function makePlayer(id, name, idx = 0) {
    const [x, y] = spawnPoint(idx);
    return { id, name: name || 'Jugador', slot: idx, x, y, r: 14, speed: 280, hp: 1, lives: START_LIVES, out: false,
      invuln: 0, magnet: 0, rapid: 0, weapon: 0, wcd: [0, 0, 0], gcd: 0, tpCd: 1.0,
      angle: -Math.PI / 2, trailAcc: 0, color: PLAYER_COLORS[id % 4],
      respawn: 0, firing: false, away: false, inp: null, seq: 0, lastInput: 0 };
  }
  function stepMove(p, mx, my, dt) {
    const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    p.x = clamp(p.x + mx * p.speed * dt, p.r, W - p.r);
    p.y = clamp(p.y + my * p.speed * dt, p.r, H - p.r);
    if (MAP.obstacles.length) { // se desliza por los pilares (empuje por la normal)
      pushOut(p, p.r);
      p.x = clamp(p.x, p.r, W - p.r); p.y = clamp(p.y, p.r, H - p.r);
    }
  }
  // busca un punto libre (fuera de pilares y zonas prohibidas): hasta 10 intentos, nunca un bucle infinito
  function freePoint(x, y, pad, spread) {
    if (x >= pad && x <= W - pad && y >= pad && y <= H - pad && !forbidden(x, y, pad)) return [x, y];
    for (let i = 0; i < 10; i++) {
      const nx = spread ? clamp(x + rand(-spread, spread), pad, W - pad) : rand(pad + 40, W - pad - 40);
      const ny = spread ? clamp(y + rand(-spread, spread), pad, H - pad) : rand(pad + 60, H - pad - 40);
      if (!forbidden(nx, ny, pad)) return [nx, ny];
    }
    return null;
  }
  // reaparición segura: el punto de spawns_jugadores más lejos de enemigos, balas, minas, misiles y jefe
  function safeSpawn() {
    let best = MAP.spawns[0], bs = -Infinity;
    for (const s of MAP.spawns) {
      let d = Infinity;
      const near = (x, y, r) => { d = Math.min(d, Math.hypot(x - s[0], y - s[1]) - r); };
      for (const e of G.enemies) near(e.x, e.y, e.r);
      for (const b of G.ebullets) near(b.x, b.y, b.r);
      for (const m of G.mines) near(m.x, m.y, MINE_R);
      for (const m of G.missiles) near(m.x, m.y, MISSILE_R);
      if (G.boss) near(G.boss.x, G.boss.y, G.boss.r);
      for (const p of G.players) if (p.hp > 0) near(p.x, p.y, 10); // no encimarse con otro jugador
      if (d > bs) { bs = d; best = s; }
    }
    return [best[0], best[1]];
  }

  // ---------------------------------------------------------------------------
  // Estado del juego
  // ---------------------------------------------------------------------------
  const QS = new URLSearchParams(location.search);
  const DEBUG_BOSS = clamp(parseInt(QS.get('debug_boss') || '0', 10) || 0, 0, 3);
  const DEBUG_PEER = QS.get('debug_peer') === '1';
  // el iPad se presenta como Mac ("MacIntel") pero con pantalla táctil
  const IS_IPAD = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  const G = {
    state: 'menu', // menu | lobby | busy | play | pause | over | win
    name: cleanName(lsGet(LS_NAME, 'Jugador')),
    best: parseInt(lsGet(LS_BEST, '0'), 10) || 0,
    god: false,
    fps: 60,
    mapIdx: 0,
    stats: { frames: 0, playFrames: 0, bossFrames: 0, shots: 0, kills: 0, bossesKilled: 0, maxParticles: 0,
      maxEnemyBullets: 0, bossesSeen: [], shotsBy: {}, shotsByW: [0, 0, 0], explosions: 0, teleports: 0,
      abilities: {}, abilityLog: [], deaths: 0, overs: 0, maxMsg: 0, maxSnap: 0, rpgBossHits: 0 },
  };
  useMap(prefMap()); // preferencia guardada (si no está o está rota, Arena Neón)

  function initRound(roster) {
    roster = roster || [{ id: 0, name: G.name }];
    G.players = roster.map((r, i) => makePlayer(r.id, r.name, r.slot !== undefined ? r.slot : i));
    G.player = G.players.find((p) => p.id === NET.myId) || G.players[0];
    G.enemies = []; G.bullets = []; G.ebullets = []; G.powerups = []; G.mines = []; G.missiles = [];
    G.mineOrbit = 0;
    G.particles = new ParticleSystem();
    G.popups = []; G.pendingFx = [];
    G.boss = null; G.nextBossIdx = 0; G.bossesDefeated = 0; G.bossCooldown = 0;
    G.winTimer = 0; G.endTimer = 0;
    G.score = 0; G.wave = 0; G.waveTimer = 0.5; G.elapsed = 0; G.survivalAcc = 0;
    G.shake = 0; G.simTime = 0; G.t0 = 0; G.nid = 0;
    G.banner = { text: '', c: WHITE, t: 0 };
    G.newRecord = false; G.overMsg = '';
    G.myWeapon = 0; // arma elegida (se aplica en la simulación; al reiniciar vuelve a la pistola)
    G.debugBossT = DEBUG_BOSS ? 1.0 : 0;
  }
  initRound();

  const alivePlayers = () => G.players.filter((p) => p.hp > 0);
  function nearestAlive(x, y) {
    let best = null, bd = Infinity;
    for (const p of G.players) {
      if (p.hp <= 0) continue;
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  G.addShake = (a) => {
    G.shake = Math.max(G.shake, a);
    if (NET.rec) NET.ev.push(['k', a]);
  };
  function shakeFor(p, a) { // el temblor por golpe solo lo siente el que lo recibe
    if (p === G.player) G.shake = Math.max(G.shake, a);
    else if (NET.rec) NET.ev.push(['k', a, p.id]);
  }
  G.showBanner = (txt, c, t = 2.2) => {
    G.banner = { text: txt, c, t };
    if (NET.rec) NET.ev.push(['n', txt, ci(c), t]);
  };
  function bannerFor(p, txt, c, t = 2.0) { // cartel solo para un jugador (en el host o mandado a su cliente)
    if (p === G.player) G.banner = { text: txt, c, t };
    else if (NET.rec) NET.ev.push(['n', txt, ci(c), t, p.id]);
  }
  function bannerOthers(p, txt, c, t = 1.8) { // cartel para todos menos p
    if (p !== G.player) G.banner = { text: txt, c, t };
    if (NET.rec) NET.ev.push(['n', txt, ci(c), t, -1 - p.id]);
  }
  G.popup = (x, y, txt, c, big = false) => {
    const life = big ? 1.3 : 0.8;
    G.popups.push({ x, y, txt, c, big, life, max: life });
    if (NET.rec) NET.ev.push(['p', r0(x), r0(y), txt, ci(c), big ? 1 : 0]);
  };
  G.enemyShot = (x, y, vx, vy, c, r = 6) => {
    if (G.ebullets.length >= MAX_ENEMY_BULLETS) return;
    const b = { id: ++G.nid, x, y, vx, vy, c, r };
    G.ebullets.push(b);
    if (NET.rec) NET.ev.push(['eb', b.id, r0(x), r0(y), r0(vx), r0(vy), ci(c), r, r0(G.t0 * 1000)]);
  };
  G.targetFor = (x, y) => {
    const p = nearestAlive(x === undefined ? W / 2 : x, y === undefined ? H / 2 : y);
    return p ? [p.x, p.y] : [W / 2, H / 2];
  };
  function logAbility(name) { // para los tests: cuándo arranca cada aviso
    G.stats.abilities[name] = (G.stats.abilities[name] || 0) + 1;
    if (G.stats.abilityLog.length < 200) G.stats.abilityLog.push([name, +G.simTime.toFixed(3)]);
  }

  G.makeEnemy = (w, kind, x, y) => {
    if (x === undefined) { // entran desde los bordes (los pilares están a más de 120 px de las paredes)
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
    return { id: ++G.nid, x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r: ENEMY_RADIUS[kind], kind,
      hp: ENEMY_HP[kind], huntSpeed: Math.min(170, 90 + w * 4), angle: 0,
      spin: kind !== 'orb' ? rand(2, 5) : 0, flash: 0, alive: true };
  };

  function spawnPowerup(x, y, kind) {
    if (G.powerups.length >= 6) return;
    kind = kind || choice(['heal', 'magnet', 'score', 'score', 'rapid']);
    const pt = x === undefined ? freePoint(-1, -1, 30, 0) : (freePoint(clamp(x, 30, W - 30), clamp(y, 50, H - 30), 30, 70) || freePoint(-1, -1, 30, 0));
    if (!pt) return; // no hay lugar libre: se saltea
    G.powerups.push({ id: ++G.nid, x: pt[0], y: pt[1], kind, r: 10, life: 9, bob: rand(0, TAU) });
  }

  // v3: n = 2 + ola (menor: (2 + ola) / 3) -> v4: × 0,6 (-40%); el intervalo entre oleadas / 0,6 (-40% de tasa)
  function spawnWave(minor) {
    if (!minor) G.wave++;
    const w = Math.max(1, G.wave);
    let n = minor ? Math.max(1, Math.floor((2 + w) / 3)) : 2 + w;
    n = Math.max(1, Math.round(n * ENEMY_COUNT_MULT));
    n = Math.floor(n * (1 + 0.35 * (Math.max(1, G.players.length) - 1))); // más jugadores, más enemigos (+35%)
    n = Math.min(n, MAX_ENEMIES - G.enemies.length);
    for (let i = 0; i < n; i++) G.enemies.push(G.makeEnemy(w));
    if (!minor && Math.random() < 0.4) spawnPowerup();
  }

  function startBoss(idx) {
    const boss = new BOSS_TYPES[idx]();
    boss.index = idx;
    boss.maxHp = Math.floor(boss.maxHp * (1 + 0.6 * (Math.max(1, G.players.length) - 1))); // escala con jugadores
    boss.hp = boss.maxHp;
    G.boss = boss;
    G.nextBossIdx = idx;
    G.stats.bossesSeen.push(boss.name);
    const fin = idx === BOSS_TYPES.length - 1 ? ' (FINAL)' : '';
    G.showBanner(`!! JEFE ${idx + 1}/${BOSS_TYPES.length}: ${boss.name}${fin} !!`, boss.color, 2.5);
    G.addShake(6);
    G.particles.ring(W / 2, 60, boss.color, 400, 1.0, 5);
  }

  function clearBossStuff() { // minas, misiles (y con el jefe se van el láser, las ondas y la marca)
    for (const m of G.mines) G.particles.burst(m.x, m.y, RED, 10, 160, 4, 0.4);
    for (const m of G.missiles) G.particles.burst(m.x, m.y, ORANGE, 8, 140, 4, 0.4);
    G.mines = []; G.missiles = [];
  }

  function onBossKilled(boss) {
    if (G.boss !== boss) return; // ya contado (por ejemplo, bala y explosión en el mismo frame)
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
    clearBossStuff();
    if (NET.rec) NET.ev.push(['X']);
    spawnPowerup(boss.x - 40, boss.y, 'heal');
    spawnPowerup(boss.x + 40, boss.y, choice(['rapid', 'magnet']));
    for (const p of G.players) if (p.hp <= 0) p.respawn = Math.min(p.respawn, 0.5); // cooperativo: vuelven todos
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
    if (!e.alive) return;
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
  function killMine(m, byPlayer) {
    if (m.dead) return;
    m.dead = true;
    G.particles.burst(m.x, m.y, RED, 22, 240, 6);
    G.particles.ring(m.x, m.y, ORANGE, 50, 0.4, 3);
    if (byPlayer) { G.score += MINE_PTS; G.popup(m.x, m.y - 10, `+${MINE_PTS}`, RED); }
  }
  function killMissile(m, byPlayer) {
    if (m.dead) return;
    m.dead = true;
    G.particles.burst(m.x, m.y, ORANGE, 16, 200, 5);
    if (byPlayer) { G.score += MISSILE_PTS; G.popup(m.x, m.y - 10, `+${MISSILE_PTS}`, ORANGE); }
  }

  function gameOver() {
    if (G.state !== 'play') return; // una sola vez (3.11)
    G.stats.overs++;
    G.overMsg = G.players.length > 1 ? TXT.goCoop : TXT.goSolo;
    setState('over');
  }

  // Le pega al jugador: pierde 1 vida (una sola por frame: queda muerto o invulnerable). Devuelve si le pegó.
  function damagePlayer(p) {
    if (G.winTimer > 0 || p.invuln > 0 || p.hp <= 0) return false;
    G.particles.burst(p.x, p.y, RED, 22, 220, 6);
    shakeFor(p, 8);
    if (G.god) { p.invuln = 1.2; return true; } // modo dios (tests): nunca pierde vidas
    G.stats.deaths++;
    p.lives = Math.max(0, p.lives - 1);
    p.hp = 0;
    p.firing = false;
    G.particles.burst(p.x, p.y, p.color, 50, 300, 8);
    G.particles.ring(p.x, p.y, p.color, 120, 0.7, 4);
    if (p.lives > 0) {
      p.respawn = RESPAWN_SHORT;
      bannerFor(p, p.lives === 1 ? TXT.vidasUltima : fmt(TXT.vidasQuedan, { n: p.lives }), p.lives === 1 ? RED : p.color, 1.8);
    } else {
      p.out = true;
      p.respawn = RESPAWN_TIME;
      if (G.players.every((q) => q.out)) gameOver();
      else {
        bannerFor(p, TXT.fueraCoop, p.color, 2.5);
        bannerOthers(p, fmt(TXT.otroFuera, { nombre: p.name }), p.color);
      }
    }
    return true;
  }
  function revivePlayer(p) {
    const wasOut = p.out;
    if (wasOut) { p.out = false; p.lives = 1; } // en co-op vuelve con 1 vida
    p.hp = 1; p.invuln = RESPAWN_INVULN; p.respawn = 0; p.tpCd = 1.0; // conserva el arma (spec §8, 1.25)
    [p.x, p.y] = safeSpawn();
    G.particles.ring(p.x, p.y, p.color, 90, 0.6, 3);
    if (NET.rec) NET.ev.push(['tp', p.id, r0(p.x), r0(p.y)]); // que el cliente salte, no que cruce la pantalla
    if (wasOut) {
      bannerFor(p, TXT.revivido, LIME, 2.0);
      bannerOthers(p, fmt(TXT.otroRevivido, { nombre: p.name }), p.color);
    }
  }

  function addBullet(p, x, y, a, wi) {
    const wp = WEAPONS[wi];
    const b = { id: ++G.nid, x, y, vx: Math.cos(a) * wp.speed, vy: Math.sin(a) * wp.speed, life: wp.life, r: wp.r,
      dmg: wp.dmg, c: p.color, w: wi, owner: p.id };
    G.bullets.push(b);
    if (NET.rec) NET.ev.push(['pb', b.id, r0(x), r0(y), r0(b.vx), r0(b.vy), ci(b.c), r0(G.t0 * 1000), wi]);
    if (p === G.player) G.stats.shots++;
    G.stats.shotsBy[p.id] = (G.stats.shotsBy[p.id] || 0) + 1;
    G.stats.shotsByW[wi]++;
  }

  function fire(p, ax, ay) {
    const wi = p.weapon, wp = WEAPONS[wi];
    let [dx, dy] = norm(ax - p.x, ay - p.y);
    if (!dx && !dy) { dx = Math.cos(p.angle); dy = Math.sin(p.angle); }
    const a = Math.atan2(dy, dx) + rand(-wp.spread, wp.spread) * deg;
    dx = Math.cos(a); dy = Math.sin(a);
    const mx = p.x + dx * (p.r + 8), my = p.y + dy * (p.r + 8);
    addBullet(p, mx, my, a, wi);
    if (wi === 0 && p.rapid > 0) addBullet(p, mx - dy * 7, my + dx * 7, a + 4 * deg, 0); // pistola: disparo doble con el powerup
    G.particles.spray(mx, my, dx, dy, wi === 2 ? ORANGE : WHITE, wi === 2 ? 8 : 3, 0.4, 180, 3, 0.15);
    if (wi === 2) shakeFor(p, 3);
    p.wcd[wi] = p.rapid > 0 ? wp.cdRapid : wp.cd;
    p.gcd = Math.min(p.wcd[wi], p.rapid > 0 ? GLOBAL_CD_RAPID : GLOBAL_CD); // alternar armas no dispara más rápido (1.8)
  }

  // explosión del RPG: RPG_SPLASH a todo lo que esté a <= RPG_RADIUS del punto (centro), y el impacto directo
  // suma el daño del cohete. Al jefe le pega una sola vez por cohete. A los jugadores, nunca.
  function rpgExplode(b, x, y, direct) {
    G.stats.explosions++;
    G.stats.lastEx = [r1(x), r1(y)];
    G.particles.burst(x, y, ORANGE, 34, 320, 7, 0.7);
    G.particles.burst(x, y, YELLOW, 14, 200, 5, 0.5);
    G.particles.ring(x, y, ORANGE, RPG_RADIUS, 0.45, 5);
    G.addShake(5);
    if (NET.rec) NET.ev.push(['ex', r0(x), r0(y)]);
    for (const e of G.enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      const dmg = (e === direct ? b.dmg : 0) + (d <= RPG_RADIUS ? RPG_SPLASH : 0);
      if (!dmg) continue;
      e.hp -= dmg; e.flash = 0.06;
      if (e.hp <= 0.001) killEnemy(e, true);
    }
    for (const m of G.mines) if (!m.dead && (m === direct || Math.hypot(m.x - x, m.y - y) <= RPG_RADIUS)) killMine(m, true);
    for (const m of G.missiles) if (!m.dead && (m === direct || Math.hypot(m.x - x, m.y - y) <= RPG_RADIUS)) killMissile(m, true);
    const boss = G.boss;
    if (boss && boss.vulnerable) {
      const inR = Math.hypot(boss.x - x, boss.y - y) <= RPG_RADIUS + boss.r;
      const dmg = (direct === boss ? b.dmg : 0) + (inR ? RPG_SPLASH : 0);
      if (dmg) { G.stats.rpgBossHits++; if (boss.damage(dmg)) onBossKilled(boss); }
    }
  }

  // Controles de un jugador remoto (en el host). Si no llegan hace rato, la nave se queda quieta.
  function remoteInput(p) {
    if (!p.inp || p.away || performance.now() - p.lastInput > 600) {
      return { mx: 0, my: 0, ax: p.x + Math.cos(p.angle) * 150, ay: p.y + Math.sin(p.angle) * 150, fire: false, w: p.weapon };
    }
    return p.inp;
  }

  function tryPortal(p) {
    for (const pp of MAP.portals) {
      for (let i = 0; i < 2; i++) {
        const e = pp.ends[i];
        if ((p.x - e.x) ** 2 + (p.y - e.y) ** 2 >= e.r * e.r) continue;
        const o = pp.ends[1 - i], k = o.r + p.r + 6;
        G.particles.ring(e.x, e.y, pp.c, 60, 0.4, 3);
        p.x = clamp(o.x + o.dx * k, p.r, W - p.r); p.y = clamp(o.y + o.dy * k, p.r, H - p.r);
        p.tpCd = pp.cooldown;
        G.particles.ring(o.x, o.y, pp.c, 60, 0.4, 3);
        G.particles.burst(p.x, p.y, pp.c, 12, 160, 4, 0.4);
        G.stats.teleports++;
        if (NET.rec) NET.ev.push(['tp', p.id, r0(p.x), r0(p.y)]);
        return true;
      }
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Update (port de Game.update_play; lo corre el modo solo y el host)
  // ---------------------------------------------------------------------------
  function updatePlay(dt, localInp) {
    G.t0 = G.simTime;
    G.simTime += dt;
    // jugadores
    for (const p of G.players) {
      for (let i = 0; i < 3; i++) p.wcd[i] = Math.max(0, p.wcd[i] - dt); // cada arma recarga aunque no la tengas
      p.gcd = Math.max(0, p.gcd - dt);
      if (p.hp <= 0) { p.firing = false; continue; }
      const inp = p === G.player ? localInp : remoteInput(p);
      if (inp.w !== undefined && inp.w !== p.weapon && inp.w >= 0 && inp.w < WEAPONS.length) {
        p.weapon = inp.w | 0;
        if (p === G.player) G.popup(p.x, p.y - 30, fmt(TXT.armaCambio, { arma: TXT.arma[p.weapon] }), WHITE);
      }
      const ox = p.x, oy = p.y;
      stepMove(p, inp.mx, inp.my, dt);
      if (Math.hypot(inp.ax - p.x, inp.ay - p.y) > 2) p.angle = Math.atan2(inp.ay - p.y, inp.ax - p.x);
      p.invuln = Math.max(0, p.invuln - dt);
      p.magnet = Math.max(0, p.magnet - dt);
      p.rapid = Math.max(0, p.rapid - dt);
      if (p.tpCd > 0) p.tpCd = Math.max(0, p.tpCd - dt);
      else if (MAP.portals.length) tryPortal(p);
      p.trailAcc += dt;
      if (Math.hypot(p.x - ox, p.y - oy) > 1 && p.trailAcc > 0.03) {
        G.particles.trail(p.x - Math.cos(p.angle) * 10, p.y - Math.sin(p.angle) * 10, p.color, 3, 0.25, true);
        p.trailAcc = 0;
      }
      p.firing = !!inp.fire;
      // (1e-6: que 1/12 s no se pierda un cuadro por redondeo; la pistola queda igual que la v3)
      if (inp.fire && p.wcd[p.weapon] <= 1e-6 && p.gcd <= 1e-6) fire(p, inp.ax, inp.ay);
    }
    G.firing = localInp.fire;

    // reaparición (2 s) y, en co-op, revivir a los "fuera" (12 s) si queda alguien adentro
    const anyIn = G.players.some((p) => !p.out);
    for (const p of G.players) {
      if (p.hp > 0) continue;
      if (p.out && (G.winTimer > 0 || !anyIn)) continue;
      p.respawn -= dt;
      if (p.respawn <= 0) revivePlayer(p);
    }

    // proyectiles de los jugadores (con sub-pasos para que no atraviesen nada si el frame es largo)
    for (const b of G.bullets) {
      const steps = Math.max(1, Math.ceil(Math.hypot(b.vx, b.vy) * dt / 12));
      const sdt = dt / steps;
      for (let s = 0; s < steps && b.life > 0; s++) stepBullet(b, sdt);
    }
    G.bullets = G.bullets.filter((b) => b.life > 0);
    for (const b of G.bullets) if (b.w === 2 && Math.random() < 0.8) G.particles.trail(b.x - b.vx * 0.03, b.y - b.vy * 0.03, ORANGE, 4, 0.35);
    G.mines = G.mines.filter((m) => !m.dead);
    G.missiles = G.missiles.filter((m) => !m.dead);

    // enemigos comunes
    for (const e of G.enemies) {
      e.angle += e.spin * dt;
      e.flash = Math.max(0, e.flash - dt);
      if (e.kind === 'hunter') {
        const t = nearestAlive(e.x, e.y);
        if (t) {
          const [nx, ny] = norm(t.x - e.x, t.y - e.y);
          const k = Math.min(1, 2.5 * dt);
          e.vx += (nx * e.huntSpeed - e.vx) * k;
          e.vy += (ny * e.huntSpeed - e.vy) * k;
        }
      }
      e.x += e.vx * dt; e.y += e.vy * dt;
      if (MAP.obstacles.length) { // se deslizan por el costado de los pilares (spec §8, 5.14)
        const n = pushOut(e, e.r);
        if (n && e.vx * n[0] + e.vy * n[1] < 0) { // toda la velocidad pasa a ir por el costado (así rodean el pilar)
          let tx = -n[1], ty = n[0];
          if (e.vx * tx + e.vy * ty < 0) { tx = -tx; ty = -ty; }
          const sp = Math.hypot(e.vx, e.vy);
          e.vx = tx * sp; e.vy = ty * sp;
        }
      }
      // rebote solo si se está yendo hacia afuera (deja entrar a los que nacen fuera)
      if ((e.x < e.r && e.vx < 0) || (e.x > W - e.r && e.vx > 0)) e.vx *= -1;
      if ((e.y < e.r && e.vy < 0) || (e.y > H - e.r && e.vy > 0)) e.vy *= -1;
      if (!e.alive) continue;
      for (const p of G.players) {
        if (p.hp <= 0) continue;
        const rr = e.r + p.r;
        if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 < rr * rr) {
          if (damagePlayer(p)) killEnemy(e, false);
          else {
            const [ax, ay] = norm(e.x - p.x, e.y - p.y);
            if (ax || ay) { e.vx = ax * 200; e.vy = ay * 200; }
          }
          break;
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
        G.showBanner(boss.name === 'TITAN' ? TXT.titanFase2 : `${boss.name}: FASE 2`, boss.color, 1.6);
        G.particles.ring(boss.x, boss.y, boss.color, 200, 0.8, 5);
        G.particles.burst(boss.x, boss.y, boss.color, 30, 260, 6);
        G.addShake(10);
      }
      for (const p of G.players) {
        const dx = p.x - boss.x, dy = p.y - boss.y, rr = boss.r + p.r * 0.8;
        if (p.hp > 0 && dx * dx + dy * dy < rr * rr && damagePlayer(p)) {
          const [nx, ny] = (dx || dy) ? norm(dx, dy) : [0, 1];
          p.x = clamp(p.x + nx * 40, p.r, W - p.r);
          p.y = clamp(p.y + ny * 40, p.r, H - p.r);
        }
      }
    }
    updateMines(dt);
    updateMissiles(dt);

    // balas enemigas (se frenan en los pilares)
    const keep = [];
    for (const b of G.ebullets) {
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < -30 || b.x > W + 30 || b.y < -30 || b.y > H + 30) continue;
      if (MAP.obstacles.length && obstacleHit(b.x, b.y, b.r)) {
        G.particles.spray(b.x, b.y, -b.vx, -b.vy, b.c, 3, 0.8, 120, 3, 0.2);
        if (NET.rec) NET.ev.push(['x', b.id]);
        continue;
      }
      let hit = false;
      for (const p of G.players) {
        const rr = b.r + p.r * 0.7;
        if (p.hp > 0 && (b.x - p.x) ** 2 + (b.y - p.y) ** 2 < rr * rr && damagePlayer(p)) { hit = true; break; }
      }
      if (hit) { if (NET.rec) NET.ev.push(['x', b.id]); continue; }
      keep.push(b);
    }
    G.ebullets = keep;

    // powerups
    const magnets = G.players.filter((p) => p.hp > 0 && p.magnet > 0);
    for (const u of G.powerups) {
      if (magnets.length) {
        let m = magnets[0];
        for (const q of magnets) if ((q.x - u.x) ** 2 + (q.y - u.y) ** 2 < (m.x - u.x) ** 2 + (m.y - u.y) ** 2) m = q;
        const [nx, ny] = norm(m.x - u.x, m.y - u.y);
        u.x += nx * 240 * dt; u.y += ny * 240 * dt;
      }
      u.life -= dt;
      u.bob += dt * 4;
    }
    G.powerups = G.powerups.filter((u) => u.life > 0);
    for (const u of G.powerups.slice()) {
      const taker = G.players.find((p) => p.hp > 0 && (u.x - p.x) ** 2 + (u.y - p.y) ** 2 < (u.r + p.r) ** 2);
      if (!taker) continue;
      G.powerups.splice(G.powerups.indexOf(u), 1);
      G.particles.burst(u.x, u.y, POWERUP_COLORS[u.kind], 16, 150);
      if (u.kind === 'heal') { // +1 vida (tope 5); si ya tenés 5, puntos
        if (taker.lives < MAX_LIVES) { taker.lives++; G.popup(u.x, u.y, '+1 VIDA', LIME); }
        else { G.score += SCORE_POWERUP; G.popup(u.x, u.y, `+${SCORE_POWERUP}`, YELLOW); }
      }
      else if (u.kind === 'magnet') { taker.magnet = 6; G.popup(u.x, u.y, 'IMÁN', CYAN); }
      else if (u.kind === 'rapid') { taker.rapid = 6; G.popup(u.x, u.y, 'DISPARO RÁPIDO', ORANGE); }
      else { G.score += SCORE_POWERUP; G.popup(u.x, u.y, `+${SCORE_POWERUP}`, YELLOW); }
    }

    // puntaje por supervivencia: +1 por segundo
    G.elapsed += dt;
    G.survivalAcc += dt;
    while (G.survivalAcc >= 1) { G.survivalAcc -= 1; G.score += 1; }

    // ?debug_boss=N (solo para pruebas): fuerza el jefe N al ratito de empezar
    if (G.debugBossT > 0) {
      G.debugBossT -= dt;
      if (G.debugBossT <= 0 && !G.boss) startBoss(DEBUG_BOSS - 1);
    }

    // aparición de jefes
    G.bossCooldown = Math.max(0, G.bossCooldown - dt);
    if (!G.boss && G.winTimer <= 0 && G.nextBossIdx < BOSS_TYPES.length && G.state === 'play'
        && G.score >= BOSS_SCORES[G.nextBossIdx] && G.bossCooldown <= 0) {
      startBoss(G.nextBossIdx);
    }

    // oleadas (con jefe: menos enemigos y más espaciadas). v4: intervalo / 0,6
    G.waveTimer -= dt;
    if (G.waveTimer <= 0) {
      const base = Math.max(2, WAVE_INTERVAL - G.wave * 0.12) / SPAWN_RATE_MULT;
      if (G.boss) { spawnWave(true); G.waveTimer = base * 2.2; }
      else { if (G.winTimer <= 0) spawnWave(false); G.waveTimer = base; }
    }

    // victoria tras el jefe final
    if (G.winTimer > 0) {
      G.winTimer -= dt;
      if (G.winTimer <= 0 && G.state === 'play') {
        const p = alivePlayers()[0] || G.player;
        G.particles.burst(p.x, p.y, YELLOW, 60, 320, 7);
        setState('win');
      }
    }
  }

  function bulletGone(b, sparkC) {
    b.life = 0;
    if (NET.rec) NET.ev.push(['x', b.id]);
    if (sparkC) G.particles.spray(b.x, b.y, -b.vx, -b.vy, sparkC, 3, 0.7, 140, 3, 0.2);
  }
  function stepBullet(b, dt) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    const rpg = b.w === 2;
    if (b.x < 0 || b.x > W || b.y < 0 || b.y > H) { // el RPG explota en el borde (spec §8, 1.21)
      if (rpg) { const x = clamp(b.x, 0, W), y = clamp(b.y, 0, H); bulletGone(b); rpgExplode(b, x, y, null); }
      else if (b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) b.life = 0;
      return;
    }
    if (b.life <= 0) { if (rpg) { bulletGone(b); rpgExplode(b, b.x, b.y, null); } return; }
    if (MAP.obstacles.length && obstacleHit(b.x, b.y, b.r)) { // los pilares frenan las balas; el RPG explota ahí
      bulletGone(b, rpg ? null : MAP.obsGlow);
      if (rpg) rpgExplode(b, b.x, b.y, null);
      return;
    }
    const hitObj = (o, r) => (o.x - b.x) ** 2 + (o.y - b.y) ** 2 < (r + b.r) ** 2;
    for (const e of G.enemies) {
      if (!e.alive || !hitObj(e, e.r)) continue;
      if (rpg) { bulletGone(b); rpgExplode(b, b.x, b.y, e); return; }
      bulletGone(b, WHITE);
      e.hp -= b.dmg; e.flash = 0.06;
      if (e.hp <= 0.001) killEnemy(e, true);
      return;
    }
    for (const m of G.mines) {
      if (m.dead || !hitObj(m, MINE_R)) continue;
      if (rpg) { bulletGone(b); rpgExplode(b, b.x, b.y, m); return; }
      bulletGone(b, RED);
      m.hp -= b.dmg; m.flash = 0.06;
      if (m.hp <= 0.001) killMine(m, true);
      return;
    }
    for (const m of G.missiles) {
      if (m.dead || !hitObj(m, MISSILE_R)) continue;
      if (rpg) { bulletGone(b); rpgExplode(b, b.x, b.y, m); return; }
      bulletGone(b, ORANGE);
      m.hp -= b.dmg; m.flash = 0.06;
      if (m.hp <= 0.001) killMissile(m, true);
      return;
    }
    const boss = G.boss;
    if (boss && hitObj(boss, boss.r)) {
      if (!boss.vulnerable) { bulletGone(b, CYAN); return; } // rebota en el escudo
      if (rpg) { bulletGone(b); rpgExplode(b, b.x, b.y, boss); return; }
      bulletGone(b, boss.color);
      if (boss.damage(b.dmg)) onBossKilled(boss);
    }
  }

  function updateMines(dt) {
    G.mineOrbit += MINE_SPIN * dt;
    const boss = G.boss;
    if (!boss || boss.name !== 'WARDEN') { if (G.mines.length) G.mines = []; return; }
    for (const m of G.mines) { // orbitan alrededor del jefe y atraviesan los pilares (spec §8)
      const a = G.mineOrbit + m.slot * Math.PI / 2;
      m.x = boss.x + Math.cos(a) * MINE_ORBIT; m.y = boss.y + Math.sin(a) * MINE_ORBIT;
      m.flash = Math.max(0, m.flash - dt);
      for (const p of G.players) {
        if (p.hp <= 0 || (m.x - p.x) ** 2 + (m.y - p.y) ** 2 >= (MINE_R + p.r) ** 2) continue;
        damagePlayer(p); // si tiene invulnerabilidad no pierde vida, pero la mina explota igual
        killMine(m, false);
        G.addShake(6);
        break;
      }
    }
    G.mines = G.mines.filter((m) => !m.dead);
  }

  function updateMissiles(dt) {
    for (const m of G.missiles) {
      m.t += dt;
      m.flash = Math.max(0, m.flash - dt);
      if (m.t < MISSILE_HOMING) { // persigue ~4 s; después sigue derecho
        let tg = G.players.find((p) => p.id === m.target && p.hp > 0);
        if (!tg) { tg = nearestAlive(m.x, m.y); m.target = tg ? tg.id : -1; } // si el objetivo cae, cambia
        if (tg) {
          const want = Math.atan2(tg.y - m.y, tg.x - m.x);
          const d = ((want - m.ang) % TAU + TAU + Math.PI) % TAU - Math.PI;
          m.ang += clamp(d, -MISSILE_TURN * dt, MISSILE_TURN * dt);
        }
      }
      m.x += Math.cos(m.ang) * MISSILE_SPEED * dt; m.y += Math.sin(m.ang) * MISSILE_SPEED * dt;
      if (m.t > MISSILE_LIFE || m.x < -40 || m.x > W + 40 || m.y < -40 || m.y > H + 40) { m.dead = true; continue; }
      if (MAP.obstacles.length && obstacleHit(m.x, m.y, MISSILE_R)) { killMissile(m, false); continue; } // se destruyen en los pilares
      for (const p of G.players) {
        if (p.hp <= 0 || (m.x - p.x) ** 2 + (m.y - p.y) ** 2 >= (MISSILE_R + p.r * 0.8) ** 2) continue;
        damagePlayer(p);
        killMissile(m, false);
        break;
      }
      if (!m.dead && G.state === 'play' && Math.random() < 0.6) G.particles.trail(m.x - Math.cos(m.ang) * 10, m.y - Math.sin(m.ang) * 10, ORANGE, 3, 0.3);
    }
    G.missiles = G.missiles.filter((m) => !m.dead);
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
  // Multijugador (PeerJS / WebRTC). El host es la "verdad": simula y manda fotos del estado.
  // ---------------------------------------------------------------------------
  const PROTO = 2; // v4 (armas, vidas, mapas, habilidades nuevas): no se mezcla con la v3
  const PEER_PREFIX = 'neondodge-';
  const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sin I, L, O, 0, 1 (fáciles de confundir)
  const SEND_HZ = 20, INTERP_DELAY = 0.11;
  // Solo STUN (sin TURN por ahora). Ojo: config.iceServers REEMPLAZA los servidores por defecto de PeerJS,
  // por eso los STUN van explícitos acá.
  const ICE_SERVERS = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ];
  const DEAD_AFTER = 5000; // ms sin mensajes = desconectado (el iPad en segundo plano corta sin avisar)
  const KINDS = ['orb', 'spinner', 'hunter'], PU_KINDS = ['heal', 'magnet', 'score', 'rapid'];
  const TITAN_MODES = ['roam', 'tele', 'charge', 'recover'];
  const STATES = ['lobby', 'play', 'pause', 'over', 'win'];
  const MSG_NET = 'No se pudo conectar al servidor de partidas. Revisá que tengas internet o probá con datos móviles.';
  const MSG_SLOW = 'El servidor de partidas está lento o no responde. Esperá un ratito y probá de nuevo (es gratis y a veces se pone lento).';
  const MSG_P2P = 'No se pudo conectar con el host. Probá con otra red o con datos móviles: algunas redes (como las de las escuelas) bloquean este tipo de conexión.';

  Object.assign(NET, {
    peer: null, code: '', roster: [], conns: [], conn: null, seq: 0, sendAcc: 0, pingAcc: 0,
    key: '', leaving: false, timer: 0, lastMsg: 0, reconnects: 0, ghosts: new Map(),
  });
  NET.key = (() => {
    let k = '';
    try { k = sessionStorage.getItem('neonDodge.clave') || ''; } catch (e) { /* nada */ }
    if (!k) {
      k = Math.random().toString(36).slice(2, 10);
      try { sessionStorage.setItem('neonDodge.clave', k); } catch (e) { /* nada */ }
    }
    return k;
  })();

  function genCode() {
    let s = '';
    for (let i = 0; i < 5; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return s;
  }
  const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  const validCode = (c) => c.length === 5 && [...c].every((ch) => CODE_CHARS.includes(ch));
  const roomLink = (code) => `${location.origin}${location.pathname}?sala=${code}`;
  function peerOpts() {
    const config = { iceServers: window.NEON_ICE_OVERRIDE || ICE_SERVERS }; // el override es solo para pruebas
    return { debug: DEBUG_PEER ? 3 : 0, config };
  }
  function safeSend(conn, msg) {
    try { if (conn && conn.open) conn.send(msg); } catch (e) { /* conexión cerrándose */ }
  }
  function destroyPeer() {
    const peer = NET.peer;
    NET.peer = null; NET.conn = null; NET.conns = [];
    clearTimeout(NET.timer);
    if (peer) { try { peer.destroy(); } catch (e) { /* nada */ } }
  }
  const inGame = () => ['play', 'pause', 'over', 'win'].includes(G.state);

  // ----------------------------- HOST ------------------------------------------
  function hostCreate(attempt = 0) {
    if (typeof Peer === 'undefined') { menuError('No se pudo cargar el multijugador. Recargá la página.'); return; }
    saveName();
    destroyPeer();
    NET.mode = 'host'; NET.myId = 0; NET.leaving = false;
    const code = genCode();
    showBusy('Creando la partida…');
    const peer = new Peer(PEER_PREFIX + code, peerOpts());
    NET.peer = peer;
    let opened = false;
    NET.timer = setTimeout(() => { if (!opened && NET.peer === peer) { destroyPeer(); NET.mode = 'solo'; menuError(MSG_SLOW); } }, 10000);
    peer.on('open', () => {
      if (NET.peer !== peer) return;
      opened = true;
      clearTimeout(NET.timer);
      NET.code = code;
      NET.roster = [{ id: 0, name: G.name, conn: null, key: NET.key }];
      showLobby();
    });
    peer.on('connection', (conn) => hostOnConn(conn));
    peer.on('disconnected', () => { // se cortó el servidor de señalización: los que ya están siguen jugando
      if (NET.peer === peer && !peer.destroyed) setTimeout(() => { try { if (!peer.destroyed) peer.reconnect(); } catch (e) { /* nada */ } }, 2000);
    });
    peer.on('error', (err) => {
      if (NET.peer !== peer) return;
      if (!opened) {
        if (err.type === 'unavailable-id' && attempt < 4) { hostCreate(attempt + 1); return; }
        destroyPeer(); NET.mode = 'solo';
        menuError(err.type === 'browser-incompatible' ? 'Este navegador no soporta el multijugador. Probá con Safari o Chrome actualizados.' : MSG_NET);
      }
    });
  }

  function hostOnConn(conn) {
    if (NET.mode !== 'host') { try { conn.close(); } catch (e) { /* nada */ } return; }
    conn.lastMsg = performance.now();
    NET.conns.push(conn);
    conn.on('data', (d) => hostOnData(conn, d));
    conn.on('close', () => hostDrop(conn));
    conn.on('error', () => hostDrop(conn));
    setTimeout(() => { if (conn.pid === undefined && !conn.dropped) { try { conn.close(); } catch (e) { /* nada */ } hostDrop(conn); } }, 15000);
  }

  function hostOnData(conn, d) {
    conn.lastMsg = performance.now();
    if (Array.isArray(d)) { // controles: ['i', seq, mx*100, my*100, ax, ay, disparando]
      const p = conn.pid !== undefined && G.players.find((q) => q.id === conn.pid);
      if (!p || d[0] !== 'i') return;
      p.inp = { mx: (+d[2] || 0) / 100, my: (+d[3] || 0) / 100, ax: +d[4] || 0, ay: +d[5] || 0, fire: !!d[6],
        w: typeof d[7] === 'number' && d[7] >= 0 ? clamp(d[7] | 0, 0, WEAPONS.length - 1) : undefined };
      p.seq = +d[1] || 0;
      p.lastInput = performance.now();
      p.away = false;
      return;
    }
    if (!d || typeof d !== 'object') return;
    if (d.t === 'h') {
      if (d.v !== PROTO) { safeSend(conn, { t: 'ver' }); setTimeout(() => conn.close(), 400); return; }
      const name = cleanName(d.n), key = String(d.k || '').slice(0, 20);
      let r = key && NET.roster.find((q) => q.key === key && q.id !== 0);
      const ghost = key && NET.ghosts.get(key);
      if (ghost) NET.ghosts.delete(key);
      if (r) { // se reconectó (por ejemplo, el iPad volvió de segundo plano)
        const old = r.conn;
        r.conn = conn; r.name = name;
        if (old && old !== conn) { old.replaced = true; try { old.close(); } catch (e) { /* nada */ } }
        const p = G.players.find((q) => q.id === r.id);
        if (p) { p.away = false; p.name = name; }
      } else {
        if (NET.roster.length >= MAX_PLAYERS) { safeSend(conn, { t: 'full' }); setTimeout(() => { try { conn.close(); } catch (e) { /* nada */ } }, 600); return; }
        const back = ghost && performance.now() - ghost.t < 90000 && !NET.roster.some((q) => q.id === ghost.id);
        let id = back ? ghost.id : 1;
        while (!back && NET.roster.some((q) => q.id === id)) id++;
        r = { id, name, conn, key };
        NET.roster.push(r);
        NET.roster.sort((a, b) => a.id - b.id);
        const txt = back ? `${name} volvió a la partida` : `${name} se unió a la partida`;
        toast(txt);
        hostEvent(['m', txt]);
        if (back && inGame() && ghost.p && ghost.round === G.round && !G.players.some((q) => q.id === id)) {
          const p = ghost.p; // recupera su nave como estaba (vidas, powerups)
          p.name = name; p.inp = null; p.away = false; p.seq = 0;
          if (p.hp > 0) p.invuln = Math.max(p.invuln, 2);
          G.players.push(p);
          G.players.sort((a, b) => a.id - b.id);
        }
      }
      conn.pid = r.id;
      if (inGame() && !G.players.some((q) => q.id === r.id)) { // se suma con la partida empezada
        const p = makePlayer(r.id, r.name, Math.max(0, NET.roster.indexOf(r)));
        [p.x, p.y] = safeSpawn();
        p.invuln = 2;
        G.players.push(p);
        G.players.sort((a, b) => a.id - b.id);
      }
      safeSend(conn, { t: 'w', id: r.id, code: NET.code, mp: MAP.id });
      hostRoster();
      if (inGame()) {
        safeSend(conn, { t: 'go', mp: MAP.id });
        conn.extra = fullSyncEvents();
      }
      if (G.state === 'lobby') renderLobby();
    } else if (d.t === 'aw') {
      const p = G.players.find((q) => q.id === conn.pid);
      if (p) p.away = !!d.v;
    } else if (d.t === 'bye') {
      try { conn.close(); } catch (e) { /* nada */ }
      hostDrop(conn);
    }
  }

  function hostEvent(ev) { if (NET.rec) NET.ev.push(ev); }

  function hostDrop(conn) {
    if (conn.dropped) return;
    conn.dropped = true;
    NET.conns = NET.conns.filter((c) => c !== conn);
    if (conn.replaced || NET.mode !== 'host') return;
    const r = NET.roster.find((q) => q.conn === conn);
    if (!r) return;
    NET.roster = NET.roster.filter((q) => q !== r);
    const p = G.players.find((q) => q.id === r.id);
    if (r.key) NET.ghosts.set(r.key, { id: r.id, p: p && inGame() ? p : null, t: performance.now(), round: G.round });
    if (p && inGame()) {
      if (p.hp > 0) G.particles.ring(p.x, p.y, p.color, 80, 0.6, 3);
      G.players = G.players.filter((q) => q !== p);
      if (G.state === 'play' && G.players.length && G.players.every((q) => q.out)) gameOver(); // 6.14
    }
    toast(`${r.name} se fue de la partida`);
    hostEvent(['m', `${r.name} se fue de la partida`]);
    hostRoster();
    if (G.state === 'lobby') renderLobby();
  }

  function hostRoster() {
    const msg = { t: 'lb', p: NET.roster.map((r) => [r.id, r.name]), mp: MAP.id };
    for (const r of NET.roster) if (r.conn) safeSend(r.conn, msg);
  }

  function hostStart() {
    if (NET.mode !== 'host') return;
    G.name = cleanName(nameInput.value);
    NET.roster[0].name = G.name;
    initRound(NET.roster.map((r, i) => ({ id: r.id, name: r.name, slot: i })));
    G.round = (G.roundN = (G.roundN || 0) + 1);
    NET.ghosts.clear();
    NET.ev = []; NET.sendAcc = 1;
    setState('play');
    for (const r of NET.roster) if (r.conn) { r.conn.extra = null; safeSend(r.conn, { t: 'go', mp: MAP.id }); }
    hostRoster();
  }

  // todas las balas que hay ahora (para el que entra con la partida empezada o se reconecta)
  function fullSyncEvents() {
    const t = r0(G.simTime * 1000), ev = [];
    for (const b of G.bullets) ev.push(['pb', b.id, r0(b.x), r0(b.y), r0(b.vx), r0(b.vy), ci(b.c), t, b.w, r2(WEAPONS[b.w].life - b.life)]);
    for (const b of G.ebullets) ev.push(['eb', b.id, r0(b.x), r0(b.y), r0(b.vx), r0(b.vy), ci(b.c), b.r, t]);
    return ev;
  }

  function buildSnap() {
    const b = G.boss;
    return {
      t: 's', q: ++NET.seq, tm: r0(G.simTime * 1000), st: STATES.indexOf(G.state), sc: G.score, wv: G.wave,
      bd: G.bossesDefeated, nb: G.nextBossIdx, wt: G.winTimer > 0 ? 1 : 0,
      P: G.players.map((p) => [p.id, r1(p.x), r1(p.y), r2(p.angle), p.hp, r1(p.invuln), r1(p.magnet), r1(p.rapid),
        r1(p.respawn), p.firing ? 1 : 0, p.away ? 1 : 0, p.seq || 0, p.lives, p.out ? 1 : 0, p.weapon, r2(p.wcd[2])]),
      E: G.enemies.map((e) => [e.id, KINDS.indexOf(e.kind), r0(e.x), r0(e.y), r2(e.angle), e.flash > 0 ? 1 : 0]),
      B: b ? [b.index, r1(b.x), r1(b.y), r2(b.angle), Math.ceil(b.hp), b.maxHp, b.state === 'enter' ? 0 : 1,
        b.flash > 0 ? 1 : 0, b.mode ? TITAN_MODES.indexOf(b.mode) : 0, r2(b.modeT || 0), r2(b.dx || 0), r2(b.dy || 0),
        r2(b.lx || 0), r2(b.ly || 0),
        b.ab ? b.ab.k : 0, b.ab ? r2(b.ab.t) : 0, b.ab ? r2(b.ab.a) : 0, b.ab ? r2(b.ab.b) : 0, b.ab ? r2(b.ab.c) : 0,
        b.waves.map((w) => [r0(w.r), r2(w.rot)])] : 0,
      M: G.mines.map((m) => [m.id, r0(m.x), r0(m.y), m.flash > 0 ? 1 : 0]),
      R: G.missiles.map((m) => [m.id, r0(m.x), r0(m.y), r2(m.ang), m.flash > 0 ? 1 : 0]),
      U: G.powerups.map((u) => [u.id, PU_KINDS.indexOf(u.kind), r0(u.x), r0(u.y), r1(u.life), r2(u.bob)]),
    };
  }

  // Manda la foto a cada uno. Si hay muchos eventos, los parte (PeerJS acepta ~16 KB por mensaje JSON).
  const MSG_LIMIT = 15000; // margen bajo los 16 KB
  function sendSnapTo(conn, snap, events) {
    const snapLen = snap._len || (snap._len = JSON.stringify(snap).length);
    G.stats.maxSnap = Math.max(G.stats.maxSnap, snapLen);
    const chunks = [];
    let cur = [], size = 0, budget = Math.max(2000, MSG_LIMIT - snapLen - 20);
    for (const e of events) {
      const l = JSON.stringify(e).length + 1;
      if (size + l > budget && cur.length) { chunks.push(cur); cur = []; size = 0; budget = MSG_LIMIT - 40; }
      cur.push(e); size += l;
    }
    chunks.push(cur);
    sendMeasured(conn, Object.assign({}, snap, { _len: undefined, ev: chunks[0] }));
    for (let i = 1; i < chunks.length; i++) sendMeasured(conn, { t: 'e', q: snap.q, ev: chunks[i] });
  }
  function sendMeasured(conn, msg) { // mide el tamaño real (para el test de 16 KB)
    const l = JSON.stringify(msg).length;
    if (l > G.stats.maxMsg) G.stats.maxMsg = l;
    safeSend(conn, msg);
  }

  function hostBroadcast() {
    const snap = buildSnap(), ev = NET.ev;
    NET.ev = [];
    for (const r of NET.roster) {
      if (!r.conn || !r.conn.open) continue;
      const evs = r.conn.extra ? r.conn.extra.concat(ev) : ev;
      r.conn.extra = null;
      sendSnapTo(r.conn, snap, evs);
    }
  }

  function hostNetTick(dt) {
    NET.rec = inGame() && NET.roster.length > 1;
    if (!NET.rec) NET.ev.length = 0;
    const now = performance.now();
    // heartbeat: el que no manda nada en 5 s se da por desconectado (no confiamos en 'close' de Safari).
    // Si vuelve (con su clave), recupera su lugar y su nave.
    for (const r of NET.roster) {
      if (!r.conn) continue;
      if (now - r.conn.lastMsg > DEAD_AFTER) { try { r.conn.close(); } catch (e) { /* nada */ } hostDrop(r.conn); }
    }
    if (inGame()) {
      NET.sendAcc += dt;
      if (NET.sendAcc >= 1 / SEND_HZ) { NET.sendAcc = Math.min(NET.sendAcc - 1 / SEND_HZ, 0.05); hostBroadcast(); }
    } else {
      NET.pingAcc += dt;
      if (NET.pingAcc > 1) { NET.pingAcc = 0; for (const r of NET.roster) if (r.conn) safeSend(r.conn, { t: 'pg' }); }
    }
  }

  function hostClose() { // el host cierra la sala
    for (const r of NET.roster) if (r.conn) safeSend(r.conn, { t: 'end' });
    const peer = NET.peer;
    NET.peer = null; NET.roster = []; NET.conns = []; NET.mode = 'solo'; NET.rec = false;
    setTimeout(() => { try { if (peer) peer.destroy(); } catch (e) { /* nada */ } }, 300);
  }

  // ----------------------------- CLIENTE ---------------------------------------
  const C = { snaps: [], bullets: new Map(), names: new Map(), offset: null, renderT: 0, hist: [], seq: 0,
    pred: null, corr: [0, 0], boss: null, trail: new Map(), lastSt: -1, rx: 0, lastQ: 0 };

  function clientJoin(code, rejoin = false) {
    code = cleanCode(code);
    if (!validCode(code)) {
      menuError('El código tiene 5 letras o números (sin I, L, O, 0 ni 1). Revisalo y probá de nuevo.');
      return;
    }
    if (typeof Peer === 'undefined') { menuError('No se pudo cargar el multijugador. Recargá la página.'); return; }
    if (!rejoin) { saveName(); NET.reconnects = 0; }
    destroyPeer();
    NET.mode = 'client'; NET.code = code; NET.leaving = false;
    showBusy(rejoin ? 'Reconectando con la partida…' : `Conectando a la sala ${code}…`);
    const peer = new Peer(peerOpts());
    NET.peer = peer;
    let welcomed = false;
    const fail = (msg) => { if (NET.peer === peer) clientFail(msg); };
    NET.timer = setTimeout(() => { if (!welcomed) fail(rejoin ? 'Se perdió la conexión con el host.' : MSG_SLOW); }, 10000);
    peer.on('open', () => { // nunca connect() antes de 'open' (si no, la oferta se puede perder)
      if (NET.peer !== peer) return;
      clearTimeout(NET.timer);
      NET.timer = setTimeout(() => { if (!welcomed) fail(rejoin ? 'Se perdió la conexión con el host.' : MSG_P2P); }, 12000);
      const conn = peer.connect(PEER_PREFIX + code, { reliable: true, serialization: 'json' });
      NET.conn = conn;
      conn.on('open', () => { NET.lastMsg = performance.now(); safeSend(conn, { t: 'h', n: G.name, v: PROTO, k: NET.key }); });
      conn.on('data', (d) => {
        if (NET.conn !== conn) return;
        if (d && d.t === 'w') { welcomed = true; clearTimeout(NET.timer); }
        clientOnData(d);
      });
      conn.on('close', () => { if (NET.conn === conn) clientLost(welcomed); });
      conn.on('error', () => { if (NET.conn === conn) clientLost(welcomed); });
    });
    peer.on('error', (err) => {
      if (NET.peer !== peer) return;
      if (err.type === 'peer-unavailable') {
        if (welcomed) clientLost(true);
        else fail(rejoin ? 'El host cerró la partida.' : `No existe ninguna partida con el código ${code}. Revisá el código o pedile el link al host.`);
      } else if (!welcomed) {
        fail(['network', 'server-error', 'socket-error', 'socket-closed', 'ssl-unavailable'].includes(err.type) ? MSG_NET
          : err.type === 'browser-incompatible' ? 'Este navegador no soporta el multijugador. Probá con Safari o Chrome actualizados.' : MSG_P2P);
      }
    });
  }

  function clientFail(msg) {
    destroyPeer();
    NET.mode = 'solo';
    C.snaps = [];
    toMenu(true);
    menuError(msg);
  }

  // se cortó la conexión con el host: intenta volver a entrar (con la misma clave recupera su nave)
  function clientLost(wasWelcomed) {
    if (NET.mode !== 'client' || NET.leaving) return;
    if (!wasWelcomed) { clientFail(MSG_P2P); return; }
    if (document.hidden) { NET.needRejoin = true; return; } // se reconecta al volver a la app
    if (NET.reconnects >= 3) { clientFail('Se perdió la conexión con el host.'); return; }
    NET.reconnects++;
    clientJoin(NET.code, true);
  }

  function clientLeave(msg) {
    NET.leaving = true;
    safeSend(NET.conn, { t: 'bye' });
    const peer = NET.peer;
    NET.peer = null; NET.conn = null; NET.mode = 'solo';
    clearTimeout(NET.timer);
    setTimeout(() => { try { if (peer) peer.destroy(); } catch (e) { /* nada */ } }, 300);
    toMenu(true);
    if (msg) menuError(msg);
  }

  function clientOnData(d) {
    NET.lastMsg = performance.now();
    if (!d || typeof d !== 'object') return;
    switch (d.t) {
      case 's': clientSnap(d); break;
      case 'e': {
        const s = C.snaps.find((q) => q.q === d.q);
        if (s && !s.applied) s.ev = s.ev.concat(d.ev);
        else for (const e of d.ev) applyEvent(e);
        break;
      }
      case 'w':
        NET.myId = d.id; NET.reconnects = 0;
        if (d.mp) useMap(d.mp, false); // el mapa del host (sin pisar mi preferencia)
        if (!inGame()) showLobby();
        break;
      case 'lb':
        NET.roster = d.p.map(([id, name]) => ({ id, name }));
        C.names = new Map(d.p);
        if (d.mp && !inGame()) useMap(d.mp, false);
        if (G.state === 'lobby') renderLobby();
        break;
      case 'go': if (d.mp) useMap(d.mp, false); clientStartRound(); break;
      case 'full': clientFail('La partida está llena (ya hay 4 jugadores).'); break;
      case 'ver': clientFail(TXT.version); break;
      case 'end': clientLeave('El host cerró la partida.'); break;
      default: break; // 'pg' = sigo vivo
    }
  }

  function clientStartRound() {
    initRound([{ id: NET.myId, name: G.name }]);
    G.players = [];
    C.snaps = []; C.bullets.clear(); C.offset = null; C.renderT = 0; C.hist = []; C.pred = null; C.corr = [0, 0];
    C.boss = null; C.trail.clear(); C.lastSt = -1; C.lastQ = 0;
    C.weaponSync = true; // al entrar o reconectar, tomo el arma que tengo en el host (no la piso con la pistola)
    setState('play');
  }

  function clientSnap(s) {
    if (s.q <= C.lastQ) return; // foto vieja o repetida: se descarta
    C.lastQ = s.q;
    C.rx++;
    const now = performance.now() / 1000, tm = s.tm / 1000;
    const o = tm - now;
    if (C.offset === null || Math.abs(o - C.offset) > 0.3) C.offset = o;
    else if (o > C.offset) C.offset += (o - C.offset) * 0.3; // llegó rápido: adelanto el reloj
    else C.offset += (o - C.offset) * 0.03;
    s.Em = new Map(s.E.map((e) => [e[0], e]));
    s.Pm = new Map(s.P.map((p) => [p[0], p]));
    s.Um = new Map(s.U.map((u) => [u[0], u]));
    C.snaps.push(s);
    if (C.snaps.length > 60) C.snaps.splice(0, C.snaps.length - 60);
    reconcile(s);
  }

  // predicción de mi nave: parto de la posición del host y le sumo los controles que todavía no procesó
  function reconcile(s) {
    const e = s.Pm.get(NET.myId);
    if (!e) return;
    if (C.weaponSync) { G.myWeapon = e[14] | 0; C.weaponSync = false; }
    const ack = e[11];
    while (C.hist.length && C.hist[0].s <= ack) C.hist.shift();
    if (e[4] <= 0) { C.pred = null; return; }
    const tmp = { x: e[1], y: e[2], r: 14, speed: 280 };
    for (const h of C.hist) stepMove(tmp, h.mx, h.my, h.dt);
    if (!C.pred) { C.pred = { x: tmp.x, y: tmp.y }; C.corr = [0, 0]; return; }
    const ex = tmp.x - C.pred.x, ey = tmp.y - C.pred.y;
    if (Math.hypot(ex, ey) > 90) { C.pred.x = tmp.x; C.pred.y = tmp.y; C.corr = [0, 0]; }
    else C.corr = [ex, ey];
  }

  function applyEvent(e) {
    const P = G.particles;
    switch (e[0]) {
      case 'b': P.burst(e[1], e[2], cd(e[3]), e[4], e[5], e[6], e[7], e[8]); break;
      case 's': P.spray(e[1], e[2], Math.cos(e[3]), Math.sin(e[3]), cd(e[4]), e[5], e[6], e[7], e[8], e[9]); break;
      case 't': P.trail(e[1], e[2], cd(e[3]), e[4], e[5]); break;
      case 'r': P.ring(e[1], e[2], cd(e[3]), e[4], e[5], e[6]); break;
      case 'p': {
        const life = e[5] ? 1.3 : 0.8;
        G.popups.push({ x: e[1], y: e[2], txt: e[3], c: cd(e[4]), big: !!e[5], life, max: life });
        break;
      }
      case 'n': { // e[4]: sin dato = para todos; >= 0 = solo ese jugador; < 0 = todos menos (-1 - e[4])
        const to = e[4];
        if (to === undefined || to === NET.myId || (to < 0 && -1 - to !== NET.myId)) G.banner = { text: e[1], c: cd(e[2]), t: e[3] };
        break;
      }
      case 'k': if (e[2] === undefined || e[2] === NET.myId) G.shake = Math.max(G.shake, e[1]); break;
      case 'pb': {
        const wp = WEAPONS[clamp(e[8] | 0, 0, WEAPONS.length - 1)];
        C.bullets.set(e[1], { p: 1, x: e[2], y: e[3], vx: e[4], vy: e[5], c: cd(e[6]), ts: e[7] / 1000 - (e[9] || 0), r: wp.r,
          w: WEAPONS.indexOf(wp), life: wp.life });
        break;
      }
      case 'ex': // explosión del RPG (el daño lo calculó el host)
        P.burst(e[1], e[2], ORANGE, 34, 320, 7, 0.7); P.burst(e[1], e[2], YELLOW, 14, 200, 5, 0.5);
        P.ring(e[1], e[2], ORANGE, RPG_RADIUS, 0.45, 5); G.shake = Math.max(G.shake, 5);
        break;
      case 'tp': P.ring(e[2], e[3], WHITE, 50, 0.4, 3); break; // teletransporte o reaparición: salta, no se interpola
      case 'eb': C.bullets.set(e[1], { p: 0, x: e[2], y: e[3], vx: e[4], vy: e[5], c: cd(e[6]), r: e[7], ts: e[8] / 1000 }); break;
      case 'x': C.bullets.delete(e[1]); break;
      case 'X': for (const [id, b] of C.bullets) if (!b.p) C.bullets.delete(id); break;
      case 'm': toast(e[1]); break;
      default: break;
    }
  }

  function applySnap(s) {
    s.applied = true;
    for (const e of s.ev) applyEvent(e);
    G.score = s.sc; G.wave = s.wv; G.bossesDefeated = s.bd; G.nextBossIdx = s.nb; G.winTimer = s.wt ? 1 : 0;
    if (s.st !== C.lastSt) {
      C.lastSt = s.st;
      const st = STATES[s.st];
      if (st && st !== 'lobby' && st !== G.state) setState(st);
    }
  }

  const lerp = (a, b, t) => a + (b - a) * t;
  function lerpAng(a, b, t) {
    let d = (b - a) % TAU;
    if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
    return a + d * t;
  }

  function clientInterpolate(dt) {
    const S = C.snaps;
    if (!S.length) return;
    const latest = S[S.length - 1];
    const target = performance.now() / 1000 + C.offset - INTERP_DELAY;
    C.renderT = Math.min(latest.tm / 1000, Math.max(C.renderT, target));
    const T = C.renderT;
    for (const s of S) if (!s.applied && s.tm / 1000 <= T + 1e-6) applySnap(s);
    let i = 0;
    while (i + 1 < S.length && S[i + 1].tm / 1000 <= T) i++;
    if (i > 0) S.splice(0, i); // descarto las fotos viejas (ya aplicadas)
    const s0 = S[0], s1 = S[1] || s0;
    const span = (s1.tm - s0.tm) / 1000;
    const a = span > 0 ? clamp((T - s0.tm / 1000) / span, 0, 1) : 0;

    // jugadores
    const players = [];
    const seen = new Set();
    const mk = (p0, p1) => {
      const id = p0[0];
      seen.add(id);
      const q = p1 || p0;
      const pl = makePlayer(id, C.names.get(id) || (id === NET.myId ? G.name : 'Jugador'));
      pl.x = lerp(p0[1], q[1], a); pl.y = lerp(p0[2], q[2], a); pl.angle = lerpAng(p0[3], q[3], a);
      pl.hp = p0[4]; pl.invuln = lerp(p0[5], q[5], a); pl.magnet = lerp(p0[6], q[6], a); pl.rapid = lerp(p0[7], q[7], a);
      pl.respawn = lerp(p0[8], q[8], a); pl.firing = !!p0[9]; pl.away = !!p0[10];
      pl.lives = p0[12]; pl.out = !!p0[13]; pl.weapon = p0[14] | 0; pl.wcd[2] = p0[15] || 0;
      if (p0[4] <= 0 && q[4] > 0 && a > 0.5) { pl.hp = q[4]; pl.x = q[1]; pl.y = q[2]; pl.lives = q[12]; pl.out = !!q[13]; }
      else if (Math.hypot(q[1] - p0[1], q[2] - p0[2]) > 120) { const z = a > 0.5 ? q : p0; pl.x = z[1]; pl.y = z[2]; } // portal: salta
      players.push(pl);
    };
    for (const p0 of s0.P) mk(p0, s1.Pm.get(p0[0]));
    for (const p1 of s1.P) if (!seen.has(p1[0]) && a > 0) mk(p1, null);
    // mi nave: posición predicha (sin esperar al host) y apunte local
    const me = players.find((p) => p.id === NET.myId);
    if (me && C.pred && me.hp > 0) {
      me.x = C.pred.x; me.y = C.pred.y;
      if (G.aim && Math.hypot(G.aim[0] - me.x, G.aim[1] - me.y) > 2) me.angle = Math.atan2(G.aim[1] - me.y, G.aim[0] - me.x);
      else if (G.player && G.player.id === me.id) me.angle = G.player.angle;
    }
    G.players = players;
    G.player = me || G.player || makePlayer(NET.myId, G.name);

    // estela de las naves (se genera acá, no viaja por la red)
    for (const p of players) {
      const tr = C.trail.get(p.id) || { x: p.x, y: p.y, acc: 0 };
      tr.acc += dt;
      if (p.hp > 0 && Math.hypot(p.x - tr.x, p.y - tr.y) > 1 && tr.acc > 0.03) {
        G.particles.trail(p.x - Math.cos(p.angle) * 10, p.y - Math.sin(p.angle) * 10, p.color, 3, 0.25, true);
        tr.acc = 0;
      }
      tr.x = p.x; tr.y = p.y;
      C.trail.set(p.id, tr);
    }

    // enemigos
    const enemies = [];
    for (const e0 of s0.E) {
      const e1 = s1.Em.get(e0[0]) || e0, kind = KINDS[e0[1]];
      enemies.push({ id: e0[0], kind, x: lerp(e0[2], e1[2], a), y: lerp(e0[3], e1[3], a), angle: lerp(e0[4], e1[4], a),
        r: ENEMY_RADIUS[kind], flash: e0[5] ? 0.05 : 0, alive: true });
    }
    G.enemies = enemies;

    // powerups
    G.powerups = s0.U.map((u0) => {
      const u1 = s1.Um.get(u0[0]) || u0;
      return { id: u0[0], kind: PU_KINDS[u0[1]], x: lerp(u0[2], u1[2], a), y: lerp(u0[3], u1[3], a), life: lerp(u0[4], u1[4], a),
        bob: lerp(u0[5], u1[5], a), r: 10 };
    });

    // jefe
    const b0 = s0.B;
    if (b0) {
      const b1 = s1.B && s1.B[0] === b0[0] ? s1.B : b0;
      if (!C.boss || C.boss.index !== b0[0]) { C.boss = new BOSS_TYPES[b0[0]](); C.boss.index = b0[0]; }
      const bo = C.boss;
      bo.x = lerp(b0[1], b1[1], a); bo.y = lerp(b0[2], b1[2], a); bo.angle = lerp(b0[3], b1[3], a);
      bo.hp = b0[4]; bo.maxHp = b0[5]; bo.state = b0[6] ? 'fight' : 'enter'; bo.flash = b0[7] ? 0.05 : 0;
      if (bo instanceof Titan) { bo.mode = TITAN_MODES[b0[8]]; bo.modeT = b0[9]; bo.dx = b0[10]; bo.dy = b0[11]; }
      if (bo instanceof Seeker) { bo.lx = lerp(b0[12], b1[12], a); bo.ly = lerp(b0[13], b1[13], a); }
      if (bo instanceof Seeker && Math.hypot(b1[1] - b0[1], b1[2] - b0[2]) > 100) { const z = a > 0.5 ? b1 : b0; bo.x = z[1]; bo.y = z[2]; } // teletransporte
      bo.ab = b0[14] ? { k: b0[14], t: b0[15], a: b0[16], b: b0[17], c: b0[18] } : null;
      if (bo.ab && b1[14] === b0[14]) { bo.ab.t = lerp(b0[15], b1[15], a); bo.ab.c = lerp(b0[18], b1[18], a); }
      const w0 = b0[19] || [], w1 = b1[19] || [];
      bo.waves = w0.map((w, i) => ({ r: w1.length === w0.length ? lerp(w[0], w1[i][0], a) : w[0], rot: w[1] }));
      G.boss = bo;
    } else { G.boss = null; C.boss = null; }

    // minas y misiles
    const Mm = new Map((s1.M || []).map((m) => [m[0], m])), Rm = new Map((s1.R || []).map((m) => [m[0], m]));
    G.mines = (s0.M || []).map((m0) => { const m1 = Mm.get(m0[0]) || m0; return { id: m0[0], x: lerp(m0[1], m1[1], a), y: lerp(m0[2], m1[2], a), flash: m0[3] ? 0.05 : 0, slot: 0 }; });
    G.missiles = (s0.R || []).map((m0) => { const m1 = Rm.get(m0[0]) || m0; return { id: m0[0], x: lerp(m0[1], m1[1], a), y: lerp(m0[2], m1[2], a), ang: lerpAng(m0[3], m1[3], a), flash: m0[4] ? 0.05 : 0 }; });
    for (const m of G.missiles) if (Math.random() < 0.5) G.particles.trail(m.x - Math.cos(m.ang) * 10, m.y - Math.sin(m.ang) * 10, ORANGE, 3, 0.3);

    // balas: se mueven solas en línea recta desde que salieron
    const pb = [], eb = [];
    for (const [id, b] of C.bullets) {
      const age = T - b.ts;
      if (age < 0) continue;
      const x = b.x + b.vx * age, y = b.y + b.vy * age;
      const m = b.p ? 20 : 30;
      if ((b.p && age > b.life) || x < -m || x > W + m || y < -m || y > H + m) { C.bullets.delete(id); continue; }
      if (MAP.obstacles.length && obstacleHit(x, y, b.r)) { C.bullets.delete(id); continue; } // se frena en el pilar
      if (b.w === 2 && Math.random() < 0.8) G.particles.trail(x - b.vx * 0.03, y - b.vy * 0.03, ORANGE, 4, 0.35);
      (b.p ? pb : eb).push({ x, y, vx: b.vx, vy: b.vy, c: b.c, r: b.r, w: b.w || 0 });
    }
    G.bullets = pb; G.ebullets = eb;
  }

  // cada cuadro del cliente: manda mis controles, predice mi nave e interpola el resto
  function clientFrame(dt, inp) {
    const playing = G.state === 'play';
    const mx = playing ? r0(inp.mx * 100) / 100 : 0, my = playing ? r0(inp.my * 100) / 100 : 0;
    const seq = ++C.seq;
    C.hist.push({ s: seq, mx, my, dt });
    if (C.hist.length > 300) C.hist.shift();
    safeSend(NET.conn, ['i', seq, r0(mx * 100), r0(my * 100), r0(inp.ax || 0), r0(inp.ay || 0), playing && inp.fire ? 1 : 0, C.weaponSync ? -1 : G.myWeapon]);
    G.firing = playing && inp.fire;
    if (C.pred && playing && G.player && G.player.hp > 0) {
      const tmp = { x: C.pred.x, y: C.pred.y, r: 14, speed: 280 };
      stepMove(tmp, mx, my, dt);
      const k = Math.min(1, dt * 10);
      C.pred.x = clamp(tmp.x + C.corr[0] * k, 14, W - 14);
      C.pred.y = clamp(tmp.y + C.corr[1] * k, 14, H - 14);
      C.corr[0] *= 1 - k; C.corr[1] *= 1 - k;
    }
    clientInterpolate(dt);
    updateFx(dt);
  }

  function clientNetTick(dt) {
    NET.pingAcc += dt;
    if (!inGame() && NET.pingAcc > 1) { NET.pingAcc = 0; safeSend(NET.conn, { t: 'pg' }); }
    // sin noticias del host hace rato (y la pestaña está visible): reconectar
    if (NET.conn && NET.lastMsg && !document.hidden && performance.now() - NET.lastMsg > DEAD_AFTER && G.state !== 'busy') {
      NET.lastMsg = performance.now();
      clientLost(true);
    }
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
    wTap: 0, wheelT: 0,
  };
  // arma que tengo en la mano (la mía al instante; la simulación del host la confirma)
  function myWeapon() { return G.myWeapon | 0; }
  function switchWeapon(w) { // 1/2/3, rueda, Q o botón táctil. En pausa, en el menú o muerto no hace nada (1.27, 3.7)
    if (G.state !== 'play' || !G.player || G.player.hp <= 0) return;
    const nw = ((w % WEAPONS.length) + WEAPONS.length) % WEAPONS.length;
    if (nw === G.myWeapon) return;
    G.myWeapon = nw;
    if (NET.mode === 'client') G.popups.push({ x: G.player.x, y: G.player.y - 30, txt: fmt(TXT.armaCambio, { arma: TXT.arma[nw] }), c: WHITE, big: false, life: 0.8, max: 0.8 });
  }

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
    const wb = weaponButton();
    if (Math.hypot(e.clientX - wb.x, e.clientY - wb.y) < wb.r + 10) { input.wTap = performance.now(); switchWeapon(myWeapon() + 1); return; }
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
  document.addEventListener('touchmove', (e) => {
    if (!(e.target instanceof HTMLInputElement) && !(e.target.closest && e.target.closest('.panel'))) e.preventDefault();
  }, { passive: false });
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
    return { mx, my, ax, ay, fire: fireOn, w: G.myWeapon };
  }

  // ---------------------------------------------------------------------------
  // Dibujo
  // ---------------------------------------------------------------------------
  function drawWorld() {
    bg.draw();
    drawMapGeometry();
    for (const u of G.powerups) drawPowerup(u);
    if (G.enemies.length) {
      additive(() => { for (const e of G.enemies) glow(e.x, e.y, e.r * 3, ENEMY_COLOR[e.kind], 0.65); });
      for (const e of G.enemies) drawEnemy(e);
    }
    if (G.boss) { G.boss.draw(); G.boss.drawAbilities(); }
    for (const m of G.mines) drawMine(m);
    for (const m of G.missiles) drawMissile(m);
    if (G.bullets.length) {
      additive(() => { for (const b of G.bullets) glow(b.x, b.y, b.w === 2 ? 34 : b.w === 1 ? 11 : 18, b.w === 2 ? ORANGE : (b.c || CYAN), 0.9); });
      ctx.lineCap = 'round';
      for (const [wi, len, lw] of [[0, 12, 3], [1, 7, 2]]) { // pistola: raya de 12 px; ametralladora: más chica
        ctx.strokeStyle = rgb(WHITE); ctx.lineWidth = lw;
        ctx.beginPath();
        for (const b of G.bullets) {
          if ((b.w || 0) !== wi) continue;
          const [nx, ny] = norm(b.vx, b.vy);
          ctx.moveTo(b.x - nx * len, b.y - ny * len);
          ctx.lineTo(b.x, b.y);
        }
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
      for (const b of G.bullets) { // cohete del RPG
        if (b.w !== 2) continue;
        const [nx, ny] = norm(b.vx, b.vy);
        poly([[b.x + nx * 10, b.y + ny * 10], [b.x - nx * 8 - ny * 5, b.y - ny * 8 + nx * 5], [b.x - nx * 8 + ny * 5, b.y - ny * 8 - nx * 5]]);
        ctx.fillStyle = rgb(ORANGE); ctx.fill();
        ctx.strokeStyle = rgb(WHITE); ctx.lineWidth = 1.5; ctx.stroke();
      }
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
    if (G.state === 'play' || G.state === 'pause') {
      for (const p of G.players) {
        if (p.hp <= 0) continue;
        drawPlayer(p);
        text(p.away ? `${p.name} (ausente)` : p.name, p.x, p.y - 40, 13, p.color, { align: 'center', alpha: p.away ? 0.5 : 0.85 });
      }
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
    const multi = NET.mode !== 'solo';
    text(`SCORE  ${G.score}`, 16, 12, 22, WHITE, { bold: true, glow: 8 });
    // vidas como corazones (a la izquierda: arriba a la derecha están los botones de pausa/reinicio)
    const lives = p.lives === undefined ? START_LIVES : p.lives;
    for (let i = 0; i < MAX_LIVES; i++) drawHeart(24 + i * 24, 50, 9, i < lives);
    text(`OLA ${G.wave}   JEFES ${G.bossesDefeated}/${BOSS_TYPES.length}`, 16, 68, 15, DIM);
    let ty = 88;
    if (!G.boss && G.nextBossIdx < BOSS_TYPES.length && G.winTimer <= 0) {
      const falta = Math.max(0, BOSS_SCORES[G.nextBossIdx] - G.score);
      text(falta === 0 ? 'JEFE ENTRANDO...' : `PRÓXIMO JEFE EN ${falta} PTS`, 16, ty, 15, PINK);
      ty += 20;
    }
    if (multi) { // el equipo
      ty += 6;
      for (const q of G.players) {
        ctx.fillStyle = rgb(q.color); circle(22, ty + 7, 5); ctx.fill();
        const hearts = '♥'.repeat(Math.max(0, q.lives | 0));
        const st = q.out ? `FUERA · vuelve en ${Math.max(0, Math.ceil(q.respawn))} s` : q.hp > 0 ? hearts : `${hearts} · reapareciendo`;
        text(`${q.name}${q.id === NET.myId ? ' (vos)' : ''}  ${st}${q.away ? '  ausente' : ''}`, 32, ty, 13, q.hp > 0 ? q.color : DIM);
        ty += 18;
      }
      text(`SALA ${NET.code}${NET.mode === 'host' ? ' · sos el host' : ''}`, 16, ty + 2, 12, DIM, { alpha: 0.9 });
    }
    drawWeaponHud(p);
    let y = H - 56;
    if (p.hp > 0 && p.magnet > 0) { text(`IMÁN ${p.magnet.toFixed(1)}s`, W / 2, y, 15, CYAN, { align: 'center' }); y -= 20; }
    if (p.hp > 0 && p.rapid > 0) text(`DISPARO RÁPIDO ${p.rapid.toFixed(1)}s`, W / 2, y, 15, ORANGE, { align: 'center' });
    if (p.hp <= 0 && G.state === 'play') {
      const msg = p.out ? `${TXT.fueraCoop} (${Math.max(0, Math.ceil(p.respawn))} s)` : TXT.reaparece;
      text(msg, W / 2, H / 2 + 120, 20, WHITE, { align: 'center', base: 'middle', bold: true, glow: 8 });
    }
    if (G.boss) drawBossBar(G.boss);
    text(`${Math.round(G.fps)} FPS`, W - 12, H - 20, 13, G.fps >= 55 ? LIME : YELLOW, { align: 'right', alpha: 0.8 });
    if (G.banner.t > 0) {
      const k = clamp(G.banner.t / 0.4, 0, 1);
      text(G.banner.text, W / 2, 92, 28, G.banner.c, { align: 'center', base: 'middle', bold: true, alpha: k, glow: 12 });
    }
  }

  function drawHeart(x, y, s, full) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.9);
    ctx.bezierCurveTo(x - s * 1.4, y - s * 0.1, x - s * 0.7, y - s * 1.1, x, y - s * 0.35);
    ctx.bezierCurveTo(x + s * 0.7, y - s * 1.1, x + s * 1.4, y - s * 0.1, x, y + s * 0.9);
    if (full) {
      additive(() => glow(x, y, s * 2.6, MAGENTA, 0.5));
      ctx.fillStyle = rgb(MAGENTA); ctx.fill();
      ctx.strokeStyle = rgb(WHITE); ctx.lineWidth = 1; ctx.stroke();
    } else { ctx.strokeStyle = rgb(DIM, 0.6); ctx.lineWidth = 1.5; ctx.stroke(); }
  }
  // arma actual (abajo al medio) y, con el RPG, la barrita de recarga
  function drawWeaponHud(p) {
    const cur = myWeapon(), y = H - 24;
    const labels = TXT.arma.map((n, i) => `${i + 1} ${n}`);
    ctx.font = `bold 14px ${FONT}`;
    const ws = labels.map((l) => ctx.measureText(l).width + 18), total = ws.reduce((a, b) => a + b, 0);
    let x = W / 2 - total / 2;
    labels.forEach((l, i) => {
      const on = i === cur;
      if (on) { ctx.fillStyle = rgb(CYAN, 0.18); ctx.fillRect(x, y - 3, ws[i] - 6, 21); ctx.strokeStyle = rgb(CYAN); ctx.lineWidth = 1.5; ctx.strokeRect(x, y - 3, ws[i] - 6, 21); }
      text(l, x + (ws[i] - 6) / 2, y, 14, on ? WHITE : DIM, { align: 'center', bold: on, alpha: on ? 1 : 0.7 });
      x += ws[i];
    });
    G.hudWeapon = fmt(TXT.armaHud, { arma: TXT.arma[cur] }); // (lo leen los tests)
    if (cur === 2) { // barrita de recarga del RPG: llena = listo
      const full = p.rapid > 0 ? WEAPONS[2].cdRapid : WEAPONS[2].cd;
      const k = clamp(1 - (p.wcd ? p.wcd[2] : 0) / full, 0, 1);
      const bw = 120, bx = W / 2 - bw / 2, by = y - 12;
      ctx.fillStyle = 'rgba(25,20,40,0.9)'; ctx.fillRect(bx, by, bw, 6);
      ctx.fillStyle = rgb(k >= 1 ? LIME : ORANGE); ctx.fillRect(bx, by, bw * k, 6);
      if (k < 1) text(TXT.recargando, W / 2 + bw / 2 + 8, by - 4, 12, ORANGE, { alpha: 0.9 });
      G.hudRpg = k;
    } else G.hudRpg = -1;
  }

  function drawCrosshair() {
    if (G.state !== 'play' || !G.player || G.player.hp <= 0) return;
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

  // botón de arma: chico, arriba del botón de disparo (no lo tapa); cada toque cicla 1 → 2 → 3
  function weaponButton() {
    const m = 30 + STICK_R;
    return { x: view.w - m, y: view.h - m - 10 - STICK_R - 8 - 52, r: 30 };
  }
  function drawTouchControls() {
    if (G.state !== 'play' || !(input.hasTouch || input.mode === 'touch')) return;
    const m = 30 + STICK_R;
    drawStick(input.move, m, view.h - m - 10, CYAN, 'MOVER', !!input.move);
    drawStick(input.fire, view.w - m, view.h - m - 10, ORANGE, 'DISPARAR', !!input.fire);
    const b = weaponButton(), on = performance.now() - input.wTap < 150;
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = rgb(CYAN, on ? 0.45 : 0.15); circle(b.x, b.y, b.r); ctx.fill();
    ctx.strokeStyle = rgb(CYAN, 0.9); ctx.lineWidth = 2; ctx.stroke();
    text(TXT.armaBoton, b.x, b.y - 12, 10, CYAN, { align: 'center', base: 'middle', bold: true });
    text(`${myWeapon() + 1} ${['PIST', 'AMET', 'RPG'][myWeapon()]}`, b.x, b.y + 6, 12, WHITE, { align: 'center', base: 'middle', bold: true });
    ctx.globalAlpha = 1;
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
    if (inGame()) { drawHud(); drawCrosshair(); }
    ctx.strokeStyle = rgb(CYAN, 0.35); ctx.lineWidth = 2; ctx.strokeRect(0, 0, W, H);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawTouchControls();
  }

  // ---------------------------------------------------------------------------
  // Pantallas HTML (menú, sala, pausa, fin) y estados
  // ---------------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const nameInput = $('name'), codeInput = $('code');
  const menuEl = $('menu'), pauseEl = $('pause'), endEl = $('end'), hudBtns = $('hud-buttons');
  const lobbyEl = $('lobby'), busyEl = $('busy'), cmenuEl = $('cmenu'), toastEl = $('toast');
  nameInput.value = G.name === 'Jugador' ? '' : G.name;
  $('best').textContent = G.best;

  let toastTimer = 0;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 3200);
  }
  function menuError(msg) {
    const el = $('menu-msg');
    el.textContent = msg;
    el.classList.toggle('hidden', !msg);
  }
  function showMenuSection(which) {
    $('menu-main').classList.toggle('hidden', which !== 'main');
    $('menu-join').classList.toggle('hidden', which !== 'join');
    if (which !== 'join') $('invite').classList.add('hidden');
  }
  function saveName() {
    G.name = cleanName(nameInput.value);
    nameInput.value = G.name === 'Jugador' ? '' : G.name;
    lsSet(LS_NAME, G.name);
    nameInput.blur(); codeInput.blur();
  }
  function showBusy(msg) {
    $('busy-msg').textContent = msg;
    setState('busy');
  }
  function showLobby() {
    setState('lobby');
    renderLobby();
  }
  function renderLobby() {
    const host = NET.mode === 'host';
    $('lobby-code').textContent = NET.code;
    $('lobby-link').value = roomLink(NET.code);
    const ul = $('lobby-players');
    ul.textContent = '';
    for (const r of NET.roster) {
      const li = document.createElement('li');
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = rgb(PLAYER_COLORS[r.id % 4]);
      dot.style.boxShadow = `0 0 10px ${rgb(PLAYER_COLORS[r.id % 4])}`;
      const nm = document.createElement('span');
      nm.textContent = r.name;
      nm.style.color = rgb(PLAYER_COLORS[r.id % 4]);
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = [r.id === 0 ? 'host' : '', r.id === NET.myId ? 'vos' : ''].filter(Boolean).join(' · ');
      li.append(dot, nm, tag);
      ul.appendChild(li);
    }
    $('lobby-count').textContent = `Jugadores: ${NET.roster.length}/${MAX_PLAYERS}`;
    $('btn-start').classList.toggle('hidden', !host);
    $('lobby-status').textContent = host
      ? 'Pasales el código o el link a tus amigos. Cuando estén todos, tocá EMPEZAR.'
      : 'Esperando a que el host empiece la partida…';
    $('lobby-ipad-tip').classList.toggle('hidden', !(host && IS_IPAD));
    $('lobby-map').classList.toggle('hidden', !host);
    $('lobby-map-name').textContent = fmt(TXT.mapaElegido, { mapa: MAP.nombre }) + (host ? '' : ` · ${TXT.mapaLoEligeHost}`);
    renderMapPickers();
    $('btn-share').classList.toggle('hidden', !navigator.share);
  }

  function setState(s) {
    G.state = s;
    menuEl.classList.toggle('hidden', s !== 'menu');
    lobbyEl.classList.toggle('hidden', s !== 'lobby');
    busyEl.classList.toggle('hidden', s !== 'busy');
    pauseEl.classList.toggle('hidden', s !== 'pause');
    endEl.classList.add('hidden');
    cmenuEl.classList.add('hidden');
    hudBtns.classList.toggle('hidden', !(s === 'play' || s === 'pause'));
    $('btn-restart').classList.toggle('hidden', NET.mode === 'client');
    canvas.classList.toggle('playing-mouse', s === 'play');
    if (s !== 'play') releaseSticks();
    if (s === 'pause') {
      const mode = NET.mode;
      $('pause-msg').textContent = mode === 'host' ? 'Pausaste el juego para todos.'
        : mode === 'client' ? 'El host pausó el juego. Esperá a que lo siga.' : '';
      $('pause-msg').classList.toggle('hidden', mode === 'solo');
      $('btn-resume').classList.toggle('hidden', mode === 'client');
      $('btn-pause-restart').classList.toggle('hidden', mode === 'client');
      $('btn-pause-restart').textContent = mode === 'host' ? 'Reiniciar (todos)' : 'Reiniciar';
      $('btn-pause-menu').textContent = mode === 'host' ? 'Cerrar partida' : mode === 'client' ? 'Salir de la partida' : 'Menú';
    }
    if (s === 'over' || s === 'win') {
      if (G.score > G.best) { G.best = G.score; G.newRecord = true; lsSet(LS_BEST, G.best); }
      $('best').textContent = G.best;
      G.endTimer = s === 'win' ? 0.4 : 1.1; // deja ver la explosión antes del cartel
    }
    if (s === 'menu') $('best').textContent = G.best;
  }

  function showEnd() {
    const win = G.state === 'win', mode = NET.mode;
    $('end-title').textContent = win ? '¡GANASTE!' : 'GAME OVER';
    $('end-title').style.color = win ? rgb(YELLOW) : rgb(RED);
    const who = mode === 'solo' ? G.name : `Equipo: ${G.players.map((p) => p.name).join(', ')}`;
    $('end-stats').textContent = `${who} · Puntaje ${G.score} · Olas ${G.wave} · Jefes ${G.bossesDefeated}/${BOSS_TYPES.length}`;
    $('end-record').textContent = G.newRecord ? '¡Nuevo récord!' : `Récord: ${G.best}`;
    const overMsg = win ? '' : (G.overMsg || (G.players.length > 1 ? TXT.goCoop : TXT.goSolo));
    $('end-msg').textContent = [overMsg, mode === 'client' ? 'Esperando a que el host arranque otra partida…' : ''].filter(Boolean).join(' ');
    $('end-msg').classList.toggle('hidden', !$('end-msg').textContent);
    $('btn-retry').classList.toggle('hidden', mode === 'client');
    $('btn-retry').textContent = mode === 'host' ? 'JUGAR DE NUEVO' : 'REINTENTAR';
    $('btn-end-menu').textContent = mode === 'host' ? 'Cerrar partida' : mode === 'client' ? 'Salir de la partida' : 'Menú';
    endEl.classList.remove('hidden');
  }

  function startGame() { // modo solo (igual que antes)
    if (NET.mode !== 'solo') return;
    saveName();
    NET.myId = 0;
    initRound();
    setState('play');
  }
  function togglePause() {
    if (NET.mode === 'client') return;
    if (G.state === 'play') setState('pause');
    else if (G.state === 'pause') setState('play');
  }
  function toMenu() {
    if (NET.mode === 'solo') NET.myId = 0;
    useMap(prefMap()); // vuelve a mi mapa (en una sala ajena jugué el del host)
    renderMapPickers();
    initRound();
    setState('menu');
    showMenuSection('main');
  }
  function exitToMenu() { // salir desde cualquier pantalla (si hay partida online, la cierra o se va)
    if (NET.mode === 'client') { clientLeave(); return; }
    if (NET.mode === 'host') hostClose();
    toMenu();
  }
  function pausePressed() {
    if (NET.mode === 'client') {
      if (G.state === 'play') cmenuEl.classList.toggle('hidden');
    } else togglePause();
  }
  function restartPressed() {
    if (NET.mode === 'host') hostStart();
    else if (NET.mode === 'solo') startGame();
  }
  async function copyLink() {
    const link = roomLink(NET.code), inp = $('lobby-link');
    let ok = false;
    try { await navigator.clipboard.writeText(link); ok = true; } catch (e) { /* sin permiso */ }
    if (!ok) {
      try { inp.focus(); inp.select(); inp.setSelectionRange(0, 999); ok = document.execCommand('copy'); } catch (e) { /* nada */ }
      inp.blur();
    }
    toast(ok ? '¡Link copiado! Pegáselo a tus amigos.' : 'No se pudo copiar: mantené apretado el link y copialo.');
  }
  function shareLink() {
    if (!navigator.share) return;
    navigator.share({ title: 'Neon Dodge', text: `¡Sumate a mi partida de Neon Dodge! Código: ${NET.code}`, url: roomLink(NET.code) })
      .catch(() => { /* canceló */ });
  }
  function openJoin() {
    menuError('');
    showMenuSection('join');
    if (input.mode !== 'touch') setTimeout(() => codeInput.focus(), 50);
  }

  // selector de mapa (menú y sala del host)
  function renderMapPickers() {
    for (const box of [$('map-pick'), $('lobby-map')]) {
      if (!box) continue;
      if (!box.childElementCount) {
        MAPS.forEach((m, i) => {
          const b = document.createElement('button');
          b.type = 'button'; b.className = 'mapbtn'; b.dataset.map = m.id;
          b.innerHTML = `<b></b><small></small>`;
          b.firstChild.textContent = TXT.mapa[i] || m.nombre;
          b.lastChild.textContent = TXT.mapaDesc[i] || '';
          b.style.setProperty('--mc', rgb(m.principal));
          b.addEventListener('click', (e) => { e.preventDefault(); pickMap(m.id); });
          box.appendChild(b);
        });
      }
      for (const b of box.children) b.classList.toggle('on', b.dataset.map === MAP.id);
    }
  }
  function pickMap(id) {
    if (NET.mode === 'client') return; // en una sala lo elige el host
    useMap(id, true);
    renderMapPickers();
    if (NET.mode === 'host' && G.state === 'lobby') { hostRoster(); renderLobby(); }
  }
  renderMapPickers();
  $('menu-tip').textContent = choice(TXT.tips);

  const tap = (el, fn) => el.addEventListener('click', (e) => { e.preventDefault(); fn(); });
  tap($('btn-play'), () => { menuError(''); startGame(); });
  tap($('btn-host'), () => { menuError(''); hostCreate(); });
  tap($('btn-join'), openJoin);
  tap($('btn-join-go'), () => { menuError(''); clientJoin(codeInput.value); });
  tap($('btn-join-back'), () => { menuError(''); showMenuSection('main'); });
  tap($('btn-copy'), copyLink);
  tap($('btn-share'), shareLink);
  tap($('btn-start'), hostStart);
  tap($('btn-lobby-leave'), exitToMenu);
  tap($('btn-busy-cancel'), () => { destroyPeer(); NET.mode = 'solo'; NET.leaving = true; toMenu(); });
  tap($('btn-pause'), pausePressed);
  tap($('btn-restart'), restartPressed);
  tap($('btn-resume'), togglePause);
  tap($('btn-pause-restart'), restartPressed);
  tap($('btn-pause-menu'), exitToMenu);
  tap($('btn-retry'), restartPressed);
  tap($('btn-end-menu'), exitToMenu);
  tap($('btn-cmenu-resume'), () => cmenuEl.classList.add('hidden'));
  tap($('btn-cmenu-leave'), exitToMenu);
  nameInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (!$('menu-join').classList.contains('hidden')) clientJoin(codeInput.value);
    else startGame();
  });
  nameInput.addEventListener('change', () => lsSet(LS_NAME, cleanName(nameInput.value)));
  codeInput.addEventListener('input', () => {
    const v = cleanCode(codeInput.value);
    if (v !== codeInput.value) codeInput.value = v;
  });
  codeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); menuError(''); clientJoin(codeInput.value); }
  });

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    const c = e.code;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(c)) e.preventDefault();
    if (e.repeat) { input.keys.add(c); return; }
    input.keys.add(c);
    const st = G.state;
    if (c === 'KeyP' || c === 'Enter' || c === 'NumpadEnter' || c === 'Space') {
      if (st === 'play' || st === 'pause') pausePressed();
      else if (st === 'menu' && c !== 'Space' && $('menu-join').classList.contains('hidden')) startGame();
      else if ((st === 'over' || st === 'win') && !endEl.classList.contains('hidden') && NET.mode === 'solo') toMenu();
    } else if (c === 'KeyR' && inGame()) {
      restartPressed();
    } else if (/^(Digit|Numpad)[123]$/.test(c)) {
      switchWeapon(+c.slice(-1) - 1);
    } else if (c === 'KeyQ') {
      switchWeapon(myWeapon() + 1);
    } else if (c === 'Escape') {
      if (st === 'play') { if (NET.mode === 'client') pausePressed(); else setState('pause'); }
      else if (NET.mode === 'solo' && st !== 'menu') toMenu();
      else if (st === 'menu') showMenuSection('main');
    }
  });
  window.addEventListener('keyup', (e) => input.keys.delete(e.code));
  // rueda: un "clic" (o un gesto de trackpad, que manda muchos eventos seguidos) = un arma.
  // Un gesto nuevo empieza cuando pasan 150 ms sin eventos de rueda.
  window.addEventListener('wheel', (e) => {
    if (G.state !== 'play') return;
    e.preventDefault();
    const now = performance.now(), fresh = now - input.wheelT > 150;
    input.wheelT = now;
    if (!fresh || Math.abs(e.deltaY) < 1) return;
    switchWeapon(myWeapon() + (e.deltaY > 0 ? 1 : -1));
  }, { passive: false });
  window.addEventListener('blur', () => { input.keys.clear(); releaseSticks(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (G.state === 'play' && NET.mode !== 'client') setState('pause'); // pausa sola si cambian de app
      if (NET.mode === 'client') safeSend(NET.conn, { t: 'aw', v: 1 });
    } else onBackToApp();
  });
  window.addEventListener('pageshow', (e) => { if (e.persisted) onBackToApp(); });
  // volvió a la app/pestaña: reconectar al servidor de partidas y, si hace falta, al host (conexión nueva)
  function onBackToApp() {
    const peer = NET.peer;
    if (peer && peer.disconnected && !peer.destroyed) { try { peer.reconnect(); } catch (e) { /* nada */ } }
    if (NET.mode !== 'client') return;
    safeSend(NET.conn, { t: 'aw', v: 0 });
    if (G.state === 'busy') return;
    if (NET.needRejoin || !NET.conn || !NET.conn.open) { NET.needRejoin = false; clientLost(true); return; }
    NET.lastMsg = Math.max(NET.lastMsg, performance.now() - (DEAD_AFTER - 2500)); // 2,5 s de gracia
  }
  // con la pestaña oculta no hay requestAnimationFrame: igual avisamos que seguimos vivos
  setInterval(() => {
    if (!document.hidden) return;
    if (NET.mode === 'host') hostNetTick(1);
    else if (NET.mode === 'client') safeSend(NET.conn, { t: 'pg' });
  }, 1000);
  window.addEventListener('pagehide', () => {
    if (NET.mode === 'host') {
      for (const r of NET.roster) if (r.conn) safeSend(r.conn, { t: 'end' });
    } else if (NET.mode === 'client') {
      safeSend(NET.conn, { t: 'bye' });
    }
  });

  // ¿Vino con un link de invitación? (?sala=XXXXX)
  const salaParam = cleanCode(QS.get('sala'));
  if (QS.has('sala')) {
    QS.delete('sala');
    const rest = QS.toString();
    try { history.replaceState(null, '', location.pathname + (rest ? `?${rest}` : '') + location.hash); } catch (e) { /* nada */ }
  }

  // ---------------------------------------------------------------------------
  // Loop principal (requestAnimationFrame, ~60 fps)
  // ---------------------------------------------------------------------------
  let last = performance.now(), fpsAcc = 0, fpsFrames = 0, avgDt = 1 / 60, slowTime = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const w0 = performance.now();
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
    const realDt = Math.min(dt, 0.25);
    dt = Math.min(dt, 1 / 30);
    G.stats.frames++;

    bg.update(dt);
    if (NET.mode === 'client') {
      if (inGame()) { clientFrame(dt, readInput()); if (G.state === 'play') G.stats.playFrames++; }
      if ((G.state === 'over' || G.state === 'win') && G.endTimer > 0) { G.endTimer -= dt; if (G.endTimer <= 0) showEnd(); }
      clientNetTick(realDt);
    } else {
      if (NET.mode === 'host') NET.rec = inGame() && NET.roster.length > 1;
      if (G.state === 'play' && !G.frozen) { // (frozen: solo lo usan los tests para simular cuadro a cuadro)
        updatePlay(dt, readInput());
        updateFx(dt);
        G.stats.playFrames++;
      } else if (G.state === 'over' || G.state === 'win') {
        G.t0 = G.simTime; G.simTime += dt;
        updateFx(dt);
        if (G.endTimer > 0) { G.endTimer -= dt; if (G.endTimer <= 0) showEnd(); }
      }
      if (NET.mode === 'host') hostNetTick(realDt);
    }
    G.stats.maxParticles = Math.max(G.stats.maxParticles, G.particles.parts.length);
    G.stats.maxEnemyBullets = Math.max(G.stats.maxEnemyBullets, G.ebullets.length);
    render();
    const wk = performance.now() - w0; // costo de CPU del cuadro (simulación + dibujo), para medir rendimiento
    G.stats.workMs = (G.stats.workMs || wk) * 0.95 + wk * 0.05;
    if (G.state === 'play') G.stats.maxWorkMs = Math.max(G.stats.maxWorkMs || 0, wk);
  }
  setState('menu');
  if (salaParam) {
    codeInput.value = salaParam;
    showMenuSection('join');
    const inv = $('invite');
    inv.textContent = `Te invitaron a la sala ${salaParam}. Poné tu nombre y tocá ENTRAR.`;
    inv.classList.remove('hidden');
  }
  requestAnimationFrame(frame);

  // Ganchos para pruebas automáticas / consola (no afectan el juego normal)
  window.NeonDodge = {
    G, NET, C, view, startGame, startBoss, toMenu, togglePause, hostStart,
    setGod(v) { G.god = !!v; },
    get state() { return G.state; },
    get mode() { return NET.mode; },
    info() {
      return { mode: NET.mode, state: G.state, myId: NET.myId, code: NET.code, roster: NET.roster.map((r) => [r.id, r.name]),
        players: G.players.map((p) => ({ id: p.id, name: p.name, x: r1(p.x), y: r1(p.y), hp: p.hp, lives: p.lives, out: !!p.out,
          weapon: p.weapon, respawn: r1(p.respawn), invuln: r1(p.invuln), away: p.away })),
        map: MAP.id, myWeapon: G.myWeapon, hudWeapon: G.hudWeapon, hudRpg: G.hudRpg, mines: G.mines.length, missiles: G.missiles.length,
        ab: G.boss && G.boss.ab ? G.boss.ab.k : 0, waves: G.boss ? (G.boss.waves || []).length : 0, overMsg: G.overMsg,
        score: G.score, wave: G.wave, enemies: G.enemies.length, ebullets: G.ebullets.length, bullets: G.bullets.length,
        boss: G.boss ? { name: G.boss.name, hp: G.boss.hp, maxHp: G.boss.maxHp, state: G.boss.state } : null,
        fps: r1(G.fps), menuMsg: $('menu-msg').textContent, toast: toastEl.classList.contains('hidden') ? '' : toastEl.textContent };
    },
    debug: {
      damage(id) { const p = G.players.find((q) => q.id === id); if (p) { p.invuln = 0; damagePlayer(p); } },
      MAPS, WEAPONS, useMap, safeSpawn, forbidden, obstacleHit, rpgExplode, damagePlayer, switchWeapon, initRound, spawnWave,
      stepMove, makePlayer, setState, pushOut, freePoint, AB, WARN, BOSS_TYPES,
      K: { RING_SLOTS, RING_GAP, RING_SPEED, MINE_MAX, MINE_ORBIT, MINE_R, MINE_HP, MISSILE_SPEED, MISSILE_HOMING, MISSILE_HP, MISSILE_R,
        LASER_SWEEP, LASER_TIME, LASER_HALF, WAVE_SPEED, WAVE_HALF, WAVE_GAPS, WAVE_GAP_W, RPG_RADIUS, RPG_SPLASH, START_LIVES,
        RESPAWN_SHORT, RESPAWN_INVULN, RESPAWN_TIME, ENEMY_COUNT_MULT, SPAWN_RATE_MULT, MAX_ENEMIES, GLOBAL_CD, PROTO, TELE_DIST, TELE_MIN },
      // simula n cuadros de 1/60 s con controles fijos (para pruebas deterministas, con G.frozen = true)
      step(n, inp) {
        const p = G.player;
        for (let i = 0; i < n; i++) {
          const q = Object.assign({ mx: 0, my: 0, ax: p.x, ay: p.y - 100, fire: false, w: G.myWeapon }, inp || {});
          if (G.state !== 'play') break;
          updatePlay(1 / 60, q); updateFx(1 / 60);
        }
      },
      get MAP() { return MAP; },
      snapSize() { return JSON.stringify(buildSnap()).length; },
      killBoss() { if (G.boss) { G.boss.state = 'fight'; G.boss.hp = 0; onBossKilled(G.boss); } },
    },
  };
})();
