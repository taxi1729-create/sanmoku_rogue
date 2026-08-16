// ショップ：#26/#27/#28/#29に対応した全面実装
const ShopScene = {
  container: null,
  offers: null,
  pickingPack: null,
  pickingCardPack: null,
  cardRevealPopup: null,
  message: null,
  activeRelicId: null, // #25 ショップ内レリック確認

  sleep(ms){ return new Promise(res => setTimeout(res, ms)); },

  render(container){
    this.container = container;
    if(!this.offers) this.offers = this.generateOffers();
    this.renderAll();
  },

  // #27 重み付き抽選で8枠を生成 + 確定枠3つ
  generateOffers(){
    const fixedRelics = [this.pickRelic(), this.pickRelic()]; // #26 確定ピックアップレリック2つ
    const fixedCardPack = [{ type:'card_pack', mystery:true }]; // #26 確定カードパック1つ
    const fixedUpgrade = [{ type:'pickup_upgrade' }];          // #26 確定ピックアップアップグレード1つ
    const randomSlots = [];
    for(let i = 0; i < 8; i++) randomSlots.push({ type: GameData.pickWeightedType() });
    return { fixedRelics, fixedCardPack, fixedUpgrade, randomSlots, relics: [this.pickRelic(), this.pickRelic(), this.pickRelic(), this.pickRelic(), this.pickRelic(), this.pickRelic()] };
  },

  pickRelic(){
    const base = GlobalFunctions.randChoice(GameData.RELIC_POOL);
    const relicEnhance = Math.random() < 0.15 ? GlobalFunctions.randChoice(GameData.RELIC_ENHANCE_POOL).id : null;
    return { ...base, relicEnhance };
  },

  relicPrice(relic){ return GameState.shopPriceOf(GameData.SHOP_PRICES.relic + (relic.relicEnhance ? 3 : 0)); },

  calcCashGain(card){ return 1 + (card.enhance ? 2 : 0) + (card.jamming ? 1 : 0) + ((card.trait&&card.trait!=='塗りつぶし(レリック)') ? 3 : 0); },

  cardTagsHtml(card){
    let h = '';
    if(card.jamming) h += `<div class="card-dot dot-jamming" title="${card.jamming}"></div>`;
    if(card.enhance) h += `<div class="card-dot dot-enhance" title="${card.enhance}"></div>`;
    if(card.trait) h += `<div class="card-dot dot-trait" title="${card.trait}"></div>`;
    return h ? `<div class="card-dots-row">${h}</div>` : '';
  },
  cardSymbolHtml(card){
    const main = `<span class="sym-${card.symbol}">${GameData.SYMBOL_LABEL[card.symbol]}</span>`;
    const multiSym = GameData.MULTI_SYMBOL_LABEL[card.enhance];
    return multiSym
      ? `<div class="card-symbol-wrap">${main}<span class="card-multi-sub">${multiSym}</span></div>`
      : `<div class="card-symbol-wrap">${main}</div>`;
  },
  cardScoreHtml(card){
    const multiMap = { 'マルマルチ':'Circle', 'サンカクマルチ':'Triangle', 'シカクマルチ':'Square' };
    const ms = multiMap[card.enhance];
    if((ms && card.symbol === ms || card.enhance === 'ブルジョワ') && card.baseScore > card.number)
      return `<span class="card-number">${card.number}<span class="card-score-bonus">+${card.baseScore - card.number}</span></span>`;
    return `<span class="card-number">${card.baseScore}</span>`;
  },

  // ===== Relic purchase =====
  buyRelic(i, isFixed=false){
    const relic = isFixed ? this.offers.fixedRelics[i] : this.offers.relics[i];
    if(!relic) return;
    const price = this.relicPrice(relic);
    if(GameState.gold < price){ this.message = 'Gが足りません'; this.renderAll(); return; }
    if(GameState.relics.length >= GameState.effectiveMaxRelics()){ this.message = `レリックは最大${GameState.effectiveMaxRelics()}個まで`; this.renderAll(); return; }
    GameState.gold -= price;
    GameState.relics.push(relic);
    if(isFixed) this.offers.fixedRelics[i] = null; else this.offers.relics[i] = null;
    this.applyRelicGrantEffect(relic);
    this.message = `レリック「${relic.name}」を購入した`;
    this.renderAll();
  },

  applyRelicGrantEffect(relic){
    switch(relic.id){
      case 'round_boost': GameState.roundsBonus += 1; break;
      case 'reroll_boost': GameState.rerollBonus += 2; GameState.rerollCount += 2; break;
      case 'hand_boost': GameState.handSizeBonus += 3; break;
      case 'paint': GameState.currentDeck.forEach(c=>{ if(!c.trait) c.trait = '塗りつぶし(レリック)'; }); GameState.turnsBonus -= 2; break;
      case 'jamming_boost': GameState.rerollCount = Math.max(0, GameState.rerollCount - 3); break;
      default: break;
    }
    // #22 ブラックカード即時反映
    if(relic.relicEnhance === 'ren_black') this.message = (this.message||'') + '（ショップ金額が半額になった）';
    if(relic.relicEnhance === 'ren_cross') GameData.BINGO_MULTIPLIER_BASE['Cross'] *= 5;
  },

  // ===== Card pack =====
  buyCardPack(slotRef){
    const price = GameState.shopPriceOf(GameData.SHOP_PRICES.cardPack);
    if(GameState.gold < price) return;
    GameState.gold -= price;
    slotRef.used = true;
    const candidates = [GameData.generateShopCard(), GameData.generateShopCard()];
    this.pickingCardPack = { candidates };
    this.renderAll();
  },

  pickCardPackCard(card){
    GameState.currentDeck.push(card);
    this.message = `${GameData.SYMBOL_LABEL[card.symbol]}（基礎点${card.baseScore}）を獲得した`;
    this.pickingCardPack = null; this.renderAll();
  },
  skipCardPack(){ this.message = 'カードパックをスキップした'; this.pickingCardPack = null; this.renderAll(); },

  // ===== Upgrade pack =====
  buyUpgrade(slotType, slotRef){
    const price = GameState.shopPriceOf(slotType === 'special' ? GameData.SHOP_PRICES.specialUpgrade : GameData.SHOP_PRICES.normalUpgrade);
    if(GameState.gold < price || GameState.currentDeck.length === 0) return;

    let pool = GameData.NORMAL_SELECT_POOL;
    if(slotType === 'special'){
      pool = GameData.SPECIAL_SELECT_POOL.filter(e => !GameState.usedSpecialEffectIds.includes(e.id));
      if(pool.length === 0){ this.message = '特別セレクトの効果はすべて入手済みです'; this.renderAll(); return; }
    }
    // #8 通常アップグレード：1%でrarity効果を混入
    if(slotType === 'normal'){
      pool = pool.filter(e => {
        if(e.rarity) return Math.random() < e.rarity;
        return true;
      });
      if(pool.length === 0) pool = GameData.NORMAL_SELECT_POOL.filter(e => !e.rarity);
    }
    GameState.gold -= price;
    slotRef.used = true;

    const pickN = slotType === 'special' ? 2 : 3;
    const effectPool = GlobalFunctions.shuffle(pool).slice(0, Math.min(pickN, pool.length));
    const pickCount = Math.min(8, GameState.currentDeck.length);
    const cardIndexes = GlobalFunctions.shuffle(GameState.currentDeck.map((_,idx)=>idx)).slice(0, pickCount);
    this.pickingPack = { slotType, slotRef, effectPool, chosenEffect:null, cardIndexes, selectedTargets:new Set() };
    this.renderAll();
  },

  // #29 特別セレクト全引き後は確定性質変化付与
  buySpecialPackExhausted(slotRef){
    const price = GameState.shopPriceOf(GameData.SHOP_PRICES.specialUpgrade);
    if(GameState.gold < price || GameState.currentDeck.length === 0) return;
    GameState.gold -= price;
    slotRef.used = true;
    const pickCount = Math.min(8, GameState.currentDeck.length);
    const cardIndexes = GlobalFunctions.shuffle(GameState.currentDeck.map((_,idx)=>idx)).slice(0, pickCount);
    const forcedEffect = { id:'grant_trait', name:'性質変化付与（確定）', desc:'カードを1枚選択しランダムな性質変化を付与', targetMin:1, targetMax:1 };
    this.pickingPack = { slotType:'special', slotRef, effectPool:[forcedEffect], chosenEffect:null, cardIndexes, selectedTargets:new Set() };
    this.renderAll();
  },

  chooseEffect(effect){ if(!this.pickingPack) return; this.pickingPack.chosenEffect = effect; this.pickingPack.selectedTargets = new Set(); this.renderAll(); },

  toggleTarget(cardIdx){
    const p = this.pickingPack; if(!p?.chosenEffect) return;
    const max = p.chosenEffect.targetMax;
    if(p.selectedTargets.has(cardIdx)) p.selectedTargets.delete(cardIdx);
    else if(p.selectedTargets.size < max) p.selectedTargets.add(cardIdx);
    this.renderAll();
  },

  async confirmPack(){
    const p = this.pickingPack; if(!p?.chosenEffect) return;
    if(p.selectedTargets.size < p.chosenEffect.targetMin) return;
    const affected = this.applyEffect(p.chosenEffect.id, Array.from(p.selectedTargets));
    if(p.slotType === 'special') GameState.usedSpecialEffectIds.push(p.chosenEffect.id);
    if(affected?.length > 0){ this.cardRevealPopup = { cards: affected }; this.renderAll(); await this.sleep(2000); this.cardRevealPopup = null; }
    this.pickingPack = null; this.renderAll();
  },
  skipPack(){ this.message = 'スキップした'; this.pickingPack = null; this.renderAll(); },

  applyEffect(effectId, targetIndexes){
    const deck = GameState.currentDeck;
    const bump = (sym, amt) => { GameData.BINGO_MULTIPLIER_BASE[sym] += amt; };
    switch(effectId){
      case 'circle_mult':    bump('Circle', 4);    this.message = '○ビンゴ倍率+4'; return [];
      case 'cross_mult':     bump('Cross', 5);     this.message = '×ビンゴ倍率+5'; return [];
      case 'square_mult':    bump('Square', 4);    this.message = '□ビンゴ倍率+4'; return [];
      case 'triangle_mult':  bump('Triangle', 4);  this.message = '△ビンゴ倍率+4'; return [];
      case 'all_mult_up1':   GameData.SYMBOLS.forEach(s=>bump(s,1)); this.message = '全ビンゴ倍率+1'; return [];
      case 'number_up2':     targetIndexes.forEach(i=>{ if(deck[i]) deck[i].baseScore+=5; }); this.message = '基礎点+5×2枚'; return targetIndexes.map(i=>deck[i]).filter(Boolean);
      case 'number_up3':     targetIndexes.forEach(i=>{ if(deck[i]) deck[i].baseScore+=3; }); this.message = '基礎点+3×3枚'; return targetIndexes.map(i=>deck[i]).filter(Boolean);
      case 'base_up5':       targetIndexes.forEach(i=>{ if(deck[i]) deck[i].baseScore+=10; }); this.message = '基礎点+10'; return targetIndexes.map(i=>deck[i]).filter(Boolean);
      case 'symbol_change':  targetIndexes.forEach(i=>{ const c=deck[i]; if(!c) return; c.symbol=GlobalFunctions.randChoice(['Circle','Triangle','Square'].filter(s=>s!==c.symbol)); }); this.message = '記号変化'; return targetIndexes.map(i=>deck[i]).filter(Boolean);
      case 'cash_in': { const i=targetIndexes[0]; const c=deck[i]; if(!c) return []; const g=this.calcCashGain(c); GameState.currentDeck=deck.filter((_,idx)=>idx!==i); GameState.gold+=g; this.message=`換金G+${g}`; return []; }
      case 'duplicate': { const i=targetIndexes[0]; const src=deck[i]; if(!src) return []; const clone={...src,id:'dup_'+Date.now()+'_'+Math.floor(Math.random()*100000)}; GameState.currentDeck.push(clone); this.message='複製した'; return [clone]; }
      case 'grant_enhance': { const i=targetIndexes[0]; const c=deck[i]; if(!c) return []; c.enhance=GlobalFunctions.randChoice(GameData.ENHANCE_NAME_POOL); GameData.applyGrantSideEffects(c); this.message=`カード強化「${c.enhance}」付与`; return [c]; }
      case 'grant_jamming': { const i=targetIndexes[0]; const c=deck[i]; if(!c) return []; c.jamming=GlobalFunctions.randChoice(Object.keys(GameData.JAMMING_DESC)); this.message=`ジャミング「${c.jamming}」付与`; return [c]; }
      case 'grant_trait': case 'grant_trait_rare': { const i=targetIndexes[0]; const c=deck[i]; if(!c) return []; c.trait=GlobalFunctions.randChoice(GameData.TRAIT_NAME_POOL); GameData.applyGrantSideEffects(c); this.message=`性質変化「${c.trait}」付与`; return [c]; }
      case 'hand_up2':       GameState.handSizeBonus+=2; this.message='手札上限+2'; return [];
      case 'reroll_up2':     GameState.rerollCount+=2; this.message='リロール+2'; return [];
      case 'round_up1':      GameState.roundsBonus+=1; this.message='ラウンド数+1'; return [];
      case 'turn_up4':       GameState.turnsBonus+=4; this.message='ターン数+4'; return [];
      case 'relic_slot_up1': GameState.relicSlotBonus+=1; this.message='レリック上限+1'; return [];
      default: return [];
    }
  },

  // ===== Random slot handler =====
  handleRandomSlot(slot){
    const price = GameState.shopPriceOf(this.slotPrice(slot.type));
    if(GameState.gold < price){ this.message='Gが足りません'; this.renderAll(); return; }
    switch(slot.type){
      case 'pickup_relic': this.buyRelic(this.offers.relics.findIndex(r=>r&&!r._usedInRandom), false); break;
      case 'card_pack': this.buyCardPack(slot); break;
      case 'pickup_upgrade': this.buyUpgrade('normal', slot); break;
      case 'normal_upgrade': this.buyUpgrade('normal', slot); break;
      case 'special_upgrade':
        if(GameData.SPECIAL_SELECT_POOL.filter(e=>!GameState.usedSpecialEffectIds.includes(e.id)).length===0)
          this.buySpecialPackExhausted(slot);
        else this.buyUpgrade('special', slot);
        break;
      case 'card_focus': this.buyFocusPack(slot,'card'); break;
      case 'bingo_focus': this.buyFocusPack(slot,'bingo'); break;
      case 'dream_card': this.buyDreamCard(slot); break;
      default: break;
    }
  },

  slotPrice(type){
    const map = { pickup_relic:GameData.SHOP_PRICES.pickupRelic, card_pack:GameData.SHOP_PRICES.cardPack, pickup_upgrade:GameData.SHOP_PRICES.pickupUpgrade, normal_upgrade:GameData.SHOP_PRICES.normalUpgrade, special_upgrade:GameData.SHOP_PRICES.specialUpgrade, card_focus:GameData.SHOP_PRICES.cardFocus, bingo_focus:GameData.SHOP_PRICES.bingoFocus, dream_card:GameData.SHOP_PRICES.dreamCard };
    return map[type] || 3;
  },

  buyFocusPack(slot, focus){
    GameState.gold -= GameState.shopPriceOf(this.slotPrice(slot.type));
    slot.used = true;
    // カードフォーカス：ランダムカード3枚提示、ビンゴフォーカス：ビンゴ倍率強化3択
    if(focus === 'card'){
      const candidates = [GameData.generateShopCard(), GameData.generateShopCard(), GameData.generateShopCard()];
      this.pickingCardPack = { candidates, multi: true };
    } else {
      const effects = [
        { id:'circle_mult', name:'マルビンゴ+4', targetMin:0, targetMax:0, desc:'○のビンゴ倍率を+4する' },
        { id:'triangle_mult', name:'サンカクビンゴ+4', targetMin:0, targetMax:0, desc:'△のビンゴ倍率を+4する' },
        { id:'square_mult', name:'シカクビンゴ+4', targetMin:0, targetMax:0, desc:'□のビンゴ倍率を+4する' },
        { id:'cross_mult', name:'バツビンゴ+5', targetMin:0, targetMax:0, desc:'×のビンゴ倍率を+5する' },
        { id:'all_mult_up1', name:'全ビンゴ+1', targetMin:0, targetMax:0, desc:'全記号のビンゴ倍率を+1する' },
      ];
      const pickedEffects = GlobalFunctions.shuffle(effects).slice(0, 3);
      const cardIndexes = GlobalFunctions.shuffle(GameState.currentDeck.map((_,idx)=>idx)).slice(0, Math.min(8, GameState.currentDeck.length));
      this.pickingPack = { slotType:'bingo_focus', slotRef:slot, effectPool:pickedEffects, chosenEffect:null, cardIndexes, selectedTargets:new Set() };
    }
    this.renderAll();
  },

  buyDreamCard(slot){
    GameState.gold -= GameState.shopPriceOf(GameData.SHOP_PRICES.dreamCard);
    slot.used = true;
    const card = GameData.generateShopCard();
    // ドリームカード：強制的に全効果付与
    card.enhance = GlobalFunctions.randChoice(GameData.ENHANCE_NAME_POOL);
    card.jamming = GlobalFunctions.randChoice(Object.keys(GameData.JAMMING_DESC));
    card.trait = GlobalFunctions.randChoice(GameData.TRAIT_NAME_POOL);
    GameData.applyGrantSideEffects(card);
    GameState.currentDeck.push(card);
    this.cardRevealPopup = { cards:[card] };
    this.message = 'ドリームカードを獲得した！';
    this.renderAll();
    this.sleep(2000).then(()=>{ this.cardRevealPopup = null; this.renderAll(); });
  },

  rerollOffers(){ const price=GameState.shopPriceOf(GameData.SHOP_PRICES.reroll); if(GameState.gold<price) return; GameState.gold-=price; this.offers=this.generateOffers(); this.message='品揃えを更新した'; this.renderAll(); },

  leaveShop(){ this.offers=null; this.pickingPack=null; this.pickingCardPack=null; this.cardRevealPopup=null; this.message=null; this.activeRelicId=null; GameState.lastReward=null; App.showMapSelect(); },

  // ===== Render =====
  renderAll(){
    this.container.innerHTML = '';
    const el = document.createElement('div'); el.className = 'shop-screen';
    const r = GameState.lastReward;
    let rewardText = '';
    if(r){ const b=r.breakdown; rewardText = b ? `${r.stageName}を${r.type==='skip'?'スキップ':'クリア'}：基本6 ＋ 残りラウンド${b.roundBonus} ＋ 残りリロール${b.rerollBonus} ＋ レリック${b.relicBonus} ＋ カード${b.cardBonus} ＝ G+${r.gold}` : `${r.stageName}：G+${r.gold}`; }
    const header = document.createElement('div'); header.className='shop-header';
    header.innerHTML = `<h2>ショップ</h2>${rewardText?`<div class="shop-reward">${rewardText}</div>`:''}<div class="shop-gold">所持G：${GameState.gold}</div>${this.message?`<div class="shop-message">${this.message}</div>`:''}`;
    el.appendChild(header);

    // #25 ショップ内レリック確認エリア
    if(GameState.relics.length > 0){
      const relicArea = document.createElement('div'); relicArea.className='shop-relic-confirm';
      relicArea.innerHTML = '<div class="shop-section-title">所持レリック</div>';
      const relicRow = document.createElement('div'); relicRow.className='relic-display-row';
      GameState.relics.forEach(relic => {
        const rc = document.createElement('div');
        rc.className='relic-card'+(this.activeRelicId===relic.id?' active':'');
        rc.innerHTML=`<div class="relic-name">${relic.name}</div>${relic.relicEnhance?`<div class="relic-enhance-tag">${GameData.RELIC_ENHANCE_POOL.find(r=>r.id===relic.relicEnhance)?.name||''}</div>`:''}`;
        rc.addEventListener('click', () => { this.activeRelicId=(this.activeRelicId===relic.id)?null:relic.id; this.renderAll(); });
        relicRow.appendChild(rc);
      });
      relicArea.appendChild(relicRow);
      if(this.activeRelicId){
        const relic = GameState.relics.find(r=>r.id===this.activeRelicId);
        if(relic){ const ren=GameData.RELIC_ENHANCE_POOL.find(r=>r.id===relic.relicEnhance); relicArea.innerHTML += `<div class="relic-desc-popup">${relic.desc}${ren?` / 【${ren.name}】${ren.desc}`:''}</div>`; }
      }
      el.appendChild(relicArea);
    }

    // 確定ピックアップレリック
    el.appendChild(this.renderFixedRelicSection());
    // 確定カードパック・確定アップグレード
    el.appendChild(this.renderFixedPackSection());
    // ランダム8枠
    el.appendChild(this.renderRandomSlots());

    // 既存レリック販売枠
    const relicSec = document.createElement('div'); relicSec.className='shop-section';
    relicSec.innerHTML = `<h3>レリック（基本${GameState.shopPriceOf(GameData.SHOP_PRICES.relic)}G・強化付+3G）</h3>`;
    const relicRow2 = document.createElement('div'); relicRow2.className='shop-row';
    this.offers.relics.forEach((relic,i) => {
      const slot = document.createElement('div');
      if(!relic){ slot.className='shop-slot sold';slot.innerHTML='<div class="slot-title">SOLD OUT</div>';relicRow2.appendChild(slot);return; }
      const price = this.relicPrice(relic);
      const ren = relic.relicEnhance ? GameData.RELIC_ENHANCE_POOL.find(r=>r.id===relic.relicEnhance) : null;
      slot.className='shop-slot relic-shop-slot';
      slot.innerHTML=`<div class="relic-shop-card"><div class="relic-name">${relic.name}</div>${ren?`<div class="relic-enhance-tag">${ren.name}</div>`:''}</div><div class="slot-desc">${relic.desc}${ren?`<br><span style="color:var(--gold)">【${ren.name}】${ren.desc}</span>`:''}</div><button class="buy-btn" ${GameState.gold<price||GameState.relics.length>=GameState.effectiveMaxRelics()?'disabled':''}>購入（${price}G）</button>`;
      slot.querySelector('.buy-btn').addEventListener('click', () => this.buyRelic(i, false));
      relicRow2.appendChild(slot);
    });
    relicSec.appendChild(relicRow2);
    el.appendChild(relicSec);

    const actions = document.createElement('div'); actions.className='shop-actions';
    const rerollBtn = document.createElement('button'); rerollBtn.textContent=`品揃え更新（${GameState.shopPriceOf(GameData.SHOP_PRICES.reroll)}G）`; rerollBtn.disabled=GameState.gold<GameState.shopPriceOf(GameData.SHOP_PRICES.reroll); rerollBtn.addEventListener('click',()=>this.rerollOffers()); actions.appendChild(rerollBtn);
    const backBtn = document.createElement('button'); backBtn.textContent='マップに戻る'; backBtn.addEventListener('click',()=>this.leaveShop()); actions.appendChild(backBtn);
    el.appendChild(actions);
    this.container.appendChild(el);
    if(this.pickingCardPack) this.container.appendChild(this.renderCardPackModal());
    if(this.pickingPack) this.container.appendChild(this.renderPickModal());
    if(this.cardRevealPopup) this.container.appendChild(this.renderCardRevealPopup());
  },

  renderFixedRelicSection(){
    const sec = document.createElement('div'); sec.className='shop-section';
    sec.innerHTML=`<h3>ピックアップレリック（確定・${GameState.shopPriceOf(GameData.SHOP_PRICES.relic+3)}G）</h3>`;
    const row = document.createElement('div'); row.className='shop-row';
    this.offers.fixedRelics.forEach((relic, i) => {
      const slot = document.createElement('div');
      if(!relic){ slot.className='shop-slot sold';slot.innerHTML='<div class="slot-title">SOLD OUT</div>';row.appendChild(slot);return; }
      const price = this.relicPrice(relic);
      const ren = relic.relicEnhance ? GameData.RELIC_ENHANCE_POOL.find(r=>r.id===relic.relicEnhance) : null;
      slot.className='shop-slot relic-shop-slot pickup-slot';
      slot.innerHTML=`<div class="relic-shop-card pickup"><div class="relic-name">${relic.name}</div>${ren?`<div class="relic-enhance-tag">${ren.name}</div>`:''}</div><div class="slot-desc">${relic.desc}${ren?`<br><span style="color:var(--gold)">【${ren.name}】${ren.desc}</span>`:''}</div><button class="buy-btn" ${GameState.gold<price||GameState.relics.length>=GameState.effectiveMaxRelics()?'disabled':''}>購入（${price}G）</button>`;
      slot.querySelector('.buy-btn').addEventListener('click', () => this.buyRelic(i, true));
      row.appendChild(slot);
    });
    sec.appendChild(row); return sec;
  },

  renderFixedPackSection(){
    const sec = document.createElement('div'); sec.className='shop-section';
    sec.innerHTML = '<h3>確定パック枠</h3>';
    const row = document.createElement('div'); row.className='shop-row';
    // カードパック
    const cpSlot = this.offers.fixedCardPack[0];
    const cpEl = document.createElement('div'); cpEl.className='shop-slot'+(cpSlot.used?' sold':'');
    if(cpSlot.used){ cpEl.innerHTML='<div class="slot-title">SOLD OUT</div>'; }
    else{
      const price = GameState.shopPriceOf(GameData.SHOP_PRICES.cardPack);
      cpEl.innerHTML=`<div class="slot-title">？カードパック</div><div class="slot-desc">2枚から1枚選択</div><button class="buy-btn" ${GameState.gold<price?'disabled':''}>購入（${price}G）</button>`;
      cpEl.querySelector('.buy-btn').addEventListener('click', () => this.buyCardPack(cpSlot));
    }
    row.appendChild(cpEl);
    // ピックアップアップグレード
    const puSlot = this.offers.fixedUpgrade[0];
    const puEl = document.createElement('div'); puEl.className='shop-slot pickup-slot'+(puSlot.used?' sold':'');
    if(puSlot.used){ puEl.innerHTML='<div class="slot-title">SOLD OUT</div>'; }
    else{
      const price = GameState.shopPriceOf(GameData.SHOP_PRICES.pickupUpgrade);
      puEl.innerHTML=`<div class="slot-title">ピックアップアップグレード</div><div class="slot-desc">通常セレクトから3つ</div><button class="buy-btn" ${GameState.gold<price?'disabled':''}>購入（${price}G）</button>`;
      puEl.querySelector('.buy-btn').addEventListener('click', () => this.buyUpgrade('normal', puSlot));
    }
    row.appendChild(puEl);
    sec.appendChild(row); return sec;
  },

  renderRandomSlots(){
    const sec = document.createElement('div'); sec.className='shop-section';
    sec.innerHTML = '<h3>ランダム商品（8枠）</h3>';
    const row = document.createElement('div'); row.className='shop-row';
    this.offers.randomSlots.forEach((slot) => {
      const el = document.createElement('div');
      const isDream = slot.type === 'dream_card';
      const isSpecial = slot.type === 'special_upgrade';
      const price = GameState.shopPriceOf(this.slotPrice(slot.type));
      const typeName = (GameData.SHOP_RANDOM_TYPES.find(t=>t.id===slot.type)||{name:slot.type}).name;
      if(slot.used){ el.className='shop-slot sold'; el.innerHTML='<div class="slot-title">SOLD OUT</div>'; row.appendChild(el); return; }
      el.className='shop-slot'+(isDream?' dream-slot':'')+(isSpecial?' special-slot':'');
      el.innerHTML=`<div class="slot-title">${typeName}</div><div class="slot-desc">${this.slotDesc(slot.type)}</div><button class="buy-btn" ${GameState.gold<price?'disabled':''}>購入（${price}G）</button>`;
      el.querySelector('.buy-btn').addEventListener('click', () => this.handleRandomSlot(slot));
      row.appendChild(el);
    });
    sec.appendChild(row); return sec;
  },

  slotDesc(type){
    const descs = { pickup_relic:'ランダムなレリックを購入', card_pack:'カード2枚から1枚選択', pickup_upgrade:'通常セレクトから3つ', normal_upgrade:'通常セレクトから3つ', special_upgrade:'特別セレクトから2つ', card_focus:'カード3枚から選択', bingo_focus:'ビンゴ倍率強化を選択', dream_card:'全効果付き特別カードを獲得' };
    return descs[type] || '';
  },

  renderSection(title, price, slots){
    const sec=document.createElement('div'); sec.className='shop-section'; sec.innerHTML=`<h3>${title}（${price}G）</h3>`;
    const row=document.createElement('div'); row.className='shop-row';
    slots.forEach(slot=>{
      const el=document.createElement('div'); el.className='shop-slot'+(slot.content?'':' sold');
      if(slot.content){ el.innerHTML=`${slot.content}<button class="buy-btn">購入</button>`; const btn=el.querySelector('.buy-btn'); btn.disabled=GameState.gold<price; btn.addEventListener('click',slot.onBuy); }
      else el.innerHTML='<div class="slot-title">SOLD OUT</div>';
      row.appendChild(el);
    });
    sec.appendChild(row); return sec;
  },

  renderCardPackModal(){
    const p = this.pickingCardPack;
    const overlay = document.createElement('div'); overlay.className='pack-modal-overlay';
    const modal = document.createElement('div'); modal.className='pack-modal';
    modal.innerHTML = `<h3>${p.multi?'カードを1枚選んでください（3枚から）':'カードを1枚選んでください'}</h3>`;
    const grid = document.createElement('div'); grid.className='pack-card-grid';
    p.candidates.forEach(card => {
      const wrap = document.createElement('div'); wrap.className='card-pick-wrap';
      const item = document.createElement('div'); item.className='card';
      item.innerHTML = `${this.cardTagsHtml(card)}${this.cardSymbolHtml(card)}${this.cardScoreHtml(card)}`;
      wrap.appendChild(item);
      const desc = document.createElement('div'); desc.className='card-pick-desc';
      const lines = [card.jamming&&(GameData.JAMMING_DESC[card.jamming]||''), card.enhance&&(GameData.ENHANCE_DESC[card.enhance]||''), card.trait&&(GameData.TRAIT_DESC[card.trait]||'')].filter(Boolean);
      desc.textContent = lines.join(' / ') || '効果なし';
      wrap.appendChild(desc);
      wrap.addEventListener('click', () => this.pickCardPackCard(card));
      grid.appendChild(wrap);
    });
    modal.appendChild(grid);
    const skipBtn = document.createElement('button'); skipBtn.textContent='スキップ'; skipBtn.style.marginTop='18px'; skipBtn.addEventListener('click', () => this.skipCardPack()); modal.appendChild(skipBtn);
    overlay.appendChild(modal); return overlay;
  },

  // #7 アップグレードパックのカードUIを修正
  renderPickModal(){
    const p = this.pickingPack;
    const overlay = document.createElement('div'); overlay.className='pack-modal-overlay';
    const modal = document.createElement('div'); modal.className='pack-modal pack-modal-wide';
    modal.innerHTML = '<h3>効果を選択してください</h3>';
    const list = document.createElement('div'); list.className='effect-choice-list';
    p.effectPool.forEach(eff => {
      const item = document.createElement('div');
      item.className='effect-choice-item'+(p.chosenEffect===eff?' chosen':'');
      item.innerHTML = `<div class="slot-title">${eff.name}</div><div class="slot-desc">${eff.desc}</div>`;
      item.addEventListener('click', () => this.chooseEffect(eff));
      list.appendChild(item);
    });
    modal.appendChild(list);
    const eff = p.chosenEffect;
    const needsTarget = eff && eff.targetMax > 0;
    const hint = document.createElement('div'); hint.className='shop-message'; hint.style.margin='12px 0 8px';
    if(!eff) hint.textContent='上から効果を選んでください';
    else if(needsTarget) hint.textContent=`カードを${eff.targetMax}枚選択（${p.selectedTargets.size}/${eff.targetMax}）`;
    else hint.textContent='対象カードの選択不要（決定ボタンで発動）';
    modal.appendChild(hint);
    const grid = document.createElement('div'); grid.className='pack-card-grid'+((!eff||!needsTarget)?' grid-disabled':'');
    p.cardIndexes.forEach(idx => {
      const card = GameState.currentDeck[idx]; if(!card) return;
      const item = document.createElement('div');
      item.className='card pack-card-item'+(p.selectedTargets.has(idx)?' picked':'');
      let sellBadge = '';
      if(eff?.id==='cash_in'){ const g=this.calcCashGain(card); sellBadge=`<div class="sell-badge">売却+${g}G</div>`; }
      item.innerHTML = `${sellBadge}${this.cardTagsHtml(card)}${this.cardSymbolHtml(card)}${this.cardScoreHtml(card)}`;
      item.addEventListener('click', () => this.toggleTarget(idx));
      grid.appendChild(item);
    });
    modal.appendChild(grid);
    const btnRow = document.createElement('div'); btnRow.className='pack-modal-actions';
    const confirmBtn = document.createElement('button'); confirmBtn.textContent='決定'; confirmBtn.disabled=!eff||(needsTarget&&p.selectedTargets.size<eff.targetMin); confirmBtn.addEventListener('click',()=>this.confirmPack()); btnRow.appendChild(confirmBtn);
    const skipBtn = document.createElement('button'); skipBtn.textContent='スキップ'; skipBtn.addEventListener('click',()=>this.skipPack()); btnRow.appendChild(skipBtn);
    modal.appendChild(btnRow);
    overlay.appendChild(modal); return overlay;
  },

  renderCardRevealPopup(){
    const overlay = document.createElement('div'); overlay.className='pack-modal-overlay';
    const box = document.createElement('div'); box.className='card-reveal-popup';
    box.innerHTML = '<div class="gr-label">カードが更新されました</div>';
    const grid = document.createElement('div'); grid.className='pack-card-grid';
    this.cardRevealPopup.cards.forEach(card => {
      const item = document.createElement('div'); item.className='card reveal-glow';
      item.innerHTML = `${this.cardTagsHtml(card)}${this.cardSymbolHtml(card)}${this.cardScoreHtml(card)}`;
      grid.appendChild(item);
    });
    box.appendChild(grid); overlay.appendChild(box); return overlay;
  },
};
