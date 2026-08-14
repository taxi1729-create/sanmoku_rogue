const GameData = {
  SYMBOLS: ['Circle', 'Triangle', 'Square', 'Cross'],
  SYMBOL_LABEL: { Circle:'○', Triangle:'△', Square:'□', Cross:'×' },

  BINGO_MULTIPLIER_BASE: { Circle:7, Triangle:7, Square:3, Cross:-30 },
  QUAD_MULTIPLIER_FACTOR: 1.5,
  REWARD_FLAT_BONUS: 1,
  quadMult(symbol){ return this.BINGO_MULTIPLIER_BASE[symbol] * this.QUAD_MULTIPLIER_FACTOR; },

  CORRECTION_BASE_SCORE: 10,
  CORRECTION_MULTIPLIER: 0,
  FINAL_MULTIPLIER: 1,

  JAMMING_DESC: {
    'スタン':   '次のNPCターン、NPC行動を封じる',
    'サンダー': '配置時、盤面のバツを全て取り除く',
    '混乱':     '次のNPCターン、最低点マスに配置する',
    'ブレイク': '配置から4ターン、バツビンゴでラウンド終了しない',
    '延命':     '盤面にある間、バツは4列ビンゴのみ有効',
    'ビンゴ阻害':'盤面n枚で段階的にNPCのバツビンゴを制限する（1枚:縦不可 / 2枚:縦横不可 / 3枚以上:不可）',
    'リンク':   '次のNPCターン、このカードの十字マスにしか置けない。置けない場合スタン',
    '引き直し': '配置時、直前のNPCが置いたバツを取り除く。次のNPCターン、そのマス以外に置けない。他に置けない場合スタン',
    '封印':     '次のNPCターン、このカードの周囲8マスに置けない。他に置けない場合スタン',
    '誘導':     '次のNPCターン、盤面中央4マス（2-3列/行）にしか置けない。他に置けない場合スタン',
  },

  ENHANCE_DESC: {
    '数値強化':     'カード基礎点+15点（付与時に即時加算）',
    '拡大':         '2×2マスで配置できる（全マス空き必須。塗りつぶし例外）',
    '横拡張':       '1×2マスで横に配置できる（全マス空き必須。塗りつぶし例外）',
    '縦拡張':       '2×1マスで縦に配置できる（全マス空き必須。塗りつぶし例外）',
    'マルマルチ':   'マル記号扱いにもなる。元の記号がマルの場合カード基礎点+20',
    'サンカクマルチ':'サンカク記号扱いにもなる。元の記号がサンカクの場合カード基礎点+20',
    'シカクマルチ': 'シカク記号扱いにもなる。元の記号がシカクの場合カード基礎点+20',
    'バツマルチ':   'バツ記号扱いにもなる',
    'ハブ':         'ビンゴ時、2つ以上のビンゴに関わるマスはカード基礎点×1.5',
    '連鎖':         '盤面の連鎖カード数nに応じビンゴ時カード基礎点+30n',
    'オールマルチ': 'マル・サンカク・シカク記号扱いになる',
    '巨大化':       '盤面にある間、ターン消費ごとに基礎点+3',
    '肥大化':       '盤面にある間、ターン消費ごとにビンゴ倍率×2点を現在点数に加算',
    'ブルジョワ':   'カード基礎点+4×現在G（付与時に即時加算）',
    'ドロー':       '盤面配置時にカードを1枚ドロー',
  },
  ENHANCE_NAME_POOL: ['数値強化','横拡張','縦拡張','マルマルチ','サンカクマルチ','シカクマルチ','バツマルチ','ハブ','連鎖','オールマルチ','巨大化','ブルジョワ','ドロー'],

  TRAIT_DESC: {
    '塗りつぶし':   '使用中マスを含む好きなマスに配置できる',
    '指令官':       'ターン7・8でビンゴした時、補正倍率×1.2',
    'ネガティブ':   '使用してもターンが終了せず追加ターンになる',
    'ディスカード': '捨て札になった時2G得る',
    'レリック特攻': '基礎点+(50-10n) n=レリック所持数',
    'ミニマム':     'ビンゴ時、盤面最少記号の数を補正倍率に加算',
    'マキシマム':   'ビンゴ時、最多記号とビンゴ記号が同じなら補正倍率+1',
    '将軍':         'ビンゴ時、手札にある場合最終倍率×1.1',
    '保留':         'ラウンド終了時、捨て札にならず保留される',
    '竜頭蛇尾':     '基礎点+300（即時）。手札に来るたびに-100',
  },
  TRAIT_NAME_POOL: ['塗りつぶし','指令官','ネガティブ','ディスカード','レリック特攻','ミニマム','マキシマム','将軍','保留','竜頭蛇尾'],

  applyGrantSideEffects(card, gold=0){
    if(card.enhance === '数値強化') card.baseScore += 15;
    if(card.trait === '竜頭蛇尾') card.baseScore += 300;
    if(card.enhance === 'ブルジョワ') card.baseScore += 4 * gold;
    // マルチ系の即時+20（元記号がマルチ記号と同じなら）
    const multiMap = { 'マルマルチ':'Circle', 'サンカクマルチ':'Triangle', 'シカクマルチ':'Square' };
    const matched = multiMap[card.enhance];
    if(matched && card.symbol === matched) card.baseScore += 20;
  },

  // レリック強化プール
  RELIC_ENHANCE_POOL: [
    { id:'ren_discard',   name:'廃棄強化',   desc:'捨て札は廃棄札に移動する。ビンゴ倍率×3' },
    { id:'ren_circle',    name:'マルオール',  desc:'ビンゴ時補正基礎点+n（n=デッキのマルカード数）' },
    { id:'ren_square',    name:'シカクオール',desc:'ビンゴ時補正基礎点+n（n=デッキのシカクカード数）' },
    { id:'ren_triangle',  name:'サンカクオール',desc:'ビンゴ時補正基礎点+n（n=デッキのサンカクカード数）' },
    { id:'ren_only_one',  name:'オンリーワン',desc:'レリック所持数が1つの時、補正倍率+20' },
    { id:'ren_pair',      name:'ペアルック',  desc:'同じレリックを持っている時、カード基礎点+40' },
    { id:'ren_negative',  name:'ネガティブ',  desc:'このレリックは所持数に加算されない' },
    { id:'ren_discard_sell',name:'ディスカード',desc:'売却時デッキ枚数/2（切捨て）Gを得る' },
    { id:'ren_general',   name:'将軍',        desc:'ビンゴ時、最終倍率×1.1' },
    { id:'ren_all_link',  name:'オールリンク',desc:'NPCは常時リンク状態（前ターンのプレイヤー配置に隣接）' },
    { id:'ren_gold',      name:'G獲得',       desc:'ステージクリア時追加で1G得る' },
    { id:'ren_draw',      name:'ドロー強化',  desc:'ラウンド終了時カードを1枚ドロー' },
    { id:'ren_double',    name:'倍化',        desc:'2個分とカウント。ビンゴ倍率×1.5' },
    { id:'ren_triple',    name:'3倍化',       desc:'3個分とカウント。ビンゴ倍率×2' },
    { id:'ren_cross',     name:'バツ強化',    desc:'バツ倍率×5' },
    { id:'ren_npc',       name:'NPC強化',     desc:'NPCが2回行動。補正基礎点×5' },
    { id:'ren_draw_pile', name:'山札強化',    desc:'ビンゴ時補正基礎点+n（n=山札数）' },
    { id:'ren_disc_pile', name:'捨て札強化',  desc:'ビンゴ時補正基礎点+n（n=捨て札数）' },
    { id:'ren_black',     name:'ブラックカード',desc:'ショップ金額が半額（切り上げ）になる' },
    { id:'ren_first',     name:'手番高速',    desc:'全ラウンドで最初の手番がプレイヤーになる' },
    { id:'ren_grade',     name:'グレードオール',desc:'ビンゴ時ビンゴ倍率+n（n=デッキの強化/ジャミング/性質変化の総数）' },
  ],

  RELIC_POOL: [
    { id:'bingo',          name:'ビンゴ',           desc:'ビンゴした時、補正基礎点+30' },
    { id:'charge',         name:'チャージ',         desc:'前ラウンドでスコアが増加しなかった場合、次ラウンドの間補正基礎点+100' },
    { id:'double',         name:'ダブル',           desc:'同一ターンにビンゴが2つ以上ある時、最終倍率×1.5' },
    { id:'odd_boost',      name:'奇数補正',         desc:'ビンゴで加算される基礎点が奇数の度に補正基礎点+15' },
    { id:'even_boost',     name:'偶数補正',         desc:'ビンゴで加算される基礎点が偶数の度に補正基礎点+15' },
    { id:'circle_boost',   name:'マル補正',         desc:'マルでビンゴした時、補正基礎点+60' },
    { id:'triangle_boost', name:'サンカク補正',     desc:'サンカクでビンゴした時、補正基礎点+60' },
    { id:'square_boost',   name:'シカク補正',       desc:'シカクでビンゴした時、補正基礎点+60' },
    { id:'combo',          name:'コンボ',           desc:'前ラウンドと異なる記号でビンゴした時、補正倍率+1.5' },
    { id:'relic_boost',    name:'レリック強化',     desc:'レリック所持数nに応じ、補正基礎点+5+8n' },
    { id:'paint',          name:'ペイント',         desc:'全カードに塗りつぶし付与。1ラウンドのターン数-2' },
    { id:'turn_boost',     name:'ターン強化',       desc:'ビンゴ時、経過ターン数nに応じてスコア×1.1^n' },
    { id:'jamming_boost',  name:'ジャミング増強',   desc:'リロール回数-3回' },
    { id:'empty_boost',    name:'空きマス強化',     desc:'ビンゴ時、空きマス数nに応じ補正倍率+6n+5' },
    { id:'draw_boost',     name:'ドロー強化',       desc:'ターン終了時カードを1枚ドロー' },
    { id:'last_stand',     name:'背水の陣',         desc:'4ラウンド以降、最終倍率×2' },
    { id:'base_boost',     name:'補正基礎点強化',   desc:'補正基礎点+200' },
    { id:'round_boost',    name:'ラウンド強化',     desc:'挑戦できるラウンド数+1（購入時即時）' },
    { id:'reroll_boost',   name:'リロール強化',     desc:'リロール回数+2（購入時即時）' },
    { id:'hand_boost',     name:'手札強化',         desc:'手札上限+3（購入時即時）' },
    { id:'gold_boost',     name:'G獲得',            desc:'ステージクリア時、追加でG+3を得る' },
  ],

  BOSS_EFFECT_POOL: [
    { id:'cross5000',    name:'バツ5000',       desc:'×のカード基礎点が5000点になる' },
    { id:'block_cells',  name:'マス妨害',       desc:'盤面の4つのランダムなマスが使用不可になる' },
    { id:'quad_only',    name:'４ビンゴ',       desc:'お互い4列でないとビンゴできない' },
    { id:'blackout',     name:'ブラックアウト', desc:'手札は記号が？に隠れる。カード強化のみ確認可。盤面に出したら表示される' },
    { id:'unify',        name:'統一',           desc:'マル・サンカク・シカクいずれか1記号のビンゴ倍率+10、他は-20' },
    { id:'no_relic',     name:'レリック使用不可',desc:'レリックの効果が発動しない' },
    { id:'cross_corner', name:'バツ配置',       desc:'×が盤面四隅に置かれた状態でラウンドが始まる' },
    { id:'turn_limit',   name:'ターン制限',     desc:'1ラウンドのターン数が10ターム固定になる（終了後元に戻る）' },
    { id:'reroll_limit', name:'リロール制限',   desc:'リロール回数が0回になる' },
    { id:'hand_limit',   name:'手札制限',       desc:'手札の上限-1' },
    { id:'discard_used', name:'廃棄',           desc:'盤面に使用したカードは廃棄札に移動し、デッキに戻らない' },
  ],

  MAX_RELICS: 5,

  generateShopCard(){
    const symbol = GlobalFunctions.randChoice(['Circle', 'Triangle', 'Square']);
    const baseScore = GlobalFunctions.randInt(1, 50);
    let jamming = Math.random() < 0.5 ? GlobalFunctions.randChoice(Object.keys(this.JAMMING_DESC)) : null;
    let enhance = Math.random() < 0.2 ? GlobalFunctions.randChoice(this.ENHANCE_NAME_POOL) : null;
    let trait = Math.random() < 0.05 ? GlobalFunctions.randChoice(this.TRAIT_NAME_POOL) : null;
    const card = { id:'shopcard_'+Date.now()+'_'+Math.floor(Math.random()*100000), symbol, number:baseScore, baseScore, jamming, enhance, trait };
    this.applyGrantSideEffects(card);
    return card;
  },

  SHOP_PRICES: { relic:5, cardPack:2, normalUpgrade:3, normalPack:3, specialUpgrade:10, reroll:1,
                 cardFocus:6, bingoFocus:4, dreamCard:20, pickupUpgrade:3 },

  NORMAL_SELECT_POOL: [
    { id:'circle_mult',   name:'マルビンゴ強化',    desc:'○のビンゴ倍率を+4する',                     targetMin:0, targetMax:0 },
    { id:'cross_mult',    name:'バツビンゴ強化',    desc:'×のビンゴ倍率を+5する',                     targetMin:0, targetMax:0 },
    { id:'square_mult',   name:'シカクビンゴ強化',  desc:'□のビンゴ倍率を+4する',                     targetMin:0, targetMax:0 },
    { id:'triangle_mult', name:'サンカクビンゴ強化',desc:'△のビンゴ倍率を+4する',                     targetMin:0, targetMax:0 },
    { id:'number_up2',    name:'数値上昇',          desc:'カードを2枚選択し、それぞれ基礎点+5する',    targetMin:2, targetMax:2 },
    { id:'number_up3',    name:'数値上昇3',         desc:'カードを3枚選択し、それぞれ基礎点+3する',    targetMin:3, targetMax:3 },
    { id:'base_up5',      name:'基礎点上昇',        desc:'カードを1枚選択し、基礎点+5する',            targetMin:1, targetMax:1 },
    { id:'symbol_change', name:'記号変化',          desc:'カードを最大3枚選択し記号をランダム変化',    targetMin:1, targetMax:3 },
    { id:'cash_in',       name:'換金',              desc:'カードを1枚取り除きG獲得（強化数+1G）',      targetMin:1, targetMax:1 },
    { id:'duplicate',     name:'複製',              desc:'カードを1枚選択し複製',                      targetMin:1, targetMax:1 },
    { id:'grant_enhance', name:'カード強化付与',    desc:'カードを1枚選択しランダムなカード強化を付与',targetMin:1, targetMax:1 },
    { id:'grant_jamming', name:'ジャミング効果付与',desc:'カードを1枚選択しランダムなジャミングを付与',targetMin:1, targetMax:1 },
    { id:'all_mult_up1',  name:'オールビンゴ強化',  desc:'全記号のビンゴ倍率を+1する',                 targetMin:0, targetMax:0 },
  ],
  SPECIAL_SELECT_POOL: [
    { id:'grant_trait',    name:'性質変化効果付与',  desc:'カードを1枚選択しランダムな性質変化を付与', targetMin:1, targetMax:1 },
    { id:'hand_up2',       name:'手札増加',          desc:'手札の上限が2枚増加する',                  targetMin:0, targetMax:0 },
    { id:'reroll_up2',     name:'リロール増加',       desc:'リロール回数を2回増加する',                targetMin:0, targetMax:0 },
    { id:'round_up1',      name:'ラウンド増加',       desc:'挑戦できるラウンド数が1増加する',          targetMin:0, targetMax:0 },
    { id:'turn_up1',       name:'ターン増加',         desc:'1ラウンドのターン数が1増加する',           targetMin:0, targetMax:0 },
    { id:'relic_slot_up1', name:'レリック所持数増加', desc:'レリック所持数上限が1増加する',            targetMin:0, targetMax:0 },
  ],

  BOARD_SIZE: 4,
  TURNS_PER_ROUND: 16,
  MAX_ROUNDS: 4,
  HAND_SIZE: 9,
  MAX_RESERVE: 2,
  INITIAL_REROLL: 5,

  buildInitialDeck(){
    const jammingMap = {
      Circle:   { 1:'スタン', 2:'サンダー', 3:'混乱', 4:'ブレイク' },
      Triangle: { 1:'スタン', 2:'サンダー', 3:'リンク', 4:'延命' },
      Square:   { 1:'ビンゴ阻害', 2:'ビンゴ阻害', 3:'ビンゴ阻害', 4:'ビンゴ阻害' },
    };
    const deck = [];
    let id = 0;
    for(const symbol of ['Circle','Triangle','Square']){
      for(let number = 1; number <= 10; number++){
        deck.push({ id:'card_'+(id++), symbol, number, baseScore:number,
          jamming:(jammingMap[symbol]&&jammingMap[symbol][number])||null, enhance:null, trait:null });
      }
    }
    return deck;
  },

  CLEAR_REWARD_BASE: { common:3, high:5, boss:8 },
  SKIP_REWARD_BASE:  { common:2, high:3 },

  STAGE_TYPES: [
    { key:'common', name:'コモン',    tag:'COMMON',     targetScore:250, skippable:true },
    { key:'high',   name:'ハイレベル',tag:'HIGH LEVEL', targetScore:450, skippable:true },
    { key:'boss',   name:'ボス',      tag:'BOSS',       targetScore:700, skippable:false },
  ],
};
