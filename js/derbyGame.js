/* derbyGame.js — ミニゲーム「シンボルダービー」
 * 公開API（グローバル const DerbyGame）:
 *   DerbyGame.open({floor}) -> Promise<{win, reward:{gold, special}, summary}>  オーバーレイを閉じたときに resolve
 *     win    : 払戻額 > 0
 *     reward : gold = min(100, 未ベット返却 + 払戻)、special = (未ベット返却 + 払戻) > 120 なら 1
 *   DerbyGame.isOpen()
 *   DerbyGame.oddsFromMult(mult) / currentOdds() / pairOdds(odds, a, b) / settle(bets, order, odds)  純粋ロジック
 *   DerbyGame._debug  テスト用（rng / timeScale / forceOrder / noCards / cardPick / state / applyCard / simulate）
 * 報酬の付与は行わない（呼び出し側の責務）。
 *
 * ルールと設計上の決定:
 *   オッズ: 各シンボルの現在のビンゴ倍率 GameData.BINGO_MULTIPLIER_BASE[sym] ÷ 10（小数1桁に丸め）。
 *     倍率101 → 10.1倍。倍率がマイナス、または算出値が1.1未満なら 1.1倍。
 *     連複オッズ = 単勝オッズA × 単勝オッズB（小数2桁に丸め）。
 *   ベット: 専用の持ち金20G（GameState.gold とは別）。単勝4種・連複6種へ1G単位、合計20Gまで。
 *     単勝 = そのシンボルが1着で的中。連複 = 2頭が1着・2着（順不同）で的中。払戻 = floor(ベット額 × オッズ)。
 *     未ベット分は返却。合計 = 未ベット + 払戻。報酬G = min(100, 合計)。合計 > 120G なら特別アップグレード1枚追加。
 *   レース物理（単位: m, 秒）:
 *     各シンボルの基礎加速度 a = K / オッズ（K=1）。倍率が高い＝調子が悪い＝加速度が低い。
 *     速度は0から始まり毎秒 a ずつ上昇。距離 D はオッズ3.0のシンボルがカードなしで30秒ちょうどでゴールする値
 *     D = ½·(1/3)·30² = 150m。
 *   カード: 0秒から5秒ごとにデッキ（コピー）からランダムに1枚引く。
 *     そのカードの記号と同じシンボルは速度 +基礎点×0.05（10点カードで+0.5）。
 *     ジャミングがあれば、カードと違う記号のシンボル（ゴール済みを除く）が効果を受ける。
 *     ユーザー指定の 5/10/15 はこの速度単位に合わせ ×0.1 に換算:
 *       延命 −0.5 / 封印 −1.0 / 引き直し −1.5 / スタン → 0 / リンク → 自分以外のランダムなシンボルの（効果適用前の）速度になる。
 *     ホシ等の4記号以外のカードは加速なし（ジャミングは4頭すべてが対象）。その他のジャミングは効果なし。速度は0未満にならない。
 *   レースは上位2頭がゴールした時点で終了（3・4着は残り距離順）。
 */
