/* highLowGame.js — ミニゲーム「千里眼とのハイロー対決」
 * 公開API（グローバル const HighLowGame）:
 *   HighLowGame.open({floor}) -> Promise<{win:boolean}>  オーバーレイを閉じたときに resolve
 *   HighLowGame.isOpen()
 *   HighLowGame.npcDecide(npcVal, playerVal, round, rng) -> 'bet'|'check'   NPCのベット判断（純粋関数）
 *   HighLowGame.roundPoints(npcBet, playerBet) -> 1|2|4                      ラウンド勝者の得点
 *   HighLowGame._debug  テスト用（rng 上書き / npcPick 上書き / state 参照 / delayScale）
 * 報酬の付与は行わない（呼び出し側の責務）。表示のみ。
 * ルール:
 *   プレイヤーはデッキからランダムに8枚（コピー）を引き、値は baseScore。NPCの手札は [0,10,20,40,100]。
 *   各ラウンド：プレイヤーが表向きで1枚選ぶ → NPCはランダムに1枚選び（伏せ）、勝敗を透視してベット/チェック宣言
 *   （勝ち確定 80%ベット・負け確定 20%ベット・引き分け 50%、3・5回戦は千里眼不調で常に50%）
 *   → プレイヤーがベット/チェック → 公開。高い方が勝ち、基本1点・NPCベットで×2・プレイヤーベットで×2。同値は0点。
 *   最大5回戦・先に3点で勝利。5回戦終了時に点数が多い方の勝ち、同点はプレイヤーの敗北。使ったカードは消費。
 */
