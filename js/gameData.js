// ゲームデータ：静的なゲームデータを管理する
const GameData = {

  SYMBOLS: ['Circle', 'Triangle', 'Square', 'Cross'],

  SYMBOL_LABEL: { Circle:'○', Triangle:'△', Square:'□', Cross:'×' },

  // ビンゴ倍率の初期値（基礎＝3マス成立時／4列＝4マス成立時）
  BINGO_MULTIPLIER_BASE: { Circle:3, Triangle:3, Square:3, Cross:-3 },
  BINGO_MULTIPLIER_QUAD: { Circle:5, Triangle:5, Square:5, Cross:-5 },

  // 点数計算の初期値
  CORRECTION_BASE_SCORE: 10,   // 補正基礎点
  CORRECTION_MULTIPLIER: 0,    // 補正倍率
  FINAL_MULTIPLIER: 1,         // 最終倍率

  // ジャミング効果の説明文（カード効果確認用）
  JAMMING_DESC: {
    'スタン':       '次のNPCの行動を1回封じる（行動なしでターンだけ消費する）',
    'サンダー':     '発動時、盤面にある×を全て除去する',
    '混乱':         '次のNPCの行動を、盤面上で最もスコアの低いマスに強制する',
    'ブレイク':     '発動から4ターンの間、×だけのビンゴではラウンドが終了しなくなる',
    '延命':         'このカードが盤面にある間、×は4マスビンゴでないと成立しない',
    'ビンゴ阻害':   '盤面にある枚数に応じて×のビンゴ条件を厳しくする（1枚:斜め不可 / 2枚以上:3マス不可 / 4枚:×のビンゴ自体が不可）',
    'リンク':       '次のターン、NPCはこのカードの上下左右いずれかのマス（十字）にしか配置できない。配置できるマスがない場合、スタンと同じ効果になる',
  },

  // レリックプール（効果本実装はChap5予定。ショップでの提示・所持管理のみChap3で実装）
  RELIC_POOL: [
    { id:'r_circle_boost',  name:'マルビンゴ強化',   desc:'○のビンゴ倍率を上昇させる（効果はChap5で実装予定）' },
    { id:'r_odd_boost',     name:'奇数補正',         desc:'奇数の基礎点を持つカードの点数を上昇させる（効果はChap5で実装予定）' },
    { id:'r_even_boost',    name:'偶数補正',         desc:'偶数の基礎点を持つカードの点数を上昇させる（効果はChap5で実装予定）' },
    { id:'r_triangle_boost',name:'サンカク基礎点強化', desc:'△カードの基礎点を上昇させる（効果はChap5で実装予定）' },
    { id:'r_relic_boost',   name:'レリック強化',     desc:'他のレリックの効果を増幅する（効果はChap5で実装予定）' },
    { id:'r_charge',        name:'チャージ',         desc:'ラウンドが進むごとに倍率が蓄積する（効果はChap5で実装予定）' },
    { id:'r_draw_boost',    name:'ドロー強化',       desc:'手札の初期枚数を増やす（効果はChap5で実装予定）' },
    { id:'r_reroll_boost',  name:'リロール強化',     desc:'リロール可能回数を増やす（効果はChap5で実装予定）' },
    { id:'r_gold_boost',    name:'G獲得強化',        desc:'クリア報酬のGを増加させる（効果はChap5で実装予定）' },
    { id:'r_empty_boost',   name:'空きマス強化',     desc:'盤面の空きマスが多いほど倍率が上昇する（効果はChap5で実装予定）' },
  ],

  // ショップのカードパックから出現するランダムカードを生成
  generateShopCard(){
    const symbol = GlobalFunctions.randChoice(['Circle', 'Triangle', 'Square']);
    const baseScore = GlobalFunctions.randInt(1, 50);
    let jamming = null;
    if(Math.random() < 0.5){
      jamming = GlobalFunctions.randChoice(Object.keys(this.JAMMING_DESC));
    }
    // 強化(20%)・性質変化(5%)の付与はChap4で効果を実装してから対応予定
    return {
      id: 'shopcard_' + Date.now() + '_' + Math.floor(Math.random() * 100000),
      symbol,
      number: baseScore,
      baseScore,
      jamming,
      enhance: null,
      trait: null,
    };
  },

  SHOP_PRICES: { relic:2, cardPack:3, normalUpgrade:3, specialUpgrade:10, reroll:1 },

  // セレクトパック内容（エクセル「セレクトパック」シート準拠）
  NORMAL_SELECT_POOL: [
    { id:'circle_mult',    name:'マルビンゴ強化',     desc:'○のビンゴ倍率を+3する',                              targetMin:0, targetMax:0 },
    { id:'cross_mult',     name:'バツビンゴ強化',     desc:'×のビンゴ倍率を+5する',                              targetMin:0, targetMax:0 },
    { id:'square_mult',    name:'シカクビンゴ強化',   desc:'□のビンゴ倍率を+3する',                              targetMin:0, targetMax:0 },
    { id:'triangle_mult',  name:'サンカクビンゴ強化', desc:'△のビンゴ倍率を+3する',                              targetMin:0, targetMax:0 },
    { id:'number_up2',     name:'数値上昇',           desc:'カードを2枚選択し、それぞれ基礎点+1する',            targetMin:2, targetMax:2 },
    { id:'base_up5',       name:'基礎点上昇',         desc:'カードを1枚選択し、基礎点+5する',                    targetMin:1, targetMax:1 },
    { id:'symbol_change',  name:'記号変化',           desc:'カードを最大3枚選択し、それぞれ別の記号にランダムで変化させる', targetMin:1, targetMax:3 },
    { id:'cash_in',        name:'換金',               desc:'カードを1枚デッキから取り除き、1+強化数ぶんのGを得る', targetMin:1, targetMax:1 },
    { id:'duplicate',      name:'複製',               desc:'カードを1枚選択し、同じカードを複製してデッキに加える', targetMin:1, targetMax:1 },
    { id:'grant_enhance',  name:'強化効果付与',       desc:'カードを1枚選択し、ランダムな強化効果を付与する',      targetMin:1, targetMax:1 },
    { id:'grant_jamming',  name:'ジャミング効果付与', desc:'カードを1枚選択し、ランダムなジャミング効果を付与する', targetMin:1, targetMax:1 },
    { id:'all_mult_up1',   name:'オールビンゴ強化',   desc:'全記号のビンゴ倍率を+1する',                          targetMin:0, targetMax:0 },
  ],
  SPECIAL_SELECT_POOL: [
    { id:'grant_trait',     name:'性質変化効果付与',   desc:'カードを1枚選択し、ランダムな性質変化効果を付与する', targetMin:1, targetMax:1 },
    { id:'hand_up2',        name:'手札増加',           desc:'手札の上限が2枚増加する',                          targetMin:0, targetMax:0 },
    { id:'reroll_up2',      name:'リロール増加',       desc:'リロール回数を2回増加する',                        targetMin:0, targetMax:0 },
    { id:'round_up1',       name:'ラウンド増加',       desc:'挑戦できるラウンド数が1増加する',                  targetMin:0, targetMax:0 },
    { id:'turn_up1',        name:'ターン増加',         desc:'1ラウンドのターン数が1増加する',                   targetMin:0, targetMax:0 },
    { id:'relic_slot_up1',  name:'レリック所持数増加', desc:'レリック所持数上限が1増加する',                    targetMin:0, targetMax:0 },
  ],
  // 強化・性質変化の名称プール（効果本実装はChap4予定。付与のみChap3で先行対応）
  ENHANCE_NAME_POOL: ['数値強化','拡大','拡張','マルマルチ','サンカクマルチ','シカクマルチ','バツマルチ','ハブ','連鎖','オールマルチ'],
  TRAIT_NAME_POOL: ['塗りつぶし','指令官','ネガティブ','ディスカード','レリック特攻','ミニマム','マキシマム','将軍','保留','竜頭蛇尾'],
  BOARD_SIZE: 4,
  TURNS_PER_ROUND: 16,
  MAX_ROUNDS: 4,
  HAND_SIZE: 8,
  MAX_HAND: 10,
  MAX_RESERVE: 2,
  INITIAL_REROLL: 5,

  // 初期デッキ 30枚（丸・三角・四角 各1〜10）
  // ジャミング効果はChap2で実装予定のためデータのみ保持
  buildInitialDeck(){
    const jammingMap = {
      Circle:   { 1:'スタン', 2:'サンダー', 3:'混乱', 4:'ブレイク' },
      Triangle: { 1:'スタン', 2:'サンダー', 3:'リンク', 4:'延命' },
      Square:   { 1:'ビンゴ阻害', 2:'ビンゴ阻害', 3:'ビンゴ阻害', 4:'ビンゴ阻害' },
    };
    const deck = [];
    let id = 0;
    for(const symbol of ['Circle', 'Triangle', 'Square']){
      for(let number = 1; number <= 10; number++){
        deck.push({
          id: 'card_' + (id++),
          symbol,
          number,
          baseScore: number,      // カード基礎点
          jamming: (jammingMap[symbol] && jammingMap[symbol][number]) || null,
          enhance: null,          // 強化効果（Chap4予定）
          trait: null,            // 性質変化（Chap4予定）
        });
      }
    }
    return deck;
  },

  // クリア/スキップ報酬（仮値。バランス調整はChap6予定）
  CLEAR_REWARD_BASE: { common:3, high:5, boss:8 },
  SKIP_REWARD_BASE:  { common:2, high:3 },

  // ステージ構成（Chap1は1階層のみ実装。目標点数は仮値でありバランス調整はChap6予定）
  STAGE_TYPES: [
    { key:'common', name:'コモン', tag:'COMMON', targetScore:250, skippable:true },
    { key:'high',   name:'ハイレベル', tag:'HIGH LEVEL', targetScore:450, skippable:true },
    { key:'boss',   name:'ボス', tag:'BOSS', targetScore:700, skippable:false },
  ],
};
