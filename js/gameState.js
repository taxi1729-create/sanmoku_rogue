const GameState = {
  currentDeck:[], hand:[], reserve:[], drawPile:[], discardPile:[], discardedPile:[],
  targetScore:0, currentScore:0, relics:[], gold:0, round:1, turn:1, currentStage:null,
  clearedStages:[], lastReward:null, rerollCount:GameData.INITIAL_REROLL,
  handSizeBonus:0, roundsBonus:0, turnsBonus:0, relicSlotBonus:0, rerollBonus:0,
  usedSpecialEffectIds:[], specialPackExhausted:false, pendingBossEffect:null,
  currentFloor:1,          // #12 現在の階層
  maxClearedFloor:0,        // #12 最高クリア階層
  maxClearedStage:'',       // #12 最高クリアステージ名
  symbolPassiveTier:{ Circle:0, Triangle:0, Square:0, Cross:0, Hoshi:0, Check:0 }, // #A 記号パッシブ（0=未取得,1-3=段階）
  bingoCountThisStage:0, // #8 チェックパッシブ3：このステージのビンゴ回数
  bossRerollUsed:false, // #3 ホシパッシブ1：ボス効果リロールの使用済みフラグ

  effectiveHandSize(){ return GameData.HAND_SIZE + this.handSizeBonus; },
  effectiveMaxRounds(){ return GameData.MAX_ROUNDS + this.roundsBonus; },
  effectiveTurnsPerRound(){ return GameData.TURNS_PER_ROUND + this.turnsBonus; },
  effectiveMaxRelics(){ return GameData.MAX_RELICS + this.relicSlotBonus; },
  hasRelic(id){ return this.relics.some(r=>r.id===id); },
  // #1(B) レリック所持数計算：ネガティブ=0枠、倍化=2枠、3倍化=3枠、通常=1枠
  slotsForRelic(relic){
    const ren=relic?.relicEnhance;
    if(ren==='ren_negative') return 0;
    if(ren==='ren_triple') return 3;
    if(ren==='ren_double') return 2;
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

  initNewGame(){
    this.currentDeck=GameData.buildInitialDeck();
    this.gold=0; this.relics=[]; this.clearedStages=[];
    this.rerollCount=GameData.INITIAL_REROLL;
    this.handSizeBonus=0; this.roundsBonus=0; this.turnsBonus=0;
    this.relicSlotBonus=0; this.rerollBonus=0;
    this.usedSpecialEffectIds=[]; this.discardedPile=[];
    this.specialPackExhausted=false; this.pendingBossEffect=null;
    this.currentFloor=1;
    this.symbolPassiveTier={ Circle:0, Triangle:0, Square:0, Cross:0, Hoshi:0, Check:0 };
    this.bingoCountThisStage=0;
    GameData.BINGO_MULTIPLIER_BASE={...GameData.BINGO_MULTIPLIER_BASE_ORIGINAL};
    GameData.CORRECTION_BASE_SCORE=0; GameData.CORRECTION_MULTIPLIER=0;
    GameData.FINAL_MULTIPLIER=1; GameData.FINAL_ADD=0;
  },
  initStage(stage){
    this.currentStage=stage;
    this.targetScore=stage.targetScore;
    this.currentScore=0; this.round=1; this.turn=1;
    this.rerollCount=GameData.INITIAL_REROLL+this.rerollBonus;
    this.hand=[]; this.reserve=[]; this.discardPile=[];
    this.drawPile=GlobalFunctions.shuffle(this.currentDeck);
  },

  // #8 セーブデータ変換
  toSaveData(){
    return {
      currentDeck:this.currentDeck, relics:this.relics, gold:this.gold,
      clearedStages:this.clearedStages, currentFloor:this.currentFloor,
      maxClearedFloor:this.maxClearedFloor, maxClearedStage:this.maxClearedStage,
      handSizeBonus:this.handSizeBonus, roundsBonus:this.roundsBonus,
      turnsBonus:this.turnsBonus, relicSlotBonus:this.relicSlotBonus,
      rerollBonus:this.rerollBonus, usedSpecialEffectIds:this.usedSpecialEffectIds,
      pendingBossEffect:this.pendingBossEffect,
      symbolPassiveTier:this.symbolPassiveTier,
      bossRerollUsed:this.bossRerollUsed,
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
    this.usedSpecialEffectIds=d.usedSpecialEffectIds||[];
    this.pendingBossEffect=d.pendingBossEffect||null;
    this.symbolPassiveTier=d.symbolPassiveTier||{ Circle:0, Triangle:0, Square:0, Cross:0, Hoshi:0, Check:0 };
    if(this.symbolPassiveTier.Hoshi===undefined) this.symbolPassiveTier.Hoshi=0;
    if(this.symbolPassiveTier.Check===undefined) this.symbolPassiveTier.Check=0;
    this.bossRerollUsed=d.bossRerollUsed||false;
    if(d.multBase) Object.assign(GameData.BINGO_MULTIPLIER_BASE,d.multBase);
    if(d.corrBase!=null) GameData.CORRECTION_BASE_SCORE=d.corrBase;
  },
};