const HighLowGame = (function(){
  'use strict';

  const NPC_CARDS = [0, 10, 20, 40, 100];
  const MAX_ROUNDS = 5, WIN_POINTS = 3, HAND_SIZE = 8;
  const FALTER_ROUNDS = [3, 5];

  const _debug = { rng:null, npcPick:null, delayScale:1, state:null };
  const rnd = () => (_debug.rng ? _debug.rng() : Math.random());

  let st = null, root = null, resolveFn = null;

  // ---------- 純粋ロジック ----------
  function npcBetProb(npcVal, playerVal, round){
    if(FALTER_ROUNDS.includes(round)) return 0.5;
    if(npcVal > playerVal) return 0.8;
    if(npcVal < playerVal) return 0.2;
    return 0.5;
  }
  function npcDecide(npcVal, playerVal, round, rng){
    const r = (rng || rnd)();
    return r < npcBetProb(npcVal, playerVal, round) ? 'bet' : 'check';
  }
  function roundPoints(npcBet, playerBet){
    return 1 * (npcBet ? 2 : 1) * (playerBet ? 2 : 1);
  }

  // ---------- ユーティリティ ----------
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const reduced = () => { try{ return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){ return false; } };
  const wait = ms => new Promise(r => setTimeout(r, reduced() ? Math.min(ms, 120) * _debug.delayScale : ms * _debug.delayScale));
  const valOf = c => Number(c && c.baseScore) || 0;

  function cloneCard(c){
    try{ return JSON.parse(JSON.stringify(c)); }catch(e){ return Object.assign({}, c); }
  }
  function drawPlayerHand(){
    const deck = (typeof GameState !== 'undefined' && Array.isArray(GameState.currentDeck)) ? GameState.currentDeck : [];
    const idx = deck.map((_, i) => i);
    for(let i = idx.length - 1; i > 0; i--){ const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    const hand = idx.slice(0, HAND_SIZE).map((i, k) => ({ uid:'p' + k, card:cloneCard(deck[i]) }));
    // デッキが極端に少ない場合の保険
    while(hand.length < MAX_ROUNDS){ hand.push({ uid:'p' + hand.length, card:{ symbol:'Circle', baseScore:10 } }); }
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
    return `<div class="hl-fallback-val">${valOf(card)}</div>`;
  }
  function cardHtml(card){
    const tr = card.trait ? ' trait-' + String(card.trait).replace(/[()]/g, '') : '';
    return `<div class="card${tr}">${cardInnerHtml(card)}</div>`;
  }

  // ---------- 千里眼エンブレム（オリジナルSVG） ----------
  function emblemSvg(){
    return `<svg class="hl-emblem" viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <radialGradient id="hlOrb" cx="50%" cy="45%" r="55%">
          <stop offset="0" stop-color="#f5d0fe"/><stop offset=".45" stop-color="#a855f7"/><stop offset="1" stop-color="#2e1065"/>
        </radialGradient>
        <radialGradient id="hlIris" cx="50%" cy="50%" r="50%">
          <stop offset="0" stop-color="#fdf4ff"/><stop offset=".35" stop-color="#e879f9"/><stop offset="1" stop-color="#581c87"/>
        </radialGradient>
      </defs>
      <g class="hl-rays" stroke="#c084fc" stroke-width="2" stroke-linecap="round" opacity=".7">
        ${Array.from({length:12}, (_, i) => { const a = i * 30 * Math.PI / 180; const r1 = 46, r2 = i % 2 ? 53 : 58;
          return `<line x1="${(60 + Math.cos(a) * r1).toFixed(1)}" y1="${(60 + Math.sin(a) * r1).toFixed(1)}" x2="${(60 + Math.cos(a) * r2).toFixed(1)}" y2="${(60 + Math.sin(a) * r2).toFixed(1)}"/>`; }).join('')}
      </g>
      <polygon points="60,8 104,34 104,86 60,112 16,86 16,34" fill="none" stroke="#7c3aed" stroke-width="1.5" opacity=".8"/>
      <circle cx="60" cy="60" r="40" fill="url(#hlOrb)" stroke="#e9d5ff" stroke-width="1.5"/>
      <path d="M24 60 Q60 30 96 60 Q60 90 24 60 Z" fill="#1e0b3a" stroke="#f5d0fe" stroke-width="2"/>
      <g class="hl-iris"><circle cx="60" cy="60" r="15" fill="url(#hlIris)"/><circle cx="60" cy="60" r="6" fill="#0b0215"/><circle cx="55" cy="55" r="2.6" fill="#fff" opacity=".9"/></g>
      <rect class="hl-lid" x="20" y="28" width="80" height="0" fill="#3b0764"/>
    </svg>`;
  }

  // ---------- DOM ----------
  function build(){
    root = document.createElement('div');
    root.className = 'hl-overlay';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', '千里眼とのハイロー対決');
    root.innerHTML = `
      <div class="hl-bg"></div>
      <div class="hl-main">
        <div class="hl-top">
          <div class="hl-title">千里眼とのハイロー対決</div>
          <div class="hl-rounds"></div>
        </div>
        <div class="hl-opp">
          <div class="hl-emblem-wrap">${emblemSvg()}</div>
          <div class="hl-opp-side">
            <div class="hl-opp-name">千里眼の占者</div>
            <div class="hl-speech"><span class="hl-speech-text">……お前の札は、すべて視えている。</span></div>
            <div class="hl-npc-backs"></div>
            <div class="hl-npc-list"></div>
          </div>
        </div>
        <div class="hl-arena">
          <div class="hl-slot hl-slot-npc">
            <div class="hl-slot-label">千里眼</div>
            <div class="hl-slot-card"></div>
            <div class="hl-decl hl-decl-npc"></div>
          </div>
          <div class="hl-vs">VS</div>
          <div class="hl-slot hl-slot-player">
            <div class="hl-slot-label">あなた</div>
            <div class="hl-slot-card"></div>
            <div class="hl-decl hl-decl-player"></div>
          </div>
        </div>
        <div class="hl-score">
          <div class="hl-score-side hl-score-player"><span class="hl-score-lbl">あなた</span><span class="hl-score-num" data-k="p">0</span></div>
          <div class="hl-score-mid">先に<b>3点</b>で勝利</div>
          <div class="hl-score-side hl-score-npc"><span class="hl-score-num" data-k="n">0</span><span class="hl-score-lbl">千里眼</span></div>
        </div>
        <div class="hl-msg"></div>
        <div class="hl-actions"></div>
        <div class="hl-hand"></div>
      </div>
      <div class="hl-panel-layer"></div>`;
    document.body.appendChild(root);
  }
  const $ = sel => root.querySelector(sel);

  function renderRounds(){
    const el = $('.hl-rounds');
    el.innerHTML = Array.from({length:MAX_ROUNDS}, (_, i) => {
      const r = i + 1, f = FALTER_ROUNDS.includes(r);
      const cls = ['hl-pip'];
      if(f) cls.push('falter');
      if(r === st.round) cls.push('cur');
      if(r < st.round) cls.push('done');
      const res = st.history[i];
      const mark = res ? (res.winner === 'p' ? '<i class="hl-pip-res w">勝</i>' : res.winner === 'n' ? '<i class="hl-pip-res l">負</i>' : '<i class="hl-pip-res d">分</i>') : '';
      return `<div class="${cls.join(' ')}"><span class="hl-pip-n">${r}</span>${f ? '<span class="hl-pip-tag">千里眼不調</span>' : ''}${mark}</div>`;
    }).join('');
  }
  function renderNpc(){
    $('.hl-npc-backs').innerHTML = st.npcHand.map(() => `<div class="hl-back mini"></div>`).join('');
    $('.hl-npc-list').innerHTML = '<span class="hl-npc-list-lbl">残り札</span>' + NPC_CARDS.map(v =>
      `<span class="hl-chip${st.npcHand.includes(v) ? '' : ' used'}">${v}</span>`).join('');
  }
  function renderScore(bump){
    const p = $('.hl-score-num[data-k="p"]'), n = $('.hl-score-num[data-k="n"]');
    p.textContent = st.score.p; n.textContent = st.score.n;
    if(bump){ const el = bump === 'p' ? p : n; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  }
  function renderHand(){
    const el = $('.hl-hand');
    el.innerHTML = '';
    st.hand.forEach(h => {
      const w = document.createElement('button');
      w.type = 'button';
      w.className = 'hl-hcard' + (h.used ? ' used' : '');
      w.dataset.uid = h.uid;
      w.disabled = h.used || st.phase !== 'pick';
      w.setAttribute('aria-label', `カード 値${valOf(h.card)}`);
      w.innerHTML = `<div class="hl-cscale">${cardHtml(h.card)}</div><span class="hl-hval">${valOf(h.card)}</span>`;
      w.addEventListener('click', () => onPick(h.uid));
      el.appendChild(w);
    });
  }
  function setSpeech(text, mood){
    const s = $('.hl-speech');
    s.className = 'hl-speech' + (mood ? ' ' + mood : '');
    $('.hl-speech-text').textContent = text;
    s.classList.remove('pop'); void s.offsetWidth; s.classList.add('pop');
  }
  function setMsg(html){ $('.hl-msg').innerHTML = html; }
  function setActions(html){ $('.hl-actions').innerHTML = html; }
  function setDecl(who, kind){
    const el = $(who === 'n' ? '.hl-decl-npc' : '.hl-decl-player');
    el.className = 'hl-decl ' + (who === 'n' ? 'hl-decl-npc' : 'hl-decl-player') + (kind ? ' show ' + kind : '');
    el.textContent = kind === 'bet' ? 'ベット ×2' : kind === 'check' ? 'チェック' : '';
  }
  function renderAll(){ renderRounds(); renderNpc(); renderScore(); renderHand(); }

  // ---------- パネル ----------
  function showPanel(html){
    const layer = $('.hl-panel-layer');
    layer.innerHTML = `<div class="hl-panel">${html}</div>`;
    layer.classList.add('show');
    return layer.querySelector('.hl-panel');
  }
  function hidePanel(){ const l = $('.hl-panel-layer'); l.classList.remove('show'); l.innerHTML = ''; }

  function showIntro(){
    const p = showPanel(`
      <div class="hl-panel-emblem">${emblemSvg()}</div>
      <h2 class="hl-panel-title">千里眼とのハイロー対決</h2>
      <p class="hl-panel-lead">相手はあなたの手札を透視できる千里眼の持ち主。</p>
      <ul class="hl-rules">
        <li>デッキから<b>8枚</b>を引き、毎回1枚を出す（基礎点が数値）。相手の札は <b>0・10・20・40・100</b> の5枚。</li>
        <li>相手はあなたの札を見てから<b>ベット／チェック</b>を宣言。続けてあなたも選べる。</li>
        <li>数値が高い方が勝ち、<b>1点</b>。ベット1つにつき得点<b>×2</b>（最大4点）。同値は0点。</li>
        <li>最大<b>5回戦</b>・先に<b>3点</b>で勝利。5回戦終了時に同点なら<b>あなたの負け</b>。</li>
        <li><span class="hl-falter-txt">3回戦・5回戦</span>は千里眼の調子が悪く、相手の宣言はあてにならない。</li>
        <li>出した札は消費される（デッキには影響なし）。</li>
      </ul>
      <div class="hl-reward">勝利報酬：<b>${esc(st.rewardText)}</b></div>
      <button type="button" class="hl-btn hl-btn-main" data-act="start">勝負する</button>`);
    p.querySelector('[data-act="start"]').addEventListener('click', () => { hidePanel(); startRound(); });
  }

  function showResult(){
    const win = st.score.p > st.score.n && st.score.p > 0 ? true : false;
    st.win = win;
    const p = showPanel(`
      <div class="hl-result ${win ? 'win' : 'lose'}">${win ? '勝利' : '敗北'}</div>
      <div class="hl-result-score">あなた <b>${st.score.p}</b> − <b>${st.score.n}</b> 千里眼</div>
      <p class="hl-panel-lead">${win ? '「……視えていたはずなのに。見事だ」' : (st.score.p === st.score.n ? '「引き分けか。ならば我の勝ちとしよう」' : '「未来は、最初から決まっていた」')}</p>
      ${win ? `<div class="hl-reward">獲得：<b>${esc(st.rewardText)}</b></div>` : `<div class="hl-reward dim">報酬なし</div>`}
      <button type="button" class="hl-btn hl-btn-main" data-act="close">戻る</button>`);
    p.querySelector('[data-act="close"]').addEventListener('click', close);
  }

  // ---------- 進行 ----------
  function startRound(){
    st.phase = 'pick';
    st.cur = null;
    $('.hl-slot-npc .hl-slot-card').innerHTML = '';
    $('.hl-slot-player .hl-slot-card').innerHTML = '';
    setDecl('n', null); setDecl('p', null);
    root.classList.toggle('falter', FALTER_ROUNDS.includes(st.round));
    $('.hl-arena').classList.remove('res-w', 'res-l', 'res-d');
    renderAll();
    setMsg(`<b>第${st.round}回戦</b>${FALTER_ROUNDS.includes(st.round) ? '<span class="hl-falter-txt">（千里眼不調）</span>' : ''} ― 出す札を選んでください`);
    setActions('');
    if(FALTER_ROUNDS.includes(st.round)) setSpeech('む…視界が霞む…', 'falter');
    else setSpeech(st.round === 1 ? '……お前の札は、すべて視えている。' : 'さあ、次の札を見せてみろ。', null);
  }

  async function onPick(uid){
    if(!st || st.phase !== 'pick') return;
    const h = st.hand.find(x => x.uid === uid && !x.used);
    if(!h) return;
    st.phase = 'npc';
    h.used = true;
    const pv = valOf(h.card);
    // NPC：残り札からランダム
    let ni = _debug.npcPick ? _debug.npcPick(st.npcHand.slice(), pv, st.round) : Math.floor(rnd() * st.npcHand.length);
    if(typeof ni !== 'number' || ni < 0 || ni >= st.npcHand.length) ni = 0;
    const nv = st.npcHand.splice(ni, 1)[0];
    const decision = npcDecide(nv, pv, st.round);
    st.cur = { pv, nv, npc:decision, player:null, card:h.card };
    renderHand(); renderNpc();
    $('.hl-slot-player .hl-slot-card').innerHTML = `<div class="hl-play-in"><div class="hl-cscale">${cardHtml(h.card)}</div><span class="hl-hval">${pv}</span></div>`;
    $('.hl-slot-npc .hl-slot-card').innerHTML = `
      <div class="hl-flip"><div class="hl-flip-inner">
        <div class="hl-flip-face hl-flip-back"><div class="hl-back"></div></div>
        <div class="hl-flip-face hl-flip-front"><div class="hl-npc-card">${nv}</div></div>
      </div></div>`;
    setMsg('千里眼が札を選んでいる…');
    setSpeech('……ふむ。', FALTER_ROUNDS.includes(st.round) ? 'falter' : null);
    root.classList.add('gazing');
    await wait(900);
    if(!root) return;
    root.classList.remove('gazing');
    const falter = FALTER_ROUNDS.includes(st.round);
    const line = decision === 'bet'
      ? (falter ? 'む…視界が霞む…だが、ベットだ' : '…見えたぞ。ベットだ')
      : (falter ? 'む…視界が霞む…チェックにしておこう' : '…チェックだ');
    setSpeech(line, (falter ? 'falter ' : '') + (decision === 'bet' ? 'bet' : 'check'));
    setDecl('n', decision);
    st.phase = 'decide';
    setMsg(`千里眼は<b class="${decision === 'bet' ? 'hl-t-bet' : ''}">${decision === 'bet' ? 'ベット' : 'チェック'}</b>。あなたは？`);
    const pts0 = roundPoints(decision === 'bet', false), pts1 = roundPoints(decision === 'bet', true);
    setActions(`
      <button type="button" class="hl-btn hl-btn-check" data-act="check">チェック<small>勝者 ${pts0}点</small></button>
      <button type="button" class="hl-btn hl-btn-bet" data-act="bet">ベット<small>勝者 ${pts1}点</small></button>`);
    $('.hl-actions [data-act="check"]').addEventListener('click', () => onDecide(false));
    $('.hl-actions [data-act="bet"]').addEventListener('click', () => onDecide(true));
  }

  async function onDecide(bet){
    if(!st || st.phase !== 'decide') return;
    st.phase = 'reveal';
    const c = st.cur;
    c.player = bet ? 'bet' : 'check';
    setDecl('p', c.player);
    setActions('');
    setMsg('公開！');
    await wait(250);
    if(!root) return;
    const fl = $('.hl-slot-npc .hl-flip');
    if(fl) fl.classList.add('flipped');
    await wait(650);
    if(!root) return;
    const pts = roundPoints(c.npc === 'bet', bet);
    let winner = 'd';
    if(c.pv > c.nv) winner = 'p'; else if(c.nv > c.pv) winner = 'n';
    st.history.push({ round:st.round, pv:c.pv, nv:c.nv, npc:c.npc, player:c.player, winner, pts:winner === 'd' ? 0 : pts });
    $('.hl-arena').classList.add(winner === 'p' ? 'res-w' : winner === 'n' ? 'res-l' : 'res-d');
    if(winner === 'p'){ st.score.p += pts; setMsg(`<span class="hl-t-win">${c.pv} ＞ ${c.nv}　あなたの勝ち！ +${pts}点</span>`); setSpeech(c.npc === 'bet' ? 'ば、馬鹿な…！' : '……そう来たか。', 'hurt'); }
    else if(winner === 'n'){ st.score.n += pts; setMsg(`<span class="hl-t-lose">${c.pv} ＜ ${c.nv}　千里眼の勝ち +${pts}点</span>`); setSpeech('視えていた通りだ。', 'smug'); }
    else { setMsg(`<span class="hl-t-draw">${c.pv} ＝ ${c.nv}　引き分け（得点なし）</span>`); setSpeech('……相打ちか。', null); }
    renderScore(winner === 'd' ? null : winner);
    renderRounds();
    await wait(1200);
    if(!root) return;
    if(st.score.p >= WIN_POINTS || st.score.n >= WIN_POINTS || st.round >= MAX_ROUNDS){
      st.phase = 'end';
      showResult();
    } else {
      setActions(`<button type="button" class="hl-btn hl-btn-main" data-act="next">次の勝負へ</button>`);
      $('.hl-actions [data-act="next"]').addEventListener('click', () => { st.round++; startRound(); });
    }
  }

  function close(){
    if(!root) return;
    const res = { win:!!(st && st.win) };
    const r = resolveFn;
    root.classList.add('closing');
    const el = root;
    root = null; resolveFn = null; st = null; _debug.state = null;
    document.removeEventListener('keydown', onKey, true);
    setTimeout(() => { el.remove(); }, reduced() ? 0 : 220);
    if(r) r(res);
  }
  function onKey(e){ if(root) e.stopPropagation(); }

  function open(opts){
    opts = opts || {};
    if(root){ return Promise.resolve({ win:false }); }
    const floor = Number(opts.floor) || 1;
    const n = floor >= 8 ? 2 : 1;
    st = {
      floor, n, rewardText:`特別アップグレード1パック＋${10 * n}G`,
      hand:drawPlayerHand(), npcHand:NPC_CARDS.slice(),
      round:1, score:{ p:0, n:0 }, history:[], phase:'intro', cur:null, win:false,
    };
    _debug.state = st;
    build();
    renderAll();
    setMsg('');
    document.addEventListener('keydown', onKey, true);
    showIntro();
    return new Promise(res => { resolveFn = res; });
  }

  return {
    open, isOpen:() => !!root,
    npcDecide, npcBetProb, roundPoints,
    NPC_CARDS, _debug,
  };
})();
