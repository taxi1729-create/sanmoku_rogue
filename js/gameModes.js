/**
 * #7 ゲームモード解放（メタ進行）／#8 10階層クリア特典「裏世界」フリープレイ
 *   GameMeta：セーブスロットとは別の永続データ（localStorage 'sanmoku_meta' = {unlockedModes:[], cleared10:false}）
 *     - isModeUnlocked(id) / unlockRandomMode() / onFloor5Cleared() -> Promise（解放告知モーダル）
 *     - setCleared10() / isCleared10()
 *   UraFreePlay：タイトルの「裏世界」。モードのデッキ（全カード基礎点×3）でミニゲームを自由に遊ぶ。
 *     遊ぶ前に GameState を丸ごと退避し、終了後に復元する。報酬は付与せず、セーブもしない。
 */
const GameMeta = {
  KEY: 'sanmoku_meta',
  load(){
    let d=null;
    try{ d=JSON.parse(localStorage.getItem(this.KEY)||'null'); }catch(e){ d=null; }
    if(!d||typeof d!=='object') d={};
    if(!Array.isArray(d.unlockedModes)) d.unlockedModes=[];
    d.cleared10=!!d.cleared10;
    return d;
  },
  save(d){ try{ localStorage.setItem(this.KEY, JSON.stringify(d)); }catch(e){} },
  isModeUnlocked(id){
    const m=GameData.GAME_MODES[id];
    if(!m) return false;
    if(!m.unlockable) return true;
    return this.load().unlockedModes.includes(id);
  },
  lockedModes(){
    const d=this.load();
    return (GameData.UNLOCKABLE_MODE_IDS||[]).filter(id=>GameData.GAME_MODES[id]&&!d.unlockedModes.includes(id));
  },
  // 未解放のモードからランダムに1つ解放して返す（全て解放済みなら null）
  unlockRandomMode(){
    const locked=this.lockedModes();
    if(!locked.length) return null;
    const id=locked[Math.floor(Math.random()*locked.length)];
    const d=this.load(); d.unlockedModes.push(id); this.save(d);
    return GameData.GAME_MODES[id];
  },
  onFloor5Cleared(){
    const m=this.unlockRandomMode();
    if(!m) return Promise.resolve(null);
    return this.announce(m).then(()=>m);
  },
  announce(m){
    return new Promise(resolve=>{
      const ov=document.createElement('div'); ov.className='pack-modal-overlay gm-unlock-overlay';
      ov.innerHTML=`<div class="pack-modal gm-unlock-modal" role="dialog" aria-label="ゲームモード解放">
        <div class="gm-unlock-tag">NEW GAME MODE</div>
        <div class="gm-unlock-msg">新たなゲームモード『${m.name}』が解放された</div>
        <div class="gm-unlock-desc">${m.deckDesc}${m.relicDesc&&m.relicDesc!=='なし'?`<br>初期所持レリック：${m.relicDesc}`:''}</div>
        <div class="gm-unlock-hint">「はじめから」のゲームモード選択で選べます</div>
        <button type="button" class="gm-unlock-ok">OK</button></div>`;
      const close=()=>{ ov.remove(); resolve(); };
      ov.querySelector('.gm-unlock-ok').addEventListener('click',close);
      document.body.appendChild(ov);
      try{ if(typeof SFX!=='undefined') SFX.play('fanfare'); }catch(e){}
    });
  },
  setCleared10(){ const d=this.load(); if(!d.cleared10){ d.cleared10=true; this.save(d); } },
  isCleared10(){ return this.load().cleared10; },
};

