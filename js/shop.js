// ショップ：レリック／カードパック／通常・特別アップグレードパックの購入、所持G管理
const ShopScene = {
  container: null,
  offers: null,
  pickingPack: null,       // アップグレードパック開封中の選択状態
  pickingCardPack: null,   // カードパック開封中の選択状態
  message: null,

  render(container){
    this.container = container;
    if(!this.offers) this.offers = this.generateOffers();
    this.renderAll();
  },

  generateOffers(){
    return {
      relics: [this.pickRelic(), this.pickRelic(), this.pickRelic()],
      cardPacks: [{ mystery:true }, { mystery:true }],
      normalUpgrades: [{ label:'通常アップグレード' }, { label:'通常アップグレード' }],
      specialUpgrade: { label:'特別アップグレード' },
    };
  },

  pickRelic(){
    return GlobalFunctions.randChoice(GameData.RELIC_POOL);
  },

  // ===== 購入処理：レリック =====
  buyRelic(i){
    const relic = this.offers.relics[i];
    const price = GameData.SHOP_PRICES.relic;
    if(!relic || GameState.gold < price) return;
    GameState.gold -= price;
    GameState.relics.push(relic);
    this.offers.relics[i] = null;
    this.message = `レリック「${relic.name}」を購入した`;
    this.renderAll();
  },

  // ===== 購入処理：カードパック（2枚提示→1枚ピック or スキップ） =====
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
    const slot = slotType === 'special' ? this.offers.specialUpgrade : this.offers.normalUpgrades[index];
    if(!slot || GameState.gold < price) return;
    if(GameState.currentDeck.length === 0) return;
    GameState.gold -= price;

    const pool = slotType === 'special' ? GameData.SPECIAL_SELECT_POOL : GameData.NORMAL_SELECT_POOL;
    const pickN = slotType === 'special' ? 2 : 3;
    const effectPool = GlobalFunctions.shuffle(pool).slice(0, pickN);
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

  backToEffectChoice(){
    if(!this.pickingPack) return;
    this.pickingPack.chosenEffect = null;
    this.pickingPack.selectedTargets = new Set();
    this.renderAll();
  },

  toggleTarget(cardIdx){
    const p = this.pickingPack;
    if(!p || !p.chosenEffect) return;
    const max = p.chosenEffect.targetMax;
    if(p.selectedTargets.has(cardIdx)){
      p.selectedTargets.delete(cardIdx);
    }else{
      if(p.selectedTargets.size >= max) return;
      p.selectedTargets.add(cardIdx);
    }
    this.renderAll();
  },

  confirmPack(){
    const p = this.pickingPack;
    if(!p || !p.chosenEffect) return;
    if(p.selectedTargets.size < p.chosenEffect.targetMin) return;
    this.applyEffect(p.chosenEffect.id, Array.from(p.selectedTargets));
    this.consumePackSlot();
  },

  skipPack(){
    this.message = 'パックの効果付与をスキップした';
    this.consumePackSlot();
  },

  consumePackSlot(){
    const p = this.pickingPack;
    if(p.slotType === 'special') this.offers.specialUpgrade = null;
    else this.offers.normalUpgrades[p.index] = null;
    this.pickingPack = null;
    this.renderAll();
  },

  // セレクト効果の適用（エクセル「セレクトパック」シート準拠）
  applyEffect(effectId, targetIndexes){
    const deck = GameState.currentDeck;
    const bumpMult = (symbol, amount) => {
      GameData.BINGO_MULTIPLIER_BASE[symbol] += amount;
      GameData.BINGO_MULTIPLIER_QUAD[symbol] += amount;
    };
    switch(effectId){
      case 'circle_mult':   bumpMult('Circle', 3);   this.message = '○のビンゴ倍率が上昇した'; break;
      case 'cross_mult':    bumpMult('Cross', 5);    this.message = '×のビンゴ倍率が変化した'; break;
      case 'square_mult':   bumpMult('Square', 3);   this.message = '□のビンゴ倍率が上昇した'; break;
      case 'triangle_mult': bumpMult('Triangle', 3); this.message = '△のビンゴ倍率が上昇した'; break;
      case 'all_mult_up1':
        GameData.SYMBOLS.forEach(s => bumpMult(s, 1));
        this.message = '全記号のビンゴ倍率が上昇した';
        break;
      case 'number_up2':
        targetIndexes.forEach(i => { if(deck[i]) deck[i].baseScore += 1; });
        this.message = '選択したカードの基礎点が+1された';
        break;
      case 'base_up5':
        targetIndexes.forEach(i => { if(deck[i]) deck[i].baseScore += 5; });
        this.message = '選択したカードの基礎点が+5された';
        break;
      case 'symbol_change':
        targetIndexes.forEach(i => {
          const card = deck[i];
          if(!card) return;
          const others = ['Circle', 'Triangle', 'Square'].filter(s => s !== card.symbol);
          card.symbol = GlobalFunctions.randChoice(others);
        });
        this.message = '選択したカードの記号が変化した';
        break;
      case 'cash_in': {
        const i = targetIndexes[0];
        const card = deck[i];
        if(!card) break;
        const enhanceCount = card.enhance ? 1 : 0;
        const gain = 1 + enhanceCount;
        GameState.currentDeck = deck.filter((_, idx) => idx !== i);
        GameState.gold += gain;
        this.message = `カードを換金してG+${gain}を得た`;
        break;
      }
      case 'duplicate': {
        const i = targetIndexes[0];
        const src = deck[i];
        if(!src) break;
        const clone = Object.assign({}, src, { id: 'dup_' + Date.now() + '_' + Math.floor(Math.random() * 100000) });
        GameState.currentDeck.push(clone);
        this.message = 'カードを複製した';
        break;
      }
      case 'grant_enhance': {
        const i = targetIndexes[0];
        const card = deck[i];
        if(!card) break;
        card.enhance = GlobalFunctions.randChoice(GameData.ENHANCE_NAME_POOL);
        this.message = `カードに強化効果「${card.enhance}」を付与した`;
        break;
      }
      case 'grant_jamming': {
        const i = targetIndexes[0];
        const card = deck[i];
        if(!card) break;
        card.jamming = GlobalFunctions.randChoice(Object.keys(GameData.JAMMING_DESC));
        this.message = `カードにジャミング効果「${card.jamming}」を付与した`;
        break;
      }
      case 'grant_trait': {
        const i = targetIndexes[0];
        const card = deck[i];
        if(!card) break;
        card.trait = GlobalFunctions.randChoice(GameData.TRAIT_NAME_POOL);
        this.message = `カードに性質変化「${card.trait}」を付与した`;
        break;
      }
      case 'hand_up2':       GameState.handSizeBonus += 2; this.message = '手札上限が2枚増加した'; break;
      case 'reroll_up2':     GameState.rerollCount += 2;   this.message = 'リロール回数が2回増加した'; break;
      case 'round_up1':      GameState.roundsBonus += 1;   this.message = '挑戦できるラウンド数が1増加した'; break;
      case 'turn_up1':       GameState.turnsBonus += 1;    this.message = '1ラウンドのターン数が1増加した'; break;
      case 'relic_slot_up1': GameState.relicSlotBonus += 1; this.message = 'レリック所持数上限が1増加した'; break;
      default: break;
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
      if(r.breakdown && r.breakdown.bonus){
        rewardText = `${r.stageName}を${label}：基礎G+${r.breakdown.base} ＋ 早期クリアボーナスG+${r.breakdown.bonus} ＝ 合計G+${r.gold}`;
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

    el.appendChild(this.renderSection('レリック', GameData.SHOP_PRICES.relic, this.offers.relics.map((relic, i) => ({
      content: relic ? `<div class="slot-title">${relic.name}</div><div class="slot-desc">${relic.desc}</div>` : null,
      onBuy: () => this.buyRelic(i),
    }))));

    el.appendChild(this.renderSection('カードパック', GameData.SHOP_PRICES.cardPack, this.offers.cardPacks.map((pack, i) => ({
      content: pack ? `<div class="slot-title">？カードパック</div><div class="slot-desc">開封するまで中身は分からない（2枚から1枚選択）</div>` : null,
      onBuy: () => this.buyCardPack(i),
    }))));

    el.appendChild(this.renderSection('通常アップグレード', GameData.SHOP_PRICES.normalUpgrade, this.offers.normalUpgrades.map((slot, i) => ({
      content: slot ? `<div class="slot-title">通常アップグレード</div><div class="slot-desc">通常セレクトから3つ提示・1つ選択</div>` : null,
      onBuy: () => this.buyUpgrade('normal', i),
    }))));

    el.appendChild(this.renderSection('特別アップグレード', GameData.SHOP_PRICES.specialUpgrade, [{
      content: this.offers.specialUpgrade ? `<div class="slot-title">特別アップグレード</div><div class="slot-desc">特別セレクトから2つ提示・1つ選択</div>` : null,
      onBuy: () => this.buyUpgrade('special', 0),
    }]));

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

  // カードパック開封モーダル：手札風のカード表示で2枚提示→1枚ピック or スキップ
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
      const item = document.createElement('div');
      item.className = 'card';
      item.innerHTML = `
        <div class="card-symbol sym-${card.symbol}">${GameData.SYMBOL_LABEL[card.symbol]}</div>
        <div class="card-number">${card.baseScore}</div>
        ${card.jamming ? `<div class="card-tag">${card.jamming}</div>` : ''}
      `;
      item.addEventListener('click', () => this.pickCardPackCard(card));
      grid.appendChild(item);
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

  // アップグレードパック開封モーダル：効果選択→対象カード選択（またはスキップ）
  renderPickModal(){
    const p = this.pickingPack;
    const overlay = document.createElement('div');
    overlay.className = 'pack-modal-overlay';
    const modal = document.createElement('div');
    modal.className = 'pack-modal';

    if(!p.chosenEffect){
      modal.innerHTML = `<h3>効果を1つ選んでください</h3>`;
      const list = document.createElement('div');
      list.className = 'effect-choice-list';
      p.effectPool.forEach(eff => {
        const item = document.createElement('div');
        item.className = 'effect-choice-item';
        item.innerHTML = `<div class="slot-title">${eff.name}</div><div class="slot-desc">${eff.desc}</div>`;
        item.addEventListener('click', () => this.chooseEffect(eff));
        list.appendChild(item);
      });
      modal.appendChild(list);

      const skipBtn = document.createElement('button');
      skipBtn.textContent = 'スキップ（効果を付与しない）';
      skipBtn.style.marginTop = '18px';
      skipBtn.addEventListener('click', () => this.skipPack());
      modal.appendChild(skipBtn);
    }else{
      const eff = p.chosenEffect;
      const needsTarget = eff.targetMax > 0;
      modal.innerHTML = `<h3>${eff.name}</h3><div class="slot-desc" style="margin-bottom:12px;">${eff.desc}</div>`;

      if(needsTarget){
        const hint = document.createElement('div');
        hint.className = 'shop-message';
        hint.style.marginBottom = '10px';
        hint.textContent = eff.targetMin === eff.targetMax
          ? `カードを${eff.targetMax}枚選択してください（${p.selectedTargets.size}/${eff.targetMax}）`
          : `カードを最大${eff.targetMax}枚まで選択してください（${p.selectedTargets.size}/${eff.targetMax}）`;
        modal.appendChild(hint);

        const grid = document.createElement('div');
        grid.className = 'pack-card-grid';
        p.cardIndexes.forEach(idx => {
          const card = GameState.currentDeck[idx];
          if(!card) return;
          const item = document.createElement('div');
          item.className = 'pack-card-item' + (p.selectedTargets.has(idx) ? ' picked' : '');
          item.innerHTML = `
            <div class="card-symbol sym-${card.symbol}">${GameData.SYMBOL_LABEL[card.symbol]}</div>
            <div class="card-number">${card.baseScore}</div>
            ${card.jamming ? `<div class="card-tag">${card.jamming}</div>` : ''}
          `;
          item.addEventListener('click', () => this.toggleTarget(idx));
          grid.appendChild(item);
        });
        modal.appendChild(grid);
      }

      const btnRow = document.createElement('div');
      btnRow.className = 'pack-modal-actions';
      const confirmBtn = document.createElement('button');
      confirmBtn.textContent = '決定';
      confirmBtn.disabled = needsTarget && p.selectedTargets.size < eff.targetMin;
      confirmBtn.addEventListener('click', () => this.confirmPack());
      btnRow.appendChild(confirmBtn);

      const backBtn = document.createElement('button');
      backBtn.textContent = '効果を選び直す';
      backBtn.addEventListener('click', () => this.backToEffectChoice());
      btnRow.appendChild(backBtn);

      const skipBtn = document.createElement('button');
      skipBtn.textContent = 'スキップ';
      skipBtn.addEventListener('click', () => this.skipPack());
      btnRow.appendChild(skipBtn);

      modal.appendChild(btnRow);
    }

    overlay.appendChild(modal);
    return overlay;
  },
};
