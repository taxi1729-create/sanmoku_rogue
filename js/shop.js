// ショップ：#26/#27/#28/#29に対応した全面実装
const ShopScene = {
  container: null,
  offers: null,
  pickingPack: null,
  pickingCardPack: null,
  cardRevealPopup: null,
  message: null,
  activeRelicId: null, // #25 ショップ内レリック確認
  miniShop: false, // 一時撤退中のミニショップ（陳列＝レリックパック・カードフォーカス固定＋ランダム2つ）。leaveShop でリセット

  sleep(ms){ return new Promise(res => setTimeout(res, ms)); },

  render(container){
    this.container = container;
    // 一時撤退中のミニショップ：陳列は GameState.retreat.offers に保存（リロードしても同じ品揃え・購入状態で復帰する）
    if(this.miniShop){
      if(!this.offers || !this.offers.mini){
        const saved = GameState.retreat && GameState.retreat.offers;
        if(saved && saved.mini){ this.offers = saved; }
        else{
          this.offers = this.generateMiniOffers();
          if(GameState.retreat){ GameState.retreat.offers = this.offers; if(typeof App!=='undefined') App.saveGame(); }
        }
      }
    } else
    // #6 階層10：固定ラインナップの最終ショップ（更新なし）
    if(this.fixedFinalShop && !this.offers){
      this.offers = { fixedRelics:[], fixedCardPack:[], fixedUpgrade:[],
        randomSlots:[{type:'dream_card'},{type:'relic_pack'},{type:'relic_pack'},{type:'special_upgrade'}] };
    } else if(!this.offers){
      this.offers = this.generateOffers();
    }
    this.renderAll();
    TutorialOverlay.show('shop');
  },


  generateOffers(){
    const fixedRelics = [this.pickRelic(), this.pickRelic()]; // 確定ピックアップレリック2つ
    const fixedCardPack = [{ type:'card_pack', mystery:true }];
    const fixedUpgrade = [{ type:'pickup_upgrade' }];
    const randomSlots = [];
    // #3 ランダム商品の枠を8→4枠に変更
    for(let i = 0; i < 4; i++) randomSlots.push(this.makeRandomSlot());
    // #6 爆発通常アップグレード：通常の重み付き抽選とは別に、ショップ生成のたび20%の確率で1枠を確保して出現させる
    if(Math.random() < 0.2){
      const idx = Math.floor(Math.random()*randomSlots.length);
      randomSlots[idx] = { type:'normal_explosive_upgrade' };
    }
    // #5 レリック欄は廃止。ランダムスロットのpickup_relicのみ
    return { fixedRelics, fixedCardPack, fixedUpgrade, randomSlots };
  },

  // ミニショップ：レリックパック・カードフォーカスパック（固定）＋ランダム商品2つ（通常ショップと同じ重み付き抽選）
  //   品揃え更新しても構成は同じ（固定2枠は未購入で復活し、ランダム2枠だけ再抽選）
  generateMiniOffers(){
    const miniFixed = [{ type:'relic_pack', miniFixed:true }, { type:'card_focus', miniFixed:true }];
    const randomSlots = [];
    for(let i = 0; i < 2; i++){
      const slot = this.makeRandomSlot();
      // セーブに陳列を残すため、表示時に抽選する内容（ピックアップのレリック・効果）もここで確定させる
      if(slot.type==='pickup_relic') slot._relic = this.pickRelic();
      if(slot.type==='pickup_upgrade') slot._single = GlobalFunctions.randChoice(GameData.normalSelectPool().filter(e=>!e.rarity));
      randomSlots.push(slot);
    }
    return { mini:true, fixedRelics:[], fixedCardPack:[], fixedUpgrade:[], miniFixed, randomSlots };
  },

  // ランダム商品1枠の抽選：15%でピックアップカード（カードを事前抽選して保持）、それ以外は通常の重み付き抽選
  makeRandomSlot(){
    const type = GameData.rollRandomShopSlotType();
    const slot = { type };
    if(type==='pickup_card') slot._card = this.genPickupCard();
    return slot;
  },
  // ピックアップカード：？カードパックと同じ生成。5%で全効果付き・基礎点100〜150
  genPickupCard(){
    if(Math.random() < GameData.PICKUP_CARD_SPECIAL_RATE){ const c = this.genDreamCard(GlobalFunctions.randInt(100, 150)); c.pickupSpecial = true; return c; }
    return GameData.generateShopCard();
  },
  pickupCardPrice(card){ return GameState.shopPriceOf(GameData.pickupCardBasePrice(card)); },
  buyPickupCard(slot){
    if(slot.used) return;
    if(!slot._card) slot._card = this.genPickupCard();
    const card = slot._card;
    const price = this.pickupCardPrice(card);
    if(GameState.gold < price){ this.message='Gが足りません'; this.renderAll(); return; }
    GameState.gold -= price;
    slot.used = true;
    const owned = { ...card }; delete owned.pickupSpecial;
    GameState.currentDeck.push(owned);
    GlobalFunctions.recordCard(owned);
    this.message = `ピックアップカード ${GIconSym(owned.symbol)}（基礎点${owned.baseScore}）を${price}Gで購入した`;
    this.renderAll();
  },

  pickRelic(){
    const base = GameData.pickRelicBaseByGrade(); // #5 グレード別の排出確率
    // #1 魔力ステージE：ピックアップレリックには必ずレリック強化効果が付与される
    const relicEnhance = (GameState.hasMana('E') || Math.random() < GameData.RELIC_ENHANCE_RATE) ? GlobalFunctions.randChoice(GameData.RELIC_ENHANCE_POOL).id : null;
    return { ...base, relicEnhance };
  },

  // #10 修正：同一idの重複レリックでも、選択された個体（配列index）を正しく特定して売却する
  shopSellRelic(idx){
    const relic=GameState.relics[idx]; if(!relic) return;
    const ren=GameData.RELIC_ENHANCE_POOL.find(r=>r.id===relic.relicEnhance);
    const price=GameData.relicSellPrice(relic);
    // #3 ショップでの売却時もレリック効果を確実に除去する（ペイント等の永続効果が残るバグ修正）
    if(typeof GameMainScene!=='undefined') GameMainScene.removeRelicEffect(relic);
    GameState.relics.splice(idx,1);
    GameState.gold+=price;
    this.activeRelicId=null; this.packActiveRelicId=null;
    this.message=`レリック「${relic.name}」を${price}Gで売却した`;
    this.renderAll();
  },

  // #1(B) ブラックカードは重複所持不可
  canAcquireRelic(relic){
    // #1 ブラックカードは複数所持できる（効果は重複しない：shopPriceOf は所持の有無だけで半額判定）
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
      this.message = `レリックは最大${GameState.effectiveMaxRelics()}枠まで`;
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

  relicPrice(relic){ return GameState.shopPriceOf(GameData.relicBasePrice(relic)); }, // #4 グレード別価格（強化付き+3G）

  // #11 基礎点が50を超える場合+2、性質変化：ディスカードを所持している場合+5
  calcCashGain(card){ return 1 + (card.enhance ? 2 : 0) + (card.jamming ? 1 : 0) + ((card.trait&&card.trait!=='塗りつぶし(レリック)') ? 3 : 0) + (card.baseScore>50 ? 2 : 0) + (card.trait==='ディスカード' ? 5 : 0); },

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
  // カード表示はゲームメイン画面と共通（重複実装を廃止）
  cardSymbolHtml(card){ return GameMainScene.cardSymbolHtml(card); },
  cardScoreHtml(card, currentGold=0, boardBaseScore=null){ return GameMainScene.cardScoreHtml(card, currentGold, boardBaseScore); },

  // ===== Relic purchase =====
  buyRelic(i, isFixed=false){
    const relic = isFixed ? this.offers.fixedRelics[i] : this.offers.relics[i];
    if(!relic) return;
    const price = this.relicPrice(relic);
    if(GameState.gold < price){ this.message = 'Gが足りません'; this.renderAll(); return; }
    if(!this.canAcquireRelic(relic)){
      this.message = `レリックは最大${GameState.effectiveMaxRelics()}枠まで`;
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
      case 'round_boost': break; // #7 効果を「ラウンド終了時、最終加算補正+1000×現在ラウンド」に変更（購入時の即時付与は廃止）
      case 'reroll_boost': break; // #7 効果を「ビンゴ時、補正基礎点+リロール回数×10」に変更（購入時の即時付与は廃止）
      case 'hand_boost': break; // #1 効果を「ビンゴ時、手札の数×3を補正倍率に加算」に変更（購入時の即時付与は廃止）
      case 'paint': { const sym=GlobalFunctions.randChoice(GameData.SYMBOLS); GameState.currentDeck.forEach(c=>{ if(c.symbol===sym) c.trait='塗りつぶし(レリック)'; }); GameState.turnsBonus -= 4; break; } // #5 ランダムな記号1つの全カードに変更
      case 'jamming_boost': GameState.handSizeBonus-=3; break; // #7 手札上限-3に変更
      default: break;
    }
    // #22 ブラックカード即時反映
    if(relic.relicEnhance === 'ren_black') this.message = (this.message||'') + '（ショップ金額が半額になった）';
  },

  // ===== Card pack =====
  buyCardPack(slotRef){
    const price = GameState.shopPriceOf(GameData.SHOP_PRICES.cardPack);
    if(GameState.gold < price) return;
    GameState.gold -= price;
    slotRef.used = true;
    const candidates = [GameData.generateShopCard(), GameData.generateShopCard()];
    this.pickingCardPack = { candidates, packType:'card_pack' };
    this.renderAll();
  },

  pickCardPackCard(card){
    GameState.currentDeck.push(card);
    GlobalFunctions.recordCard(card);
    this.message = `${GIconSym(card.symbol)}（基礎点${card.baseScore}）を獲得した`;
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

    let pool = GameData.normalSelectPool(); // #5
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
      if(pool.length === 0) pool = GameData.normalSelectPool().filter(e => !e.rarity);
    }
    GameState.gold -= price;
    slotRef.used = true;

    const pickN = slotType === 'special' ? 2 : 3;
    const effectPool = GlobalFunctions.shuffle(pool).slice(0, Math.min(pickN, pool.length));
    const pickCount = Math.min(GameState.packCardCount(false), GameState.currentDeck.length); // #11 選択可能カード7枚（＋シカクパッシブ1・特別アップグレード）
    const cardIndexes = GlobalFunctions.shuffle(GameState.currentDeck.map((_,idx)=>idx)).slice(0, pickCount);
    this.pickingPack = { slotType, slotRef, effectPool, chosenEffect:null, cardIndexes, selectedTargets:new Set(), packType: slotType==='special'?'special_upgrade':'normal_upgrade' };
    this.renderAll();
  },

  // #6/#7 爆発通常アップグレードのパック内容を生成する共通処理（ショップ購入・スキップ報酬・クリア報酬から共通で使う）
  buildExplosiveUpgradePack(slotRef){
    let pool = GameData.normalSelectPool().filter(e => { if(e.rarity) return Math.random() < e.rarity; return true; });
    if(pool.length === 0) pool = GameData.normalSelectPool().filter(e => !e.rarity);
    const pickCount = Math.min(GameState.packCardCount(true), GameState.currentDeck.length); // #11 爆発アップグレードは9枚（＋シカクパッシブ1・特別アップグレード）
    const cardIndexes = GlobalFunctions.shuffle(GameState.currentDeck.map((_,idx)=>idx)).slice(0, pickCount);
    const targetCards = cardIndexes.map(i=>GameState.currentDeck[i]);
    // #3 選択肢を6→5つに変更（OKボタンが画面外に押し出されるのを防ぐため）
    const effectPool = GlobalFunctions.shuffle(pool).slice(0, Math.min(5, pool.length));
    return { slotType:'normal_explosive', slotRef:slotRef||null, effectPool, chosenEffect:null, cardIndexes, targetCards, selectedTargets:new Set(), picksRemaining:3, fullPool:pool, packType:'normal_explosive_upgrade' };
  },
  // #6/#3 爆発通常アップグレード：選択肢5つ・対象カード10枚・同じ購入内で最大3回まで連続して効果を選択できる。10G、ショップに20%の確率で出現
  buyExplosiveUpgrade(slot){
    const price = GameState.shopPriceOf(GameData.SHOP_PRICES.normalExplosiveUpgrade);
    if(GameState.gold < price || GameState.currentDeck.length === 0) return;
    GameState.gold -= price; slot.used = true;
    this.pickingPack = this.buildExplosiveUpgradePack(slot);
    this.renderAll();
  },

  buySpecialPackExhausted(slotRef){
    const price = GameState.shopPriceOf(GameData.SHOP_PRICES.specialUpgrade);
    if(GameState.gold < price || GameState.currentDeck.length === 0) return;
    GameState.gold -= price;
    slotRef.used = true;
    const pickCount = Math.min(GameState.packCardCount(false), GameState.currentDeck.length); // #11
    const cardIndexes = GlobalFunctions.shuffle(GameState.currentDeck.map((_,idx)=>idx)).slice(0, pickCount);
    const forcedEffect = { id:'grant_trait', name:'性質変化付与', desc:'カードを1枚選択しランダムな性質変化を付与', targetMin:1, targetMax:1 };
    const forcedEffect2 = { id:'base_up30', name:'基礎点上昇4', desc:'カードを1枚選択し、基礎点+30する', targetMin:1, targetMax:1 };
    this.pickingPack = { slotType:'special', slotRef, effectPool:[forcedEffect,forcedEffect2], chosenEffect:null, cardIndexes, selectedTargets:new Set(), packType:'special_upgrade' };
    this.renderAll();
  },

  chooseEffect(effect){ if(!this.pickingPack) return; this.pickingPack.chosenEffect = effect; this.pickingPack.selectedTargets = new Set(); this.pickBubble = null; this.renderAll(); },
  // #扇形 対象カードのタップ：選択トグル（toggleTarget）＋そのカードの効果吹き出しを表示
  onPickCardTap(idx){
    const p = this.pickingPack; if(!p) return;
    const eff = p.chosenEffect;
    const needsTarget = eff && eff.targetMax > 0;
    if(needsTarget){
      const wasPicked = p.selectedTargets.has(idx);
      // 選択を外したカードの吹き出しは閉じる。選んだ（または上限で選べなかった）カードは吹き出しを出す
      this.pickBubble = wasPicked ? null : { pack:p, idx, closed:false };
      this.toggleTarget(idx);
    }else{
      // 効果未選択・対象不要の効果のときは選択はせず、吹き出しだけ切り替える
      const same = this.pickBubble && this.pickBubble.pack===p && this.pickBubble.idx===idx && !this.pickBubble.closed;
      this.pickBubble = same ? null : { pack:p, idx, closed:false };
      this.renderAll();
    }
  },

  toggleTarget(cardIdx){
    const p = this.pickingPack; if(!p?.chosenEffect) return;
    const max = p.chosenEffect.targetMax;
    if(p.selectedTargets.has(cardIdx)) p.selectedTargets.delete(cardIdx);
    else if(p.selectedTargets.size < max) p.selectedTargets.add(cardIdx);
    this.renderAll();
  },

  confirmPack(){
    const p = this.pickingPack; if(!p?.chosenEffect) return;
    if(p.selectedTargets.size < p.chosenEffect.targetMin) return;
    const targetIdxs = Array.from(p.selectedTargets);
    // #1 このタップで選ばれた効果への参照をローカルに固定しておく（アニメーション中に別の選択肢がタップされても、
    //    後段の候補プール更新が誤って新しい選択中の効果を参照しないようにするための対策）
    const chosenEffectRef = p.chosenEffect;
    // #5 アップグレード演出：適用前のカードの見た目を保持しておく（横回転演出・換金演出用）
    const beforeSnapshots = (chosenEffectRef.id==='jam_favor' ? (p.cardIndexes||[]).filter(i=>GameState.currentDeck[i]?.jamming) : targetIdxs).map(i => ({ ...GameState.currentDeck[i] }));
    const effectId = chosenEffectRef.id;
    // #5 ジャミング優遇強化：対象はパックに並んだ選択可能カード全て
    const affected = this.applyEffect(effectId, effectId==='jam_favor' ? (p.cardIndexes||[]) : targetIdxs);
    if(p.slotType === 'special') GameState.usedSpecialEffectIds.push(effectId);
    // #2 カード変化ポップアップは画面右に非ブロッキング表示するだけで、以降の操作を待たせない（自分自身のタイマーで消える）
    if(affected?.length > 0 || effectId==='cash_in'){
      this.showRevealPopup(affected, beforeSnapshots, effectId, this._lastCashGain);
      this._lastCashGain = null;
    }
    // #6 爆発通常アップグレード：選択済みの効果を候補から取り除き、残りの選択肢の中からのみ続けて選べるようにする（新規補充はしない）
    if(p.slotType === 'normal_explosive'){
      p.cardIndexes = p.targetCards.map(c=>GameState.currentDeck.indexOf(c)).filter(idx=>idx>=0);
      p.targetCards = p.cardIndexes.map(i=>GameState.currentDeck[i]);
      p.effectPool = p.effectPool.filter(e => e !== chosenEffectRef);
      p.picksRemaining -= 1;
      if(p.picksRemaining>0 && p.cardIndexes.length>0 && p.effectPool.length>0){
        p.chosenEffect=null; p.selectedTargets=new Set();
        this.renderAll();
        return;
      }
    }
    this.pickingPack = null; this.advancePackQueue(); this.renderAll();
  },
  // カード変化を画面右枠に非ブロッキング表示する共通処理（アップグレード・ジョーカー）
  showRevealPopup(cards, before, effectId, cashGain, multBefore){
    if(this.cardRevealPopup&&this.cardRevealPopup._cleanup) this.cardRevealPopup._cleanup();
    const revealToken = {};
    this._activeRevealToken = revealToken;
    this.cardRevealPopup = { cards, effectId, before, cashGain, multBefore };
    setTimeout(() => {
      // 後から出た別のポップアップを誤って消さないよう、また既にショップを離れていたら何もしない
      if(this._activeRevealToken === revealToken && this.offers){ if(this.cardRevealPopup&&this.cardRevealPopup._cleanup) this.cardRevealPopup._cleanup(); this.cardRevealPopup = null; this.renderAll(); }
    }, 2200);
  },
  // #12 レリック効果（大爆発）などで待機しているパックを、現在のパックが終わった後に順番に開く
  packQueue:[],
  advancePackQueue(){
    while(this.packQueue&&this.packQueue.length>0){
      const item=this.packQueue.shift();
      if(GameState.currentDeck.length===0) continue;
      const pk=this.buildExplosiveUpgradePack(null); pk.relicTrigger=item.relic;
      this.pickingPack=pk; this.message=`レリック効果が発動：${item.relic}`;
      return true;
    }
    return false;
  },
  skipPack(){ this.message = 'スキップした'; this.pickingPack = null; this.advancePackQueue(); this.renderAll(); },

  // #2 ビンゴ倍率が変化する効果は、アップグレードと同様に右枠へ変化後の倍率を表示する
  applyEffect(effectId, targetIndexes){
    const multBefore = GameData.snapshotMult();
    const res = this._applyEffectCore(effectId, targetIndexes);
    if(GameData.multChanged(multBefore)) this.showRevealPopup([], [], 'mult', null, multBefore);
    return res;
  },
  _applyEffectCore(effectId, targetIndexes){
    const deck = GameState.currentDeck;
    const bump = (sym, amt) => { GameData.BINGO_MULTIPLIER_BASE[sym] += amt; };
    switch(effectId){
      case 'circle_mult':    bump('Circle', 4);    this.message = GIconSym('Circle')+'ビンゴ倍率+4'; return [];
      case 'cross_mult':     bump('Cross', 6);     this.message = GIconSym('Cross')+'ビンゴ倍率+6'; return [];
      case 'square_mult':    bump('Square', 4);    this.message = GIconSym('Square')+'ビンゴ倍率+4'; return [];
      case 'triangle_mult':  bump('Triangle', 4);  this.message = GIconSym('Triangle')+'ビンゴ倍率+4'; return [];
      // #5 ジャミング優遇強化：選択可能カードのうちジャミング付きカード全ての基礎点+4
      case 'jam_favor': { const hit=targetIndexes.map(i=>deck[i]).filter(c=>c&&c.jamming); hit.forEach(c=>{ c.baseScore+=4; }); this.message=`ジャミング優遇強化：${hit.length}枚の基礎点+4`; return hit; }
      case 'all_mult_up1':   GameData.SYMBOLS.forEach(s=>bump(s,1)); this.message = '全ビンゴ倍率+1'; return [];
      case 'number_up2':     targetIndexes.forEach(i=>{ if(deck[i]) deck[i].baseScore+=5; }); this.message = '基礎点+5×2枚'; return targetIndexes.map(i=>deck[i]).filter(Boolean);
      case 'number_up3':     targetIndexes.forEach(i=>{ if(deck[i]) deck[i].baseScore+=3; }); this.message = '基礎点+3×3枚'; return targetIndexes.map(i=>deck[i]).filter(Boolean);
      case 'base_up5':       targetIndexes.forEach(i=>{ if(deck[i]) deck[i].baseScore+=10; }); this.message = '基礎点+10'; return targetIndexes.map(i=>deck[i]).filter(Boolean);
      // #9 特別セレクト全引き後の確定選択肢に追加
      case 'base_up30':      targetIndexes.forEach(i=>{ if(deck[i]) deck[i].baseScore+=30; }); this.message = '基礎点+30'; return targetIndexes.map(i=>deck[i]).filter(Boolean);
      case 'symbol_change':  targetIndexes.forEach(i=>{ const c=deck[i]; if(!c) return; c.symbol=GlobalFunctions.randChoice(['Circle','Triangle','Square'].filter(s=>s!==c.symbol)); }); this.message = '記号変化'; return targetIndexes.map(i=>deck[i]).filter(Boolean);
      case 'cash_in': { const i=targetIndexes[0]; const c=deck[i]; if(!c) return []; const g=this.calcCashGain(c); GameState.currentDeck=deck.filter((_,idx)=>idx!==i); GameState.gold+=g; this._lastCashGain=g; this.message=`換金G+${g}`; return []; }
      case 'duplicate': { const i=targetIndexes[0]; const src=deck[i]; if(!src) return []; const clone={...src,id:'dup_'+Date.now()+'_'+Math.floor(Math.random()*100000)}; GameState.currentDeck.push(clone); this.message='複製した'; return [clone]; }
      // #21 付与効果は対象カードに現在付与されているもの以外から抽選する
      //     （副次効果は付与した種類のみ適用し、既存の強化／性質変化の即時加算が二重にかからないようにする）
      case 'grant_enhance': { const i=targetIndexes[0]; const c=deck[i]; if(!c) return []; GameData.setEnhance(c, GameData.pickDifferent(GameData.ENHANCE_NAME_POOL, c.enhance), GameState.gold); /* #5 旧強化の即時加算を戻す */ this.message=`カード強化「${c.enhance}」付与`; return [c]; }
      case 'grant_jamming': { const i=targetIndexes[0]; const c=deck[i]; if(!c) return []; c.jamming=GameData.pickDifferent(Object.keys(GameData.JAMMING_DESC), c.jamming); this.message=`ジャミング「${c.jamming}」付与`; return [c]; }
      case 'grant_trait': case 'grant_trait_rare': { const i=targetIndexes[0]; const c=deck[i]; if(!c) return []; c.trait=GameData.pickDifferent(GameData.TRAIT_NAME_POOL, c.trait); GameData.applyGrantSideEffects(c, GameState.gold, 'trait'); this.message=`性質変化「${c.trait}」付与`; return [c]; }
      case 'hand_up2':       GameState.handSizeBonus+=2; this.message='手札上限+2'; return [];
      case 'reroll_up2':     GameState.rerollCount+=2; this.message='リロール+2'; return [];
      case 'round_up1':      GameState.roundsBonus+=1; this.message='ラウンド数+1'; return [];
      case 'turn_up4':       GameState.turnsBonus+=4; this.message='ターン数+4'; return [];
      case 'relic_slot_up1': GameState.relicSlotBonus+=1; this.message='レリック上限+1'; return [];
      case 'pack_card_up2':  GameState.packCardBonus=(GameState.packCardBonus||0)+2; this.message='パック選択可能カード枚数+2'; return []; // #14
      default: return [];
    }
  },

  // ===== Random slot handler =====
  handleRandomSlot(slot){
    const price = slot.type==='pickup_relic' ? this.relicPrice(slot._relic||{}) : slot.type==='pickup_card' ? this.pickupCardPrice(slot._card) : GameState.shopPriceOf(this.slotPrice(slot.type));
    if(GameState.gold < price){ this.message='Gが足りません'; this.renderAll(); return; }
    switch(slot.type){
      case 'pickup_relic': this.buyPickupRelic(slot); break;
      case 'pickup_card': this.buyPickupCard(slot); break;
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
      case 'normal_explosive_upgrade': this.buyExplosiveUpgrade(slot); break;
      default: break;
    }
  },

  slotPrice(type){
    // ピックアップレリックは実際のレリック価格（5G、レリック強化付きは+3G）で表示・判定する
    const map = { pickup_relic:GameData.SHOP_PRICES.relic, card_pack:GameData.SHOP_PRICES.cardPack, pickup_upgrade:GameData.SHOP_PRICES.pickupUpgrade, normal_upgrade:GameData.SHOP_PRICES.normalUpgrade, special_upgrade:GameData.SHOP_PRICES.specialUpgrade, card_focus:GameData.SHOP_PRICES.cardFocus, bingo_focus:GameData.SHOP_PRICES.bingoFocus, dream_card:GameData.SHOP_PRICES.dreamCard,
      enhance_pack:GameData.SHOP_PRICES.enhancePack, jamming_pack:GameData.SHOP_PRICES.jammingPack, relic_pack:GameData.SHOP_PRICES.relicPack, normal_explosive_upgrade:GameData.SHOP_PRICES.normalExplosiveUpgrade };
    return map[type] || 3;
  },

  // #9 強化カードパック：カード3枚（全て強化付き）のうち1枚をピックアップ。4G
  buyEnhancePack(slot){
    const price = GameState.shopPriceOf(this.slotPrice('enhance_pack'));
    if(GameState.gold < price) return;
    GameState.gold -= price; slot.used = true;
    const gen = () => GameData.generateShopCard({ enhance: GlobalFunctions.randChoice(GameData.ENHANCE_NAME_POOL) });
    this.pickingCardPack = { candidates:[gen(),gen(),gen()], pickCount:1, packType:'enhance_pack' };
    this.renderAll();
  },
  // #9 ジャミングカードパック：カード3枚（全てジャミング付き）のうち1枚をピックアップ。4G
  buyJammingPack(slot){
    const price = GameState.shopPriceOf(this.slotPrice('jamming_pack'));
    if(GameState.gold < price) return;
    GameState.gold -= price; slot.used = true;
    const gen = () => GameData.generateShopCard({ jamming: GlobalFunctions.randChoice(Object.keys(GameData.JAMMING_DESC)) });
    this.pickingCardPack = { candidates:[gen(),gen(),gen()], pickCount:1, packType:'jamming_pack' };
    this.renderAll();
  },
  // #9 レリックパック：レリック3つのうち1つをピックアップ。所持レリックの売却も可能。4G。強化付与率25%
  buyRelicPack(slot){
    const price = GameState.shopPriceOf(this.slotPrice('relic_pack'));
    if(GameState.gold < price) return;
    GameState.gold -= price; slot.used = true;
    this.pickingRelicPack = { candidates:this.genRelicPackCandidates(), packType:'relic_pack' };
    this.renderAll();
  },
  genRelicPackCandidates(){
    const gen = () => { const base = GameData.pickRelicBaseByGrade(); const relicEnhance = (GameState.hasMana('E') || Math.random() < GameData.RELIC_ENHANCE_RATE) ? GlobalFunctions.randChoice(GameData.RELIC_ENHANCE_POOL).id : null; return { ...base, relicEnhance }; };
    return [gen(),gen(),gen()];
  },
  // #9 レリック「趣味レリック集め」：クリア報酬の爆発アップグレードより前に、無料のレリックパックを順番に開く
  pendingRelicPacks:0,
  openNextFreeRelicPack(){
    if((this.pendingRelicPacks||0)<=0){ this.pickingRelicPack=null; return false; }
    this.pendingRelicPacks--;
    this.pickingRelicPack = { candidates:this.genRelicPackCandidates(), free:true, relicTrigger:'趣味レリック集め', packType:'relic_pack' };
    return true;
  },
  finishRelicPack(){
    this.pickingRelicPack = null;
    this.packActiveRelicId = null; this.packRelicListOpen = false;
    this.openNextFreeRelicPack();
  },
  pickRelicPackCard(idx){
    const p = this.pickingRelicPack; if(!p) return;
    const relic = p.candidates[idx]; if(!relic) return;
    if(!this.canAcquireRelic(relic)){
      this.message = 'レリック上限です。売却してから選択してください';
      this.renderAll(); return;
    }
    GameState.relics.push(relic);
    this.applyRelicGrantEffect(relic);
    GlobalFunctions.recordRelic(relic.id);
    this.message = `レリック「${relic.name}」を獲得した`;
    this.finishRelicPack();
    this.renderAll();
  },
  skipRelicPack(){ this.message='レリックパックをスキップした'; this.finishRelicPack(); this.renderAll(); },

  buyFocusPack(slot, focus){
    GameState.gold -= GameState.shopPriceOf(this.slotPrice(slot.type));
    slot.used = true;
    // #8 カードフォーカス：カード4枚のうち2枚をピックアップ、ビンゴフォーカス：ビンゴ倍率強化3択
    if(focus === 'card'){
      const candidates = [GameData.generateShopCard(), GameData.generateShopCard(), GameData.generateShopCard(), GameData.generateShopCard()];
      this.pickingCardPack = { candidates, pickCount:2, selected:new Set(), packType:'card_focus' };
    } else {
      const effects = [
        { id:'circle_mult', name:'マルビンゴ+4', targetMin:0, targetMax:0, desc:GIconSym('Circle')+'のビンゴ倍率を+4する' },
        { id:'triangle_mult', name:'サンカクビンゴ+4', targetMin:0, targetMax:0, desc:GIconSym('Triangle')+'のビンゴ倍率を+4する' },
        { id:'square_mult', name:'シカクビンゴ+4', targetMin:0, targetMax:0, desc:GIconSym('Square')+'のビンゴ倍率を+4する' },
        { id:'cross_mult', name:'バツビンゴ+6', targetMin:0, targetMax:0, desc:GIconSym('Cross')+'のビンゴ倍率を+6する' },
        { id:'all_mult_up1', name:'全ビンゴ+1', targetMin:0, targetMax:0, desc:'全記号のビンゴ倍率を+1する' },
      ];
      const pickedEffects = GlobalFunctions.shuffle(effects).slice(0, 3);
      const cardIndexes = GlobalFunctions.shuffle(GameState.currentDeck.map((_,idx)=>idx)).slice(0, Math.min(8, GameState.currentDeck.length));
      this.pickingPack = { slotType:'bingo_focus', slotRef:slot, effectPool:pickedEffects, chosenEffect:null, cardIndexes, selectedTargets:new Set(), packType:'bingo_focus' };
    }
    this.renderAll();
  },

  // #8 ドリームカードパック：2枚のうち1枚をピックアップ（またはスキップ）
  // fixedBase：魔神イベント（金の魔神）用に基礎点を指定して生成する
  genDreamCard(fixedBase){
    const card = GameData.generateShopCard();
    card.baseScore = fixedBase!=null ? fixedBase : GlobalFunctions.randInt(100, 150); // #2 ドリームカード数値
    card.number = card.baseScore;
    card.enhance = GlobalFunctions.randChoice(GameData.ENHANCE_NAME_POOL);
    card.jamming = GlobalFunctions.randChoice(Object.keys(GameData.JAMMING_DESC));
    card.trait = GlobalFunctions.randChoice(GameData.TRAIT_NAME_POOL);
    GameData.applyGrantSideEffects(card, GameState.gold);
    return card;
  },
  buyDreamCard(slot){
    GameState.gold -= GameState.shopPriceOf(GameData.SHOP_PRICES.dreamCard);
    slot.used = true;
    const candidates = [this.genDreamCard(), this.genDreamCard()];
    this.pickingCardPack = { candidates, pickCount:1, isDream:true, packType:'dream_card' };
    this.renderAll();
  },

  // #4 ホシパッシブ1を取得するまでショップの品揃え更新は解放されない
  rerollOffers(){
    const price=GameState.shopPriceOf(GameData.SHOP_PRICES.reroll); if(GameState.gold<price||GameState.symbolPassiveTier.Hoshi<1) return;
    GameState.gold-=price;
    if(this.miniShop){
      // ミニショップ：構成は変えずにランダム2枠だけ再抽選（固定2枠は復活）。品揃えと所持Gを保存
      this.offers=this.generateMiniOffers();
      if(GameState.retreat){ GameState.retreat.offers=this.offers; App.saveGame(); }
    } else this.offers=this.generateOffers();
    this.message='品揃えを更新した'; this.renderAll();
  },

  leaveShop(){ if(typeof PackFX!=='undefined'&&PackFX.isPlaying()) PackFX.skip&&PackFX.skip(); this._fxPack=null; this.packQueue=[]; this.pendingRelicPacks=0; this.pickingRelicPack=null; this.packBreakdownOpen=false; this.packBreakdownSelected=null; if(this.cardRevealPopup&&this.cardRevealPopup._cleanup) this.cardRevealPopup._cleanup(); this.offers=null; this.fixedFinalShop=false; this.pickingPack=null; this.pickingCardPack=null; this.cardRevealPopup=null; this.message=null; this.activeRelicId=null; this.relicListOpen=false; this.packActiveRelicId=null; this.packRelicListOpen=false; GameState.lastReward=null;
    // ミニショップを出たら一時撤退を終了し、マップ（失敗したステージは未クリアのまま）へ戻る。リロードで再びミニショップに入らないよう保存
    if(this.miniShop){ this.miniShop=false; this._miniSaveSig=null; GameState.retreat=null; App.saveGame(); }
    App.showMapSelect(); },

  // ===== パック開封演出（PackFX） =====
  // 表示順（レリックパック→カードパック→アップグレード）で最初の未開封パックを返す
  pendingPackFx(){
    return [this.pickingRelicPack, this.pickingCardPack, this.pickingRelicPack?null:this.pickingPack].find(p=>p&&p.packType&&!p._opened)||null;
  },
  packFxItems(pk){
    if(pk.candidates&&pk.packType==='relic_pack') return pk.candidates.map(r=>{
      const ren=r.relicEnhance?GameData.RELIC_ENHANCE_POOL.find(x=>x.id===r.relicEnhance):null;
      return {html:`<div class="relic-card ${GameMainScene.relicGradeClass(r)}"><div class="relic-name"><span class="relic-ico">${GameIcons.relic(r)}</span>${r.name}<span class="relic-size">${GameState.relicSizeDots(r)}</span></div>${ren?`<div class="relic-enhance-tag">${ren.name}</div>`:''}</div>`};
    });
    if(pk.candidates) return pk.candidates.map(c=>({html:`<div class="card${c.trait?' trait-'+c.trait.replace(/[()]/g,''):''}">${this.cardTagsHtml(c)}${this.cardSymbolHtml(c)}${this.cardScoreHtml(c,GameState.gold)}</div>`}));
    return (pk.effectPool||[]).map(e=>({html:`<div class="pfx-chip${e.rarity?' pfx-rare':''}">${e.name}</div>`, rare:!!e.rarity}));
  },
  startPackFx(pk){
    if(typeof PackFX==='undefined'){ pk._opened=true; return; }
    if(this._fxPack===pk) return;
    this._fxPack=pk;
    // 通常／爆発通常アップグレードでレア枠が出た時はキラキラ演出を追加
    const rare=(pk.packType==='normal_upgrade'||pk.packType==='normal_explosive_upgrade')&&(pk.effectPool||[]).some(e=>e.rarity);
    PackFX.play({type:pk.packType, items:this.packFxItems(pk), rare}).then(()=>{
      pk._opened=true; if(this._fxPack===pk) this._fxPack=null;
      if(this.offers&&this.container) this.renderAll();
    });
  },

  // ===== Render =====
  // v10 #7 ミニショップでの購入・売却・パック選択確定のたびにセーブ（パック選択中は確定後にセーブ）
  miniShopAutoSave(){
    if(!this.miniShop||!GameState.retreat||!this.offers) return;
    if(this.pickingPack||this.pickingCardPack||this.pickingRelicPack||this._fxPack||(this.packQueue&&this.packQueue.length)||this.pendingRelicPacks) return;
    let sig; try{ sig=JSON.stringify([GameState.gold,GameState.currentDeck,GameState.relics,this.offers]); }catch(e){ return; }
    if(sig===this._miniSaveSig) return;
    this._miniSaveSig=sig;
    GameState.retreat.offers=this.offers;
    App.saveGame();
  },
  renderAll(){
    try{ GameData.enforceCrossAll(); }catch(e){} // v1.00 #9 バツパッシブLv3
    try{ this.miniShopAutoSave(); }catch(e){}
    // #4 タップのたびに画面が一番上に戻る不具合を防ぐ：スクロール位置を保持
    const scrollY = window.scrollY;
    // #1 カード変化アニメーション終了時などの再描画で、パック選択モーダル内のスクロール位置も保持する
    const prevPickModal=document.getElementById('pick-modal-el');
    const prevPickModalScrollTop=prevPickModal?prevPickModal.scrollTop:0;
    this.container.innerHTML = '';
    const el = document.createElement('div'); el.className = 'shop-screen';
    const r = GameState.lastReward;
    let rewardText = '';
    if(r){ const b=r.breakdown; rewardText = b ? `${r.stageName}を${r.type==='skip'?'スキップ':'クリア'}：${r.type==='skip'?`基本G${b.base}×num${b.num} ＋ レリック効果${b.relicBonus} ＋ レリック強化効果${b.relicEnhanceBonus}`:GameMainScene.clearRewardBreakdownText(b)} ＝ G+${r.gold}${r.extra?`／追加報酬：${r.extra}`:''}` : `${r.stageName}：G+${r.gold}${r.extra?`／追加報酬：${r.extra}`:''}`; }
    // #16 ショップでもゲームメイン画面と同様にパッシブ一覧を右上に表示する
    const topRow = document.createElement('div'); topRow.className='scene-top-row';
    topRow.appendChild(GameMainScene.renderPassiveBar(()=>this.renderAll()));
    el.appendChild(topRow);
    const header = document.createElement('div'); header.className='shop-header';
    // #13 ショップ文字列のすぐ下の報酬内訳は不要。デッキ確認・マップ一覧・所持Gを直下に並べる
    header.innerHTML = this.miniShop
      ? `<h2 class="mini-shop-title">${GIcon('btn_retreat',{cls:'gi-gap'})}ミニショップ<small>（一時撤退中）</small></h2>`
      : `<h2>ショップ</h2>`;
    if(this.miniShop) header.appendChild(this.renderRetreatBanner());
    // #2 ショップ画面でデッキ・マップ一覧を確認できるようにする
    const shopViewBtns = document.createElement('div'); shopViewBtns.style.cssText='display:flex;gap:8px;justify-content:center;margin-top:6px;';
    const deckBtn2 = document.createElement('button'); deckBtn2.textContent=`デッキ確認(${GameState.currentDeck.length})`; deckBtn2.addEventListener('click',()=>GameMainScene.showDeckModal('deck'));
    const mapBtn2 = document.createElement('button'); mapBtn2.textContent='マップ一覧'; mapBtn2.addEventListener('click',()=>GameMainScene.showDeckModal('map'));
    const goldSpan = document.createElement('div'); goldSpan.className='shop-gold'; goldSpan.style.cssText='align-self:center;margin:0 0 0 6px;'; goldSpan.textContent=`所持G：${GameState.gold}`;
    shopViewBtns.appendChild(deckBtn2); shopViewBtns.appendChild(mapBtn2); shopViewBtns.appendChild(goldSpan);
    header.appendChild(shopViewBtns);
    if(this.message){ const m=document.createElement('div'); m.className='shop-message'; m.innerHTML=this.message; /* message はゲーム内定数・データ由来のみ（ユーザー入力なし）。記号等のSVGアイコンを含む */ header.appendChild(m); }
    el.appendChild(header);

    // #4 ショップ内レリック表示（ゲームプレイ中と同様のカード表示＋売却）
    const relicArea = document.createElement('div'); relicArea.className='shop-relic-confirm';
    relicArea.innerHTML = `<div class="shop-section-title">所持レリック（${GameState.usedRelicSlots()}/${GameState.effectiveMaxRelics()}）</div>`;
    // #10/#11 同一idの重複レリックを個別に識別できるよう配列indexで管理する。共通のレリック列（1行固定・「+n」・一覧吹き出し）
    const pmOpen=!!(this.pickingRelicPack&&(!this.pickingRelicPack.packType||this.pickingRelicPack._opened)); // レリックパック選択中はモーダル側の所持欄を使う
    const relicRow = GameMainScene.renderRelicStrip({
      activeIdx:pmOpen?null:this.activeRelicId, emptyText:'なし', listOpen:!pmOpen&&!!this.relicListOpen,
      onPick:(i)=>{ this.relicListOpen=false; this.activeRelicId=(this.activeRelicId===i)?null:i; this.renderAll(); },
      onToggleList:()=>{ this.relicListOpen=!this.relicListOpen; if(this.relicListOpen) this.activeRelicId=null; this.renderAll(); },
    });
    relicArea.appendChild(relicRow);
    // #7 ゲームメイン画面と同じ吹き出し表示
    if(this.activeRelicId!=null && !pmOpen){
      const rp=GameMainScene.renderRelicInfoPanel({ idx:this.activeRelicId, setIdx:(i)=>{this.activeRelicId=i;}, redraw:()=>this.renderAll(), onSell:(i)=>this.shopSellRelic(i), openList:()=>{ this.activeRelicId=null; this.relicListOpen=true; this.renderAll(); } });
      if(rp) relicArea.appendChild(rp);
    }
    el.appendChild(relicArea);

    if(this.miniShop){
      // ミニショップ：常設（レリックパック・カードフォーカス）＋ランダム2枠を1段に並べる
      el.appendChild(this.renderRandomSlots([...(this.offers.miniFixed||[]), ...this.offers.randomSlots], '商品一覧'));
    } else {
    // #4 陳列：上段4枠（確定ピックアップレリック2＋？カードパック＋ピックアップアップグレード）・下段4枠（ランダム）
    const fixedSec = this.renderFixedRelicSection();
    const fixedRow = fixedSec.querySelector('.shop-row');
    this.renderFixedPackSection().querySelectorAll('.shop-slot').forEach(s=>fixedRow.appendChild(s));
    el.appendChild(fixedSec);
    // ランダム4枠
    el.appendChild(this.renderRandomSlots());
    }

    // 既存レリック販売枠


    const actions = document.createElement('div'); actions.className='shop-actions';
    // #19 パック内訳ボタン（品揃え更新の左）
    const breakdownBtn = document.createElement('button'); breakdownBtn.innerHTML=GIcon('btn_pack_breakdown',{cls:'gi-gap'})+'パック内訳'; breakdownBtn.addEventListener('click',()=>{ this.packBreakdownOpen=true; this.packBreakdownSelected=null; this.renderAll(); }); actions.appendChild(breakdownBtn);
    if(!this.fixedFinalShop){
      // #6 最終ショップ（階層10）は品揃え更新不可
      // #4 サンカクパッシブ1を取得するまでロック
      const rerollLocked=GameState.symbolPassiveTier.Hoshi<1;
      const rerollBtn = document.createElement('button'); rerollBtn.innerHTML=rerollLocked?'品揃え更新'+GIcon('btn_lock',{cls:'gi-gap-l',title:'ロック中'}):`品揃え更新（${GameState.shopPriceOf(GameData.SHOP_PRICES.reroll)}G）`; rerollBtn.disabled=rerollLocked||GameState.gold<GameState.shopPriceOf(GameData.SHOP_PRICES.reroll); rerollBtn.addEventListener('click',()=>this.rerollOffers()); actions.appendChild(rerollBtn);
    }
    const backBtn = document.createElement('button'); backBtn.textContent=this.miniShop?'マップに戻って再挑戦':'マップに戻る'; backBtn.addEventListener('click',()=>this.leaveShop()); actions.appendChild(backBtn);
    el.appendChild(actions);
    this.container.appendChild(el);
    // #19 パック内訳モーダル
    const pip = GameMainScene.renderPassiveInfoPanel(()=>this.renderAll()); if(pip) this.container.appendChild(pip); // #16
    if(this.packBreakdownOpen) this.container.appendChild(this.renderPackBreakdownModal());
    // パック開封演出：未開封のパックは、剥く演出が終わるまで選択モーダルを出さない
    const fxPack=this.pendingPackFx(); if(fxPack) this.startPackFx(fxPack);
    const opened=(pk)=>pk&&(!pk.packType||pk._opened);
    if(opened(this.pickingCardPack)) this.container.appendChild(this.renderCardPackModal());
    // #9 無料レリックパック（趣味レリック集め）を選び終えるまで、クリア報酬の爆発アップグレードは表示しない
    if(opened(this.pickingPack) && !this.pickingRelicPack){
      const pickOverlay=this.renderPickModal();
      this.container.appendChild(pickOverlay);
      const newModal=pickOverlay.querySelector('.pack-modal');
      this.layoutPickFan(pickOverlay); // #扇形 対象カードを弓形に配置（DOM挿入後に実寸で計算してからスクロール位置を戻す）
      if(newModal){ newModal.id='pick-modal-el'; newModal.scrollTop=prevPickModalScrollTop; }
      this.placePickBubble(pickOverlay);
    }
    if(opened(this.pickingRelicPack)) this.container.appendChild(this.renderRelicPackModal());
    if(this.cardRevealPopup) this.container.appendChild(this.renderCardRevealPopup());
    // #9 レリック「ジョーカー」をショップで売却した場合も、その場でカードを選べるようにする
    if(typeof GameMainScene!=='undefined' && GameMainScene.pendingJokerPick) this.container.appendChild(this.renderJokerPickModalForShop());
    window.scrollTo(0,scrollY);
  },

  // #9 レリックパック選択モーダル（所持レリックの売却も可能）
  renderRelicPackModal(){
    const p = this.pickingRelicPack;
    const overlay = document.createElement('div'); overlay.className='pack-modal-overlay';
    const modal = document.createElement('div'); modal.className='pack-modal pack-modal-wide';
    modal.innerHTML = (p.relicTrigger?`<div class="relic-trigger-banner">${GIcon('relic_trigger',{cls:'gi-gap'})}レリック効果が発動：${p.relicTrigger}（無料のレリックパック）</div>`:'') + '<h3>レリックを1つ選んでください（3つから）</h3>';
    const grid = document.createElement('div'); grid.className='pack-card-grid';
    p.candidates.forEach((relic,idx) => {
      const ren = relic.relicEnhance ? GameData.RELIC_ENHANCE_POOL.find(r=>r.id===relic.relicEnhance) : null;
      const wrap = document.createElement('div'); wrap.className='card-pick-wrap';
      const item = document.createElement('div'); item.className='relic-card pickup '+GameMainScene.relicGradeClass(relic);
      item.innerHTML = `<div class="relic-shop-badge">レリック</div><div class="relic-name"><span class="relic-ico">${GameIcons.relic(relic)}</span>${relic.name}<span class="relic-size">${GameState.relicSizeDots(relic)}</span></div>${ren?`<div class="relic-enhance-tag">${ren.name}</div>`:''}`;
      wrap.appendChild(item);
      const desc = document.createElement('div'); desc.className='card-pick-desc';
      desc.innerHTML = relic.desc + (ren?` ／【${ren.name}】${ren.desc}`:'');
      wrap.appendChild(desc);
      wrap.addEventListener('click', () => this.pickRelicPackCard(idx));
      grid.appendChild(wrap);
    });
    modal.appendChild(grid);

    const ownedTitle = document.createElement('div'); ownedTitle.className='shop-section-title'; ownedTitle.style.marginTop='14px';
    ownedTitle.textContent = `所持レリック（${GameState.usedRelicSlots()}/${GameState.effectiveMaxRelics()}）タップして売却し、ストックを確保できます`;
    modal.appendChild(ownedTitle);
    // 共通のレリック列（1行固定・「+n」・一覧吹き出し）。売却は効果詳細の吹き出しから（#10 個体＝配列indexで売却）
    const ownedRow = GameMainScene.renderRelicStrip({
      activeIdx:this.packActiveRelicId, emptyText:'なし', listOpen:!!this.packRelicListOpen,
      onPick:(i)=>{ this.packRelicListOpen=false; this.packActiveRelicId=(this.packActiveRelicId===i)?null:i; this.renderAll(); },
      onToggleList:()=>{ this.packRelicListOpen=!this.packRelicListOpen; if(this.packRelicListOpen) this.packActiveRelicId=null; this.renderAll(); },
    });
    ownedRow.classList.add('relic-strip-in-modal');
    modal.appendChild(ownedRow);

    const skipBtn = document.createElement('button'); skipBtn.textContent='スキップ'; skipBtn.style.marginTop='18px'; skipBtn.addEventListener('click', () => confirmSkip(() => this.skipRelicPack())); modal.appendChild(skipBtn);
    overlay.appendChild(modal);
    // 効果詳細の吹き出し（効果・現在の効果量・位置の移動・売却）はモーダルの上に重ねる
    if(this.packActiveRelicId!=null){
      const rp=GameMainScene.renderRelicInfoPanel({ idx:this.packActiveRelicId, setIdx:(i)=>{this.packActiveRelicId=i;}, redraw:()=>this.renderAll(), onSell:(i)=>{ this.packActiveRelicId=null; this.shopSellRelic(i); }, openList:()=>{ this.packActiveRelicId=null; this.packRelicListOpen=true; this.renderAll(); } });
      if(rp){ rp.classList.add('relic-info-over-modal'); overlay.appendChild(rp); }
    }
    return overlay;
  },

  renderFixedRelicSection(){
    const sec = document.createElement('div'); sec.className='shop-section';
    sec.innerHTML=`<h3>商品一覧</h3>`;
    const row = document.createElement('div'); row.className='shop-row shop-row-4';
    this.offers.fixedRelics.forEach((relic, i) => {
      const slot = document.createElement('div');
      if(!relic){ slot.className='shop-slot sold';slot.innerHTML='<div class="slot-title">SOLD OUT</div>';row.appendChild(slot);return; }
      const price = this.relicPrice(relic);
      const ren = relic.relicEnhance ? GameData.RELIC_ENHANCE_POOL.find(r=>r.id===relic.relicEnhance) : null;
      slot.className='shop-slot relic-shop-slot pickup-slot '+GameMainScene.relicGradeClass(relic);
      slot.innerHTML=`<div class="relic-shop-card pickup"><div class="relic-shop-badge">レリック</div><div class="relic-name"><span class="relic-ico">${GameIcons.relic(relic)}</span>${relic.name}<span class="relic-size">${GameState.relicSizeDots(relic)}</span></div>${ren?`<div class="relic-enhance-tag">${ren.name}</div>`:''}</div><div class="slot-desc">${relic.desc}${ren?`<br><span style="color:var(--gold)">【${ren.name}】${ren.desc}</span>`:''}</div><button class="buy-btn" ${GameState.gold<price||!this.canAcquireRelic(relic)?'disabled':''}>購入（${price}G）</button>`;
      slot.querySelector('.buy-btn').addEventListener('click', () => this.buyRelic(i, true));
      row.appendChild(slot);
    });
    sec.appendChild(row); return sec;
  },

  renderFixedPackSection(){
    const sec = document.createElement('div'); sec.className='shop-section';
    sec.innerHTML = '';
    const row = document.createElement('div'); row.className='shop-row shop-row-4';
    // カードパック
    // #7 階層10の最終ショップは固定枠（？カードパック・ピックアップアップグレード）が無いので何も描かない（以前はここで例外→画面が真っ暗）
    if(!this.offers.fixedCardPack||!this.offers.fixedCardPack[0]){ sec.appendChild(row); return sec; }
    const cpSlot = this.offers.fixedCardPack[0];
    const cpEl = document.createElement('div'); cpEl.className='shop-slot'+(cpSlot.used?' sold':'');
    if(cpSlot.used){ cpEl.innerHTML='<div class="slot-title">SOLD OUT</div>'; }
    else{
      const price = GameState.shopPriceOf(GameData.SHOP_PRICES.cardPack);
      cpEl.innerHTML=`${PackFX.packHtml('card_pack',{size:'mini'})}<div class="slot-title">${GIcon('pack_card')}？カードパック</div><div class="slot-desc">2枚から1枚選択</div><button class="buy-btn" ${GameState.gold<price?'disabled':''}>購入（${price}G）</button>`;
      cpEl.querySelector('.buy-btn').addEventListener('click', () => this.buyCardPack(cpSlot));
    }
    row.appendChild(cpEl);
    // ピックアップアップグレード（#5 1つの効果を抽選して陳列・即時発動）
    if(!this.offers.fixedUpgrade[0]._single){
      const pool=GameData.normalSelectPool().filter(e=>!e.rarity);
      this.offers.fixedUpgrade[0]._single=GlobalFunctions.randChoice(pool);
    }
    const puSlot = this.offers.fixedUpgrade[0];
    const puEl = document.createElement('div'); puEl.className='shop-slot pickup-slot'+(puSlot.used?' sold':'');
    if(puSlot.used){ puEl.innerHTML='<div class="slot-title">SOLD OUT</div>'; }
    else{
      const price = GameState.shopPriceOf(GameData.SHOP_PRICES.pickupUpgrade);
      const eff = puSlot._single;
      puEl.innerHTML=`<div class="slot-title">${GIcon('shop_pickup_upgrade')}ピックアップ<br>${eff.name}</div><div class="slot-desc">${eff.desc}</div><button class="buy-btn" ${GameState.gold<price?'disabled':''}>購入（${price}G）</button>`;
      puEl.querySelector('.buy-btn').addEventListener('click', () => {
        if(GameState.gold < price) return;
        GameState.gold -= price; puSlot.used = true;
        if(eff.targetMax === 0 && !eff.showCards){
          this.applyEffect(eff.id, []);
          this.renderAll();
        } else {
          const cardIndexes=GlobalFunctions.shuffle(GameState.currentDeck.map((_,idx)=>idx)).slice(0,Math.min(GameState.packCardCount(false),GameState.currentDeck.length)); // #11
          this.pickingPack={slotType:'pickup_single',slotRef:puSlot,effectPool:[eff],chosenEffect:eff,cardIndexes,selectedTargets:new Set()};
          this.renderAll();
        }
      });
    }
    row.appendChild(puEl);
    sec.appendChild(row); return sec;
  },

  // 一時撤退中の案内（撤退したステージ・獲得した撤退G・残機）
  renderRetreatBanner(){
    const rt = GameState.retreat || {};
    const b = document.createElement('div'); b.className='retreat-banner';
    b.innerHTML = `<div class="retreat-banner-main"><span class="retreat-banner-stage">第${rt.floor||GameState.currentFloor}階層「${rt.stageName||'ステージ'}」から撤退</span>${rt.gold!=null?`<span class="retreat-banner-gold">撤退G +${rt.gold}</span>`:''}</div>`
      + `<div class="retreat-banner-lives"><span class="lives-label">残機</span><span class="lives-badge">${GameState.livesIconsHtml()}</span><span class="retreat-banner-note">体制を整えて再挑戦しよう</span></div>`;
    return b;
  },

  renderRandomSlots(slotsArg, titleArg){
    const sec = document.createElement('div'); sec.className='shop-section'+(slotsArg?' mini-shop-section':'');
    sec.innerHTML = `<h3>${titleArg||'ランダム商品'}</h3>`;
    const row = document.createElement('div'); row.className='shop-row shop-row-4';
    (slotsArg||this.offers.randomSlots).forEach((slot) => {
      const el = document.createElement('div');
      const isDream = slot.type === 'dream_card';
      const isSpecial = slot.type === 'special_upgrade';
      const price = GameState.shopPriceOf(this.slotPrice(slot.type));
      const typeName = (GameData.SHOP_RANDOM_TYPES.find(t=>t.id===slot.type)||{name:slot.type,icon:''});
      if(slot.used){ el.className='shop-slot sold'; el.innerHTML='<div class="slot-title">SOLD OUT</div>'; row.appendChild(el); return; }
      el.className='shop-slot'+(isDream?' dream-slot':'')+(isSpecial?' special-slot':'');

      // #1/#4 pickup_relic: レリックを事前抽選して表示
      if(slot.type==='pickup_relic'){
        if(!slot._relic) slot._relic=this.pickRelic();
        const r=slot._relic;
        const ren=r.relicEnhance?GameData.RELIC_ENHANCE_POOL.find(x=>x.id===r.relicEnhance):null;
        const price=this.relicPrice(r);
        el.className+=' pickup-slot '+GameMainScene.relicGradeClass(r);
        el.innerHTML=`<div class="slot-title"><div class="relic-shop-badge">レリック</div><span class="relic-ico">${GameIcons.relic(r)}</span>${r.name}<span class="relic-size">${GameState.relicSizeDots(r)}</span>${ren?`<span class="relic-enhance-tag"> ${ren.name}</span>`:''}</div><div class="slot-desc">${r.desc}${ren?`<br><span style="color:var(--gold)">【${ren.name}】${ren.desc}</span>`:''}</div><button class="buy-btn" ${GameState.gold<price||!this.canAcquireRelic(r)?'disabled':''}>購入（${price}G）</button>`;
        el.querySelector('.buy-btn').addEventListener('click', () => this.buyPickupRelic(slot));
        row.appendChild(el); return;
      }

      // ピックアップカード：事前抽選したカードを陳列（価格＝1G＋ジャミング2G＋強化4G＋性質変化6G）
      if(slot.type==='pickup_card'){
        if(!slot._card) slot._card=this.genPickupCard();
        const c=slot._card;
        const cPrice=this.pickupCardPrice(c);
        const lines=[];
        if(c.jamming) lines.push(`<span class="desc-jamming">${GameData.JAMMING_EMOJI?.[c.jamming]||''}【${c.jamming}】${GameData.JAMMING_DESC[c.jamming]||''}</span>`);
        if(c.enhance) lines.push(`<span class="desc-enhance">【${c.enhance}】${GameData.ENHANCE_DESC[c.enhance]||''}</span>`);
        if(c.trait)   lines.push(`<span class="desc-trait">【${c.trait}】${GameData.TRAIT_DESC[c.trait]||''}</span>`);
        el.className+=' pickup-slot pickup-card-slot'+(c.pickupSpecial?' dream-slot':'');
        el.innerHTML=`<div class="slot-title">${GIcon('pack_card')}ピックアップカード</div>`
          +`<div class="pickup-card-face"><div class="card${c.trait?' trait-'+c.trait.replace(/[()]/g,''):''}">${this.cardTagsHtml(c)}${this.cardSymbolHtml(c)}${this.cardScoreHtml(c,GameState.gold)}</div></div>`
          +`<div class="slot-desc">基礎点${c.baseScore}${lines.length?'<br>'+lines.join('<br>'):''}</div>`
          +`<button class="buy-btn" ${GameState.gold<cPrice?'disabled':''}>購入（${cPrice}G）</button>`;
        el.querySelector('.buy-btn').addEventListener('click', () => this.buyPickupCard(slot));
        row.appendChild(el); return;
      }

      // #1 pickup_upgrade: 1効果を事前抽選して表示
      if(slot.type==='pickup_upgrade'){
        if(!slot._single){
          const pool=GameData.normalSelectPool().filter(e=>!e.rarity);
          slot._single=GlobalFunctions.randChoice(pool);
        }
        const eff=slot._single;
        el.className+=' pickup-slot';
        el.innerHTML=`<div class="slot-title">${GIcon('shop_pickup_upgrade')}ピックアップ<br>${eff.name}</div><div class="slot-desc">${eff.desc}</div><button class="buy-btn" ${GameState.gold<price?'disabled':''}>購入（${price}G）</button>`;
        el.querySelector('.buy-btn').addEventListener('click', () => {
          if(GameState.gold<price) return;
          GameState.gold-=price; slot.used=true;
          if(eff.targetMax===0&&!eff.showCards){ this.applyEffect(eff.id,[]); this.renderAll(); }
          else{
            const ci=GlobalFunctions.shuffle(GameState.currentDeck.map((_,i)=>i)).slice(0,Math.min(GameState.packCardCount(false),GameState.currentDeck.length)); // #11
            this.pickingPack={slotType:'pickup_single',slotRef:slot,effectPool:[eff],chosenEffect:eff,cardIndexes:ci,selectedTargets:new Set()};
            this.renderAll();
          }
        });
        row.appendChild(el); return;
      }

      const packGfx=(typeof PackFX!=='undefined'&&PackFX.EMOJI[slot.type])?PackFX.packHtml(slot.type,{size:'mini'}):'';
      el.innerHTML=`${packGfx}<div class="slot-title">${typeName.icon?GIcon(typeName.icon):''}${typeName.name}</div><div class="slot-desc">${this.slotDesc(slot.type)}</div><button class="buy-btn" ${GameState.gold<price?'disabled':''}>購入（${price}G）</button>`;
      el.querySelector('.buy-btn').addEventListener('click', () => this.handleRandomSlot(slot));
      row.appendChild(el);
    });
    // ミニショップ：常設／ランダムの区別タグ
    if(slotsArg) Array.from(row.children).forEach((el,i)=>{ const sl=slotsArg[i]; if(!sl||sl.used) return; const t=document.createElement('div'); t.className='mini-slot-tag'+(sl.miniFixed?' fixed':''); t.textContent=sl.miniFixed?'常設':'ランダム'; el.insertBefore(t, el.firstChild); });
    sec.appendChild(row); return sec;
  },

  slotDesc(type){
    const nN=GameState.packCardCount(false), nE=GameState.packCardCount(true); // #11
    const descs = { pickup_relic:'ランダムなレリックを購入', pickup_card:'陳列されたカード1枚を購入',card_pack:'カード2枚から1枚選択', pickup_upgrade:`通常セレクトから3つ・対象カード${nN}枚`, normal_upgrade:`通常セレクトから3つ・対象カード${nN}枚`, special_upgrade:`特別セレクトから2つ・対象カード${nN}枚`, card_focus:'カード4枚から2枚ピックアップ', bingo_focus:'ビンゴ倍率強化を選択', dream_card:'カード2枚から1枚ピックアップ（全効果付き）',
      enhance_pack:'強化付きカード3枚から1枚選択', jamming_pack:'ジャミング付きカード3枚から1枚選択', relic_pack:'レリック3つから1つ選択・売却してストック確保も可能',
      normal_explosive_upgrade:`通常セレクトから5つ・対象カード${nE}枚・5つの中から最大3つまで選択（補充なし）` };
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
    // スワイプ複数選択
    if(pickCount>1 && typeof SwipeSelect!=='undefined'){
      grid.classList.add('swipe-select-zone');
      Array.from(grid.children).forEach((w,i)=>{ w.dataset.idx=i; });
      SwipeSelect.attach(grid,{
        item:'.card-pick-wrap', getKey:el=>{ const v=parseInt(el.dataset.idx,10); return isNaN(v)?null:v; },
        isSelected:k=>p.selected.has(k), canSelect:()=>p.selected.size<pickCount,
        set:(k,on)=>{ if(on) p.selected.add(k); else p.selected.delete(k); },
        paint:(el,on)=>el.classList.toggle('picked',on),
        commit:()=>this.renderAll(),
      });
    }
    if(pickCount>1){
      const confirmBtn = document.createElement('button'); confirmBtn.textContent=`決定（${p.selected.size}/${pickCount}）`; confirmBtn.style.marginTop='12px'; confirmBtn.disabled = p.selected.size < pickCount;
      confirmBtn.addEventListener('click', () => this.confirmCardPackMulti());
      modal.appendChild(confirmBtn);
    }
    const skipBtn = document.createElement('button'); skipBtn.textContent='スキップ'; skipBtn.style.marginTop='18px'; skipBtn.addEventListener('click', () => confirmSkip(() => this.skipCardPack())); modal.appendChild(skipBtn);
    overlay.appendChild(modal); return overlay;
  },

  // #19 パック内訳一覧・詳細モーダル
  renderPackBreakdownModal(){
    const overlay=document.createElement('div'); overlay.className='pack-modal-overlay';
    overlay.addEventListener('click',(e)=>{ if(e.target===overlay){ this.packBreakdownOpen=false; this.packBreakdownSelected=null; this.renderAll(); } });
    // #枠固定 モーダルの大きさは固定。パック一覧と詳細表示エリアを分離し、詳細は固定高さのエリア内でスクロールする。
    // パックのタップでは renderAll せずにその場で詳細だけ差し替える（一覧のスクロール位置も動かない）
    const modal=document.createElement('div'); modal.className='pack-modal pack-breakdown-modal';
    modal.addEventListener('click',(e)=>e.stopPropagation());
    modal.innerHTML='<h3>'+GIcon('btn_pack_breakdown',{cls:'gi-gap'})+'パック内訳</h3><div class="slot-desc pack-breakdown-hint">パックをタップすると中身の確率を表示します</div>';
    const list=document.createElement('div'); list.className='pack-breakdown-list';
    const detail=document.createElement('div'); detail.className='pack-breakdown-detail';
    const showDetail=()=>{
      const sel=GameData.PACK_LIST.find(p=>p.id===this.packBreakdownSelected);
      list.querySelectorAll('.pack-breakdown-item').forEach(b=>b.classList.toggle('active',b.dataset.pack===this.packBreakdownSelected));
      detail.innerHTML = sel
        ? `<div class="pack-breakdown-detail-title">${sel.label}</div>`+GameData.getPackBreakdown(sel.id).map(l=>`<div>${l}</div>`).join('')
        : '<div class="pack-breakdown-empty">上の一覧からパックを選んでください</div>';
      detail.scrollTop=0;
    };
    GameData.PACK_LIST.forEach(p=>{
      const btn=document.createElement('button'); btn.className='pack-breakdown-item'; btn.dataset.pack=p.id;
      btn.textContent=p.label;
      btn.addEventListener('click',()=>{ this.packBreakdownSelected=(this.packBreakdownSelected===p.id)?null:p.id; showDetail(); });
      list.appendChild(btn);
    });
    showDetail();
    modal.appendChild(list);
    modal.appendChild(detail);
    const closeBtn=document.createElement('button'); closeBtn.textContent='閉じる'; closeBtn.style.marginTop='12px';
    closeBtn.addEventListener('click',()=>{ this.packBreakdownOpen=false; this.packBreakdownSelected=null; this.renderAll(); });
    modal.appendChild(closeBtn);
    overlay.appendChild(modal);
    return overlay;
  },

  // #9 レリック「ジョーカー」をショップで売却した場合の、ショップ画面用カード選択モーダル
  renderJokerPickModalForShop(){
    const overlay=document.createElement('div'); overlay.className='pack-modal-overlay';
    const modal=document.createElement('div'); modal.className='pack-modal pack-modal-wide';
    const gm=GameMainScene;
    if(gm.jokerSelectedCard){
      const c=gm.jokerSelectedCard;
      modal.innerHTML='<h3>'+GIcon('joker',{cls:'gi-gap'})+'ジョーカー：カードの記号を選んでください</h3><div class="slot-desc" style="margin-bottom:10px;">選んだカードは基礎点+10され、選んだ記号に変わります</div>';
      const prev=document.createElement('div'); prev.style.cssText='display:flex;justify-content:center;margin-bottom:12px;';
      const pel=document.createElement('div'); pel.className='card'+(c.trait?' trait-'+c.trait.replace(/[()]/g,''):'');
      pel.innerHTML=`${this.cardTagsHtml(c)}${this.cardSymbolHtml(c)}${this.cardScoreHtml(c,GameState.gold)}`;
      prev.appendChild(pel); modal.appendChild(prev);
      const row=document.createElement('div'); row.className='pack-modal-actions';
      ['Circle','Triangle','Square','Cross'].forEach(sym=>{
        const btn=document.createElement('button'); btn.className=`sym-${sym}`; btn.style.fontSize='22px'; btn.innerHTML=GameData.SYMBOL_LABEL[sym]; btn.setAttribute('aria-label',GameData.SYMBOL_TEXT[sym]);
        btn.addEventListener('click',()=>{
          const before={...c};
          c.baseScore+=10; c.symbol=sym;
          gm.pendingJokerPick=null; gm.jokerSelectedCard=null;
          this.message=`ジョーカー：選んだカードの基礎点+10、記号が${GIconSym(sym)}に変化`;
          this.showRevealPopup([c],[before],'joker'); // アップグレードと同様に右枠へ変化を表示
          this.renderAll();
        });
        row.appendChild(btn);
      });
      modal.appendChild(row);
    }else{
      modal.innerHTML='<h3>'+GIcon('joker',{cls:'gi-gap'})+'ジョーカー：好きなカードを1枚選んでください</h3><div class="slot-desc" style="margin-bottom:10px;">選んだカードは基礎点+10され、記号を選び直せます</div>';
      const grid=document.createElement('div'); grid.className='pack-card-grid'; grid.style.maxHeight='55vh'; grid.style.overflowY='auto';
      GameState.currentDeck.forEach(card=>{
        const wrap=document.createElement('div'); wrap.className='card-pick-wrap';
        const el=document.createElement('div'); el.className='card'+(card.trait?' trait-'+card.trait.replace(/[()]/g,''):'');
        el.innerHTML=`${this.cardTagsHtml(card)}${this.cardSymbolHtml(card)}${this.cardScoreHtml(card,GameState.gold)}`;
        el.addEventListener('click',()=>{ gm.jokerSelectedCard=card; this.renderAll(); });
        wrap.appendChild(el); grid.appendChild(wrap);
      });
      modal.appendChild(grid);
    }
    overlay.appendChild(modal);
    return overlay;
  },

  // #7 アップグレードパックのカードUIを修正
  renderPickModal(){
    const p = this.pickingPack;
    const overlay = document.createElement('div'); overlay.className='pack-modal-overlay';
    const modal = document.createElement('div'); modal.className='pack-modal pack-modal-wide pick-fan-modal';
    const isExplosive = p.slotType === 'normal_explosive';
    const relicBanner = p.relicTrigger ? `<div class="relic-trigger-banner">${GIcon('relic_trigger',{cls:'gi-gap'})}レリック効果が発動：${p.relicTrigger}</div>` : '';
    modal.innerHTML = relicBanner + (isExplosive
      ? `<h3>${GIcon('pack_explosive',{cls:'gi-gap'})}爆発通常アップグレード（残り選択回数：${p.picksRemaining}/3）</h3>`
      : '<h3>効果を選択してください</h3>');
    // #7 ビンゴ倍率表示パネルを選択肢一覧の左側に配置する（横並びのラッパーで囲む）
    const topRow = document.createElement('div'); topRow.className='pack-modal-top-row';
    const multPanel = document.createElement('div'); multPanel.className='modal-mult-panel';
    const multRows = GameData.SYMBOLS.map(s=>{
      const base=GameData.BINGO_MULTIPLIER_BASE[s]+GameData.CORRECTION_MULTIPLIER;
      const quad=Math.round(GameData.BINGO_MULTIPLIER_BASE[s]*GameData.baseLineFactor('quad')+GameData.CORRECTION_MULTIPLIER);
      const f=v=>v>=0?'+'+Math.round(v):String(Math.round(v));
      return `<tr><td class="sym-${s}">${GameData.SYMBOL_LABEL[s]}</td><td>${f(base)}</td><td>${f(quad)}</td></tr>`;
    }).join('');
    multPanel.innerHTML=`<div class="mult-legend-modal"><b>ビンゴ倍率</b><table><tr><th></th><th>基礎</th><th>4列</th></tr>${multRows}</table>${GameData.manaNoteText()?`<div class="mult-mana-note">${GameData.manaNoteText()}</div>`:''}</div>`;
    topRow.appendChild(multPanel);
    const list = document.createElement('div'); list.className='effect-choice-list';
    p.effectPool.forEach(eff => {
      const item = document.createElement('div');
      item.className='effect-choice-item'+(p.chosenEffect===eff?' chosen':'');
      item.innerHTML = `<div class="slot-title">${eff.name}</div><div class="slot-desc">${eff.desc}</div>`;
      item.addEventListener('click', () => this.chooseEffect(eff));
      list.appendChild(item);
    });
    topRow.appendChild(list);
    modal.appendChild(topRow);
    const eff = p.chosenEffect;
    const needsTarget = eff && eff.targetMax > 0;
    const hint = document.createElement('div'); hint.className='shop-message'; hint.style.margin='12px 0 8px';
    if(!eff) hint.textContent='上から効果を選んでください';
    else if(needsTarget) hint.textContent=`カードを${eff.targetMax}枚選択（${p.selectedTargets.size}/${eff.targetMax}）`;
    else if(eff.id==='jam_favor') hint.textContent='下のカードのうちジャミング付きカード全ての基礎点+4（決定ボタンで発動）';
    else hint.textContent='対象カードの選択不要（決定ボタンで発動）';
    modal.appendChild(hint);
    // #扇形 対象カードはゲームメイン画面の手札と同じ弓形展開（段分けと角度は描画後に layoutPickFan で実寸計算）
    const grid = document.createElement('div'); grid.className='pack-card-grid fan-grid'+((!eff||!needsTarget)?' grid-disabled':'');
    p.cardIndexes.forEach(idx => {
      const card = GameState.currentDeck[idx]; if(!card) return;
      const slot = document.createElement('div'); slot.className='card-wrapper fan-slot'; slot.dataset.idx=idx;
      const item = document.createElement('div');
      item.className='card pack-card-item'+(p.selectedTargets.has(idx)?' picked':'')+(card.trait?` trait-${card.trait.replace(/[()]/g,'')}`:'');
      let sellBadge = '';
      if(eff?.id==='cash_in'){ const g=this.calcCashGain(card); sellBadge=`<div class="sell-badge">売却+${g}G</div>`; }
      item.innerHTML = `${sellBadge}${this.cardTagsHtml(card)}${this.cardSymbolHtml(card)}${this.cardScoreHtml(card)}`;
      item.addEventListener('click', () => this.onPickCardTap(idx));
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
      slot.appendChild(item);
      grid.appendChild(slot);
    });
    modal.appendChild(grid);
    // スワイプ複数選択：対象を複数選べる効果のとき、なぞったカードをまとめて選択／解除
    if(needsTarget && eff.targetMax>1 && typeof SwipeSelect!=='undefined'){
      grid.classList.add('swipe-select-zone');
      SwipeSelect.attach(grid,{
        item:'.fan-slot', getKey:el=>{ const v=parseInt(el.dataset.idx,10); return isNaN(v)?null:v; },
        isSelected:k=>p.selectedTargets.has(k), canSelect:()=>p.selectedTargets.size<eff.targetMax,
        set:(k,on)=>{ if(on) p.selectedTargets.add(k); else p.selectedTargets.delete(k); },
        paint:(el,on)=>{ const c=el.querySelector('.pack-card-item'); if(c) c.classList.toggle('picked',on); },
        commit:()=>{ this.pickBubble=null; this.renderAll(); },
      });
    }
    // #扇形 タップしたカードの効果吹き出し（×で吹き出しだけ閉じる。選択状態はそのまま）
    const pb = this.pickBubble;
    if(pb && pb.pack===p && !pb.closed && GameState.currentDeck[pb.idx] && p.cardIndexes.includes(pb.idx)){
      const bubble = GameMainScene.cardBubbleEl(GameState.currentDeck[pb.idx], ()=>{ pb.closed=true; }, 'pick-card-bubble', pb); // pb は1回の表示ごとに作り直されるので自動フェードのタイマーキーに使う
      overlay.appendChild(bubble);
      // モーダル内スクロールに吹き出しを追従させる
      modal.addEventListener('scroll', ()=>this.placePickBubble(overlay), {passive:true});
    }
    const btnRow = document.createElement('div'); btnRow.className='pack-modal-actions';
    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = (isExplosive && p.picksRemaining>1) ? '決定して次へ' : '決定';
    confirmBtn.disabled=!eff||(needsTarget&&p.selectedTargets.size<eff.targetMin); confirmBtn.addEventListener('click',()=>this.confirmPack()); btnRow.appendChild(confirmBtn);
    const skipBtn = document.createElement('button'); skipBtn.textContent='スキップ'; skipBtn.addEventListener('click',()=>confirmSkip(()=>this.skipPack())); btnRow.appendChild(skipBtn);
    modal.appendChild(btnRow);
    overlay.appendChild(modal); return overlay;
  },

  // #扇形 対象カードを弓形に並べる。1段で重なりすぎる（見える幅がカード幅の約55%未満）なら2段に分け、段ごとに弓形にする
  layoutPickFan(root){
    const grid = (root||document).querySelector('.pack-card-grid.fan-grid'); if(!grid) return;
    const slots = Array.from(grid.querySelectorAll('.fan-slot')); const n = slots.length; if(!n) return;
    grid.querySelectorAll('.fan-line').forEach(l=>{ while(l.firstChild) grid.appendChild(l.firstChild); l.remove(); });
    const width = grid.clientWidth; const card0 = slots[0].firstElementChild||slots[0]; const cw = card0.offsetWidth, ch = card0.offsetHeight; // 段に振り分ける前のスロットは横に伸びているのでカード本体で測る
    if(!width || !cw) return;
    const pad = Math.ceil(ch*Math.sin(12*Math.PI/180))+4;
    const fits = k => { const per=Math.ceil(n/k); return per<=1 || (width-2*pad-cw)/(per-1) >= cw*0.55; };
    const rows = (n>6 && !fits(1)) ? 2 : 1;
    const per = Math.ceil(n/rows);
    for(let r=0;r<rows;r++){
      const line = document.createElement('div'); line.className='fan-line pick-fan-line';
      slots.slice(r*per,(r+1)*per).forEach(s=>line.appendChild(s));
      grid.appendChild(line);
    }
    grid.querySelectorAll('.fan-line').forEach(line=>GameMainScene.fanLayoutLine(line,{width,maxDeg:12}));
    if(!this._pickFanResize){ this._pickFanResize=true; window.addEventListener('resize',()=>{ const ov=document.querySelector('#pick-modal-el'); if(ov){ this.layoutPickFan(ov.parentElement); this.placePickBubble(ov.parentElement); } }); }
  },
  placePickBubble(root){
    const pb=this.pickBubble; const panel=(root||document).querySelector('.pick-card-bubble'); if(!panel||!pb) return;
    const slot=(root||document).querySelector(`.pack-card-grid.fan-grid .fan-slot[data-idx="${pb.idx}"] .pack-card-item`);
    GameMainScene.placeCardBubble(panel,slot);
  },

  renderCardRevealPopup(){
    // #7 画面右側に非ブロッキングで表示し、裏のショップ操作と並行して見られるようにする
    const overlay = document.createElement('div'); overlay.className='card-reveal-toast';
    const p = this.cardRevealPopup;
    // #3 ポップ表示後に、プレイヤーがスクロールや他のアイテムのタップなど画面操作をしている間は、変化中のカードと枠を50%の不透明度にする
    if(p.interrupted) overlay.classList.add('interrupted');
    if(!p._listening){
      p._listening=true;
      const markInterrupted=(e)=>{
        // ポップアップ自身へのタップは「他の操作」に含めない
        if(e&&e.type==='pointerdown'&&e.target&&e.target.closest&&e.target.closest('.card-reveal-toast')) return;
        p.interrupted=true;
        const el=document.querySelector('.card-reveal-toast');
        if(el) el.classList.add('interrupted');
      };
      window.addEventListener('scroll',markInterrupted,{passive:true,capture:true});
      document.addEventListener('pointerdown',markInterrupted,true);
      // ポップアップが消えたらリスナーを外す
      p._cleanup=()=>{ window.removeEventListener('scroll',markInterrupted,true); document.removeEventListener('pointerdown',markInterrupted,true); };
    }
    const box = document.createElement('div'); box.className='card-reveal-popup';
    const effectId = p.effectId;
    const before = p.before || [];
    const grid = document.createElement('div'); grid.className='pack-card-grid';

    // #2 ビンゴ倍率の変化
    if(effectId === 'mult'){
      box.innerHTML = GameData.multChangeHtml(p.multBefore||{});
      overlay.appendChild(box); return overlay;
    }
    // #5 換金：カードがGに変わる演出（横回転してG面を見せる）
    if(effectId === 'cash_in'){
      box.innerHTML = '<div class="gr-label">換金しました</div>';
      const b = before[0];
      if(b){
        const wrap = document.createElement('div'); wrap.className='cash-flip-wrap';
        wrap.innerHTML = `<div class="cash-flip-inner">
          <div class="cash-flip-face cash-flip-front"><div class="card${b.trait?' trait-'+b.trait.replace(/[()]/g,''):''}">${this.cardTagsHtml(b)}${this.cardSymbolHtml(b)}${this.cardScoreHtml(b)}</div></div>
          <div class="cash-flip-face cash-flip-back"><div class="gold-coin-card">+${p.cashGain||0}G</div></div>
        </div>`;
        grid.appendChild(wrap);
      }
      box.appendChild(grid); overlay.appendChild(box); return overlay;
    }

    // #5 複製：カードが2枚に分裂する演出
    if(effectId === 'duplicate'){
      box.innerHTML = '<div class="gr-label">カードが複製されました</div>';
      const b = before[0]; const dup = p.cards[0];
      if(b && dup){
        const wrap = document.createElement('div'); wrap.className='dup-anim-wrap';
        const mk=(c,cls)=>{ const d=document.createElement('div'); d.className='card dup-anim-card '+cls+(c.trait?' trait-'+c.trait.replace(/[()]/g,''):''); d.innerHTML=`${this.cardTagsHtml(c)}${this.cardSymbolHtml(c)}${this.cardScoreHtml(c)}`; return d; };
        wrap.appendChild(mk(b,'dup-left'));
        wrap.appendChild(mk(dup,'dup-right'));
        grid.appendChild(wrap);
      }
      box.appendChild(grid); overlay.appendChild(box); return overlay;
    }

    // #5 それ以外（強化付与・数値変化・記号変化など）：カードの位置を変えず横向きに一回転し、変化後の姿を見せる
    box.innerHTML = '<div class="gr-label">カードが更新されました</div>';
    p.cards.forEach((card,i) => {
      const b = before[i] || card;
      const wrap = document.createElement('div'); wrap.style.cssText='display:flex;flex-direction:column;align-items:center;gap:6px;';
      const flip = document.createElement('div'); flip.className='flip-card-wrap';
      flip.innerHTML = `<div class="flip-card-inner">
        <div class="flip-card-face flip-card-front"><div class="card${b.trait?' trait-'+b.trait.replace(/[()]/g,''):''}">${this.cardTagsHtml(b)}${this.cardSymbolHtml(b)}${this.cardScoreHtml(b)}</div></div>
        <div class="flip-card-face flip-card-back"><div class="card reveal-glow${card.trait?' trait-'+card.trait.replace(/[()]/g,''):''}">${this.cardTagsHtml(card)}${this.cardSymbolHtml(card)}${this.cardScoreHtml(card, GameState.gold)}</div></div>
      </div>`;
      wrap.appendChild(flip);
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
