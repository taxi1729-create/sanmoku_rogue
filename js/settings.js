// 設定画面（タイトル・マップ選択・ゲームメイン・ショップの歯車ボタンから開く）
// ─────────────────────────────────────────────────────────────
//   Settings.button(ctx)  歯車ボタン要素を返す（ctx: 'title' | 'map' | 'game' | 'shop'）
//   Settings.open(ctx)    設定モーダルを開く / Settings.close()
// 項目：
//   ・サウンド音量（スライダー 0–100：SFX.setVolume）＋ サウンドON/OFF（SFX.setMuted）
//   ・チュートリアルスキップ（TutorialOverlay.setSkip）
//   ・早送り（GameMainScene.setFastForward。localStorage 'sanmoku_fastForward'。盤面の早送りボタンと共通）
//   ・カード詳細表示（GameMainScene.setCardDetailHidden の逆。localStorage 'sanmoku_hideCardDetail'。盤面の「詳細非表示」と共通）
//   ・セーブしてタイトルに戻る（タイトル以外。確認ダイアログを出す）
//     - ゲーム中：盤面・手札など戦闘の進行は保存されない（既存のロード仕様どおり、続きからはマップ選択＝挑戦前から再開）。
//       演出中・NPCの手番中・結果表示中は押せない。ボス効果などステージ中だけの変更は元に戻してから保存する
//     - ショップ：パック開封・選択中は押せない。通常ショップは閉じてマップ選択から再開（ミニショップは一時撤退情報から復帰）
const Settings = (function(){
  let ov=null, ctx='title', poll=null, lastTick=0;
  const sfx=(n,o)=>{ try{ if(typeof SFX!=='undefined') SFX.play(n,o); }catch(e){} };
  const hasSFX=()=>typeof SFX!=='undefined';
  const G=()=>typeof GameMainScene!=='undefined'?GameMainScene:null;

  function ffOn(){ const g=G(); if(g) return !!g.scoreFastForward; try{ return localStorage.getItem('sanmoku_fastForward')==='1'; }catch(e){ return false; } }
  function setFF(on){ const g=G(); if(g&&g.setFastForward) g.setFastForward(on); else try{ localStorage.setItem('sanmoku_fastForward',on?'1':'0'); }catch(e){} }
  function detailOn(){ const g=G(); if(g&&g.isCardDetailHidden) return !g.isCardDetailHidden(); try{ return localStorage.getItem('sanmoku_hideCardDetail')!=='1'; }catch(e){ return true; } }
  function setDetail(on){
    const g=G();
    // ゲーム画面の再描画は設定を閉じた後で十分だが、盤面ボタンの見た目を揃えるためゲーム中のみ即時再描画
    if(g&&g.setCardDetailHidden) g.setCardDetailHidden(!on, ctx!=='game');
    else try{ localStorage.setItem('sanmoku_hideCardDetail',on?'0':'1'); }catch(e){}
  }
  function skipOn(){ return typeof TutorialOverlay!=='undefined'&&TutorialOverlay.isSkipOn&&TutorialOverlay.isSkipOn(); }

  function button(c){
    const b=document.createElement('button'); b.type='button'; b.className='settings-btn settings-btn-'+c;
    b.setAttribute('aria-label','設定'); b.title='設定';
    b.innerHTML=`${typeof GIcon!=='undefined'?GIcon('btn_settings',{cls:'settings-ico'}):'⚙'}<span class="settings-btn-label">設定</span>`;
    b.addEventListener('click',e=>{ e.stopPropagation(); open(c); });
    return b;
  }

  // セーブしてタイトルに戻れない理由（null なら可）
  function blockReason(){
    if(ctx==='game'){
      const g=G(); if(!g) return null;
      if(g.resultState) return 'ステージ結果の表示中は使えません';
      let locked=false; try{ locked=g.isPlayerInputLocked(); }catch(e){}
      if(locked) return '演出中・NPCの手番中は使えません';
      if(g.passiveModalOpen||g.pendingPassiveChoice) return 'パッシブ選択中は使えません';
    }
    if(ctx==='shop'&&typeof ShopScene!=='undefined'){
      const s=ShopScene;
      const busy=s.pickingPack||s.pickingCardPack||s.pickingRelicPack||s._fxPack||(s.packQueue&&s.packQueue.length)||s.pendingRelicPacks||(typeof PackFX!=='undefined'&&PackFX.isPlaying&&PackFX.isPlaying());
      if(busy) return 'パックの開封・選択中は使えません';
    }
    return null;
  }

  function row(label, ctrlHtml, sub){
    return `<div class="st-row"><div class="st-label">${label}${sub?`<small>${sub}</small>`:''}</div><div class="st-ctrl">${ctrlHtml}</div></div>`;
  }
  const sw=(id,on)=>`<button type="button" class="st-switch${on?' on':''}" id="${id}" role="switch" aria-checked="${on?'true':'false'}"><span class="st-knob"></span><b>${on?'ON':'OFF'}</b></button>`;
  function paintSwitch(btn,on){ btn.classList.toggle('on',!!on); btn.setAttribute('aria-checked',on?'true':'false'); btn.querySelector('b').textContent=on?'ON':'OFF'; }

  function open(c){
    close(true);
    ctx=c||'title';
    const vol=hasSFX()?Math.round(SFX.getVolume()*100):70;
    const muted=hasSFX()?SFX.isMuted():false;
    ov=document.createElement('div'); ov.className='settings-overlay';
    ov.innerHTML=`<div class="settings-modal" role="dialog" aria-modal="true" aria-labelledby="st-title">
      <h3 id="st-title">${typeof GIcon!=='undefined'?GIcon('btn_settings',{cls:'settings-ico'}):''}設定</h3>
      <div class="st-group">
        ${row('サウンド',sw('st-sound',!muted))}
        <div class="st-row st-volume${muted?' muted':''}"><div class="st-label">音量</div>
          <div class="st-ctrl st-slider-wrap"><input type="range" id="st-volume" min="0" max="100" step="1" value="${vol}" aria-label="サウンド音量"><span class="st-vol-num" id="st-vol-num">${vol}</span></div></div>
      </div>
      <div class="st-group">
        ${row('チュートリアルスキップ',sw('st-skip',skipOn()),'ONで各画面の説明を表示しない')}
        ${row('早送り',sw('st-ff',ffOn()),'ゲーム中の演出を高速化')}
        ${row('カード詳細表示',sw('st-detail',detailOn()),'カードをタップした時の詳細吹き出し')}
      </div>
      ${ctx!=='title'?`<div class="st-group st-save-group"><button type="button" class="st-save-title" id="st-save-title">セーブしてタイトルに戻る</button><div class="st-save-note" id="st-save-note"></div></div>`:''}
      <button type="button" class="st-close" id="st-close">閉じる</button>
    </div>`;
    const q=s=>ov.querySelector(s);
    // サウンド ON/OFF
    q('#st-sound').addEventListener('click',()=>{
      if(!hasSFX()) return;
      const nowMuted=!SFX.isMuted(); SFX.setMuted(nowMuted);
      paintSwitch(q('#st-sound'),!nowMuted); q('.st-volume').classList.toggle('muted',nowMuted);
      if(!nowMuted) sfx('select');
    });
    // 音量スライダー（変更中は間引いて試聴音を鳴らす）
    const slider=q('#st-volume'), num=q('#st-vol-num');
    const paintFill=()=>slider.style.setProperty('--fill',slider.value+'%');
    paintFill();
    const onVol=(final)=>{
      const v=Math.max(0,Math.min(100,Number(slider.value)||0)); num.textContent=v; paintFill();
      if(!hasSFX()) return;
      SFX.setVolume(v/100);
      const now=Date.now();
      if(final||now-lastTick>120){ lastTick=now; sfx('tap',{minGap:0}); }
    };
    slider.addEventListener('input',()=>onVol(false));
    slider.addEventListener('change',()=>onVol(true));
    // トグル類
    q('#st-skip').addEventListener('click',()=>{ if(typeof TutorialOverlay==='undefined') return; const on=!skipOn(); TutorialOverlay.setSkip(on); paintSwitch(q('#st-skip'),on); sfx(on?'select':'deselect'); });
    q('#st-ff').addEventListener('click',()=>{ const on=!ffOn(); setFF(on); paintSwitch(q('#st-ff'),on); sfx(on?'select':'deselect'); });
    q('#st-detail').addEventListener('click',()=>{ const on=!detailOn(); setDetail(on); paintSwitch(q('#st-detail'),on); sfx(on?'select':'deselect'); });
    // セーブしてタイトルへ
    const saveBtn=q('#st-save-title');
    if(saveBtn){
      const refresh=()=>{ const r=blockReason(); saveBtn.disabled=!!r; q('#st-save-note').textContent=r||''; };
      refresh(); poll=setInterval(()=>{ if(!ov||!ov.isConnected){ stopPoll(); return; } refresh(); },300);
      saveBtn.addEventListener('click',()=>{ if(blockReason()){ sfx('error'); refresh(); return; } confirmSaveAndReturn(); });
    }
    q('#st-close').addEventListener('click',()=>{ sfx('close'); close(); });
    ov.addEventListener('click',e=>{ e.stopPropagation(); if(e.target===ov){ sfx('close'); close(); } });
    document.body.appendChild(ov);
    sfx('open');
  }

  function stopPoll(){ if(poll){ clearInterval(poll); poll=null; } }
  function close(silent){ stopPoll(); if(ov){ ov.remove(); ov=null; } }

  function confirmMessage(){
    let m='セーブしてタイトルに戻りますか？';
    if(ctx==='game') m+='\n※戦闘中の盤面・手札・点数は保存されず、マップ選択から再開します。';
    else if(ctx==='shop'){
      const mini=typeof ShopScene!=='undefined'&&ShopScene.miniShop;
      m+=mini?'\nミニショップから再開します（品揃えは変わる場合あり）。'
             :'\n※ショップは閉じ、マップ選択から再開します。';
    }
    return m;
  }
  function confirmSaveAndReturn(){
    const fn=window.confirmDialog;
    const go=()=>{ if(blockReason()){ sfx('error'); return; } saveAndReturn(); };
    if(typeof fn!=='function'){ if(window.confirm(confirmMessage())) go(); return; }
    const d=fn({ message:confirmMessage(), yes:'セーブして戻る', no:'やめる', onYes:go });
    const msg=d&&d.querySelector('.confirm-dialog-msg'); if(msg) msg.classList.add('st-confirm-msg');
  }

  function saveAndReturn(){
    try{
      if(ctx==='game'){ const g=G(); if(g&&g.abandonStageForTitle) g.abandonStageForTitle(); }
      if(ctx==='shop'&&typeof ShopScene!=='undefined'){
        const s=ShopScene;
        try{ if(s.cardRevealPopup&&s.cardRevealPopup._cleanup) s.cardRevealPopup._cleanup(); }catch(e){}
        // 通常ショップは閉じる（続きからはマップ選択）。ミニショップは GameState.retreat を残す＝続きからマップ経由でミニショップに復帰
        Object.assign(s,{ offers:null, fixedFinalShop:false, pickingPack:null, pickingCardPack:null, pickingRelicPack:null, cardRevealPopup:null, message:null,
          activeRelicId:null, relicListOpen:false, packActiveRelicId:null, packRelicListOpen:false, _fxPack:null, packQueue:[], pendingRelicPacks:0,
          packBreakdownOpen:false, packBreakdownSelected:null, miniShop:false, _miniSaveSig:null });
        GameState.lastReward=null;
      }
      if(typeof App!=='undefined') App.saveGame();
    }catch(e){ console.error(e); }
    close();
    // 画面に残る演出・吹き出し・モーダルを片付ける
    try{ if(typeof StageFX!=='undefined') StageFX.clearAll(); }catch(e){}
    try{ if(typeof ScoreFX!=='undefined'&&ScoreFX.instances) Array.from(ScoreFX.instances).forEach(o=>{ try{ ScoreFX.release(o); }catch(_){} }); }catch(e){}
    try{ if(typeof TutorialOverlay!=='undefined'&&TutorialOverlay.isOpen&&TutorialOverlay.isOpen()) TutorialOverlay.close(); }catch(e){}
    document.querySelectorAll('.pack-modal-overlay,.card-hover-tip,.hand-card-bubble,#deck-modal-overlay').forEach(el=>el.remove());
    if(typeof App!=='undefined'){
      // 最高到達記録をタイトルに反映
      try{ let mf=0,ms=''; GlobalFunctions.getSaves().forEach(s=>{ if(s&&s.maxClearedFloor>mf){ mf=s.maxClearedFloor; ms=s.maxClearedStage||''; } }); if(mf>=GameState.maxClearedFloor){ GameState.maxClearedFloor=mf; GameState.maxClearedStage=ms; } }catch(e){}
      App.showTitle();
      try{ window.scrollTo(0,0); }catch(e){}
    }
  }

  return { button, open, close, isOpen:()=>!!ov };
})();
