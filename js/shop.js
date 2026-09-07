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
    const fixedRelics = [this.pickRelic(), this.pickRelic()]; // 確定ピックアップレリック2つ
    const fixedCardPack = [{ type:'card_pack', mystery:true }];
    const fixedUpgrade = [{ type:'pickup_upgrade' }];
    const randomSlots = [];
    for(let i = 0; i < 8; i++) randomSlots.push({ type: GameData.pickWeightedType() });
    // #5 レリック欄は廃止。ランダムスロットのpickup_relicのみ
    return { fixedRelics, fixedCardPack, fixedUpgrade, randomSlots };
  },

  pickRelic(){
    const base = GlobalFunctions.randChoice(GameData.RELIC_POOL);
    const relicEnhance = Math.random() < 0.15 ? GlobalFunctions.randChoice(GameData.RELIC_ENHANCE_POOL).id : null;
    return { ...base, relicEnhance };
  },

  shopSellRelic(relicId){
    const idx=GameState.relics.findIndex(r=>r.id===relicId); if(idx<0) return;
    const relic=GameState.relics[idx];
    const ren=GameData.RELIC_ENHANCE_POOL.find(r=>r.id===relic.relicEnhance);
    let price=1;
    if(relic.relicEnhance==='ren_discard_sell') price=Math.floor(GameState.currentDeck.length/2);
    else if(ren) price+=2;
    // #3 ショップでの売却時もレリック効果を確実に除去する（ペイント等の永続効果が残るバグ修正）
    if(typeof GameMainScene!=='undefined') GameMainScene.removeRelicEffect(relic);
    GameState.relics.splice(idx,1);
    GameState.gold+=price;
    this.activeRelicId=null;
    this.message=`レリック「${relic.name}」を${price}Gで売却した`;
    this.renderAll();
  },

  // #1(B) ブラックカードは重複所持不可
  canAcquireRelic(relic){
    if(relic.relicEnhance==='ren_black' && GameState.relics.some(r=>r.relicEnhance==='ren_black')) return false;
    return GameState.canAddRelic(relic);
  },

  // #4 ピックアップレリック：スロットに独自レリックを持ち購入
  buyPickupRelic(slot){
    if(!slot._relic) slot._relic=this.pickRelic();
    const relic=slot._relic;
    const price=this.relicPrice(relic);
    if(GameState.gold<price){ this.message='Gが足りません'; this.renderAll(); return; }
    // #1(B) 倍化/3倍化は2枠・3枠消費。上限を超える場合は購入不可。ブラックカードは重複不可
    if(!this.canAcquireRelic(relic)){
      this.message = (relic.relicEnhance==='ren_black' && GameState.relics.some(r=>r.relicEnhance==='ren_black')) ? 'ブラックカードは重複所持できません' : `レリックは最大${GameState.effectiveMaxRelics()}枠まで`;
      this.renderAll(); return;
    }
    GameState.gold-=price;
    GameState.relics.push(relic);
    slot.used=true;
    this.applyRelicGrantEffect(relic);
    GlobalFunctions.recordRelic(relic.id);
    const renName=relic.relicEnhance?(GameData.RELIC_ENHANCE_POOL.find(r=>r.id===relic.relicEnhance)?.name||''):'';
    this.message=`レリック「${relic.name}${renName?'・'+renName:''}」を購入した`;
    this.renderAll();
  },

  relicPrice(relic){ return GameState.shopPriceOf(GameData.SHOP_PRICES.relic + (relic.relicEnhance ? 3 : 0)); },

  calcCashGain(card){ return 1 + (card.enhance ? 2 : 0) + (card.jamming ? 1 : 0) + ((card.trait&&card.trait!=='塗りつぶし(レリック)') ? 3 : 0); },

  // --- 共通カード表示ヘルパー（手札/盤面/ショップ共通） ---

  // #1 左上ドット（ジャミング緑・強化黄・性質変化青）
  cardTagsHtml(card){
    let h='';
    if(card.jamming) h+=`<div class="card-dot dot-jamming"></div>`;
    if(card.enhance) h+=`<div class="card-dot dot-enhance"></div>`;
    if(card.trait)   h+=`<div class="card-dot dot-trait"></div>`;
    return h?`<div class="card-dots-row">${h}</div>`:'';
  },

  // #4 各強化効果の視覚表現を記号に反映
  cardSymbolHtml(card){
    const label=GameData.SYMBOL_LABEL[card.symbol];
    const emoji=card.jamming?(GameData.JAMMING_EMOJI[card.jamming]||''):'';
    const emojiHtml=emoji?`<div class="card-jamming-emoji">${emoji}</div>`:'';
    const multiSym=GameData.MULTI_SYMBOL_LABEL[card.enhance];

    // 拡張・拡大
    if(card.enhance==='横拡張')
      return `<div class="card-symbol-expand horiz"><span class="sym-${card.symbol} esym">${label}</span><span class="sym-${card.symbol} esym">${label}</span></div>${emojiHtml}`;
    if(card.enhance==='縦拡張')
      return `<div class="card-symbol-expand vert"><span class="sym-${card.symbol} esym">${label}</span><span class="sym-${card.symbol} esym">${label}</span></div>${emojiHtml}`;
    if(card.enhance==='拡大')
      return `<div class="card-symbol-expand grid2"><span class="sym-${card.symbol} esym">${label}</span><span class="sym-${card.symbol} esym">${label}</span><span class="sym-${card.symbol} esym">${label}</span><span class="sym-${card.symbol} esym">${label}</span></div>${emojiHtml}`;

    // 巨大化：記号1.5倍
    if(card.enhance==='巨大化'){
      const sub=multiSym?`<span class="card-multi-sub">${multiSym}</span>`:'';
      return `<div class="card-symbol-wrap"><span class="sym-${card.symbol} sym-large">${label}</span>${sub}</div>${emojiHtml}`;
    }
    // ハブ：記号右に➕
    if(card.enhance==='ハブ'){
      const sub=multiSym?`<span class="card-multi-sub">${multiSym}</span>`:'';
      return `<div class="card-symbol-wrap"><span class="sym-${card.symbol}">${label}</span><span class="enhance-badge">➕</span>${sub}</div>${emojiHtml}`;
    }
    // 連鎖：記号右に🤝
    if(card.enhance==='連鎖'){
      const sub=multiSym?`<span class="card-multi-sub">${multiSym}</span>`:'';
      return `<div class="card-symbol-wrap"><span class="sym-${card.symbol}">${label}</span><span class="enhance-badge">🤝</span>${sub}</div>${emojiHtml}`;
    }
    // 肥大化：記号横に "+倍率*2" (黄色)
    if(card.enhance==='肥大化'){
      const mult=GameData.BINGO_MULTIPLIER_BASE[card.symbol]||0;
      const val=mult*2;
      const sub=multiSym?`<span class="card-multi-sub">${multiSym}</span>`:'';
      return `<div class="card-symbol-wrap"><span class="sym-${card.symbol}">${label}</span><span class="enhance-badge gold-text">+${val}</span>${sub}</div>${emojiHtml}`;
    }
    // マルチ系
    const sub=multiSym?`<span class="card-multi-sub">${multiSym}</span>`:'';
    return `<div class="card-symbol-wrap"><span class="sym-${card.symbol}">${label}</span>${sub}</div>${emojiHtml}`;
  },

  // #4 右上数字にブルジョワ・ドロー情報を付加
  // #1 ドット（黄緑青）をカード基礎点の左に inline 表示
  // #2 ブルジョワは現在Gを受け取って動的表示
  // #6 数値強化も +15 を明示
  cardScoreHtml(card, currentGold=0){
    const multiMap={'マルマルチ':'Circle','サンカクマルチ':'Triangle','シカクマルチ':'Square'};
    const ms=multiMap[card.enhance];

    // 左側インラインドット
    let dotHtml='';
    if(card.enhance) dotHtml+=`<span class="score-dot dot-enhance"></span>`;
    if(card.jamming) dotHtml+=`<span class="score-dot dot-jamming"></span>`;
    if(card.trait)   dotHtml+=`<span class="score-dot dot-trait"></span>`;
    const dotsSpan=dotHtml?`<span class="score-dots">${dotHtml}</span>`:'';

    let bonusHtml='';
    if(ms&&card.symbol===ms&&card.baseScore>card.number){
      bonusHtml=`<span class="card-score-bonus">+${card.baseScore-card.number}</span>`;
    } else if(card.enhance==='数値強化'){
      bonusHtml=`<span class="card-score-bonus">+15</span>`;
    } else if(card.enhance==='ブルジョワ'){
      // #2 動的：現在G×4
      const bonus=currentGold*4;
      bonusHtml=`<span class="card-score-bonus gold-text">+${bonus}(×4G)</span>`;
    }

    let scoreHtml=`<span class="card-number">${dotsSpan}${card.baseScore}${bonusHtml}</span>`;
    if(card.enhance==='ドロー') scoreHtml+=`<span class="card-draw-label">draw1</span>`;
    return scoreHtml;
  },

  // ===== Relic purchase =====
  buyRelic(i, isFixed=false){
    const relic = isFixed ? this.offers.fixedRelics[i] : this.offers.relics[i];
    if(!relic) return;
    const price = this.relicPrice(relic);
    if(GameState.gold < price){ this.message = 'Gが足りません'; this.renderAll(); return; }
    if(!this.canAcquireRelic(relic)){
      this.message = (relic.relicEnhance==='ren_black' && GameState.relics.some(r=>r.relicEnhance==='ren_black')) ? 'ブラックカードは重複所持できません' : `レリックは最大${GameState.effectiveMaxRelics()}枠まで`;
      this.renderAll(); return;
    }
    GameState.gold -= price;
    GameState.relics.push(relic);
    if(isFixed) this.offers.fixedRelics[i] = null; else this.offers.relics[i] = null;
    this.applyRelicGrantEffect(relic);
    GlobalFunctions.recordRelic(relic.id);
    this.message = `レリック「${relic.name}」を購入した`;
    this.renderAll();
  },

  applyRelicGrantEffect(relic){
    switch(relic.id){
      case 'round_boost': GameState.roundsBonus += 1; break;
      case 'reroll_boost': GameState.rerollBonus += 2; GameState.rerollCount += 2; break;
      case 'hand_boost': GameState.handSizeBonus += 3; break;
      case 'paint': GameState.currentDeck.forEach(c=>{ if(!c.trait) c.trait = '塗りつぶし(レリック)'; }); GameState.turnsBonus -= 8; break; // #10 ターン変動-8に修正
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
    GlobalFunctions.recordCard(card);
    this.message = `${GameData.SYMBOL_LABEL[card.symbol]}（基礎点${card.baseScore}）を獲得した`;
    this.pickingCardPack = null; this.renderAll();
  },
  // #8 カードフォーカス等の複数枚ピックアップ確定
  confirmCardPackMulti(){
    const p = this.pickingCardPack; if(!p || !p.selected || p.selected.size < (p.pickCount||1)) return;
    const picked = Array.from(p.selected).map(i => p.candidates[i]).filter(Boolean);
    picked.forEach(c => { GameState.currentDeck.push(c); GlobalFunctions.recordCard(c); });
    this.message = `${picked.length}枚のカードを獲得した`;
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
      case 'grant_enhance': { const i=targetIndexes[0]; const c=deck[i]; if(!c) return []; c.enhance=GlobalFunctions.randChoice(GameData.ENHANCE_NAME_POOL); GameData.applyGrantSideEffects(c, GameState.gold); this.message=`カード強化「${c.enhance}」付与`; return [c]; }
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
      case 'pickup_relic': this.buyPickupRelic(slot); break;
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
      // #9 新商品
      case 'enhance_pack': this.buyEnhancePack(slot); break;
      case 'jamming_pack': this.buyJammingPack(slot); break;
      case 'relic_pack': this.buyRelicPack(slot); break;
      default: break;
    }
  },

  slotPrice(type){
    const map = { pickup_relic:GameData.SHOP_PRICES.pickupRelic, card_pack:GameData.SHOP_PRICES.cardPack, pickup_upgrade:GameData.SHOP_PRICES.pickupUpgrade, normal_upgrade:GameData.SHOP_PRICES.normalUpgrade, special_upgrade:GameData.SHOP_PRICES.specialUpgrade, card_focus:GameData.SHOP_PRICES.cardFocus, bingo_focus:GameData.SHOP_PRICES.bingoFocus, dream_card:GameData.SHOP_PRICES.dreamCard,
      enhance_pack:GameData.SHOP_PRICES.enhancePack, jamming_pack:GameData.SHOP_PRICES.jammingPack, relic_pack:GameData.SHOP_PRICES.relicPack };
    return map[type] || 3;
  },

  // #9 強化カードパック：カード3枚（全て強化付き）のうち1枚をピックアップ。4G
  buyEnhancePack(slot){
    const price = GameState.shopPriceOf(this.slotPrice('enhance_pack'));
    if(GameState.gold < price) return;
    GameState.gold -= price; slot.used = true;
    const gen = () => { const c = GameData.generateShopCard(); c.enhance = GlobalFunctions.randChoice(GameData.ENHANCE_NAME_POOL); GameData.applyGrantSideEffects(c); return c; };
    this.pickingCardPack = { candidates:[gen(),gen(),gen()], pickCount:1 };
    this.renderAll();
  },
  // #9 ジャミングカードパック：カード3枚（全てジャミング付き）のうち1枚をピックアップ。4G
  buyJammingPack(slot){
    const price = GameState.shopPriceOf(this.slotPrice('jamming_pack'));
    if(GameState.gold < price) return;
    GameState.gold -= price; slot.used = true;
    const gen = () => { const c = GameData.generateShopCard(); c.jamming = GlobalFunctions.randChoice(Object.keys(GameData.JAMMING_DESC)); return c; };
    this.pickingCardPack = { candidates:[gen(),gen(),gen()], pickCount:1 };
    this.renderAll();
  },
  // #9 レリックパック：レリック3つのうち1つをピックアップ。所持レリックの売却も可能。4G。強化付与率25%
  buyRelicPack(slot){
    const price = GameState.shopPriceOf(this.slotPrice('relic_pack'));
    if(GameState.gold < price) return;
    GameState.gold -= price; slot.used = true;
    const gen = () => { const base = GlobalFunctions.randChoice(GameData.RELIC_POOL); const relicEnhance = Math.random() < 0.25 ? GlobalFunctions.randChoice(GameData.RELIC_ENHANCE_POOL).id : null; return { ...base, relicEnhance }; };
    this.pickingRelicPack = { candidates:[gen(),gen(),gen()] };
    this.renderAll();
  },
  pickRelicPackCard(idx){
    const p = this.pickingRelicPack; if(!p) return;
    const relic = p.candidates[idx]; if(!relic) return;
    if(!this.canAcquireRelic(relic)){
      this.message = (relic.relicEnhance==='ren_black' && GameState.relics.some(r=>r.relicEnhance==='ren_black')) ? 'ブラックカードは重複所持できません。売却してから選択してください' : 'レリック上限です。売却してから選択してください';
      this.renderAll(); return;
    }
    GameState.relics.push(relic);
    this.applyRelicGrantEffect(relic);
    GlobalFunctions.recordRelic(relic.id);
    this.message = `レリック「${relic.name}」を獲得した`;
    this.pickingRelicPack = null;
    this.renderAll();
  },
  skipRelicPack(){ this.message='レリックパックをスキップした'; this.pickingRelicPack=null; this.renderAll(); },

  buyFocusPack(slot, focus){
    GameState.gold -= GameState.shopPriceOf(this.slotPrice(slot.type));
    slot.used = true;
    // #8 カードフォーカス：カード4枚のうち2枚をピックアップ、ビンゴフォーカス：ビンゴ倍率強化3択
    if(focus === 'card'){
      const candidates = [GameData.generateShopCard(), GameData.generateShopCard(), GameData.generateShopCard(), GameData.generateShopCard()];
      this.pickingCardPack = { candidates, pickCount:2, selected:new Set() };
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

  // #8 ドリームカードパック：2枚のうち1枚をピックアップ（またはスキップ）
  genDreamCard(){
    const card = GameData.generateShopCard();
    card.baseScore = GlobalFunctions.randInt(120, 150); // #2 ドリームカード数値
    card.number = card.baseScore;
    card.enhance = GlobalFunctions.randChoice(GameData.ENHANCE_NAME_POOL);
    card.jamming = GlobalFunctions.randChoice(Object.keys(GameData.JAMMING_DESC));
    card.trait = GlobalFunctions.randChoice(GameData.TRAIT_NAME_POOL);
    GameData.applyGrantSideEffects(card);
    return card;
  },
  buyDreamCard(slot){
    GameState.gold -= GameState.shopPriceOf(GameData.SHOP_PRICES.dreamCard);
    slot.used = true;
    const candidates = [this.genDreamCard(), this.genDreamCard()];
    this.pickingCardPack = { candidates, pickCount:1, isDream:true };
    this.renderAll();
  },

  rerollOffers(){ const price=GameState.shopPriceOf(GameData.SHOP_PRICES.reroll); if(GameState.gold<price) return; GameState.gold-=price; this.offers=this.generateOffers(); this.message='品揃えを更新した'; this.renderAll(); },

  leaveShop(){ this.offers=null; this.pickingPack=null; this.pickingCardPack=null; this.cardRevealPopup=null; this.message=null; this.activeRelicId=null; GameState.lastReward=null; App.showMapSelect(); },

  // ===== Render =====
  renderAll(){
    // #4 タップのたびに画面が一番上に戻る不具合を防ぐ：スクロール位置を保持
    const scrollY = window.scrollY;
    this.container.innerHTML = '';
    const el = document.createElement('div'); el.className = 'shop-screen';
    const r = GameState.lastReward;
    let rewardText = '';
    if(r){ const b=r.breakdown; rewardText = b ? `${r.stageName}を${r.type==='skip'?'スキップ':'クリア'}：基本6 ＋ 残りラウンド${b.roundBonus} ＋ 残りリロール${b.rerollBonus} ＋ レリック${b.relicBonus} ＋ カード${b.cardBonus}${b.doubled?'（2倍済）':''} ＝ G+${r.gold}${r.extra?`／追加報酬：${r.extra}`:''}` : `${r.stageName}：G+${r.gold}${r.extra?`／追加報酬：${r.extra}`:''}`; }
    const header = document.createElement('div'); header.className='shop-header';
    header.innerHTML = `<h2>ショップ</h2>${rewardText?`<div class="shop-reward">${rewardText}</div>`:''}<div class="shop-gold">所持G：${GameState.gold}</div>${this.message?`<div class="shop-message">${this.message}</div>`:''}`;
    el.appendChild(header);

    // #4 ショップ内レリック表示（ゲームプレイ中と同様のカード表示＋売却）
    const relicArea = document.createElement('div'); relicArea.className='shop-relic-confirm';
    relicArea.innerHTML = `<div class="shop-section-title">所持レリック（${GameState.usedRelicSlots()}/${GameState.effectiveMaxRelics()}）</div>`;
    const relicRow = document.createElement('div'); relicRow.className='relic-display-row';
    if(GameState.relics.length===0){
      const empty=document.createElement('div');empty.className='relic-empty';empty.textContent='なし';relicRow.appendChild(empty);
    }else{
      GameState.relics.forEach(relic => {
        const rc = document.createElement('div');
        rc.className='relic-card'+(this.activeRelicId===relic.id?' active':'');
        rc.innerHTML=`<div class="relic-name">${relic.name}</div>${relic.relicEnhance?`<div class="relic-enhance-tag">${GameData.RELIC_ENHANCE_POOL.find(r=>r.id===relic.relicEnhance)?.name||''}</div>`:''}`;
        rc.addEventListener('click', () => { this.activeRelicId=(this.activeRelicId===relic.id)?null:relic.id; this.renderAll(); });
        relicRow.appendChild(rc);
      });
    }
    relicArea.appendChild(relicRow);
    if(this.activeRelicId){
      const relic = GameState.relics.find(r=>r.id===this.activeRelicId);
      if(relic){
        const ren=GameData.RELIC_ENHANCE_POOL.find(r=>r.id===relic.relicEnhance);
        let sellPrice=1;
        if(relic.relicEnhance==='ren_discard_sell') sellPrice=Math.floor(GameState.currentDeck.length/2);
        else if(ren) sellPrice+=2;
        const infoDiv=document.createElement('div'); infoDiv.className='relic-info-panel'; infoDiv.style.marginTop='8px';
        infoDiv.innerHTML=`<div class="info-title">${relic.name}</div><div class="info-desc">${relic.desc}</div>${ren?`<div class="info-desc relic-enhance-desc">【${ren.name}】${ren.desc}</div>`:''}<button class="sell-relic-btn">売却（${sellPrice}G）</button>`;
        infoDiv.querySelector('.sell-relic-btn').addEventListener('click', ()=>this.shopSellRelic(relic.id));
        relicArea.appendChild(infoDiv);
      }
    }
    el.appendChild(relicArea);

    // 確定ピックアップレリック
    el.appendChild(this.renderFixedRelicSection());
    // 確定カードパック・確定アップグレード
    el.appendChild(this.renderFixedPackSection());
    // ランダム8枠
    el.appendChild(this.renderRandomSlots());

    // 既存レリック販売枠


    const actions = document.createElement('div'); actions.className='shop-actions';
    const rerollBtn = document.createElement('button'); rerollBtn.textContent=`品揃え更新（${GameState.shopPriceOf(GameData.SHOP_PRICES.reroll)}G）`; rerollBtn.disabled=GameState.gold<GameState.shopPriceOf(GameData.SHOP_PRICES.reroll); rerollBtn.addEventListener('click',()=>this.rerollOffers()); actions.appendChild(rerollBtn);
    const backBtn = document.createElement('button'); backBtn.textContent='マップに戻る'; backBtn.addEventListener('click',()=>this.leaveShop()); actions.appendChild(backBtn);
    el.appendChild(actions);
    this.container.appendChild(el);
    if(this.pickingCardPack) this.container.appendChild(this.renderCardPackModal());
    if(this.pickingPack) this.container.appendChild(this.renderPickModal());
    if(this.pickingRelicPack) this.container.appendChild(this.renderRelicPackModal());
    if(this.cardRevealPopup) this.container.appendChild(this.renderCardRevealPopup());
    window.scrollTo(0,scrollY);
  },

  // #9 レリックパック選択モーダル（所持レリックの売却も可能）
  renderRelicPackModal(){
    const p = this.pickingRelicPack;
    const overlay = document.createElement('div'); overlay.className='pack-modal-overlay';
    const modal = document.createElement('div'); modal.className='pack-modal pack-modal-wide';
    modal.innerHTML = '<h3>レリックを1つ選んでください（3つから）</h3>';
    const grid = document.createElement('div'); grid.className='pack-card-grid';
    p.candidates.forEach((relic,idx) => {
      const ren = relic.relicEnhance ? GameData.RELIC_ENHANCE_POOL.find(r=>r.id===relic.relicEnhance) : null;
      const wrap = document.createElement('div'); wrap.className='card-pick-wrap';
      const item = document.createElement('div'); item.className='relic-card pickup';
      item.innerHTML = `<div class="relic-shop-badge">レリック🔴</div><div class="relic-name">${relic.name}</div>${ren?`<div class="relic-enhance-tag">${ren.name}</div>`:''}`;
      wrap.appendChild(item);
      const desc = document.createElement('div'); desc.className='card-pick-desc';
      desc.textContent = relic.desc + (ren?` ／【${ren.name}】${ren.desc}`:'');
      wrap.appendChild(desc);
      wrap.addEventListener('click', () => this.pickRelicPackCard(idx));
      grid.appendChild(wrap);
    });
    modal.appendChild(grid);

    const ownedTitle = document.createElement('div'); ownedTitle.className='shop-section-title'; ownedTitle.style.marginTop='14px';
    ownedTitle.textContent = `所持レリック（${GameState.usedRelicSlots()}/${GameState.effectiveMaxRelics()}）売却してストックを確保できます`;
    modal.appendChild(ownedTitle);
    const ownedRow = document.createElement('div'); ownedRow.className='relic-display-row';
    if(GameState.relics.length===0){ const empty=document.createElement('div'); empty.className='relic-empty'; empty.textContent='なし'; ownedRow.appendChild(empty); }
    else GameState.relics.forEach(relic => {
      const ren = relic.relicEnhance ? GameData.RELIC_ENHANCE_POOL.find(r=>r.id===relic.relicEnhance) : null;
      let sellPrice=1; if(relic.relicEnhance==='ren_discard_sell') sellPrice=Math.floor(GameState.currentDeck.length/2); else if(ren) sellPrice+=2;
      const rc = document.createElement('div'); rc.className='relic-card';
      rc.innerHTML = `<div class="relic-name">${relic.name}</div>${ren?`<div class="relic-enhance-tag">${ren.name}</div>`:''}<button class="sell-relic-btn" style="margin-top:4px;">売却（${sellPrice}G）</button>`;
      rc.querySelector('.sell-relic-btn').addEventListener('click', () => this.shopSellRelic(relic.id));
      ownedRow.appendChild(rc);
    });
    modal.appendChild(ownedRow);

    const skipBtn = document.createElement('button'); skipBtn.textContent='スキップ'; skipBtn.style.marginTop='18px'; skipBtn.addEventListener('click', () => this.skipRelicPack()); modal.appendChild(skipBtn);
    overlay.appendChild(modal); return overlay;
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
      slot.innerHTML=`<div class="relic-shop-card pickup"><div class="relic-shop-badge">レリック🔴</div><div class="relic-name">${relic.name}</div>${ren?`<div class="relic-enhance-tag">${ren.name}</div>`:''}</div><div class="slot-desc">${relic.desc}${ren?`<br><span style="color:var(--gold)">【${ren.name}】${ren.desc}</span>`:''}</div><button class="buy-btn" ${GameState.gold<price||!this.canAcquireRelic(relic)?'disabled':''}>購入（${price}G）</button>`;
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
      cpEl.innerHTML=`<div class="slot-title">🎴？カードパック</div><div class="slot-desc">2枚から1枚選択</div><button class="buy-btn" ${GameState.gold<price?'disabled':''}>購入（${price}G）</button>`;
      cpEl.querySelector('.buy-btn').addEventListener('click', () => this.buyCardPack(cpSlot));
    }
    row.appendChild(cpEl);
    // ピックアップアップグレード（#5 1つの効果を抽選して陳列・即時発動）
    if(!this.offers.fixedUpgrade[0]._single){
      const pool=GameData.NORMAL_SELECT_POOL.filter(e=>!e.rarity);
      this.offers.fixedUpgrade[0]._single=GlobalFunctions.randChoice(pool);
    }
    const puSlot = this.offers.fixedUpgrade[0];
    const puEl = document.createElement('div'); puEl.className='shop-slot pickup-slot'+(puSlot.used?' sold':'');
    if(puSlot.used){ puEl.innerHTML='<div class="slot-title">SOLD OUT</div>'; }
    else{
      const price = GameState.shopPriceOf(GameData.SHOP_PRICES.pickupUpgrade);
      const eff = puSlot._single;
      puEl.innerHTML=`<div class="slot-title">🎯ピックアップ<br>${eff.name}</div><div class="slot-desc">${eff.desc}</div><button class="buy-btn" ${GameState.gold<price?'disabled':''}>購入（${price}G）</button>`;
      puEl.querySelector('.buy-btn').addEventListener('click', () => {
        if(GameState.gold < price) return;
        GameState.gold -= price; puSlot.used = true;
        if(eff.targetMax === 0){
          this.applyEffect(eff.id, []);
          this.renderAll();
        } else {
          const cardIndexes=GlobalFunctions.shuffle(GameState.currentDeck.map((_,idx)=>idx)).slice(0,Math.min(8,GameState.currentDeck.length));
          this.pickingPack={slotType:'pickup_single',slotRef:puSlot,effectPool:[eff],chosenEffect:eff,cardIndexes,selectedTargets:new Set()};
          this.renderAll();
        }
      });
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
      const typeName = (GameData.SHOP_RANDOM_TYPES.find(t=>t.id===slot.type)||{name:slot.type,emoji:''});
      if(slot.used){ el.className='shop-slot sold'; el.innerHTML='<div class="slot-title">SOLD OUT</div>'; row.appendChild(el); return; }
      el.className='shop-slot'+(isDream?' dream-slot':'')+(isSpecial?' special-slot':'');

      // #1/#4 pickup_relic: レリックを事前抽選して表示
      if(slot.type==='pickup_relic'){
        if(!slot._relic) slot._relic=this.pickRelic();
        const r=slot._relic;
        const ren=r.relicEnhance?GameData.RELIC_ENHANCE_POOL.find(x=>x.id===r.relicEnhance):null;
        el.className+=' pickup-slot';
        el.innerHTML=`<div class="slot-title"><div class="relic-shop-badge">レリック🔴</div>${r.name}${ren?`<span class="relic-enhance-tag"> ${ren.name}</span>`:''}</div><div class="slot-desc">${r.desc}${ren?`<br><span style="color:var(--gold)">【${ren.name}】${ren.desc}</span>`:''}</div><button class="buy-btn" ${GameState.gold<price||!this.canAcquireRelic(r)?'disabled':''}>購入（${price}G）</button>`;
        el.querySelector('.buy-btn').addEventListener('click', () => this.buyPickupRelic(slot));
        row.appendChild(el); return;
      }

      // #1 pickup_upgrade: 1効果を事前抽選して表示
      if(slot.type==='pickup_upgrade'){
        if(!slot._single){
          const pool=GameData.NORMAL_SELECT_POOL.filter(e=>!e.rarity);
          slot._single=GlobalFunctions.randChoice(pool);
        }
        const eff=slot._single;
        el.className+=' pickup-slot';
        el.innerHTML=`<div class="slot-title">🎯ピックアップ<br>${eff.name}</div><div class="slot-desc">${eff.desc}</div><button class="buy-btn" ${GameState.gold<price?'disabled':''}>購入（${price}G）</button>`;
        el.querySelector('.buy-btn').addEventListener('click', () => {
          if(GameState.gold<price) return;
          GameState.gold-=price; slot.used=true;
          if(eff.targetMax===0){ this.applyEffect(eff.id,[]); this.renderAll(); }
          else{
            const ci=GlobalFunctions.shuffle(GameState.currentDeck.map((_,i)=>i)).slice(0,Math.min(8,GameState.currentDeck.length));
            this.pickingPack={slotType:'pickup_single',slotRef:slot,effectPool:[eff],chosenEffect:eff,cardIndexes:ci,selectedTargets:new Set()};
            this.renderAll();
          }
        });
        row.appendChild(el); return;
      }

      el.innerHTML=`<div class="slot-title">${typeName.emoji||''}${typeName.name}</div><div class="slot-desc">${this.slotDesc(slot.type)}</div><button class="buy-btn" ${GameState.gold<price?'disabled':''}>購入（${price}G）</button>`;
      el.querySelector('.buy-btn').addEventListener('click', () => this.handleRandomSlot(slot));
      row.appendChild(el);
    });
    sec.appendChild(row); return sec;
  },

  slotDesc(type){
    const descs = { pickup_relic:'ランダムなレリックを購入', card_pack:'カード2枚から1枚選択', pickup_upgrade:'通常セレクトから3つ', normal_upgrade:'通常セレクトから3つ', special_upgrade:'特別セレクトから2つ', card_focus:'カード4枚から2枚ピックアップ', bingo_focus:'ビンゴ倍率強化を選択', dream_card:'カード2枚から1枚ピックアップ（全効果付き）',
      enhance_pack:'強化付きカード3枚から1枚選択', jamming_pack:'ジャミング付きカード3枚から1枚選択', relic_pack:'レリック3つから1つ選択・売却してストック確保も可能' };
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
    const pickCount = p.pickCount||1;
    const overlay = document.createElement('div'); overlay.className='pack-modal-overlay';
    const modal = document.createElement('div'); modal.className='pack-modal';
    modal.innerHTML = `<h3>カードを${pickCount}枚選んでください（${p.candidates.length}枚から）</h3>`;
    const grid = document.createElement('div'); grid.className='pack-card-grid';
    if(!p.selected) p.selected = new Set();
    p.candidates.forEach((card,idx) => {
      const wrap = document.createElement('div'); wrap.className='card-pick-wrap'+(pickCount>1&&p.selected.has(idx)?' picked':'');
      const item = document.createElement('div'); item.className='card'+(card.trait?` trait-${card.trait.replace(/[()]/g,'')}`:'');
      item.innerHTML = `${this.cardTagsHtml(card)}${this.cardSymbolHtml(card)}${this.cardScoreHtml(card, GameState.gold)}`;
      wrap.appendChild(item);
      const desc = document.createElement('div'); desc.className='card-pick-desc';
      const lines = [card.jamming&&(GameData.JAMMING_DESC[card.jamming]||''), card.enhance&&(GameData.ENHANCE_DESC[card.enhance]||''), card.trait&&(GameData.TRAIT_DESC[card.trait]||'')].filter(Boolean);
      desc.textContent = lines.join(' / ') || '効果なし';
      wrap.appendChild(desc);
      if(pickCount===1){
        wrap.addEventListener('click', () => this.pickCardPackCard(card));
      }else{
        wrap.addEventListener('click', () => {
          if(p.selected.has(idx)) p.selected.delete(idx);
          else if(p.selected.size < pickCount) p.selected.add(idx);
          this.renderAll();
        });
      }
      grid.appendChild(wrap);
    });
    modal.appendChild(grid);
    if(pickCount>1){
      const confirmBtn = document.createElement('button'); confirmBtn.textContent=`決定（${p.selected.size}/${pickCount}）`; confirmBtn.style.marginTop='12px'; confirmBtn.disabled = p.selected.size < pickCount;
      confirmBtn.addEventListener('click', () => this.confirmCardPackMulti());
      modal.appendChild(confirmBtn);
    }
    const skipBtn = document.createElement('button'); skipBtn.textContent='スキップ'; skipBtn.style.marginTop='18px'; skipBtn.addEventListener('click', () => this.skipCardPack()); modal.appendChild(skipBtn);
    overlay.appendChild(modal); return overlay;
  },

  // #7 アップグレードパックのカードUIを修正
  renderPickModal(){
    const p = this.pickingPack;
    const overlay = document.createElement('div'); overlay.className='pack-modal-overlay';
    const modal = document.createElement('div'); modal.className='pack-modal pack-modal-wide';
    modal.innerHTML = '<h3>効果を選択してください</h3>';
    // #5 ビンゴ倍率表示パネルをモーダル左側に追加
    const multPanel = document.createElement('div'); multPanel.className='modal-mult-panel';
    const multRows = GameData.SYMBOLS.map(s=>{
      const base=GameData.BINGO_MULTIPLIER_BASE[s]+GameData.CORRECTION_MULTIPLIER;
      const quad=Math.round(GameData.quadMult(s)+GameData.CORRECTION_MULTIPLIER);
      const f=v=>v>=0?'+'+Math.round(v):String(Math.round(v));
      return `<tr><td class="sym-${s}">${GameData.SYMBOL_LABEL[s]}</td><td>${f(base)}</td><td>${f(quad)}</td></tr>`;
    }).join('');
    multPanel.innerHTML=`<div class="mult-legend-modal"><b>ビンゴ倍率</b><table><tr><th></th><th>基礎</th><th>4列</th></tr>${multRows}</table></div>`;
    modal.appendChild(multPanel);
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
      item.className='card pack-card-item'+(p.selectedTargets.has(idx)?' picked':'')+(card.trait?` trait-${card.trait.replace(/[()]/g,'')}`:'');
      let sellBadge = '';
      if(eff?.id==='cash_in'){ const g=this.calcCashGain(card); sellBadge=`<div class="sell-badge">売却+${g}G</div>`; }
      item.innerHTML = `${sellBadge}${this.cardTagsHtml(card)}${this.cardSymbolHtml(card)}${this.cardScoreHtml(card)}`;
      item.addEventListener('click', () => this.toggleTarget(idx));
      // #3 カードホバー説明
      item.addEventListener('mouseenter', ()=>{
        const lines=[];
        if(card.jamming){const emoji=GameData.JAMMING_EMOJI[card.jamming]||'';lines.push(`<span class="desc-jamming">${emoji} 【${card.jamming}】${GameData.JAMMING_DESC[card.jamming]||''}</span>`);}
        if(card.enhance) lines.push(`<span class="desc-enhance">【${card.enhance}】${GameData.ENHANCE_DESC[card.enhance]||''}</span>`);
        if(card.trait)   lines.push(`<span class="desc-trait">【${card.trait}】${GameData.TRAIT_DESC[card.trait]||''}</span>`);
        if(lines.length===0) return;
        let tip=item.querySelector('.card-hover-tip'); if(!tip){tip=document.createElement('div');tip.className='card-hover-tip';item.appendChild(tip);}
        tip.innerHTML=lines.join('<br>');
      });
      item.addEventListener('mouseleave', ()=>{ const tip=item.querySelector('.card-hover-tip');if(tip)tip.remove(); });
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
      const wrap = document.createElement('div'); wrap.style.cssText='display:flex;flex-direction:column;align-items:center;gap:6px;';
      const item = document.createElement('div'); item.className='card reveal-glow'+(card.trait?' trait-'+card.trait.replace(/[()]/g,''):'');
      item.innerHTML = `${this.cardTagsHtml(card)}${this.cardSymbolHtml(card)}${this.cardScoreHtml(card, GameState.gold)}`;
      wrap.appendChild(item);
      // #2 カード更新時は説明を常時表示（吹き出し不要でパネルとして表示）
      const lines=[];
      if(card.jamming){ const emoji=GameData.JAMMING_EMOJI[card.jamming]||''; lines.push(`<span class="desc-jamming">${emoji} 【${card.jamming}】${GameData.JAMMING_DESC[card.jamming]||''}</span>`); }
      if(card.enhance) lines.push(`<span class="desc-enhance">【${card.enhance}】${GameData.ENHANCE_DESC[card.enhance]||''}</span>`);
      if(card.trait)   lines.push(`<span class="desc-trait">【${card.trait}】${GameData.TRAIT_DESC[card.trait]||''}</span>`);
      if(lines.length>0){
        const desc=document.createElement('div'); desc.className='card-reveal-desc';
        desc.innerHTML=lines.join('<br>'); wrap.appendChild(desc);
      }
      grid.appendChild(wrap);
    });
    box.appendChild(grid); overlay.appendChild(box); return overlay;
  },
};
