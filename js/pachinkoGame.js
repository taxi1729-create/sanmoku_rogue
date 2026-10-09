/* pachinkoGame.js — ミニゲーム「パチンコ」
 * 公開API（グローバル const PachinkoGame）:
 *   PachinkoGame.open({floor}) -> Promise<{win:boolean, reward:{gold:number, special:number}, summary:string}>
 *     全画面オーバーレイを閉じたときに resolve。報酬の付与は行わない（呼び出し側の責務）。
 *   PachinkoGame.isOpen()
 *   PachinkoGame.jumpVelocity(base) -> number   カード基礎点からジャンプ初速（上向き・px/frame）
 *   PachinkoGame._debug  テスト用 { rng, forceZone, speed, state, autoLaunchDelay }
 *     rng: () => 0..1 の上書き / forceZone: 0..4 を指定すると着地する報酬枠の位置を強制 /
 *     speed: 物理の時間倍率（1=通常）/ state: 進行状態の参照
 * ルール:
 *   デッキからランダムに8枚（コピー）が配られ、5枚を選んで盤面下の5つのスロット（左→右）に嵌める。
 *   「スタート」で球が自動で1つ排出され、障害物の棒に当たりながら落下し、下の報酬ゾーン（5枠）に落ちたら1回分。
 *   報酬ゾーン：何もなし／1G／10G／特別アップグレード／特別アップグレード（開始時に並びをシャッフル）。
 *   球の落下中にスロットのカードをタップすると、カード基礎点に応じて球がジャンプする（各カード1球につき1回）。
 *   ジャミング効果があればスロットの列に応じて発動：
 *     サンダー：その列の障害物を全て破壊 / 誘導：球の向きをその列へ変更 /
 *     封印：その列の球より下に障害物を1つ配置 / 引き直し：報酬ゾーンの並びがランダムに変わる。
 *   チャンスは2回（2球）。各球の報酬を合算する。
 */
