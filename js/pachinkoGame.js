/* pachinkoGame.js — ミニゲーム「パチンコ」
 * 公開API（グローバル const PachinkoGame）:
 *   PachinkoGame.open({floor}) -> Promise<{win:boolean, reward:{gold:number, special:number}, summary:string}>
 *     全画面オーバーレイを閉じたときに resolve。報酬の付与は行わない（呼び出し側の責務）。
 *   PachinkoGame.isOpen()
 *   PachinkoGame.jumpVelocity(base) -> number   カード基礎点からジャンプ初速（上向き・px/frame）
 *   PachinkoGame._debug  テスト用 { rng, forceZone, speed, state, autoLaunchDelay }
 *     rng: () => 0..1 の上書き / forceZone: 0..4 を指定すると着地する報酬枠の位置を強制 /
 *     speed: 物理の時間倍率（1=通常）/ state: 進行状態の参照 / zoneLog: 各球の発射前・再シャッフル時の並び / escapes: 盤外逸脱の補正回数
 * ルール:
 *   デッキからランダムに8枚（コピー）が配られ、5枚を選んで盤面下の5つのスロット（左→右）に嵌める。
 *   盤面はピンボール台：上部は角丸アーチ、右端の発射レーンからプランジャーで球を打ち出し、アーチに沿って盤面へ。
 *   棒・バンパー（当たると弾き返す）・スリングショット・アウトレーンのスラントを経て、底面の5つのポケット（仕切り付き）に入ったら1回分。
 *   報酬ポケット：何もなし／1G／10G／特別アップグレード／特別アップグレード（開始時にシャッフル、2球目の前にも再シャッフル）。
 *   球の落下中にスロットのカードをタップすると、スロット位置→球の位置の向きへ、カード基礎点に応じた強さで球を弾く（各カード1球につき1回）。
 *   ジャミング効果があればスロットの列に応じて発動：
 *     サンダー：その列の障害物を全て破壊 / 誘導：球の向きをその列へ変更 /
 *     封印：その列の球より下に障害物を1つ配置 / 引き直し：報酬ゾーンの並びがランダムに変わる。
 *   チャンスは2回（2球）。各球の報酬を合算する。
 */
