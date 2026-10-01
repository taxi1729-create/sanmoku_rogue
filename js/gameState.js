const GameState = {
  currentDeck:[], hand:[], reserve:[], drawPile:[], discardPile:[], discardedPile:[],
  targetScore:0, currentScore:0, relics:[], gold:0, round:1, turn:1, currentStage:null,
  clearedStages:[], lastReward:null, rerollCount:GameData.INITIAL_REROLL,
  handSizeBonus:0, roundsBonus:0, turnsBonus:0, relicSlotBonus:0, rerollBonus:0,
  // #1 パッシブ「魔力」：A/B/E=所持フラグ、C=捧げたレリック数（レリック上限加算）、D=付与された階層の配列
  mana:{ A:false, B:false, C:0, D:[], E:false },
  // #2 魔神イベントの進行状況（decided: 階層ごとの判定結果 true/false、done1/done2: 各区間で発生済みか、usedMajin: 登場した魔神id、cleared: イベント終了済み階層）
  majin:{ decided:{}, done1:false, done2:false, usedMajin:[], cleared:{} },
  passiveSuspended:null, // #4 ボス効果「パッシブ効果無効」中に退避したパッシブ
  packCardBonus:0, // #14 特別アップグレード：パック購入時の選択可能カード枚数の追加分
  usedSpecialEffectIds:[], specialPackExhausted:false, pendingBossEffect:null,
  currentFloor:1,          // #12 現在の階層
  maxClearedFloor:0,        // #12 最高クリア階層
  maxClearedStage:'',       // #12 最高クリアステージ名
  symbolPassiveTier:{ Circle:0, Triangle:0, Square:0, Cross:0, Hoshi:0, Check:0, Seven:0 }, // #A 記号パッシブ（0=未取得,1-3=段階）
  bingoCountThisStage:0, // #8 チェックパッシブ3：このステージのビンゴ回数
  totalBingoCount:0, // #新規 セブンパッシブ2：累計ビンゴ回数（ゲーム開始でリセット）
  sevenPendingMultBoost:false, // #新規 セブンパッシブ2：次のビンゴで最終乗算補正×7を発動するフラグ
  bossRerollUsed:false, // #3 ホシパッシブ1：ボス効果リロールの使用済みフラグ
  finalShopDone:false, floor10SpecialBoss:false, // #6 階層10特殊構成
  gameMode:'normal', // #9 ゲームモード（normal=通常デッキ／tengame=テンゲーム）
  initialPassiveGranted:false, // #6 ゲーム開始時パッシブ選択（3択）を既に提示したかどうか

  // #13 シカクパッシブ1の手札上限+1は廃止（パック選択枚数+1に変更）
  effectiveHandSize(){ return GameData.HAND_SIZE + this.handSizeBonus; },
  // #4 保留：前ラウンドから手札に残った保留カードは手札上限の計算に含めない
  handCountForLimit(){ return this.hand.filter(c=>!c._reserveCarry).length; },
  // #11/#13/#14 パック購入時に選択できるカードの枚数（通常7枚／爆発9枚＋シカクパッシブ1＋特別アップグレード）
  packCardCount(explosive=false){
    const base = explosive ? GameData.EXPLOSIVE_PACK_CARD_COUNT : GameData.PACK_CARD_COUNT;
    return base + (this.symbolPassiveTier.Square>=1?1:0) + (this.packCardBonus||0);
  },
  // #5 レリックの大きさ（所持枠数）を赤丸アイコン（GameIcons relic_size_dot）で表現する（ネガティブ=0枠は表示なし）。innerHTML で描画すること
  relicSizeDots(relic){ return GIcon('relic_size_dot').repeat(Math.max(0,this.slotsForRelic(relic))); },
  // #7/#8 報酬Gに加算するレリック効果（G獲得+3）とレリック強化効果（G獲得+1）
  rewardRelicGold(noRelic=false){
    if(noRelic) return {relic:0, relicEnhance:0};
    return { relic:3*this.relicCountOf('gold_boost'), relicEnhance:this.relics.filter(r=>r.relicEnhance==='ren_gold').length };
  },
  // #8 スキップ報酬：(基本G4)×num＋レリック効果＋レリック強化効果（num=1、階層6以上で+1）
  calcSkipReward(){
    const base=GameData.SKIP_REWARD_BASE_G;
    const num=1+(this.currentFloor>=6?1:0);
    const rg=this.rewardRelicGold(false);
    const total=base*num+rg.relic+rg.relicEnhance;
    return {base,num,relicBonus:rg.relic,relicEnhanceBonus:rg.relicEnhance,total};
  },
  effectiveMaxRounds(){ return GameData.MAX_ROUNDS + this.roundsBonus; },
  effectiveTurnsPerRound(){ return GameData.TURNS_PER_ROUND + this.turnsBonus; },
  effectiveMaxRelics(){ return GameData.MAX_RELICS + this.relicSlotBonus + (this.mana?.C||0); },
  // #1 魔力
  hasMana(st){ if(!this.mana) return false; if(st==='C') return (this.mana.C||0)>0; if(st==='D') return (this.mana.D||[]).length>0; return !!this.mana[st]; },
  hasAnyMana(){ return ['A','B','C','D','E'].some(s=>this.hasMana(s)); },
  grantMana(st, arg){
    if(!this.mana) this.mana={A:false,B:false,C:0,D:[],E:false};
    if(st==='C') this.mana.C=(this.mana.C||0)+(arg||0);
    else if(st==='D'){ const f=arg!=null?arg:this.currentFloor; if(!this.mana.D.includes(f)) this.mana.D.push(f); }
    else this.mana[st]=true;
  },
  // 列補正への魔力倍率（A・Bを両方持つ場合は掛け合わせる）
  manaLineMul(kind){
    let m=1;
    if(this.hasMana('A')) m*= kind==='tri'?0.75:(kind==='quad'?2:3);
    if(this.hasMana('B')) m*= kind==='tri'?3:0;
    return m;
  },
  // 魔力ステージD：この階層のボスクリア時のパッシブ報酬数
  passiveRewardCount(){ return (this.mana?.D||[]).includes(this.currentFloor)?3:1; },
  hasRelic(id){ return this.relics.some(r=>r.id===id); },
  // #5 同一レリックを複数所持している場合、その所持数を返す（点数計算で所持数分の効果を反映するために使用）
  relicCountOf(id){ return this.relics.filter(r=>r.id===id).length; },
  // #1(B) レリック所持数計算：ネガティブ=0枠、倍化=2枠、3倍化=3枠、通常=1枠
  slotsForRelic(relic){
    const ren=relic?.relicEnhance;
    if(ren==='ren_negative') return 0;
    if(ren==='ren_triple') return 3;
    if(ren==='ren_double') return 2;
    // #12 新規レリックの所持枠数（レリック強化効果を持つ場合は上のren判定が優先される）
    if(relic?.id==='hobby_collect') return 3;
    if(relic?.id==='pinnacle') return this.effectiveMaxRelics();
    return 1;
  },
  relicCount(){
    let n=0;
    for(const r of this.relics) n+=this.slotsForRelic(r);
    return n;
  },
  // #1(B) 所持スロット数（表示・購入判定はこれを基準にする。relics.length ではなく実際の消費枠数）
  usedRelicSlots(){ return this.relicCount(); },
  canAddRelic(relic){ return this.usedRelicSlots() + this.slotsForRelic(relic) <= this.effectiveMaxRelics(); },
  shopPriceOf(basePrice){ return this.relics.some(r=>r.relicEnhance==='ren_black')?Math.ceil(basePrice/2):basePrice; },
  // #11 レリックの並び替え（メイン画面・ショップ・マップで共通利用。処理順は常に配列の左から右）
  moveRelic(index,dir){
    const to=index+dir;
    if(index<0||index>=this.relics.length||to<0||to>=this.relics.length) return false;
    const tmp=this.relics[index]; this.relics[index]=this.relics[to]; this.relics[to]=tmp;
    return true;
  },

  initNewGame(mode){
    this.gameMode = mode || this.gameMode || 'normal';
    this.initialPassiveGranted=false; // #6 新規ゲーム開始時はリセットし、最初のステージ突入時にパッシブ3択を提示する
    this.currentDeck=GameData.buildDeckForMode(this.gameMode);
    this.gold=0; this.relics=[]; this.clearedStages=[];
    this.finalShopDone=false; // #6 階層10特殊構成の初回フラグをリセット
    this.rerollCount=GameData.INITIAL_REROLL;
    this.handSizeBonus=0; this.roundsBonus=0; this.turnsBonus=0;
    this.relicSlotBonus=0; this.rerollBonus=0; this.packCardBonus=0;
    this.usedSpecialEffectIds=[]; this.discardedPile=[];
    this.specialPackExhausted=false; this.pendingBossEffect=null;
    this.currentFloor=1;
    this.symbolPassiveTier={ Circle:0, Triangle:0, Square:0, Cross:0, Hoshi:0, Check:0, Seven:0 };
    this.mana={ A:false, B:false, C:0, D:[], E:false };
    this.majin={ decided:{}, done1:false, done2:false, usedMajin:[], cleared:{} };
    this.passiveSuspended=null;
    this.bingoCountThisStage=0;
    this.totalBingoCount=0; this.sevenPendingMultBoost=false;
    GameData.BINGO_MULTIPLIER_BASE={...GameData.BINGO_MULTIPLIER_BASE_ORIGINAL};
    GameData.CORRECTION_BASE_SCORE=0; GameData.CORRECTION_MULTIPLIER=0;
    GameData.FINAL_MULTIPLIER=1; GameData.FINAL_ADD=0;
  },
  // #3 旧仕様の加重（付与時に基礎点へ即時加算）で足された値を取り除く
  migrateCards(){
    (this.currentDeck||[]).forEach(c=>{ if(c&&c._weightedBonus!=null){ c.baseScore-=c._weightedBonus; delete c._weightedBonus; } });
  },
  initStage(stage){
    this.migrateCards();
    this.currentStage=stage;
    this.targetScore=stage.targetScore;
    this.currentScore=0; this.round=1; this.turn=1;
    this.rerollCount=GameData.INITIAL_REROLL+this.rerollBonus;
    this.hand=[]; this.reserve=[]; this.discardPile=[];
    this.discardedPile=[]; // #2 廃棄札はステージ（ゲーム）終了時に空にする（蓄積を防ぐ）
    this.drawPile=GlobalFunctions.shuffle(this.currentDeck);
    // #4 トップスピード：ゲーム開始時、このカードをデッキの一番上（＝配列の末尾＝最初に引かれる位置）に配置する
    const topSpeedCards=this.drawPile.filter(c=>c.enhance==='トップスピード');
    if(topSpeedCards.length>0){
      this.drawPile=this.drawPile.filter(c=>c.enhance!=='トップスピード');
      this.drawPile.push(...topSpeedCards);
    }
  },

  // #8 セーブデータ変換
  toSaveData(){
    return {
      currentDeck:this.currentDeck, relics:this.relics, gold:this.gold,
      clearedStages:this.clearedStages, currentFloor:this.currentFloor,
      maxClearedFloor:this.maxClearedFloor, maxClearedStage:this.maxClearedStage,
      handSizeBonus:this.handSizeBonus, roundsBonus:this.roundsBonus,
      turnsBonus:this.turnsBonus, relicSlotBonus:this.relicSlotBonus,
      rerollBonus:this.rerollBonus, packCardBonus:this.packCardBonus, usedSpecialEffectIds:this.usedSpecialEffectIds,
      pendingBossEffect:this.pendingBossEffect,
      symbolPassiveTier:this.passiveSuspended||this.symbolPassiveTier,
      mana:this.mana, majin:this.majin,
      totalBingoCount:this.totalBingoCount,
      sevenPendingMultBoost:this.sevenPendingMultBoost,
      bossRerollUsed:this.bossRerollUsed,
      finalShopDone:this.finalShopDone,
      gameMode:this.gameMode,
      initialPassiveGranted:this.initialPassiveGranted,
      multBase:{...GameData.BINGO_MULTIPLIER_BASE},
      corrBase:GameData.CORRECTION_BASE_SCORE,
      savedFloorStage: (this.currentStage?this.currentStage.key:''),
    };
  },
  fromSaveData(d){
    this.currentDeck=d.currentDeck||GameData.buildInitialDeck();
    this.relics=d.relics||[]; this.gold=d.gold||0;
    this.clearedStages=d.clearedStages||[];
    this.currentFloor=d.currentFloor||1;
    this.maxClearedFloor=d.maxClearedFloor||0;
    this.maxClearedStage=d.maxClearedStage||'';
    this.handSizeBonus=d.handSizeBonus||0; this.roundsBonus=d.roundsBonus||0;
    this.turnsBonus=d.turnsBonus||0; this.relicSlotBonus=d.relicSlotBonus||0;
    this.rerollBonus=d.rerollBonus||0;
    this.packCardBonus=d.packCardBonus||0;
    this.usedSpecialEffectIds=d.usedSpecialEffectIds||[];
    this.pendingBossEffect=d.pendingBossEffect||null;
    this.symbolPassiveTier=d.symbolPassiveTier||{ Circle:0, Triangle:0, Square:0, Cross:0, Hoshi:0, Check:0, Seven:0 };
    this.mana=Object.assign({ A:false, B:false, C:0, D:[], E:false }, d.mana||{});
    this.majin=Object.assign({ decided:{}, done1:false, done2:false, usedMajin:[], cleared:{} }, d.majin||{});
    this.passiveSuspended=null;
    if(this.symbolPassiveTier.Hoshi===undefined) this.symbolPassiveTier.Hoshi=0;
    if(this.symbolPassiveTier.Check===undefined) this.symbolPassiveTier.Check=0;
    if(this.symbolPassiveTier.Seven===undefined) this.symbolPassiveTier.Seven=0;
    this.totalBingoCount=d.totalBingoCount||0;
    this.sevenPendingMultBoost=d.sevenPendingMultBoost||false;
    this.bossRerollUsed=d.bossRerollUsed||false;
    this.finalShopDone=d.finalShopDone||false;
    this.gameMode=d.gameMode||'normal';
    this.initialPassiveGranted=d.initialPassiveGranted||false;
    this.migrateCards();
    if(d.multBase) Object.assign(GameData.BINGO_MULTIPLIER_BASE,d.multBase);
    if(d.corrBase!=null) GameData.CORRECTION_BASE_SCORE=d.corrBase;
  },
};
