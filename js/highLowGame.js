/* highLowGame.js — ミニゲーム「千里眼とのハイロー対決」
 * 公開API（グローバル const HighLowGame）:
 *   HighLowGame.open({floor}) -> Promise<{win:boolean}>  オーバーレイを閉じたときに resolve
 *   HighLowGame.isOpen()
 *   HighLowGame.npcDecide(npcVal, playerVal, falter, rng) -> 'bet'|'check'   NPCのレイズ判断
 *   HighLowGame.npcRespond(npcVal, playerVal, falter, rng) -> 'call'|'fold'  プレイヤーのレイズへの応答
 *   HighLowGame.npcCallProb(npcVal, playerVal, falter) -> 0..1               コール確率
 *     falter: boolean（千里眼不調）。数値を渡した場合はラウンド番号とみなし、進行中の勝負の不調ラウンドか判定。
 *   HighLowGame.effectiveValue(card, gambleDelta) -> number                   このミニゲームでの札の値
 *   HighLowGame.roundPoints(npcBet, playerBet) -> 1|2|4                      ラウンド勝者の得点
 *   HighLowGame._debug  テスト用（rng / respondRng / gambleRng 上書き / npcPick 上書き / state 参照 / delayScale）
 * 報酬の付与は行わない（呼び出し側の責務）。表示のみ。
 * ルール:
 *   プレイヤーはデッキからランダムに8枚（コピー）を引く。NPCの手札は [0,10,20,40,100]。
 *   札の値（この勝負のみ・デッキのカードは変更しない）：基礎点に強化倍率（横拡張・縦拡張×2／拡大×4）を先に掛け、
 *     その後ギャンブルの加算値（本編と同じ抽選：-50〜+50、レリック「ギャンブル依存症」なら±50）を足す。
 *   各ラウンド：プレイヤーが表向きで1枚選ぶ → NPCはランダムに1枚選び（伏せ）、勝敗を透視してレイズ/チェック宣言
 *   （勝ち確定 80%レイズ・負け確定 20%レイズ・引き分け 50%、千里眼不調の回は常に50%）
 *   千里眼不調：ジャミング「混乱」「スタン」「ブレイク」「ビンゴ阻害」付きの札を出すと、次の回戦で千里眼が不調になる。
 *   → NPCチェック時：プレイヤーがレイズ/チェック。NPCレイズ時：プレイヤーがレイズ/コール/フォールド
 *     （フォールド→NPCが倍化なしの1点を獲得、コール→公開でNPCレイズ×2）。
 *     チェック：公開。高い方が勝ち、基本1点・NPCレイズで×2。同値は0点。
 *     レイズ：NPCがコール/フォールドを選ぶ（勝ち・引き分けが視えればコール、負けが視えればフォールド。
 *       不調の回は50%。NPCの札が0なら常にフォールド）。
 *       コール→公開、プレイヤーレイズでさらに×2。フォールド→即終了、プレイヤーがレイズ倍化なしの得点を獲得。
 *   最大5回戦。プレイヤーが3点取った時点で勝利。5回戦終了時にプレイヤーが3点未満なら敗北（千里眼の点数は勝敗に無関係）。使ったカードは消費。
 */