const PachinkoGame = (function(){
  'use strict';
  const _se=(n,o)=>{ try{ if(typeof SFX!=='undefined') SFX.play(n,o); }catch(e){} };
  let _sePegT = 0;
  const _sePeg = (y, seal) => { const now = (typeof performance!=='undefined'?performance.now():Date.now()); if(now - _sePegT < 55) return; _sePegT = now; _se('peg', { rate: 0.8 + Math.random() * 0.5 + (seal ? -0.25 : 0), volume: 0.45 }); };
  let _seBumpT = 0;
  const _seBump = rate => { const now = (typeof performance!=='undefined'?performance.now():Date.now()); if(now - _seBumpT < 70) return; _seBumpT = now; _se('jump', { rate: clamp(rate * (0.95 + Math.random() * 0.15), 0.7, 1.6), volume: 0.5 }); };

  const HAND_SIZE = 8, SLOT_N = 5, BALLS = 2;
  const ZONES = [
    { key:'none',    label:'何もなし',          short:'ハズレ',  gold:0,  special:0 },
    { key:'g1',      label:'1G',               short:'1G',     gold:1,  special:0 },
    { key:'g10',     label:'10G',              short:'10G',    gold:10, special:0 },
    { key:'sp',      label:'特別アップグレード', short:'特別UP',  gold:0,  special:1 },
    { key:'sp',      label:'特別アップグレード', short:'特別UP',  gold:0,  special:1 },
  ];
  const ACTIVE_JAMS = { 'サンダー':'列の障害物を全破壊', '誘導':'球をこの列へ誘導', '封印':'球の下に障害物を配置', '引き直し':'報酬枠をシャッフル' };

  // 物理定数（論理座標：盤面幅 W=360）
  const W = 360, BALL_R = 7, PEG_R = 4.5, GRAV = 0.16, MAX_FALL = 6.5, MAX_SPEED = 15, REST = 0.48, SUBSTEPS = 3;
  // ピンボール台の形状（論理座標）：上部コーナー円弧の半径／発射レーン／ポケット／バンパー
  const ARC_R = 100, LANE_X = 336, LANE_TOP = 120, LANE_CX = (336 + 360) / 2, FIELD_W = 336, POCKET_H = 34, SEG_R = 2, BUMPER_R = 13, BUMPER_KICK = 3.2;

  const _debug = { rng:null, forceZone:null, speed:1, state:null, autoLaunchDelay:1, zoneLog:[], escapes:0 };
  const rnd = () => (_debug.rng ? _debug.rng() : Math.random());

  let st = null, root = null, resolveFn = null, canvas = null, ctx = null, rafId = 0, pegSprite = null, ballSprite = null;

  // ---------- ユーティリティ ----------
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const reduced = () => { try{ return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){ return false; } };
  const wait = ms => new Promise(r => setTimeout(r, (reduced() ? Math.min(ms, 200) : ms) * (_debug.autoLaunchDelay == null ? 1 : _debug.autoLaunchDelay)));
  const $ = sel => root ? root.querySelector(sel) : null;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const COLW = W / SLOT_N;

  function rawBase(card){
    let b = Number(card && card.baseScore) || 0;
    if(card && card.enhance === 'ギャンブル' && card._gambleDelta) b -= card._gambleDelta;
    return Math.max(0, b);
  }
  // ジャンプ初速：基礎点に比例（上限あり）。負値で返す（大きさとして使用）
  function jumpVelocity(base){
    const b = Math.max(0, Number(base) || 0);
    return -clamp(4 + b * 0.18, 4, MAX_SPEED);
  }
  function cloneCard(c){ try{ return JSON.parse(JSON.stringify(c)); }catch(e){ return Object.assign({}, c); } }
  function shuffle(a){ for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  function dealHand(){
    const deck = (typeof GameState !== 'undefined' && Array.isArray(GameState.currentDeck)) ? GameState.currentDeck : [];
    const idx = shuffle(deck.map((_, i) => i));
    const hand = idx.slice(0, HAND_SIZE).map((i, k) => ({ uid:'h' + k, card:cloneCard(deck[i]) }));
    while(hand.length < SLOT_N) hand.push({ uid:'h' + hand.length, card:{ symbol:'Circle', number:10, baseScore:10 } });
    hand.forEach(h => { h.base = rawBase(h.card); });
    return hand;
  }

  function cardInnerHtml(card){
    const G = (typeof GameMainScene !== 'undefined') ? GameMainScene : null;
    if(G && G.cardTagsHtml && G.cardSymbolHtml && G.cardScoreHtml){
      try{
        const gold = (typeof GameState !== 'undefined') ? GameState.gold : 0;
        return G.cardTagsHtml(card) + G.cardSymbolHtml(card) + G.cardScoreHtml(card, gold);
      }catch(e){ /* フォールバックへ */ }
    }
    return `<div class="pc-fallback-val">${rawBase(card)}</div>`;
  }
  function cardHtml(card){
    const tr = card.trait ? ' trait-' + String(card.trait).replace(/[()]/g, '') : '';
    return `<div class="card${tr}">${cardInnerHtml(card)}</div>`;
  }
  function jamIcon(name){
    try{ if(typeof GameData !== 'undefined' && GameData.iconFor){ const s = GameData.iconFor('jamming', name); if(s) return s; } }catch(e){}
    return '';
  }
  function zoneIcon(z){
    if(z.key === 'none') return '<span class="pc-z-ico pc-z-none">×</span>';
    if(z.key === 'sp') return `<span class="pc-z-ico pc-z-star">★</span>`;
    return `<span class="pc-z-ico pc-z-coin">${GIcon('gold_coin')}</span>`;
  }

  // ---------- 盤面生成（ピンボール台） ----------
  // 上部は角丸アーチ（左右のコーナー円弧）、右端に発射レーン（プランジャー）。
  // 下部は左右のスラント（アウトレーン）とスリングショット、底面は仕切りで区切った5つのポケット。
  function buildTable(H){
    const PLY = H - 110;                       // プランジャー（発射台）上面
    const segs = [];
    const seg = (x1, y1, x2, y2, o) => { const s = Object.assign({ x1, y1, x2, y2, rest:0.45, kick:0, hit:0, kind:'rail' }, o || {}); segs.push(s); return s; };
    // 発射レーンの壁と発射台のハウジング
    seg(LANE_X, LANE_TOP, LANE_X, PLY, { kind:'lane' });
    seg(LANE_X, PLY, W, PLY, { kind:'plate', rest:0.2 });
    seg(LANE_X, PLY, LANE_X, PLY + 12, { kind:'housing' });
    seg(LANE_X, PLY + 12, W, PLY + 14, { kind:'housing' });
    // ゲート（球がレーンを出たら閉じる一方通行）
    const gate = seg(LANE_X, 26, LANE_X, LANE_TOP, { kind:'gate', off:true });
    // アウトレーンのスラント（内側へ寄せる）
    seg(0, PLY + 14, 18, H - 56, { kind:'slant', rest:0.35 });
    seg(W, PLY + 14, W - 18, H - 56, { kind:'slant', rest:0.35 });
    // スリングショット（キッカー面＋背面）
    const slings = [];
    const sling = (ax, ay, bx, by, backx) => {
      const k = seg(ax, ay, bx, by, { kind:'sling', rest:0.6, kick:3.4 });
      seg(backx, ay, backx, by - 8, { kind:'slingback' });
      seg(backx, by - 8, bx, by, { kind:'slingback' });
      slings.push({ k, ax, ay, bx, by, backx });
    };
    sling(36, H - 132, 58, H - 90, 36);
    sling(FIELD_W - 36, H - 132, FIELD_W - 58, H - 90, FIELD_W - 36);
    // ポケットの仕切り
    for(let k = 1; k < SLOT_N; k++) seg(COLW * k, H - POCKET_H, COLW * k, H + 20, { kind:'divider', rest:0.3 });
    // バンパー（三角配置）
    const by = Math.round(clamp(H * 0.30, 150, 210));
    const bumpers = [
      { x:FIELD_W / 2 - 58, y:by,      r:BUMPER_R, hit:0, hue:330 },
      { x:FIELD_W / 2 + 58, y:by,      r:BUMPER_R, hit:0, hue:190 },
      { x:FIELD_W / 2,      y:by + 54, r:BUMPER_R, hit:0, hue:45 },
    ];
    const arcs = [
      { cx:ARC_R, cy:ARC_R, r:ARC_R, side:-1 },
      { cx:W - ARC_R, cy:ARC_R, r:ARC_R, side:1 },
    ];
    // 棒（バンパー・アーチ外・レーンを避けて千鳥配置）
    const pegs = [];
    const yEnd = H - 152;
    let row = 0;
    // アーチ直下の上段（打ち出された球を散らす）
    for(let x = 114; x <= 222; x += 36) pegs.push(mkPeg(x, 80));
    for(let y = 118; y <= yEnd; y += 36, row++){
      for(let x = (row % 2 ? 48 : 30); x <= LANE_X - 14; x += 36){
        if(bumpers.some(b => Math.hypot(b.x - x, b.y - y) < b.r + PEG_R + 17)) continue;
        if(arcs.some(a => y < a.cy && (a.side < 0 ? x < a.cx : x > a.cx) && Math.hypot(x - a.cx, y - a.cy) > a.r - 20)) continue;
        pegs.push(mkPeg(x, y));
      }
    }
    // スリングの上に2本ずつ
    pegs.push(mkPeg(70, H - 150)); pegs.push(mkPeg(FIELD_W - 70, H - 150));
    return { PLY, segs, gate, slings, bumpers, arcs, pegs };
  }
  function mkPeg(x, y, extra){ return Object.assign({ x, y, r:PEG_R, alive:true, hit:0, fade:0, born:0 }, extra || {}); }

  function makeSprites(){
    const dpr = 3;
    pegSprite = document.createElement('canvas');
    const ps = 16; pegSprite.width = pegSprite.height = ps * dpr;
    let c = pegSprite.getContext('2d'); c.scale(dpr, dpr);
    let g = c.createRadialGradient(ps / 2 - 1.6, ps / 2 - 1.8, .4, ps / 2, ps / 2, PEG_R + .6);
    g.addColorStop(0, '#ffffff'); g.addColorStop(.35, '#d6dbe6'); g.addColorStop(.75, '#7d8597'); g.addColorStop(1, '#3a4152');
    c.fillStyle = 'rgba(0,0,0,.45)'; c.beginPath(); c.arc(ps / 2 + .8, ps / 2 + 1.4, PEG_R + .4, 0, Math.PI * 2); c.fill();
    c.fillStyle = g; c.beginPath(); c.arc(ps / 2, ps / 2, PEG_R + .4, 0, Math.PI * 2); c.fill();
    ballSprite = document.createElement('canvas');
    const bs = 44; ballSprite.width = ballSprite.height = bs * dpr;
    c = ballSprite.getContext('2d'); c.scale(dpr, dpr);
    g = c.createRadialGradient(bs / 2, bs / 2, 0, bs / 2, bs / 2, bs / 2);
    g.addColorStop(0, 'rgba(255,236,170,.75)'); g.addColorStop(.35, 'rgba(255,190,80,.28)'); g.addColorStop(1, 'rgba(255,160,40,0)');
    c.fillStyle = g; c.fillRect(0, 0, bs, bs);
    g = c.createRadialGradient(bs / 2 - 2.4, bs / 2 - 2.6, .5, bs / 2, bs / 2, BALL_R);
    g.addColorStop(0, '#ffffff'); g.addColorStop(.3, '#f8f2e0'); g.addColorStop(.7, '#c9b98e'); g.addColorStop(1, '#6b5a33');
    c.fillStyle = g; c.beginPath(); c.arc(bs / 2, bs / 2, BALL_R, 0, Math.PI * 2); c.fill();
  }

  // ---------- DOM ----------
  function build(){
    root = document.createElement('div');
    root.className = 'pc-overlay';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'パチンコ');
    root.innerHTML = `
      <div class="pc-bg"></div>
      <div class="pc-main">
        <div class="pc-top">
          <div class="pc-title">パチンコ</div>
          <div class="pc-balls"></div>
          <div class="pc-total"></div>
        </div>
        <div class="pc-cab">
          <div class="pc-board"><canvas class="pc-canvas"></canvas><div class="pc-flash"></div><div class="pc-banner"></div><div class="pc-sheet pc-scroll"></div></div>
          <div class="pc-zones"></div>
          <div class="pc-slots"></div>
        </div>
        <div class="pc-foot"><div class="pc-msg"></div><div class="pc-actions"></div></div>
        <div class="pc-panel-wrap"></div>
      </div>`;
    document.body.appendChild(root);
    canvas = $('.pc-canvas');
    ctx = canvas.getContext('2d');
    // 誤スクロール・ズーム防止
    root.addEventListener('touchmove', e => { if(!e.target.closest('.pc-scroll')) e.preventDefault(); }, { passive:false });
  }

  function sizeBoard(){
    const b = $('.pc-board');
    const r = b.getBoundingClientRect();
    const cw = Math.max(200, r.width), ch = Math.max(240, r.height);
    const H = Math.round(W * ch / cw);
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
    st.H = H; st.scale = cw / W * dpr;
  }

  function renderTop(){
    const balls = $('.pc-balls');
    if(balls) balls.innerHTML = Array.from({ length:BALLS }, (_, i) => {
      const r = st.results[i];
      const cls = r ? 'done' : (i === st.ballIdx && st.phase !== 'setup' && st.phase !== 'intro' ? 'cur' : '');
      return `<span class="pc-bpip ${cls}"><i></i>${r ? esc(r.short) : (i + 1) + '球目'}</span>`;
    }).join('');
    GGoldifyDom(balls);
    const t = $('.pc-total');
    if(t) t.innerHTML = `<span class="pc-tg">${GCoinAmt(st.reward.gold)}</span><span class="pc-ts">★${st.reward.special}</span>`;
  }

  function renderZones(animate){
    const el = $('.pc-zones'); if(!el) return;
    let first = null;
    if(animate && !reduced()){
      first = {};
      el.querySelectorAll('.pc-zone').forEach(z => { first[z.dataset.id] = z.getBoundingClientRect().left; });
    }
    el.innerHTML = st.zones.map((z, i) => `<div class="pc-zone pc-zone-${z.key}" data-id="${z.id}" data-pos="${i}">${zoneIcon(z)}<span class="pc-z-lab">${z.gold ? esc(String(z.short).replace(/G$/, '')) : esc(z.short)}</span></div>`).join('');
    if(first){
      el.querySelectorAll('.pc-zone').forEach(z => {
        const dx = (first[z.dataset.id] || 0) - z.getBoundingClientRect().left;
        if(!dx) return;
        z.style.transition = 'none'; z.style.transform = `translateX(${dx}px)`;
        requestAnimationFrame(() => { requestAnimationFrame(() => { z.style.transition = ''; z.style.transform = ''; z.classList.add('shuffled'); }); });
      });
    }
  }

  function slotCaption(h){
    if(!h) return '<span class="pc-cap-empty">空き</span>';
    const j = h.card.jamming && ACTIVE_JAMS[h.card.jamming] ? h.card.jamming : null;
    return j ? `<span class="pc-cap-jam">${jamIcon(j)}${esc(j)}</span>` : `<span class="pc-cap-jump">ジャンプ</span>`;
  }
  function renderSlots(){
    const el = $('.pc-slots'); if(!el) return;
    el.innerHTML = st.slots.map((uid, i) => {
      const h = uid ? st.hand.find(x => x.uid === uid) : null;
      const used = st.used[i];
      const sel = st.sel && st.sel.type === 'slot' && st.sel.i === i;
      const armed = st.phase === 'fall' && h && !used;
      const jam = h && h.card.jamming && ACTIVE_JAMS[h.card.jamming] ? ' jam-' + ({ 'サンダー':'thunder','誘導':'guide','封印':'seal','引き直し':'redraw' }[h.card.jamming]) : '';
      return `<button type="button" class="pc-slot${h ? ' filled' : ''}${used ? ' used' : ''}${sel ? ' sel' : ''}${armed ? ' armed' : ''}${jam}" data-slot="${i}" aria-label="スロット${i + 1}">
        <span class="pc-slot-card">${h ? `<span class="pc-cscale">${cardHtml(h.card)}</span>` : `<span class="pc-slot-no">${i + 1}</span>`}</span>
        <span class="pc-slot-cap">${slotCaption(h)}</span>
        ${used ? '<span class="pc-used">使用済</span>' : ''}
      </button>`;
    }).join('');
    el.querySelectorAll('.pc-slot').forEach(b => {
      b.addEventListener('pointerdown', e => { e.preventDefault(); onSlotTap(Number(b.dataset.slot)); });
      b.addEventListener('click', e => e.preventDefault());
    });
  }

  function renderSheet(){
    const sh = $('.pc-sheet'); if(!sh) return;
    if(st.phase !== 'setup'){ sh.classList.remove('show'); return; }
    const placed = new Set(st.slots.filter(Boolean));
    const nFilled = placed.size;
    sh.classList.add('show');
    sh.innerHTML = `
      <div class="pc-sheet-head">
        <div class="pc-sheet-title">カードを5枚選んでスロットへ <b>${nFilled}/5</b></div>
        <div class="pc-sheet-sub">タップで左から配置。スロットをタップ→入れ替え／再タップで外す</div>
      </div>
      <div class="pc-hand">${st.hand.map(h => {
        const isPlaced = placed.has(h.uid);
        const sel = st.sel && st.sel.type === 'hand' && st.sel.uid === h.uid;
        const j = h.card.jamming && ACTIVE_JAMS[h.card.jamming] ? h.card.jamming : null;
        return `<button type="button" class="pc-hcard${isPlaced ? ' placed' : ''}${sel ? ' sel' : ''}" data-uid="${h.uid}">
          <span class="pc-cscale">${cardHtml(h.card)}</span>
          <span class="pc-hcap">${j ? `<span class="pc-cap-jam">${jamIcon(j)}${esc(j)}</span>` : `<span class="pc-cap-jump">ジャンプ</span>`}</span>
          ${isPlaced ? `<span class="pc-placed-no">${st.slots.indexOf(h.uid) + 1}</span>` : ''}
        </button>`;
      }).join('')}</div>
      <div class="pc-jam-legend">${Object.keys(ACTIVE_JAMS).map(k => `<span>${jamIcon(k)}<b>${esc(k)}</b>${esc(ACTIVE_JAMS[k])}</span>`).join('')}</div>
      <div class="pc-sheet-actions">
        <button type="button" class="pc-btn pc-btn-sub" data-act="auto">おまかせ</button>
        <button type="button" class="pc-btn pc-btn-main" data-act="start"${nFilled < SLOT_N ? ' disabled' : ''}>スタート</button>
      </div>`;
    sh.querySelectorAll('.pc-hcard').forEach(b => b.addEventListener('click', () => onHandTap(b.dataset.uid)));
    sh.querySelector('[data-act="auto"]').addEventListener('click', autoFill);
    sh.querySelector('[data-act="start"]').addEventListener('click', () => { if(st.slots.every(Boolean)){ _se('confirm', {suppressTap:true}); startPlay(); } else _se('error', {suppressTap:true}); });
  }

  function setMsg(html){ const m = $('.pc-msg'); if(m){ m.innerHTML = html || ''; GGoldifyDom(m); } }
  function setActions(html){ const a = $('.pc-actions'); if(a) a.innerHTML = html || ''; return a; }
  function banner(text, cls){
    const b = $('.pc-banner'); if(!b) return;
    b.className = 'pc-banner'; void b.offsetWidth;
    b.textContent = text; b.className = 'pc-banner show ' + (cls || '');
  }
  function flash(cls){
    const f = $('.pc-flash'); if(!f || reduced()) return;
    f.className = 'pc-flash'; void f.offsetWidth; f.className = 'pc-flash on ' + (cls || '');
  }
  function renderAll(){ renderTop(); renderZones(false); renderSlots(); renderSheet(); }

  // ---------- セットアップ操作 ----------
  function placeInSlot(uid, i){
    const prev = st.slots.indexOf(uid);
    if(prev >= 0) st.slots[prev] = null;
    st.slots[i] = uid;
  }
  function onHandTap(uid){
    if(!st || st.phase !== 'setup') return;
    const at = st.slots.indexOf(uid);
    if(st.sel && st.sel.type === 'slot'){
      placeInSlot(uid, st.sel.i); st.sel = null; _se('place', {suppressTap:true});
    } else if(at >= 0){
      st.slots[at] = null; st.sel = null;            // 配置済みの札をタップ → 外す
      _se('deselect', {suppressTap:true});
    } else {
      const empty = st.slots.indexOf(null);
      if(empty >= 0){ st.slots[empty] = uid; st.sel = null; _se('place', {suppressTap:true}); }
      else { st.sel = (st.sel && st.sel.uid === uid) ? null : { type:'hand', uid }; _se(st.sel ? 'select' : 'deselect', {suppressTap:true}); }
    }
    renderSlots(); renderSheet();
    setupMsg();
  }
  function onSlotTap(i){
    if(!st) return;
    if(st.phase === 'fall'){ useCard(i); return; }
    if(st.phase !== 'setup') return;
    const s = st.sel;
    if(s && s.type === 'hand'){ placeInSlot(s.uid, i); st.sel = null; _se('place'); }
    else if(s && s.type === 'slot'){
      if(s.i === i){ st.slots[i] = null; _se('deselect'); }
      else { const t = st.slots[i]; st.slots[i] = st.slots[s.i]; st.slots[s.i] = t; _se('place'); }
      st.sel = null;
    } else if(st.slots[i]){ st.sel = { type:'slot', i }; _se('select'); }
    else _se('tap', { volume:0.5 });
    renderSlots(); renderSheet();
    setupMsg();
  }
  function setupMsg(){
    if(st.sel && st.sel.type === 'slot') setMsg('入れ替え先のスロット／カードをタップ（同じスロットで外す）');
    else if(st.sel && st.sel.type === 'hand') setMsg('嵌めるスロットをタップ');
    else setMsg(st.slots.every(Boolean) ? '準備OK！「スタート」で球が排出されます' : 'カードを選んでスロットに嵌めよう');
  }
  function autoFill(){
    if(!st || st.phase !== 'setup') return;
    const rest = shuffle(st.hand.filter(h => !st.slots.includes(h.uid)).map(h => h.uid));
    for(let i = 0; i < SLOT_N; i++) if(!st.slots[i]) st.slots[i] = rest.shift() || null;
    st.sel = null;
    _se('shuffle', {suppressTap:true});
    renderSlots(); renderSheet(); setupMsg();
  }

  // ---------- 進行 ----------
  function showIntro(){
    st.phase = 'intro';
    const wrap = $('.pc-panel-wrap');
    const order = st.zones.map(z => z.short).join('｜');
    wrap.innerHTML = `<div class="pc-panel pc-intro">
      <div class="pc-p-title">パチンコ</div>
      <div class="pc-p-body pc-scroll">
        <p><b>8枚</b>から<b>5枚</b>をスロットに嵌め、球を<b>報酬ゾーン</b>へ。球は<b>2球</b>。</p>
        <p>落下中にカードを<b>タップ</b>で<b>基礎点</b>に応じて球がジャンプ（各カード<b>1球1回</b>）。<b>2球目</b>の前に報酬ポケットの並びがシャッフルされる。</p>
        <ul class="pc-p-jams">${Object.keys(ACTIVE_JAMS).map(k => `<li>${jamIcon(k)}<b>${esc(k)}</b>：${esc(ACTIVE_JAMS[k])}</li>`).join('')}</ul>
        <div class="pc-p-rewards">報酬ゾーン：${esc(order)}</div>
      </div>
      <button type="button" class="pc-btn pc-btn-main" data-act="go">カードを選ぶ</button>
    </div>`;
    GGoldifyDom(wrap);
    wrap.classList.add('show');
    wrap.querySelector('[data-act="go"]').addEventListener('click', () => {
      _se('confirm', {suppressTap:true});
      wrap.classList.remove('show'); wrap.innerHTML = '';
      st.phase = 'setup'; renderAll(); setupMsg();
    });
  }

  function startPlay(){
    st.phase = 'ready'; st.sel = null;
    renderSheet(); renderSlots();
    setActions('');
    launchBall();
  }

  async function launchBall(){
    if(!st) return;
    st.phase = 'ready';
    st.used = Array(SLOT_N).fill(false);
    st.rest = null; st.glow = null;
    st.tbl.gate.off = true;
    renderSlots(); renderTop();
    _debug.zoneLog.push({ ball:st.ballIdx, order:st.zones.map(z => z.short) });
    banner(`${st.ballIdx + 1}球目`, 'ball');
    setMsg('プランジャーを引いています…');
    await wait(700);
    if(!root || !st) return;
    chargeBall();
    renderSlots(); renderTop();
  }
  // 発射台に球を載せてプランジャーを引く（引き切ったら step() 内で発射）
  function chargeBall(){
    const y = st.tbl.PLY - BALL_R - 1;
    st.ball = { x:LANE_CX, y, vx:0, vy:0, trail:[], still:0, lx:LANE_CX, sx0:LANE_CX, sy0:y, frames:0 };
    st.plunger = 0;
    st.phase = 'charge';
  }
  function fireBall(){
    const b = st.ball, PLY = st.tbl.PLY;
    b.y = PLY - BALL_R - 1; b.x = LANE_CX;
    const vmin = Math.sqrt(2 * GRAV * Math.max(60, PLY - BALL_R - 70));
    b.vx = 0; b.vy = -clamp(vmin * (1.0 + rnd() * 0.24), 6, MAX_SPEED);
    st.plunger = 0; st.plungerKick = 1;
    st.phase = 'launch';
    _se('ball');
    setMsg('発射！');
  }

  function useCard(i){
    const uid = st.slots[i];
    if(!uid || st.used[i] || !st.ball){ if(st.ball) _se('error', { volume:0.5 }); return; }
    const h = st.hand.find(x => x.uid === uid); if(!h) return;
    st.used[i] = true;
    const b = st.ball;
    const cx = COLW * (i + 0.5);
    // ジャンプ：スロット位置→球の位置の向きへ弾く（強さは基礎点に比例）
    const sp = slotPoint(i);
    let dx = b.x - sp.x, dy = b.y - sp.y, dl = Math.hypot(dx, dy);
    if(dl < 1e-3){ dx = 0; dy = -1; dl = 1; }
    const mag = -jumpVelocity(h.base);
    b.vx = dx / dl * mag; b.vy = dy / dl * mag;
    b.still = 0;
    st.lastPush = { slot:i, sx:sp.x, sy:sp.y, bx:b.x, by:b.y, nx:dx / dl, ny:dy / dl, mag };
    st.fx.push({ type:'push', sx:sp.x, sy:sp.y, x:b.x, y:b.y, t:0, life:22 });
    burst(b.x, b.y, '#ffe9a8', 10);
    _se('jump', { rate: clamp(0.8 + h.base / 120, 0.8, 1.6) });
    const jam = h.card.jamming;
    let note = `ジャンプ！（基礎点${h.base}）`;
    if(jam === 'サンダー'){
      let n = 0;
      // 列の範囲（境界線上の棒も含む）にある障害物を全て破壊
      st.pegs.forEach(p => { if(p.alive && p.x >= COLW * i - 0.5 && p.x <= COLW * (i + 1) + 0.5){ p.alive = false; p.fade = 1; n++; burst(p.x, p.y, '#bfe3ff', reduced() ? 2 : 6); } });
      st.fx.push({ type:'bolt', col:i, t:0, life:34, seed:Math.floor(rnd() * 1e6) });
      flash('thunder'); _se('thunder');
      note = `サンダー！ ${i + 1}列目の障害物を${n}本破壊`;
      st.stats.thunder++;
    } else if(jam === '誘導'){
      const dx = cx - b.x;
      b.vx = clamp(dx / 22, -6, 6);
      if(Math.abs(dx) < 4) b.vx = 0;
      st.fx.push({ type:'guide', col:i, x:b.x, y:b.y, t:0, life:40 });
      note = `誘導！ 球を${i + 1}列目へ`; _se('jam');
      st.stats.guide++;
    } else if(jam === '封印'){
      const p = placeSealPeg(i, b.y);
      if(p){ st.fx.push({ type:'ring', x:p.x, y:p.y, t:0, life:30 }); note = `封印！ ${i + 1}列目に障害物を配置`; }
      else note = '封印！ …置ける場所がなかった';
      _se('jam', { pitch:-3 });
      st.stats.seal++;
    } else if(jam === '引き直し'){
      reshuffleZones();
      note = '引き直し！ 報酬ゾーンが入れ替わった';
      st.stats.redraw++;
    }
    st.log.push({ ball:st.ballIdx, slot:i, jam:jam || null });
    setMsg(note);
    renderSlots();
  }

  // スロット中心を盤面の論理座標へ変換（盤面の下・DOM位置から算出。取得できなければ列中央・盤面下端）
  function slotPoint(i){
    const fb = { x:COLW * (i + 0.5), y:st.H + 30 };
    try{
      const el = root && root.querySelector(`.pc-slot[data-slot="${i}"]`);
      const cr = canvas && canvas.getBoundingClientRect();
      if(!el || !cr || !cr.width) return fb;
      const r = el.getBoundingClientRect();
      if(!r.width) return fb;
      const k = W / cr.width;
      return { x:(r.left + r.width / 2 - cr.left) * k, y:(r.top + r.height / 2 - cr.top) * k };
    }catch(e){ return fb; }
  }

  function placeSealPeg(col, by){
    const top = by + BALL_R + PEG_R + 26, bottom = st.H - POCKET_H - 18;
    if(top > bottom) return null;
    const x0 = Math.max(12, COLW * col + 12), x1 = Math.min(LANE_X - 14, COLW * (col + 1) - 12);
    if(x1 <= x0) return null;
    const cxm = (x0 + x1) / 2;
    // 列内の候補から、既存の棒・バンパー・レールと最も離れた位置を選ぶ（球より下・列の範囲内）
    let best = null, bestD = -Infinity;
    for(let tries = 0; tries < 60; tries++){
      const x = x0 + rnd() * (x1 - x0);
      const y = top + rnd() * Math.min(160, bottom - top);
      let md = Infinity;
      for(const p of st.pegs){ if(p.alive){ const d = Math.hypot(p.x - x, p.y - y); if(d < md) md = d; } }
      let ok = true;
      for(const bp of st.tbl.bumpers) if(Math.hypot(bp.x - x, bp.y - y) < bp.r + PEG_R + 16) ok = false;
      for(const s of st.tbl.segs) if(!s.off && segDist(x, y, s) < PEG_R + 16) ok = false;
      for(const a of st.tbl.arcs) if(y < a.cy && (a.side < 0 ? x < a.cx : x > a.cx) && Math.hypot(x - a.cx, y - a.cy) > a.r - 18) ok = false;
      if(!ok) continue;
      const score = Math.min(md, 22) - Math.abs(x - cxm) * 0.2;   // 列の中央寄りを優先
      if(score > bestD){ bestD = score; best = { x, y }; }
    }
    if(!best) return null;
    const p = mkPeg(best.x, best.y, { seal:true, born:1 });
    st.pegs.push(p);
    return p;
  }

  // 報酬ゾーンの並びを入れ替える（見た目＝報酬キーの並びも必ず変わるようにする）
  function reshuffleZones(){
    const keyOrder = () => st.zones.map(z => z.key).join(',');
    const before = keyOrder();
    let tries = 0;
    do { shuffle(st.zones); tries++; } while(keyOrder() === before && tries < 20);
    _debug.zoneLog.push({ ball:st.ballIdx, reshuffle:true, order:st.zones.map(z => z.short) });
    renderZones(true);
    flash('redraw'); _se('shuffle');
  }

  // ---------- 物理 ----------
  function segDist(x, y, s){
    const ex = s.x2 - s.x1, ey = s.y2 - s.y1, L2 = ex * ex + ey * ey || 1;
    const t = clamp(((x - s.x1) * ex + (y - s.y1) * ey) / L2, 0, 1);
    return Math.hypot(x - (s.x1 + ex * t), y - (s.y1 + ey * t));
  }
  function collideSeg(b, s){
    const ex = s.x2 - s.x1, ey = s.y2 - s.y1, L2 = ex * ex + ey * ey || 1;
    const t = clamp(((b.x - s.x1) * ex + (b.y - s.y1) * ey) / L2, 0, 1);
    const px = s.x1 + ex * t, py = s.y1 + ey * t;
    const dx = b.x - px, dy = b.y - py, rr = BALL_R + SEG_R;
    const d2 = dx * dx + dy * dy;
    if(d2 >= rr * rr) return;
    const d = Math.sqrt(d2);
    let nx, ny;
    if(d < 1e-4){ const L = Math.sqrt(L2); nx = -ey / L; ny = ex / L; if(nx * b.vx + ny * b.vy > 0){ nx = -nx; ny = -ny; } }
    else { nx = dx / d; ny = dy / d; }
    b.x = px + nx * rr; b.y = py + ny * rr;
    const vn = b.vx * nx + b.vy * ny;
    if(vn >= 0) return;
    b.vx -= (1 + s.rest) * vn * nx; b.vy -= (1 + s.rest) * vn * ny;
    if(s.kick && -vn > 0.8){
      b.vx += nx * s.kick; b.vy += ny * s.kick; s.hit = 1;
      _seBump(0.9);
      if(!reduced()) burst(b.x - nx * BALL_R, b.y - ny * BALL_R, '#ff7aa8', 5);
    }
    // 端（仕切りの頭など）に真上から乗ったら左右へ落とす
    if((t <= 0 || t >= 1) && ny < -0.85) b.vx += (b.vx === 0 ? (rnd() < 0.5 ? -1 : 1) : Math.sign(b.vx)) * 0.6;
  }
  function physSubstep(b){
    const H = st.H, tbl = st.tbl;
    b.vy += GRAV / SUBSTEPS;
    if(b.vy > MAX_FALL) b.vy = MAX_FALL;
    const sp = Math.hypot(b.vx, b.vy);
    if(sp > MAX_SPEED){ b.vx *= MAX_SPEED / sp; b.vy *= MAX_SPEED / sp; }
    b.x += b.vx / SUBSTEPS; b.y += b.vy / SUBSTEPS;
    // 外壁
    if(b.x < BALL_R){ b.x = BALL_R; b.vx = Math.abs(b.vx) * 0.6; }
    if(b.x > W - BALL_R){ b.x = W - BALL_R; b.vx = -Math.abs(b.vx) * 0.6; }
    if(b.y < BALL_R && b.vy < 0){ b.y = BALL_R; b.vy = Math.abs(b.vy) * 0.4; }
    // 上部アーチ（コーナー円弧の内側に沿って滑る）
    for(const a of tbl.arcs){
      if(b.y >= a.cy || (a.side < 0 ? b.x >= a.cx : b.x <= a.cx)) continue;
      const dx = b.x - a.cx, dy = b.y - a.cy, lim = a.r - BALL_R, d = Math.hypot(dx, dy);
      if(d <= lim) continue;
      const nx = dx / d, ny = dy / d;
      b.x = a.cx + nx * lim; b.y = a.cy + ny * lim;
      const vn = b.vx * nx + b.vy * ny;
      if(vn > 0){ b.vx -= 1.25 * vn * nx; b.vy -= 1.25 * vn * ny; }
    }
    // レール・スラント・スリング・仕切り
    for(const s of tbl.segs){ if(!s.off) collideSeg(b, s); }
    // バンパー（反発＋追加インパルス）
    for(const bp of tbl.bumpers){
      const dx = b.x - bp.x, dy = b.y - bp.y, rr = BALL_R + bp.r, d2 = dx * dx + dy * dy;
      if(d2 >= rr * rr) continue;
      const d = Math.sqrt(d2) || 0.001, nx = dx / d, ny = dy / d;
      b.x = bp.x + nx * rr; b.y = bp.y + ny * rr;
      const vn = b.vx * nx + b.vy * ny;
      if(vn < 0){
        b.vx -= 1.9 * vn * nx; b.vy -= 1.9 * vn * ny;
        b.vx += nx * BUMPER_KICK; b.vy += ny * BUMPER_KICK;
        bp.hit = 1; st.stats.bumper++;
        _seBump(1 + (bp.hue % 3) * 0.12);
        if(!reduced()) burst(bp.x + nx * bp.r, bp.y + ny * bp.r, `hsl(${bp.hue},100%,75%)`, 6);
      }
    }
    // 棒
    for(const p of st.pegs){
      if(!p.alive) continue;
      const dx = b.x - p.x, dy = b.y - p.y, rr = BALL_R + p.r;
      const d2 = dx * dx + dy * dy;
      if(d2 >= rr * rr) continue;
      const d = Math.sqrt(d2) || 0.001;
      const nx = dx / d, ny = dy / d;
      b.x = p.x + nx * rr; b.y = p.y + ny * rr;
      const vn = b.vx * nx + b.vy * ny;
      if(vn < 0){
        b.vx -= (1 + REST) * vn * nx; b.vy -= (1 + REST) * vn * ny;
        const j = (rnd() - 0.5) * 0.9;            // 接線方向のランダムな揺らぎ
        b.vx += -ny * j; b.vy += nx * j;
        if(Math.abs(nx) < 0.12) b.vx += (rnd() < 0.5 ? -1 : 1) * 0.7;   // 真上に乗った場合は左右へ
        if(-vn > 1.2){ _sePeg(p.y, p.seal); p.hit = 1; if(!reduced() && rnd() < 0.5) burst(p.x, p.y, '#e8eefc', 2); }
      }
    }
    // ポケットの底
    if(b.y > H - BALL_R - 1){ b.y = H - BALL_R - 1; b.vy = -Math.abs(b.vy) * 0.3; b.vx *= 0.8; }
    // 安全クランプ
    b.x = clamp(b.x, BALL_R, W - BALL_R);
    b.lx = b.x;
  }
  function step(){
    const b = st.ball; if(!b) return;
    const tbl = st.tbl;
    if(st.phase === 'charge'){
      st.plunger = Math.min(1, st.plunger + 1 / 40);
      b.y = tbl.PLY - BALL_R - 1 + st.plunger * 8;
      if(st.plunger >= 1) fireBall();
      return;
    }
    b.frames++;
    for(let s = 0; s < SUBSTEPS; s++) physSubstep(b);
    // 逸脱防止（数値異常・盤外）
    if(!isFinite(b.x) || !isFinite(b.y) || !isFinite(b.vx) || !isFinite(b.vy) || b.y < -20 || b.y > st.H + 30){
      _debug.escapes++;
      Object.assign(b, { x:FIELD_W / 2, y:118 - 20, vx:(rnd() - 0.5), vy:0, still:0 });
    }
    if(st.phase === 'launch'){
      if(b.x < LANE_X - BALL_R - SEG_R - 1){            // レーンを出た → ゲートを閉じて落下開始
        tbl.gate.off = false;
        st.phase = 'fall';
        renderSlots(); renderTop();
        setMsg('カードをタップで球がジャンプ！');
      } else if(b.x > LANE_X && b.y >= tbl.PLY - BALL_R - SEG_R - 3 && b.vy > -1 && b.frames > 8){
        st.stats.relaunch++;                            // 届かず戻ってきた → 再発射
        chargeBall();
        return;
      }
    }
    // 引っかかり防止
    if(Math.hypot(b.x - b.sx0, b.y - b.sy0) < 0.6) b.still++; else { b.still = 0; b.sx0 = b.x; b.sy0 = b.y; }
    if(b.still > 70 && st.phase !== 'sink'){ b.vx += (rnd() < 0.5 ? -1 : 1) * 2; b.vy = -1.5; b.still = 0; st.stats.unstick++; }
    b.trail.push({ x:b.x, y:b.y });
    if(b.trail.length > (reduced() ? 4 : 14)) b.trail.shift();
    // ポケットに入った（仕切りの頭より下）→ 位置を確定して沈める
    if(st.phase === 'fall' && b.y > st.H - POCKET_H + BALL_R + 2){
      b.pocket = clamp(Math.floor(b.x / COLW), 0, SLOT_N - 1);
      b.sink = 0;
      st.phase = 'sink';
      st.glow = { pos:b.pocket, t:0 };
      renderSlots();
    }
    if(st.phase === 'sink'){
      b.sink++;
      if(b.sink > 22) land();
    }
  }

  function burst(x, y, color, n){
    if(reduced()) n = Math.min(n, 2);
    for(let i = 0; i < n; i++){
      const a = rnd() * Math.PI * 2, s = 0.6 + rnd() * 2.2;
      st.parts.push({ x, y, vx:Math.cos(a) * s, vy:Math.sin(a) * s - 0.6, life:18 + rnd() * 14, t:0, color });
    }
  }

  async function land(){
    const b = st.ball; st.ball = null;
    const pos = _debug.forceZone != null ? clamp(_debug.forceZone | 0, 0, SLOT_N - 1) : (b.pocket != null ? b.pocket : clamp(Math.floor(b.x / COLW), 0, SLOT_N - 1));
    const z = st.zones[pos];
    st.phase = 'landed';
    st.rest = { x:clamp(b.x, COLW * pos + BALL_R + 2, COLW * (pos + 1) - BALL_R - 2), y:st.H - BALL_R - 1 };
    st.glow = { pos, t:0, key:z.key };
    st.results.push({ ball:st.ballIdx, pos, key:z.key, label:z.label, short:z.short, gold:z.gold, special:z.special, frames:b.frames });
    st.reward.gold += z.gold; st.reward.special += z.special;
    const zel = $(`.pc-zone[data-pos="${pos}"]`);
    if(zel){ zel.classList.remove('hit'); void zel.offsetWidth; zel.classList.add('hit', z.key === 'none' ? 'miss' : 'win'); }
    burst(st.rest.x, st.H - 10, z.key === 'none' ? '#94a3b8' : '#ffd36b', 16);
    if(z.key === 'none' || (!z.gold && !z.special)) _se('error');
    else { _se('zone'); setTimeout(() => { if(z.gold) _se('coin'); if(z.special) _se('upgrade'); }, 220); }
    renderSlots(); renderTop();
    banner(z.key === 'none' ? '何もなし…' : z.label + '！', z.key === 'none' ? 'miss' : 'win');
    setMsg(`${st.ballIdx + 1}球目：<b class="${z.key === 'none' ? 'pc-t-miss' : 'pc-t-win'}">${esc(z.label)}</b>`);
    await wait(1500);
    if(!root || !st) return;
    if(zel) zel.classList.remove('hit', 'miss', 'win');
    st.ballIdx++;
    if(st.ballIdx < BALLS){
      setActions(`<button type="button" class="pc-btn pc-btn-main" data-act="next">${st.ballIdx + 1}球目へ</button>`);
      setMsg(`${st.ballIdx}球目：<b class="${z.key === 'none' ? 'pc-t-miss' : 'pc-t-win'}">${esc(z.label)}</b>　次の球の前に報酬ポケットがシャッフルされます`);
      $('.pc-actions [data-act="next"]').addEventListener('click', nextBall);
      renderTop();
    } else {
      st.phase = 'end';
      showResult();
    }
  }
  // 2球目以降：報酬ポケットの並びをランダムに入れ替えてから発射
  async function nextBall(){
    if(!st || st.phase !== 'landed') return;
    _se('confirm', {suppressTap:true});
    setActions('');
    st.phase = 'ready';
    st.rest = null; st.glow = null;
    reshuffleZones();
    banner('ポケット シャッフル！', 'shuffle');
    setMsg('報酬ポケットの並びが入れ替わった！');
    await wait(1100);
    if(!root || !st) return;
    launchBall();
  }

  function summaryText(){
    const parts = st.results.map((r, i) => `${i + 1}球目 ${r.label}`).join('、');
    const g = st.reward.gold, s = st.reward.special;
    const tot = [g ? `${g}G` : '', s ? `特別アップグレード×${s}` : ''].filter(Boolean).join('＋') || '報酬なし';
    return `パチンコ：${parts} → ${tot}`;
  }

  function showResult(){
    renderTop();
    setActions(''); setMsg('');
    const g = st.reward.gold, s = st.reward.special;
    const win = g > 0 || s > 0;
    st.win = win;
    const wrap = $('.pc-panel-wrap');
    wrap.innerHTML = `<div class="pc-panel pc-result ${win ? 'win' : 'lose'}">
      <div class="pc-p-title">${win ? '獲得！' : '残念…'}</div>
      <div class="pc-res-list">${st.results.map((r, i) => `<div class="pc-res-row"><span>${i + 1}球目</span><b class="pc-zone-${r.key}">${esc(r.label)}</b></div>`).join('')}</div>
      <div class="pc-res-total">
        <div class="pc-res-t"><span class="pc-z-ico pc-z-coin">${GIcon('gold_coin')}</span><b>${g}</b></div>
        <div class="pc-res-t"><span class="pc-z-ico pc-z-star">★</span><b>特別アップグレード×${s}</b></div>
      </div>
      <button type="button" class="pc-btn pc-btn-main" data-act="close">戻る</button>
    </div>`;
    GGoldifyDom(wrap);
    wrap.classList.add('show');
    if(win){ _se('win'); if(s > 0) setTimeout(() => _se('fanfare'), 380); } else _se('lose');
    wrap.querySelector('[data-act="close"]').addEventListener('click', () => { _se(win ? 'coin' : 'close', {suppressTap:true}); close(); });
  }

  // ---------- 描画 ----------
  const ZONE_COL = { none:'#64748b', g1:'#eab308', g10:'#fde047', sp:'#e879f9' };
  function archPath(c, inset){
    const R = ARC_R - inset, H = st.H;
    c.beginPath();
    c.moveTo(inset, H); c.lineTo(inset, ARC_R);
    c.arc(ARC_R, ARC_R, R, Math.PI, Math.PI * 1.5);
    c.lineTo(W - ARC_R, inset);
    c.arc(W - ARC_R, ARC_R, R, Math.PI * 1.5, Math.PI * 2);
    c.lineTo(W - inset, H);
  }
  function rail(c, x1, y1, x2, y2, w){
    c.lineCap = 'round';
    c.strokeStyle = '#0b0e18'; c.lineWidth = w + 2.2; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    const g = c.createLinearGradient(x1 - w, y1 - w, x2 + w, y2 + w);
    g.addColorStop(0, '#8b93a8'); g.addColorStop(.5, '#eef2fb'); g.addColorStop(1, '#7a8399');
    c.strokeStyle = g; c.lineWidth = w; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = Math.max(.6, w * .3); c.beginPath(); c.moveTo(x1 - .4, y1 - .4); c.lineTo(x2 - .4, y2 - .4); c.stroke();
  }
  // 静的レイヤ（アーチ外の筐体・レーン・レール・ポケット）をキャッシュ
  function buildStatic(){
    const H = st.H, tbl = st.tbl, sc = st.scale;
    const L = document.createElement('canvas');
    L.width = canvas.width; L.height = canvas.height;
    const c = L.getContext('2d');
    c.setTransform(sc, 0, 0, sc, 0, 0);
    // 列ガイド（ジャミングの列）
    for(let k = 0; k < SLOT_N; k++){ c.fillStyle = k % 2 ? 'rgba(255,255,255,.012)' : 'rgba(255,255,255,.03)'; c.fillRect(COLW * k, 0, COLW, H); }
    c.strokeStyle = 'rgba(160,190,255,.08)'; c.lineWidth = 1; c.setLineDash([3, 6]);
    for(let k = 1; k < SLOT_N; k++){ c.beginPath(); c.moveTo(COLW * k, 40); c.lineTo(COLW * k, H - POCKET_H); c.stroke(); }
    c.setLineDash([]);
    // 発射レーンの床面
    const lg = c.createLinearGradient(LANE_X, 0, W, 0);
    lg.addColorStop(0, 'rgba(0,0,0,.45)'); lg.addColorStop(.5, 'rgba(40,50,90,.35)'); lg.addColorStop(1, 'rgba(0,0,0,.45)');
    c.fillStyle = lg; c.fillRect(LANE_X, 40, W - LANE_X, tbl.PLY - 40);
    // アーチの外側（クローム筐体）
    const cg = c.createLinearGradient(0, 0, 0, ARC_R);
    cg.addColorStop(0, '#59627a'); cg.addColorStop(.5, '#2b3142'); cg.addColorStop(1, '#151927');
    c.fillStyle = cg;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(0, ARC_R); c.arc(ARC_R, ARC_R, ARC_R, Math.PI, Math.PI * 1.5); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(W, 0); c.lineTo(W - ARC_R, 0); c.arc(W - ARC_R, ARC_R, ARC_R, Math.PI * 1.5, Math.PI * 2); c.closePath(); c.fill();
    // アーチのクロームレール
    c.save(); archPath(c, 1.5); c.strokeStyle = '#0b0e18'; c.lineWidth = 5; c.stroke();
    archPath(c, 1.5); c.strokeStyle = '#c8cfdf'; c.lineWidth = 3; c.stroke();
    archPath(c, 1); c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = .8; c.stroke(); c.restore();
    // ハウジング（発射台の下）
    c.fillStyle = '#1b2030'; c.beginPath(); c.moveTo(LANE_X, tbl.PLY); c.lineTo(W, tbl.PLY); c.lineTo(W, tbl.PLY + 14); c.lineTo(LANE_X, tbl.PLY + 12); c.closePath(); c.fill();
    // アウトレーン外側の三角を塗る
    c.fillStyle = 'rgba(20,24,38,.9)';
    c.beginPath(); c.moveTo(0, tbl.PLY + 14); c.lineTo(18, H - 56); c.lineTo(0, H - 56); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(W, tbl.PLY + 14); c.lineTo(W - 18, H - 56); c.lineTo(W, H - 56); c.closePath(); c.fill();
    // スリングショット本体
    for(const s of tbl.slings){
      c.fillStyle = 'rgba(120,20,60,.55)';
      c.beginPath(); c.moveTo(s.ax, s.ay); c.lineTo(s.bx, s.by); c.lineTo(s.backx, s.by - 8); c.closePath(); c.fill();
    }
    // ポケットの背面
    for(let k = 0; k < SLOT_N; k++){
      const g = c.createLinearGradient(0, H - POCKET_H, 0, H);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.55)');
      c.fillStyle = g; c.fillRect(COLW * k, H - POCKET_H, COLW, POCKET_H);
    }
    // レール類
    for(const s of tbl.segs){
      if(s.kind === 'gate' || s.kind === 'sling') continue;
      const w = s.kind === 'divider' ? 4 : (s.kind === 'housing' || s.kind === 'slingback') ? 2.5 : 3.4;
      rail(c, s.x1, s.y1, s.x2, Math.min(s.y2, H), w);
    }
    // 仕切りの頭（丸キャップ）
    for(let k = 1; k < SLOT_N; k++){
      const x = COLW * k, y = H - POCKET_H;
      const g = c.createRadialGradient(x - 1, y - 1.2, .3, x, y, 4.2);
      g.addColorStop(0, '#fff'); g.addColorStop(.6, '#aab3c7'); g.addColorStop(1, '#4b5368');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, 4, 0, Math.PI * 2); c.fill();
    }
    st.staticLayer = L;
  }

  function boltPath(col, seed){
    let s = seed;
    const r = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    const pts = []; const cx = COLW * (col + 0.5);
    for(let y = 0; y <= st.H; y += 22) pts.push([cx + (r() - 0.5) * COLW * 0.7, y]);
    return pts;
  }
  function draw(){
    const H = st.H, sc = st.scale, tbl = st.tbl, tk = st.tk;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if(!st.staticLayer || st.staticLayer.width !== canvas.width || st.staticLayer.height !== canvas.height) buildStatic();
    ctx.drawImage(st.staticLayer, 0, 0);
    ctx.setTransform(sc, 0, 0, sc, 0, 0);
    // ネオントリム（アーチ）
    if(!reduced()){
      ctx.save(); archPath(ctx, 5);
      ctx.strokeStyle = `hsla(${(tk * 1.2) % 360},100%,65%,.75)`; ctx.lineWidth = 1.4; ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 8;
      ctx.setLineDash([10, 8]); ctx.lineDashOffset = -tk * 0.6; ctx.stroke(); ctx.restore();
    }
    // ポケット：報酬の色帯と着地グロー
    for(let k = 0; k < SLOT_N; k++){
      const z = st.zones[k]; if(!z) continue;
      const col = ZONE_COL[z.key] || '#94a3b8';
      ctx.fillStyle = col; ctx.globalAlpha = .55;
      ctx.fillRect(COLW * k + 3, H - 4, COLW - 6, 4);
      ctx.globalAlpha = 1;
    }
    if(st.glow){
      const k = st.glow.pos, z = st.zones[k], col = (!z || z.key === 'none') ? '#cbd5e1' : ZONE_COL[z.key];
      const pulse = .55 + .45 * Math.sin(tk * 0.25);
      ctx.save();
      const g = ctx.createLinearGradient(0, H - POCKET_H - 20, 0, H);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, col);
      ctx.globalAlpha = .35 + pulse * .45; ctx.fillStyle = g;
      ctx.fillRect(COLW * k + 2, H - POCKET_H - 20, COLW - 4, POCKET_H + 20);
      ctx.restore();
    }
    // ゲート
    if(!tbl.gate.off) rail(ctx, tbl.gate.x1, tbl.gate.y1, tbl.gate.x2, tbl.gate.y2, 2.6);
    // レーンの矢印ランプ
    const laneOn = st.phase === 'charge' || st.phase === 'launch' || st.phase === 'ready';
    for(let i = 0; i < 5; i++){
      const y = tbl.PLY - 46 - i * 34; if(y < 70) break;
      const lit = laneOn && Math.floor(tk / 5) % 5 === i;
      ctx.fillStyle = lit ? '#ffe28a' : 'rgba(255,226,138,.18)';
      if(lit){ ctx.shadowColor = '#ffcf4a'; ctx.shadowBlur = 8; }
      ctx.beginPath(); ctx.moveTo(LANE_CX, y - 6); ctx.lineTo(LANE_CX - 6, y + 3); ctx.lineTo(LANE_CX + 6, y + 3); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
    }
    // プランジャー（バネ＋ノブ）
    {
      const top = tbl.PLY + (st.phase === 'charge' ? st.plunger * 8 : 0) - 3;
      ctx.fillStyle = '#d9dfec'; ctx.fillRect(LANE_X + 4, top, W - LANE_X - 8, 3.5);
      ctx.strokeStyle = 'rgba(200,210,230,.8)'; ctx.lineWidth = 1;
      const bottom = tbl.PLY + 12, n = 4;
      ctx.beginPath();
      for(let i = 0; i <= n * 2; i++){ const y = top + 3.5 + (bottom - top - 3.5) * i / (n * 2); const x = LANE_CX + (i % 2 ? 6 : -6); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
      if(st.plungerKick > 0){ ctx.globalAlpha = st.plungerKick; ctx.fillStyle = '#fff2c2'; ctx.fillRect(LANE_X + 2, top - 3, W - LANE_X - 4, 3); ctx.globalAlpha = 1; }
    }
    // スリングショットのキッカー面
    for(const s of tbl.slings){
      const h = s.k.hit;
      ctx.save();
      ctx.strokeStyle = h > 0 ? '#fff' : '#ff4f8b'; ctx.lineWidth = 3 + h * 2; ctx.lineCap = 'round';
      ctx.shadowColor = '#ff4f8b'; ctx.shadowBlur = reduced() ? 0 : 6 + h * 14;
      ctx.beginPath(); ctx.moveTo(s.ax, s.ay); ctx.lineTo(s.bx, s.by); ctx.stroke();
      if(h > 0){ ctx.globalAlpha = h * .5; ctx.fillStyle = '#ff9cc0'; ctx.beginPath(); ctx.moveTo(s.ax, s.ay); ctx.lineTo(s.bx, s.by); ctx.lineTo(s.backx, s.by - 8); ctx.closePath(); ctx.fill(); }
      ctx.restore();
    }
    // バンパー
    for(const bp of tbl.bumpers){
      const h = bp.hit, r = bp.r * (1 + h * 0.12);
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.arc(bp.x + 1.5, bp.y + 2.5, bp.r + 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1c1f33'; ctx.beginPath(); ctx.arc(bp.x, bp.y, bp.r + 3, 0, Math.PI * 2); ctx.fill();
      ctx.shadowColor = `hsl(${bp.hue},100%,60%)`; ctx.shadowBlur = reduced() ? 0 : 6 + h * 18;
      ctx.strokeStyle = `hsl(${bp.hue},100%,${62 + h * 30}%)`; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(bp.x, bp.y, bp.r + 1.5, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0;
      const g = ctx.createRadialGradient(bp.x - r * .35, bp.y - r * .4, 1, bp.x, bp.y, r);
      g.addColorStop(0, '#ffffff'); g.addColorStop(.35, `hsl(${bp.hue},100%,${78 + h * 18}%)`); g.addColorStop(1, `hsl(${bp.hue},80%,${30 + h * 30}%)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bp.x, bp.y, r - 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = h > 0.2 ? '#fff' : 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(bp.x, bp.y, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // 棒
    const ps = pegSprite.width / 3;
    for(const p of st.pegs){
      if(!p.alive){
        if(p.fade > 0){ ctx.globalAlpha = p.fade; ctx.fillStyle = '#bfe3ff'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + (1 - p.fade) * 8, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
        continue;
      }
      if(p.seal){ ctx.fillStyle = 'rgba(192,132,252,.35)'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 4 + p.born * 10, 0, Math.PI * 2); ctx.fill(); }
      ctx.drawImage(pegSprite, p.x - ps / 2, p.y - ps / 2, ps, ps);
      if(p.seal){ ctx.strokeStyle = '#e9d5ff'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 1.5, 0, Math.PI * 2); ctx.stroke(); }
      if(p.hit > 0){ ctx.globalAlpha = p.hit; ctx.fillStyle = '#fff6d0'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 3, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
    }
    // エフェクト
    for(const f of st.fx){
      const k = 1 - f.t / f.life;
      if(f.type === 'bolt'){
        ctx.save();
        ctx.globalAlpha = Math.max(0, k);
        ctx.fillStyle = 'rgba(150,200,255,.18)'; ctx.fillRect(COLW * f.col, 0, COLW, H);
        const pts = boltPath(f.col, f.seed + Math.floor(f.t / 4));
        ctx.strokeStyle = '#e0f2ff'; ctx.lineWidth = 3; ctx.shadowColor = '#7cc4ff'; ctx.shadowBlur = 14;
        ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.stroke();
        ctx.lineWidth = 1; ctx.strokeStyle = '#fff'; ctx.stroke();
        ctx.restore();
      } else if(f.type === 'guide'){
        const cx = COLW * (f.col + 0.5);
        ctx.save(); ctx.globalAlpha = Math.max(0, k);
        ctx.fillStyle = 'rgba(74,222,128,.13)'; ctx.fillRect(COLW * f.col, 0, COLW, H);
        ctx.strokeStyle = '#86efac'; ctx.lineWidth = 2.5; ctx.setLineDash([6, 5]); ctx.lineDashOffset = -f.t;
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(cx, f.y + 60); ctx.lineTo(cx, H); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#86efac'; ctx.beginPath(); ctx.moveTo(cx, H - 30); ctx.lineTo(cx - 8, H - 44); ctx.lineTo(cx + 8, H - 44); ctx.fill();
        ctx.restore();
      } else if(f.type === 'push'){
        ctx.save(); ctx.globalAlpha = Math.max(0, k) * 0.9;
        const g = ctx.createLinearGradient(f.sx, f.sy, f.x, f.y);
        g.addColorStop(0, 'rgba(255,233,168,0)'); g.addColorStop(1, '#ffe9a8');
        ctx.strokeStyle = g; ctx.lineWidth = 2 + k * 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(f.sx, f.sy); ctx.lineTo(f.x, f.y); ctx.stroke();
        ctx.fillStyle = '#fff6d0'; ctx.beginPath(); ctx.arc(f.x, f.y, BALL_R + (1 - k) * 10, 0, Math.PI * 2); ctx.globalAlpha = Math.max(0, k) * 0.35; ctx.fill();
        ctx.restore();
      } else if(f.type === 'ring'){
        ctx.save(); ctx.globalAlpha = Math.max(0, k);
        ctx.strokeStyle = '#d8b4fe'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(f.x, f.y, 6 + (1 - k) * 26, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    }
    // 粒子
    for(const q of st.parts){
      ctx.globalAlpha = Math.max(0, 1 - q.t / q.life); ctx.fillStyle = q.color;
      ctx.fillRect(q.x - 1.2, q.y - 1.2, 2.4, 2.4);
    }
    ctx.globalAlpha = 1;
    // 球
    const bs = ballSprite.width / 3;
    const b = st.ball;
    if(b){
      for(let i = 0; i < b.trail.length; i++){
        const t = b.trail[i], a = (i + 1) / b.trail.length;
        ctx.globalAlpha = a * 0.45; ctx.fillStyle = '#ffcf6b';
        ctx.beginPath(); ctx.arc(t.x, t.y, BALL_R * (0.35 + a * 0.55), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.drawImage(ballSprite, b.x - bs / 2, b.y - bs / 2, bs, bs);
    } else if(st.rest){
      ctx.drawImage(ballSprite, st.rest.x - bs / 2, st.rest.y - bs / 2, bs, bs);
    }
  }

  function tickFx(){
    st.tk++;
    for(const f of st.fx) f.t++;
    st.fx = st.fx.filter(f => f.t < f.life);
    for(const q of st.parts){ q.x += q.vx; q.y += q.vy; q.vy += 0.08; q.t++; }
    st.parts = st.parts.filter(q => q.t < q.life);
    // 点灯の減衰（描画頻度に依存しないよう固定ステップで）
    for(const p of st.pegs){ if(p.hit > 0) p.hit = Math.max(0, p.hit - 0.08); if(!p.alive && p.fade > 0) p.fade = Math.max(0, p.fade - 0.04); if(p.born > 0) p.born = Math.max(0, p.born - 0.03); }
    for(const bp of st.tbl.bumpers) if(bp.hit > 0) bp.hit = Math.max(0, bp.hit - 0.06);
    for(const s of st.tbl.segs) if(s.hit > 0) s.hit = Math.max(0, s.hit - 0.08);
    if(st.plungerKick > 0) st.plungerKick = Math.max(0, st.plungerKick - 0.1);
  }

  function loop(ts){
    if(!root || !st) return;
    rafId = requestAnimationFrame(loop);
    if(st.lastTs == null) st.lastTs = ts;
    let dt = Math.min(100, ts - st.lastTs); st.lastTs = ts;
    st.acc += dt / (1000 / 60) * (Number(_debug.speed) || 1);
    let n = 0;
    while(st.acc >= 1 && n < 40){
      st.acc -= 1; n++;
      if(st.phase === 'charge' || st.phase === 'launch' || st.phase === 'fall' || st.phase === 'sink') step();
      tickFx();
    }
    draw();
  }

  // ---------- 開閉 ----------
  function close(){
    if(!root) return;
    const res = {
      win: !!(st && (st.reward.gold > 0 || st.reward.special > 0)),
      reward: { gold: st ? st.reward.gold : 0, special: st ? st.reward.special : 0 },
      summary: st ? summaryText() : 'パチンコ：報酬なし',
    };
    const r = resolveFn;
    cancelAnimationFrame(rafId);
    root.classList.add('closing');
    const el = root;
    root = null; resolveFn = null; st = null; _debug.state = null; canvas = null; ctx = null;
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    setTimeout(() => { el.remove(); }, reduced() ? 0 : 220);
    if(r) r(res);
  }
  function onKey(e){ if(root) e.stopPropagation(); }
  function onResize(){ if(root && st && canvas){
    const b = $('.pc-board').getBoundingClientRect();
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    // 論理座標系（W×H）は固定のまま、表示倍率だけ合わせる
    const cw = b.width, ch = cw * st.H / W;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
    st.scale = cw / W * dpr;
  } }

  function open(opts){
    opts = opts || {};
    if(root) return Promise.resolve({ win:false, reward:{ gold:0, special:0 }, summary:'パチンコ：報酬なし' });
    const floor = Number(opts.floor) || 1;
    st = {
      floor, phase:'intro', hand:dealHand(), slots:Array(SLOT_N).fill(null), sel:null, used:Array(SLOT_N).fill(false),
      zones:shuffle(ZONES.map((z, i) => Object.assign({ id:i }, z))),
      pegs:[], ball:null, fx:[], parts:[], ballIdx:0, results:[], reward:{ gold:0, special:0 }, win:false,
      log:[], stats:{ thunder:0, guide:0, seal:0, redraw:0, bumper:0, relaunch:0, unstick:0 }, H:480, scale:1, acc:0, lastTs:null,
      tbl:null, plunger:0, plungerKick:0, rest:null, glow:null, tk:0, staticLayer:null,
    };
    _debug.state = st;
    _se('open');
    if(!pegSprite) makeSprites();
    build();
    sizeBoard();
    st.tbl = buildTable(st.H);
    st.pegs = st.tbl.pegs;
    renderAll();
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);
    rafId = requestAnimationFrame(loop);
    showIntro();
    return new Promise(res => { resolveFn = res; });
  }

  return { open, isOpen:() => !!root, jumpVelocity, ZONES, ACTIVE_JAMS, _debug, _useCard:i => { if(st && st.phase === 'fall') useCard(i); } };
})();
