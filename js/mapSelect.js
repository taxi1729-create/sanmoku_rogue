const _seMap=(n,o)=>{ try{ if(typeof SFX!=='undefined') SFX.play(n,o); }catch(e){} };
const MapSelectScene = {
  container:null, pendingReward:null, activeRelicId:null, // #11 マップ画面でのレリック選択・並び替え
  render(container){
    this.container=container;
    // 一時撤退中（ミニショップを出る前にリロード・ロードした場合）はミニショップへ復帰する
    if(GameState.retreat && typeof ShopScene!=='undefined' && !ShopScene.miniShop){
      ShopScene.miniShop=true; ShopScene.offers=null;
      App.showShop(); return;
    }
    // #6 階層10：初回のみ10Gを受け取り、固定ラインナップの最終ショップへ直行する
    // #7 階層10：自動でショップへ飛ばさず、マップ上で「最終決戦前の商店」へ誘導する（商店で買い物後に最終決戦を選択）
    // 不思議な商人クリア後、特殊ショップを出る前にリロードした場合は特殊ショップへ復帰する
    if(GameState.merchantShopFloor!=null && GameState.merchantShopFloor===GameState.currentFloor && typeof ShopScene!=='undefined'){
      ShopScene.offers=null; App.showShop(); return;
    }
    this._initBossEffect();
    // 魔神イベント：階層侵入時にハイレベルが魔神イベントになるか判定（判定済みなら保存値を使う）
    if(typeof MajinEvent!=='undefined') MajinEvent.ensureDecided(GameState.currentFloor);
    this.ensureFloorEvent(GameState.currentFloor); // v1.10 イベントコモン（第3・8階層）
    this.renderAll();
    TutorialOverlay.show('mapSelect');
  },

  _initBossEffect(){
    const stages=GameData.buildFloorStages(GameState.currentFloor);
    const boss=stages.find(s=>s.key==='boss');
    const bossCount=boss?boss.bossEffectCount:1;
    if(!GameState.pendingBossEffect&&GameData.BOSS_EFFECT_POOL.length>0){
      GameState.bossRerollUsed=false; // #3 新しいボス出現時にリロール権をリセット
      if(bossCount<=1){
        GameState.pendingBossEffect=GameData.bossEffectForFloor(GlobalFunctions.randChoice(GameData.BOSS_EFFECT_POOL),GameState.currentFloor);
      }else{
        // 複数効果（第5階層以降）
        GameState.pendingBossEffect=GlobalFunctions.shuffle(GameData.BOSS_EFFECT_POOL).slice(0,bossCount).map(e=>GameData.bossEffectForFloor(e,GameState.currentFloor));
      }
    }
    // #6 階層10特有ボス効果：5ターンごと（6,11,16…ターン）に次のターンがNPCになる（2つのランダムボス効果とは別枠）
    if(GameState.currentFloor>=10) GameState.floor10SpecialBoss=true;
    else GameState.floor10SpecialBoss=false;
  },

  renderAll(){
    // #4 タップのたびに画面が一番上に戻る不具合を防ぐ：スクロール位置を保持
    const scrollY=window.scrollY;
    this.container.innerHTML='';
    const el=document.createElement('div'); el.className='map-screen';
    // #16 マップでもゲームメイン画面と同様にパッシブ一覧を右上に表示する
    const topRow=document.createElement('div'); topRow.className='scene-top-row';
    topRow.appendChild(GameMainScene.renderPassiveBar(()=>this.renderAll()));
    el.appendChild(topRow);
    const header=document.createElement('div'); header.className='map-header';
    header.innerHTML=`<span class="map-gold">所持${GCoin()}：${GameState.gold}</span><span>第${GameState.currentFloor}階層${(GameState.gameMode&&GameState.gameMode!=='normal'&&GameData.GAME_MODES[GameState.gameMode])?`<small class="map-mode-tag">${GameData.GAME_MODES[GameState.gameMode].name}</small>`:''}</span><span class="lives-badge lives-badge-map" title="残機"><span class="lives-label">残機</span>${GameState.livesIconsHtml()}</span>`;
    // #2(B) デバッグ促進用：タップで20000G付与するボタン
    //const debugGoldBtn=document.createElement('button'); debugGoldBtn.className='debug-gold-btn'; debugGoldBtn.textContent='🐞+20000G';
    //debugGoldBtn.addEventListener('click',()=>{ GameState.gold+=20000; this.renderAll(); });
    //header.appendChild(debugGoldBtn);
    // #2 マップ選択画面でデッキを確認できるようにする
    const deckBtn=document.createElement('button'); deckBtn.className='debug-gold-btn'; deckBtn.textContent=`デッキ確認(${GameState.currentDeck.length})`;
    deckBtn.addEventListener('click',()=>{ _seMap('open',{suppressTap:true}); GameMainScene.showDeckModal('deck'); });
    header.appendChild(deckBtn);
    if(typeof Settings!=='undefined') header.appendChild(Settings.button('map')); // 設定（js/settings.js）
    el.appendChild(header);
    // #11 マップ画面でも所持レリックを確認・並び替えできるようにする
    el.appendChild(this.renderRelicSection());
    const path=document.createElement('div'); path.className='map-path';
    const stages=GameData.buildFloorStages(GameState.currentFloor);
    // #7 階層10：最終決戦の前に「最終決戦前の商店」へ誘導する（商店に入るまで最終決戦はロック）
    const isFinalFloor=GameState.currentFloor>=10;
    if(isFinalFloor){
      const shopCard=document.createElement('div');
      shopCard.className='stage-card final-shop-card'+(GameState.finalShopDone?' visited':' guide');
      shopCard.innerHTML=GameState.finalShopDone
        ? `<div class="stage-tag">SHOP</div><div class="stage-name">最終決戦前の商店</div><div class="stage-goal">買い物を済ませた。最終決戦へ挑め</div><div class="stage-actions"><div class="stage-done-tag">訪問済み</div></div>`
        : `<div class="stage-tag">SHOP</div><div class="stage-name">最終決戦前の商店</div><div class="stage-goal">最終決戦の前に、ここで支度を整えよう（入店時に${GCoinAmt(10)}獲得）</div><div class="stage-actions"><button class="challenge-btn final-shop-btn">商店へ向かう</button></div>`;
      const fb=shopCard.querySelector('.final-shop-btn');
      if(fb) fb.addEventListener('click',()=>{
        _seMap('confirm',{suppressTap:true}); setTimeout(()=>_seMap('coin'),120);
        GameState.finalShopDone=true;
        GameState.gold+=10;
        App.saveGame();
        ShopScene.fixedFinalShop=true;
        App.showShop();
      });
      path.appendChild(shopCard);
    }
    stages.forEach((stage,i)=>{
      const clearedBefore=i===0||GameState.clearedStages.includes(stages[i-1].key);
      const isCleared=GameState.clearedStages.includes(stage.key);
      const locked=!clearedBefore||(isFinalFloor&&!GameState.finalShopDone);
      // 魔神イベント：ハイレベルが魔神イベントに変わった階層は専用のステージカードを表示する
      if(stage.key==='high'&&typeof MajinEvent!=='undefined'&&MajinEvent.isMajinFloor(GameState.currentFloor)){
        path.appendChild(MajinEvent.buildStageCard(stage,locked,isCleared));
        return;
      }
      const card=document.createElement('div');
      // v1.13 裏世界：第3・8階層のコモンは「コモンを攻略／裏世界に入る／スキップ」の3択
      const ev=(stage.key==='common')?this.floorEventFor(GameState.currentFloor):null;
      const evInfo=!!(ev&&Array.isArray(ev.lineup));
      // #4 「クリア済み・再挑戦」表記を廃止
      card.className='stage-card'+(locked?' locked':'')+(evInfo?' event-common-card ura-common-card':'');
      let bossInfoHtml='';
      let bossRerollBtnHtml='';
      if(stage.key==='boss'&&GameState.pendingBossEffect){
        const effects=Array.isArray(GameState.pendingBossEffect)?GameState.pendingBossEffect:[GameState.pendingBossEffect];
        bossInfoHtml=`<div class="boss-preview"><div class="boss-preview-title">ボス効果</div>${effects.map(b=>`<div class="boss-preview-item"><b>${b.name}</b>：${b.desc}</div>`).join('')}</div>`;
        // #3 ホシパッシブ1：ボス効果を一度だけリロール可能
        if(!locked&&GameState.symbolPassiveTier.Hoshi>=1&&!GameState.bossRerollUsed){
          bossRerollBtnHtml=`<button class="boss-reroll-btn">${GIcon('btn_boss_reroll',{cls:'gi-gap'})}ボス効果リロール（残り1回）</button>`;
        }
      }
      // #7 スキップ報酬内容をステージ上に表示
      let skipBonusHtml='';
      let skipBonus=null;
      if(stage.skippable&&!isCleared&&!locked){
        skipBonus=this.getSkipBonus(stage);
        const sr=GameState.calcSkipReward(); // #8
        skipBonusHtml=`<div class="skip-bonus-tag">スキップ報酬：${GCoin()}+${sr.total}${skipBonus?`　＋　${skipBonus.label}`:'（追加報酬なし）'}</div>`;
      }
      const evCommitted=!!(ev&&ev.committed&&!ev.done&&!isCleared);
      if(evCommitted) skipBonusHtml='';
      const evHtml=evInfo?this.eventCardHtml(ev,stage,isCleared):'';
      const uraOpen=!!(evInfo&&!ev.done&&!isCleared);
      const actionsHtml=isCleared
        ? `<div class="stage-actions"><div class="stage-done-tag">クリア済み</div></div>`
        : uraOpen
          ? `<div class="stage-actions ura-actions">${evCommitted?'':`<button class="challenge-btn" ${locked?'disabled':''}>コモンを攻略</button>`}<button class="ura-enter-btn" ${locked?'disabled':''}>${evCommitted?'裏世界に戻る（イベント再開）':'裏世界に入る'}</button>${(stage.skippable&&!evCommitted)?`<button class="skip-btn" ${locked?'disabled':''}>スキップ</button>`:''}</div>`
          : `<div class="stage-actions"><button class="challenge-btn" ${locked?'disabled':''}>挑戦する</button>${(stage.skippable&&!evCommitted)?`<button class="skip-btn" ${locked?'disabled':''}>スキップ</button>`:''}</div>`;
      card.innerHTML=`<div class="stage-tag">${stage.tag}${evInfo?`<span class="ev-tag ura-tag">裏世界</span>`:''}</div><div class="stage-name">${stage.name}</div><div class="stage-goal">目標：${GlobalFunctions.formatScore(stage.targetScore)}点</div>${evHtml}${bossInfoHtml}${bossRerollBtnHtml}${skipBonusHtml}${actionsHtml}`;
      path.appendChild(card);
      const challengeBtn=card.querySelector('.challenge-btn');
      if(challengeBtn) challengeBtn.addEventListener('click',()=>{
        if(locked){ _seMap('error',{suppressTap:true}); return; }
        _seMap('confirm',{suppressTap:true});
        if(stage.key==='boss') setTimeout(()=>_seMap('boss'),90);
        App.showGameMain(stage);
      });
      const uraBtn=card.querySelector('.ura-enter-btn');
      if(uraBtn) uraBtn.addEventListener('click',()=>{
        if(locked||isCleared||!ev||ev.done){ _seMap('error',{suppressTap:true}); return; }
        if(typeof UraSekai!=='undefined') UraSekai.open(stage,ev);
      });
      // #3 ホシパッシブ1：ボス効果リロール
      const bossRerollBtn=card.querySelector('.boss-reroll-btn');
      if(bossRerollBtn) bossRerollBtn.addEventListener('click',()=>{
        const bossCount=Array.isArray(GameState.pendingBossEffect)?GameState.pendingBossEffect.length:1;
        GameState.pendingBossEffect = bossCount<=1
          ? GameData.bossEffectForFloor(GlobalFunctions.randChoice(GameData.BOSS_EFFECT_POOL),GameState.currentFloor)
          : GlobalFunctions.shuffle(GameData.BOSS_EFFECT_POOL).slice(0,bossCount).map(e=>GameData.bossEffectForFloor(e,GameState.currentFloor));
        GameState.bossRerollUsed=true;
        _seMap('reroll',{suppressTap:true}); setTimeout(()=>_seMap('boss',{volume:0.6}),120);
        this.renderAll();
      });
      const skipBtn=card.querySelector('.skip-btn');
      if(skipBtn) skipBtn.addEventListener('click',()=>{
        if(locked||isCleared) return;
        confirmSkip(()=>doSkip());
      });
      const doSkip=()=>{
        if(locked||isCleared||GameState.clearedStages.includes(stage.key)) return;
        // #8 スキップ報酬G＝(基本G4)×num＋レリック効果＋レリック強化効果（num=1、階層6以上で+1）
        const sr=GameState.calcSkipReward();
        const total=sr.total;
        GameState.gold+=total;
        _seMap('skip',{suppressTap:true}); setTimeout(()=>_seMap('coin'),160);
        const bonus=skipBonus||this.getSkipBonus(stage);
        const bonusMsg=this.applySkipBonusEffect(bonus);
        GameState.lastReward={type:'skip',stageName:stage.name,gold:total,breakdown:sr,extra:bonusMsg};
        if(!GameState.clearedStages.includes(stage.key)) GameState.clearedStages.push(stage.key);
        // #8 スキップ時セーブ
        App.saveGame();
        this.pendingReward={stageName:stage.name,breakdown:sr,gold:total,extra:bonusMsg};
        this.renderAll();
      };
    });
    el.appendChild(path);

    // 全クリア→次の階層へ
    if(GameState.clearedStages.includes('boss')){
      const nextFloor=GameState.currentFloor+1;
      const done=document.createElement('div'); done.style.marginTop='18px';
      if(GameState.currentFloor>=10){
        // #2 階層10クリア時はエンディング（ゲームクリア画面＋スタッフロール）へ
        done.innerHTML=`<div style="color:var(--gold);font-weight:900;margin-bottom:10px;">${GIcon('all_clear',{cls:'gi-lg gi-gap'})}全10階層クリア！おめでとうございます！</div><button id="btn-show-ending">エンディングへ</button>`;
      }else if(GameState.currentFloor===5){
        done.innerHTML=`<div style="color:var(--square);font-weight:900;margin-bottom:10px;">第5階層クリア！ゲームクリア！やり込み要素として第6階層以降も挑戦できます。</div><button id="btn-next-floor">第${nextFloor}階層へ</button><button id="btn-back-title" style="margin-left:8px;">タイトルに戻る</button>`;
      }else{
        done.innerHTML=`<div style="color:var(--square);font-weight:900;margin-bottom:10px;">第${GameState.currentFloor}階層クリア！</div><button id="btn-next-floor">第${nextFloor}階層へ</button>`;
      }
      el.appendChild(done);
      setTimeout(()=>{
        const b=el.querySelector('#btn-next-floor');
        if(b) b.addEventListener('click',()=>{
          _seMap('levelUp',{suppressTap:true});
          GameState.currentFloor=nextFloor;
          GameState.clearedStages=[];
          GameState.pendingBossEffect=null;
          GameState.derbyDebtFloor=null; GameState.merchantShopFloor=null; // 裏世界：ダービー前借り・特殊ショップは階層をまたがない
          // 最高クリア記録更新
          if(GameState.currentFloor-1>GameState.maxClearedFloor){ GameState.maxClearedFloor=GameState.currentFloor-1; GameState.maxClearedStage='ボス'; }
          App.saveGame();
          // #7 第10階層もマップへ遷移し、マップ上の「最終決戦前の商店」から買い物をしてから最終決戦を選ぶ
          App.showMapSelect();
        });
        const t=el.querySelector('#btn-back-title');
        if(t) t.addEventListener('click',()=>App.showTitle());
        // #2 階層10クリア時：エンディング（ゲームクリア画面＋スタッフロール）へ
        const eb=el.querySelector('#btn-show-ending');
        if(eb) eb.addEventListener('click',()=>{
          _seMap('fanfare',{suppressTap:true});
          App.saveGame();
          App.showEnding();
        });
      });
    }
    this.container.appendChild(el);
    const pip=GameMainScene.renderPassiveInfoPanel(()=>this.renderAll()); if(pip) this.container.appendChild(pip); // #16
    if(this.pendingReward) this.container.appendChild(this.renderRewardPopup());
    window.scrollTo(0,scrollY);
  },

  // #11 レリック表示・並び替え（他画面と同じくindexで個体を識別。処理順は常に配列の左から右）
  renderRelicSection(){
    const area=document.createElement('div'); area.className='shop-relic-confirm';
    area.innerHTML=`<div class="shop-section-title">所持レリック（${GameState.usedRelicSlots()}/${GameState.effectiveMaxRelics()}）</div>`;
    // 共通のレリック列（1行固定・収まらない分は「+n」、一覧吹き出し→詳細）
    const row=GameMainScene.renderRelicStrip({
      activeIdx:this.activeRelicId, emptyText:'なし', listOpen:!!this.relicListOpen,
      onPick:(i)=>{ this.relicListOpen=false; this.activeRelicId=(this.activeRelicId===i)?null:i; this.renderAll(); },
      onToggleList:()=>{ this.relicListOpen=!this.relicListOpen; if(this.relicListOpen) this.activeRelicId=null; this.renderAll(); },
    });
    area.appendChild(row);
    // #7 ゲームメイン画面と同じ吹き出し表示（マップでは売却なし）
    if(this.activeRelicId!=null){
      const rp=GameMainScene.renderRelicInfoPanel({ idx:this.activeRelicId, setIdx:(i)=>{this.activeRelicId=i;}, redraw:()=>this.renderAll(), onSell:null, openList:()=>{ this.activeRelicId=null; this.relicListOpen=true; this.renderAll(); } });
      if(rp) area.appendChild(rp);
    }
    return area;
  },

  // ===================== v1.10 イベントコモン → v1.13 裏世界（第3・8階層） =====================
  // floorEvents[floor]={lineup:[type×3], eliteEffect, committed, active, done, result, altarPaid, altarInfo}
  floorEventFor(floor){ return (GameState.floorEvents&&GameState.floorEvents[floor])||null; },
  _rollLineup(include){
    const pool=GameData.EVENT_COMMON_TYPES.filter(t=>t!==include);
    const size=GameData.URASEKAI_LINEUP_SIZE||3;
    const picks=GlobalFunctions.shuffle(pool).slice(0, include?size-1:size);
    if(include) picks.splice(Math.floor(Math.random()*(picks.length+1)),0,include);
    return picks;
  },
  // 階層侵入時に一度だけ抽選して保存（リロード・入り直しでも同じラインナップ・同じボス効果）
  ensureFloorEvent(floor){
    if(!GameData.EVENT_COMMON_FLOORS.includes(floor)) return null;
    if(!GameState.floorEvents||typeof GameState.floorEvents!=='object') GameState.floorEvents={};
    let ev=GameState.floorEvents[floor];
    if(ev){
      // 旧セーブ（v1.10〜v1.12：type のみ）→ そのイベントを含むラインナップを作る
      if(!Array.isArray(ev.lineup)){
        ev.lineup=this._rollLineup(GameData.EVENT_COMMON_TYPES.includes(ev.type)?ev.type:null);
        if(ev.committed&&!ev.active&&ev.type) ev.active=ev.type;
        this._ensureEliteEffect(ev,floor);
        try{ App.saveGame(); }catch(e){}
      }
      return ev;
    }
    if(GameState.clearedStages.includes('common')) return null; // 旧セーブ等で既にコモンが終わっている
    ev={lineup:this._rollLineup(null), committed:false, active:null, done:false, result:null};
    this._ensureEliteEffect(ev,floor);
    GameState.floorEvents[floor]=ev;
    try{ App.saveGame(); }catch(e){}
    return ev;
  },
  _ensureEliteEffect(ev,floor){
    if(ev.lineup.includes('eliteboss')&&!ev.eliteEffect&&GameData.BOSS_EFFECT_POOL.length>0){
      ev.eliteEffect=GameData.bossEffectForFloor(GlobalFunctions.randChoice(GameData.BOSS_EFFECT_POOL),floor);
    }
  },
  merchantTarget(floor){
    const c=GameData.buildFloorStages(floor).find(s=>s.key==='common');
    return c?c.targetScore:0;
  },
  eliteTarget(floor){
    const boss=GameData.buildFloorStages(floor).find(s=>s.key==='boss');
    return Math.round((boss?boss.targetScore:0)*1.5);
  },
  eventCardHtml(ev,stage,isCleared){
    let status='';
    if(ev.done) status=`<div class="ev-status">裏世界のイベントを終えた${ev.result==='win'?'（成功）':ev.result==='lose'?'（失敗）':''}</div>`;
    else if(isCleared) status=`<div class="ev-status ura-closed">通常コモンとして攻略済み（裏世界は閉じた）</div>`;
    else if(ev.committed) status=`<div class="ev-status ura-active">裏世界でイベント進行中</div>`;
    const open=!ev.done&&!isCleared;
    return `<div class="ev-box ura-box"><div class="ev-title ura-map-title">裏世界への入口</div>`
      +(open?`<div class="ev-desc">3つのイベントから1つを選べる（出入りしても不変）。終えたらショップへ。</div>`
             +`<div class="ura-lineup-chips">${ev.lineup.map(t=>{ const i=GameData.eventCommonInfo(t,GameState.currentFloor); return `<span class="ura-chip${ev.active===t?' active':''}">${i?i.name:t}</span>`; }).join('')}</div>`:'')
      +status+`</div>`;
  },
  // イベント終了処理（裏世界を消化し、コモンをクリア済みにする）
  _finishEvent(ev,result){
    ev.done=true; ev.result=result; ev.committed=false;
    if(!GameState.clearedStages.includes('common')) GameState.clearedStages.push('common');
  },
  // ミニゲームの結果 {win} または {reward:{gold,special},summary} を報酬に変換
  normalizeMinigameResult(type,res,floor){
    res=res||{};
    let gold=0, special=0;
    if(res.reward&&typeof res.reward==='object'){
      gold=Math.max(0,Math.round(Number(res.reward.gold)||0));
      special=Math.max(0,Math.floor(Number(res.reward.special)||0));
    }else if(res.win){
      const info=GameData.eventCommonInfo(type,floor);
      gold=(info&&info.gold)||10*(floor>=8?2:1); special=1;
    }
    const win=(typeof res.win==='boolean')?res.win:(gold>0||special>0);
    return { win, gold, special, summary:(typeof res.summary==='string'?res.summary:'') };
  },
  minigameModule(type){
    switch(type){
      case 'throw': return typeof ThrowGame!=='undefined'?ThrowGame:null;
      case 'highlow': return typeof HighLowGame!=='undefined'?HighLowGame:null;
      case 'pachinko': return typeof PachinkoGame!=='undefined'?PachinkoGame:null;
      case 'derby': return typeof DerbyGame!=='undefined'?DerbyGame:null;
    }
    return null;
  },
  // 裏世界のイベントを開始する（UraSekai から呼ばれる）。終了したら必ずショップへ
  startEvent(stage,ev,type){
    const floor=GameState.currentFloor;
    type=type||ev.active;
    if(!type||!ev.lineup.includes(type)) return false;
    const info=GameData.eventCommonInfo(type,floor);
    if(['throw','highlow','pachinko','derby'].includes(type)){
      const mod=this.minigameModule(type);
      if(!mod||typeof mod.open!=='function') return false;
      if(this._eventBusy) return true;
      this._eventBusy=true;
      ev.committed=true; ev.active=type;
      if(type==='derby') GameState.derbyDebtFloor=floor; // 元手20Gは前借り：このフロアのハイレベルのG報酬が0になる
      App.saveGame();
      if(typeof UraSekai!=='undefined') UraSekai.close();
      Promise.resolve().then(()=>mod.open({floor})).catch(e=>{ console.error(e); return {win:false,error:true}; }).then(res=>{
        this._eventBusy=false;
        const r=this.normalizeMinigameResult(type,res,floor);
        if(type==='derby'&&r.summary.indexOf('前借り')<0) r.summary=(r.summary?r.summary+' ':'')+'（元手20Gは前借り：このフロアのハイレベルのG報酬が0）';
        this._finishEvent(ev,r.win?'win':'lose');
        GameState.gold+=r.gold;
        if(r.special>0) GameState.specialGiftPending=(Number(GameState.specialGiftPending)||0)+r.special;
        const extra=r.special>0?`特別アップグレード${r.special}パック（ショップで選択）`:'';
        GameState.lastReward=(r.gold>0||r.special>0)?{type:'event',stageName:info.name,gold:r.gold,extra}:null;
        App.saveGame();
        const go=()=>App.showShop();
        if(typeof UraSekai!=='undefined') UraSekai.showReward({name:info.name, win:r.win, gold:r.gold, special:r.special, summary:r.summary, onNext:go});
        else go();
      });
      return true;
    }
    if(type==='eliteboss'){
      ev.committed=true; ev.active=type; App.saveGame();
      if(typeof UraSekai!=='undefined') UraSekai.close();
      _seMap('boss');
      const elite={...stage, name:'強化ボス', tag:'ELITE BOSS', targetScore:this.eliteTarget(floor), skippable:false, bossEffectCount:1, eliteBoss:true, eliteBossEffect:ev.eliteEffect||null};
      App.showGameMain(elite);
      return true;
    }
    if(type==='merchant'){
      ev.committed=true; ev.active=type; App.saveGame();
      if(typeof UraSekai!=='undefined') UraSekai.close();
      _seMap('boss');
      const blk=GameData.BOSS_EFFECT_POOL.find(e=>e.id==='block_cells')||{id:'block_cells',name:'マス妨害×2',desc:'盤面の2つのランダムなマスが使用不可になる'};
      const be=GameData.bossEffectForFloor(blk,floor); // 第8階層は power 2 → マス妨害×4
      const merchant={...stage, name:'不思議な商人', tag:'MERCHANT', targetScore:this.merchantTarget(floor), skippable:false, bossEffectCount:1, merchantStage:true, eliteBossEffect:be};
      App.showGameMain(merchant);
      return true;
    }
    if(type==='altar'){
      if(typeof MajinEvent==='undefined'||typeof MajinEvent.makeInfo!=='function') return false;
      if(!ev.altarPaid){
        if((GameState.lives||0)<GameData.ALTAR_LIFE_COST) return false;
        GameState.lives-=GameData.ALTAR_LIFE_COST; // v1.11 残機1を捧げる
        _seMap('jam');
        ev.altarPaid=true; ev.committed=true; ev.active=type;
        ev.altarInfo=MajinEvent.makeInfo();
        App.saveGame();
      }
      if(typeof UraSekai!=='undefined') UraSekai.close();
      this.renderAll();
      Promise.resolve(MajinEvent.open(floor,{ info:ev.altarInfo, onCleared:()=>{ this._finishEvent(ev,'done'); } })).catch(e=>console.error(e)).then(()=>{
        if(ev.done){ try{ App.saveGame(); }catch(e){} App.showShop(); }
        else if(this.container&&document.body.contains(this.container)) this.renderAll();
      });
      return true;
    }
    return false;
  },

  renderRewardPopup(){
    const r=this.pendingReward;
    const overlay=document.createElement('div'); overlay.className='pack-modal-overlay';
    const box=document.createElement('div'); box.className='gold-reveal-popup';
    box.innerHTML=`<div class="gr-label">${r.stageName}をスキップ</div><div class="gr-total">+${GCoinAmt(r.gold)}</div><div class="gr-breakdown">基本${GCoin()}${r.breakdown.base} × num${r.breakdown.num}${r.breakdown.num>1?'（階層6以上+1）':''} ＋ レリック効果${r.breakdown.relicBonus} ＋ レリック強化効果${r.breakdown.relicEnhanceBonus}${r.extra?`<br>追加報酬：${r.extra}`:''}</div><button id="btn-goto-shop" style="margin-top:16px;">ショップへ</button>`;
    overlay.appendChild(box);
    if(this._seRewardShown!==r){ this._seRewardShown=r; _seMap('reveal'); setTimeout(()=>_seMap('coin'),200); }
    setTimeout(()=>{ box.querySelector('#btn-goto-shop').addEventListener('click',()=>{ _seMap('confirm',{suppressTap:true}); this.pendingReward=null; App.showShop(); }); });
    return overlay;
  },

  // #7 スキップ報酬の追加ボーナスを階層＋ステージごとに1回だけ抽選してキャッシュする
  getSkipBonus(stage){
    if(!this._skipBonusCache) this._skipBonusCache={};
    const key=GameState.currentFloor+'_'+stage.key;
    if(this._skipBonusCache[key]===undefined){
      const type=GameData.pickSkipBonusType();
      let label=null;
      if(type==='relic'){ label='レリック：ランダムレリック1つを獲得'; }
      else if(type==='normal_upgrade'){ label='通常アップグレード：ショップでカードと効果を選択'; }
      else if(type==='special_upgrade'){ label='特別アップグレード：ショップでカードと効果を選択'; }
      else if(type==='normal_explosive_upgrade'){ label=GIcon('pack_explosive',{cls:'gi-gap'})+'爆発通常アップグレード：ショップで最大3つ選択'; }
      else if(type==='dream_card'){ label='ドリームカードパック'; }
      this._skipBonusCache[key]=type?{type,label}:null;
    }
    return this._skipBonusCache[key];
  },

  // #8 スキップ報酬の追加ボーナスを実際に付与する（通常/特別アップグレードは通常通りショップでカード・効果を選択させる）
  applySkipBonusEffect(bonus){
    if(!bonus||!bonus.type) return '';
    if(bonus.type==='relic'){
      const relic=ShopScene.pickRelic();
      if(ShopScene.canAcquireRelic(relic)){
        GameState.relics.push(relic);
        ShopScene.applyRelicGrantEffect(relic);
        GlobalFunctions.recordRelic(relic.id);
        return `レリック「${relic.name}」を獲得`;
      }
      GameState.gold+=5; return 'レリック枠が満杯のため代わりにG+5';
    }
    if(bonus.type==='normal_upgrade'||bonus.type==='special_upgrade'){
      if(GameState.currentDeck.length===0) return '';
      const slotType = bonus.type==='special_upgrade' ? 'special' : 'normal';
      const pickCount = Math.min(GameState.packCardCount(false), GameState.currentDeck.length); // #11
      const cardIndexes = GlobalFunctions.shuffle(GameState.currentDeck.map((_,idx)=>idx)).slice(0, pickCount);
      let effectPool;
      if(slotType==='special'){
        const unused = GameData.SPECIAL_SELECT_POOL.filter(e=>!GameState.usedSpecialEffectIds.includes(e.id));
        // #9 特別アップグレードを全て取得済みの場合、既に取得済みの効果を再度出さず「確定性質変化付与」にする（ショップの仕様と統一）
        if(unused.length===0){
          const forcedEffect = { id:'grant_trait', name:'性質変化付与（確定）', desc:'カードを1枚選択しランダムな性質変化を付与', targetMin:1, targetMax:1 };
          effectPool = [forcedEffect];
        }else{
          effectPool = GlobalFunctions.shuffle(unused).slice(0, Math.min(2, unused.length));
        }
      }else{
        const pool = GameData.normalSelectPool().filter(e=>{ if(e.rarity) return Math.random()<e.rarity; return true; });
        const finalPool = pool.length>0 ? pool : GameData.normalSelectPool().filter(e=>!e.rarity);
        effectPool = GlobalFunctions.shuffle(finalPool).slice(0, Math.min(3, finalPool.length));
      }
      // #8 通常のショップ購入と同じ「効果→カード」選択モーダルをショップ画面側で開かせる
      ShopScene.pickingPack = { slotType, slotRef:null, effectPool, chosenEffect:null, cardIndexes, selectedTargets:new Set(), packType: slotType==='special'?'special_upgrade':'normal_upgrade' };
      return 'ショップでカードと効果を選択してください';
    }
    if(bonus.type==='dream_card'){
      // #9 ドリームパックも通常通りショップでカードを選択できるようにする
      const candidates=[ShopScene.genDreamCard(), ShopScene.genDreamCard()];
      ShopScene.pickingCardPack = { candidates, pickCount:1, isDream:true, packType:'dream_card' };
      return 'ショップでドリームカードを選択してください';
    }
    // #7 爆発通常アップグレードをスキップ報酬に組み込む
    if(bonus.type==='normal_explosive_upgrade'){
      if(GameState.currentDeck.length===0) return '';
      ShopScene.pickingPack = ShopScene.buildExplosiveUpgradePack(null);
      return 'ショップで'+GIcon('pack_explosive',{cls:'gi-gap'})+'爆発通常アップグレードを選択してください（5つから最大3つまで選択可）';
    }
    return '';
  },
};