const PachinkoGame = (function(){
  'use strict';

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

  const _debug = { rng:null, forceZone:null, speed:1, state:null, autoLaunchDelay:1 };
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
  // ジャンプ初速：基礎点に比例（上限あり）。負値＝上向き
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
    return `<span class="pc-z-ico pc-z-coin">G</span>`;
  }

  // ---------- 盤面生成 ----------
  function buildPegs(H){
    const pegs = [];
    const y0 = 74, yEnd = H - 54, gap = 40;
    let row = 0;
    for(let y = y0; y <= yEnd; y += gap, row++){
      if(row % 2 === 0){ for(let k = 0; k < 10; k++) pegs.push(mkPeg(18 + 36 * k, y)); }
      else { for(let k = 1; k < 10; k++) pegs.push(mkPeg(36 * k, y)); }
    }
    return pegs;
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
    const t = $('.pc-total');
    if(t) t.innerHTML = `<span class="pc-tg">${st.reward.gold}G</span><span class="pc-ts">★${st.reward.special}</span>`;
  }

  function renderZones(animate){
    const el = $('.pc-zones'); if(!el) return;
    let first = null;
    if(animate && !reduced()){
      first = {};
      el.querySelectorAll('.pc-zone').forEach(z => { first[z.dataset.id] = z.getBoundingClientRect().left; });
    }
    el.innerHTML = st.zones.map((z, i) => `<div class="pc-zone pc-zone-${z.key}" data-id="${z.id}" data-pos="${i}">${zoneIcon(z)}<span class="pc-z-lab">${esc(z.short)}</span></div>`).join('');
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
        <div class="pc-sheet-sub">タップで左から順に配置。スロットをタップで選択→別スロットで入れ替え／もう一度タップで外す</div>
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
    sh.querySelector('[data-act="start"]').addEventListener('click', () => { if(st.slots.every(Boolean)) startPlay(); });
  }

  function setMsg(html){ const m = $('.pc-msg'); if(m) m.innerHTML = html || ''; }
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
      placeInSlot(uid, st.sel.i); st.sel = null;
    } else if(at >= 0){
      st.slots[at] = null; st.sel = null;            // 配置済みの札をタップ → 外す
    } else {
      const empty = st.slots.indexOf(null);
      if(empty >= 0){ st.slots[empty] = uid; st.sel = null; }
      else { st.sel = (st.sel && st.sel.uid === uid) ? null : { type:'hand', uid }; }
    }
    renderSlots(); renderSheet();
    setupMsg();
  }
  function onSlotTap(i){
    if(!st) return;
    if(st.phase === 'fall'){ useCard(i); return; }
    if(st.phase !== 'setup') return;
    const s = st.sel;
    if(s && s.type === 'hand'){ placeInSlot(s.uid, i); st.sel = null; }
    else if(s && s.type === 'slot'){
      if(s.i === i){ st.slots[i] = null; }
      else { const t = st.slots[i]; st.slots[i] = st.slots[s.i]; st.slots[s.i] = t; }
      st.sel = null;
    } else if(st.slots[i]){ st.sel = { type:'slot', i }; }
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
        <p>デッキから配られた<b>8枚</b>のうち<b>5枚</b>を、盤面下の<b>5つのスロット</b>に嵌めよう。</p>
        <p>球は自動で排出され、障害物の棒に当たりながら落ちていく。下の<b>報酬ゾーン</b>に落ちれば1回分。チャンスは<b>2回</b>！</p>
        <p>落下中にスロットのカードを<b>タップ</b>すると、<b>カード基礎点</b>に応じて球がジャンプ（各カード1球につき1回）。</p>
        <ul class="pc-p-jams">${Object.keys(ACTIVE_JAMS).map(k => `<li>${jamIcon(k)}<b>${esc(k)}</b>：${esc(ACTIVE_JAMS[k])}（スロットの列）</li>`).join('')}</ul>
        <div class="pc-p-rewards">報酬ゾーン：${esc(order)}</div>
      </div>
      <button type="button" class="pc-btn pc-btn-main" data-act="go">カードを選ぶ</button>
    </div>`;
    wrap.classList.add('show');
    wrap.querySelector('[data-act="go"]').addEventListener('click', () => {
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
    renderSlots(); renderTop();
    banner(`${st.ballIdx + 1}球目`, 'ball');
    setMsg('球が排出されます…');
    await wait(900);
    if(!root) return;
    const x = W / 2 + (rnd() - 0.5) * W * 0.34;
    st.ball = { x, y:-BALL_R, vx:(rnd() - 0.5) * 1.2, vy:1.2, trail:[], still:0, lx:x, ly:0 };
    st.phase = 'fall';
    renderSlots(); renderTop();
    setMsg('カードをタップで球がジャンプ！');
  }

  function useCard(i){
    const uid = st.slots[i];
    if(!uid || st.used[i] || !st.ball) return;
    const h = st.hand.find(x => x.uid === uid); if(!h) return;
    st.used[i] = true;
    const b = st.ball;
    const cx = COLW * (i + 0.5);
    // ジャンプ（基礎点に比例）
    b.vy = jumpVelocity(h.base);
    b.still = 0;
    burst(b.x, b.y, '#ffe9a8', 10);
    const jam = h.card.jamming;
    let note = `ジャンプ！（基礎点${h.base}）`;
    if(jam === 'サンダー'){
      let n = 0;
      // 列の範囲（境界線上の棒も含む）にある障害物を全て破壊
      st.pegs.forEach(p => { if(p.alive && p.x >= COLW * i - 0.5 && p.x <= COLW * (i + 1) + 0.5){ p.alive = false; p.fade = 1; n++; burst(p.x, p.y, '#bfe3ff', reduced() ? 2 : 6); } });
      st.fx.push({ type:'bolt', col:i, t:0, life:34, seed:Math.floor(rnd() * 1e6) });
      flash('thunder');
      note = `サンダー！ ${i + 1}列目の障害物を${n}本破壊`;
      st.stats.thunder++;
    } else if(jam === '誘導'){
      const dx = cx - b.x;
      b.vx = clamp(dx / 22, -6, 6);
      if(Math.abs(dx) < 4) b.vx = 0;
      st.fx.push({ type:'guide', col:i, x:b.x, y:b.y, t:0, life:40 });
      note = `誘導！ 球を${i + 1}列目へ`;
      st.stats.guide++;
    } else if(jam === '封印'){
      const p = placeSealPeg(i, b.y);
      if(p){ st.fx.push({ type:'ring', x:p.x, y:p.y, t:0, life:30 }); note = `封印！ ${i + 1}列目に障害物を配置`; }
      else note = '封印！ …置ける場所がなかった';
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

  function placeSealPeg(col, by){
    const top = by + BALL_R + PEG_R + 26, bottom = st.H - 40;
    if(top > bottom) return null;
    // 列内の候補から、既存の棒と最も離れた位置を選ぶ（球より下・列の範囲内）
    let best = null, bestD = -Infinity;
    for(let tries = 0; tries < 60; tries++){
      const x = COLW * (col + 0.5) + (rnd() - 0.5) * (COLW - 24);
      const y = top + rnd() * Math.min(160, bottom - top);
      let md = Infinity;
      for(const p of st.pegs){ if(p.alive){ const d = Math.hypot(p.x - x, p.y - y); if(d < md) md = d; } }
      const score = Math.min(md, 22) - Math.abs(x - COLW * (col + 0.5)) * 0.2;   // 列の中央寄りを優先
      if(score > bestD){ bestD = score; best = { x, y }; }
    }
    if(!best) return null;
    const p = mkPeg(best.x, best.y, { seal:true, born:1 });
    st.pegs.push(p);
    return p;
  }

  function reshuffleZones(){
    const before = st.zones.map(z => z.id).join(',');
    let tries = 0;
    do { shuffle(st.zones); tries++; } while(st.zones.map(z => z.id).join(',') === before && tries < 10);
    renderZones(true);
    flash('redraw');
  }

  // ---------- 物理 ----------
  function step(){
    const b = st.ball; if(!b) return;
    for(let s = 0; s < SUBSTEPS; s++){
      b.vy += GRAV / SUBSTEPS;
      if(b.vy > MAX_FALL) b.vy = MAX_FALL;
      const sp = Math.hypot(b.vx, b.vy);
      if(sp > MAX_SPEED){ b.vx *= MAX_SPEED / sp; b.vy *= MAX_SPEED / sp; }
      b.x += b.vx / SUBSTEPS; b.y += b.vy / SUBSTEPS;
      // 壁
      if(b.x < BALL_R){ b.x = BALL_R; b.vx = Math.abs(b.vx) * 0.6; }
      if(b.x > W - BALL_R){ b.x = W - BALL_R; b.vx = -Math.abs(b.vx) * 0.6; }
      if(b.y < BALL_R && b.vy < 0){ b.y = BALL_R; b.vy = Math.abs(b.vy) * 0.4; }
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
          // ジッター（接線方向のランダムな揺らぎ）
          const j = (rnd() - 0.5) * 0.9;
          b.vx += -ny * j; b.vy += nx * j;
          // 真上に乗った場合は左右へ
          if(Math.abs(nx) < 0.12) b.vx += (rnd() < 0.5 ? -1 : 1) * 0.7;
          if(-vn > 1.2){ p.hit = 1; if(!reduced() && rnd() < 0.5) burst(p.x, p.y, '#e8eefc', 2); }
        }
      }
      // 報酬ゾーンの仕切り
      const sepTop = st.H - 26;
      if(b.y > sepTop){
        for(let k = 1; k < SLOT_N; k++){
          const bx = COLW * k;
          if(Math.abs(b.x - bx) < BALL_R + 1.5){
            const side = (b.lx < bx) ? -1 : 1;
            b.x = bx + side * (BALL_R + 1.5);
            b.vx = side * Math.abs(b.vx) * 0.5;
          }
        }
      }
      b.lx = b.x;
    }
    // 引っかかり防止
    if(Math.hypot(b.x - b.sx0, b.y - b.sy0) < 0.6) b.still++; else { b.still = 0; b.sx0 = b.x; b.sy0 = b.y; }
    if(b.still > 70){ b.vx += (rnd() < 0.5 ? -1 : 1) * 2; b.vy = -1.5; b.still = 0; }
    b.trail.push({ x:b.x, y:b.y });
    if(b.trail.length > (reduced() ? 4 : 14)) b.trail.shift();
    if(b.y > st.H + BALL_R) land();
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
    const pos = _debug.forceZone != null ? clamp(_debug.forceZone | 0, 0, SLOT_N - 1) : clamp(Math.floor(b.x / COLW), 0, SLOT_N - 1);
    const z = st.zones[pos];
    st.phase = 'landed';
    st.results.push({ ball:st.ballIdx, pos, key:z.key, label:z.label, short:z.short, gold:z.gold, special:z.special });
    st.reward.gold += z.gold; st.reward.special += z.special;
    const zel = $(`.pc-zone[data-pos="${pos}"]`);
    if(zel){ zel.classList.remove('hit'); void zel.offsetWidth; zel.classList.add('hit', z.key === 'none' ? 'miss' : 'win'); }
    burst(b.x, st.H - 6, z.key === 'none' ? '#94a3b8' : '#ffd36b', 16);
    renderSlots(); renderTop();
    banner(z.key === 'none' ? '何もなし…' : z.label + '！', z.key === 'none' ? 'miss' : 'win');
    setMsg(`${st.ballIdx + 1}球目：<b class="${z.key === 'none' ? 'pc-t-miss' : 'pc-t-win'}">${esc(z.label)}</b>`);
    await wait(1500);
    if(!root) return;
    if(zel) zel.classList.remove('hit', 'miss', 'win');
    st.ballIdx++;
    if(st.ballIdx < BALLS){
      setActions(`<button type="button" class="pc-btn pc-btn-main" data-act="next">${st.ballIdx + 1}球目へ</button>`);
      setMsg(`${st.ballIdx}球目：<b class="${z.key === 'none' ? 'pc-t-miss' : 'pc-t-win'}">${esc(z.label)}</b>　カードは再び使えるようになります`);
      $('.pc-actions [data-act="next"]').addEventListener('click', () => { setActions(''); launchBall(); });
      renderTop();
    } else {
      st.phase = 'end';
      showResult();
    }
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
        <div class="pc-res-t"><span class="pc-z-ico pc-z-coin">G</span><b>${g}G</b></div>
        <div class="pc-res-t"><span class="pc-z-ico pc-z-star">★</span><b>特別アップグレード×${s}</b></div>
      </div>
      <button type="button" class="pc-btn pc-btn-main" data-act="close">戻る</button>
    </div>`;
    wrap.classList.add('show');
    wrap.querySelector('[data-act="close"]').addEventListener('click', close);
  }

  // ---------- 描画 ----------
  function boltPath(col, seed){
    let s = seed;
    const r = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    const pts = []; const cx = COLW * (col + 0.5);
    for(let y = 0; y <= st.H; y += 22) pts.push([cx + (r() - 0.5) * COLW * 0.7, y]);
    return pts;
  }
  function draw(){
    const H = st.H, sc = st.scale;
    ctx.setTransform(sc, 0, 0, sc, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // 列ガイド
    for(let k = 0; k < SLOT_N; k++){
      ctx.fillStyle = k % 2 ? 'rgba(255,255,255,.018)' : 'rgba(255,255,255,.04)';
      ctx.fillRect(COLW * k, 0, COLW, H);
    }
    ctx.strokeStyle = 'rgba(160,190,255,.10)'; ctx.lineWidth = 1; ctx.setLineDash([3, 6]);
    for(let k = 1; k < SLOT_N; k++){ ctx.beginPath(); ctx.moveTo(COLW * k, 0); ctx.lineTo(COLW * k, H - 26); ctx.stroke(); }
    ctx.setLineDash([]);
    // 仕切り
    ctx.fillStyle = '#c9a24a';
    for(let k = 1; k < SLOT_N; k++){ ctx.fillRect(COLW * k - 1.5, H - 26, 3, 26); }
    // 発射口
    ctx.fillStyle = 'rgba(255,210,120,.25)'; ctx.fillRect(W / 2 - 64, 0, 128, 3);
    // 棒
    const ps = pegSprite.width / 3;
    for(const p of st.pegs){
      if(!p.alive){
        if(p.fade > 0){ ctx.globalAlpha = p.fade; ctx.fillStyle = '#bfe3ff'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + (1 - p.fade) * 8, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; p.fade -= 0.04; }
        continue;
      }
      if(p.seal){
        ctx.fillStyle = 'rgba(192,132,252,.35)'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 4 + p.born * 10, 0, Math.PI * 2); ctx.fill();
        if(p.born > 0) p.born = Math.max(0, p.born - 0.03);
      }
      ctx.drawImage(pegSprite, p.x - ps / 2, p.y - ps / 2, ps, ps);
      if(p.seal){ ctx.strokeStyle = '#e9d5ff'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 1.5, 0, Math.PI * 2); ctx.stroke(); }
      if(p.hit > 0){ ctx.globalAlpha = p.hit; ctx.fillStyle = '#fff6d0'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 3, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; p.hit -= 0.08; }
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
    const b = st.ball;
    if(b){
      for(let i = 0; i < b.trail.length; i++){
        const t = b.trail[i], a = (i + 1) / b.trail.length;
        ctx.globalAlpha = a * 0.45; ctx.fillStyle = '#ffcf6b';
        ctx.beginPath(); ctx.arc(t.x, t.y, BALL_R * (0.35 + a * 0.55), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      const bs = ballSprite.width / 3;
      ctx.drawImage(ballSprite, b.x - bs / 2, b.y - bs / 2, bs, bs);
    }
  }

  function tickFx(){
    for(const f of st.fx) f.t++;
    st.fx = st.fx.filter(f => f.t < f.life);
    for(const q of st.parts){ q.x += q.vx; q.y += q.vy; q.vy += 0.08; q.t++; }
    st.parts = st.parts.filter(q => q.t < q.life);
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
      if(st.phase === 'fall') step();
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
      log:[], stats:{ thunder:0, guide:0, seal:0, redraw:0 }, H:480, scale:1, acc:0, lastTs:null,
    };
    _debug.state = st;
    if(!pegSprite) makeSprites();
    build();
    sizeBoard();
    st.pegs = buildPegs(st.H);
    renderAll();
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);
    rafId = requestAnimationFrame(loop);
    showIntro();
    return new Promise(res => { resolveFn = res; });
  }

  return { open, isOpen:() => !!root, jumpVelocity, ZONES, ACTIVE_JAMS, _debug, _useCard:i => { if(st && st.phase === 'fall') useCard(i); } };
})();
