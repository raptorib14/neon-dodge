/*
 * Neon Dodge web · Hangar, perfil y logros (lógica pura, sin DOM: se prueba también con node).
 * Port del Hangar v5.1 de la compu (diseño: DISENO-HANGAR.md) adaptado a lo que la web tiene de verdad:
 * 3 armas, 5 vidas, 3 jefes, power-ups, solo + cooperativo. La web NO tiene campaña ni Impulso, así que
 * quedan afuera lo que dependía de eso (ver README-hangar-web.md).
 * Perfil: localStorage 'neonDodge.perfil' (si el navegador no deja guardar, el perfil vive en memoria).
 */
'use strict';
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NeonHangar = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const WEAPON_IDS = ['pistola', 'ametralladora', 'rpg'];
  const WEAPON_NAMES = ['Pistola', 'Ametralladora', 'RPG'];
  const WEAPON_DESC = ['La de siempre. Precisa y confiable.', 'Muchas balas rápidas. ¡Barré todo!', 'Cohete lento que explota en área.'];
  const LICENSE_COST = { ametralladora: 60, rpg: 120 };
  const LIVES_BASE = 5, LIVES_EXTRA_MAX = 2;      // tope: 5 + 2 = 7 vidas
  const ROUND_LUCES_MAX = 150;
  const MG_SPREAD_DEG = 6, RPG_RADIUS = 90;       // valores base de la web (game.js)
  const STORAGE_KEY = 'neonDodge.perfil';

  // Mejoras que la web puede aplicar (10 de las 14 de la compu; las 4 que dependen de campaña/Impulso quedan afuera).
  // Mismos ids, niveles, costos y valores que la compu.
  const MEJORAS = [
    { id: 'pistola_dano', nombre: 'Cañón afilado', desc: 'La pistola hace más daño.', arma: 'pistola', unidad: 'x', base: 1,
      niveles: [{ costo: 65, valor: 1.34 }, { costo: 145, valor: 1.5 }] },
    { id: 'pistola_cadencia', nombre: 'Gatillo liviano', desc: 'La pistola recarga más rápido.', arma: 'pistola', unidad: 'x', base: 1,
      niveles: [{ costo: 60, valor: 0.92 }, { costo: 130, valor: 0.85 }] },
    { id: 'ametralladora_precision', nombre: 'Mira fina', desc: 'La ametralladora dispersa menos (6° → 3°).', arma: 'ametralladora', unidad: 'grados', base: MG_SPREAD_DEG,
      niveles: [{ costo: 80, valor: 3.0 }] },
    { id: 'ametralladora_dano', nombre: 'Balas pesadas', desc: 'La ametralladora hace más daño.', arma: 'ametralladora', unidad: 'x', base: 1,
      niveles: [{ costo: 70, valor: 1.12 }, { costo: 150, valor: 1.25 }] },
    { id: 'ametralladora_cadencia', nombre: 'Cinta rápida', desc: 'La ametralladora tira más seguido.', arma: 'ametralladora', unidad: 'x', base: 1,
      niveles: [{ costo: 70, valor: 0.92 }, { costo: 150, valor: 0.85 }] },
    { id: 'rpg_dano', nombre: 'Carga doble', desc: 'El cohete del RPG pega más fuerte a los enemigos.', arma: 'rpg', unidad: 'x', base: 1,
      niveles: [{ costo: 90, valor: 1.15 }, { costo: 180, valor: 1.3 }] },
    { id: 'rpg_cadencia', nombre: 'Recarga exprés', desc: 'El RPG recarga más rápido.', arma: 'rpg', unidad: 'x', base: 1,
      niveles: [{ costo: 90, valor: 0.9 }, { costo: 180, valor: 0.8 }] },
    { id: 'rpg_radio', nombre: 'Cohete grande', desc: 'La explosión del RPG es más grande (90 → 105 → 120 px).', arma: 'rpg', unidad: 'px', base: RPG_RADIUS,
      niveles: [{ costo: 90, valor: 105 }, { costo: 170, valor: 120 }] },
    { id: 'iman', nombre: 'Imán grande', desc: 'Los power-ups se te acercan desde más lejos.', unidad: 'x', base: 1,
      niveles: [{ costo: 50, valor: 1.5 }] },
    { id: 'vidas_extra', nombre: 'Corazón de repuesto', desc: 'Arrancás con más vidas (tope 7).', unidad: 'vidas', base: 0,
      niveles: [{ costo: 120, valor: 1 }, { costo: 240, valor: 2 }] },
  ];
  const MEJORA_BY_ID = {};
  for (const m of MEJORAS) MEJORA_BY_ID[m.id] = m;

  // Armaduras (mismos números que la compu). En la web no hay Impulso: se aplican velocidad, escudo, power-ups,
  // cadencia y la invulnerabilidad al reaparecer. 'web' dice qué parte vale en la web.
  const ARMORS = {
    sin_armadura: { nombre: 'Chispa de serie', desc: 'La nave tal cual sale del hangar.', costo: 0, vel: 1, escudo_s: 0, pu: 1, cad: 1, reaparece: 2,
      ventaja: 'La nave tal cual sale del hangar.', contra: '', barras: {} },
    prisma: { nombre: 'Armadura Prisma', desc: 'Placas de cristal y un escudo frontal. Aguanta un golpe más.', costo: 120, vel: 1, escudo_s: 30, pu: 1, cad: 1, reaparece: 2,
      ventaja: 'Escudo: absorbe 1 golpe, recarga en 30 s.', contra: 'La recarga es lenta.', barras: { blindaje: 1 } },
    halcon: { nombre: 'Alas Halcón', desc: 'Aletas largas y dos estelas. Más rápida, igual de frágil.', costo: 150, vel: 1.15, escudo_s: 0, pu: 1, cad: 1, reaparece: 1.2,
      ventaja: 'Velocidad +15 %.', contra: 'Al reaparecer, 1,2 s de invulnerabilidad (no 2).', barras: { velocidad: 1, blindaje: -1 } },
    coraza: { nombre: 'Coraza de Ceibo', desc: 'Placas gruesas en las alas y la nariz. Aguanta dos golpes, pero pesa.', costo: 220, vel: 0.85, escudo_s: 15, pu: 1, cad: 1, reaparece: 2,
      ventaja: 'Absorbe 1 golpe cada 15 s.', contra: 'Velocidad −15 %.', barras: { blindaje: 2, velocidad: -1 } },
    lumen: { nombre: 'Núcleo Lumen', desc: 'Un anillo dorado alrededor de la cabina. Los power-ups duran más.', costo: 300, vel: 1, escudo_s: 0, pu: 1.5, cad: 1.1, reaparece: 2,
      ventaja: 'Los power-ups (imán y disparo rápido) duran +50 %.', contra: 'Cadencia −10 % (dispara un poco más lento).', barras: { cadencia: -1 } },
  };
  const ARMOR_IDS = Object.keys(ARMORS);

  // Logros que la web puede dar (15 de los 27 de la compu). Quedan afuera: los 10 de acto de la campaña, «Luz para todos»,
  // «Esquiva neón» (usa el Impulso) y el logro secreto de la campaña.
  const LOGRO_PREMIO = { bronce: 15, plata: 30, oro: 60, secreto: 40 };
  const LOGROS = {
    primera_chispa: { nombre: 'Primera chispa', desc: 'Apagá tu primer enemigo.', nivel: 'bronce', cat: 'combate' },
    cien_apagados: { nombre: 'Cien apagados', desc: 'Apagá 100 enemigos (sumando todas las partidas).', nivel: 'plata', cat: 'combate' },
    intocable: { nombre: 'Intocable', desc: 'Llegá a 220 puntos sin perder una vida.', nivel: 'oro', cat: 'combate' },
    guardian_caido: { nombre: 'Guardián caído', desc: 'Derrotá al WARDEN.', nivel: 'bronce', cat: 'jefes' },
    ojo_cerrado: { nombre: 'Ojo cerrado', desc: 'Derrotá al SEEKER.', nivel: 'plata', cat: 'jefes' },
    gigante_en_el_suelo: { nombre: 'Gigante en el suelo', desc: 'Derrotá al TITAN y ganá la partida.', nivel: 'oro', cat: 'jefes' },
    arsenal: { nombre: 'Arsenal completo', desc: 'Disparà con las 3 armas en una misma partida.', nivel: 'bronce', cat: 'armas' },
    cohetero: { nombre: 'Cohetero', desc: 'Apagá 100 enemigos con el RPG.', nivel: 'plata', cat: 'armas' },
    escuadron: { nombre: 'Escuadrón', desc: 'Ganá una partida en cooperativo.', nivel: 'plata', cat: 'cooperativo' },
    nadie_se_queda: { nombre: 'Nadie se queda', desc: 'Seguí vivo mientras revive un compañero (cooperativo).', nivel: 'bronce', cat: 'cooperativo' },
    primera_mejora: { nombre: 'Manos de Mecha', desc: 'Comprá tu primera mejora en el Hangar.', nivel: 'bronce', cat: 'hangar' },
    todo_al_maximo: { nombre: 'Todo al máximo', desc: 'Subí las 10 mejoras al máximo.', nivel: 'oro', cat: 'hangar' },
    vestida_para_la_guerra: { nombre: 'Vestida para la guerra', desc: 'Jugá una partida con cada una de las 4 armaduras.', nivel: 'plata', cat: 'hangar' },
    secreto_1: { nombre: 'Tres de un saque', desc: 'Apagá 3 enemigos con un solo cohete.', nivel: 'secreto', cat: 'combate', secreto: true },
    secreto_2: { nombre: 'Ni un rasguño', desc: 'Derrotá a un jefe sin que te toque durante la pelea.', nivel: 'secreto', cat: 'jefes', secreto: true },
  };
  const LOGRO_IDS = Object.keys(LOGROS);
  for (const id of LOGRO_IDS) LOGROS[id].premio = LOGRO_PREMIO[LOGROS[id].nivel];
  // lo que un host puede avisarle a un cliente (el resto el cliente lo calcula solo; nunca se acepta «todo_al_maximo» por la red)
  const REMOTE_LOGROS = ['intocable', 'guardian_caido', 'ojo_cerrado', 'gigante_en_el_suelo', 'arsenal', 'escuadron', 'nadie_se_queda', 'secreto_1', 'secreto_2'];

  const num = (v, def, lo, hi) => {
    v = Number(v);
    if (!Number.isFinite(v)) v = def;
    return Math.min(hi, Math.max(lo, v));
  };

  function mejoraValue(id, lvl) {
    const m = MEJORA_BY_ID[id];
    if (!m) return 0;
    return lvl > 0 && lvl <= m.niveles.length ? m.niveles[lvl - 1].valor : m.base;
  }


  // ---- Códigos secretos de Luces ✦ (como la compu): solo hashes sha256("<sal>" + CÓDIGO normalizado), una vez por perfil.
  // Solo suman a la billetera local: no tocan la red ni el protocolo.
  const CODIGO_SAL = 'neon-dodge-luces-v1:', CODIGO_MAX_LEN = 16;
  const CODIGOS_LUCES = {
    d9f94c8fb5fbedfd5bd1970e7f1b101c834d8fb95783504e407369e910e553d4: ['Primera chispa', 50],
    '7098ab235da5cd71a20758f3dc5fc5ba4c00ac38d242849442114ed3f8410957': ['Órbita baja', 100],
    '99541fb8adba92950890f90f52feade2010e84431d6ebf4e24eee116abe2aecd': ['Escuadrón Halcón', 250],
    '8f79dbe8e78d097133c7662b48c45324c361993f6ee4b7b1d9a7fbc2a054805d': ['Luz de la Grieta', 500],
    '0d712422e58a25650fdf22639b1726a8fdbcbb0827e9283b7461385f4aeffb82': ['Taller de Mecha', 1000],
  };
  function codigoNorm(t) { return String(t == null ? '' : t).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODIGO_MAX_LEN); }
  // SHA-256 en JS puro (sincrónico; anda también por http:// en la red local, donde crypto.subtle no existe)
  function sha256(str) {
    const b = unescape(encodeURIComponent(str)), K = [], Hh = [];
    let n = 2, c = 0;
    const isP = (x) => { for (let d = 2; d * d <= x; d++) if (x % d === 0) return false; return true; };
    const fr = (x) => ((x - Math.floor(x)) * 4294967296) | 0;
    while (c < 64) { if (isP(n)) { if (c < 8) Hh[c] = fr(Math.pow(n, 1 / 2)); K[c++] = fr(Math.pow(n, 1 / 3)); } n++; }
    const bytes = []; for (let i = 0; i < b.length; i++) bytes.push(b.charCodeAt(i));
    const bl = bytes.length * 8; bytes.push(0x80); while (bytes.length % 64 !== 56) bytes.push(0);
    for (let i = 7; i >= 0; i--) bytes.push(i >= 4 ? 0 : (bl >>> (i * 8)) & 255);
    const r = (x, k) => (x >>> k) | (x << (32 - k)), w = new Array(64);
    for (let o = 0; o < bytes.length; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = (bytes[o + 4 * i] << 24) | (bytes[o + 4 * i + 1] << 16) | (bytes[o + 4 * i + 2] << 8) | bytes[o + 4 * i + 3];
      for (let i = 16; i < 64; i++) {
        const s0 = r(w[i - 15], 7) ^ r(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = r(w[i - 2], 17) ^ r(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      let [a, bb, cc, d, e, f, g, h] = Hh;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & bb) ^ (a & cc) ^ (bb & cc))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = cc; cc = bb; bb = a; a = (t1 + t2) | 0;
      }
      Hh[0] = (Hh[0] + a) | 0; Hh[1] = (Hh[1] + bb) | 0; Hh[2] = (Hh[2] + cc) | 0; Hh[3] = (Hh[3] + d) | 0;
      Hh[4] = (Hh[4] + e) | 0; Hh[5] = (Hh[5] + f) | 0; Hh[6] = (Hh[6] + g) | 0; Hh[7] = (Hh[7] + h) | 0;
    }
    return Hh.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
  }
  function codigoHash(t) { return sha256(CODIGO_SAL + codigoNorm(t)); }

  function perfilNew() {
    return { version: 1, luces: 0, mejoras: {}, licencias: [], armaduras: ['sin_armadura'], armadura: 'sin_armadura', arma_inicial: 'pistola',
      logros: {}, logros_nuevos: [], contadores: { apagados: 0, apagados_rpg: 0 }, armaduras_usadas: [], luces_ganadas_total: 0, codigos: [] };
  }

  // Lo desconocido se ignora, lo que falta se completa, los números se acotan (igual que la compu).
  function perfilSanitize(d) {
    if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
    const out = perfilNew();
    out.luces = Math.floor(num(d.luces, 0, 0, 1e7));
    out.luces_ganadas_total = Math.floor(num(d.luces_ganadas_total, 0, 0, 1e9));
    if (d.mejoras && typeof d.mejoras === 'object') {
      for (const m of MEJORAS) if (m.id in d.mejoras) { const l = Math.floor(num(d.mejoras[m.id], 0, 0, m.niveles.length)); if (l) out.mejoras[m.id] = l; }
    }
    const list = (v, allowed, base) => (Array.isArray(v) ? [...new Set(v.map(String).filter((x) => allowed.includes(x)).concat(base))].sort() : base.slice());
    out.licencias = list(d.licencias, WEAPON_IDS.slice(1), []);
    out.armaduras = list(d.armaduras, ARMOR_IDS, ['sin_armadura']);
    out.armaduras_usadas = list(d.armaduras_usadas, ARMOR_IDS.slice(1), []);
    const a = String(d.armadura || 'sin_armadura');
    out.armadura = out.armaduras.includes(a) ? a : 'sin_armadura';
    const w = String(d.arma_inicial || 'pistola');
    out.arma_inicial = w === 'pistola' || out.licencias.includes(w) ? w : 'pistola'; // una arma sin licencia no puede ser la inicial
    if (d.logros && typeof d.logros === 'object') {
      for (const k of Object.keys(d.logros)) if (LOGRO_IDS.includes(k)) out.logros[k] = String(d.logros[k]).slice(0, 32);
    }
    if (Array.isArray(d.logros_nuevos)) out.logros_nuevos = d.logros_nuevos.map(String).filter((x) => x in out.logros);
    if (d.contadores && typeof d.contadores === 'object') {
      for (const k of Object.keys(out.contadores)) out.contadores[k] = Math.floor(num(d.contadores[k], 0, 0, 1e9));
    }
    if (Array.isArray(d.codigos)) out.codigos = [...new Set(d.codigos.map(String).filter((h) => h in CODIGOS_LUCES))]; // perfiles viejos: sin campo = []
    return out;
  }

  // Validación del host (y del propio cliente): armadura conocida, mejoras conocidas y acotadas, arma 0..2.
  // Con un loadout vacío todo da exactamente lo de la web sin Hangar.
  function loadoutSanitize(lo) {
    const out = { armadura: 'sin_armadura', mejoras: {}, arma: 0 };
    if (!lo || typeof lo !== 'object') return out;
    const a = String(lo.armadura || lo.a || '');
    out.armadura = ARMORS[a] ? a : 'sin_armadura';
    const mj = lo.mejoras || lo.m;
    if (mj && typeof mj === 'object') {
      for (const m of MEJORAS) if (m.id in mj) { const l = Math.floor(num(mj[m.id], 0, 0, m.niveles.length)); if (l) out.mejoras[m.id] = l; }
    }
    out.arma = Math.floor(num(lo.arma !== undefined ? lo.arma : lo.w, 0, 0, WEAPON_IDS.length - 1));
    return out;
  }

  // Números de juego de un loadout ya validado.
  function loadoutEffects(lo) {
    lo = loadoutSanitize(lo);
    const arm = ARMORS[lo.armadura];
    const v = (id) => mejoraValue(id, lo.mejoras[id] || 0);
    return {
      armadura: lo.armadura, arma: lo.arma,
      dmg: [v('pistola_dano') || 1, v('ametralladora_dano') || 1, v('rpg_dano') || 1],
      cdm: [v('pistola_cadencia') * arm.cad, v('ametralladora_cadencia') * arm.cad, v('rpg_cadencia') * arm.cad],
      mgSpread: v('ametralladora_precision') || MG_SPREAD_DEG,
      rpgRadius: v('rpg_radio') || RPG_RADIUS,
      pickup: v('iman') || 1,
      extraLives: Math.min(LIVES_EXTRA_MAX, Math.floor(v('vidas_extra'))),
      maxLives: LIVES_BASE + Math.min(LIVES_EXTRA_MAX, Math.floor(v('vidas_extra'))),
      speed: arm.vel, shieldS: arm.escudo_s, pu: arm.pu, respawnInv: arm.reaparece,
    };
  }

  // Barras NAVE del Hangar (0..5), igual que la compu salvo que no hay barra de Impulso.
  function shipStats(lo) {
    lo = loadoutSanitize(lo);
    const L = (k) => lo.mejoras[k] || 0, bar = ARMORS[lo.armadura].barras;
    const st = {
      blindaje: 1 + (bar.blindaje || 0) + (L('vidas_extra') >= 2 ? 1 : 0),
      velocidad: 3 + (bar.velocidad || 0),
      dano: 2 + Math.floor((L('pistola_dano') + L('ametralladora_dano') + L('rpg_dano') + 1) / 2),
      cadencia: 3 + Math.floor((L('pistola_cadencia') + L('ametralladora_cadencia') + L('rpg_cadencia') + 1) / 3) + (bar.cadencia || 0),
    };
    for (const k of Object.keys(st)) st[k] = Math.min(5, Math.max(0, st[k]));
    return st;
  }

  // Luces al terminar una partida: puntaje/10 + 10 por jefe + 25 si ganaron, tope 150.
  function roundLuces(score, bosses, win) {
    return Math.floor(Math.min(ROUND_LUCES_MAX, Math.max(0, Math.floor((score | 0) / 10) + 10 * (bosses | 0) + (win ? 25 : 0))));
  }

  // ---- Perfil ----------------------------------------------------------------------------------
  // storage = { getItem(k), setItem(k, v) } (localStorage o uno en memoria). active=false: sin efectos ni guardado.
  function createPerfil(storage, opts) {
    opts = opts || {};
    const P = {
      active: opts.active !== false, data: perfilNew(), warning: '', saveFailed: false, memoryOnly: false, onUnlock: null,
    };
    function stamp() {
      const d = new Date(), p = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    }
    function backupDamaged(raw) {
      P.data = perfilNew();
      P.warning = 'No se pudo leer el perfil del Hangar; se guardó una copia y arrancás de cero.';
      try { storage.setItem(`${STORAGE_KEY}.bak-${Date.now()}`, String(raw).slice(0, 20000)); } catch (e) { /* nada */ }
    }
    P.save = function () {
      if (!P.active) return false;
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(P.data));
        return true;
      } catch (e) {
        P.saveFailed = true;
        P.warning = 'Este navegador no deja guardar: se juega igual, pero el progreso del Hangar no queda al cerrar.';
        return false;
      }
    };
    P.load = function () {
      if (!P.active) return;
      let raw = null;
      try { raw = storage.getItem(STORAGE_KEY); } catch (e) { P.memoryOnly = true; return; }
      if (raw === null || raw === undefined) {
        try { storage.setItem(STORAGE_KEY + '.test', '1'); storage.removeItem && storage.removeItem(STORAGE_KEY + '.test'); } catch (e) { P.memoryOnly = true; }
        return;
      }
      let d = null;
      try { d = JSON.parse(raw); } catch (e) { d = null; }
      const ok = perfilSanitize(d);
      if (!ok) { backupDamaged(raw); return; }
      P.data = ok;
    };
    P.level = (id) => (P.active ? (P.data.mejoras[id] | 0) : 0);
    P.weaponUnlocked = (w) => w === 'pistola' || P.data.licencias.includes(w);
    P.mejoraOpen = function (m) {
      if (m.arma && !P.weaponUnlocked(m.arma)) return { ok: false, why: `Necesita ${WEAPON_NAMES[WEAPON_IDS.indexOf(m.arma)]}` };
      return { ok: true, why: '' };
    };
    P.loadout = function () {
      if (!P.active) return loadoutSanitize({});
      const d = P.data;
      return loadoutSanitize({ armadura: d.armadura, mejoras: d.mejoras, arma: WEAPON_IDS.indexOf(d.arma_inicial) });
    };
    // ---- compras ----
    function pay(cost) {
      if (!P.active) return { ok: false, msg: 'Sin perfil: el Hangar no hace nada.' };
      if (P.data.luces < cost) return { ok: false, msg: `Te faltan ${cost - P.data.luces} ✦` };
      P.data.luces -= cost;
      return { ok: true };
    }
    P.buyMejora = function (id) {
      const m = MEJORA_BY_ID[id];
      if (!m) return { ok: false, msg: 'Mejora desconocida.' };
      const lvl = P.level(id);
      if (lvl >= m.niveles.length) return { ok: false, msg: 'Ya está al máximo.' };
      const open = P.mejoraOpen(m);
      if (!open.ok) return { ok: false, msg: open.why };
      const r = pay(m.niveles[lvl].costo);
      if (!r.ok) return r;
      P.data.mejoras[id] = lvl + 1;
      P.checkHangarLogros();
      P.save();
      return { ok: true, msg: `${m.nombre}: nivel ${lvl + 1}` };
    };
    P.buyLicense = function (w) {
      if (!LICENSE_COST[w]) return { ok: false, msg: 'Esa arma ya es tuya.' };
      if (P.weaponUnlocked(w)) return { ok: false, msg: 'Ya tenés la licencia.' };
      const r = pay(LICENSE_COST[w]);
      if (!r.ok) return r;
      P.data.licencias = [...new Set(P.data.licencias.concat(w))].sort();
      P.save();
      return { ok: true, msg: `Licencia: ${WEAPON_NAMES[WEAPON_IDS.indexOf(w)]}` };
    };
    P.buyArmor = function (a) {
      if (!ARMORS[a] || a === 'sin_armadura') return { ok: false, msg: 'Armadura desconocida.' };
      if (P.data.armaduras.includes(a)) return { ok: false, msg: 'Ya la tenés.' };
      const r = pay(ARMORS[a].costo);
      if (!r.ok) return r;
      P.data.armaduras = [...new Set(P.data.armaduras.concat(a))].sort();
      P.save();
      return { ok: true, msg: `Compraste ${ARMORS[a].nombre}` };
    };
    P.equipArmor = function (a) {
      if (!P.active || !P.data.armaduras.includes(a)) return false;
      P.data.armadura = a;
      P.save();
      return true;
    };
    P.setStartWeapon = function (w) {
      if (!P.active || !WEAPON_IDS.includes(w) || !P.weaponUnlocked(w)) return false;
      P.data.arma_inicial = w;
      P.save();
      return true;
    };
    // ---- logros ----
    P.unlock = function (id) {
      if (!P.active || !LOGROS[id] || P.data.logros[id]) return false;
      P.data.logros[id] = stamp();
      P.data.logros_nuevos.push(id);
      P.data.luces = Math.min(1e7, P.data.luces + LOGROS[id].premio);
      P.data.luces_ganadas_total += LOGROS[id].premio;
      P.save();
      if (P.onUnlock) P.onUnlock(id);
      return true;
    };
    P.event = function (kind, n) {
      if (!P.active) return;
      n = Math.max(1, Math.min(100, n | 0 || 1));
      const c = P.data.contadores;
      if (typeof kind === 'string' && kind.startsWith('logro:')) P.unlock(kind.slice(6));
      else if (kind === 'kill') { c.apagados += n; P.unlock('primera_chispa'); if (c.apagados >= 100) P.unlock('cien_apagados'); P.save(); }
      else if (kind === 'kill_rpg') { c.apagados_rpg += n; if (c.apagados_rpg >= 100) P.unlock('cohetero'); P.save(); }
    };
    // eventos que manda el host por la red: solo los de la lista blanca (no puede regalar logros del Hangar)
    P.remoteEvent = function (kind, n) {
      if (kind === 'kill' || kind === 'kill_rpg') return P.event(kind, n);
      if (typeof kind === 'string' && kind.startsWith('logro:') && REMOTE_LOGROS.includes(kind.slice(6))) return P.event(kind, 1);
      return undefined;
    };
    P.checkHangarLogros = function () {
      const d = P.data;
      if (Object.keys(d.mejoras).length) P.unlock('primera_mejora');
      if (MEJORAS.every((m) => (d.mejoras[m.id] | 0) >= m.niveles.length)) P.unlock('todo_al_maximo');
      if (ARMOR_IDS.slice(1).every((a) => d.armaduras_usadas.includes(a))) P.unlock('vestida_para_la_guerra');
    };
    P.armorUsed = function () {
      const a = P.data.armadura;
      if (P.active && a !== 'sin_armadura' && !P.data.armaduras_usadas.includes(a)) {
        P.data.armaduras_usadas.push(a);
        P.checkHangarLogros();
        P.save();
      }
    };
    P.awardRound = function (gain) {
      if (!P.active || gain <= 0) return;
      P.data.luces = Math.min(1e7, P.data.luces + gain);
      P.data.luces_ganadas_total += gain;
      P.save();
    };
    P.markLogrosSeen = function () { if (P.data.logros_nuevos.length) { P.data.logros_nuevos = []; P.save(); } };
    P.count = () => Object.keys(P.data.logros).length;
    // canjear un código secreto (mismos mensajes que la compu)
    P.canjearCodigo = function (text) {
      if (!P.active) return { ok: false, msg: 'Sin perfil (?perfil=off): los códigos no hacen nada.' };
      const code = codigoNorm(text);
      if (!code) return { ok: false, msg: 'Escribí un código.' };
      const h = codigoHash(code), info = CODIGOS_LUCES[h];
      if (!info) return { ok: false, msg: 'Código inválido.' };
      if (P.data.codigos.includes(h)) return { ok: false, msg: `Ese código ya lo canjeaste (${info[0]}).` };
      P.data.codigos.push(h);
      P.data.luces = Math.min(1e7, P.data.luces + info[1]);
      if (!P.save()) return { ok: true, msg: `¡Código canjeado: ${info[0]}! +${info[1]} ✦ (no se pudo guardar el perfil)` };
      return { ok: true, msg: `¡Código canjeado: ${info[0]}! +${info[1]} ✦` };
    };
    P.load();
    return P;
  }

  return {
    WEAPON_IDS, WEAPON_NAMES, WEAPON_DESC, LICENSE_COST, LIVES_BASE, LIVES_EXTRA_MAX, ROUND_LUCES_MAX, MG_SPREAD_DEG, RPG_RADIUS, STORAGE_KEY,
    MEJORAS, MEJORA_BY_ID, ARMORS, ARMOR_IDS, LOGROS, LOGRO_IDS, LOGRO_PREMIO, REMOTE_LOGROS,
    mejoraValue, perfilNew, perfilSanitize, loadoutSanitize, loadoutEffects, shipStats, roundLuces, createPerfil,
    CODIGO_MAX_LEN, codigoNorm, codigoHash, sha256,
  };
});
