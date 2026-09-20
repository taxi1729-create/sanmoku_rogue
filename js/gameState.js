const GameState = {
  currentDeck:[], hand:[], reserve:[], drawPile:[], discardPile:[], discardedPile:[],
  targetScore:0, currentScore:0, relics:[], gold:0, round:1, turn:1, currentStage:null,
  clearedStages:[], lastReward:null, rerollCount:GameData.INITIAL_REROLL,
  handSizeBonus:0, roundsBonus:0, turnsBonus:0, relicSlotBonus:0, rerollBonus:0,
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
    this.relicSlotBonus=0; this.rerollBonus=0;
    this.usedSpecialEffectIds=[]; this.discardedPile=[];
    this.specialPackExhausted=false; this.pendingBossEffect=null;
    this.currentFloor=1;
    this.symbolPassiveTier={ Circle:0, Triangle:0, Square:0, Cross:0, Hoshi:0, Check:0, Seven:0 };
    this.bingoCountThisStage=0;
    this.totalBingoCount=0; this.sevenPendingMultBoost=false;
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
      rerollBonus:this.rerollBonus, usedSpecialEffectIds:this.usedSpecialEffectIds,
      pendingBossEffect:this.pendingBossEffect,
      symbolPassiveTier:this.symbolPassiveTier,
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
    this.usedSpecialEffectIds=d.usedSpecialEffectIds||[];
    this.pendingBossEffect=d.pendingBossEffect||null;
    this.symbolPassiveTier=d.symbolPassiveTier||{ Circle:0, Triangle:0, Square:0, Cross:0, Hoshi:0, Check:0, Seven:0 };
    if(this.symbolPassiveTier.Hoshi===undefined) this.symbolPassiveTier.Hoshi=0;
    if(this.symbolPassiveTier.Check===undefined) this.symbolPassiveTier.Check=0;
    if(this.symbolPassiveTier.Seven===undefined) this.symbolPassiveTier.Seven=0;
    this.totalBingoCount=d.totalBingoCount||0;
    this.sevenPendingMultBoost=d.sevenPendingMultBoost||false;
    this.bossRerollUsed=d.bossRerollUsed||false;
    this.finalShopDone=d.finalShopDone||false;
    this.gameMode=d.gameMode||'normal';
    this.initialPassiveGranted=d.initialPassiveGranted||false;
    if(d.multBase) Object.assign(GameData.BINGO_MULTIPLIER_BASE,d.multBase);
    if(d.corrBase!=null) GameData.CORRECTION_BASE_SCORE=d.corrBase;
  },
};