const UraFreePlay = {
  MULT: 3,
  selectedMode: 'normal',
  lastResult: '',
  busy: false,
  GAMES: [
    { id:'throw', name:'投射チャレンジ', icon:'throw', mod:()=>typeof ThrowGame!=='undefined'?ThrowGame:null },
    { id:'pachinko', name:'パチンコ', icon:'pachinko', mod:()=>typeof PachinkoGame!=='undefined'?PachinkoGame:null },
    { id:'derby', name:'シンボルダービー', icon:'derby', mod:()=>typeof DerbyGame!=='undefined'?DerbyGame:null },
    { id:'highlow', name:'千里眼との対決', icon:'highlow', mod:()=>typeof HighLowGame!=='undefined'?HighLowGame:null },
  ],
  // モードの初期デッキを全カード基礎点（と数字）×3にして返す
  buildDeck(modeId){
    return GameData.buildDeckForMode(modeId).map(c=>({ ...c, baseScore:c.baseScore*this.MULT, number:c.number*this.MULT }));
  },
  _esc(v){ return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); },
  show(){
    const container=App.container;
    container.innerHTML='';
    if(!GameMeta.isModeUnlocked(this.selectedMode)) this.selectedMode='normal';
    const modes=Object.values(GameData.GAME_MODES).filter(m=>GameMeta.isModeUnlocked(m.id));
    const cur=GameData.GAME_MODES[this.selectedMode];
    const el=document.createElement('div'); el.className='title-screen ura-free';
    el.innerHTML=`
      <h2 class="ura-free-title">裏世界<small>10階層クリア特典・フリープレイ</small></h2>
      <div class="ura-free-note">選んだゲームモードのデッキ（全カード基礎点×${this.MULT}）でミニゲームを遊べます。報酬・セーブへの影響はありません。</div>
      <div class="shop-section-title">デッキ：${this._esc(cur.name)}（基礎点×${this.MULT}）</div>
      <div class="gamemode-btn-row ura-free-modes">${modes.map(m=>`<button type="button" class="gamemode-btn${m.id===this.selectedMode?' active':''}" data-mode="${m.id}">${this._esc(m.name)}</button>`).join('')}</div>
      <div class="gamemode-preview"><div class="info-desc">${cur.deckDesc}</div><div class="info-desc">→ 全カードの基礎点を×${this.MULT}した状態でプレイ</div></div>
      <div class="shop-section-title" style="margin-top:14px;">ミニゲーム</div>
      <div class="ura-free-games">${this.GAMES.map(g=>`<button type="button" class="ura-free-game" data-game="${g.id}"><span>${g.name}</span></button>`).join('')}</div>
      ${this.lastResult?`<div class="ura-free-result">${this.lastResult}</div>`:''}
      <button type="button" id="btn-ura-back" style="margin-top:16px;">タイトルへ</button>`;
    container.appendChild(el);
    el.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{ this.selectedMode=b.dataset.mode; this.lastResult=''; this.show(); }));
    el.querySelectorAll('[data-game]').forEach(b=>b.addEventListener('click',()=>this.play(b.dataset.game)));
    el.querySelector('#btn-ura-back').addEventListener('click',()=>{ this.lastResult=''; App.showTitle(); });
  },
  // GameState のデータ部分（関数以外）を丸ごと退避
  _snapshot(){
    const snap={};
    Object.keys(GameState).forEach(k=>{
      const v=GameState[k]; if(typeof v==='function') return;
      try{ snap[k]=(v&&typeof v==='object')?JSON.parse(JSON.stringify(v)):v; }catch(e){ snap[k]=v; }
    });
    return { state:snap, keys:Object.keys(GameState).filter(k=>typeof GameState[k]!=='function') };
  },
  _restore(s){
    Object.keys(GameState).forEach(k=>{ if(typeof GameState[k]!=='function'&&!s.keys.includes(k)) delete GameState[k]; });
    Object.assign(GameState, s.state);
  },
  play(gameId){
    if(this.busy) return;
    const g=this.GAMES.find(x=>x.id===gameId); const mod=g&&g.mod();
    if(!mod||typeof mod.open!=='function') return;
    this.busy=true;
    const snap=this._snapshot();
    const origSave=App.saveGame;
    App.saveGame=function(){}; // フリープレイ中はセーブしない
    GameState.currentDeck=this.buildDeck(this.selectedMode);
    GameState.relics=GameData.buildRelicsForMode(this.selectedMode);
    GameState.gold=0;
    GameState.symbolPassiveTier={ Circle:0, Triangle:0, Square:0, Cross:0, Hoshi:0, Check:0, Seven:0 };
    GameState.mana={ A:false, B:false, C:0, D:[], E:false };
    GameState.gameMode=this.selectedMode;
    const modeName=GameData.GAME_MODES[this.selectedMode].name;
    Promise.resolve().then(()=>mod.open({ floor:10, freePlay:true }))
      .catch(e=>{ console.error(e); return { win:false, error:true }; })
      .then(res=>{
        this._restore(snap);
        App.saveGame=origSave;
        this.busy=false;
        const r=res||{};
        const verdict=r.error?'エラーにより終了':(r.win?'勝利！':'終了');
        this.lastResult=`<b>${this._esc(g.name)}（${this._esc(modeName)}）：${verdict}</b>${r.summary?`<div>${this._esc(r.summary)}</div>`:''}<small>フリープレイのため報酬は付与されません</small>`;
        this.show();
      });
  },
};
