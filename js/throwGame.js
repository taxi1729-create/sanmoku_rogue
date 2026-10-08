// 投射ミニゲーム「投射チャレンジ」
// ThrowGame.open({floor}) -> Promise<{win:boolean}>
// カード8枚（デッキのコピー）を引き、基礎点×sin(2θ) m 飛ばして 10m→30m→50m の目標を順に達成する。
// 報酬の付与は呼び出し側で行う（ここでは表示のみ）。
const ThrowGame = {
  TARGETS: [10, 30, 50],
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
      this._build();
    });
  },

  distanceFor(base, deg) {
    return Math.max(0, base * Math.sin(2 * deg * Math.PI / 180));
  },

  _rewardText() {
    const n = this._floor >= 8 ? 2 : 1;
    return `特別アップグレード1パック＋${10 * n}G`;
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
    return pool.slice(0, 8).map((c, i) => ({ card: c, base: Number(c.baseScore) || 0, used: false, idx: i }));
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
    this.selected = -1;
    this.angle = 45;
    this.busy = false;
    this.done = false;
    this.win = false;

    const ov = document.createElement('div');
    ov.className = 'tg-overlay';
    ov.innerHTML = `
      <div class="tg-panel tg-intro">
        <div class="tg-title">投射チャレンジ</div>
        <div class="tg-rules">
          <p>デッキからランダムに<b>8枚</b>のカードを引きます。</p>
          <p>カードの<b>基礎点</b>が飛距離のもとになります。<br>角度は<b>0°〜90°</b>で選べます。</p>
          <p class="tg-ex">例：基礎点30・角度45° → <b>30m</b></p>
          <p>カードは1回投げると使い切り。<br><b>10m → 30m → 50m</b> の旗に順番に届かせよう。</p>
          <p>8枚以内に<b>50m</b>まで届けばクリア！</p>
        </div>
        <div class="tg-reward">クリア報酬：${this._rewardText()}</div>
        <button class="tg-btn tg-start">はじめる</button>
      </div>`;
    document.body.appendChild(ov);
    this.ov = ov;
    this._prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ov.querySelector('.tg-start').addEventListener('click', () => this._renderPlay());
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
        </div>
        <div class="tg-field">${this._fieldSvg()}<div class="tg-readout"></div></div>
        <div class="tg-ctrl">
          <div class="tg-angle-row"><span>角度</span><b class="tg-angle-v">45°</b></div>
          <input type="range" class="tg-slider" min="0" max="90" step="1" value="45" aria-label="投射角度">
        </div>
        <div class="tg-hand-label">カードを選んでください（残り<span class="tg-left">${this.hand.length}</span>枚）</div>
        <div class="tg-hand"></div>
        <button class="tg-btn tg-throw" disabled>投げる</button>
      </div>`;
    this.slider = ov.querySelector('.tg-slider');
    this.slider.addEventListener('input', () => this._setAngle(parseInt(this.slider.value, 10)));
    ov.querySelector('.tg-throw').addEventListener('click', () => this._throw());
    this._setAngle(this.angle);
    this._renderHand();
    this._renderProg();
  },

  _setAngle(deg) {
    this.angle = Math.max(0, Math.min(90, deg | 0));
    const ov = this.ov;
    ov.querySelector('.tg-angle-v').textContent = this.angle + '°';
    ov.querySelector('.tg-arm').setAttribute('transform', `rotate(${-this.angle})`);
  },

  _renderProg() {
    const p = this.ov.querySelector('.tg-prog');
    p.innerHTML = this.TARGETS.map((t, i) => {
      const st = i < this.targetIdx ? 'done' : (i === this.targetIdx ? 'cur' : '');
      return `<span class="tg-chip ${st}">${i < this.targetIdx ? '✓ ' : ''}${t}m</span>`;
    }).join('');
    this.ov.querySelectorAll('.tg-flag').forEach(f => {
      const i = +f.dataset.i;
      f.classList.toggle('done', i < this.targetIdx);
      f.classList.toggle('cur', i === this.targetIdx);
    });
  },

  _renderHand() {
    const h = this.ov.querySelector('.tg-hand');
    h.innerHTML = '';
    this.hand.forEach((e, i) => {
      const slot = document.createElement('div');
      slot.className = 'tg-slot' + (e.used ? ' used' : '') + (i === this.selected ? ' sel' : '');
      slot.innerHTML = `<div class="tg-cardscale"><div class="card">${this._cardInner(e.card)}</div></div>`;
      if (!e.used) slot.addEventListener('click', () => {
        if (this.busy || this.done) return;
        this.selected = (this.selected === i) ? -1 : i;
        this._renderHand();
      });
      h.appendChild(slot);
    });
    const left = this.hand.filter(e => !e.used).length;
    this.ov.querySelector('.tg-left').textContent = left;
    this.ov.querySelector('.tg-throw').disabled = this.busy || this.done || this.selected < 0;
  },

  _throw() {
    if (this.busy || this.done || this.selected < 0) return;
    const e = this.hand[this.selected];
    if (!e || e.used) return;
    this.busy = true;
    e.used = true;
    this.selected = -1;
    this._renderHand();
    const dist = this.distanceFor(e.base, this.angle);
    this.lastDistance = dist;
    this._animate(e.base, this.angle, dist).then(() => this._afterThrow(dist));
  },

  _animate(base, deg, dist) {
    return new Promise(res => {
      const svg = this.ov.querySelector('.tg-svg');
      const proj = svg.querySelector('.tg-proj');
      const trail = svg.querySelector('.tg-trail');
      const th = deg * Math.PI / 180;
      const R = dist;
      const hMax = base * Math.sin(th) * Math.sin(th) / 2; // 最高到達点(m)
      const ppm = this.PX_PER_M, ox = this.ORIGIN_X, gy = this.GROUND_Y;
      const reduced = this._reduced();
      const dur = reduced ? 220 : Math.max(700, Math.min(1500, 600 + Math.sqrt(Math.max(R, hMax)) * 110));
      const pos = t => {
        // t:0..1 。x は線形、y は放物線
        const xm = R * t;
        const ym = 4 * hMax * t * (1 - t);
        let x = ox + Math.min(xm, this.FIELD_MAX + 3) * ppm;
        let y = gy - ym * ppm;
        if (y < 8) y = 8;
        return [x, y];
      };
      proj.style.display = '';
      const pts = [];
      const t0 = performance.now();
      const step = now => {
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
    let hit = 0;
    while (this.targetIdx < this.TARGETS.length && dist >= this.TARGETS[this.targetIdx] && hit < 1) {
      // 1投で達成できるのは「現在の目標」1つのみ
      const t = this.TARGETS[this.targetIdx];
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
    this._renderProg();
    const won = this.targetIdx >= this.TARGETS.length;
    const left = this.hand.filter(e => !e.used).length;
    const delay = this._reduced() ? 250 : 750;
    if (won || left === 0) {
      this.done = true;
      this._renderHand();
      setTimeout(() => this._result(won), delay);
    } else {
      this.busy = false;
      this._renderHand();
    }
  },

  _result(win) {
    this.win = win;
    const r = document.createElement('div');
    r.className = 'tg-result-wrap';
    r.innerHTML = `<div class="tg-panel tg-result ${win ? 'win' : 'lose'}">
      <div class="tg-title">${win ? 'クリア！' : '失敗…'}</div>
      <div class="tg-rules">${win
        ? `<p>50mの旗まで届きました！</p><div class="tg-reward">報酬：${this._rewardText()}</div>`
        : `<p>${this.TARGETS[this.targetIdx]}mの旗に届きませんでした。</p><p class="tg-dim">達成：${this.targetIdx}/3</p>`}
      </div>
      <button class="tg-btn tg-back">戻る</button></div>`;
    this.ov.appendChild(r);
    r.querySelector('.tg-back').addEventListener('click', () => this._close());
  },

  _close() {
    if (!this.ov) return;
    this.ov.remove();
    this.ov = null;
    document.body.style.overflow = this._prevOverflow || '';
    const res = this._resolve; this._resolve = null;
    if (res) res({ win: !!this.win });
  },
};
if (typeof window !== 'undefined') window.ThrowGame = ThrowGame;
