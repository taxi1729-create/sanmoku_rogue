// 投射ミニゲーム「投射チャレンジ」
// ThrowGame.open({floor}) -> Promise<{win, reward:{gold, special}, summary}>
// カード8枚（デッキのコピー）を引き、威力×sin(2θ)/sin(120°) m 飛ばして 10m→30m→50m の目標を順に達成する。
// （角度60°なら飛距離＝威力ちょうど。45°で最大 約1.155×威力）
// 報酬（段階制）：10m→特別アップグレード / 30m→+5G / 50m→+5G / 各目標を±0.5m以内で達成（ピッタリ）→その都度+5G
// 最大：特別アップグレード＋25G
// 威力＝カードの実効基礎点（強化効果・性質変化・パッシブ効果込み）。最大3枚まで合わせて投げられる（威力を合計）。
// 報酬の付与は呼び出し側で行う（ここでは表示のみ）。
const _seThrow=(n,o)=>{ try{ if(typeof SFX!=='undefined') SFX.play(n,o); }catch(e){} };
const ThrowGame = {
  TARGETS: [10, 30, 50],
  TARGET_GOLD: [0, 5, 5],   // 各目標達成時のG（10mは特別アップグレード）
  PITTA_GOLD: 5,
  PITTA_TOL: 0.5,
  SIN120: Math.sin(120 * Math.PI / 180),
  MAX_SELECT: 3,
  FIELD_MAX: 64,          // フィールド表示上の最大距離(m)
  PX_PER_M: 5,            // SVG座標系での 1m あたりの px
  ORIGIN_X: 18,
  GROUND_Y: 176,
  VIEW_W: 360,
  VIEW_H: 200,

  open(opts) {
    const floor = (opts && opts.floor) || 1;
    return new Promise(resolve => {
      this._resolve = resolve;
      this._floor = floor;
      _seThrow('open');
      this._build();
    });
  },

  distanceFor(base, deg) {
    return Math.max(0, base * Math.sin(2 * deg * Math.PI / 180) / this.SIN120);
  },

  // カード1枚の威力：本編のビンゴ時のカード基礎点計算（perCellScore）に合わせる。
  // 盤面・ビンゴ文脈に依存する効果（ハブ・連鎖・肥大化・巨大化・ミニマム/マキシマム等）は対象外。
  // 数値強化・同記号マルチ・トップスピード・エクステンド・竜頭蛇尾の即時加算は baseScore に含まれている。
  effectivePower(card) {
    if (!card) return 0;
    const GS = (typeof GameState !== 'undefined') ? GameState : null;
    const GD = (typeof GameData !== 'undefined') ? GameData : null;
    let v = Number(card.baseScore) || 0;
    try {
      if (card._passiveScoreAdd) v += Number(card._passiveScoreAdd) || 0;
      if (GD && GD.bourgeoisBonus) v += GD.bourgeoisBonus(card) || 0;   // ブルジョワ：現在G×4（シカクP2で×8）
      if (GD && GD.weightedBonus) v += GD.weightedBonus(card) || 0;     // 加重：デッキ内の同記号枚数×1（シカクP2で×2）
      if (GS && card.symbol === 'Triangle' && GS.symbolPassiveTier && GS.symbolPassiveTier.Triangle >= 1) {
        const deck = GS.currentDeck || [];
        const total = deck.length || 1;
        const n = deck.filter(c => c && c.symbol === 'Triangle').length / total;
        v *= (1 + n) * (GS.star ? GS.star() : 1);                       // サンカク・レシオ ×(1+n)×STAR
      }
      if (GS && card.trait === 'レリック特攻' && GS.relicCount) v += 10 * GS.relicCount(); // 基礎点+10n
    } catch (e) { /* 失敗時は素の基礎点 */ }
    return Math.max(0, Math.round(v));
  },

  // 現在の獲得報酬
  _reward() {
    const special = this.targetIdx >= 1 ? 1 : 0;
    let gold = 0;
    for (let i = 0; i < this.targetIdx; i++) gold += this.TARGET_GOLD[i];
    gold += this.pitta.filter(Boolean).length * this.PITTA_GOLD;
    if (!special) gold = 0;
    return { gold, special };
  },

  _rewardText(rw) {
    rw = rw || this._reward();
    if (!rw.special) return '報酬なし';
    return '特別アップグレード' + (rw.gold ? `＋${rw.gold}G` : '');
  },

  _reduced() {
    try { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  },

  _drawCards() {
    const deck = (typeof GameState !== 'undefined' && Array.isArray(GameState.currentDeck)) ? GameState.currentDeck : [];
    const pool = deck.map(c => {
      let copy;
      try { copy = JSON.parse(JSON.stringify(c)); } catch (e) { copy = Object.assign({}, c); }
      return copy;
    });
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, 8).map((c, i) => ({ card: c, base: Number(c.baseScore) || 0, power: this.effectivePower(c), used: false, idx: i }));
  },

  _cardInner(card) {
    try {
      if (typeof GameMainScene !== 'undefined' && GameMainScene.cardTagsHtml) {
        const gold = (typeof GameState !== 'undefined') ? GameState.gold : 0;
        return GameMainScene.cardTagsHtml(card) + GameMainScene.cardSymbolHtml(card) + GameMainScene.cardScoreHtml(card, gold);
      }
    } catch (e) { /* fall through */ }
    return `<div class="tg-simple-card"><span>${card.symbol || '?'}</span><b>${card.baseScore || 0}</b></div>`;
  },

  _build() {
    this.hand = this._drawCards();
    this.targetIdx = 0;
    this.sel = [];
    this.angle = 45;
    this.busy = false;
    this.done = false;
    this.win = false;
    this.quit = false;
    this.pitta = [false, false, false];

    const ov = document.createElement('div');
    ov.className = 'tg-overlay';
    ov.innerHTML = `
      <div class="tg-panel tg-intro">
        <div class="tg-title">投射チャレンジ</div>
        <div class="tg-rules">
          <p>デッキからランダムに<b>8枚</b>のカードを引きます。</p>
          <p>カードの<b>威力</b>が飛距離のもとになります。<br>威力には<b>強化効果・性質変化・パッシブ効果</b>も反映されます。<br>角度は<b>0°〜90°</b>で選べます。</p>
          <p class="tg-ex">例：威力10・角度60° → <b>10m</b></p>
          <p><b>最大3枚</b>まで合わせて投げられる（威力を合計）。</p>
          <p>投げたカードは使い切り。<br><b>10m → 30m → 50m</b> の旗に順番に届かせよう。</p>
        </div>
        <table class="tg-rtable">
          <tr><th>10m達成</th><td>特別アップグレード</td></tr>
          <tr><th>30m達成</th><td>＋5G</td></tr>
          <tr><th>50m達成</th><td>＋5G</td></tr>
          <tr class="tg-rt-pitta"><th>ピッタリ</th><td>各目標を<b>±0.5m以内</b>で達成するとその都度＋5G</td></tr>
          <tr class="tg-rt-max"><th>最大</th><td>特別アップグレード＋25G</td></tr>
        </table>
        <button class="tg-btn tg-start">はじめる</button>
      </div>`;
    document.body.appendChild(ov);
    this.ov = ov;
    this._prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ov.querySelector('.tg-start').addEventListener('click', () => { _seThrow('confirm', {suppressTap:true}); this._renderPlay(); });
  },

  _fx(m) { return this.ORIGIN_X + Math.min(m, this.FIELD_MAX) * this.PX_PER_M; },

  _fieldSvg() {
    const W = this.VIEW_W, H = this.VIEW_H, G = this.GROUND_Y;
    let ticks = '';
    for (let m = 0; m <= 60; m += 10) {
      const x = this._fx(m);
      ticks += `<line x1="${x}" y1="${G}" x2="${x}" y2="${G + 5}" class="tg-tick"/><text x="${x}" y="${G + 16}" class="tg-tick-t">${m}</text>`;
    }
    let flags = '';
    this.TARGETS.forEach((t, i) => {
      const x = this._fx(t);
      flags += `<g class="tg-flag" data-i="${i}" transform="translate(${x},${G})">
        <line x1="0" y1="0" x2="0" y2="-150" class="tg-tline"/>
        <g class="tg-flag-pop"><line x1="0" y1="0" x2="0" y2="-34" class="tg-pole"/><path d="M0,-34 L18,-28 L0,-21 Z" class="tg-cloth"/></g>
        <text x="0" y="-40" class="tg-flag-t">${t}m</text></g>`;
    });
    return `<svg class="tg-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
      <rect x="0" y="${G}" width="${W}" height="${H - G}" class="tg-ground"/>
      <line x1="0" y1="${G}" x2="${W}" y2="${G}" class="tg-gline"/>
      ${ticks}${flags}
      <g class="tg-marks"></g>
      <g class="tg-pred" style="display:none"><path class="tg-pred-arc" d=""/><g class="tg-pred-mark"><circle r="4" class="tg-pred-dot"/><text y="-8" class="tg-pred-t"></text></g></g>
      <polyline class="tg-trail" points=""/>
      <g class="tg-launcher" transform="translate(${this.ORIGIN_X},${G})">
        <circle r="7" class="tg-base"/>
        <g class="tg-arm"><line x1="0" y1="0" x2="30" y2="0" class="tg-armline"/><path d="M30,0 l-6,-4 l0,8 z" class="tg-armhead"/></g>
      </g>
      <g class="tg-proj" style="display:none"><rect x="-4" y="-6" width="8" height="12" rx="1.5" class="tg-projrect"/></g>
      <g class="tg-sparks"></g>
    </svg>`;
  },

  _renderPlay() {
    const ov = this.ov;
    ov.innerHTML = `
      <div class="tg-play">
        <div class="tg-head">
          <div class="tg-title sm">投射チャレンジ</div>
          <div class="tg-prog"></div>
          <button class="tg-quit" type="button">ゲーム終了</button>
        </div>
        <div class="tg-rwd"></div>
        <div class="tg-field">${this._fieldSvg()}<div class="tg-readout"></div><div class="tg-pitta-fx"></div></div>
        <div class="tg-ctrl">
          <div class="tg-angle-row"><span>角度</span><b class="tg-angle-v">45°</b><span class="tg-pow">合計威力 <b class="tg-pow-v">0</b></span></div>
          <input type="range" class="tg-slider" min="0" max="90" step="1" value="45" aria-label="投射角度">
        </div>
        <div class="tg-hand-label">カードを最大3枚選んでください（<span class="tg-selc">0</span>/3・残り<span class="tg-left">${this.hand.length}</span>枚）</div>
        <div class="tg-hand"></div>
        <button class="tg-btn tg-throw" disabled>投げる</button>
      </div>`;
    this.slider = ov.querySelector('.tg-slider');
    this.slider.addEventListener('input', () => {
      const prev = this.angle;
      this._setAngle(parseInt(this.slider.value, 10));
      const now = performance.now();
      if (this.angle !== prev && now - (this._seAngleT || 0) >= 50) { this._seAngleT = now; _seThrow('tap', { rate: 0.7 + this.angle / 90 * 0.9, volume: 0.35, suppressTap: true }); }
    });
    ov.querySelector('.tg-throw').addEventListener('click', () => this._throw());
    ov.querySelector('.tg-quit').addEventListener('click', () => this._confirmQuit());
    this._setAngle(this.angle);
    this._renderHand();
    this._renderProg();
  },

  _setAngle(deg) {
    this.angle = Math.max(0, Math.min(90, deg | 0));
    const ov = this.ov;
    ov.querySelector('.tg-angle-v').textContent = this.angle + '°';
    ov.querySelector('.tg-arm').setAttribute('transform', `rotate(${-this.angle})`);
    this._updatePred();
  },

  // 現在の目標に対する判定（報酬ロジックと共通）：'pitta' | 'reach' | 'short'
  _isPitta(dist, t) { return Math.abs(dist - t) < this.PITTA_TOL; },
  _judge(dist) {
    if (this.targetIdx >= this.TARGETS.length) return 'reach';
    const t = this.TARGETS[this.targetIdx];
    if (this._isPitta(dist, t)) return 'pitta';
    return dist >= t ? 'reach' : 'short';
  },

  // 実際の投射アニメーションと同じ軌道関数（t:0..1 → SVG座標）
  _trajFn(base, deg, dist) {
    const th = deg * Math.PI / 180;
    const R = dist;
    const hMax = base * Math.sin(th) * Math.sin(th) / 2 / this.SIN120; // 最高到達点(m)
    const ppm = this.PX_PER_M, ox = this.ORIGIN_X, gy = this.GROUND_Y;
    const fn = t => {
      // x は線形、y は放物線
      const xm = R * t;
      const ym = 4 * hMax * t * (1 - t);
      const x = ox + Math.min(xm, this.FIELD_MAX + 3) * ppm;
      let y = gy - ym * ppm;
      if (y < 8) y = 8;
      return [x, y];
    };
    fn.R = R; fn.hMax = hMax;
    return fn;
  },

  // 予測軌道（破線）と着地点マーカーを描画
  _updatePred() {
    if (!this.ov) return;
    const g = this.ov.querySelector('.tg-pred');
    if (!g) return;
    const power = this._selPower();
    if (!this.sel.length || this.busy || this.done) { g.style.display = 'none'; return; }
    const dist = this.distanceFor(power, this.angle);
    const fn = this._trajFn(power, this.angle, dist);
    const N = 48;
    let d = '';
    for (let i = 0; i <= N; i++) {
      const [x, y] = fn(i / N);
      d += (i ? 'L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1);
    }
    g.querySelector('.tg-pred-arc').setAttribute('d', d);
    const [lx] = fn(1);
    const mk = g.querySelector('.tg-pred-mark');
    mk.setAttribute('transform', `translate(${lx.toFixed(1)},${this.GROUND_Y})`);
    const j = this._judge(dist);
    const txt = mk.querySelector('.tg-pred-t');
    txt.textContent = `${dist.toFixed(1)}m${j === 'pitta' ? ' ピッタリ！' : ''}${dist > this.FIELD_MAX ? ' ▶' : ''}`;
    // ラベルが画面外にはみ出さないよう寄せる
    const anchor = lx > this.VIEW_W - 60 ? 'end' : (lx < 40 ? 'start' : 'middle');
    txt.setAttribute('text-anchor', anchor);
    txt.setAttribute('x', anchor === 'end' ? 4 : (anchor === 'start' ? -4 : 0));
    g.setAttribute('class', 'tg-pred ' + j);
    g.style.display = '';
  },

  _renderProg() {
    const p = this.ov.querySelector('.tg-prog');
    p.innerHTML = this.TARGETS.map((t, i) => {
      const st = i < this.targetIdx ? 'done' : (i === this.targetIdx ? 'cur' : '');
      return `<span class="tg-chip ${st}${this.pitta[i] ? ' pitta' : ''}">${i < this.targetIdx ? (this.pitta[i] ? '★ ' : '✓ ') : ''}${t}m</span>`;
    }).join('');
    const rw = this.ov.querySelector('.tg-rwd');
    if (rw) {
      const r = this._reward();
      const np = this.pitta.filter(Boolean).length;
      rw.classList.toggle('got', !!r.special);
      rw.innerHTML = `<span class="tg-rwd-l">報酬：</span><b>${r.special ? this._rewardText(r) : 'まだなし（10mで特別アップグレード）'}</b>`
        + (np ? `<span class="tg-rwd-p">ピッタリ×${np}</span>` : '');
    }
    this.ov.querySelectorAll('.tg-flag').forEach(f => {
      const i = +f.dataset.i;
      f.classList.toggle('done', i < this.targetIdx);
      f.classList.toggle('cur', i === this.targetIdx);
    });
  },

  _selPower() {
    return this.sel.reduce((a, i) => a + (this.hand[i] ? this.hand[i].power : 0), 0);
  },

  _renderHand() {
    const h = this.ov.querySelector('.tg-hand');
    h.innerHTML = '';
    this.hand.forEach((e, i) => {
      const slot = document.createElement('div');
      const order = this.sel.indexOf(i);
      slot.className = 'tg-slot' + (e.used ? ' used' : '') + (order >= 0 ? ' sel' : '');
      const diff = e.power !== e.base;
      slot.innerHTML = `<div class="tg-cardscale"><div class="card${e.card.trait ? ' trait-' + String(e.card.trait).replace(/[()]/g, '') : ''}">${this._cardInner(e.card)}</div></div>`
        + (order >= 0 ? `<span class="tg-order">${order + 1}</span>` : '')
        + `<div class="tg-power${diff ? ' boosted' : ''}">${diff ? `<span class="tg-pbase">基礎${e.base}→</span>` : ''}<span class="tg-pval">威力${e.power}</span></div>`;
      if (!e.used) slot.addEventListener('click', () => {
        if (this.busy || this.done) return;
        const k = this.sel.indexOf(i);
        if (k >= 0){ this.sel.splice(k, 1); _seThrow('deselect', {suppressTap:true}); }
        else if (this.sel.length < this.MAX_SELECT){ this.sel.push(i); _seThrow('select', {suppressTap:true}); }
        else {
          _seThrow('error', {suppressTap:true});
          const lab = this.ov.querySelector('.tg-hand-label');
          lab.classList.remove('warn'); void lab.offsetWidth; lab.classList.add('warn');
          return;
        }
        this._renderHand();
      });
      h.appendChild(slot);
    });
    const left = this.hand.filter(e => !e.used).length;
    this.ov.querySelector('.tg-left').textContent = left;
    this.ov.querySelector('.tg-selc').textContent = this.sel.length;
    this.ov.querySelector('.tg-pow-v').textContent = this._selPower();
    const btn = this.ov.querySelector('.tg-throw');
    btn.disabled = this.busy || this.done || this.sel.length === 0;
    btn.textContent = this.sel.length ? `投げる（${this.sel.length}枚・威力${this._selPower()}）` : '投げる';
    this._updatePred();
  },

  _throw() {
    if (this.busy || this.done || this.sel.length === 0) return;
    const picks = this.sel.map(i => this.hand[i]).filter(e => e && !e.used);
    if (!picks.length) return;
    const power = picks.reduce((a, e) => a + e.power, 0);
    this.busy = true;
    const pfx = this.ov.querySelector('.tg-pitta-fx'); if (pfx) pfx.classList.remove('show');
    picks.forEach(e => { e.used = true; });
    this.sel = [];
    this._renderHand();
    const dist = this.distanceFor(power, this.angle);
    this.lastPower = power;
    this.lastDistance = dist;
    _seThrow('throw', {suppressTap:true});
    this._animate(power, this.angle, dist).then(() => this._afterThrow(dist));
  },

  _animate(base, deg, dist) {
    return new Promise(res => {
      const svg = this.ov.querySelector('.tg-svg');
      const proj = svg.querySelector('.tg-proj');
      const trail = svg.querySelector('.tg-trail');
      const pos = this._trajFn(base, deg, dist);   // 予測軌道と同一の関数
      const R = pos.R, hMax = pos.hMax;
      const reduced = this._reduced();
      const dur = reduced ? 220 : Math.max(700, Math.min(1500, 600 + Math.sqrt(Math.max(R, hMax)) * 110));
      proj.style.display = '';
      const pts = [];
      const t0 = performance.now();
      const step = now => {
        if (!this.ov || this.quit) { res(); return; }
        const t = Math.min(1, (now - t0) / dur);
        const [x, y] = pos(t);
        pts.push(x.toFixed(1) + ',' + y.toFixed(1));
        trail.setAttribute('points', pts.join(' '));
        const rot = reduced ? 0 : t * 720;
        proj.setAttribute('transform', `translate(${x},${y}) rotate(${rot})`);
        if (t < 1) requestAnimationFrame(step);
        else {
          proj.style.display = 'none';
          this._mark(x, dist);
          res();
        }
      };
      requestAnimationFrame(step);
    });
  },

  _mark(x, dist) {
    const svg = this.ov.querySelector('.tg-svg');
    const marks = svg.querySelector('.tg-marks');
    marks.querySelectorAll('.tg-mark').forEach(m => m.classList.add('old'));
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'tg-mark');
    g.setAttribute('transform', `translate(${x},${this.GROUND_Y})`);
    const over = dist > this.FIELD_MAX;
    _seThrow('land');
    g.innerHTML = `<path d="M-4,-4 L4,4 M4,-4 L-4,4" class="tg-x"/>`;
    marks.appendChild(g);
    const ro = this.ov.querySelector('.tg-readout');
    ro.textContent = `${dist.toFixed(1)}m${over ? ' ▶' : ''}`;
    ro.classList.remove('pop'); void ro.offsetWidth; ro.classList.add('pop');
  },

  _sparkle(m) {
    const svg = this.ov.querySelector('.tg-svg');
    const sp = svg.querySelector('.tg-sparks');
    const x = this._fx(m), y = this.GROUND_Y - 30;
    const n = this._reduced() ? 0 : 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', 2.2);
      c.setAttribute('class', 'tg-spark');
      c.style.setProperty('--dx', (Math.cos(a) * 24).toFixed(1) + 'px');
      c.style.setProperty('--dy', (Math.sin(a) * 24).toFixed(1) + 'px');
      sp.appendChild(c);
      setTimeout(() => c.remove(), 750);
    }
  },

  _afterThrow(dist) {
    if (!this.ov || this.quit) return;
    let hit = 0, pittaNow = [];
    while (this.targetIdx < this.TARGETS.length && dist >= this.TARGETS[this.targetIdx] - this.PITTA_TOL) {
      // 1投で複数の目標を同時に達成できる。±0.5m以内（四捨五入で目標値）ならピッタリ（到達扱い）
      const t = this.TARGETS[this.targetIdx];
      if (this._isPitta(dist, t)) { this.pitta[this.targetIdx] = true; pittaNow.push(t); }
      else if (dist < t) break;
      this.targetIdx++;
      hit++;
      this._sparkle(t);
      const flag = this.ov.querySelector(`.tg-flag[data-i="${this.targetIdx - 1}"]`);
      if (flag) { flag.classList.remove('popnow'); void flag.getBoundingClientRect(); flag.classList.add('popnow'); }
    }
    const ro = this.ov.querySelector('.tg-readout');
    ro.classList.toggle('hit', hit > 0);
    ro.classList.toggle('miss', hit === 0);
    if (hit) ro.textContent += '  到達！';
    if (hit) setTimeout(() => _seThrow('levelUp', { volume: 0.7 }), 120);
    if (pittaNow.length) this._pittaFx(pittaNow);
    this._renderProg();
    const won = this.targetIdx >= this.TARGETS.length;
    const left = this.hand.filter(e => !e.used).length;
    const delay = this._reduced() ? 250 : (pittaNow.length ? 1300 : 750);
    if (won || left === 0) {
      this.done = true;
      this._renderHand();
      setTimeout(() => this._result(won), delay);
    } else {
      this.busy = false;
      this._renderHand();
    }
  },

  _pittaFx(ts) {
    const fx = this.ov && this.ov.querySelector('.tg-pitta-fx');
    if (!fx) return;
    fx.innerHTML = `<div class="tg-pitta-big">ピッタリ！</div><div class="tg-pitta-sub">${ts.map(t => t + 'm').join('・')} ＋${this.PITTA_GOLD * ts.length}G</div>`;
    fx.classList.remove('show'); void fx.offsetWidth; fx.classList.add('show');
    setTimeout(() => { _seThrow('pittari'); setTimeout(() => _seThrow('coin'), 260); }, 320);
    ts.forEach(t => this._sparkle(t));
  },

  _confirmQuit() {
    if (!this.ov || this.done || this.ov.querySelector('.tg-result-wrap')) return;
    const r = document.createElement('div');
    r.className = 'tg-result-wrap tg-confirm-wrap';
    r.innerHTML = `<div class="tg-panel tg-confirm">
      <div class="tg-title sm">ゲームを終了しますか？</div>
      <div class="tg-rules"><p>${this.targetIdx >= 1 ? `現在の報酬「<b>${this._rewardText()}</b>」で終了します。` : '10mに未到達のため<b class="tg-ng">報酬なし</b>になります。'}</p></div>
      <div class="tg-confirm-btns">
        <button class="tg-btn tg-sub tg-cancel" type="button">続ける</button>
        <button class="tg-btn tg-danger tg-yes" type="button">終了する</button>
      </div></div>`;
    this.ov.appendChild(r);
    _seThrow('open', {suppressTap:true});
    r.querySelector('.tg-cancel').addEventListener('click', () => { _seThrow('cancel', {suppressTap:true}); r.remove(); });
    r.querySelector('.tg-yes').addEventListener('click', () => {
      _seThrow('confirm', {suppressTap:true});
      r.remove();
      if (this.done) return;
      this.quit = true;
      this.done = true;
      this.busy = false;
      const proj = this.ov.querySelector('.tg-proj'); if (proj) proj.style.display = 'none';
      this._renderHand();
      this._result(this.targetIdx >= this.TARGETS.length);
    });
  },

  _result(win) {
    if (!this.ov || this.ov.querySelector('.tg-result-wrap:not(.tg-confirm-wrap)')) return;
    win = this.targetIdx >= 1;
    this.win = win;
    const r = document.createElement('div');
    r.className = 'tg-result-wrap';
    const rw = this._reward();
    const all = this.targetIdx >= this.TARGETS.length;
    const np = this.pitta.filter(Boolean).length;
    const list = this.TARGETS.map((t, i) => {
      const ok = i < this.targetIdx;
      const g = i === 0 ? '特別アップグレード' : `＋${this.TARGET_GOLD[i]}G`;
      return `<li class="${ok ? 'ok' : 'ng'}"><span>${ok ? '✓' : '—'} ${t}m</span><span>${ok ? g : '未達成'}${this.pitta[i] ? ' <em>ピッタリ＋5G</em>' : ''}</span></li>`;
    }).join('');
    r.innerHTML = `<div class="tg-panel tg-result ${win ? 'win' : 'lose'}">
      <div class="tg-title">${all ? '完全制覇！' : (win ? '結果' : '失敗…')}</div>
      <div class="tg-rules">${this.quit ? '<p>ゲームを終了しました。</p>' : ''}${(!all && !this.quit) ? `<p>${this.TARGETS[this.targetIdx]}mの旗に届きませんでした。</p>` : ''}${all ? '<p>50mの旗まで届きました！</p>' : ''}</div>
      <ul class="tg-rlist">${list}</ul>
      ${np ? `<p class="tg-dim tg-rnote">ピッタリ ${np}回</p>` : ''}
      <div class="tg-reward">${rw.special ? '報酬：' + this._rewardText(rw) : '報酬なし'}</div>
      <button class="tg-btn tg-back">${win ? '報酬を受け取る' : '戻る'}</button></div>`;
    this.ov.appendChild(r);
    if (all) { _seThrow('win'); setTimeout(() => _seThrow('fanfare'), 400); }
    else _seThrow(win ? 'win' : 'lose');
    r.querySelector('.tg-back').addEventListener('click', () => { _seThrow(win ? 'coin' : 'close', {suppressTap:true}); this._close(); });
  },

  _close() {
    if (!this.ov) return;
    this.ov.remove();
    this.ov = null;
    document.body.style.overflow = this._prevOverflow || '';
    const res = this._resolve; this._resolve = null;
    if (res) {
      const rw = this._reward();
      const np = this.pitta.filter(Boolean).length;
      const summary = rw.special
        ? `投射チャレンジ：${this.TARGETS[this.targetIdx - 1]}m達成${np ? `（ピッタリ${np}回）` : ''} → ${this._rewardText(rw)}`
        : '投射チャレンジ：10m未達成（報酬なし）';
      res({ win: !!rw.special, reward: { gold: rw.gold, special: rw.special }, summary });
    }
  },
};
if (typeof window !== 'undefined') window.ThrowGame = ThrowGame;