const HighLowGame = (function(){
  'use strict';
  const _se=(n,o)=>{ try{ if(typeof SFX!=='undefined') SFX.play(n,o); }catch(e){} };

  const NPC_CARDS = [0, 10, 20, 40, 100];
  const MAX_ROUNDS = 5, WIN_POINTS = 3, HAND_SIZE = 8;
  const FALTER_JAMMINGS = ['混乱', 'スタン', 'ブレイク', 'ビンゴ阻害'];   // 出した次の回戦で千里眼が不調になる
  const ENHANCE_MULT = { '横拡張':2, '縦拡張':2, '拡大':4 };   // この勝負のみ基礎点に掛ける倍率

  const _debug = { rng:null, respondRng:null, gambleRng:null, npcPick:null, delayScale:1, state:null };
  const rnd = () => (_debug.rng ? _debug.rng() : Math.random());

  let st = null, root = null, resolveFn = null;

  // ---------- 純粋ロジック ----------
  // falter: boolean。数値ならラウンド番号として進行中の勝負の不調ラウンドか判定
  function isFalter(f){
    if(typeof f === 'number') return !!(st && st.falterRounds && st.falterRounds.includes(f));
    return !!f;
  }
  function npcBetProb(npcVal, playerVal, falter){
    if(isFalter(falter)) return 0.5;
    if(npcVal > playerVal) return 0.8;
    if(npcVal < playerVal) return 0.2;
    return 0.5;
  }
  function npcDecide(npcVal, playerVal, falter, rng){
    const r = (rng || rnd)();
    return r < npcBetProb(npcVal, playerVal, falter) ? 'bet' : 'check';
  }
  // プレイヤーのレイズに対するNPCのコール確率
  function npcCallProb(npcVal, playerVal, falter){
    if(npcVal === 0) return 0;                    // 0の札は必ずフォールド（不調回でも）
    if(isFalter(falter)) return 0.5;              // 千里眼不調：ランダム
    if(npcVal > playerVal) return 1;              // 勝ちが視えている → コール
    if(npcVal < playerVal) return 0;              // 負けが視えている → フォールド
    return 1;                                     // 引き分け → コール（失うものはない）
  }
  function npcRespond(npcVal, playerVal, falter, rng){
    const r = (rng || _debug.respondRng || rnd)();
    return r < npcCallProb(npcVal, playerVal, falter) ? 'call' : 'fold';
  }
  function roundPoints(npcBet, playerBet){
    return 1 * (npcBet ? 2 : 1) * (playerBet ? 2 : 1);
  }

  // ---------- ユーティリティ ----------
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const reduced = () => { try{ return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){ return false; } };
  const wait = ms => new Promise(r => setTimeout(r, reduced() ? Math.min(ms, 120) * _debug.delayScale : ms * _debug.delayScale));
  // 手札エントリ h の値（effectiveValue で算出済み）
  const valOf = h => Number(h && h.val) || 0;
  const causesFalter = card => !!(card && FALTER_JAMMINGS.includes(card.jamming));

  // 本編のギャンブル基礎点（手札に来た時の加算分を除いた値）
  function rawBase(card){
    let b = Number(card && card.baseScore) || 0;
    if(card && card.enhance === 'ギャンブル' && card._gambleDelta) b -= card._gambleDelta;
    return b;
  }
  // 本編（GameMainScene の手札追加処理）と同じ抽選：-50〜+50 の整数。ギャンブル依存症なら ±50
  function rollGamble(){
    const r = () => (_debug.gambleRng ? _debug.gambleRng() : Math.random());
    let addicted = false;
    try{
      addicted = typeof GameState !== 'undefined' && GameState.hasRelic && GameState.hasRelic('gambling_addict')
        && (typeof GameMainScene === 'undefined' || !GameMainScene.relicActive || GameMainScene.relicActive());
    }catch(e){ addicted = false; }
    return addicted ? (r() < 0.5 ? 50 : -50) : Math.round(r() * 100 - 50);
  }
  // 計算順：①基礎点 ×強化倍率（横拡張・縦拡張×2／拡大×4） → ②ギャンブル加算値を足す
  function effectiveValue(card, gambleDelta){
    const mult = ENHANCE_MULT[card && card.enhance] || 1;
    return rawBase(card) * mult + (card && card.enhance === 'ギャンブル' ? (Number(gambleDelta) || 0) : 0);
  }
  function makeEntry(uid, card){
    // card はコピー。表示用にギャンブル加算前の基礎点へ戻しておく（デッキ本体は変更しない）
    if(card.enhance === 'ギャンブル'){ card.baseScore = rawBase(card); card._gambleDelta = 0; }
    const base = rawBase(card), mult = ENHANCE_MULT[card.enhance] || 1;
    const gamble = card.enhance === 'ギャンブル' ? rollGamble() : 0;
    return { uid, card, base, mult, gamble, val:effectiveValue(card, gamble), falter:causesFalter(card) };
  }
  // 札の値ラベル（変化がなければ値のみ）
  function valLabel(h){
    return (h.mult !== 1 || h.gamble) ? `基礎${h.base}→${h.val}` : String(h.val);
  }
  function tagsHtml(h){
    const t = [];
    if(h.mult !== 1) t.push(`<span class="hl-tag mult">基礎×${h.mult}</span>`);
    if(h.card.enhance === 'ギャンブル') t.push(`<span class="hl-tag gamble">ギャンブル${h.gamble >= 0 ? '+' : ''}${h.gamble}</span>`);
    if(h.falter) t.push(`<span class="hl-tag falter">次の番 不調</span>`);
    return t.length ? `<span class="hl-tags">${t.join('')}</span>` : '';
  }

  function cloneCard(c){
    try{ return JSON.parse(JSON.stringify(c)); }catch(e){ return Object.assign({}, c); }
  }
  function drawPlayerHand(){
    const deck = (typeof GameState !== 'undefined' && Array.isArray(GameState.currentDeck)) ? GameState.currentDeck : [];
    const idx = deck.map((_, i) => i);
    for(let i = idx.length - 1; i > 0; i--){ const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    const hand = idx.slice(0, HAND_SIZE).map((i, k) => makeEntry('p' + k, cloneCard(deck[i])));
    // デッキが極端に少ない場合の保険
    while(hand.length < MAX_ROUNDS){ hand.push(makeEntry('p' + hand.length, { symbol:'Circle', baseScore:10 })); }
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
    return `<div class="hl-fallback-val">${rawBase(card)}</div>`;
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
          <div class="hl-score-mid"><b>3点</b>取れば勝利</div>
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
      const r = i + 1, f = st.falterRounds.includes(r);
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
      // v1.17 出した札は公開（めくり）されるまで残り札として表示し、どれを出したか分からないようにする
      `<span class="hl-chip${(st.npcHand.includes(v) || (st.cur && st.cur.nv === v && !st.cur.revealed)) ? '' : ' used'}">${v}</span>`).join('');
  }
  function renderScore(bump){
    const p = $('.hl-score-num[data-k="p"]'), n = $('.hl-score-num[data-k="n"]');
    p.textContent = st.score.p; n.textContent = st.score.n;
    if(bump){ _se(bump === 'p' ? 'coin' : 'error'); }
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
      w.setAttribute('aria-label', `カード 値${valOf(h)}${h.falter ? '（次の番 千里眼不調）' : ''}`);
      w.innerHTML = `<div class="hl-cscale">${cardHtml(h.card)}</div>${tagsHtml(h)}<span class="hl-hval${h.val !== h.base ? ' mod' : ''}">${valLabel(h)}</span>`;
      w.addEventListener('click', () => onPick(h.uid));
      el.appendChild(w);
    });
  }
  function setSpeech(text, mood){
    const s = $('.hl-speech');
    s.className = 'hl-speech' + (mood ? ' ' + mood : '');
    $('.hl-speech-text').textContent = text;
    _se('page', { volume:0.5 });
    s.classList.remove('pop'); void s.offsetWidth; s.classList.add('pop');
  }
  function setMsg(html){ const m = $('.hl-msg'); m.innerHTML = html; GGoldifyDom(m); }
  function setActions(html){ $('.hl-actions').innerHTML = html; }
  function setDecl(who, kind){
    const el = $(who === 'n' ? '.hl-decl-npc' : '.hl-decl-player');
    el.className = 'hl-decl ' + (who === 'n' ? 'hl-decl-npc' : 'hl-decl-player') + (kind ? ' show ' + kind : '');
    el.textContent = kind === 'bet' ? 'レイズ ×2' : kind === 'check' ? 'チェック'
      : kind === 'call' ? 'コール' : kind === 'fold' ? 'フォールド' : '';
  }
  function renderAll(){ renderRounds(); renderNpc(); renderScore(); renderHand(); }

  // ---------- パネル ----------
  function showPanel(html){
    const layer = $('.hl-panel-layer');
    layer.innerHTML = `<div class="hl-panel">${html}</div>`;
    GGoldifyDom(layer);
    layer.classList.add('show');
    return layer.querySelector('.hl-panel');
  }
  function hidePanel(){ const l = $('.hl-panel-layer'); l.classList.remove('show'); l.innerHTML = ''; }

  function showIntro(){
    const p = showPanel(`
      <div class="hl-panel-emblem">${emblemSvg()}</div>
      <h2 class="hl-panel-title">千里眼とのハイロー対決</h2>
      <p class="hl-panel-lead">相手はあなたの札を透視する。</p>
      <ul class="hl-rules">
        <li>デッキから<b>8枚</b>（使い切り・デッキに影響なし）。相手の札は <b>0・10・20・40・100</b>。</li>
        <li>相手がチェック→あなたは<b>チェック</b>（公開、高い方に<b>1点</b>）か<b>レイズ</b>。</li>
        <li>相手がレイズ→<b>コール</b>（<b>2点</b>）／<b>フォールド</b>（相手に<b>1点</b>）／<b>レイズ</b>。同値は0点。</li>
        <li>あなたのレイズ：相手は勝ち・同値ならコール（得点<b>×2</b>、最大<b>4点</b>）、負けならフォールド（あなたに×2なしの得点）。<b>0の札</b>は必ずフォールド。</li>
        <li>最大<b>5回戦</b>で<b>3点</b>先取なら勝利、届かなければ負け。</li>
        <li><b>混乱・スタン・ブレイク・ビンゴ阻害</b>付きの札を出すと<span class="hl-falter-txt">次の回戦は千里眼不調</span>（判断がランダム）。</li>
        <li>強化（この勝負のみ）：横拡張・縦拡張<b>×2</b>、拡大<b>×4</b>。ギャンブルは倍率後に加算値を足す。</li>
      </ul>
      <div class="hl-reward">勝利報酬：<b>${esc(st.rewardText)}</b></div>
      <button type="button" class="hl-btn hl-btn-main" data-act="start">勝負する</button>`);
    p.querySelector('[data-act="start"]').addEventListener('click', () => { _se('confirm', {suppressTap:true}); hidePanel(); startRound(); });
  }

  function showResult(){
    const win = st.score.p >= WIN_POINTS; // v1.15 勝利条件はプレイヤーが3点以上のみ
    st.win = win;
    const p = showPanel(`
      <div class="hl-result ${win ? 'win' : 'lose'}">${win ? '勝利' : '敗北'}</div>
      <div class="hl-result-score">あなた <b>${st.score.p}</b> − <b>${st.score.n}</b> 千里眼</div>
      <p class="hl-panel-lead">${win ? '「……視えていたはずなのに。見事だ」' : (false ? '' : '「未来は、最初から決まっていた」')}</p>
      ${win ? `<div class="hl-reward">獲得：<b>${esc(st.rewardText)}</b></div>` : `<div class="hl-reward dim">報酬なし</div>`}
      <button type="button" class="hl-btn hl-btn-main" data-act="close">戻る</button>`);
    if(win){ _se('win'); setTimeout(() => _se('fanfare'), 380); } else _se('lose');
    p.querySelector('[data-act="close"]').addEventListener('click', () => { _se(win ? 'coin' : 'close', {suppressTap:true}); close(); });
  }

  // ---------- 進行 ----------
  function startRound(){
    st.phase = 'pick';
    st.cur = null;
    $('.hl-slot-npc .hl-slot-card').innerHTML = '';
    $('.hl-slot-player .hl-slot-card').innerHTML = '';
    setDecl('n', null); setDecl('p', null);
    const falter = st.falterRounds.includes(st.round);
    root.classList.toggle('falter', falter);
    $('.hl-arena').classList.remove('res-w', 'res-l', 'res-d');
    renderAll();
    setMsg(`<b>第${st.round}回戦</b>${falter ? '<span class="hl-falter-txt">（千里眼不調）</span>' : ''} ― 出す札を選んでください`);
    setActions('');
    if(falter) setSpeech('む…視界が霞む…', 'falter');
    else setSpeech(st.round === 1 ? '……お前の札は、すべて視えている。' : 'さあ、次の札を見せてみろ。', null);
  }

  async function onPick(uid){
    if(!st || st.phase !== 'pick') return;
    const h = st.hand.find(x => x.uid === uid && !x.used);
    if(!h) return;
    st.phase = 'npc';
    h.used = true;
    _se('select', {suppressTap:true});
    const pv = valOf(h);
    const falter = st.falterRounds.includes(st.round);
    // ジャミング「混乱」「スタン」「ブレイク」「ビンゴ阻害」付きの札 → 次の回戦で千里眼不調
    const triggered = h.falter && st.round < MAX_ROUNDS && !st.falterRounds.includes(st.round + 1);
    if(triggered) st.falterRounds.push(st.round + 1);
    // NPC：残り札からランダム
    let ni = _debug.npcPick ? _debug.npcPick(st.npcHand.slice(), pv, st.round) : Math.floor(rnd() * st.npcHand.length);
    if(typeof ni !== 'number' || ni < 0 || ni >= st.npcHand.length) ni = 0;
    const nv = st.npcHand.splice(ni, 1)[0];
    const decision = npcDecide(nv, pv, falter);
    st.cur = { pv, nv, npc:decision, player:null, card:h.card, falter };
    renderHand(); renderNpc(); renderRounds();
    $('.hl-slot-player .hl-slot-card').innerHTML = `<div class="hl-play-in"><div class="hl-cscale">${cardHtml(h.card)}</div><span class="hl-hval${h.val !== h.base ? ' mod' : ''}">${valLabel(h)}</span></div>`;
    $('.hl-slot-npc .hl-slot-card').innerHTML = `
      <div class="hl-flip"><div class="hl-flip-inner">
        <div class="hl-flip-face hl-flip-back"><div class="hl-back"></div></div>
        <div class="hl-flip-face hl-flip-front"><div class="hl-npc-card">${nv}</div></div>
      </div></div>`;
    if(triggered){
      setTimeout(() => _se('stun'), 200);
      setMsg(`千里眼が札を選んでいる…　<span class="hl-falter-txt">第${st.round + 1}回戦は千里眼不調！</span>`);
      setSpeech('ぐっ…札の力で視界が乱れる…', 'falter');
    } else {
      setMsg('千里眼が札を選んでいる…');
      setSpeech('……ふむ。', falter ? 'falter' : null);
    }
    root.classList.add('gazing');
    await wait(900);
    if(!root) return;
    root.classList.remove('gazing');
    const line = decision === 'bet'
      ? (falter ? 'む…視界が霞む…だが、レイズだ' : '…見えたぞ。レイズだ')
      : (falter ? 'む…視界が霞む…チェックにしておこう' : '…チェックだ');
    setSpeech(line, (falter ? 'falter ' : '') + (decision === 'bet' ? 'bet' : 'check'));
    _se(decision === 'bet' ? 'raise' : 'tap');
    setDecl('n', decision);
    st.phase = 'decide';
    setMsg(`千里眼は<b class="${decision === 'bet' ? 'hl-t-bet' : ''}">${decision === 'bet' ? 'レイズ' : 'チェック'}</b>。あなたは？`);
    const pts0 = roundPoints(decision === 'bet', false), pts1 = roundPoints(decision === 'bet', true);
    const actions = $('.hl-actions');
    if(decision === 'bet'){
      actions.classList.add('three');
      setActions(`
        <button type="button" class="hl-btn hl-btn-fold" data-act="fold">フォールド<small>相手 ${roundPoints(false, false)}点</small></button>
        <button type="button" class="hl-btn hl-btn-call" data-act="call">コール<small>勝者 ${pts0}点</small></button>
        <button type="button" class="hl-btn hl-btn-bet" data-act="bet">レイズ<small>コール ${pts1}点／降り ${pts0}点</small></button>`);
    } else {
      actions.classList.remove('three');
      setActions(`
        <button type="button" class="hl-btn hl-btn-check" data-act="check">チェック<small>勝者 ${pts0}点</small></button>
        <button type="button" class="hl-btn hl-btn-bet" data-act="bet">レイズ<small>コール ${pts1}点／降り ${pts0}点</small></button>`);
    }
    actions.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => onDecide(b.dataset.act)));
  }

  // act: 'check' | 'bet'(レイズ) | 'call'(相手のレイズを受ける) | 'fold'(相手のレイズに降りる)
  async function onDecide(act){
    if(!st || st.phase !== 'decide') return;
    if(act === true) act = 'bet'; else if(act === false) act = 'check';
    if(!['check', 'bet', 'call', 'fold'].includes(act)) return;
    const c = st.cur;
    if((act === 'call' || act === 'fold') && c.npc !== 'bet') return;
    if(act === 'check' && c.npc === 'bet') act = 'call';
    st.phase = 'reveal';
    const bet = act === 'bet';
    c.player = act;
    _se(act === 'bet' ? 'raise' : act === 'call' ? 'call' : act === 'fold' ? 'fold' : 'tap', {suppressTap:true});
    setDecl('p', c.player);
    setActions('');
    $('.hl-actions').classList.remove('three');
    const falter = !!c.falter;
    if(act === 'fold'){
      // プレイヤーが降りる：千里眼の勝ち（レイズの×2なし）
      c.response = null;
      setMsg('あなたはフォールドした…');
      const pc = $('.hl-slot-player .hl-play-in');
      if(pc) pc.classList.add('folded');
      await wait(450);
      if(!root) return;
      const fl = $('.hl-slot-npc .hl-flip');
      if(fl){ fl.classList.add('flipped'); _se('cardFlip'); } if(st && st.cur){ st.cur.revealed = true; renderNpc(); }
      await wait(650);
      if(!root) return;
      const pts = roundPoints(false, false);
      st.history.push({ round:st.round, pv:c.pv, nv:c.nv, npc:c.npc, player:'fold', response:null, folded:true, playerFolded:true, winner:'n', pts });
      $('.hl-arena').classList.add('res-l');
      st.score.n += pts;
      setMsg(`<span class="hl-t-lose">あなたがフォールド（千里眼の札は${c.nv}）　千里眼 +${pts}点</span>`);
      setSpeech(c.nv > c.pv ? '賢明だな。視えていた通りだ。' : c.nv < c.pv ? 'ふふ…降りたか。' : '……降りるか。', 'smug');
      renderScore('n');
      renderRounds();
      await wait(1200);
      if(!root) return;
      return afterRound();
    }
    if(bet){
      // NPCの応答：コール or フォールド
      c.response = npcRespond(c.nv, c.pv, falter);
      setMsg('千里眼が応答を考えている…');
      root.classList.add('gazing');
      await wait(700);
      if(!root) return;
      root.classList.remove('gazing');
      setDecl('n', c.response);
      _se(c.response === 'call' ? 'call' : 'fold');
      if(c.response === 'call'){
        setSpeech(falter ? 'む…霞んでよく視えぬ…コールだ' : '…コールだ', (falter ? 'falter ' : '') + 'call');
        setMsg('千里眼は<b class="hl-t-bet">コール</b>！');
        await wait(600);
        if(!root) return;
      } else {
        setSpeech(c.nv === 0 ? 'フォールド…この札では勝負にならん' : (falter ? 'む…嫌な予感がする…フォールド…' : 'フォールド…'), (falter ? 'falter ' : '') + 'fold');
        await wait(350);
        if(!root) return;
        const fl = $('.hl-slot-npc .hl-flip');
        if(fl){ fl.classList.add('flipped'); _se('cardFlip'); } if(st && st.cur){ st.cur.revealed = true; renderNpc(); }
        await wait(550);
        if(!root) return;
        if(fl) fl.classList.add('folded');
        await wait(450);
        if(!root) return;
        const pts = roundPoints(c.npc === 'bet', false);
        st.history.push({ round:st.round, pv:c.pv, nv:c.nv, npc:c.npc, player:c.player, response:'fold', folded:true, winner:'p', pts });
        $('.hl-arena').classList.add('res-w');
        st.score.p += pts;
        setMsg(`<span class="hl-t-win">千里眼がフォールド（札は${c.nv}）　あなたの勝ち +${pts}点</span>`);
        renderScore('p');
        renderRounds();
        await wait(1200);
        if(!root) return;
        return afterRound();
      }
    } else {
      c.response = null;
    }
    setMsg('公開！');
    await wait(250);
    if(!root) return;
    const fl = $('.hl-slot-npc .hl-flip');
    if(fl){ fl.classList.add('flipped'); _se('cardFlip'); } if(st && st.cur){ st.cur.revealed = true; renderNpc(); }
    await wait(650);
    if(!root) return;
    const pts = roundPoints(c.npc === 'bet', bet);
    let winner = 'd';
    if(c.pv > c.nv) winner = 'p'; else if(c.nv > c.pv) winner = 'n';
    st.history.push({ round:st.round, pv:c.pv, nv:c.nv, npc:c.npc, player:c.player, response:c.response, folded:false, winner, pts:winner === 'd' ? 0 : pts });
    $('.hl-arena').classList.add(winner === 'p' ? 'res-w' : winner === 'n' ? 'res-l' : 'res-d');
    if(winner === 'p'){ st.score.p += pts; setMsg(`<span class="hl-t-win">${c.pv} ＞ ${c.nv}　あなたの勝ち！ +${pts}点</span>`); setSpeech(c.npc === 'bet' || c.response === 'call' ? 'ば、馬鹿な…！' : '……そう来たか。', 'hurt'); }
    else if(winner === 'n'){ st.score.n += pts; setMsg(`<span class="hl-t-lose">${c.pv} ＜ ${c.nv}　千里眼の勝ち +${pts}点</span>`); setSpeech('視えていた通りだ。', 'smug'); }
    else { _se('deselect'); setMsg(`<span class="hl-t-draw">${c.pv} ＝ ${c.nv}　引き分け（得点なし）</span>`); setSpeech('……相打ちか。', null); }
    renderScore(winner === 'd' ? null : winner);
    renderRounds();
    await wait(1200);
    if(!root) return;
    afterRound();
  }

  function afterRound(){
    // v1.15 プレイヤーが3点取れば勝利。千里眼が3点以上取っても終了せず、5回戦終了時にプレイヤーが3点未満なら敗北
    if(st.score.p >= WIN_POINTS || st.round >= MAX_ROUNDS){
      st.phase = 'end';
      showResult();
    } else {
      setActions(`<button type="button" class="hl-btn hl-btn-main" data-act="next">次の勝負へ</button>`);
      $('.hl-actions [data-act="next"]').addEventListener('click', () => { _se('confirm', {suppressTap:true}); st.round++; startRound(); });
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
      falterRounds:[],   // 千里眼不調の回戦（ジャミング札を出すと次の回戦が追加される）
    };
    _debug.state = st;
    _se('open');
    build();
    renderAll();
    setMsg('');
    document.addEventListener('keydown', onKey, true);
    showIntro();
    return new Promise(res => { resolveFn = res; });
  }

  return {
    open, isOpen:() => !!root,
    npcDecide, npcBetProb, npcRespond, npcCallProb, roundPoints, effectiveValue,
    NPC_CARDS, FALTER_JAMMINGS, ENHANCE_MULT, _debug,
  };
})();
