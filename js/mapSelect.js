const MapSelectScene = {
  container: null, pendingReward: null,
  render(container){ this.container=container; this._initBossEffect(); this.renderAll(); },

  // #2 マップ表示時にボス効果を確定（まだ未確定の場合）
  _initBossEffect(){
    if(!GameState.pendingBossEffect && GameData.BOSS_EFFECT_POOL.length > 0){
      GameState.pendingBossEffect = GlobalFunctions.randChoice(GameData.BOSS_EFFECT_POOL);
    }
  },

  renderAll(){
    this.container.innerHTML='';
    const el=document.createElement('div'); el.className='map-screen';
    const header=document.createElement('div'); header.className='map-header';
    header.innerHTML=`<span>所持G：${GameState.gold}</span><span>階層 1/5（Chap1は1階層のみ）</span>`;
    el.appendChild(header);
    const path=document.createElement('div'); path.className='map-path';
    GameData.STAGE_TYPES.forEach((stage,i)=>{
      const clearedBefore=i===0||GameState.clearedStages.includes(GameData.STAGE_TYPES[i-1].key);
      const isCleared=GameState.clearedStages.includes(stage.key);
      const locked=!clearedBefore;
      const card=document.createElement('div');
      card.className='stage-card'+(locked?' locked':'')+(isCleared?' cleared':'');

      // #2 ボスには確定した効果のみを表示
      let bossInfoHtml='';
      if(stage.key==='boss' && GameState.pendingBossEffect){
        const b = GameState.pendingBossEffect;
        bossInfoHtml=`<div class="boss-preview"><div class="boss-preview-title">ボス効果</div><div class="boss-preview-item"><b>${b.name}</b>：${b.desc}</div></div>`;
      }
      card.innerHTML=`<div class="stage-tag">${stage.tag}</div><div class="stage-name">${stage.name}</div><div class="stage-goal">目標：${GlobalFunctions.formatScore(stage.targetScore)}点</div>${bossInfoHtml}<div class="stage-actions"><button class="challenge-btn" ${locked?'disabled':''}>${isCleared?'クリア済み・再挑戦':'挑戦する'}</button>${stage.skippable?`<button class="skip-btn" ${locked||isCleared?'disabled':''}>スキップ</button>`:''}</div>`;
      path.appendChild(card);
      card.querySelector('.challenge-btn').addEventListener('click',()=>{ if(locked) return; App.showGameMain(stage); });
      const skipBtn=card.querySelector('.skip-btn');
      if(skipBtn) skipBtn.addEventListener('click',()=>{
        if(locked||isCleared) return;
        const base=GameData.SKIP_REWARD_BASE[stage.key]||1;
        const flat=GameData.REWARD_FLAT_BONUS;
        const total=base+flat;
        GameState.gold+=total;
        const breakdown={base,bonus:0,flat,total};
        GameState.lastReward={type:'skip',stageName:stage.name,gold:total,breakdown};
        if(!GameState.clearedStages.includes(stage.key)) GameState.clearedStages.push(stage.key);
        this.pendingReward={stageName:stage.name,breakdown,gold:total};
        this.renderAll();
      });
    });
    el.appendChild(path);
    if(GameState.clearedStages.includes('boss')){
      const done=document.createElement('div');done.style.marginTop='18px';
      done.innerHTML=`<div style="color:var(--square);font-weight:900;margin-bottom:10px;">ボスを撃破！（5階層周回はChap6以降）</div><button id="btn-back-title">タイトルに戻る</button>`;
      el.appendChild(done);
      setTimeout(()=>{const b=el.querySelector('#btn-back-title');if(b) b.addEventListener('click',()=>App.showTitle());});
    }
    this.container.appendChild(el);
    if(this.pendingReward) this.container.appendChild(this.renderRewardPopup());
  },

  renderRewardPopup(){
    const r=this.pendingReward;
    const overlay=document.createElement('div'); overlay.className='pack-modal-overlay';
    const box=document.createElement('div'); box.className='gold-reveal-popup';
    box.innerHTML=`<div class="gr-label">${r.stageName}をスキップ</div><div class="gr-total">+${r.gold}G</div><div class="gr-breakdown">基礎G+${r.breakdown.base} ＋ 基本G+${r.breakdown.flat}</div><button id="btn-goto-shop" style="margin-top:16px;">ショップへ</button>`;
    overlay.appendChild(box);
    setTimeout(()=>{ box.querySelector('#btn-goto-shop').addEventListener('click',()=>{ this.pendingReward=null; App.showShop(); }); });
    return overlay;
  },
};