const DerbyGame = (function(){
  'use strict';
  const _se=(n,o)=>{ try{ if(typeof SFX!=='undefined') SFX.play(n,o); }catch(e){} };
  const _seLast = {};
  const _seT = (n, ms, o) => { const now = (typeof performance!=='undefined'?performance.now():Date.now()); if(now - (_seLast[n] || 0) < ms) return; _seLast[n] = now; _se(n, o); };

  const SYMS = ['Circle', 'Triangle', 'Square', 'Cross'];
  const NAME = { Circle:'マル', Triangle:'サンカク', Square:'シカク', Cross:'バツ' };
  const STAKE = 20, CAP = 100, BONUS_LINE = 120;
  const K = 1;                                   // 加速度係数 a = K / odds
  const REF_ODDS = 3.0, REF_TIME = 30;
  const DIST = 0.5 * (K / REF_ODDS) * REF_TIME * REF_TIME;   // = 150
  const DRAW_INTERVAL = 5;
  const BOOST_PER_POINT = 0.05;
  const JAM_DELTA = { '延命':0.5, '封印':1.0, '引き直し':1.5 };
  const MIN_ODDS = 1.1;
  const STEP = 1 / 60;

  const _debug = { rng:null, timeScale:1, forceOrder:null, noCards:false, cardPick:null, state:null, applyCard:null, simulate:null };
  const rnd = () => (_debug.rng ? _debug.rng() : Math.random());

  // ---------- 純粋ロジック ----------
  function oddsFromMult(mult){
    const m = Number(mult);
    if(!isFinite(m) || m < 0) return MIN_ODDS;
    const o = Math.round(m) / 10;
    return o < MIN_ODDS ? MIN_ODDS : o;
  }
  function currentOdds(){
    const base = (typeof GameData !== 'undefined' && GameData.BINGO_MULTIPLIER_BASE) || {};
    const o = {};
    SYMS.forEach(s => { o[s] = oddsFromMult(base[s]); });
    return o;
  }
  const r2 = x => Math.round(x * 100) / 100;
  function pairOdds(odds, a, b){ return r2(odds[a] * odds[b]); }
  const PAIRS = [];
  for(let i = 0; i < SYMS.length; i++) for(let j = i + 1; j < SYMS.length; j++) PAIRS.push([SYMS[i], SYMS[j]]);
  // ベットキー: 'W:Circle'（単勝） / 'Q:Circle-Triangle'（連複）
  function betOdds(key, odds){
    const [t, v] = key.split(':');
    if(t === 'W') return odds[v];
    const [a, b] = v.split('-');
    return pairOdds(odds, a, b);
  }
  function betHit(key, order){
    const [t, v] = key.split(':');
    if(t === 'W') return order[0] === v;
    const [a, b] = v.split('-');
    const top = order.slice(0, 2);
    return top.includes(a) && top.includes(b);
  }
  // bets: {key: amount}, order: [1着,2着,...], odds: {sym: odds}
  function settle(bets, order, odds){
    let wager = 0, payout = 0;
    const lines = [];
    Object.keys(bets || {}).forEach(k => {
      const amt = Math.max(0, Math.floor(Number(bets[k]) || 0));
      if(!amt) return;
      wager += amt;
      const o = betOdds(k, odds), hit = betHit(k, order);
      const pay = hit ? Math.floor(amt * o) : 0;
      payout += pay;
      lines.push({ key:k, amount:amt, odds:o, hit, pay });
    });
    const unbet = Math.max(0, STAKE - wager);
    const total = unbet + payout;
    return { wager, unbet, payout, total, gold:Math.min(CAP, total), special:total > BONUS_LINE ? 1 : 0, lines };
  }

  // ---------- ユーティリティ ----------
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const reduced = () => { try{ return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){ return false; } };
  const symIcon = s => {
    const L = (typeof GameData !== 'undefined' && GameData.SYMBOL_LABEL) || {};
    return L[s] || esc((typeof GameData !== 'undefined' && GameData.SYMBOL_TEXT && GameData.SYMBOL_TEXT[s]) || NAME[s] || s);
  };
  const symName = s => NAME[s] || ((typeof GameData !== 'undefined' && GameData.SYMBOL_TEXT && GameData.SYMBOL_TEXT[s]) || s);
  const fmtOdds = o => { const c = Math.round(o * 100); return (c / 100).toFixed(c % 10 === 0 ? 1 : 2); };
  const jamIcon = j => { try{ return (typeof GameData !== 'undefined' && GameData.iconFor) ? GameData.iconFor('jamming', j) : ''; }catch(e){ return ''; } };
  function condition(o){
    if(o < 2) return { t:'絶好調', c:'c1' };
    if(o < 4) return { t:'好調', c:'c2' };
    if(o < 7) return { t:'普通', c:'c3' };
    return { t:'不調', c:'c4' };
  }
  const keyLabel = k => {
    const [t, v] = k.split(':');
    if(t === 'W') return `単勝 <span class="sym-${v}">${symIcon(v)}</span>`;
    const [a, b] = v.split('-');
    return `連複 <span class="sym-${a}">${symIcon(a)}</span>-<span class="sym-${b}">${symIcon(b)}</span>`;
  };
  const keyText = k => {
    const [t, v] = k.split(':');
    if(t === 'W') return `単勝${symName(v)}`;
    const [a, b] = v.split('-');
    return `連複${symName(a)}-${symName(b)}`;
  };

  function cloneCard(c){ try{ return JSON.parse(JSON.stringify(c)); }catch(e){ return Object.assign({}, c); } }
  function makeDeck(){
    const deck = (typeof GameState !== 'undefined' && Array.isArray(GameState.currentDeck)) ? GameState.currentDeck : [];
    let cards = deck.map(cloneCard);
    if(!cards.length) cards = SYMS.map(s => ({ symbol:s, baseScore:10 }));
    for(let i = cards.length - 1; i > 0; i--){ const j = Math.floor(rnd() * (i + 1)); [cards[i], cards[j]] = [cards[j], cards[i]]; }
    return cards;
  }
  function drawCard(){
    if(_debug.cardPick){ const c = _debug.cardPick(st.drawn.length); if(c) return cloneCard(c); }
    if(!st.pile.length) st.pile = makeDeck();
    return st.pile.pop();
  }

  // ---------- レースシミュレーション ----------
  function newRunners(odds){
    const o = {};
    SYMS.forEach(s => { o[s] = { sym:s, odds:odds[s], a:K / odds[s], v:0, x:0, fin:null }; });
    return o;
  }
  // カード効果の適用（純粋に runners を変更）。返り値は表示用の効果リスト
  function applyCardTo(runners, card, rng){
    rng = rng || rnd;
    const fx = [];
    const sym = card && card.symbol;
    const base = Number(card && card.baseScore) || 0;
    const r = runners[sym];
    if(r && r.fin == null){
      const d = base * BOOST_PER_POINT;
      r.v = Math.max(0, r.v + d);
      fx.push({ sym, kind:'boost', d });
    }
    const j = card && card.jamming;
    if(j && (JAM_DELTA[j] != null || j === 'スタン' || j === 'リンク')){
      const targets = SYMS.filter(s => s !== sym && runners[s].fin == null);
      const snap = {}; SYMS.forEach(s => { snap[s] = runners[s].v; });
      targets.forEach(s => {
        const t = runners[s];
        if(JAM_DELTA[j] != null){ t.v = Math.max(0, t.v - JAM_DELTA[j]); fx.push({ sym:s, kind:'jam', j, d:-JAM_DELTA[j] }); }
        else if(j === 'スタン'){ t.v = 0; fx.push({ sym:s, kind:'jam', j }); }
        else if(j === 'リンク'){
          const others = SYMS.filter(x => x !== s);
          const pick = others[Math.floor(rng() * others.length) % others.length];
          t.v = snap[pick]; fx.push({ sym:s, kind:'jam', j, to:pick });
        }
      });
    }
    return fx;
  }
  // 1ステップ進める。新たにゴールしたシンボルの配列を返す
  function stepRunners(runners, t, dt){
    const done = [];
    SYMS.forEach(s => {
      const r = runners[s];
      if(r.fin != null) return;
      const v0 = r.v;
      r.v += r.a * dt;
      const nx = r.x + (v0 + r.v) / 2 * dt;
      if(nx >= DIST){
        const avg = (v0 + r.v) / 2;
        const frac = avg > 0 ? (DIST - r.x) / (avg * dt) : 1;
        r.fin = t + Math.max(0, Math.min(1, frac)) * dt;
        r.x = DIST;
        done.push(s);
      } else r.x = nx;
    });
    return done;
  }
  function rankOf(runners){
    return SYMS.slice().sort((a, b) => {
      const A = runners[a], B = runners[b];
      if(A.fin != null && B.fin != null) return A.fin - B.fin;
      if(A.fin != null) return -1;
      if(B.fin != null) return 1;
      return B.x - A.x;
    });
  }
  // ヘッドレス計算（テスト用）: cards=false ならカードなし。全員ゴールまで
  function simulate(opts){
    opts = opts || {};
    const odds = opts.odds || currentOdds();
    const runners = newRunners(odds);
    let t = 0, next = 0;
    const pile = (opts.cards || []).slice();
    while(SYMS.some(s => runners[s].fin == null) && t < 600){
      while(pile.length && next <= t + 1e-9){ applyCardTo(runners, pile.shift(), opts.rng); next += DRAW_INTERVAL; }
      stepRunners(runners, t, STEP); t += STEP;
    }
    const res = {};
    SYMS.forEach(s => { res[s] = runners[s].fin; });
    return { finish:res, order:rankOf(runners) };
  }

  // ---------- DOM ----------
  let st = null, root = null, resolveFn = null, raf = 0;
  const $ = sel => root.querySelector(sel);

  function build(){
    root = document.createElement('div');
    root.className = 'db-overlay';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'シンボルダービー');
    const marks = [0, 50, 100, 150].map(m => `<span class="db-mark${m === DIST ? ' goal' : ''}" style="left:${m / DIST * 100}%"><i>${m === DIST ? 'GOAL' : m + 'm'}</i></span>`).join('');
    root.innerHTML = `
      <div class="db-bg"></div>
      <div class="db-main">
        <div class="db-top">
          <div class="db-title">シンボルダービー</div>
          <div class="db-clock"><span class="db-time">0.0</span><small>s</small></div>
          <button type="button" class="db-deckbtn" data-act="deck" aria-label="デッキ確認">デッキ確認</button>
          <button type="button" class="db-ff" data-act="ff" disabled aria-label="早送り">▶︎×1</button>
        </div>
        <div class="db-track">
          <div class="db-marks">${marks}<div class="db-goalline" aria-hidden="true"></div><div class="db-tape" aria-hidden="true"></div></div>
          ${SYMS.map((s, i) => `
          <div class="db-lane" data-sym="${s}">
            <div class="db-gate"><span class="sym-${s} db-gate-ico">${symIcon(s)}</span><span class="db-gate-odds"></span></div>
            <div class="db-turf">
              <div class="db-run"><div class="db-goal"></div><div class="db-runner sym-${s}"><span class="db-runner-ico">${symIcon(s)}</span><span class="db-pop"></span></div></div>
              <span class="db-place"></span>
            </div>
            <div class="db-speed"><span class="db-speed-num">0.0</span><span class="db-speed-bar"><i></i></span></div>
          </div>`).join('')}
          <div class="db-photo">写真判定</div>
        </div>
        <div class="db-call"><span class="db-call-tag">実況</span><span class="db-call-text">各シンボル、ゲートイン。</span></div>
        <div class="db-lower"></div>
      </div>
      <div class="db-panel-layer"></div>
      <div class="db-deck-layer" role="dialog" aria-label="デッキ確認"></div>`;
    document.body.appendChild(root);
    $('[data-act="ff"]').addEventListener('click', cycleFF);
    $('[data-act="deck"]').addEventListener('click', showDeck);
  }

  function renderGates(){
    SYMS.forEach(s => {
      const c = condition(st.odds[s]);
      root.querySelector(`.db-lane[data-sym="${s}"] .db-gate-odds`).innerHTML = `<b>${fmtOdds(st.odds[s])}<i>倍</i></b><small class="${c.c}">${c.t}</small>`;
    });
  }
  function setCall(text, hot){
    const el = $('.db-call');
    $('.db-call-text').innerHTML = text;
    el.classList.toggle('hot', !!hot);
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  }

  // ---------- ベット画面 ----------
  const betSum = () => Object.values(st.bets).reduce((a, b) => a + b, 0);
  function renderBets(){
    const low = $('.db-lower');
    const cell = (k, label, o) => {
      const amt = st.bets[k] || 0;
      return `<div class="db-bet${amt ? ' on' : ''}" data-k="${k}">
        <div class="db-bet-head"><span class="db-bet-lbl">${label}</span><span class="db-bet-odds">${fmtOdds(o)}倍</span></div>
        <div class="db-bet-ctrl">
          <button type="button" class="db-step" data-d="-1" aria-label="${esc(keyText(k))} を1G減らす">−</button>
          <span class="db-bet-amt">${amt}<small>G</small></span>
          <button type="button" class="db-step" data-d="1" aria-label="${esc(keyText(k))} を1G増やす">＋</button>
        </div>
      </div>`;
    };
    const left = STAKE - betSum();
    low.innerHTML = `
      <div class="db-stake">
        <span>持ち金 <b class="db-left">${left}</b>/${STAKE}G</span>
        <span class="db-stake-note">未ベット分は返却</span>
        <button type="button" class="db-mini" data-act="clear">リセット</button>
      </div>
      <div class="db-sec">単勝 <small>1着を当てる</small></div>
      <div class="db-grid">${SYMS.map(s => cell('W:' + s, `<span class="sym-${s}">${symIcon(s)}</span>${symName(s)}`, st.odds[s])).join('')}</div>
      <div class="db-sec">連複 <small>1・2着の組（順不同）／単勝×単勝</small></div>
      <div class="db-grid three">${PAIRS.map(([a, b]) => cell(`Q:${a}-${b}`, `<span class="sym-${a}">${symIcon(a)}</span><span class="sym-${b}">${symIcon(b)}</span>`, pairOdds(st.odds, a, b))).join('')}</div>
      <button type="button" class="db-btn db-btn-main" data-act="start">${betSum() ? `スタート（${betSum()}Gベット）` : 'ベットせずにスタート'}</button>`;
    low.querySelectorAll('.db-bet').forEach(el => {
      el.querySelectorAll('.db-step').forEach(b => b.addEventListener('click', () => changeBet(el.dataset.k, Number(b.dataset.d))));
    });
    low.querySelector('[data-act="clear"]').addEventListener('click', () => { _se('cancel', {suppressTap:true}); st.bets = {}; renderBets(); });
    low.querySelector('[data-act="start"]').addEventListener('click', startRace);
  }
  function changeBet(k, d){
    if(!st || st.phase !== 'bet') return;
    const cur = st.bets[k] || 0;
    if(d > 0 && betSum() >= STAKE){ _se('error', {suppressTap:true}); return; }
    const n = Math.max(0, cur + d);
    if(n !== cur) _se(d > 0 ? 'coin' : 'tap', { suppressTap:true, volume: d > 0 ? 0.6 : 0.8 });
    if(n) st.bets[k] = n; else delete st.bets[k];
    renderBets();
  }
  function setBets(bets){   // テスト・外部用
    if(!st || (st.phase !== 'bet' && st.phase !== 'intro')) return false;
    if(st.phase === 'intro'){ hidePanel(); st.phase = 'bet'; }
    const b = {};
    let sum = 0;
    Object.keys(bets || {}).forEach(k => {
      if(!/^W:(Circle|Triangle|Square|Cross)$/.test(k) && !PAIRS.some(([a, c]) => k === `Q:${a}-${c}`)) return;
      const n = Math.max(0, Math.floor(Number(bets[k]) || 0));
      const take = Math.min(n, STAKE - sum);
      if(take > 0){ b[k] = take; sum += take; }
    });
    st.bets = b; renderBets();
    return true;
  }

  // ---------- レース ----------
  function renderRaceLower(){
    $('.db-lower').innerHTML = `
      <div class="db-feed">
        <div class="db-feed-head"><span>ドローカード</span><span class="db-next">次のドロー 0.0s</span></div>
        <div class="db-drawn"><div class="db-drawn-empty">スタート時に1枚目をドロー</div></div>
        <div class="db-history"></div>
      </div>
      <div class="db-board">
        <div class="db-order">${[1, 2, 3, 4].map(n => `<div class="db-ord" data-n="${n}"><b>${n}着</b><span>—</span></div>`).join('')}</div>
        <div class="db-mybets">${Object.keys(st.bets).length ? Object.keys(st.bets).map(k => `<span class="db-chip" data-k="${k}">${keyLabel(k)} ${st.bets[k]}G</span>`).join('') : '<span class="db-chip dim">ベットなし（観戦）</span>'}</div>
      </div>`;
  }
  function cardChip(card, big){
    const s = card.symbol;
    const ico = symIcon(s);
    const j = card.jamming ? `<span class="db-cj">${jamIcon(card.jamming)}${esc(card.jamming)}</span>` : '';
    return `<div class="db-card${big ? ' big' : ''}${card.jamming ? ' jam' : ''}"><span class="db-card-sym sym-${esc(s)}">${ico}</span><span class="db-card-pts">${Number(card.baseScore) || 0}</span>${j}</div>`;
  }
  function fxText(card, fx){
    const parts = [];
    const boost = fx.find(f => f.kind === 'boost');
    if(boost) parts.push(`<span class="db-fx up"><span class="sym-${boost.sym}">${symIcon(boost.sym)}</span>加速 ${boost.d >= 0 ? '+' : ''}${boost.d.toFixed(2)}</span>`);
    else if(!SYMS.includes(card.symbol)) parts.push(`<span class="db-fx dim">${esc(symName(card.symbol))}：走者なし</span>`);
    else parts.push(`<span class="db-fx dim">${symName(card.symbol)}はゴール済み</span>`);
    const jams = fx.filter(f => f.kind === 'jam');
    if(jams.length){
      const j = jams[0].j;
      const who = jams.map(f => `<span class="sym-${f.sym}">${symIcon(f.sym)}</span>`).join('');
      let what = '';
      if(JAM_DELTA[j] != null) what = `速度 −${JAM_DELTA[j]}`;
      else if(j === 'スタン') what = '速度 0';
      else if(j === 'リンク') what = jams.map(f => `<span class="sym-${f.sym}">${symIcon(f.sym)}</span>→<span class="sym-${f.to}">${symIcon(f.to)}</span>`).join(' ') + ' の速度に';
      parts.push(`<span class="db-fx down">${esc(j)}：${j === 'リンク' ? '' : who + ' '}${what}</span>`);
    } else if(card.jamming){
      parts.push(`<span class="db-fx dim">${esc(card.jamming)}：レースでは効果なし</span>`);
    }
    return parts.join('');
  }
  function doDraw(){
    const card = drawCard();
    if(!card) return;
    const fx = applyCardTo(st.runners, card);
    st.drawn.push({ t:st.t, card, fx });
    // 表示
    const d = $('.db-drawn');
    if(d){
      d.innerHTML = `<div class="db-drawn-in">${cardChip(card, true)}<div class="db-fxs">${fxText(card, fx)}</div></div>`;
      const h = $('.db-history');
      if(h) h.innerHTML = st.drawn.slice(-7).reverse().slice(1).map(x => cardChip(x.card, false)).join('');
    }
    fx.forEach(f => {
      const pop = root.querySelector(`.db-lane[data-sym="${f.sym}"] .db-pop`);
      if(!pop) return;
      pop.className = 'db-pop show ' + (f.kind === 'boost' ? (f.d >= 0 ? 'up' : 'down') : 'down');
      pop.textContent = f.kind === 'boost' ? (f.d >= 0 ? '▲' : '▼') : (f.j === 'スタン' ? '✕' : f.j === 'リンク' ? '⇄' : '▼');
      void pop.offsetWidth;
      const lane = root.querySelector(`.db-lane[data-sym="${f.sym}"]`);
      lane.classList.remove('hit-up', 'hit-down'); void lane.offsetWidth;
      lane.classList.add(f.kind === 'boost' && f.d >= 0 ? 'hit-up' : 'hit-down');
    });
    // 実況
    const boost = fx.find(f => f.kind === 'boost');
    const jam = fx.find(f => f.kind === 'jam');
    _seT('draw', 80, { volume:0.7 });
    if(jam) _seT(jam.j === 'スタン' ? 'stun' : 'jam', 120);
    else if(boost && boost.d > 0) _seT('levelUp', 120, { volume:0.4 });
    if(jam){
      const lines = { 'スタン':`スタンだ！ ${symName(card.symbol)}以外の足が止まった！`, 'リンク':'リンク発動！ 速度が入れ替わる大混戦！',
        '延命':'延命カード！ 他のシンボルが少し失速！', '封印':'封印カード！ ライバルたちの脚色が鈍る！', '引き直し':'引き直しだ！ 他のシンボルが大きく減速！' };
      setCall(lines[jam.j] || 'ジャミング発動！', true);
    } else if(boost && boost.d > 0){
      setCall(`${symName(boost.sym)}に追い風！ ${card.baseScore}点カードで加速！`);
    }
  }
  function cycleFF(){
    if(!st || st.phase !== 'race') return;
    st.ff = st.ff === 1 ? 2 : st.ff === 2 ? 4 : 1;
    _se('select', { suppressTap:true, rate: 0.8 + st.ff * 0.15 });
    $('[data-act="ff"]').textContent = `▶︎×${st.ff}`;
    $('[data-act="ff"]').classList.toggle('on', st.ff > 1);
  }
  function startRace(){
    if(!st || st.phase !== 'bet') return;
    st.phase = 'race';
    st.t = 0; st.next = 0; st.ff = 1; st.finished = [];
    st.lastLeader = null; st.lastLeadCall = -9; st.stretchCalled = false;
    renderRaceLower();
    root.classList.add('racing');
    const ff = $('[data-act="ff"]'); ff.disabled = false;
    setCall('スタートしました！ 各シンボル、一斉に飛び出す！', true);
    _se('raceStart', {suppressTap:true});
    st.last = null;
    raf = requestAnimationFrame(frame);
  }
  function frame(ts){
    if(!st || st.phase !== 'race') return;
    if(st.last == null) st.last = ts;
    const real = Math.min(0.1, Math.max(0, (ts - st.last) / 1000));
    st.last = ts;
    st.acc += real * (Number(_debug.timeScale) || 1) * st.ff;
    let guard = 0;
    while(st.acc >= STEP && st.phase === 'race' && guard++ < 20000){
      if(!_debug.noCards){
        while(st.next <= st.t + 1e-9){ doDraw(); st.next += DRAW_INTERVAL; }
      }
      const done = stepRunners(st.runners, st.t, STEP);
      st.t += STEP; st.acc -= STEP;
      done.forEach(s => onFinish(s));
      if(st.finished.length >= 2) { endRace(); break; }
    }
    renderRace();
    if(st && st.phase === 'race') raf = requestAnimationFrame(frame);
  }
  function onFinish(s){
    st.finished.push(s);
    const n = st.finished.length;
    if(n === 1){ _se('raceFinish'); setCall(`${symName(s)}、1着でゴールイン！！`, true); }
    else if(n === 2) setCall(`2着は${symName(s)}！ 勝負あり！`, true);
  }
  function renderRace(){
    if(!root || !st) return;
    $('.db-time').textContent = st.t.toFixed(1);
    const nx = $('.db-next');
    if(nx) nx.textContent = _debug.noCards ? 'ドローなし' : `次のドロー ${Math.max(0, st.next - st.t).toFixed(1)}s`;
    const order = rankOf(st.runners);
    $('.db-track').classList.toggle('tape-cut', SYMS.some(s => st.runners[s].fin != null));
    SYMS.forEach(s => {
      const r = st.runners[s];
      const lane = root.querySelector(`.db-lane[data-sym="${s}"]`);
      lane.querySelector('.db-runner').style.left = (Math.min(1, r.x / DIST) * 100) + '%';
      lane.querySelector('.db-speed-num').textContent = r.v.toFixed(1);
      lane.querySelector('.db-speed-bar i').style.width = Math.min(100, r.v / 15 * 100) + '%';
      lane.classList.toggle('stopped', r.v < 0.05 && st.t > 0.5 && r.fin == null);
      lane.classList.toggle('done', r.fin != null);
      const pl = lane.querySelector('.db-place');
      const rank = order.indexOf(s) + 1;
      pl.textContent = r.fin != null ? `${rank}着 ${r.fin.toFixed(2)}s` : '';
    });
    order.forEach((s, i) => {
      const el = root.querySelector(`.db-ord[data-n="${i + 1}"] span`);
      if(el) el.innerHTML = `<span class="sym-${s}">${symIcon(s)}</span>${symName(s)}${st.runners[s].fin != null ? ' ✔' : ''}`;
    });
    // 実況（先頭交代・最後の直線）
    const lead = order[0];
    if(st.finished.length === 0){
      if(lead !== st.lastLeader && st.t - st.lastLeadCall > 2.5 && st.t > 1){
        st.lastLeadCall = st.t;
        _seT('raceTick', 400);
        setCall(st.lastLeader ? `先頭交代！ ${symName(lead)}が前に出た！` : `先頭は${symName(lead)}！`);
      }
      if(!st.stretchCalled && st.runners[lead].x > DIST * 0.8){
        st.stretchCalled = true;
        _se('heartbeat', { volume:0.7 });
        setCall(`最後の直線！ ${symName(lead)}先頭、${symName(order[1])}が追う！`, true);
      }
    }
    st.lastLeader = lead;
  }
  function endRace(){
    st.phase = 'end';
    cancelAnimationFrame(raf);
    let order = rankOf(st.runners);
    if(Array.isArray(_debug.forceOrder) && _debug.forceOrder.length){
      const f = _debug.forceOrder.filter(s => SYMS.includes(s));
      order = f.concat(SYMS.filter(s => !f.includes(s)));
    }
    st.order = order;
    renderRace();
    const R = st.runners;
    const close = (a, b) => R[a].fin != null && R[b] && (R[b].fin != null ? Math.abs(R[a].fin - R[b].fin) < 0.15 : false);
    const remainGap = (DIST - R[order[2]].x) / Math.max(0.5, R[order[2]].v);
    st.photo = close(order[0], order[1]) || remainGap < 0.15;
    root.classList.remove('racing');
    $('[data-act="ff"]').disabled = true;
    st.result = settle(st.bets, order, st.odds);
    SYMS.forEach(s => {
      root.querySelector(`.db-lane[data-sym="${s}"]`).classList.toggle('win', s === order[0]);
    });
    const go = () => { if(root && st) showResult(); };
    if(st.photo){
      root.classList.add('photo');
      _se('heartbeat');
      setCall('きわどい！ 写真判定……！', true);
      setTimeout(() => {
        if(!root) return;
        root.classList.remove('photo');
        _se('reveal');
        setCall(`判定の結果、1着${symName(order[0])}・2着${symName(order[1])}！`, true);
        setTimeout(go, reduced() ? 200 : 900);
      }, reduced() ? 300 : 1400);
    } else {
      setTimeout(go, reduced() ? 300 : 1300);
    }
  }

  // ---------- デッキ確認 ----------
  // レース中のドローは GameState.currentDeck（のコピー）から行われるため、その中身と記号別の集計を表示する。
  function deckSource(){
    return (typeof GameState !== 'undefined' && Array.isArray(GameState.currentDeck)) ? GameState.currentDeck : [];
  }
  const DECK_JAMS = ['延命', '封印', '引き直し', 'スタン', 'リンク'];
  function deckStats(cards){
    const bySym = {};
    SYMS.forEach(s => { bySym[s] = { n:0, pts:0 }; });
    const jam = {}; DECK_JAMS.forEach(j => { jam[j] = 0; });
    let other = 0, otherJam = 0;
    cards.forEach(c => {
      if(!c) return;
      if(bySym[c.symbol]){ bySym[c.symbol].n++; bySym[c.symbol].pts += Number(c.baseScore) || 0; } else other++;
      if(c.jamming){ if(jam[c.jamming] != null) jam[c.jamming]++; else otherJam++; }
    });
    return { bySym, jam, other, otherJam, total:cards.length };
  }
  function deckCardHtml(card){
    const G = (typeof GameMainScene !== 'undefined') ? GameMainScene : null;
    if(G && G.cardTagsHtml && G.cardSymbolHtml && G.cardScoreHtml){
      try{
        const tr = card.trait ? ` trait-${String(card.trait).replace(/[()]/g, '')}` : '';
        const gold = (typeof GameState !== 'undefined') ? GameState.gold : 0;
        return `<div class="card${tr}">${G.cardTagsHtml(card)}${G.cardSymbolHtml(card)}${G.cardScoreHtml(card, gold)}</div>`;
      }catch(e){ /* フォールバックへ */ }
    }
    return cardChip(card, true);
  }
  function showDeck(){
    _se('open', {suppressTap:true});
    if(!root) return;
    const layer = $('.db-deck-layer');
    const all = deckSource();
    const order = { Circle:0, Triangle:1, Square:2, Cross:3 };
    let mode = 'symbol';
    const sorted = () => {
      const a = all.slice();
      if(mode === 'symbol') a.sort((x, y) => ((order[x.symbol] ?? 9) - (order[y.symbol] ?? 9)) || ((y.baseScore || 0) - (x.baseScore || 0)));
      else if(mode === 'jam') a.sort((x, y) => (y.jamming ? 1 : 0) - (x.jamming ? 1 : 0) || ((order[x.symbol] ?? 9) - (order[y.symbol] ?? 9)));
      return a;
    };
    const s = deckStats(all);
    const symRows = SYMS.map(sym => {
      const b = s.bySym[sym];
      const per = (b.pts * BOOST_PER_POINT).toFixed(2);
      return `<div class="db-dk-sym" data-sym="${sym}"><span class="db-dk-ico sym-${sym}">${symIcon(sym)}</span><span class="db-dk-name">${symName(sym)}</span><b class="db-dk-n">${b.n}<small>枚</small></b><span class="db-dk-pts">基礎点計 <b>${b.pts}</b></span><span class="db-dk-acc">加速計 +${per}</span></div>`;
    }).join('');
    const jamRow = DECK_JAMS.map(j => `<span class="db-dk-jam${s.jam[j] ? '' : ' zero'}" data-j="${esc(j)}">${jamIcon(j)}${esc(j)} <b>${s.jam[j]}</b></span>`).join('');
    layer.innerHTML = `
      <div class="db-dk">
        <div class="db-dk-head"><h3>デッキ確認 <small>${s.total}枚</small></h3><button type="button" class="db-dk-x" data-act="dk-close" aria-label="閉じる">×</button></div>
        <p class="db-dk-note">レースのドローはこのデッキから。同じ記号のシンボルが基礎点×${BOOST_PER_POINT}加速、ジャミングは他の記号を妨害。</p>
        <div class="db-dk-syms">${symRows}</div>
        ${s.other ? `<div class="db-dk-other">その他の記号 ${s.other}枚（加速なし）</div>` : ''}
        <div class="db-dk-sec">ジャミング（他の記号を妨害）</div>
        <div class="db-dk-jams">${jamRow}${s.otherJam ? `<span class="db-dk-jam zero">その他 <b>${s.otherJam}</b></span>` : ''}</div>
        <div class="db-dk-sort"><button type="button" data-m="symbol" class="on">記号順</button><button type="button" data-m="jam">ジャミング優先</button><button type="button" data-m="default">初期順</button></div>
        <div class="db-dk-grid"></div>
        <button type="button" class="db-btn db-btn-main db-dk-close" data-act="dk-close">閉じる</button>
      </div>`;
    const grid = layer.querySelector('.db-dk-grid');
    const fill = () => { grid.innerHTML = all.length ? sorted().map(deckCardHtml).join('') : '<div class="db-drawn-empty">デッキが空です（各記号10点のカードで代用）</div>'; };
    fill();
    layer.querySelectorAll('.db-dk-sort button').forEach(b => b.addEventListener('click', () => {
      mode = b.dataset.m; fill();
      layer.querySelectorAll('.db-dk-sort button').forEach(x => x.classList.toggle('on', x === b));
    }));
    layer.querySelectorAll('[data-act="dk-close"]').forEach(b => b.addEventListener('click', hideDeck));
    layer.onclick = e => { if(e.target === layer) hideDeck(); };
    layer.classList.add('show');
  }
  function hideDeck(){
    if(!root) return;
    if($('.db-deck-layer').classList.contains('show')) _se('close', {suppressTap:true});
    const l = $('.db-deck-layer'); l.classList.remove('show'); l.innerHTML = '';
  }

  // ---------- パネル ----------
  function showPanel(html){
    const layer = $('.db-panel-layer');
    layer.innerHTML = `<div class="db-panel">${html}</div>`;
    layer.classList.add('show');
    return layer.querySelector('.db-panel');
  }
  function hidePanel(){ const l = $('.db-panel-layer'); l.classList.remove('show'); l.innerHTML = ''; }

  function showIntro(){
    const p = showPanel(`
      <div class="db-panel-runners">${SYMS.map(s => `<span class="sym-${s}">${symIcon(s)}</span>`).join('')}</div>
      <h2 class="db-panel-title">シンボルダービー</h2>
      <p class="db-lead">ビンゴ倍率で調子が決まる4シンボルのレース。<b>20G</b>を元手に1・2着を予想しよう。</p>
      <ul class="db-rules">
        <li><b>オッズ＝ビンゴ倍率÷10</b>（倍率101→10.1倍）。マイナスや1.1未満は<b>1.1倍</b>。倍率が高いほど調子が悪く<b>加速が鈍い</b>。</li>
        <li>ベットは<b>単勝</b>（1着）と<b>連複</b>（1・2着の組、順不同）のみ。連複オッズ＝<b>単勝×単勝</b>。1G単位、合計20Gまで。未ベット分は返却。</li>
        <li>スタートで全員<b>速度0</b>から加速。距離<b>${DIST}m</b>＝オッズ3.0のシンボルが30秒で走りきる距離。</li>
        <li><b>0秒から5秒ごと</b>にデッキからカードを1枚ドロー。同じ記号のシンボルが<b>基礎点×0.05</b>加速。</li>
        <li>ジャミング付きなら<b>他の記号</b>が影響：延命−0.5／封印−1.0／引き直し−1.5／スタン=速度0／リンク=他のランダムなシンボルと同じ速度。</li>
        <li>受け取りは<b>最大100G</b>。合計（返却＋払戻）が<b>120G超</b>なら<b>特別アップグレード1枚</b>を追加。</li>
      </ul>
      <button type="button" class="db-btn db-btn-main" data-act="go">オッズを見る</button>`);
    p.querySelector('[data-act="go"]').addEventListener('click', () => { _se('confirm', {suppressTap:true}); hidePanel(); st.phase = 'bet'; renderBets(); setCall('本日のオッズが発表されました。ベットをどうぞ！'); });
  }

  function showResult(){
    const r = st.result, o = st.order;
    st.win = r.payout > 0;
    const lines = r.lines.length ? r.lines.map(l => `
      <tr class="${l.hit ? 'hit' : 'miss'}"><td>${keyLabel(l.key)}</td><td>${l.amount}G×${fmtOdds(l.odds)}</td><td>${l.hit ? `<b>+${l.pay}G</b>` : 'はずれ'}</td></tr>`).join('')
      : `<tr class="miss"><td colspan="3">ベットなし</td></tr>`;
    const capped = r.total > CAP;
    const p = showPanel(`
      <div class="db-result ${st.win ? 'win' : 'lose'}">${st.win ? '的中！' : 'はずれ…'}</div>
      <div class="db-podium">${o.map((s, i) => `<div class="db-pod p${i + 1}"><small>${i + 1}着</small><span class="sym-${s}">${symIcon(s)}</span><em>${symName(s)}</em></div>`).join('')}</div>
      <table class="db-pay">${lines}</table>
      <div class="db-sum">
        <div><span>返却（未ベット）</span><b>${r.unbet}G</b></div>
        <div><span>払戻</span><b>${r.payout}G</b></div>
        <div class="tot"><span>合計</span><b>${r.total}G</b></div>
      </div>
      <div class="db-reward">獲得：<b>${r.gold}G</b>${capped ? '<small>（上限100G）</small>' : ''}${r.special ? '<div class="db-special">120G超え！ 特別アップグレード×1</div>' : ''}</div>
      <button type="button" class="db-btn db-btn-main" data-act="close">戻る</button>`);
    if(st.win){ _se('win'); setTimeout(() => _se('coin'), 300); if(r.special || r.payout >= 40) setTimeout(() => _se('fanfare'), 600); }
    else _se('lose');
    p.querySelector('[data-act="close"]').addEventListener('click', () => { _se(r.gold > 0 ? 'coin' : 'close', {suppressTap:true}); close(); });
  }

  function summaryText(){
    const r = st.result, o = st.order;
    if(!r || !o) return 'シンボルダービー：レース中止。';
    let s = `シンボルダービー：1着${symName(o[0])}・2着${symName(o[1])}。`;
    s += r.wager ? `ベット${r.wager}G→払戻${r.payout}G（返却${r.unbet}G）、${r.gold}G獲得` : `ベットなし、${r.gold}G返却`;
    if(r.total > CAP) s += '（上限100G）';
    if(r.special) s += '＋特別アップグレード1枚';
    return s + '。';
  }

  function close(){
    if(!root) return;
    cancelAnimationFrame(raf);
    const r = st && st.result;
    const res = r
      ? { win:r.payout > 0, reward:{ gold:r.gold, special:r.special }, summary:summaryText() }
      : { win:false, reward:{ gold:STAKE, special:0 }, summary:'シンボルダービー：レースは行われなかった。20G返却。' };
    const fn = resolveFn;
    root.classList.add('closing');
    const el = root;
    root = null; resolveFn = null; st = null; _debug.state = null;
    document.removeEventListener('keydown', onKey, true);
    setTimeout(() => { el.remove(); }, reduced() ? 0 : 220);
    if(fn) fn(res);
  }
  function onKey(e){
    if(!root) return;
    e.stopPropagation();
    if(e.key === 'Escape' && $('.db-deck-layer').classList.contains('show')) hideDeck();
  }

  function open(opts){
    opts = opts || {};
    if(root) return Promise.resolve({ win:false, reward:{ gold:0, special:0 }, summary:'' });
    const odds = currentOdds();
    st = {
      floor:Number(opts.floor) || 1, odds, bets:{}, phase:'intro',
      runners:newRunners(odds), pile:makeDeck(), drawn:[],
      t:0, next:0, acc:0, ff:1, finished:[], order:null, result:null, win:false,
    };
    _debug.state = st;
    _se('open');
    build();
    renderGates();
    renderRace();
    document.addEventListener('keydown', onKey, true);
    showIntro();
    return new Promise(res => { resolveFn = res; });
  }

  _debug.applyCard = card => (st ? applyCardTo(st.runners, card) : null);
  _debug.simulate = simulate;
  _debug.showDeck = () => showDeck();
  _debug.hideDeck = () => hideDeck();
  _debug.setBets = setBets;
  _debug.startRace = () => { if(st && st.phase === 'intro'){ hidePanel(); st.phase = 'bet'; renderBets(); } startRace(); };

  return {
    open, isOpen:() => !!root,
    oddsFromMult, currentOdds, pairOdds, settle, applyCardTo, newRunners, simulate,
    SYMS, PAIRS, DIST, STAKE, CAP, BONUS_LINE, JAM_DELTA, BOOST_PER_POINT, DRAW_INTERVAL,
    _debug,
  };
})();
