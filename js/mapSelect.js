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
    header.innerHTML=`<span>所持G：${GameState.gold}</span><span>第${GameState.currentFloor}階層</span><span class="lives-badge lives-badge-map" title="残機"><span class="lives-label">残機</span>${GameState.livesIconsHtml()}</span>`;
    // #2(B) デバッグ促進用：タップで20000G付与するボタン
    //const debugGoldBtn=document.createElement('button'); debugGoldBtn.className='debug-gold-btn'; debugGoldBtn.textContent='🐞+20000G';
    //debugGoldBtn.addEventListener('click',()=>{ GameState.gold+=20000; this.renderAll(); });
    //header.appendChild(debugGoldBtn);
    // #2 マップ選択画面でデッキを確認できるようにする
    const deckBtn=document.createElement('button'); deckBtn.className='debug-gold-btn'; deckBtn.textContent=`デッキ確認(${GameState.currentDeck.length})`;
    deckBtn.addEventListener('click',()=>GameMainScene.showDeckModal('deck'));
    header.appendChild(deckBtn);
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
        : `<div class="stage-tag">SHOP</div><div class="stage-name">最終決戦前の商店</div><div class="stage-goal">最終決戦の前に、ここで支度を整えよう（入店時に10G獲得）</div><div class="stage-actions"><button class="challenge-btn final-shop-btn">商店へ向かう</button></div>`;
      const fb=shopCard.querySelector('.final-shop-btn');
      if(fb) fb.addEventListener('click',()=>{
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
      // v1.10 イベントコモン：コモンのカードにイベント内容を表示し、挑戦時に「イベント／通常コモン」を選ばせる
      const ev=(stage.key==='common')?this.floorEventFor(GameState.currentFloor):null;
      const evInfo=ev?GameData.eventCommonInfo(ev.type,GameState.currentFloor):null;
      // #4 「クリア済み・再挑戦」表記を廃止
      card.className='stage-card'+(locked?' locked':'')+(evInfo?' event-common-card ev-'+ev.type:'');
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
        skipBonusHtml=`<div class="skip-bonus-tag">スキップ報酬：G+${sr.total}${skipBonus?`　＋　${skipBonus.label}`:'（追加報酬なし）'}</div>`;
      }
      const evCommitted=!!(ev&&ev.committed&&!ev.done&&!isCleared);
      if(evCommitted) skipBonusHtml='';
      const evHtml=evInfo?this.eventCardHtml(ev,evInfo,stage,isCleared):'';
      const actionsHtml=isCleared
        ? `<div class="stage-actions"><div class="stage-done-tag">クリア済み</div></div>`
        : `<div class="stage-actions"><button class="challenge-btn" ${locked?'disabled':''}>${evCommitted?'イベントを再開する':'挑戦する'}</button>${(stage.skippable&&!evCommitted)?`<button class="skip-btn" ${locked?'disabled':''}>スキップ</button>`:''}</div>`;
      card.innerHTML=`<div class="stage-tag">${stage.tag}${evInfo?`<span class="ev-tag">EVENT</span>`:''}</div><div class="stage-name">${stage.name}</div><div class="stage-goal">目標：${GlobalFunctions.formatScore(stage.targetScore)}点</div>${evHtml}${bossInfoHtml}${bossRerollBtnHtml}${skipBonusHtml}${actionsHtml}`;
      path.appendChild(card);
      const challengeBtn=card.querySelector('.challenge-btn');
      if(challengeBtn) challengeBtn.addEventListener('click',()=>{
        if(locked) return;
        if(ev&&!ev.done&&!isCleared){
          if(evCommitted) this.startEvent(stage,ev); else this.openEventChoice(stage,ev);
          return;
        }
        App.showGameMain(stage);
      });
      // #3 ホシパッシブ1：ボス効果リロール
      const bossRerollBtn=card.querySelector('.boss-reroll-btn');
      if(bossRerollBtn) bossRerollBtn.addEventListener('click',()=>{
        const bossCount=Array.isArray(GameState.pendingBossEffect)?GameState.pendingBossEffect.length:1;
        GameState.pendingBossEffect = bossCount<=1
          ? GameData.bossEffectForFloor(GlobalFunctions.randChoice(GameData.BOSS_EFFECT_POOL),GameState.currentFloor)
          : GlobalFunctions.shuffle(GameData.BOSS_EFFECT_POOL).slice(0,bossCount).map(e=>GameData.bossEffectForFloor(e,GameState.currentFloor));
        GameState.bossRerollUsed=true;
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
          GameState.currentFloor=nextFloor;
          GameState.clearedStages=[];
          GameState.pendingBossEffect=null;
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
          App.saveGame();
          App.showEnding();
        });
      });
    }
    this.container.appendChild(el);
    const pip=GameMainScene.renderPassiveInfoPanel(()=>this.renderAll()); if(pip) this.container.appendChild(pip); // #16
    if(this.pendingReward) this.container.appendChild(this.renderRewardPopup());
    if(this.pendingEventResult) this.container.appendChild(this.renderEventResultPopup());
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

  // ===================== v1.10 イベントコモン（第3・8階層） =====================
  floorEventFor(floor){ return (GameState.floorEvents&&GameState.floorEvents[floor])||null; },
  // 階層侵入時に一度だけ抽選して保存（リロードしても同じイベント・同じボス効果）
  ensureFloorEvent(floor){
    if(!GameData.EVENT_COMMON_FLOORS.includes(floor)) return null;
    if(!GameState.floorEvents||typeof GameState.floorEvents!=='object') GameState.floorEvents={};
    if(GameState.floorEvents[floor]) return GameState.floorEvents[floor];
    if(GameState.clearedStages.includes('common')) return null; // 旧セーブ等で既にコモンが終わっている
    const type=GlobalFunctions.randChoice(GameData.EVENT_COMMON_TYPES);
    const ev={type, committed:false, done:false, result:null};
    if(type==='eliteboss'&&GameData.BOSS_EFFECT_POOL.length>0){
      ev.eliteEffect=GameData.bossEffectForFloor(GlobalFunctions.randChoice(GameData.BOSS_EFFECT_POOL),floor);
    }
    GameState.floorEvents[floor]=ev;
    try{ App.saveGame(); }catch(e){}
    return ev;
  },
  eliteTarget(floor){
    const boss=GameData.buildFloorStages(floor).find(s=>s.key==='boss');
    return Math.round((boss?boss.targetScore:0)*1.5);
  },
  eventCardHtml(ev,info,stage,isCleared){
    const floor=GameState.currentFloor;
    let extra='';
    if(ev.type==='eliteboss'){
      const b=ev.eliteEffect;
      extra=`<div class="ev-line">目標：<b>${GlobalFunctions.formatScore(this.eliteTarget(floor))}点</b>（ボスの1.5倍）</div>`+(b?`<div class="ev-line">ボス効果：<b>${b.name}</b>：${b.desc}</div>`:'');
    }
    let status='';
    if(ev.done) status=`<div class="ev-status">${ev.result==='win'?'イベント成功':ev.result==='lose'?'イベント失敗':'イベント終了'}</div>`;
    else if(isCleared) status=`<div class="ev-status">通常コモンとして攻略済み</div>`;
    else if(ev.committed) status=`<div class="ev-status">イベント挑戦中</div>`;
    return `<div class="ev-box"><div class="ev-title">${info.name}</div><div class="ev-desc">${info.desc}</div>${extra}<div class="ev-reward">報酬：${info.reward}</div>${status}</div>`;
  },
  closeEventChoice(){ const o=document.getElementById('ev-choice-overlay'); if(o) o.remove(); },
  openEventChoice(stage,ev){
    this.closeEventChoice();
    const info=GameData.eventCommonInfo(ev.type,GameState.currentFloor);
    const ov=document.createElement('div'); ov.id='ev-choice-overlay'; ov.className='pack-modal-overlay ev-choice-overlay';
    const box=document.createElement('div'); box.className='pack-modal ev-choice-box';
    const altarShort=ev.type==='altar'&&!ev.altarPaid&&(GameState.lives||0)<GameData.ALTAR_LIFE_COST; // v1.11 捧げるのは残機1
    const evLabel=ev.type==='altar'?`イベントに挑む（残機${GameData.ALTAR_LIFE_COST}を捧げる）`:'イベントに挑む';
    box.innerHTML=`<div class="ev-choice-head">第${GameState.currentFloor}階層・イベントコモン</div><h3 class="ev-choice-title">${info.name}</h3>`
      +`<div class="ev-choice-desc">${info.desc}</div>`
      +(ev.type==='eliteboss'?`<div class="ev-choice-desc">目標：<b>${GlobalFunctions.formatScore(this.eliteTarget(GameState.currentFloor))}点</b>${ev.eliteEffect?`／ボス効果：<b>${ev.eliteEffect.name}</b>：${ev.eliteEffect.desc}`:''}</div>`:'')
      +`<div class="ev-choice-reward">報酬：${info.reward}</div>`
      +`<div class="ev-choice-btns"><button class="ev-go-btn" ${altarShort?'disabled':''}>${evLabel}</button>${altarShort?`<div class="ev-choice-warn">残機が足りません（残機${GameData.ALTAR_LIFE_COST}必要・残り${GameState.lives||0}）</div>`:''}`
      +`<button class="ev-normal-btn">通常のコモンステージを攻略する<small>目標：${GlobalFunctions.formatScore(stage.targetScore)}点</small></button>`
      +`<button class="ev-cancel-btn">やめる</button></div>`;
    ov.appendChild(box);
    ov.addEventListener('click',(e)=>{ if(e.target===ov) this.closeEventChoice(); });
    box.querySelector('.ev-go-btn').addEventListener('click',()=>{ if(altarShort) return; this.closeEventChoice(); this.startEvent(stage,ev); });
    box.querySelector('.ev-normal-btn').addEventListener('click',()=>{ this.closeEventChoice(); App.showGameMain(stage); });
    box.querySelector('.ev-cancel-btn').addEventListener('click',()=>this.closeEventChoice());
    document.body.appendChild(ov);
  },
  // イベント終了処理（コモンをクリア済みにしてイベントを消化）
  _finishEvent(ev,result){
    ev.done=true; ev.result=result;
    if(!GameState.clearedStages.includes('common')) GameState.clearedStages.push('common');
  },
  startEvent(stage,ev){
    const floor=GameState.currentFloor;
    const info=GameData.eventCommonInfo(ev.type,floor);
    if(ev.type==='throw'||ev.type==='highlow'){
      const mod=ev.type==='throw'?(typeof ThrowGame!=='undefined'?ThrowGame:null):(typeof HighLowGame!=='undefined'?HighLowGame:null);
      if(!mod||typeof mod.open!=='function'){ alert('このイベントは現在準備中です。通常のコモンステージを攻略してください。'); return; }
      if(this._eventBusy) return;
      this._eventBusy=true;
      ev.committed=true; App.saveGame();
      Promise.resolve().then(()=>mod.open({floor})).catch(e=>{ console.error(e); return {win:false,error:true}; }).then(res=>{
        this._eventBusy=false;
        const win=!!(res&&res.win);
        this._finishEvent(ev,win?'win':'lose');
        if(win){
          GameState.gold+=info.gold;
          GameState.specialGiftPending=(GameState.specialGiftPending||0)+1;
          GameState.lastReward={type:'event',stageName:info.name,gold:info.gold,extra:'特別アップグレード1パック（ショップで選択）'};
        }else GameState.lastReward=null;
        App.saveGame();
        this.pendingEventResult={win,name:info.name,gold:win?info.gold:0};
        if(this.container&&document.body.contains(this.container)) this.renderAll();
      });
      return;
    }
    if(ev.type==='eliteboss'){
      ev.committed=true; App.saveGame();
      const elite={...stage, name:'強化ボス', tag:'ELITE BOSS', targetScore:this.eliteTarget(floor), skippable:false, bossEffectCount:1, eliteBoss:true, eliteBossEffect:ev.eliteEffect||null};
      App.showGameMain(elite);
      return;
    }
    if(ev.type==='altar'){
      if(typeof MajinEvent==='undefined'||typeof MajinEvent.makeInfo!=='function') return;
      if(!ev.altarPaid){
        if((GameState.lives||0)<GameData.ALTAR_LIFE_COST) return;
        GameState.lives-=GameData.ALTAR_LIFE_COST; // v1.11 残機1を捧げる
        ev.altarPaid=true; ev.committed=true;
        ev.altarInfo=MajinEvent.makeInfo();
        App.saveGame();
        this.renderAll();
      }
      MajinEvent.open(floor,{ info:ev.altarInfo, onCleared:()=>{ this._finishEvent(ev,'done'); } });
    }
  },
  renderEventResultPopup(){
    const r=this.pendingEventResult;
    const overlay=document.createElement('div'); overlay.className='pack-modal-overlay';
    const box=document.createElement('div'); box.className='gold-reveal-popup ev-result-popup';
    box.innerHTML=r.win
      ? `<div class="gr-label">${r.name}：勝利！</div><div class="gr-total">+${r.gold}G</div><div class="gr-breakdown">追加報酬：特別アップグレード1パック（ショップで最初に選択）</div><button class="ev-result-btn" style="margin-top:16px;">ショップへ</button>`
      : `<div class="gr-label">${r.name}：敗北</div><div class="gr-total ev-lose">報酬なし</div><div class="gr-breakdown">コモンは終了扱いになります</div><button class="ev-result-btn" style="margin-top:16px;">マップに戻る</button>`;
    overlay.appendChild(box);
    setTimeout(()=>{ box.querySelector('.ev-result-btn').addEventListener('click',()=>{ this.pendingEventResult=null; if(r.win) App.showShop(); else this.renderAll(); }); });
    return overlay;
  },

  renderRewardPopup(){
    const r=this.pendingReward;
    const overlay=document.createElement('div'); overlay.className='pack-modal-overlay';
    const box=document.createElement('div'); box.className='gold-reveal-popup';
    box.innerHTML=`<div class="gr-label">${r.stageName}をスキップ</div><div class="gr-total">+${r.gold}G</div><div class="gr-breakdown">基本G${r.breakdown.base} × num${r.breakdown.num}${r.breakdown.num>1?'（階層6以上+1）':''} ＋ レリック効果${r.breakdown.relicBonus} ＋ レリック強化効果${r.breakdown.relicEnhanceBonus}${r.extra?`<br>追加報酬：${r.extra}`:''}</div><button id="btn-goto-shop" style="margin-top:16px;">ショップへ</button>`;
    overlay.appendChild(box);
    setTimeout(()=>{ box.querySelector('#btn-goto-shop').addEventListener('click',()=>{ this.pendingReward=null; App.showShop(); }); });
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
