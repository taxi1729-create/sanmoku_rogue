const MapSelectScene = {
  container:null, pendingReward:null,
  render(container){ this.container=container; this._initBossEffect(); this.renderAll(); },

  _initBossEffect(){
    const stages=GameData.buildFloorStages(GameState.currentFloor);
    const boss=stages.find(s=>s.key==='boss');
    const bossCount=boss?boss.bossEffectCount:1;
    if(!GameState.pendingBossEffect&&GameData.BOSS_EFFECT_POOL.length>0){
      if(bossCount<=1){
        GameState.pendingBossEffect=GlobalFunctions.randChoice(GameData.BOSS_EFFECT_POOL);
      }else{
        // 複数効果（第5階層以降）
        GameState.pendingBossEffect=GlobalFunctions.shuffle(GameData.BOSS_EFFECT_POOL).slice(0,bossCount);
      }
    }
  },

  renderAll(){
    this.container.innerHTML='';
    const el=document.createElement('div'); el.className='map-screen';
    const header=document.createElement('div'); header.className='map-header';
    header.innerHTML=`<span>所持G：${GameState.gold}</span><span>第${GameState.currentFloor}階層</span>`;
    el.appendChild(header);
    const path=document.createElement('div'); path.className='map-path';
    const stages=GameData.buildFloorStages(GameState.currentFloor);
    stages.forEach((stage,i)=>{
      const clearedBefore=i===0||GameState.clearedStages.includes(stages[i-1].key);
      const isCleared=GameState.clearedStages.includes(stage.key);
      const locked=!clearedBefore;
      const card=document.createElement('div');
      // #4 「クリア済み・再挑戦」表記を廃止
      card.className='stage-card'+(locked?' locked':'');
      let bossInfoHtml='';
      if(stage.key==='boss'&&GameState.pendingBossEffect){
        const effects=Array.isArray(GameState.pendingBossEffect)?GameState.pendingBossEffect:[GameState.pendingBossEffect];
        bossInfoHtml=`<div class="boss-preview"><div class="boss-preview-title">ボス効果</div>${effects.map(b=>`<div class="boss-preview-item"><b>${b.name}</b>：${b.desc}</div>`).join('')}</div>`;
      }
      // #7 スキップ報酬内容をステージ上に表示
      let skipBonusHtml='';
      let skipBonus=null;
      if(stage.skippable&&!isCleared&&!locked){
        skipBonus=this.getSkipBonus(stage);
        const base=GameData.SKIP_REWARD_BASE[stage.key]||1; const flat=GameData.REWARD_FLAT_BONUS;
        skipBonusHtml=`<div class="skip-bonus-tag">スキップ報酬：G+${base+flat}${skipBonus?`　＋　${skipBonus.label}`:'（追加報酬なし）'}</div>`;
      }
      const actionsHtml=isCleared
        ? `<div class="stage-actions"><div class="stage-done-tag">クリア済み</div></div>`
        : `<div class="stage-actions"><button class="challenge-btn" ${locked?'disabled':''}>挑戦する</button>${stage.skippable?`<button class="skip-btn" ${locked?'disabled':''}>スキップ</button>`:''}</div>`;
      card.innerHTML=`<div class="stage-tag">${stage.tag}</div><div class="stage-name">${stage.name}</div><div class="stage-goal">目標：${GlobalFunctions.formatScore(stage.targetScore)}点</div>${bossInfoHtml}${skipBonusHtml}${actionsHtml}`;
      path.appendChild(card);
      const challengeBtn=card.querySelector('.challenge-btn');
      if(challengeBtn) challengeBtn.addEventListener('click',()=>{ if(locked) return; App.showGameMain(stage); });
      const skipBtn=card.querySelector('.skip-btn');
      if(skipBtn) skipBtn.addEventListener('click',()=>{
        if(locked||isCleared) return;
        const base=GameData.SKIP_REWARD_BASE[stage.key]||1;
        const flat=GameData.REWARD_FLAT_BONUS; const total=base+flat;
        GameState.gold+=total;
        const bonus=skipBonus||this.getSkipBonus(stage);
        const bonusMsg=this.applySkipBonusEffect(bonus);
        GameState.lastReward={type:'skip',stageName:stage.name,gold:total,breakdown:{base,bonus:0,flat,total},extra:bonusMsg};
        if(!GameState.clearedStages.includes(stage.key)) GameState.clearedStages.push(stage.key);
        // #8 スキップ時セーブ
        App.saveGame();
        this.pendingReward={stageName:stage.name,breakdown:{base,bonus:0,flat,total},gold:total,extra:bonusMsg};
        this.renderAll();
      });
    });
    el.appendChild(path);

    // 全クリア→次の階層へ
    if(GameState.clearedStages.includes('boss')){
      const nextFloor=GameState.currentFloor+1;
      const done=document.createElement('div'); done.style.marginTop='18px';
      if(GameState.currentFloor>=10){
        done.innerHTML=`<div style="color:var(--gold);font-weight:900;margin-bottom:10px;">🎉 全10階層クリア！おめでとうございます！</div><button id="btn-back-title">タイトルに戻る</button>`;
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
          App.showMapSelect();
        });
        const t=el.querySelector('#btn-back-title');
        if(t) t.addEventListener('click',()=>App.showTitle());
      });
    }
    this.container.appendChild(el);
    if(this.pendingReward) this.container.appendChild(this.renderRewardPopup());
  },

  renderRewardPopup(){
    const r=this.pendingReward;
    const overlay=document.createElement('div'); overlay.className='pack-modal-overlay';
    const box=document.createElement('div'); box.className='gold-reveal-popup';
    box.innerHTML=`<div class="gr-label">${r.stageName}をスキップ</div><div class="gr-total">+${r.gold}G</div><div class="gr-breakdown">基礎G+${r.breakdown.base} ＋ 基本G+${r.breakdown.flat}${r.extra?`<br>追加報酬：${r.extra}`:''}</div><button id="btn-goto-shop" style="margin-top:16px;">ショップへ</button>`;
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
      let label=null, extra=null;
      if(type==='relic'){ extra=ShopScene.pickRelic(); label='レリック🔴：'+extra.name; }
      else if(type==='normal_upgrade'){ extra=GlobalFunctions.randChoice(GameData.NORMAL_SELECT_POOL.filter(e=>!e.rarity)); label='通常アップグレード：'+extra.name; }
      else if(type==='special_upgrade'){ extra=GlobalFunctions.randChoice(GameData.SPECIAL_SELECT_POOL); label='特別アップグレード：'+extra.name; }
      else if(type==='dream_card'){ label='ドリームカードパック'; }
      this._skipBonusCache[key]=type?{type,label,extra}:null;
    }
    return this._skipBonusCache[key];
  },

  // スキップ報酬の追加ボーナスを実際に付与する
  applySkipBonusEffect(bonus){
    if(!bonus||!bonus.type) return '';
    if(bonus.type==='relic'){
      const relic=bonus.extra;
      if(GameState.relics.length<GameState.effectiveMaxRelics()){
        GameState.relics.push(relic);
        ShopScene.applyRelicGrantEffect(relic);
        GlobalFunctions.recordRelic(relic.id);
        return `レリック「${relic.name}」を獲得`;
      }
      GameState.gold+=5; return 'レリック枠が満杯のため代わりにG+5';
    }
    if(bonus.type==='normal_upgrade'||bonus.type==='special_upgrade'){
      const eff=bonus.extra; if(!eff||GameState.currentDeck.length===0) return '';
      let targets=[];
      if(eff.targetMax>0){
        const n=Math.min(eff.targetMax,GameState.currentDeck.length);
        targets=GlobalFunctions.shuffle(GameState.currentDeck.map((_,idx)=>idx)).slice(0,n);
      }
      ShopScene.applyEffect(eff.id,targets);
      targets.forEach(idx=>{ const c=GameState.currentDeck[idx]; if(c) GlobalFunctions.recordCard(c); });
      return `${eff.name}を適用`;
    }
    if(bonus.type==='dream_card'){
      const card=GameData.generateShopCard();
      card.baseScore=GlobalFunctions.randInt(120,150); card.number=card.baseScore;
      card.enhance=GlobalFunctions.randChoice(GameData.ENHANCE_NAME_POOL);
      card.jamming=GlobalFunctions.randChoice(Object.keys(GameData.JAMMING_DESC));
      card.trait=GlobalFunctions.randChoice(GameData.TRAIT_NAME_POOL);
      GameData.applyGrantSideEffects(card);
      GameState.currentDeck.push(card);
      GlobalFunctions.recordCard(card);
      return 'ドリームカードを獲得';
    }
    return '';
  },
};
