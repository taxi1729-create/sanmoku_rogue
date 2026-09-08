const GameData = {
  SYMBOLS: ['Circle', 'Triangle', 'Square', 'Cross'],
  SYMBOL_LABEL: { Circle:'○', Triangle:'△', Square:'□', Cross:'×', Hoshi:'☆', Check:'✓' },
  MULTI_SYMBOL_LABEL: { 'マルマルチ':'○', 'サンカクマルチ':'△', 'シカクマルチ':'□', 'バツマルチ':'×', 'オールマルチ':'○△□' },

  // #1 シカクを7倍に修正
  BINGO_MULTIPLIER_BASE: { Circle:7, Triangle:7, Square:7, Cross:-30 },
  BINGO_MULTIPLIER_BASE_ORIGINAL: { Circle:7, Triangle:7, Square:7, Cross:-30 },
  QUAD_MULTIPLIER_FACTOR: 1.5,
  // #3 ホシパッシブLv2用：5列ビンゴは3列ビンゴの倍率の2倍
  PENTA_MULTIPLIER_FACTOR: 2,
  pentaMult(symbol){ return this.BINGO_MULTIPLIER_BASE[symbol] * this.PENTA_MULTIPLIER_FACTOR; },
  REWARD_FLAT_BONUS: 1,
  quadMult(symbol){ return this.BINGO_MULTIPLIER_BASE[symbol] * this.QUAD_MULTIPLIER_FACTOR; },

  // #18 点数計算変数の初期値を明記
  CORRECTION_BASE_SCORE: 0,   // 補正基礎点
  CORRECTION_MULTIPLIER: 0,   // 補正倍率
  FINAL_MULTIPLIER: 1,        // 最終乗算補正
  FINAL_ADD: 0,               // 最終加算補正

  JAMMING_EMOJI: {
    'スタン':'❌', 'サンダー':'⚡️', '混乱':'❓', 'ブレイク':'⏯',
    '延命':'4️⃣', 'ビンゴ阻害':'😵', 'リンク':'⛓', '引き直し':'↩️', '封印':'🗃', '誘導':'👆',
  },

  JAMMING_IMG: {
    'スタン':'image/card/j000.png',
    'サンダー':'image/card/j001.png',
    '混乱':'image/card/j002.png',
    'ブレイク':'image/card/j003.png',
    '延命':'image/card/j004.png',
    'ビンゴ阻害':'image/card/j005.png',
    'リンク':'image/card/j006.png',
    '引き直し':'image/card/j007.png',
    '封印':'image/card/j008.png',
    '誘導':'image/card/j009.png',
  },
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
    '拡大':         '配置マス・右・上・右上の2×2マスで配置。塗りつぶし付きの場合も使用可',
    '横拡張':       '配置マスと右のマスへ1×2で配置。塗りつぶし付きの場合も使用可',
    '縦拡張':       '配置マスと上のマスへ2×1で配置。塗りつぶし付きの場合も使用可',
    'マルマルチ':   'マル記号扱いにもなる。元の記号がマルの場合、基礎点に+20',
    'サンカクマルチ':'サンカク記号扱いにもなる。元の記号がサンカクの場合、基礎点に+20',
    'シカクマルチ': 'シカク記号扱いにもなる。元の記号がシカクの場合、基礎点に+20',
    'バツマルチ':   'バツ記号扱いにもなる',
    'ハブ':         'ビンゴ時、2つ以上のビンゴに関わるマスはカード基礎点×1.5',
    '連鎖':         '盤面の連鎖カード数nに応じビンゴ時カード基礎点+30n',
    'オールマルチ': 'マル・サンカク・シカク記号扱いになる',
    '巨大化':       '盤面にある間、ターン消費ごとに基礎点+3',
    '肥大化':       '盤面にある間、ターン消費ごとにビンゴ倍率×2点を現在点数に加算',
    'ブルジョワ':   'カード基礎点+4×現在G（付与時に即時加算）',
    'ドロー':       '盤面配置時にカードを1枚ドロー',
  },
  ENHANCE_NAME_POOL: ['数値強化','拡大','横拡張','縦拡張','マルマルチ','サンカクマルチ','シカクマルチ','バツマルチ','ハブ','連鎖','オールマルチ','巨大化','肥大化','ブルジョワ','ドロー'],

  TRAIT_DESC: {
    '塗りつぶし':         '使用中マスを含む好きなマスに配置できる（1タップで対象選択、2タップ目で確定）',
    '塗りつぶし(レリック)':'塗りつぶしと同じ効果。換金対象外。レリック売却・使用不可でも引き続き効果を持つ',
    '指令官':       'ターン7・8でビンゴした時、補正倍率×1.2',
    'ネガティブ':   '使用してもターンが終了せず追加ターンになる',
    'ディスカード': '捨て札になった時2G得る',
    'レリック特攻': '基礎点+10n n=レリック所持数',
    'ミニマム':     'ビンゴ時、盤面最少記号の数を補正倍率に加算',
    'マキシマム':   'ビンゴ時、最多記号とビンゴ記号が同じなら補正倍率+1',
    '将軍':         'ビンゴ時、手札にある場合最終乗算補正×1.1',
    '保留':         'ラウンド終了時、捨て札にならず保留される',
    '竜頭蛇尾':     'ゲーム開始時カード基礎点+300（上限）。手札に来るたびに-100（最初の手札では-100しない）。補正が0になったら性質変化は解除される',
  },
  TRAIT_NAME_POOL: ['塗りつぶし','指令官','ネガティブ','ディスカード','レリック特攻','ミニマム','マキシマム','将軍','保留','竜頭蛇尾'],

  applyGrantSideEffects(card, gold=0){
    // #1 シカクパッシブ3：対象の強化効果（数値強化・ブルジョワ・マルチ系）の数値を2倍にする
    const sqP3 = (typeof GameState!=='undefined') && GameState.symbolPassiveTier?.Square>=3;
    const mul = sqP3?2:1;
    if(card.enhance === '数値強化') card.baseScore += 15*mul;
    if(card.trait === '竜頭蛇尾') card.baseScore += 300;
    if(card.enhance === 'ブルジョワ') card.baseScore += 4*mul * gold;
    const multiMap = { 'マルマルチ':'Circle', 'サンカクマルチ':'Triangle', 'シカクマルチ':'Square' };
    const matched = multiMap[card.enhance];
    if(matched && card.symbol === matched) card.baseScore += 20*mul;
  },

  // #A 記号パッシブ（ボスクリアごとに1つ選択・3段階）
  // #3 パッシブ選択候補のシンボル一覧（ホシは実際のカード記号ではなくパッシブ専用枠）
  PASSIVE_SYMBOLS: ['Circle','Triangle','Square','Cross','Hoshi','Check'],
  SYMBOL_PASSIVE_NAMES: { Circle:'マルパッシブ', Triangle:'サンカクパッシブ', Square:'シカクパッシブ', Cross:'バツパッシブ', Hoshi:'ホシパッシブ', Check:'チェックパッシブ' },
  SYMBOL_PASSIVES: {
    Circle: {
      1: { name:'マル・オンプレイ', desc:'マルカードをプレイした時、盤面にあるマルカードの数×マルビンゴ倍率×10点を現在の点数に加算する',
        live(){ const n=(typeof GameMainScene!=='undefined'&&GameMainScene.board)?GameMainScene.board.filter(c=>c&&c.symbol==='Circle').length:GameState.currentDeck.filter(c=>c.symbol==='Circle').length; const mult=GameData.BINGO_MULTIPLIER_BASE.Circle; return `現在の盤面のマル枚数:${n} × マル倍率(${Math.round(mult*100)/100}) × 10 = +${Math.round(n*mult*10)}点`; } },
      2: { name:'マル・ドリームセット', desc:'ゲーム開始時、デッキから合計10枚のカードの基礎点+20とマルマルチ(パッシブ専用枠)を付与する。ステージ終了後に取り除く（カード強化効果とは別枠）',
        live(){ const n=Math.min(10,GameState.currentDeck.length); return `対象:${n}枚 基礎点+20 / マルマルチ付与（ステージ限定）`; } },
      3: { name:'マル・エスカレート', desc:'ステージクリア時、マルのビンゴ倍率を1.5倍(小数点切り上げ)する',
        live(){ return `現在のマル倍率:${Math.round(GameData.BINGO_MULTIPLIER_BASE.Circle*100)/100} → クリア時 ${Math.ceil(GameData.BINGO_MULTIPLIER_BASE.Circle*1.5)}`; } },
    },
    // #8 チェックパッシブ（旧マルパッシブ1の効果を継承）
    Check: {
      1: { name:'チェック・トライフォース', desc:'ビンゴ時、盤面にマル・サンカク・シカクを全て含んでいた場合、残りラウンドを1追加する',
        live(){ return '盤面に3種の記号が揃うたびに、そのステージの残りラウンド+1'; } },
      2: { name:'チェック・コーナー', desc:'ゲーム開始時、盤面の4隅にカード基礎点100・オールマルチ強化付きのマルカードを配置する',
        live(){ return '盤面4隅に基礎点100・オールマルチのマルカードを配置'; } },
      3: { name:'チェック・エンデュランス', desc:'ゲーム中、3回ビンゴするまでラウンドが終了しない',
        live(){ const n=GameState.bingoCountThisStage||0; return `このステージのビンゴ回数：${n}/3`; } },
    },
    Triangle: {
      1: { name:'サンカク・レシオ', desc:'デッキ内のサンカクカード比率nを計算し、サンカクカードの基礎点に(1+n)を乗算する',
        live(){ const total=GameState.currentDeck.length||1; const n=GameState.currentDeck.filter(c=>c.symbol==='Triangle').length/total; return `サンカク比率n=${Math.round(n*100)/100} → サンカク基礎点×${Math.round((1+n)*100)/100}`; } },
      2: { name:'サンカク・レゾナンス', desc:'デッキ内のジャミング効果を持つカード1枚につき、最終補正倍率+0.1する',
        live(){ const n=GameState.currentDeck.filter(c=>c.jamming).length; return `ジャミング所持カード:${n}枚 → 最終補正倍率+${Math.round(n*0.1*100)/100}`; } },
      3: { name:'サンカク・エコー', desc:'サンカクカードのジャミング効果を使用した次のターンに、もう一度同じ効果をNPCに付与する',
        live(){ return 'ジャミングカード使用の1ターン後に同じ効果を再付与'; } },
    },
    Square: {
      1: { name:'シカク・ドロー', desc:'シカクカードをプレイした時、そのカード自身の基礎点+1を永続付与し、カードを1枚ドローする（ドローしたカードの基礎点にも+1）',
        live(){ return 'シカクカードプレイ時：自身の基礎点+1（永続）、ドロー+1枚（そのカードにも基礎点+1）'; } },
      2: { name:'シカク・ダブル', desc:'シカクカードのカード基礎点が常に2倍になる',
        live(){ return 'シカクカードの基礎点計算に×2が常時適用'; } },
      3: { name:'シカク・アンプ', desc:'カード強化効果を2倍にする。対象:数値強化、拡大、横拡張、縦拡張、マルマルチ、サンカクマルチ、シカクマルチ、ハブ、連鎖、巨大化、肥大化、ブルジョワ、ドロー',
        live(){ return '対象の強化効果の数値・枚数が通常の2倍になる'; } },
    },
    Cross: {
      1: { name:'バツ・ミラー', desc:'一番高いビンゴ倍率を常にバツ倍率に反映し続ける',
        live(){ const max=Math.max(...GameData.SYMBOLS.map(s=>GameData.BINGO_MULTIPLIER_BASE[s])); return `現在の最大倍率:${Math.round(max*100)/100} → バツ倍率に反映`; } },
      2: { name:'バツ・スケール', desc:'バツの基礎点が常にデッキ枚数×3に変化する',
        live(){ const n=GameState.currentDeck.length; return `デッキ枚数:${n}枚 → バツ基礎点=${n*3}`; } },
      3: { name:'バツ・クアドラプル', desc:'点数計算時、現在のバツビンゴ倍率をさらに4倍して補正する',
        live(){ const max=Math.max(...GameData.SYMBOLS.map(s=>GameData.BINGO_MULTIPLIER_BASE[s])); return `バツ倍率(${Math.round(max*100)/100}) × 4 = ${Math.round(max*4*100)/100}`; } },
    },
    // #3 ホシパッシブ（実際のカード記号ではなく専用の特殊効果枠）
    Hoshi: {
      1: { name:'ホシ・リロール', desc:'ボス効果を一度だけリロールできるようになる',
        live(){ return GameState.bossRerollUsed?'このボスではリロール済み':'未使用（ボスステージでリロール可能）'; } },
      2: { name:'ホシ・ペンタ', desc:'盤面が5×5マスになる。5列ビンゴの倍率は3列ビンゴの2倍になる',
        live(){ return `盤面:5×5マス / 5列ビンゴ倍率×${GameData.PENTA_MULTIPLIER_FACTOR}`; } },
      3: { name:'ホシ・ヘッドスタート', desc:'ゲーム開始時、目標点数の30%を現在の点数に加算する',
        live(){ return `目標点数の30%＝+${Math.round(GameState.targetScore*0.3)}点を開始時に加算`; } },
    },
  },


  RELIC_ENHANCE_POOL: [
    { id:'ren_discard', name:'廃棄強化',     desc:'捨て札は廃棄札へ。最終乗算補正×1.5' },
    { id:'ren_circle', name:'マルオール',   desc:'ビンゴ時補正基礎点+n（n=デッキのマルカード数）' },
    { id:'ren_square', name:'シカクオール',  desc:'ビンゴ時補正基礎点+n（n=デッキのシカクカード数）' },
    { id:'ren_triangle', name:'サンカクオール',desc:'ビンゴ時補正基礎点+n（n=デッキのサンカクカード数）' },
    { id:'ren_only_one', name:'オンリーワン',  desc:'レリック所持数が1つの時、補正倍率+20' },
    { id:'ren_pair', name:'ペアルック',    desc:'同じレリックを持っている時、カード基礎点+40' },
    { id:'ren_negative', name:'ネガティブ',    desc:'このレリックは所持数に加算されない' },
    { id:'ren_discard_sell', name:'ディスカード', desc:'売却時デッキ枚数/2（切捨て）Gを得る' },
    { id:'ren_general', name:'将軍',          desc:'ビンゴ時、最終乗算補正×1.1' },
    { id:'ren_all_link', name:'オールリンク',  desc:'NPCは常時リンク状態（前ターン隣接のみ配置可）' },
    { id:'ren_gold', name:'G獲得',         desc:'ステージクリア時追加で1G得る' },
    { id:'ren_draw', name:'ドロー強化',    desc:'ラウンド終了時カードを1枚ドロー' },
    { id:'ren_double', name:'倍化',          desc:'2個分とカウント。最終乗算補正×1.5' },
    { id:'ren_triple', name:'3倍化',         desc:'3個分とカウント。最終乗算補正×2' },
    { id:'ren_cross', name:'バツ強化',      desc:'バツ倍率×5' },
    { id:'ren_npc', name:'NPC強化',       desc:'NPCが2回行動。補正基礎点×5' },
    { id:'ren_draw_pile', name:'山札強化',      desc:'ビンゴ時、山札数×100を最終加算補正に追加' },
    { id:'ren_disc_pile', name:'捨て札強化',    desc:'ビンゴ時補正基礎点+n（n=捨て札数）' },
    { id:'ren_black', name:'ブラックカード', desc:'ショップ金額が半額（切り上げ）。購入時即時反映' },
    { id:'ren_first', name:'手番高速',      desc:'全ラウンドで最初の手番がプレイヤーになる' },
    { id:'ren_grade', name:'グレードオール', desc:'ビンゴ時補正倍率+n（n=デッキの強化/ジャミング/性質変化の総数）' },
  ],

  RELIC_IMG: {
    'bingo':'image/relic/r000.png',
    'charge':'image/relic/r001.png',
    'double':'image/relic/r002.png',
    'odd_boost':'image/relic/r003.png',
    'even_boost':'image/relic/r004.png',
    'circle_boost':'image/relic/r005.png',
    'triangle_boost':'image/relic/r006.png',
    'square_boost':'image/relic/r007.png',
    'combo':'image/relic/r008.png',
    'relic_boost':'image/relic/r009.png',
    'paint':'image/relic/r010.png',
    'turn_boost':'image/relic/r011.png',
    'jamming_boost':'image/relic/r012.png',
    'empty_boost':'image/relic/r013.png',
    'draw_boost':'image/relic/r014.png',
    'last_stand':'image/relic/r015.png',
    'base_boost':'image/relic/r016.png',
    'round_boost':'image/relic/r017.png',
    'reroll_boost':'image/relic/r018.png',
    'hand_boost':'image/relic/r019.png',
    'gold_boost':'image/relic/r020.png',
  },
  RELIC_POOL: [
    { id:'bingo', name:'ビンゴ',           desc:'ビンゴした時、補正基礎点+30' },
    { id:'charge', name:'チャージ',         desc:'前ラウンドでスコアが増加しなかった場合、次ラウンドの間補正基礎点+100' },
    { id:'double', name:'ダブル',           desc:'同一ターンにビンゴが2つ以上ある時、最終乗算補正×1.5' },
    { id:'odd_boost', name:'奇数補正',         desc:'ビンゴで加算される基礎点が奇数の度に補正基礎点+15' },
    { id:'even_boost', name:'偶数補正',         desc:'ビンゴで加算される基礎点が偶数の度に補正基礎点+15' },
    { id:'circle_boost', name:'マル補正',         desc:'マルでビンゴした時、補正基礎点+60' },
    { id:'triangle_boost', name:'サンカク補正',     desc:'サンカクでビンゴした時、補正基礎点+60' },
    { id:'square_boost', name:'シカク補正',       desc:'シカクでビンゴした時、補正基礎点+60' },
    { id:'combo', name:'コンボ',           desc:'前ラウンドと異なる記号でビンゴした時、補正倍率+1.5' },
    { id:'relic_boost', name:'レリック強化',     desc:'レリック所持数nに応じ、補正基礎点+5+8n' },
    { id:'paint', name:'ペイント',         desc:'全カードに塗りつぶし(レリック)付与。1ラウンドのターン数-8。売却・使用不可時は効果を除去' },
    { id:'turn_boost', name:'ターン強化',       desc:'ビンゴ時、経過ターン数nに応じてスコア×1.1^n' },
    { id:'jamming_boost', name:'ジャミング増強',   desc:'リロール回数-3回' },
    { id:'empty_boost', name:'空きマス強化',     desc:'ビンゴ時、空きマス数nに応じ補正倍率+6n+5' },
    { id:'draw_boost', name:'ドロー強化',       desc:'ターン終了時カードを1枚ドロー' },
    { id:'last_stand', name:'背水の陣',         desc:'4ラウンド以降、最終乗算補正×2' },
    { id:'base_boost', name:'補正基礎点強化',   desc:'最終加算補正+2000' },
    { id:'round_boost', name:'ラウンド強化',     desc:'挑戦できるラウンド数+1（購入時即時）' },
    { id:'reroll_boost', name:'リロール強化',     desc:'リロール回数+2（購入時即時）' },
    { id:'hand_boost', name:'手札強化',         desc:'手札上限+3（購入時即時）' },
    { id:'gold_boost', name:'G獲得',            desc:'ステージクリア時、追加でG+3を得る' },
  ],

  BOSS_EFFECT_POOL: [
    { id:'cross5000', name:'バツ5000',         desc:'×のカード基礎点が5000点になる' },
    { id:'block_cells', name:'マス妨害',          desc:'盤面の4つのランダムなマスが使用不可になる' },
    { id:'quad_only', name:'４ビンゴ',          desc:'お互い4列でないとビンゴできない' },
    { id:'blackout', name:'ブラックアウト',    desc:'手札は記号が？で隠れる。カード強化のみ確認可。盤面に出したら表示される' },
    { id:'unify', name:'統一',              desc:'マル・サンカク・シカクいずれか1記号のビンゴ倍率+10、他は-20。ステージ終了時に元に戻す' },
    { id:'no_relic', name:'レリック使用不可',  desc:'レリックの効果が発動しない' },
    { id:'cross_corner', name:'バツ配置',          desc:'×が盤面四隅に置かれた状態でラウンドが始まる' },
    { id:'turn_limit', name:'ターン制限',        desc:'1ラウンドのターン数が10ターン固定になる（終了後元に戻る）' },
    { id:'reroll_limit', name:'リロール制限',      desc:'リロール回数が0回になる' },
    { id:'hand_limit', name:'手札制限',          desc:'手札の上限-1' },
    { id:'discard_used', name:'廃棄',              desc:'盤面に使用したカードは廃棄札に移動し、デッキに戻らない' },
  ],

  MAX_RELICS: 5,

  // #27 ショップ商品種別の確率テーブル
  SHOP_RANDOM_TYPES: [
    { id:'pickup_relic', name:'ピックアップレリック',   weight:10, emoji:'🏺' },
    { id:'card_pack', name:'？カードパック',         weight:5, emoji:'🎴' },
    { id:'pickup_upgrade', name:'ピックアップアップグレード', weight:5, emoji:'🎯' },
    { id:'normal_upgrade', name:'通常アップグレード',     weight:60, emoji:'⬆️' }, // #5 出現確率2倍(30→60)
    { id:'special_upgrade', name:'特別アップグレード',     weight:8, emoji:'✨' },
    { id:'card_focus', name:'カードフォーカスパック', weight:20, emoji:'🔍' },
    { id:'bingo_focus', name:'ビンゴフォーカスパック', weight:20, emoji:'🎰' },
    { id:'dream_card', name:'ドリームカードパック',   weight:2, emoji:'🌙' },
    // #9 新商品：強化カードパック20%・ジャミングカードパック30%・レリックパック15%を追加（合計165%、上限175%以内）
    { id:'enhance_pack', name:'強化カードパック',     weight:20, emoji:'💪' },
    { id:'jamming_pack', name:'ジャミングカードパック', weight:30, emoji:'🌀' },
    { id:'relic_pack', name:'レリックパック',         weight:15, emoji:'🏆' },
  ],

  // #7 スキップ報酬の追加ボーナス抽選（レリック35%・通常アプ40%・特別アプ10%・ドリームカード5%、残り10%はボーナスなし）
  SKIP_BONUS_TYPES: [
    { id:'relic', name:'ランダムレリック', weight:35 },
    { id:'normal_upgrade', name:'通常アップグレード', weight:40 },
    { id:'special_upgrade', name:'特別アップグレード', weight:10 },
    { id:'dream_card', name:'ドリームカードパック', weight:5 },
  ],
  pickSkipBonusType(){
    const pool=this.SKIP_BONUS_TYPES;
    const r=Math.random()*100; // 残り10%はボーナスなし
    let acc=0;
    for(const t of pool){ acc+=t.weight; if(r<acc) return t.id; }
    return null;
  },

  pickWeightedType(){
    const pool = this.SHOP_RANDOM_TYPES;
    const total = pool.reduce((s,t)=>s+t.weight,0);
    let r = Math.random()*total;
    for(const t of pool){ r-=t.weight; if(r<=0) return t.id; }
    return pool[pool.length-1].id;
  },

  generateShopCard(){
    const symbol = GlobalFunctions.randChoice(['Circle', 'Triangle', 'Square']);
    const baseScore = GlobalFunctions.randInt(1, 50);
    let jamming = Math.random() < 0.5 ? GlobalFunctions.randChoice(Object.keys(this.JAMMING_DESC)) : null;
    let enhance = Math.random() < 0.2 ? GlobalFunctions.randChoice(this.ENHANCE_NAME_POOL) : null;
    let trait = Math.random() < 0.05 ? GlobalFunctions.randChoice(this.TRAIT_NAME_POOL) : null;
    const card = { id:'shopcard_'+Date.now()+'_'+Math.floor(Math.random()*100000), symbol, number:baseScore, baseScore, jamming, enhance, trait };
    this.applyGrantSideEffects(card, (typeof GameState!=='undefined')?GameState.gold:0); // #1 生成時に現在Gを正しく反映
    return card;
  },

  SHOP_PRICES: { relic:5, cardPack:2, normalUpgrade:3, specialUpgrade:10, reroll:1,
                 cardFocus:6, bingoFocus:4, dreamCard:20, pickupUpgrade:3, pickupRelic:8,
                 // #9 新商品価格（各4G）
                 enhancePack:4, jammingPack:4, relicPack:4 },

  NORMAL_SELECT_POOL: [
    { id:'circle_mult', name:'🟡マルビンゴ強化',    desc:'○のビンゴ倍率を+4する',              targetMin:0, targetMax:0 },
    { id:'cross_mult', name:'🟡バツビンゴ強化',    desc:'×のビンゴ倍率を+5する',              targetMin:0, targetMax:0 },
    { id:'square_mult', name:'🟡シカクビンゴ強化',  desc:'□のビンゴ倍率を+4する',              targetMin:0, targetMax:0 },
    { id:'triangle_mult', name:'🟡サンカクビンゴ強化',desc:'△のビンゴ倍率を+4する',              targetMin:0, targetMax:0 },
    { id:'number_up2', name:'🟡数値上昇',          desc:'カードを2枚選択し、それぞれ基礎点+5', targetMin:2, targetMax:2 },
    { id:'number_up3', name:'🟡数値上昇3',         desc:'カードを3枚選択し、それぞれ基礎点+3', targetMin:3, targetMax:3 },
    { id:'base_up5', name:'🟡基礎点上昇1',       desc:'カードを1枚選択し、基礎点+10する',    targetMin:1, targetMax:1 },
    { id:'symbol_change', name:'🟡記号変化',          desc:'カードを最大3枚選択し記号をランダム変化', targetMin:1, targetMax:3 },
    { id:'cash_in', name:'🟡換金',              desc:'カードを1枚取り除きG獲得（強化数に応じた金額）', targetMin:1, targetMax:1 },
    { id:'duplicate', name:'🟡複製',              desc:'カードを1枚選択し複製',               targetMin:1, targetMax:1 },
    { id:'grant_enhance', name:'🟡カード強化付与',    desc:'カードを1枚選択しランダムなカード強化を付与', targetMin:1, targetMax:1 },
    { id:'grant_jamming', name:'🟢ジャミング効果付与',desc:'カードを1枚選択しランダムなジャミングを付与', targetMin:1, targetMax:1 },
    { id:'all_mult_up1', name:'🟡オールビンゴ強化',  desc:'全記号のビンゴ倍率を+1する',          targetMin:0, targetMax:0 },
    // #8: 1%で性質変化付与
    { id:'grant_trait_rare', name:'🔵性質変化付与',     desc:'カードを1枚選択しランダムな性質変化を付与（レア）', targetMin:1, targetMax:1, rarity:0.01 },
  ],
  SPECIAL_SELECT_POOL: [
    { id:'grant_trait', name:'🔵性質変化効果付与',  desc:'カードを1枚選択しランダムな性質変化を付与', targetMin:1, targetMax:1 },
    { id:'hand_up2', name:'🔵手札増加',          desc:'手札の上限が2枚増加する',         targetMin:0, targetMax:0 },
    { id:'reroll_up2', name:'🔵リロール増加',       desc:'リロール回数を2回増加する',        targetMin:0, targetMax:0 },
    { id:'round_up1', name:'🔵ラウンド増加',       desc:'挑戦できるラウンド数が1増加する',  targetMin:0, targetMax:0 },
    // #11: 4ターン増加
    { id:'turn_up4', name:'🔵ターン増加',         desc:'1ラウンドのターン数が4増加する',   targetMin:0, targetMax:0 },
    { id:'relic_slot_up1', name:'🔵レリック所持数増加', desc:'レリック所持数上限が1増加する',    targetMin:0, targetMax:0 },
    // #29: 全引き後確定性質変化付与は applyEffect 側で処理
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
          jamming:(jammingMap[symbol]&&jammingMap[symbol][number])||null, enhance:null, trait:null,
          dragonUsed:false });  // 竜頭蛇尾の初回フラグ
      }
    }
    return deck;
  },

  CLEAR_REWARD_BASE: { common:3, high:5, boss:8 },
  SKIP_REWARD_BASE:  { common:2, high:3 },

  // #12 多階層
  buildFloorStages(floor){
    const baseCommon=[250,1000,5000,20000,100000,250000,1000000,3000000,10000000,25000000];
    const c=baseCommon[Math.min(floor-1,9)]||250;
    const bossMulti=floor>=10?4:3;
    const bossEffectCount=floor>=10?3:floor>=5?2:1;
    return [{key:'common',name:'コモン',tag:'COMMON',targetScore:c,skippable:true,bossEffectCount:0},{key:'high',name:'ハイレベル',tag:'HIGH LEVEL',targetScore:c*2,skippable:true,bossEffectCount:0},{key:'boss',name:'ボス',tag:'BOSS',targetScore:c*bossMulti,skippable:false,bossEffectCount}];
  },

  STAGE_TYPES: [
    { key:'common', name:'コモン',    tag:'COMMON',     targetScore:250, skippable:true },
    { key:'high',   name:'ハイレベル',tag:'HIGH LEVEL', targetScore:450, skippable:true },
    { key:'boss',   name:'ボス',      tag:'BOSS',       targetScore:700, skippable:false },
  ],
};
