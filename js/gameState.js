// ゲームステート：ゲーム進行状況・変動する状態を管理する
const GameState = {
  currentDeck: [],     // 現在のデッキ（所持カード全体）
  hand: [],            // 手札
  reserve: [],         // 保留札（最大2枚・選択UIはChap2以降で実装予定）
  drawPile: [],        // 山札
  discardPile: [],     // 捨て札
  discardedPile: [],   // 廃棄札（Chap2以降で使用予定）

  targetScore: 0,       // 目標点数
  currentScore: 0,      // 現在の点数

  relics: [],           // 所持レリック（Chap5で実装予定）
  gold: 0,               // 所持ゴールド

  round: 1,              // 現在ラウンド
  turn: 1,                // 現在ターン
  currentStage: null,     // 現在挑戦中のステージ設定

  clearedStages: [],      // クリア/スキップ済みステージ（Chap1では簡易表示用）
  lastReward: null,        // 直近のクリア/スキップ報酬（ショップ表示用）
  rerollCount: GameData.INITIAL_REROLL,

  // 特別セレクト等で得られる恒常ボーナス（1周＝新規ゲームごとにリセット）
  handSizeBonus: 0,
  roundsBonus: 0,
  turnsBonus: 0,
  relicSlotBonus: 0,

  effectiveHandSize(){ return GameData.HAND_SIZE + this.handSizeBonus; },
  effectiveMaxRounds(){ return GameData.MAX_ROUNDS + this.roundsBonus; },
  effectiveTurnsPerRound(){ return GameData.TURNS_PER_ROUND + this.turnsBonus; },

  // 新規ゲーム開始時の初期化
  initNewGame(){
    this.currentDeck = GameData.buildInitialDeck();
    this.gold = 0;
    this.relics = [];
    this.clearedStages = [];
    this.rerollCount = GameData.INITIAL_REROLL;
    this.handSizeBonus = 0;
    this.roundsBonus = 0;
    this.turnsBonus = 0;
    this.relicSlotBonus = 0;
  },

  // ステージ（1回のゲーム本編プレイ）開始時の初期化
  initStage(stage){
    this.currentStage = stage;
    this.targetScore = stage.targetScore;
    this.currentScore = 0;
    this.round = 1;
    this.turn = 1;
    this.rerollCount = GameData.INITIAL_REROLL;
    this.hand = [];
    this.reserve = [];
    this.discardPile = [];
    this.drawPile = GlobalFunctions.shuffle(this.currentDeck);
  },
};
