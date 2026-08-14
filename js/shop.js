// ショップ：レリック／カードパック／通常・特別アップグレードパックの購入、所持G管理
const ShopScene = {
  container: null,
  offers: null,
  pickingPack: null,       // アップグレードパック開封中の選択状態
  pickingCardPack: null,   // カードパック開封中の選択状態
  cardRevealPopup: null,   // 強化結果の2秒プレビュー表示
  message: null,

  sleep(ms){ return new Promise(res => setTimeout(res, ms)); },

  render(container){
    this.container = container;
    if(!this.offers) this.offers = this.generateOffers();
    this.renderAll();
  },

  generateOffers(){
    return {
      relics: [this.pickRelic(), this.pickRelic(), this.pickRelic(), this.pickRelic(), this.pickRelic(), this.pickRelic()],
      cardPacks: [{ mystery:true }, { mystery:true }, { mystery:true }, { mystery:true }],
      normalUpgrades: [{ label:'通常アップグレード' }, { label:'通常アップグレード' }, { label:'通常アップグレード' }, { label:'通常アップグレード' }],
      specialUpgrades: [{ label:'特別アップグレード' }, { label:'特別アップグレード' }],
    };
  },

  pickRelic(){
    const base = GlobalFunctions.randChoice(GameData.RELIC_POOL);
    let relicEnhance = null;
    if(Math.random() < 0.15){
      relicEnhance = GlobalFunctions.randChoice(GameData.RELIC_ENHANCE_POOL).id;
    }
    return { ...base, relicEnhance };
  },

  // 換金計算：1 + (カード強化)×2 + (ジャミング)×1 + (性質変化)×3
  calcCashGain(card){
    return 1 + (card.enhance ? 2 : 0) + (card.jamming ? 1 : 0) + (card.trait ? 3 : 0);
  },

  relicPrice(relic){ return GameData.SHOP_PRICES.relic + (relic.relicEnhance ? 3 : 0); },

  cardTagsHtml(card){
    let html = '';
    if(card.jamming) html += `<div class="card-tag card-tag-jamming">${card.jamming}</div>`;
    if(card.enhance) html += `<div class="card-tag card-tag-enhance">${card.enhance}</div>`;
    if(card.trait) html += `<div class="card-tag card-tag-trait">${card.trait}</div>`;
    return html;
  },

  // ===== 購入処理：レリック =====
  buyRelic(i){
    const relic = this.offers.relics[i];
    const price = this.relicPrice(relic);
    if(!relic || GameState.gold < price) return;
    if(GameState.relics.length >= GameState.effectiveMaxRelics()){
      this.message = `レリックは最大${GameState.effectiveMaxRelics()}個まで所持できます`;
      this.renderAll(); return;
    }
    GameState.gold -= price;
    GameState.relics.push(relic);
    this.offers.relics[i] = null;
    this.applyRelicGrantEffect(relic);
    const renName = relic.relicEnhance ? ('・' + (GameData.RELIC_ENHANCE_POOL.find(r=>r.id===relic.relicEnhance)?.name||'')) : '';
    this.message = `レリック「${relic.name}${renName}」を購入した`;
    this.renderAll();
  },

  // 購入時に即時反映が必要なレリック効果（それ以外はスコア計算時などに動的適用）
  applyRelicGrantEffect(relic){
    switch(relic.id){
      case 'round_boost':  GameState.roundsBonus += 1; break;
      case 'reroll_boost': GameState.rerollBonus += 2; GameState.rerollCount += 2; break;
      case 'hand_boost':   GameState.handSizeBonus += 3; break;
      case 'paint':
        GameState.currentDeck.forEach(c => { if(!c.trait) c.trait = '塗りつぶし'; });
        GameState.turnsBonus -= 2;
        break;
      case 'jamming_boost':
        GameState.rerollCount = Math.max(0, GameState.rerollCount - 3);
        break;
      default: break;
    }
  },

  // ===== 購入処理：カードパック（2枚提示・効果を見せてから1枚ピック or スキップ） =====
  buyCardPack(i){
    const pack = this.offers.cardPacks[i];
    const price = GameData.SHOP_PRICES.cardPack;
    if(!pack || GameState.gold < price) return;
    GameState.gold -= price;
    const candidates = [GameData.generateShopCard(), GameData.generateShopCard()];
    this.offers.cardPacks[i] = null;
    this.pickingCardPack = { candidates };
    this.renderAll();
  },

  pickCardPackCard(card){
    GameState.currentDeck.push(card);
    this.message = `${GameData.SYMBOL_LABEL[card.symbol]}（基礎点${card.baseScore}${card.jamming ? '・' + card.jamming : ''}）を獲得した`;
    this.pickingCardPack = null;
    this.renderAll();
  },

  skipCardPack(){
    this.message = 'カードパックをスキップした';
    this.pickingCardPack = null;
    this.renderAll();
  },

  // ===== 購入処理：通常／特別アップグレードパック =====
  buyUpgrade(slotType, index){
    const price = slotType === 'special' ? GameData.SHOP_PRICES.specialUpgrade : GameData.SHOP_PRICES.normalUpgrade;
    const slot = slotType === 'special' ? this.offers.specialUpgrades[index] : this.offers.normalUpgrades[index];
    if(!slot || GameState.gold < price) return;
    if(GameState.currentDeck.length === 0) return;

    let pool = GameData.NORMAL_SELECT_POOL;
    if(slotType === 'special'){
      pool = GameData.SPECIAL_SELECT_POOL.filter(e => !GameState.usedSpecialEffectIds.includes(e.id));
      if(pool.length === 0){
        this.message = '特別セレクトの効果はすべて入手済みです';
        this.renderAll();
        return;
      }
    }
    GameState.gold -= price;

    const pickN = slotType === 'special' ? 2 : 3;
    const effectPool = GlobalFunctions.shuffle(pool).slice(0, Math.min(pickN, pool.length));
    const pickCount = Math.min(8, GameState.currentDeck.length);
    const cardIndexes = GlobalFunctions.shuffle(GameState.currentDeck.map((_, idx) => idx)).slice(0, pickCount);

    this.pickingPack = { slotType, index, effectPool, chosenEffect:null, cardIndexes, selectedTargets: new Set() };
    this.renderAll();
  },

  chooseEffect(effect){
    if(!this.pickingPack) return;
    this.pickingPack.chosenEffect = effect;
    this.pickingPack.selectedTargets = new Set();
    this.renderAll();
  },

  toggleTarget(cardIdx){
    const p = this.pickingPack;
    if(!p || !p.chosenEffect || p.chosenEffect.targetMax === 0) return;
    const max = p.chosenEffect.targetMax;
    if(p.selectedTargets.has(cardIdx)){
      p.selectedTargets.delete(cardIdx);
    }else{
      if(p.selectedTargets.size >= max) return;
      p.selectedTargets.add(cardIdx);
    }
    this.renderAll();
  },

  async confirmPack(){
    const p = this.pickingPack;
    if(!p || !p.chosenEffect) return;
    if(p.selectedTargets.size < p.chosenEffect.targetMin) return;

    const targetIdxArr = Array.from(p.selectedTargets);
    const affectedCards = this.applyEffect(p.chosenEffect.id, targetIdxArr);
    if(p.slotType === 'special') GameState.usedSpecialEffectIds.push(p.chosenEffect.id);

    if(affectedCards && affectedCards.length > 0){
      this.cardRevealPopup = { cards: affectedCards };
      this.renderAll();
      await this.sleep(2000);
      this.cardRevealPopup = null;
    }
    this.consumePackSlot();
  },

  skipPack(){
    this.message = 'パックの効果付与をスキップした';
    this.consumePackSlot();
  },

  consumePackSlot(){
    const p = this.pickingPack;
    if(p.slotType === 'special') this.offers.specialUpgrades[p.index] = null;
    else this.offers.normalUpgrades[p.index] = null;
    this.pickingPack = null;
    this.renderAll();
  },

  // セレクト効果の適用（エクセル「セレクトパック」シート準拠）。影響を受けたカード配列を返す（プレビュー表示用）
  applyEffect(effectId, targetIndexes){
    const deck = GameState.currentDeck;
    const bumpMult = (symbol, amount) => { GameData.BINGO_MULTIPLIER_BASE[symbol] += amount; };

    switch(effectId){
      case 'circle_mult':   bumpMult('Circle', 4);   this.message = '○のビンゴ倍率が上昇した'; return [];
      case 'cross_mult':    bumpMult('Cross', 5);    this.message = '×のビンゴ倍率が変化した'; return [];
      case 'square_mult':   bumpMult('Square', 4);   this.message = '□のビンゴ倍率が上昇した'; return [];
      case 'triangle_mult': bumpMult('Triangle', 4); this.message = '△のビンゴ倍率が上昇した'; return [];
      case 'all_mult_up1':
        GameData.SYMBOLS.forEach(s => bumpMult(s, 1));
        this.message = '全記号のビンゴ倍率が上昇した';
        return [];
      case 'number_up2':
        targetIndexes.forEach(i => { if(deck[i]) deck[i].baseScore += 5; });
        this.message = '選択したカードの基礎点が+5された';
        return targetIndexes.map(i => deck[i]).filter(Boolean);
      case 'number_up3':
        targetIndexes.forEach(i => { if(deck[i]) deck[i].baseScore += 3; });
        this.message = '選択したカードの基礎点が+3された';
        return targetIndexes.map(i => deck[i]).filter(Boolean);
      case 'base_up5':
        targetIndexes.forEach(i => { if(deck[i]) deck[i].baseScore += 5; });
        this.message = '選択したカードの基礎点が+5された';
        return targetIndexes.map(i => deck[i]).filter(Boolean);
      case 'symbol_change':
        targetIndexes.forEach(i => {
          const card = deck[i];
          if(!card) return;
          const others = ['Circle', 'Triangle', 'Square'].filter(s => s !== card.symbol);
          card.symbol = GlobalFunctions.randChoice(others);
        });
        this.message = '選択したカードの記号が変化した';
        return targetIndexes.map(i => deck[i]).filter(Boolean);
      case 'cash_in': {
        const i = targetIndexes[0];
        const card = deck[i];
        if(!card) return [];
        const gain = this.calcCashGain(card);
        GameState.currentDeck = deck.filter((_, idx) => idx !== i);
        GameState.gold += gain;
        this.message = `カードを換金してG+${gain}を得た`;
        return [];
      }
      case 'duplicate': {
        const i = targetIndexes[0];
        const src = deck[i];
        if(!src) return [];
        const clone = Object.assign({}, src, { id: 'dup_' + Date.now() + '_' + Math.floor(Math.random() * 100000) });
        GameState.currentDeck.push(clone);
        this.message = 'カードを複製した';
        return [clone];
      }
      case 'grant_enhance': {
        const i = targetIndexes[0];
        const card = deck[i];
        if(!card) return [];
        card.enhance = GlobalFunctions.randChoice(GameData.ENHANCE_NAME_POOL);
        GameData.applyGrantSideEffects(card);
        this.message = `カードに強化効果「${card.enhance}」を付与した`;
        return [card];
      }
      case 'grant_jamming': {
        const i = targetIndexes[0];
        const card = deck[i];
        if(!card) return [];
        card.jamming = GlobalFunctions.randChoice(Object.keys(GameData.JAMMING_DESC));
        this.message = `カードにジャミング効果「${card.jamming}」を付与した`;
        return [card];
      }
      case 'grant_trait': {
        const i = targetIndexes[0];
        const card = deck[i];
        if(!card) return [];
        card.trait = GlobalFunctions.randChoice(GameData.TRAIT_NAME_POOL);
        GameData.applyGrantSideEffects(card);
        this.message = `カードに性質変化「${card.trait}」を付与した`;
        return [card];
      }
      case 'hand_up2':       GameState.handSizeBonus += 2;  this.message = '手札上限が2枚増加した'; return [];
      case 'reroll_up2':     GameState.rerollCount += 2;    this.message = 'リロール回数が2回増加した'; return [];
      case 'round_up1':      GameState.roundsBonus += 1;    this.message = '挑戦できるラウンド数が1増加した'; return [];
      case 'turn_up1':       GameState.turnsBonus += 1;     this.message = '1ラウンドのターン数が1増加した'; return [];
      case 'relic_slot_up1': GameState.relicSlotBonus += 1; this.message = 'レリック所持数上限が1増加した'; return [];
      default: return [];
    }
  },

  rerollOffers(){
    const price = GameData.SHOP_PRICES.reroll;
    if(GameState.gold < price) return;
    GameState.gold -= price;
    this.offers = this.generateOffers();
    this.message = '品揃えを更新した';
    this.renderAll();
  },

  leaveShop(){
    this.offers = null;
    this.pickingPack = null;
    this.pickingCardPack = null;
    this.cardRevealPopup = null;
    this.message = null;
    GameState.lastReward = null;
    App.showMapSelect();
  },

  // ===== 描画 =====
  renderAll(){
    this.container.innerHTML = '';
    const el = document.createElement('div');
    el.className = 'shop-screen';

    const r = GameState.lastReward;
    let rewardText = '';
    if(r){
      const label = r.type === 'skip' ? 'スキップ' : 'クリア';
      if(r.breakdown){
        const b = r.breakdown;
        rewardText = `${r.stageName}を${label}：基礎G+${b.base}${b.bonus ? ` ＋ 早期クリアG+${b.bonus}` : ''} ＋ 基本G+${b.flat} ＝ 合計G+${r.gold}`;
      }else{
        rewardText = `${r.stageName}を${label}：報酬 G+${r.gold}`;
      }
    }

    const header = document.createElement('div');
    header.className = 'shop-header';
    header.innerHTML = `
      <h2>ショップ</h2>
      ${rewardText ? `<div class="shop-reward">${rewardText}</div>` : ''}
      <div class="shop-gold">所持G：${GameState.gold}</div>
      ${this.message ? `<div class="shop-message">${this.message}</div>` : ''}
    `;
    el.appendChild(header);

    // レリックは個別に価格が異なるのでslotを直接構築
    const relicSection = document.createElement('div');
    relicSection.className = 'shop-section';
    relicSection.innerHTML = `<h3>レリック（基本${GameData.SHOP_PRICES.relic}G・強化付き${GameData.SHOP_PRICES.relic+3}G）</h3>`;
    const relicRow = document.createElement('div'); relicRow.className = 'shop-row';
    this.offers.relics.forEach((relic, i) => {
      const slot = document.createElement('div');
      if(!relic){ slot.className='shop-slot sold'; slot.innerHTML='<div class="slot-title">SOLD OUT</div>'; relicRow.appendChild(slot); return; }
      const price = this.relicPrice(relic);
      const renEntry = relic.relicEnhance ? GameData.RELIC_ENHANCE_POOL.find(r=>r.id===relic.relicEnhance) : null;
      slot.className = 'shop-slot relic-shop-slot';
      slot.innerHTML = `
        <div class="relic-shop-card">
          <div class="relic-name">${relic.name}</div>
          ${renEntry?`<div class="relic-enhance-tag">${renEntry.name}</div>`:''}
        </div>
        <div class="slot-desc">${relic.desc}${renEntry?`<br><span style="color:var(--gold)">【${renEntry.name}】${renEntry.desc}</span>`:''}
        <br>所持 ${GameState.relics.length} / ${GameState.effectiveMaxRelics()}</div>
        <button class="buy-btn" ${GameState.gold < price || GameState.relics.length >= GameState.effectiveMaxRelics() ? 'disabled' : ''}>購入（${price}G）</button>
      `;
      slot.querySelector('.buy-btn').addEventListener('click', () => this.buyRelic(i));
      relicRow.appendChild(slot);
    });
    relicSection.appendChild(relicRow);
    el.appendChild(relicSection);

    el.appendChild(this.renderSection('カードパック', GameData.SHOP_PRICES.cardPack, this.offers.cardPacks.map((pack, i) => ({
      content: pack ? `<div class="slot-title">？カードパック</div><div class="slot-desc">2枚から効果を確認して1枚選択</div>` : null,
      onBuy: () => this.buyCardPack(i),
    }))));

    el.appendChild(this.renderSection('通常アップグレード', GameData.SHOP_PRICES.normalUpgrade, this.offers.normalUpgrades.map((slot, i) => ({
      content: slot ? `<div class="slot-title">通常アップグレード</div><div class="slot-desc">通常セレクトから3つ提示・1つ選択</div>` : null,
      onBuy: () => this.buyUpgrade('normal', i),
    }))));

    el.appendChild(this.renderSection('特別アップグレード', GameData.SHOP_PRICES.specialUpgrade, this.offers.specialUpgrades.map((slot, i) => ({
      content: slot ? `<div class="slot-title">特別アップグレード</div><div class="slot-desc">特別セレクトから2つ提示・1つ選択（一度選んだ効果は再出現しない）</div>` : null,
      onBuy: () => this.buyUpgrade('special', i),
    }))));

    const actions = document.createElement('div');
    actions.className = 'shop-actions';
    const rerollBtn = document.createElement('button');
    rerollBtn.textContent = `品揃え更新（${GameData.SHOP_PRICES.reroll}G）`;
    rerollBtn.disabled = GameState.gold < GameData.SHOP_PRICES.reroll;
    rerollBtn.addEventListener('click', () => this.rerollOffers());
    actions.appendChild(rerollBtn);

    const backBtn = document.createElement('button');
    backBtn.textContent = 'マップに戻る';
    backBtn.addEventListener('click', () => this.leaveShop());
    actions.appendChild(backBtn);
    el.appendChild(actions);

    this.container.appendChild(el);

    if(this.pickingCardPack) this.container.appendChild(this.renderCardPackModal());
    if(this.pickingPack) this.container.appendChild(this.renderPickModal());
    if(this.cardRevealPopup) this.container.appendChild(this.renderCardRevealPopup());
  },

  renderSection(title, price, slots){
    const section = document.createElement('div');
    section.className = 'shop-section';
    section.innerHTML = `<h3>${title}（${price}G）</h3>`;
    const row = document.createElement('div');
    row.className = 'shop-row';
    slots.forEach(slot => {
      const elx = document.createElement('div');
      elx.className = 'shop-slot' + (slot.content ? '' : ' sold');
      if(slot.content){
        elx.innerHTML = `${slot.content}<button class="buy-btn">購入</button>`;
        const btn = elx.querySelector('.buy-btn');
        btn.disabled = GameState.gold < price;
        btn.addEventListener('click', slot.onBuy);
      }else{
        elx.innerHTML = `<div class="slot-title">SOLD OUT</div>`;
      }
      row.appendChild(elx);
    });
    section.appendChild(row);
    return section;
  },

  // カードパック開封モーダル：効果を見せてから1枚選択 or スキップ
  renderCardPackModal(){
    const p = this.pickingCardPack;
    const overlay = document.createElement('div');
    overlay.className = 'pack-modal-overlay';
    const modal = document.createElement('div');
    modal.className = 'pack-modal';
    modal.innerHTML = `<h3>カードを1枚選んでください</h3>`;

    const grid = document.createElement('div');
    grid.className = 'pack-card-grid';
    p.candidates.forEach(card => {
      const wrap = document.createElement('div');
      wrap.className = 'card-pick-wrap';
      const item = document.createElement('div');
      item.className = 'card';
      item.innerHTML = `
        <div class="card-symbol sym-${card.symbol}">${GameData.SYMBOL_LABEL[card.symbol]}</div>
        <div class="card-number">${card.baseScore}</div>
        ${this.cardTagsHtml(card)}
      `;
      wrap.appendChild(item);
      const desc = document.createElement('div');
      desc.className = 'card-pick-desc';
      const descLines = [];
      if(card.jamming) descLines.push(GameData.JAMMING_DESC[card.jamming] || '');
      if(card.enhance) descLines.push(GameData.ENHANCE_DESC[card.enhance] || '');
      if(card.trait) descLines.push(GameData.TRAIT_DESC[card.trait] || '');
      desc.textContent = descLines.length > 0 ? descLines.join(' / ') : '効果なし';
      wrap.appendChild(desc);
      wrap.addEventListener('click', () => this.pickCardPackCard(card));
      grid.appendChild(wrap);
    });
    modal.appendChild(grid);

    const skipBtn = document.createElement('button');
    skipBtn.textContent = 'スキップ（どちらも選ばない）';
    skipBtn.style.marginTop = '18px';
    skipBtn.addEventListener('click', () => this.skipCardPack());
    modal.appendChild(skipBtn);

    overlay.appendChild(modal);
    return overlay;
  },

  // アップグレードパック開封モーダル：効果選択と対象カード一覧を同時に表示
  renderPickModal(){
    const p = this.pickingPack;
    const overlay = document.createElement('div');
    overlay.className = 'pack-modal-overlay';
    const modal = document.createElement('div');
    modal.className = 'pack-modal pack-modal-wide';
    modal.innerHTML = `<h3>効果を選択してください</h3>`;

    const list = document.createElement('div');
    list.className = 'effect-choice-list';
    p.effectPool.forEach(eff => {
      const item = document.createElement('div');
      item.className = 'effect-choice-item' + (p.chosenEffect === eff ? ' chosen' : '');
      item.innerHTML = `<div class="slot-title">${eff.name}</div><div class="slot-desc">${eff.desc}</div>`;
      item.addEventListener('click', () => this.chooseEffect(eff));
      list.appendChild(item);
    });
    modal.appendChild(list);

    const eff = p.chosenEffect;
    const needsTarget = eff && eff.targetMax > 0;
    const gridDisabled = !eff || !needsTarget;

    const hint = document.createElement('div');
    hint.className = 'shop-message';
    hint.style.margin = '12px 0 8px';
    if(!eff){
      hint.textContent = '上から効果を1つ選んでください';
    }else if(needsTarget){
      hint.textContent = eff.targetMin === eff.targetMax
        ? `対象カードを${eff.targetMax}枚選択してください（${p.selectedTargets.size}/${eff.targetMax}）`
        : `対象カードを最大${eff.targetMax}枚まで選択してください（${p.selectedTargets.size}/${eff.targetMax}）`;
    }else{
      hint.textContent = '対象カードの選択は不要です（決定を押すと効果が発動します）';
    }
    modal.appendChild(hint);

    const grid = document.createElement('div');
    grid.className = 'pack-card-grid' + (gridDisabled ? ' grid-disabled' : '');
    p.cardIndexes.forEach(idx => {
      const card = GameState.currentDeck[idx];
      if(!card) return;
      const item = document.createElement('div');
      item.className = 'pack-card-item' + (p.selectedTargets.has(idx) ? ' picked' : '');
      let sellBadge = '';
      if(eff && eff.id === 'cash_in'){
        const gain = this.calcCashGain(card);
        sellBadge = `<div class="sell-badge">売却+${gain}G</div>`;
      }
      item.innerHTML = `
        ${sellBadge}
        <div class="card-symbol sym-${card.symbol}">${GameData.SYMBOL_LABEL[card.symbol]}</div>
        <div class="card-number">${card.baseScore}</div>
        ${this.cardTagsHtml(card)}
      `;
      item.addEventListener('click', () => this.toggleTarget(idx));
      grid.appendChild(item);
    });
    modal.appendChild(grid);

    const btnRow = document.createElement('div');
    btnRow.className = 'pack-modal-actions';
    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = '決定';
    confirmBtn.disabled = !eff || (needsTarget && p.selectedTargets.size < eff.targetMin);
    confirmBtn.addEventListener('click', () => this.confirmPack());
    btnRow.appendChild(confirmBtn);

    const skipBtn = document.createElement('button');
    skipBtn.textContent = 'スキップ';
    skipBtn.addEventListener('click', () => this.skipPack());
    btnRow.appendChild(skipBtn);

    modal.appendChild(btnRow);
    overlay.appendChild(modal);
    return overlay;
  },

  // 強化されたカードを2秒間プレビュー表示
  renderCardRevealPopup(){
    const overlay = document.createElement('div');
    overlay.className = 'pack-modal-overlay';
    const box = document.createElement('div');
    box.className = 'card-reveal-popup';
    box.innerHTML = '<div class="gr-label">カードが更新されました</div>';
    const grid = document.createElement('div');
    grid.className = 'pack-card-grid';
    this.cardRevealPopup.cards.forEach(card => {
      const item = document.createElement('div');
      item.className = 'card reveal-glow';
      item.innerHTML = `
        <div class="card-symbol sym-${card.symbol}">${GameData.SYMBOL_LABEL[card.symbol]}</div>
        <div class="card-number">${card.baseScore}</div>
        ${this.cardTagsHtml(card)}
      `;
      grid.appendChild(item);
    });
    box.appendChild(grid);
    overlay.appendChild(box);
    return overlay;
  },
};
