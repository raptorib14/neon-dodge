/*
 * Neon Dodge web · pantallas HANGAR y LOGROS + aviso «LOGRO DESBLOQUEADO» (DOM + <canvas> chicos).
 * Layout y arte del diseño del Hangar v5.1 (hangar-vector.json, via hangar-art.js). Táctil y mouse; también teclado.
 */
'use strict';
(function () {
  const H = window.NeonHangar, ART = window.NeonArt;
  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;
  const col = (k, f) => ART.css(ART.colorOf(f ? `${k}*${f}` : k));
  const TABS = ['armas', 'armaduras', 'mejoras', 'habilidades'];
  const TAB_NAMES = { armas: 'ARMAS', armaduras: 'ARMADURAS', mejoras: 'MEJORAS', habilidades: 'HABILIDADES' };
  const STAT_NAMES = { blindaje: 'BLINDAJE', velocidad: 'VELOCIDAD', dano: 'DAÑO', cadencia: 'CADENCIA' };
  const CAT_NAMES = { combate: 'combate', jefes: 'jefes', armas: 'armas', cooperativo: 'cooperativo', hangar: 'hangar', campania: 'campaña' };
  const NIVEL_NAMES = { bronce: 'bronce', plata: 'plata', oro: 'oro', secreto: 'secreto' };

  function create(opts) {
    const perfil = opts.perfil;
    const S = { tab: 'armaduras', sel: 0, open: null, from: 'menu', lgSel: 0, lgNew: new Set(), t: 0, raf: 0, msg: '', msgOk: true, hover: -1 };
    const el = { hg: $('hangar'), lg: $('logros') };

    // ------------------------------------------------------------------ canvas helpers
    function fitCanvas(c, w, h) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      c.style.width = `${w}px`; c.style.height = `${h}px`;
      const g = c.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      return g;
    }
    function octagon(g, cx, cy, size, cut) {
      const h = size / 2;
      g.beginPath();
      g.moveTo(cx - h + cut, cy - h); g.lineTo(cx + h - cut, cy - h); g.lineTo(cx + h, cy - h + cut); g.lineTo(cx + h, cy + h - cut);
      g.lineTo(cx + h - cut, cy + h); g.lineTo(cx - h + cut, cy + h); g.lineTo(cx - h, cy + h - cut); g.lineTo(cx - h, cy - h + cut); g.closePath();
    }
    const player = () => ART.colorOf('jugador');

    // ------------------------------------------------------------------ datos de las listas
    function items() {
      const d = perfil.data;
      if (S.tab === 'armas') {
        return H.WEAPON_IDS.map((w, i) => {
          const own = perfil.weaponUnlocked(w), eq = d.arma_inicial === w;
          return { kind: 'arma', id: w, idx: i, name: H.WEAPON_NAMES[i], desc: H.WEAPON_DESC[i], own, equipped: eq,
            cost: own ? 0 : H.LICENSE_COST[w], status: eq ? 'ARRANCÁS CON ESTA' : own ? 'desbloqueada' : `${H.LICENSE_COST[w]} ✦`, locked: !own };
        });
      }
      if (S.tab === 'armaduras') {
        return H.ARMOR_IDS.map((a) => {
          const own = d.armaduras.includes(a), eq = d.armadura === a, A = H.ARMORS[a];
          return { kind: 'armadura', id: a, name: A.nombre, desc: A.desc, own, equipped: eq, cost: own ? 0 : A.costo,
            status: eq ? 'EQUIPADA' : a === 'sin_armadura' ? 'de serie' : own ? 'comprada' : `${A.costo} ✦`, locked: false };
        });
      }
      if (S.tab === 'habilidades') { // v5.2: comprar equipa; con la equipada, el botón la desequipa
        return H.HAB_IDS.map((h) => {
          const A = H.HABILIDADES[h], own = (d.habilidades || []).includes(h), eq = d.habilidad === h;
          return { kind: 'hab', id: h, name: A.nombre, desc: A.desc, own, equipped: eq, cost: own ? 0 : A.costo, recarga: A.recarga,
            status: eq ? 'EQUIPADA · E' : own ? 'comprada' : `${A.costo} ✦`, locked: false };
        });
      }
      return H.MEJORAS.map((m) => {
        const lvl = perfil.level(m.id), mx = m.niveles.length, open = perfil.mejoraOpen(m);
        return { kind: 'mejora', id: m.id, name: m.nombre, desc: m.desc, lvl, max: mx, locked: !open.ok, why: open.why,
          cost: lvl < mx ? m.niveles[lvl].costo : 0, status: lvl >= mx ? 'MÁXIMO' : open.why || `${m.niveles[lvl].costo} ✦` };
      });
    }
    function previewLoadout(it) {
      const lo = perfil.loadout();
      if (!it) return lo;
      const out = { armadura: lo.armadura, mejoras: Object.assign({}, lo.mejoras), arma: lo.arma };
      if (it.kind === 'armadura') out.armadura = it.id;
      else if (it.kind === 'mejora' && it.lvl < it.max) out.mejoras[it.id] = it.lvl + 1;
      return out;
    }

    // ------------------------------------------------------------------ pantalla HANGAR
    const listEl = $('hg-list'), statsEl = $('hg-stats'), detailEl = $('hg-detail'), shipCv = $('hg-ship');
    const SHIP_W = 420, SHIP_H = 372;
    let shipCtx = null;

    function rowIcon(it, cv) {
      if (it.kind === 'hab') { // 44 px: el ícono de viernes (marco por tipo + glifo)
        const g2 = fitCanvas(cv, 44, 44);
        ART.drawAbilityIcon(g2, it.id, 22, 22, 44, 1, it.own ? 'lista' : 'bloqueada', S.t);
        return;
      }
      const g = fitCanvas(cv, 40, 40);
      const lock = it.locked ? 'tenue*0.7' : null;
      if (it.kind === 'arma') ART.drawLayers(g, ART.weapon[it.id], 20, 20, 15, 0, 0, { all: lock });
      else if (it.kind === 'mejora') ART.drawLayers(g, ART.mejora[it.id], 20, 20, 15, 0, 0, { all: lock });
      else ART.drawShip(g, 20, 22, 9, -Math.PI / 2, 0, player(), it.id === 'sin_armadura' ? null : it.id);
    }
    function renderList() {
      const its = items();
      if (S.sel >= its.length) S.sel = its.length - 1;
      listEl.textContent = '';
      its.forEach((it, i) => {
        const li = document.createElement('li');
        li.className = 'hg-row' + (i === S.sel ? ' sel' : '') + (it.locked ? ' locked' : '') + (it.equipped ? ' eq' : '');
        li.setAttribute('role', 'button'); li.tabIndex = 0;
        const cv = document.createElement('canvas'); cv.className = 'ic'; rowIcon(it, cv);
        const tx = document.createElement('div'); tx.className = 'tx';
        const nm = document.createElement('b'); nm.textContent = it.name;
        const st = document.createElement('small'); st.textContent = it.status;
        if (/✦/.test(it.status) && !it.locked) st.className = 'cost'; else if (it.locked && /✦/.test(it.status)) st.className = 'cost';
        if (it.equipped || it.status === 'MÁXIMO') st.className = 'ok';
        tx.append(nm, st);
        if (it.kind === 'mejora') { // pips de nivel
          const pips = document.createElement('div'); pips.className = 'pips';
          for (let k = 0; k < it.max; k++) { const p = document.createElement('i'); if (k < it.lvl) p.className = 'on'; pips.appendChild(p); }
          tx.appendChild(pips);
        }
        li.append(cv, tx);
        if (it.locked) { const lk = document.createElement('span'); lk.className = 'lock'; lk.textContent = '🔒'; li.appendChild(lk); }
        li.addEventListener('click', () => { S.sel = i; S.msg = ''; renderAll(); });
        listEl.appendChild(li);
      });
      document.querySelectorAll('#hangar .hg-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === S.tab));
    }
    function renderStats(it) {
      const cur = H.shipStats(perfil.loadout()), nw = H.shipStats(previewLoadout(it));
      statsEl.textContent = '';
      const h = document.createElement('h4'); h.textContent = 'NAVE'; statsEl.appendChild(h);
      for (const k of Object.keys(STAT_NAMES)) {
        const row = document.createElement('div'); row.className = 'bar';
        const lb = document.createElement('span'); lb.textContent = STAT_NAMES[k];
        const segs = document.createElement('div'); segs.className = 'segs';
        for (let i = 0; i < 5; i++) {
          const s = document.createElement('i');
          if (i < Math.min(cur[k], nw[k])) s.className = 'on';
          else if (i < nw[k]) s.className = 'up';
          else if (i < cur[k]) s.className = 'down';
          segs.appendChild(s);
        }
        row.append(lb, segs);
        statsEl.appendChild(row);
      }
      const lv = document.createElement('div'); lv.className = 'bar';
      const lb = document.createElement('span'); lb.textContent = 'VIDAS';
      const v = document.createElement('b'); v.className = 'lives';
      const e = H.loadoutEffects(perfil.loadout()), e2 = H.loadoutEffects(previewLoadout(it));
      v.textContent = '♥'.repeat(e.maxLives) + (e2.maxLives > e.maxLives ? ' → ' + e2.maxLives : '');
      lv.append(lb, v); statsEl.appendChild(lv);
    }
    function renderDetail(it) {
      detailEl.textContent = '';
      if (!it) return;
      const cv = document.createElement('canvas'); cv.className = 'big-ic'; rowIcon(it, cv);
      const h = document.createElement('h3'); h.textContent = it.name;
      const p = document.createElement('p'); p.className = 'desc'; p.textContent = it.desc;
      detailEl.append(cv, h, p);
      const lines = [];
      if (it.kind === 'armadura') {
        const A = H.ARMORS[it.id];
        if (A.ventaja && it.id !== 'sin_armadura') lines.push(['+ ' + A.ventaja, 'pro']);
        if (A.contra) lines.push(['− ' + A.contra, 'con']);
      } else if (it.kind === 'mejora') {
        const m = H.MEJORA_BY_ID[it.id];
        const fmt = (v) => (m.unidad === 'x' ? `×${v}` : m.unidad === 'grados' ? `${v}°` : m.unidad === 'px' ? `${v} px` : `+${v}`);
        const lvl = it.lvl;
        lines.push([`Nivel ${lvl}/${it.max}` + (lvl < it.max ? ` → ${fmt(m.niveles[lvl].valor)}` : ' (máximo)'), 'pro']);
        if (m.arma) lines.push([`Sirve con: ${H.WEAPON_NAMES[H.WEAPON_IDS.indexOf(m.arma)]}`, 'dim']);
      } else if (it.kind === 'hab') {
        lines.push([`Recarga: ${it.recarga} s · se usa con E (o el botón HAB en pantalla táctil).`, 'pro']);
        lines.push(['Una equipada a la vez. Solo para jugar solo y en la campaña (online no hay habilidades).', 'dim']);
      } else {
        lines.push([it.idx === 0 ? 'Siempre disponible.' : it.own ? 'Podés elegirla como arma inicial y mejorarla.' : 'Con la licencia podés mejorarla y arrancar con ella.', 'dim']);
        lines.push([it.idx < 3 ? 'En la partida: teclas 1 · 2 · 3 (o tocá la barra de armas).' : `Tecla ${it.idx + 1} (o tocá la barra de armas). Solo para jugar solo y en la campaña.`, 'dim']);
        if (H.ARMAS_NUEVAS_NIVEL[it.id] && !it.own && campLevelPlayable(H.ARMAS_NUEVAS_NIVEL[it.id])) lines.push([`También se gana terminando el nivel ${H.ARMAS_NUEVAS_NIVEL[it.id]} de la campaña.`, 'dim']);
      }
      for (const [t, c] of lines) { const l = document.createElement('p'); l.className = 'ln ' + c; l.textContent = t; detailEl.appendChild(l); }
      if (it.cost > 0) { const c = document.createElement('p'); c.className = 'price'; c.textContent = `${it.cost} ✦`; detailEl.appendChild(c); }
      const btn = document.createElement('button');
      btn.type = 'button'; btn.id = 'hg-action'; btn.className = 'big';
      const a = actionFor(it);
      btn.textContent = a.label; btn.disabled = !a.enabled;
      btn.addEventListener('click', (e) => { e.preventDefault(); act(); });
      detailEl.appendChild(btn);
      const msg = document.createElement('p'); msg.className = 'hg-msg ' + (S.msgOk ? 'ok' : 'bad'); msg.id = 'hg-msg'; msg.textContent = S.msg;
      detailEl.appendChild(msg);
    }
    function campLevelPlayable(id) { // solo se menciona el nivel que regala el arma si ese acto ya se juega en la web
      const CD = window.NeonCampaniaData;
      return !!(CD && CD.actos && CD.actos.some((ac) => !ac.proximamente && (ac.niveles || []).some((l) => l.id === id)));
    }
    function actionFor(it) {
      const L = perfil.data.luces;
      if (!perfil.active) return { label: 'SIN PERFIL', enabled: false };
      if (it.kind === 'arma') {
        if (it.own) return it.equipped ? { label: 'ARRANCÁS CON ESTA', enabled: false } : { label: 'ARRANCAR CON ESTA', enabled: true };
        return { label: `COMPRAR LICENCIA · ${it.cost} ✦`, enabled: L >= it.cost };
      }
      if (it.kind === 'armadura') {
        if (it.equipped) return { label: 'EQUIPADA', enabled: false };
        if (it.own) return { label: 'EQUIPAR', enabled: true };
        return { label: `COMPRAR Y EQUIPAR · ${it.cost} ✦`, enabled: L >= it.cost };
      }
      if (it.kind === 'hab') {
        if (it.equipped) return { label: 'DESEQUIPAR', enabled: true };
        if (it.own) return { label: 'EQUIPAR', enabled: true };
        return { label: `COMPRAR Y EQUIPAR · ${it.cost} ✦`, enabled: L >= it.cost };
      }
      if (it.locked) return { label: it.why.toUpperCase(), enabled: false };
      if (it.lvl >= it.max) return { label: 'MÁXIMO', enabled: false };
      return { label: `COMPRAR · ${it.cost} ✦`, enabled: L >= it.cost };
    }
    function act() {
      const it = items()[S.sel];
      if (!it) return;
      let r = { ok: false, msg: '' };
      if (it.kind === 'arma') {
        if (it.own) { perfil.setStartWeapon(it.id); r = { ok: true, msg: `Arrancás con: ${it.name}` }; }
        else r = perfil.buyLicense(it.id);
      } else if (it.kind === 'armadura') {
        if (it.own) { perfil.equipArmor(it.id); r = { ok: true, msg: `Equipada: ${it.name}` }; }
        else { r = perfil.buyArmor(it.id); if (r.ok) perfil.equipArmor(it.id); }
      } else if (it.kind === 'hab') {
        if (it.own) { const was = it.equipped; perfil.equipHab(it.id); r = { ok: true, msg: was ? `Sin habilidad equipada` : `Equipada: ${it.name} (E)` }; }
        else r = perfil.buyHab(it.id);
      } else r = perfil.buyMejora(it.id);
      S.msg = r.msg || ''; S.msgOk = !!r.ok;
      renderAll();
    }

    function renderLuces() {
      $('hg-luces').textContent = `${perfil.data.luces} ✦`;
      $('lg-luces').textContent = `${perfil.count()}/${H.LOGRO_IDS.length}`;
      const w = $('hg-warn');
      const msg = perfil.warning || (perfil.memoryOnly ? 'Este navegador no deja guardar (modo privado): el progreso no queda al cerrar.' : '');
      w.textContent = msg; w.classList.toggle('hidden', !msg);
    }
    function renderAll() {
      const its = items(), it = its[S.sel];
      renderLuces(); renderList(); renderStats(it); renderDetail(it);
    }

    // nave central con los 4 slots (3 armas + armadura), dibujada en canvas como el diseño
    const SLOTS = [
      { type: 'arma', i: 0, x: 80, y: 40, key: '1 · PISTOLA' }, { type: 'arma', i: 1, x: 62, y: 166, key: '2 · AMETRALL.' },
      { type: 'arma', i: 2, x: 80, y: 292, key: '3 · RPG' }, { type: 'armadura', i: 0, x: 352, y: 166, key: 'ARMADURA' },
    ];
    function slotSelected(s) {
      if (s.type === 'arma') return S.tab === 'armas' && S.sel === s.i;
      return S.tab === 'armaduras' && items()[S.sel] && items()[S.sel].kind === 'armadura';
    }
    function drawShipScene() {
      if (!shipCtx) return;
      const g = shipCtx, cx = SHIP_W / 2, cy = 166, t = S.t, pc = player();
      g.clearRect(0, 0, SHIP_W, SHIP_H);
      const gl = g.createRadialGradient(cx, cy, 0, cx, cy, 150);
      gl.addColorStop(0, ART.css(pc, 0.4)); gl.addColorStop(1, ART.css(pc, 0));
      g.fillStyle = gl; g.beginPath(); g.arc(cx, cy, 150, 0, TAU); g.fill();
      g.lineWidth = 1;
      for (let k = 0; k < 2; k++) { // plataforma: 2 anillos que giran despacio
        g.strokeStyle = ART.css(pc, 0.25); g.beginPath(); g.arc(cx, cy, 120 - k * 14, 0, TAU); g.stroke();
        g.save(); g.translate(cx, cy); g.rotate(t * 0.25 * (k ? -1 : 1));
        g.beginPath(); for (let i = 0; i < 12; i++) { const a = i * TAU / 12; g.moveTo(Math.cos(a) * (120 - k * 14), Math.sin(a) * (120 - k * 14)); g.lineTo(Math.cos(a) * (126 - k * 14), Math.sin(a) * (126 - k * 14)); }
        g.stroke(); g.restore();
      }
      const lo = perfil.loadout();
      const it = items()[S.sel];
      const show = previewLoadout(it);
      ART.drawShip(g, cx, cy, 70, -Math.PI / 2, t, pc, show.armadura === 'sin_armadura' ? null : show.armadura);
      for (const s of SLOTS) { // slots
        const sel = slotSelected(s), hov = S.hover === SLOTS.indexOf(s);
        let locked = false, icon = null, eq = false;
        if (s.type === 'arma') { const w = H.WEAPON_IDS[s.i]; locked = !perfil.weaponUnlocked(w); eq = perfil.data.arma_inicial === w; icon = ART.weapon[w]; }
        else { eq = lo.armadura !== 'sin_armadura'; }
        g.setLineDash([6, 5]); g.strokeStyle = sel ? ART.css(pc) : ART.css(pc, 0.35);
        g.beginPath(); g.moveTo(s.x + (s.x < cx ? 36 : -36), s.y); g.lineTo(cx + (s.x < cx ? -30 : 30), cy + (s.y - cy) * 0.35); g.stroke(); g.setLineDash([]);
        const pulse = sel ? 1 + 0.04 * Math.sin(TAU * 1.5 * t) : 1;
        if (sel) { const gg = g.createRadialGradient(s.x, s.y, 10, s.x, s.y, 60); gg.addColorStop(0, ART.css(pc, 0.5)); gg.addColorStop(1, ART.css(pc, 0)); g.fillStyle = gg; g.beginPath(); g.arc(s.x, s.y, 60, 0, TAU); g.fill(); }
        octagon(g, s.x, s.y, 72 * pulse, 18);
        g.fillStyle = sel ? '#20385a' : locked ? 'rgba(18,26,48,0.5)' : '#121a30';
        g.fill();
        g.strokeStyle = sel ? ART.css(pc) : hov ? 'rgba(240,248,255,0.85)' : locked ? 'rgba(60,72,100,0.7)' : eq ? ART.css(ART.colorOf('jugador*0.8')) : '#3c4864';
        g.lineWidth = sel ? 3 : 2; g.stroke();
        if (locked) ART.drawLayers(g, [{ tipo: 'arco', centro: [0, -0.12], radio: 0.22, desde_grados: 180, hasta_grados: 360, trazo: 'tenue', ancho: 3 },
          { tipo: 'poligono', puntos: [[-0.32, -0.1], [0.32, -0.1], [0.32, 0.38], [-0.32, 0.38]], relleno: 'tenue*0.3', trazo: 'tenue', ancho: 2 }], s.x, s.y, 36, 0, 0, { alpha: 0.6 });
        else if (icon) ART.drawLayers(g, icon, s.x, s.y, 20, 0, t, {});
        else ART.drawShip(g, s.x, s.y + 2, 11, -Math.PI / 2, t, pc, lo.armadura === 'sin_armadura' ? null : lo.armadura);
        g.font = '12px ui-monospace, Menlo, Consolas, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = '#788cb4'; g.fillText(s.key, s.x, s.y + 50);
        if (locked) { g.fillStyle = 'rgba(255,220,60,0.9)'; g.fillText(`${H.LICENSE_COST[H.WEAPON_IDS[s.i]]} ✦`, s.x, s.y + 64); }
      }
    }
    function slotAt(ev) {
      const r = shipCv.getBoundingClientRect(), x = (ev.clientX - r.left) * SHIP_W / r.width, y = (ev.clientY - r.top) * SHIP_H / r.height;
      return SLOTS.findIndex((s) => Math.abs(x - s.x) < 38 && Math.abs(y - s.y) < 38);
    }
    shipCv.addEventListener('click', (e) => {
      const i = slotAt(e);
      if (i < 0) return;
      const s = SLOTS[i];
      S.tab = s.type === 'arma' ? 'armas' : 'armaduras';
      S.sel = s.type === 'arma' ? s.i : Math.max(0, H.ARMOR_IDS.indexOf(perfil.data.armadura));
      S.msg = ''; renderAll();
    });
    shipCv.addEventListener('pointermove', (e) => { S.hover = slotAt(e); });
    shipCv.addEventListener('pointerleave', () => { S.hover = -1; });

    let lastT = 0;
    function loop(now) {
      if (S.open !== 'hangar' && S.open !== 'logros') { S.raf = 0; return; }
      S.raf = requestAnimationFrame(loop);
      S.t += Math.min(0.05, (now - lastT) / 1000 || 0); lastT = now;
      if (S.open === 'hangar') drawShipScene();
      else drawLogrosAnim();
    }
    function startLoop() { if (!S.raf) { lastT = performance.now(); S.raf = requestAnimationFrame(loop); } }

    // ------------------------------------------------------------------ pantalla LOGROS
    const gridEl = $('lg-grid'), lgDetail = $('lg-detail');
    let lgCanvases = [];
    function renderLogros() {
      gridEl.textContent = '';
      lgCanvases = [];
      H.LOGRO_IDS.forEach((id, i) => {
        const L = H.LOGROS[id], got = !!perfil.data.logros[id], isNew = S.lgNew.has(id);
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'lg-cell' + (got ? ' got' : ' off') + (i === S.lgSel ? ' sel' : '');
        b.dataset.id = id;
        const cv = document.createElement('canvas');
        b.appendChild(cv);
        const nm = document.createElement('span');
        nm.textContent = got || !L.secreto ? L.nombre : '???';
        b.appendChild(nm);
        b.addEventListener('click', () => { S.lgSel = i; renderLogros(); });
        gridEl.appendChild(b);
        const g = fitCanvas(cv, 84, 84);
        lgCanvases.push({ g, id, state: got ? (isNew ? 'new' : 'on') : 'off' });
        ART.drawAchievement(g, id, 42, 42, 30, got ? (isNew ? 'new' : 'on') : 'off', S.t);
      });
      const id = H.LOGRO_IDS[S.lgSel], L = H.LOGROS[id], got = !!perfil.data.logros[id];
      lgDetail.textContent = '';
      const n = document.createElement('b'); n.textContent = got || !L.secreto ? L.nombre : '???';
      const d = document.createElement('span');
      const tipo = L.secreto && !got ? 'Logro secreto' : L.desc;
      d.textContent = `${tipo}  ·  ${CAT_NAMES[L.cat]} · ${NIVEL_NAMES[L.nivel]} · +${L.premio} ✦` + (got ? `  ·  ${perfil.data.logros[id]}` : '');
      lgDetail.append(n, d);
      $('lg-luces').textContent = `${perfil.count()}/${H.LOGRO_IDS.length}`;
    }
    function drawLogrosAnim() { // el brillo de los «nuevos» late
      for (const c of lgCanvases) {
        if (c.state !== 'new') continue;
        c.g.clearRect(0, 0, 84, 84);
        ART.drawAchievement(c.g, c.id, 42, 42, 30, 'new', S.t);
      }
    }

    // ------------------------------------------------------------------ abrir / cerrar
    function show(which, from) {
      S.open = which;
      if (from) S.from = from;
      el.hg.classList.toggle('hidden', which !== 'hangar');
      el.lg.classList.toggle('hidden', which !== 'logros');
      if (which === 'hangar') {
        if (!shipCtx) shipCtx = fitCanvas(shipCv, SHIP_W, SHIP_H);
        S.msg = '';
        renderAll(); drawShipScene(); startLoop();
      } else if (which === 'logros') {
        S.lgNew = new Set(perfil.data.logros_nuevos);
        perfil.markLogrosSeen();
        renderLogros(); startLoop();
      }
      layout();
    }
    function hide() {
      if (S.code) codeClose();
      S.open = null;
      el.hg.classList.add('hidden'); el.lg.classList.add('hidden');
      layout();
    }
    // VOLVER: desde LOGROS vuelve al Hangar si se vino de ahí; desde el HANGAR, al menú
    function back() {
      if (S.open === 'logros' && S.from === 'hangar') { opts.onShow('hangar'); return; }
      opts.onClose();
    }
    $('hg-back').addEventListener('click', (e) => { e.preventDefault(); back(); });
    $('lg-back').addEventListener('click', (e) => { e.preventDefault(); back(); });
    $('hg-logros').addEventListener('click', (e) => { e.preventDefault(); S.from = 'hangar'; opts.onShow('logros', 'hangar'); });
    document.querySelectorAll('#hangar .hg-tabs button').forEach((b) => b.addEventListener('click', (e) => {
      e.preventDefault(); S.tab = b.dataset.tab; S.sel = 0; S.msg = ''; renderAll();
    }));

    // ---- caja CÓDIGO (input real: en celu/iPad sale el teclado) ----
    const codeEl = $('hg-code'), codeIn = $('hg-code-input'), codeMsg = $('hg-code-msg');
    function codeOpen() {
      if (S.open !== 'hangar') return;
      S.code = true; codeEl.classList.remove('hidden');
      codeIn.value = '';
      const off = !perfil.active;
      codeMsg.textContent = off ? 'Sin perfil (?perfil=off): los códigos no hacen nada.' : ''; codeMsg.className = 'hg-msg ' + (off ? 'bad' : '');
      setTimeout(() => { try { codeIn.focus(); } catch (e) { /* nada */ } }, 0);
    }
    function codeClose() { S.code = false; codeEl.classList.add('hidden'); try { codeIn.blur(); } catch (e) { /* nada */ } }
    function codeSubmit() {
      const r = perfil.canjearCodigo(codeIn.value);
      codeMsg.textContent = r.msg; codeMsg.className = 'hg-msg ' + (r.ok ? 'ok' : 'bad');
      if (r.ok) { codeIn.value = ''; renderAll(); }
      return r;
    }
    $('hg-code-btn').addEventListener('click', (e) => { e.preventDefault(); codeOpen(); });
    $('hg-code-cancel').addEventListener('click', (e) => { e.preventDefault(); codeClose(); });
    $('hg-code-form').addEventListener('submit', (e) => { e.preventDefault(); codeSubmit(); });
    codeEl.addEventListener('click', (e) => { if (e.target === codeEl) codeClose(); });
    codeIn.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); codeClose(); } });

    function key(e) { // devuelve true si lo usó
      if (!S.open) return false;
      const c = e.code;
      if (S.code) { // con la caja abierta, las teclas son para escribir (solo Esc la cierra; Enter lo maneja el formulario)
        if (c === 'Escape') { codeClose(); return true; }
        return false;
      }
      if (S.open === 'hangar') {
        const n = items().length;
        if (c === 'ArrowDown') S.sel = (S.sel + 1) % n;
        else if (c === 'ArrowUp') S.sel = (S.sel + n - 1) % n;
        else if (c === 'Tab') { S.tab = TABS[(TABS.indexOf(S.tab) + (e.shiftKey ? TABS.length - 1 : 1)) % TABS.length]; S.sel = 0; }
        else if (c === 'ArrowLeft' || c === 'ArrowRight') { // mueve entre los slots de arma (1·2·3) y la armadura
          if (S.tab !== 'armas') { S.tab = 'armas'; S.sel = 0; } else if (c === 'ArrowRight' && S.sel === 2) { S.tab = 'armaduras'; S.sel = 0; } else S.sel = (S.sel + (c === 'ArrowRight' ? 1 : 2)) % 3;
        } else if (c === 'Enter' || c === 'NumpadEnter') { act(); return true; }
        else if (c === 'KeyL') { opts.onShow('logros', 'hangar'); return true; }
        else if (c === 'KeyC') { codeOpen(); return true; }
        else if (c === 'Escape') { back(); return true; }
        else return true;
        S.msg = ''; renderAll();
        const row = listEl.children[S.sel]; if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
        return true;
      }
      if (S.open === 'logros') {
        const n = H.LOGRO_IDS.length, cols = Math.max(1, Math.round(gridEl.clientWidth / 110)) || 5;
        if (c === 'ArrowRight') S.lgSel = (S.lgSel + 1) % n;
        else if (c === 'ArrowLeft') S.lgSel = (S.lgSel + n - 1) % n;
        else if (c === 'ArrowDown') S.lgSel = Math.min(n - 1, S.lgSel + cols);
        else if (c === 'ArrowUp') S.lgSel = Math.max(0, S.lgSel - cols);
        else if (c === 'Escape' || c === 'Enter' || c === 'NumpadEnter') { back(); return true; }
        else return true;
        renderLogros();
        return true;
      }
      return false;
    }

    // ------------------------------------------------------------------ aviso «LOGRO DESBLOQUEADO»
    const toastsEl = $('ach-toasts');
    const queue = []; let showing = false;
    let lastView = null;
    function layout(view) { // el aviso va arriba a la derecha de la ARENA (rect 640,76,296,64 del diseño); con el Hangar/Logros abiertos, arriba al centro (no tapa las Luces)
      if (view) lastView = view;
      view = lastView;
      if (!view) return;
      const s = view.scale, inScreen = S.open;
      toastsEl.style.left = `${view.ox + (inScreen ? (960 - 296) / 2 : 640) * s}px`;
      toastsEl.style.top = `${view.oy + (inScreen ? 2 : 76) * s}px`;
      toastsEl.style.transform = `scale(${s})`;
    }
    function pushToast(id) {
      if (queue.length >= 3) return; // cola máxima 3 (los logros se guardan igual)
      queue.push(id);
      if (!showing) next();
    }
    function next() {
      const id = queue.shift();
      if (!id) { showing = false; return; }
      showing = true;
      const L = H.LOGROS[id], ni = L.nivel;
      const box = document.createElement('div');
      box.className = 'ach-toast ' + ni;
      box.style.setProperty('--ac', col(ni === 'secreto' ? 'logro_secreto' : `logro_${ni}`));
      const cv = document.createElement('canvas'); box.appendChild(cv);
      const g = fitCanvas(cv, 48, 48);
      ART.drawAchievement(g, id, 24, 24, 18, 'new', 0);
      const tx = document.createElement('div'); tx.className = 'tx';
      const t1 = document.createElement('small'); t1.textContent = 'LOGRO DESBLOQUEADO';
      const t2 = document.createElement('b'); t2.textContent = L.nombre;
      tx.append(t1, t2); box.appendChild(tx);
      const shine = document.createElement('i'); shine.className = 'shine'; box.appendChild(shine);
      toastsEl.appendChild(box);
      setTimeout(() => box.remove(), 3650);
      setTimeout(next, 3650 + 300);
    }

    renderLuces();
    return { show, hide, key, pushToast, layout, renderAll, items, act, codeOpen, codeClose, codeSubmit, state: S, get open() { return S.open; } };
  }

  window.NeonHangarUI = { create };
})();
