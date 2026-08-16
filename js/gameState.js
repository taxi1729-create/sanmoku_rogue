const GameState = {
  currentDeck:[], hand:[], reserve:[], drawPile:[], discardPile:[], discardedPile:[],
  targetScore:0, currentScore:0, relics:[], gold:0, round:1, turn:1, currentStage:null,
  clearedStages:[], lastReward:null, rerollCount:GameData.INITIAL_REROLL,
  pendingBossEffect:null,   // #2 ボスステージに入る前から確定したボス効果
  handSizeBonus:0, roundsBonus:0, turnsBonus:0, relicSlotBonus:0, rerollBonus:0,
  usedSpecialEffectIds:[], specialPackExhausted:false,

  effectiveHandSize(){ return GameData.HAND_SIZE + this.handSizeBonus; },
  effectiveMaxRounds(){ return GameData.MAX_ROUNDS + this.roundsBonus; },
  effectiveTurnsPerRound(){ return GameData.TURNS_PER_ROUND + this.turnsBonus; },
  effectiveMaxRelics(){ return GameData.MAX_RELICS + this.relicSlotBonus; },
  hasRelic(id){ return this.relics.some(r => r.id === id); },

  relicCount(){
    let n = 0;
    for(const r of this.relics){
      const ren = r.relicEnhance;
      if(ren === 'ren_negative') continue;
      if(ren === 'ren_triple'){ n += 3; continue; }
      if(ren === 'ren_double'){ n += 2; continue; }
      n += 1;
    }
    return n;
  },

  shopPriceOf(basePrice){
    const hasBlack = this.relics.some(r => r.relicEnhance === 'ren_black');
    return hasBlack ? Math.ceil(basePrice / 2) : basePrice;
  },

  initNewGame(){
    this.currentDeck = GameData.buildInitialDeck();
    this.gold = 0; this.relics = []; this.clearedStages = [];
    this.rerollCount = GameData.INITIAL_REROLL;
    this.handSizeBonus = 0; this.roundsBonus = 0; this.turnsBonus = 0;
    this.relicSlotBonus = 0; this.rerollBonus = 0;
    this.usedSpecialEffectIds = []; this.discardedPile = [];
    this.specialPackExhausted = false; this.pendingBossEffect = null;
    GameData.BINGO_MULTIPLIER_BASE = { ...GameData.BINGO_MULTIPLIER_BASE_ORIGINAL };
    GameData.CORRECTION_BASE_SCORE = 0;
    GameData.CORRECTION_MULTIPLIER = 0;
    GameData.FINAL_MULTIPLIER = 1;
    GameData.FINAL_ADD = 0;
  },

  initStage(stage){
    this.currentStage = stage;
    this.targetScore = stage.targetScore;
    this.currentScore = 0; this.round = 1; this.turn = 1;
    this.rerollCount = GameData.INITIAL_REROLL + this.rerollBonus;
    this.hand = []; this.reserve = []; this.discardPile = [];
    this.drawPile = GlobalFunctions.shuffle(this.currentDeck);
  },
};
