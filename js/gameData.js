// GUIアイコン（js/icons.js の GameIcons）をインラインSVG文字列で返す。icons.js は本ファイルより前に読み込むこと
const GIcon = (key, opts) => (typeof GameIcons!=='undefined' ? GameIcons.svg(key, opts) : '');
// 記号アイコン（.sym-* の色を currentColor で継承）を色クラス付き span で返す（説明文・メッセージ埋め込み用）
const GICON_SYM_KEY = { Circle:'sym_circle', Triangle:'sym_triangle', Square:'sym_square', Cross:'sym_cross', Hoshi:'passive_hoshi', Check:'passive_check', Seven:'passive_seven' };
const GIconSym = sym => `<span class="sym-${sym}">${GIcon(GICON_SYM_KEY[sym])}</span>`;

const GameData = {
  SYMBOLS: ['Circle', 'Triangle', 'Square', 'Cross'],
  // 記号の表示（インラインSVG。innerHTML で描画すること）。色は親要素の .sym-* クラスから currentColor で継承
  SYMBOL_ICON_KEY: GICON_SYM_KEY,
  SYMBOL_LABEL: { Circle:GIcon('sym_circle'), Triangle:GIcon('sym_triangle'), Square:GIcon('sym_square'), Cross:GIcon('sym_cross'), Hoshi:GIcon('passive_hoshi'), Check:GIcon('passive_check'), Seven:GIcon('passive_seven') },
  // プレーンテキストしか使えない箇所（title属性等）用の記号名
  SYMBOL_TEXT: { Circle:'マル', Triangle:'サンカク', Square:'シカク', Cross:'バツ', Hoshi:'ホシ', Check:'チェック', Seven:'セブン' },
  MULTI_SYMBOL_LABEL: { 'マルマルチ':GIcon('multi_circle'), 'サンカクマルチ':GIcon('multi_triangle'), 'シカクマルチ':GIcon('multi_square'), 'バツマルチ':GIcon('multi_cross'), 'オールマルチ':GIcon('multi_all') },

  // #1 シカクを7倍に修正
  // #1 初期ビンゴ倍率：マル・サンカク・シカクをすべて10倍に変更
  BINGO_MULTIPLIER_BASE: { Circle:10, Triangle:10, Square:10, Cross:-100 }, // #6 初期バツビンゴ倍率-100
  // ビンゴ倍率の変化表示（右枠）用：スナップショットと差分HTML
  snapshotMult(){ return {...this.BINGO_MULTIPLIER_BASE}; },
  multChanged(before){ return this.SYMBOLS.some(s=>before[s]!==this.BINGO_MULTIPLIER_BASE[s]); },
  multChangeHtml(before){
    const f=v=>Math.round(v*100)/100;
    const rows=this.SYMBOLS.map(s=>{
      const a=before[s], b=this.BINGO_MULTIPLIER_BASE[s], d=b-a;
      const cls=d>0?'mc-up':(d<0?'mc-down':'mc-same');
      return `<tr class="${cls}"><td class="sym-${s}">${this.SYMBOL_LABEL[s]}</td><td>${f(a)}</td><td>→</td><td class="mc-after">${f(b)}</td><td class="mc-diff">${d===0?'':(d>0?'+':'')+f(d)}</td></tr>`;
    }).join('');
    return `<div class="gr-label">ビンゴ倍率が変化しました</div><table class="mult-change-table">${rows}</table>`;
  },
  BINGO_MULTIPLIER_BASE_ORIGINAL: { Circle:10, Triangle:10, Square:10, Cross:-100 },
  QUAD_MULTIPLIER_FACTOR: 1.5,
  // #3 ホシパッシブLv2用：5列ビンゴは3列ビンゴの倍率の2倍
  PENTA_MULTIPLIER_FACTOR: 2,
  // 元々の列補正（3列=1／4列=1.5／5列=2）。表示はこちらを使う（魔力は含まない）
  baseLineFactor(kind){
    return kind==='penta' ? this.PENTA_MULTIPLIER_FACTOR : (kind==='quad' ? this.QUAD_MULTIPLIER_FACTOR : 1);
  },
  // 魔力ステージA・Bによる、ビンゴ倍率への最終補正（持っていなければ1）
  manaFactor(kind){
    return (typeof GameState!=='undefined'&&GameState.manaLineMul)?GameState.manaLineMul(kind):1;
  },
  // 得点計算・予測用：元の列補正 × 魔力の最終補正
  lineFactor(kind){ return this.baseLineFactor(kind) * this.manaFactor(kind); },
  // 魔力ステージA・Bを持っている時の倍率表の注記（無ければ空文字）
  manaNoteText(){
    if(typeof GameState==='undefined'||!GameState.hasMana) return '';
    const st=['A','B'].filter(k=>GameState.hasMana(k)); if(st.length===0) return '';
    const f=v=>Math.round(v*100)/100;
    return `${st.map(k=>'魔力ステージ'+k).join('・')}：最終的に3列×${f(this.manaFactor('tri'))}／4列×${f(this.manaFactor('quad'))}／5列×${f(this.manaFactor('penta'))}`;
  },
  triMult(symbol){ return this.BINGO_MULTIPLIER_BASE[symbol] * this.lineFactor('tri'); },
  pentaMult(symbol){ return this.BINGO_MULTIPLIER_BASE[symbol] * this.lineFactor('penta'); },
  REWARD_FLAT_BONUS: 1,
  quadMult(symbol){ return this.BINGO_MULTIPLIER_BASE[symbol] * this.lineFactor('quad'); },

  // #1 パッシブ「魔力」（魔神イベントで付与。レベル制ではなくステージA〜Eを個別に所持）
  MANA_STAGES: {
    A:{ name:'魔力ステージA', desc:'ビンゴ倍率に最終補正として、3列ビンゴは×0.75、4列ビンゴは×2、5列ビンゴは×3を掛ける' },
    B:{ name:'魔力ステージB', desc:'ビンゴ倍率に最終補正として、3列ビンゴは×3、4列ビンゴと5列ビンゴは×0を掛ける' },
    C:{ name:'魔力ステージC', desc:'捧げられたレリックの個数分、レリックの所持数上限が増加する' },
    D:{ name:'魔力ステージD', desc:'付与された階層のボスクリア時のパッシブ報酬の数を3つにする' },
    E:{ name:'魔力ステージE', desc:'カードが得られるパックのカードは、カード強化・ジャミング・性質変化の全てが付与された状態で出現する。レリックパックとピックアップレリックのレリックには全てレリック強化効果が付与される' },
  },
  // #3 魔神イベント専用レリック（ショップ等のランダム抽選には含めない）
  MAJIN_SEAL_RELIC: { id:'majin_seal', name:'魔神のお墨付き', desc:'ビンゴ時、補正基礎点+(n+50)（n=魔神に捧げたカードの基礎点）' },

  // #18 点数計算変数の初期値を明記
  CORRECTION_BASE_SCORE: 0,   // 補正基礎点
  CORRECTION_MULTIPLIER: 0,   // 補正倍率
  FINAL_MULTIPLIER: 1,        // 最終乗算補正
  FINAL_ADD: 0,               // 最終加算補正

  // ジャミングのアイコン（旧：絵文字。現在は GameIcons のインラインSVG。innerHTML で描画すること）
  JAMMING_EMOJI: {
    'スタン':GIcon('jam_stun'), 'サンダー':GIcon('jam_thunder'), '混乱':GIcon('jam_confuse'), 'ブレイク':GIcon('jam_break'),
    '延命':GIcon('jam_prolong'), 'ビンゴ阻害':GIcon('jam_bingo_block'), 'リンク':GIcon('jam_link'), '引き直し':GIcon('jam_redraw'), '封印':GIcon('jam_seal'), '誘導':GIcon('jam_guide'),
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
    'スタン':   '①次のNPCターン、NPC行動を封じる',
    'サンダー': '①配置時、盤面のバツを全て取り除く',
    '混乱':     '①次のNPCターン、最低点マスに配置する',
    'ブレイク': '①この効果を使用した次のターンまで、バツでビンゴしてもラウンドが終了しない',
    '延命':     '①盤面にある間、バツは4列ビンゴのみ有効',
    'ビンゴ阻害':'①盤面n枚で段階的にNPCのバツビンゴを制限する（1枚:縦不可 / 2枚:縦横不可 / 3枚以上:不可）',
    'リンク':   '①次のNPCターン、このカードの十字マスにしか置けない。置けない場合スタン',
    '引き直し': '①配置時、直前のNPCが置いたバツを取り除く。次のNPCターン、そのマス以外に置けない。他に置けない場合スタン',
    '封印':     '①次のNPCターン、このカードの周囲8マスに置けない。他に置けない場合スタン',
    '誘導':     '①次のNPCターン、盤面中央（4×4なら2×2、5×5なら中央1マス）にしか置けない。他に置けない場合スタン',
  },

  ENHANCE_DESC: {
    '数値強化':     '①カード基礎点+15点',
    '拡大':         '①配置マス・右・上・右上の2×2マスで配置。塗りつぶし付きの場合も使用可',
    '横拡張':       '①配置マスと右のマスへ1×2で配置。塗りつぶし付きの場合も使用可',
    '縦拡張':       '①配置マスと上のマスへ2×1で配置。塗りつぶし付きの場合も使用可',
    'マルマルチ':   '①マル記号扱いにもなる。元の記号がマルの場合、基礎点に+20',
    'サンカクマルチ':'①サンカク記号扱いにもなる。元の記号がサンカクの場合、基礎点に+20',
    'シカクマルチ': '①シカク記号扱いにもなる。元の記号がシカクの場合、基礎点に+20',
    'バツマルチ':   '①バツ記号扱いにもなる（元のカードがバツの場合、付与時に基礎点+20）',
    'ハブ':         '①ビンゴ時、2つ以上のビンゴに関わるマスはカード基礎点×1.5',
    '連鎖':         '①盤面の連鎖カード数nに応じビンゴ時カード基礎点+30n',
    'オールマルチ': '①マル・サンカク・シカク記号扱いになる',
    '巨大化':       '①盤面に置かれている間、ターン消費ごとにカード基礎点+1（カードに実際に加算され、ゲーム終了後もそのまま残る）',
    '肥大化':       '①盤面にある間、ターン消費ごとに「カード基礎点/2×ビンゴ倍率」点を現在の点数に加算',
    'ブルジョワ':   '①カード基礎点+4×現在G',
    'ドロー':       '①盤面配置時にカードを1枚ドロー',
    // #4 新規強化効果5種
    'エクステンド': '①このカードを置いたターンはビンゴしていてもラウンドが終了せず、ビンゴ計算も行われない。次の自分のターンでカードを配置した時に効果が解除される②カード基礎点+5',
    '加重':         '①カード基礎点+n（n=デッキ内のこのカードと同じ記号のカードの数）',
    'ギャンブル':   '①手札に来るたび、カード基礎点に-50〜+50のランダムな値を加算。捨て札に行く、またはゲーム終了時にリセットされる',
    'トップスピード':'①カード基礎点+5。ゲーム開始時、このカードをデッキの一番上に配置する',
    '重ね掛け':     '①盤面に置かれている、このカードと同じ記号のカードの上に上書き配置できる。上書きされたカードの基礎点のみ、このカードの基礎点に加算される。ただし、盤面上の重ね掛けが付与されているカードの上には載せられない',
  },
  ENHANCE_NAME_POOL: ['数値強化','拡大','横拡張','縦拡張','マルマルチ','サンカクマルチ','シカクマルチ','バツマルチ','ハブ','連鎖','オールマルチ','巨大化','肥大化','ブルジョワ','ドロー','エクステンド','加重','ギャンブル','トップスピード','重ね掛け'],

  TRAIT_DESC: {
    '塗りつぶし':         '①使用中マスを含む好きなマスに配置できる（1タップで対象選択、2タップ目で確定）',
    '塗りつぶし(レリック)':'①使用中マスを含む好きなマスに配置できる(1タップで対象選択、2タップ目で確定)',
    '指令官':       '①ターン7〜10でビンゴした時、補正倍率×1.2',
    'ネガティブ':   '①使用してもターンが終了せず追加ターンになる',
    'ネガティブ(パッシブ)': '①使用してもターンが終了せず追加ターンになる（マルパッシブ2により付与）',
    'ディスカード': '①捨て札になった時2G得る',
    'レリック特攻': '①基礎点+10n n=レリック所持数',
    'ミニマム':     '①ビンゴ時、盤面最少記号の数n×20を補正倍率に加算',
    'マキシマム':   '①ビンゴ時、最多記号とビンゴ記号が同じなら、盤面最多記号の数n×10を補正倍率に加算',
    '将軍':         '①ビンゴ時、手札にある場合最終乗算補正×1.1',
    '保留':         '①ラウンド終了時に手札にある場合、捨て札にならず次のラウンドの手札に残る。残ったカードは次のラウンドの手札上限に数えない',
    '竜頭蛇尾':     '①ゲーム開始時カード基礎点+300。手札に来るたびに-100。補正が0になったら性質変化は解除される',
  },
  TRAIT_NAME_POOL: ['塗りつぶし','指令官','ネガティブ','ディスカード','レリック特攻','ミニマム','マキシマム','将軍','保留','竜頭蛇尾'],

  // #21 which：'enhance'=強化効果の付与時のみ／'trait'=性質変化の付与時のみ／'all'=カード生成時（既存の効果を二重に適用しないため）
  applyGrantSideEffects(card, gold=0, which='all'){
    const doE = which==='all'||which==='enhance', doT = which==='all'||which==='trait';
    // #1 シカクパッシブ3：シカクカードのみ対象の強化効果（数値強化・ブルジョワ・マルチ系）の数値を2倍にする
    const sqP3 = (typeof GameState!=='undefined') && GameState.symbolPassiveTier?.Square>=2 && card.symbol==='Square';
    const mul = sqP3?2:1;
    if(doT && card.trait === '竜頭蛇尾') card.baseScore += 300;
    if(!doE) return;
    // #5 強化効果による即時加算量を記録しておき、強化効果が別のものに変わった時に元に戻す（removeEnhanceBonus）
    const before=card.baseScore;
    if(card.enhance === '数値強化') card.baseScore += 15*mul;
    // #4 ブルジョワは付与時の即時加算をやめ、ビンゴ時に現在G×4を加算する（GameData.bourgeoisBonus）
    const multiMap = { 'マルマルチ':'Circle', 'サンカクマルチ':'Triangle', 'シカクマルチ':'Square', 'バツマルチ':'Cross' };
    const matched = multiMap[card.enhance];
    if(matched && card.symbol === matched) card.baseScore += 20*mul;
    // #3 加重は即時加算をやめ、ビンゴ時にデッキ内の同じ記号の枚数×1を加算する（GameData.weightedBonus）
    // #4 トップスピード：カード基礎点+5（付与時に即時加算。デッキ先頭配置は別途ステージ開始時に処理）
    if(card.enhance === 'トップスピード') card.baseScore += 5*mul;
    if(card.enhance === 'エクステンド') card.baseScore += 5*mul; // v1.00 #12 エクステンド②カード基礎点+5（シカクパッシブLv2で2倍） // v14 #1 シカクパッシブLv2はシカクカードのみ2倍
    card._enhAdd = card.baseScore - before;
  },
  // #5 現在の強化効果による即時加算（数値強化・トップスピード・同記号マルチ）を取り除く。強化効果を変更する直前に呼ぶ
  removeEnhanceBonus(card){
    if(!card) return 0;
    let add=card._enhAdd;
    if(add==null){ // 旧データ：記録が無い場合は付与時の標準値で戻す
      const mm={ 'マルマルチ':'Circle', 'サンカクマルチ':'Triangle', 'シカクマルチ':'Square', 'バツマルチ':'Cross' };
      add = card.enhance==='数値強化'?15 : card.enhance==='トップスピード'?5 : card.enhance==='エクステンド'?5 : (mm[card.enhance]&&mm[card.enhance]===card.symbol)?20 : 0;
    }
    card.baseScore-=add; delete card._enhAdd;
    return add;
  },
  // v14 #1 シカクパッシブLv2の取得・解除・無効化に合わせて、即時加算型の強化（数値強化・トップスピード・同記号マルチ）の加算量を現在の状態で付け直す
  refreshPassiveEnhance(){
    if(typeof GameState==='undefined') return;
    const seen=new Set();
    [...(GameState.currentDeck||[]),...(GameState.hand||[]),...(GameState.drawPile||[]),...(GameState.discardPile||[]),...(GameState.reserve||[])].forEach(c=>{
      if(!c||seen.has(c)||!c.enhance) return; seen.add(c);
      if(!['数値強化','トップスピード','エクステンド','マルマルチ','サンカクマルチ','シカクマルチ','バツマルチ'].includes(c.enhance)) return;
      this.removeEnhanceBonus(c); this.applyGrantSideEffects(c, GameState.gold, 'enhance');
    });
  },
  // v1.00 #9 バツパッシブLv3：所持カードを全てバツ記号に変える（同記号マルチの即時加算も付け直す）
  enforceCrossAll(){
    if(typeof GameState==='undefined' || !(GameState.symbolPassiveTier?.Cross>=3)) return;
    const seen=new Set();
    [...(GameState.currentDeck||[]),...(GameState.hand||[]),...(GameState.drawPile||[]),...(GameState.discardPile||[]),...(GameState.discardedPile||[]),...(GameState.reserve||[])].forEach(c=>{
      if(!c||seen.has(c)||c.symbol==='Cross') return; seen.add(c);
      const imm=c.enhance&&['数値強化','トップスピード','エクステンド','マルマルチ','サンカクマルチ','シカクマルチ','バツマルチ'].includes(c.enhance);
      if(imm) this.removeEnhanceBonus(c);
      c.symbol='Cross';
      if(imm) this.applyGrantSideEffects(c, GameState.gold, 'enhance');
    });
  },
  // 強化効果を差し替える（旧強化の即時加算を戻してから新強化の副次効果を適用）
  setEnhance(card, enh, gold){
    this.removeEnhanceBonus(card);
    card.enhance=enh;
    this.applyGrantSideEffects(card, gold!=null?gold:(typeof GameState!=='undefined'?GameState.gold:0), 'enhance');
  },

  // #4 ブルジョワ：現在G×4（シカクパッシブ3のシカクカードは×8）。強化効果が付いている間だけ加算
  bourgeoisBonus(card){
    if(!card||card.enhance!=='ブルジョワ'||typeof GameState==='undefined') return 0;
    const mul=(GameState.symbolPassiveTier?.Square>=2&&card.symbol==='Square')?8:4;
    return mul*Math.max(0,GameState.gold||0);
  },
  // #3 加重：デッキ内の同じ記号のカード枚数×1。強化効果が付いている間だけ加算
  weightedBonus(card){
    if(!card||card.enhance!=='加重'||typeof GameState==='undefined') return 0;
    const mul=(GameState.symbolPassiveTier?.Square>=2&&card.symbol==='Square')?2:1; // v14 #1 シカクパッシブLv2：シカクカードは2倍
    return GameState.currentDeck.filter(c=>c.symbol===card.symbol).length*mul;
  },
  // #7 図鑑・カード表示用：効果名→アイコンキー
  ENHANCE_ICON: { '数値強化':'enh_number','拡大':'enh_expand_rect','横拡張':'enh_expand_h','縦拡張':'enh_expand_v','マルマルチ':'multi_circle','サンカクマルチ':'multi_triangle','シカクマルチ':'multi_square','バツマルチ':'multi_cross','ハブ':'enh_hub','連鎖':'enh_chain','オールマルチ':'multi_all','巨大化':'enh_giant','肥大化':'enh_bloat','ブルジョワ':'enh_bourgeois','ドロー':'enh_draw','エクステンド':'enh_extend','加重':'enh_weighted','ギャンブル':'enh_gamble','トップスピード':'enh_top_speed','重ね掛け':'enh_overlay' },
  JAMMING_ICON: { 'スタン':'jam_stun','サンダー':'jam_thunder','混乱':'jam_confuse','ブレイク':'jam_break','延命':'jam_prolong','ビンゴ阻害':'jam_bingo_block','リンク':'jam_link','引き直し':'jam_redraw','封印':'jam_seal','誘導':'jam_guide' },
  TRAIT_ICON: { '塗りつぶし':'trait_paint','塗りつぶし(レリック)':'trait_paint_relic','指令官':'trait_commander','ネガティブ':'trait_negative','ネガティブ(パッシブ)':'trait_negative','ディスカード':'trait_discard','レリック特攻':'trait_relic_assault','ミニマム':'trait_minimum','マキシマム':'trait_maximum','将軍':'trait_general','保留':'trait_hold','竜頭蛇尾':'trait_dragon' },
  iconFor(kind,name,opts){ const map={enhance:this.ENHANCE_ICON,jamming:this.JAMMING_ICON,trait:this.TRAIT_ICON}[kind]||{}; const k=kind==='relicEnhance'?name:map[name]; return (k&&typeof GameIcons!=='undefined'&&GameIcons.has(k))?GameIcons.svg(k,opts):''; },
  // #21 付与効果の抽選：対象カードに現在付与されている効果以外から選ぶ
  pickDifferent(pool, current){
    const cand = pool.filter(x=>x!==current);
    return GlobalFunctions.randChoice(cand.length>0?cand:pool);
  },

  // #A 記号パッシブ（ボスクリアごとに1つ選択・3段階）
  // #3 パッシブ選択候補のシンボル一覧（ホシは実際のカード記号ではなくパッシブ専用枠）
  PASSIVE_SYMBOLS: ['Circle','Triangle','Square','Cross','Hoshi','Check'],
  SYMBOL_PASSIVE_NAMES: { Circle:'マルパッシブ', Triangle:'サンカクパッシブ', Square:'シカクパッシブ', Cross:'バツパッシブ', Hoshi:'ホシパッシブ', Check:'チェックパッシブ', Seven:'セブンパッシブ' },
  SYMBOL_PASSIVES: {
    Circle: {
      1: { name:'マル・ネガティブセット', desc:'ゲーム開始時、マルカードn枚（n=マルビンゴ倍率/10）に性質変化：ネガティブ(パッシブ)を付与。ショップ内での性質変化カードの出現確率を倍にする',
        live(){ const n=Math.floor((GameData.BINGO_MULTIPLIER_BASE.Circle||0)/10); return `対象枚数：1×${n}＝${n}枚（マル倍率${Math.round((GameData.BINGO_MULTIPLIER_BASE.Circle||0)*100)/100}より算出）`; } },
      2: { name:'マル・オンプレイ', desc:'マルカードをプレイした時、盤面にあるマルカードの数×マルビンゴ倍率×10点を現在の点数に加算する',
        live(){ const n=(typeof GameMainScene!=='undefined'&&GameMainScene.board)?GameMainScene.board.filter(c=>c&&c.symbol==='Circle').length:GameState.currentDeck.filter(c=>c.symbol==='Circle').length; const mult=GameData.BINGO_MULTIPLIER_BASE.Circle; return `現在の盤面のマル枚数:${n} × マル倍率(${Math.round(mult*100)/100}) × 10 = +${Math.round(n*mult*10)}点`; } },
      3: { name:'マル・エスカレート', desc:'ステージクリア時、マル以外の3つのビンゴ倍率（バツはバツパッシブ適用後の実効値）を合算してマル倍率に加算する（合計が負の場合は加算しない）',
        live(){
          let crossEff=GameData.BINGO_MULTIPLIER_BASE.Cross;
          if(GameState.symbolPassiveTier.Cross>=2) crossEff=Math.max(...GameData.SYMBOLS.map(s=>GameData.BINGO_MULTIPLIER_BASE[s]));
          if(GameState.symbolPassiveTier.Cross>=3) crossEff*=4;
          const sum=GameData.BINGO_MULTIPLIER_BASE.Triangle+GameData.BINGO_MULTIPLIER_BASE.Square+crossEff;
          return `サンカク+シカク+バツ(実効)＝${Math.round(sum*100)/100} → クリア時マル倍率+${sum>0?Math.round(sum):0}`;
        } },
    },
    // #8 チェックパッシブ（旧マルパッシブ1の効果を継承）
    Check: {
      // #19 チェックパッシブ1：ビンゴした記号の種類が2種類以上の時、最終乗算補正+(種類数-1)
      1: { name:'チェック・バラエティ', desc:'ビンゴ時、このラウンドでビンゴした記号の種類（同時ビンゴを含む）が2種類以上の時、最終乗算補正+n（n=ビンゴした記号の種類の数-1）',
        live(){ const n=(typeof GameMainScene!=='undefined'&&GameMainScene.bingoSymbolsThisRound)?GameMainScene.bingoSymbolsThisRound.size:0; return `このラウンドでビンゴした記号の種類：${n}種類 → 最終乗算補正+${Math.max(0,n-1)}`; } },
      2: { name:'チェック・コーナー', desc:'ゲーム開始時、盤面の4隅にマル・シカク・サンカクのいずれかランダムな記号（基礎点100）と、ランダムなマルチ強化（マルマルチ/シカクマルチ/サンカクマルチ/オールマルチ）が付いたカードを配置する',
        live(){ return '盤面4隅に基礎点100・オールマルチのマルカードを配置'; } },
      // #20 チェックパッシブ3：同じ記号のビンゴが2回目になるまで、盤面がエクステンド状態（ビンゴしてもラウンドが終了しない）
      3: { name:'チェック・エクステンド', desc:'①同じ記号のビンゴが2回目になるまで、盤面にジャミング効果「オールブレイク」を付与。オールブレイク効果：どの記号でビンゴしてもラウンドが終了しない',
        live(){ const gm=(typeof GameMainScene!=='undefined')?GameMainScene:null; const cnt=(gm&&gm.bingoSymbolCountThisRound)||{}; const mx=Math.max(0,...Object.values(cnt)); return (gm&&gm.isCheckExtendActive&&gm.isCheckExtendActive())?`オールブレイク：有効（同じ記号のビンゴ最大${mx}/2回）`:'オールブレイク：このラウンドは解除済み'; } },
    },
    Triangle: {
      1: { name:'サンカク・レシオ', desc:'デッキ内のサンカクカード比率nを計算し、サンカクカードの基礎点に(1+n)を乗算する。また、アップグレードに「ジャミング優遇強化」が出現するようになる',
        live(){ const total=GameState.currentDeck.length||1; const n=GameState.currentDeck.filter(c=>c.symbol==='Triangle').length/total; return `サンカク比率n=${Math.round(n*100)/100} → サンカク基礎点×${Math.round((1+n)*100)/100}`; } },
      2: { name:'サンカク・レゾナンス', desc:'デッキ内のサンカクカードでジャミング効果を持つもの1枚につき、最終補正倍率+0.1する',
        live(){ const n=GameState.currentDeck.filter(c=>c.jamming&&c.symbol==='Triangle').length; return `サンカクのジャミング所持カード:${n}枚 → 最終補正倍率+${Math.round(n*0.1*100)/100}`; } },
      3: { name:'サンカク・エコー', desc:'サンカクカードのジャミング効果を使用した次のターンに、もう一度同じ効果をNPCに付与する',
        live(){ return 'ジャミングカード使用の1ターン後に同じ効果を再付与'; } },
    },
    Square: {
      // #13 手札上限+1の代わりに、ショップでのパック購入時の選択可能カード枚数+1
      1: { name:'シカク・ドロー', desc:'シカクカードをプレイした時、そのカード自身の基礎点+1を永続付与し、カードを1枚ドローする。また、ショップでパック購入時の選択可能カード枚数+1',
        live(){ return 'シカクカードプレイ時：自身の基礎点+1（永続）、ドロー+1枚（そのカードにも基礎点+1）'; } },
      2: { name:'シカク・アンプ', desc:'シカクカードの強化効果を強化する。数値強化・シカクマルチ・ハブ・連鎖・巨大化・肥大化・ブルジョワ・ドロー・トップスピード・加重・エクステンド②は効果2倍、横拡張・縦拡張は4マスに、拡大は4×4マスに拡張される',
        live(){ return '対象の強化効果が強化される（数値・枚数2倍／拡張は4マス／拡大は4×4マス）'; } },
      3: { name:'シカク・クロックアップ', desc:'ゲーム開始時、ターン終了ボタンの下にクロックアップボタンを配置する（ゲーム中1回のみ・自分のターンのみ発動可能）。発動すると30秒間、盤面にエクステンドを付与し、その間はターンを消費せずにカードを自由に配置できる。ターン終了ボタンを押すか30秒経過するとターンを1消費し、点数計算を行う',
        live(){ return (typeof GameMainScene!=='undefined'&&GameMainScene.clockUpUsed)?'このゲームのクロックアップ：使用済み':'このゲームのクロックアップ：未使用'; } },
    },
    Cross: {
      // #2 NPCのバツのカード基礎点のみに制限
      1: { name:'バツ・スケール', desc:'NPCのバツのカード基礎点が常にデッキ枚数×3に変化する。また、ショップにバツカードが出現するようになる',
        live(){ const n=GameState.currentDeck.length; return `デッキ枚数:${n}枚 → NPCのバツ基礎点=${n*3}`; } },
      2: { name:'バツ・ミラー', desc:'一番高いビンゴ倍率を常にバツ倍率に反映し続ける',
        live(){ const max=Math.max(...GameData.SYMBOLS.map(s=>GameData.BINGO_MULTIPLIER_BASE[s])); return `現在の最大倍率:${Math.round(max*100)/100} → バツ倍率に反映`; } },
      3: { name:'バツ・クアドラプル', desc:'①点数計算時、現在のバツビンゴ倍率をさらに4倍して補正する。②全てのカードが常にバツカードになる（デッキのカードは全てバツ記号に変化し、パック・ピックアップカードなどから排出されるカードも全てバツ記号になる）',
        live(){ const max=Math.max(...GameData.SYMBOLS.map(s=>GameData.BINGO_MULTIPLIER_BASE[s])); return `バツ倍率(${Math.round(max*100)/100}) × 4 = ${Math.round(max*4*100)/100}`; } },
    },
    // #3 ホシパッシブ（実際のカード記号ではなく専用の特殊効果枠）
    Hoshi: {
      1: { name:'ホシ・リロール', desc:'ボス効果を一度だけリロールできるようになる。また、ショップの品揃え更新を解放する',
        live(){ return GameState.bossRerollUsed?'このボスではリロール済み':'未使用（ボスステージでリロール可能）'; } },
      2: { name:'ホシ・ペンタ', desc:'盤面が5×5マスになる。5列ビンゴの倍率は3列ビンゴの2倍になる',
        live(){ return `盤面:5×5マス / 5列ビンゴ倍率×${GameData.PENTA_MULTIPLIER_FACTOR}`; } },
      3: { name:'ホシ・ヘッドスタート', desc:'ゲーム開始時、目標点数の30%を現在の点数に加算する',
        live(){ return `目標点数の30%＝+${Math.round(GameState.targetScore*0.3)}点を開始時に加算`; } },
    },
    // #新規 セブンパッシブ（現在の点数の下1桁が7の時のみ選択肢に出現する特殊枠）
    Seven: {
      1: { name:'セブン・ラッキー', desc:'ビンゴ時、7の倍数の基礎点を持つカード1枚につき、補正倍率+77する',
        live(){ return 'そのビンゴ列に含まれる7の倍数の基礎点カード1枚につき補正倍率+77'; } },
      2: { name:'セブン・アクセル', desc:'累計で7回ビンゴするごとに、全記号のビンゴ倍率+7し、次のビンゴ時に限り最終乗算補正×7する',
        live(){ const n=GameState.totalBingoCount||0; const rest=(7-(n%7))%7; return `累計ビンゴ回数：${n}回（次の節目まであと${rest}回）${GameState.sevenPendingMultBoost?' ／ 次のビンゴで最終乗算補正×7が発動！':''}`; } },
      3: { name:'セブン・ハーモニー', desc:'デッキの枚数が7の倍数の時、最終加算補正+目標点数の7%',
        live(){ const n=GameState.currentDeck.length; return n%7===0?`デッキ${n}枚（7の倍数）→ 最終加算補正+${Math.round(GameState.targetScore*0.07)}`:`デッキ${n}枚（7の倍数ではないため現在は無効）`; } },
    },
  },


  RELIC_ENHANCE_POOL: [
    { id:'ren_discard', name:'廃棄強化',     desc:'①捨て札は廃棄札へ。最終乗算補正×1.5' },
    { id:'ren_circle', name:'マルオール',   desc:'①ビンゴ時補正基礎点+n（n=デッキのマルカード数）' },
    { id:'ren_square', name:'シカクオール',  desc:'①ビンゴ時補正基礎点+n（n=デッキのシカクカード数）' },
    { id:'ren_triangle', name:'サンカクオール',desc:'①ビンゴ時補正基礎点+n（n=デッキのサンカクカード数）' },
    { id:'ren_only_one', name:'オンリーワン',  desc:'①レリック所持数が1つの時、補正倍率+20' },
    { id:'ren_pair', name:'ペアルック',    desc:'①同じレリックを持っている時、カード基礎点+40' },
    { id:'ren_negative', name:'ネガティブ',    desc:'①このレリックは所持数に加算されない' },
    { id:'ren_discard_sell', name:'ディスカード', desc:'①売却時デッキ枚数/2（切捨て）Gを得る' },
    { id:'ren_general', name:'将軍',          desc:'①ビンゴ時、最終乗算補正×1.1' },
    { id:'ren_all_link', name:'オールリンク',  desc:'①プレイヤーが配置するカードに常にジャミング効果「リンク」が付与されている状態になる（他のジャミング効果と重複する）' },
    { id:'ren_gold', name:'G獲得',         desc:'①ステージクリア時追加で1G得る' },
    { id:'ren_draw', name:'ドロー強化',    desc:'①ラウンド終了時カードを1枚ドロー' },
    { id:'ren_double', name:'倍化',          desc:'①2個分とカウント。最終乗算補正×1.5' },
    { id:'ren_triple', name:'3倍化',         desc:'①3個分とカウント。最終乗算補正×2' },
    { id:'ren_cross', name:'バツ強化',      desc:'①バツビンゴ時、ビンゴ倍率を2倍にする' },
    { id:'ren_npc', name:'NPC強化',       desc:'①NPCが2回行動。補正基礎点×5' },
    { id:'ren_draw_pile', name:'山札強化',      desc:'①ビンゴ時、山札数×100を最終加算補正に追加' },
    { id:'ren_disc_pile', name:'捨て札強化',    desc:'①ビンゴ時補正基礎点+n（n=捨て札数）' },
    { id:'ren_black', name:'ブラックカード', desc:'①ショップ金額が半額（切り上げ）。購入時即時反映。複数所持しても効果は重複しない' },
    { id:'ren_first', name:'手番高速',      desc:'①全ラウンドで最初の手番がプレイヤーになる' },
    { id:'ren_grade', name:'グレードオール', desc:'①ビンゴ時補正倍率+n（n=デッキの強化/ジャミング/性質変化の総数）' },
  ],

  // #8 レリックをタップした時に、現在の効果量を具体的な数値で表示する（例：リロール強化→補正基礎点:50）
  getRelicLiveInfo(relic){
    if(typeof GameState==='undefined') return null;
    const gm=(typeof GameMainScene!=='undefined')?GameMainScene:null;
    switch(relic.id){
      case 'reroll_boost': return `補正基礎点:${GameState.rerollCount*10}`;
      case 'bingo': return '補正基礎点:+30';
      case 'onko_chishin': return `補正基礎点:+${10*GameState.relicCount()}（m=${GameState.relicCount()}）／補正倍率:+${10*GameState.passiveCount()}（n=${GameState.passiveCount()}）`;
      case 'charge': return `補正倍率:+${gm?(gm.chargeN||0):0}（n=${gm?(gm.chargeN||0):0}、150超でn=-10）`;
      case 'odd_boost': return '補正基礎点:+15（奇数加算時）';
      case 'even_boost': return '補正基礎点:+15（偶数加算時）';
      case 'circle_boost': return '補正基礎点:+60（マルビンゴ時）';
      case 'triangle_boost': return '補正基礎点:+60（サンカクビンゴ時）';
      case 'square_boost': return '補正基礎点:+60（シカクビンゴ時）';
      case 'relic_boost': { const n=GameState.relicCount(); return `補正基礎点:+${5+8*n}`; }
      case 'empty_boost': { const ec=(gm&&gm.board)?gm.board.filter(c=>!c).length:0; return `補正倍率:+${6*ec+5}`; }
      case 'combo': return '最終乗算補正:+1.5（前ラウンドと異なる記号でビンゴ時）';
      case 'turn_boost': { const t=gm?(gm.turnInRound||1):1; return `最終乗算補正:×${Math.round(Math.pow(1.01,t)*100)/100}`; }
      case 'hand_boost': return `補正倍率:+${GameState.hand.length*3}`;
      case 'last_stand': return GameState.round>=4?'最終乗算補正:×2（発動中）':'最終乗算補正:×2（4ラウンド以降で発動）';
      case 'double': return '最終乗算補正:×1.5（同ターン2ビンゴ以上で発動）';
      case 'gold_boost': return 'クリア報酬:G+3';
      case 'round_boost': return `最終加算補正:+${1000*GameState.round}（ラウンド終了時）`;
      case 'base_boost': return '最終加算補正:+2000（取得時に反映済み）';
      case 'jamming_boost': return `点数:+${Math.round(GameState.targetScore*0.05)}（ビンゴ阻害カード配置時）`;
      case 'majin_seal': return `補正基礎点:+${(relic.sealValue||0)+50}`;
    }
    switch(relic.relicEnhance){
      case 'ren_circle': return `補正基礎点:+${GameState.currentDeck.filter(c=>c.symbol==='Circle').length}`;
      case 'ren_triangle': return `補正基礎点:+${GameState.currentDeck.filter(c=>c.symbol==='Triangle').length}`;
      case 'ren_square': return `補正基礎点:+${GameState.currentDeck.filter(c=>c.symbol==='Square').length}`;
      case 'ren_disc_pile': return `補正基礎点:+${GameState.discardPile.length}`;
      case 'ren_grade': { const n=GameState.currentDeck.reduce((s,c)=>{let x=0;if(c.enhance)x++;if(c.jamming)x++;if(c.trait)x++;return s+x;},0); return `補正倍率:+${n}`; }
      case 'ren_only_one': return GameState.relicCount()===1?'補正倍率:+20（発動中）':'補正倍率:+20（レリック1個所持時のみ）';
      case 'ren_general': return '最終乗算補正:×1.1';
      case 'ren_pair': return GameState.relics.filter(x=>x.id===relic.id).length>=2?'カード基礎点:+40（発動中）':'カード基礎点:+40（同じレリックを2つ以上所持時のみ）';
      case 'ren_npc': return '補正基礎点:×5（NPCは2回行動）';
      case 'ren_double': return '最終乗算補正:×1.5';
      case 'ren_triple': return '最終乗算補正:×2';
      case 'ren_draw_pile': return `最終加算補正:+${GameState.drawPile.length*100}`;
      case 'ren_discard': return '最終乗算補正:×1.5';
      case 'ren_gold': return 'クリア報酬:G+1';
    }
    return null;
  },

  // #19 パック内訳表示：各パックの中身の確率を一覧化する
  PACK_LIST: [
    { id:'card_pack', label:'？カードパック' },
    { id:'normal_upgrade', label:'通常アップグレード' },
    { id:'pickup_upgrade', label:'ピックアップアップグレード' },
    { id:'normal_explosive_upgrade', label:'爆発通常アップグレード' },
    { id:'special_upgrade', label:'特別アップグレード' },
    { id:'card_focus', label:'カードフォーカスパック' },
    { id:'bingo_focus', label:'ビンゴフォーカスパック' },
    { id:'dream_card', label:'ドリームカードパック' },
    { id:'jamming_pack', label:'ジャミングカードパック' },
    { id:'relic_pack', label:'レリックパック' },
    { id:'pickup_relic', label:'ピックアップレリック' },
    { id:'pickup_card', label:'ピックアップカード' },
    { id:'enhance_pack', label:'強化カードパック' },
  ],
  getPackBreakdown(packId){
    const poolPacks=['normal_upgrade','normal_explosive_upgrade'];
    if(poolPacks.includes(packId)){
      const rareItems=this.NORMAL_SELECT_POOL.filter(e=>e.rarity);
      const normalItems=this.NORMAL_SELECT_POOL.filter(e=>!e.rarity);
      const rareSum=rareItems.reduce((s,e)=>s+e.rarity,0);
      const normalEach=normalItems.length>0?(1-rareSum)/normalItems.length:0;
      const lines=normalItems.map(e=>`${e.name}：${Math.round(normalEach*1000)/10}%`);
      lines.push('※ジャミング優遇強化はサンカクパッシブLv1を取得していない時は排出されない');
      rareItems.forEach(e=>lines.push(`${e.name}：${Math.round(e.rarity*1000)/10}%（レア枠）`));
      return lines;
    }
    if(packId==='pickup_upgrade'){
      const items=this.NORMAL_SELECT_POOL.filter(e=>!e.rarity); const each=100/items.length;
      return ['通常アップグレードのレア枠以外から1つが陳列される（購入時に即発動）',...items.map(e=>`${e.name}：${Math.round(each*10)/10}%`),'※ジャミング優遇強化はサンカクパッシブLv1を取得していない時は排出されない'];
    }
    if(packId==='special_upgrade'){
      const pool=this.SPECIAL_SELECT_POOL; if(!pool||pool.length===0) return ['（現在選択可能な効果なし）'];
      const each=100/pool.length;
      return pool.map(e=>`${e.name}：${Math.round(each*10)/10}%`);
    }
    if(packId==='card_pack'||packId==='card_focus'||packId==='enhance_pack'){
      return ['マル：30%','サンカク：30%','シカク：30%','バツ：10%（バツパッシブ1未取得時は出現しない、その場合はマル・サンカク・シカクが均等）','付与効果（強化/ジャミング/性質変化）はランダムに付加'];
    }
    if(packId==='jamming_pack'){
      return ['マル：30%','サンカク：30%','シカク：30%','バツ：10%（バツパッシブ1未取得時は出現しない）','ジャミング効果はランダムな1種が必ず付与される'];
    }
    // #4 ビンゴフォーカスパック：下記5種のビンゴ倍率強化から3つが提示され、1つを選ぶ（各効果の提示率60%）
    if(packId==='bingo_focus'){
      return ['5種のビンゴ倍率強化から3つが提示され、1つを選択（各効果が提示される確率：60%）','マルビンゴ+4：○のビンゴ倍率を+4','サンカクビンゴ+4：△のビンゴ倍率を+4','シカクビンゴ+4：□のビンゴ倍率を+4','バツビンゴ+6：×のビンゴ倍率を+6','全ビンゴ+1：全記号のビンゴ倍率を+1'];
    }
    if(packId==='pickup_card'){
      return [`ランダム商品の各枠が${Math.round(this.PICKUP_CARD_RATE*100)}%の確率でピックアップカードとして陳列される`,
        '？カードパックと同じ中身から1枚を事前に抽選して陳列（マル30%・サンカク30%・シカク30%・バツ10%、バツパッシブ1未取得時はバツなし）',
        `${Math.round(this.PICKUP_CARD_SPECIAL_RATE*100)}%の確率で強化・ジャミング・性質変化をすべて付与した基礎点100〜150のカードになる`,
        '価格：1G＋2G（ジャミング付き）＋4G（強化付き）＋6G（性質変化付き）'];
    }
    if(packId==='dream_card'){
      return ['基礎点120〜150のカードが1枚（強化・ジャミング・性質変化のすべてが付与された状態）'];
    }
    // #3 レリックパック：グレード別排出率・レリック強化付与率・全レリックの内訳
    if(packId==='relic_pack'||packId==='pickup_relic'){
      const lines=[packId==='pickup_relic'?'ランダムなレリック1つを購入（次の確率で抽選）':'レリック3つから1つ選択（各レリックは次の確率で抽選）'];
      const gs=Object.entries(this.RELIC_GRADES).filter(([g,v])=>v.weight>0);
      const total=gs.reduce((t,[g,v])=>t+v.weight,0);
      gs.forEach(([g,v])=>lines.push(`<b>${v.name}：${Math.round(v.weight/total*1000)/10}%</b>`));
      lines.push(`レリック強化効果の付与確率：${Math.round(this.RELIC_ENHANCE_RATE*100)}%（魔力ステージE所持時は100%）`);
      gs.forEach(([g,v])=>{
        const list=this.RELIC_POOL.filter(r=>this.relicGrade(r)===g&&r.id!=='majin_seal');
        const each=list.length?Math.round(v.weight/total/list.length*10000)/100:0;
        lines.push(`<div class="pb-grade-head">【${v.name}】${list.length}種（1種あたり${each}%）</div>`);
        list.forEach(r=>lines.push(`<span class="pb-relic">${typeof GameIcons!=='undefined'?GameIcons.relic(r):''}${r.name}</span>`));
      });
      lines.push('※魔神のお墨付きは排出されない（魔神イベントでのみ入手）');
      return lines;
    }
    return ['（内訳情報なし）'];
  },

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
  // #5 レリックのグレード（ノーマル/レア/スーパーレア/レジェンド）。ピックアップレリック・レリックパックはノーマル80%・レア15%・スーパーレア5%で抽選（レジェンドは排出されない）
  RELIC_GRADES: { normal:{name:'ノーマル',weight:80}, rare:{name:'レア',weight:15}, super:{name:'スーパーレア',weight:4}, legend:{name:'レジェンド',weight:1} },
  RELIC_GRADE_OF: {
    combo:'normal', relic_boost:'normal', base_boost:'normal', hand_boost:'normal', round_boost:'normal', odd_boost:'normal', even_boost:'normal',
    circle_boost:'normal', triangle_boost:'normal', square_boost:'normal', bingo:'normal', empty_boost:'normal', last_stand:'normal', reroll_boost:'normal',
    draw_boost:'normal', big_explosion:'normal', hobby_collect:'normal', gambling_addict:'normal', gold_boost:'normal', all_bingo_gain:'normal',
    num_boost3:'rare', ten_stage:'rare', double:'rare', paint:'rare', turn_boost:'rare', passive_unneeded:'rare',
    jamming_boost:'super', pinnacle:'super', joker:'super', charge:'super',
    majin_seal:'legend', onko_chishin:'legend',
  },
  relicGrade(relicOrId){ const id=typeof relicOrId==='string'?relicOrId:relicOrId?.id; return this.RELIC_GRADE_OF[id]||'normal'; },
  // グレードの重みで抽選し、そのグレードのレリックから等確率で1つ選ぶ
  pickRelicBaseByGrade(){
    const gs=Object.entries(this.RELIC_GRADES).filter(([g,v])=>v.weight>0);
    const total=gs.reduce((t,[g,v])=>t+v.weight,0); let r=Math.random()*total, grade=gs[0][0];
    for(const [g,v] of gs){ r-=v.weight; if(r<=0){ grade=g; break; } }
    const pool=this.RELIC_POOL.filter(x=>this.relicGrade(x)===grade&&x.id!=='majin_seal'); // v12 #5 魔神のお墨付きは排出しない
    return GlobalFunctions.randChoice(pool.length?pool:this.RELIC_POOL);
  },
  // #4 レリックの価格（グレード別）。レリック強化効果付きは+3G
  RELIC_GRADE_PRICE: { normal:3, rare:6, super:9, legend:12 },
  // v11 #4 売却額：ノーマル1G・レア2G・スーパーレア3G（レジェンド4G）、レリック強化付きは+2G（ディスカード強化はデッキ枚数/2）
  RELIC_GRADE_SELL: { normal:1, rare:2, super:3, legend:4 },
  relicSellPrice(relic){
    if(!relic) return 0;
    if(relic.relicEnhance==='ren_discard_sell') return Math.floor(GameState.currentDeck.length/2);
    return (this.RELIC_GRADE_SELL[this.relicGrade(relic)]||1) + (relic.relicEnhance?2:0);
  },
  relicBasePrice(relic){ return (this.RELIC_GRADE_PRICE[this.relicGrade(relic)]||3) + (relic&&relic.relicEnhance?3:0); },
  // #5 通常セレクトの抽選プール：ジャミング優遇強化はサンカクパッシブLv1取得時のみ出現
  normalSelectPool(){ return this.NORMAL_SELECT_POOL.filter(e=>e.id!=='jam_favor'||((typeof GameState!=='undefined')&&GameState.symbolPassiveTier?.Triangle>=1)); },
  RELIC_ENHANCE_RATE: 0.3, // #4 レリック強化効果の付与確率30%
  RELIC_POOL: [
    { id:'bingo', name:'ビンゴ',           desc:'①ビンゴした時、補正基礎点+30' },
    { id:'charge', name:'チャージ',         desc:'①補正倍率+n（ゲーム開始時n=0。全てのビンゴ計算が終わりラウンドが上がる時に、手札のカード基礎点の合計をnに加算（ブレイク・オールブレイク中のビンゴなどラウンドが上がらない時は変化しない）。nが150を超えるとn=-10になる）' },
    { id:'double', name:'ダブル',           desc:'①同一ターンにビンゴが2つ以上ある時、最終乗算補正×1.5' },
    { id:'odd_boost', name:'奇数補正',         desc:'①ビンゴで加算される基礎点が奇数の度に補正基礎点+15' },
    { id:'even_boost', name:'偶数補正',         desc:'①ビンゴで加算される基礎点が偶数の度に補正基礎点+15' },
    { id:'circle_boost', name:'マル補正',         desc:'①マルでビンゴした時、補正基礎点+60' },
    { id:'triangle_boost', name:'サンカク補正',     desc:'①サンカクでビンゴした時、補正基礎点+60' },
    { id:'square_boost', name:'シカク補正',       desc:'①シカクでビンゴした時、補正基礎点+60' },
    { id:'combo', name:'コンボ',           desc:'①前ラウンドと異なる記号でビンゴした時、最終乗算補正+1.5' },
    { id:'relic_boost', name:'レリック強化',     desc:'①レリック所持数nに応じ、補正基礎点+5+8n' },
    { id:'paint', name:'ペイント',         desc:'①ゲーム開始時、ランダムな記号が選ばれその記号のカードに塗りつぶし(レリック)付与。②1ラウンドのターン-4' },
    { id:'turn_boost', name:'ターン強化',       desc:'①ビンゴ時、経過ターン数nに応じて最終乗算補正×1.01^n' },
    { id:'jamming_boost', name:'ジャミング増強',   desc:'①ビンゴ阻害の効果を持つカードが盤面に配置された時スタン効果を追加。現在の点数に目標点数5%を加算。②ブレイクの効果を持つカードが盤面に配置された時、現在のラウンドの補正倍率+20③手札上限-3' },
    { id:'empty_boost', name:'空きマス強化',     desc:'①ビンゴ時、空きマス数nに応じ補正倍率+6n+5' },
    { id:'draw_boost', name:'ドロー強化',       desc:'①ターン数が4の倍数になった時、カードを1枚ドローする' },
    { id:'last_stand', name:'背水の陣',         desc:'①4ラウンド以降、最終乗算補正×2' },
    { id:'base_boost', name:'補正基礎点強化',   desc:'①最終加算補正+2000' },
    { id:'round_boost', name:'ラウンド強化',     desc:'①ラウンド終了時、最終加算補正+1000×n（n=現在ラウンド）' },
    { id:'reroll_boost', name:'リロール強化',     desc:'①ビンゴ時、残りリロール回数n×10を補正基礎点に加算' },
    { id:'hand_boost', name:'手札強化',         desc:'①ビンゴ時、手札の数×3を補正倍率に加算' },
    { id:'gold_boost', name:'G獲得',            desc:'①ステージクリア時、追加でG+3を得る' },
    // #12 新規レリック9種
    { id:'all_bingo_gain', name:'オールビンゴ獲得', desc:'①ステージクリア時、マル・サンカク・シカク・バツすべてのビンゴ倍率+1する' },
    { id:'num_boost3', name:'数値強化1獲得',     desc:'①ステージクリア時、デッキ内のランダムなカード1枚の基礎点+10する' },
    { id:'hobby_collect', name:'趣味レリック集め', desc:'①このレリックはレリック3個分である。②ステージクリア時、レリックパックを入手' },
    { id:'passive_unneeded', name:'パッシブ不要理論', desc:'①最終乗算補正にmを加算する。m=(4.5-n)（nは所持している記号パッシブの種類数）。mが0未満の場合は加算しない' },
    { id:'ten_stage', name:'テンステージ',       desc:'①ビンゴ時に加算される基礎点が10の倍数の時、補正基礎点+30②ビンゴ時のターンが10ターンの時、補正倍率+30' },
    { id:'joker', name:'ジョーカー',            desc:'①このレリックを売却した時、デッキから好きなカードを1枚選び、基礎点+10した上で記号をマル・サンカク・シカク・バツの中から好きなものに変更する' },
    { id:'gambling_addict', name:'ギャンブル依存症', desc:'①カード強化効果「ギャンブル」の効果量が、常に+50か-50のどちらかのみになる' },
    { id:'big_explosion', name:'大爆発',         desc:'①ステージクリア時、所持G が10G以上（レリック強化「ブラックカード」所持時は5G以上）ならその分を消費し、爆発通常アップグレードをもう1パック追加で獲得する' },
    { id:'pinnacle', name:'極みの境地',          desc:'①このレリックはレリック所持数上限分の大きさを持つ。②補正基礎点+150③補正倍率+150' },
    { id:'onko_chishin', name:'温故知新',        desc:'①補正基礎点+10m（m=レリック所持数）②補正倍率+10n（n=パッシブ所持数）' }, // v12 #2 レジェンド
  ],

  BOSS_EFFECT_POOL: [
    { id:'cross5000', name:'バツ5000',         desc:'NPCの×のカード基礎点が5000点になる' },
    { id:'block_cells', name:'マス妨害×2',        desc:'盤面の2つのランダムなマスが使用不可になる' },
    { id:'quad_only', name:'４ビンゴ',          desc:'プレイヤーは4列以上でないとビンゴできない' },
    // #4 旧ブラックアウト → パッシブ効果無効（idは互換のため据え置き）
    { id:'blackout', name:'パッシブ効果無効',  desc:'ゲーム開始時、パッシブ効果を無効化する（パッシブ「魔力」は例外）。ゲーム終了時に解除される' },
    { id:'unify', name:'統一',              desc:'マル・サンカク・シカクいずれか1記号のビンゴ倍率+10、他は-20。ステージ終了時に元に戻す' },
    { id:'no_relic', name:'レリック使用不可',  desc:'レリックの効果が発動しない' },
    { id:'cross_corner', name:'バツ倍率×2',        desc:'盤面4隅のうち2つに×が置かれた状態でラウンドが始まる' },
    { id:'turn_limit', name:'ターン制限-4',      desc:'1ラウンドのターン数-4（ステージ終了後に元に戻る）' },
    { id:'reroll_limit', name:'リロール制限-3',    desc:'リロール回数-3' },
    { id:'hand_limit', name:'手札制限-1',        desc:'手札の上限-1' },
    { id:'discard_used', name:'廃棄',              desc:'盤面に使用したカードは廃棄札に移動し、デッキに戻らない' },
  ],

  // #9 階層6以降の強化版ボス効果（効果量2倍）
  BOSS_EFFECT_POWERED: {
    cross5000:{ name:'バツ10000', desc:'NPCの×のカード基礎点が10000点になる' },
    unify:{ name:'統一_改', desc:'マル・サンカク・シカクいずれか1記号のビンゴ倍率+20、他は-40。ステージ終了時に元に戻す' },
    hand_limit:{ name:'手札制限-2', desc:'手札の上限-2' },
    turn_limit:{ name:'ターン制限-8', desc:'1ラウンドのターン数-8（ステージ終了後に元に戻る）' },
    reroll_limit:{ name:'リロール禁止', desc:'リロール回数が0回になる' },
    cross_corner:{ name:'バツ配置×4', desc:'盤面4隅すべてに×が置かれた状態でラウンドが始まる' },
    block_cells:{ name:'マス妨害×4', desc:'盤面の4つのランダムなマスが使用不可になる' },
  },
  bossEffectForFloor(e, floor){
    const pw=floor>=6?this.BOSS_EFFECT_POWERED[e.id]:null;
    return pw?{...e, ...pw, power:2}:{...e, power:1};
  },
  MAX_RELICS: 5,

  // #27 ショップ商品種別の確率テーブル（icon は GameIcons のキー。描画側で GIcon(icon) を呼ぶ）
  SHOP_RANDOM_TYPES: [
    { id:'pickup_relic', name:'ピックアップレリック',   weight:10, icon:'shop_pickup_relic' },
    { id:'card_pack', name:'？カードパック',         weight:5, icon:'pack_card' },
    { id:'pickup_upgrade', name:'ピックアップアップグレード', weight:5, icon:'shop_pickup_upgrade' },
    { id:'normal_upgrade', name:'通常アップグレード',     weight:60, icon:'pack_upgrade' }, // #5 出現確率2倍(30→60)
    { id:'special_upgrade', name:'特別アップグレード',     weight:8, icon:'pack_special' },
    { id:'card_focus', name:'カードフォーカスパック', weight:20, icon:'pack_card_focus' },
    { id:'bingo_focus', name:'ビンゴフォーカスパック', weight:20, icon:'pack_bingo_focus' },
    { id:'dream_card', name:'ドリームカードパック',   weight:2, icon:'pack_dream' },
    // #9 新商品：強化カードパック20%・ジャミングカードパック30%・レリックパック15%を追加（合計165%、上限175%以内）
    { id:'enhance_pack', name:'強化カードパック',     weight:20, icon:'pack_enhance' },
    { id:'jamming_pack', name:'ジャミングカードパック', weight:30, icon:'pack_jamming' },
    { id:'relic_pack', name:'レリックパック',         weight:15, icon:'pack_relic' },
    // #6 爆発通常アップグレード：通常の重み付き抽選には含めず、ショップ生成時に20%の確率で別途1枠を確保する
    { id:'normal_explosive_upgrade', name:'爆発通常アップグレード', weight:0, icon:'pack_explosive' },
    // ピックアップカード：重み付き抽選には含めず、各ランダム枠の抽選時に PICKUP_CARD_RATE の確率で別途陳列（rollRandomShopSlotType）
    { id:'pickup_card', name:'ピックアップカード', weight:0, icon:'pack_card' },
  ],
  PICKUP_CARD_RATE: 0.15,          // ランダム商品1枠あたりの陳列確率
  PICKUP_CARD_SPECIAL_RATE: 0.05,  // 全効果付き・基礎点100〜150になる確率
  // 価格：1G＋ジャミング2G＋強化4G＋性質変化6G（ブラックカード割引は呼び出し側で shopPriceOf を通す）
  pickupCardBasePrice(card){ return 1 + (card&&card.jamming?2:0) + (card&&card.enhance?4:0) + (card&&card.trait?6:0); },
  rollRandomShopSlotType(){ return Math.random() < this.PICKUP_CARD_RATE ? 'pickup_card' : this.pickWeightedType(); },

  // #3 スキップ報酬：爆発通常アップグレードを100%排出率にする（旧抽選プールは参考として残す）
  SKIP_BONUS_TYPES: [
    { id:'relic', name:'ランダムレリック', weight:35 },
    { id:'normal_upgrade', name:'通常アップグレード', weight:40 },
    { id:'special_upgrade', name:'特別アップグレード', weight:10 },
    { id:'normal_explosive_upgrade', name:'爆発通常アップグレード', weight:5 },
    { id:'dream_card', name:'ドリームカードパック', weight:5 },
  ],
  pickSkipBonusType(){
    return 'normal_explosive_upgrade'; // #3 100%排出率
  },
  // #3 ステージクリア報酬：爆発通常アップグレードを100%排出率にする（旧抽選プールは参考として残す）
  CLEAR_BONUS_TYPES: [
    { id:'normal_explosive_upgrade', name:'爆発通常アップグレード', weight:20 },
  ],
  pickClearBonusType(){
    return 'normal_explosive_upgrade'; // #3 100%排出率
  },

  pickWeightedType(){
    const pool = this.SHOP_RANDOM_TYPES;
    const total = pool.reduce((s,t)=>s+t.weight,0);
    let r = Math.random()*total;
    for(const t of pool){ r-=t.weight; if(r<=0) return t.id; }
    return pool[pool.length-1].id;
  },

  // forced：強化/ジャミング/性質変化を指定して生成する（強化カードパック等。副次効果を二重にかけないよう生成時に指定する）
  generateShopCard(forced={}){
    // #7 バツパッシブ1を取得するまでショップにバツカードは出現しない
    const crossUnlocked = typeof GameState!=='undefined' && GameState.symbolPassiveTier?.Cross>=1;
    // #4 出現確率：マル・サンカク・シカクは各30%、バツは10%（バツ未解放時はマル・サンカク・シカクの3等分＝各33.3%）
    const r=Math.random();
    let symbol;
    if(!crossUnlocked) symbol = r<0.334?'Circle':(r<0.667?'Triangle':'Square');
    else symbol = r<0.3?'Circle':(r<0.6?'Triangle':(r<0.9?'Square':'Cross'));
    // v1.00 #9 バツパッシブLv3：排出されるカードはすべてバツ記号
    if(typeof GameState!=='undefined' && GameState.symbolPassiveTier?.Cross>=3) symbol='Cross';
    // #3 ボス効果「バツ5000」はNPCのバツのみ対象のため、ショップ生成カードには影響させない
    const baseScore = GlobalFunctions.randInt(1, 50);
    let jamming = Math.random() < 0.5 ? GlobalFunctions.randChoice(Object.keys(this.JAMMING_DESC)) : null;
    let enhance = Math.random() < 0.2 ? GlobalFunctions.randChoice(this.ENHANCE_NAME_POOL) : null;
    // #8 マルパッシブ2：ショップ内での性質変化カードの出現確率を2倍にする
    let traitChance=0.05;
    if(typeof GameState!=='undefined' && GameState.symbolPassiveTier?.Circle>=2) traitChance*=2;
    let trait = Math.random() < traitChance ? GlobalFunctions.randChoice(this.TRAIT_NAME_POOL) : null;
    if(forced.enhance!==undefined) enhance=forced.enhance;
    if(forced.jamming!==undefined) jamming=forced.jamming;
    if(forced.trait!==undefined) trait=forced.trait;
    // #1 魔力ステージE：パックから得るカードは強化・ジャミング・性質変化が全て付与された状態で出現する
    if(typeof GameState!=='undefined' && GameState.hasMana && GameState.hasMana('E')){
      if(!enhance) enhance=GlobalFunctions.randChoice(this.ENHANCE_NAME_POOL);
      if(!jamming) jamming=GlobalFunctions.randChoice(Object.keys(this.JAMMING_DESC));
      if(!trait) trait=GlobalFunctions.randChoice(this.TRAIT_NAME_POOL);
    }
    const card = { id:'shopcard_'+Date.now()+'_'+Math.floor(Math.random()*100000), symbol, number:baseScore, baseScore, jamming, enhance, trait };
    this.applyGrantSideEffects(card, (typeof GameState!=='undefined')?GameState.gold:0); // #1 生成時に現在Gを正しく反映
    return card;
  },

  SHOP_PRICES: { relic:5, cardPack:2, normalUpgrade:3, specialUpgrade:10, reroll:1,
                 cardFocus:6, bingoFocus:4, dreamCard:20, pickupUpgrade:3,
                 // #9 新商品価格（各4G）
                 enhancePack:4, jammingPack:4, relicPack:6, // v11 #10 レリックパック6G
                 // #6 爆発通常アップグレード
                 normalExplosiveUpgrade:10 },

  NORMAL_SELECT_POOL: [
    { id:'circle_mult', name:`${GIcon('rarity_normal')}マルビンゴ強化`,    desc:`${GIconSym('Circle')}のビンゴ倍率を+4する`,              targetMin:0, targetMax:0 },
    { id:'cross_mult', name:`${GIcon('rarity_normal')}バツビンゴ強化`,    desc:`${GIconSym('Cross')}のビンゴ倍率を+6する`,              targetMin:0, targetMax:0 },
    { id:'square_mult', name:`${GIcon('rarity_normal')}シカクビンゴ強化`,  desc:`${GIconSym('Square')}のビンゴ倍率を+4する`,              targetMin:0, targetMax:0 },
    { id:'triangle_mult', name:`${GIcon('rarity_normal')}サンカクビンゴ強化`,desc:`${GIconSym('Triangle')}のビンゴ倍率を+4する`,              targetMin:0, targetMax:0 },
    { id:'number_up2', name:`${GIcon('rarity_normal')}基礎点上昇2`,          desc:'カードを2枚選択し、それぞれ基礎点+5', targetMin:2, targetMax:2 },
    { id:'number_up3', name:`${GIcon('rarity_normal')}基礎点上昇3`,         desc:'カードを3枚選択し、それぞれ基礎点+3', targetMin:3, targetMax:3 },
    { id:'base_up5', name:`${GIcon('rarity_normal')}基礎点上昇1`,       desc:'カードを1枚選択し、基礎点+10する',    targetMin:1, targetMax:1 },
    { id:'symbol_change', name:`${GIcon('rarity_normal')}記号変化`,          desc:'カードを最大3枚選択し記号をランダム変化', targetMin:1, targetMax:3 },
    { id:'cash_in', name:`${GIcon('rarity_normal')}換金`,              desc:'カードを1枚取り除きG獲得（強化数に応じた金額）', targetMin:1, targetMax:1 },
    // #18 複製をレア枠に変更（レア(青)マーカー表記・出現率5%）
    { id:'duplicate', name:`${GIcon('rarity_rare')}複製`,              desc:'カードを1枚選択し複製',               targetMin:1, targetMax:1, rarity:0.05 },
    { id:'grant_enhance', name:`${GIcon('rarity_normal')}カード強化付与`,    desc:'カードを1枚選択しランダムなカード強化を付与', targetMin:1, targetMax:1 },
    { id:'grant_jamming', name:`${GIcon('rarity_jamming')}ジャミング効果付与`,desc:'カードを1枚選択しランダムなジャミングを付与', targetMin:1, targetMax:1 },
    // #5/#6 ジャミング優遇強化：パックに並んだ選択可能カードのうち、ジャミング付きカード全ての基礎点+4（アイコンはジャミング効果付与と同じ）
    { id:'jam_favor', name:`${GIcon('rarity_jamming')}ジャミング優遇強化`, desc:'選択可能なカードの中でジャミング効果が付与されているカード全てに対してカード基礎点+4', targetMin:0, targetMax:0, showCards:true },
    { id:'all_mult_up1', name:`${GIcon('rarity_normal')}オールビンゴ強化`,  desc:'全記号のビンゴ倍率を+1する',          targetMin:0, targetMax:0 },
    // #8: 1%で性質変化付与
    // #18 性質変化のレア枠出現率を3%に変更
    { id:'grant_trait_rare', name:`${GIcon('rarity_rare')}性質変化付与`,     desc:'カードを1枚選択しランダムな性質変化を付与（レア）', targetMin:1, targetMax:1, rarity:0.03 },
  ],
  SPECIAL_SELECT_POOL: [
    { id:'grant_trait', name:`${GIcon('rarity_rare')}性質変化効果付与`,  desc:'カードを1枚選択しランダムな性質変化を付与', targetMin:1, targetMax:1 },
    { id:'hand_up2', name:`${GIcon('rarity_rare')}手札増加`,          desc:'手札の上限が2枚増加する',         targetMin:0, targetMax:0 },
    { id:'reroll_up2', name:`${GIcon('rarity_rare')}リロール増加`,       desc:'リロール回数を2回増加する',        targetMin:0, targetMax:0 },
    { id:'round_up1', name:`${GIcon('rarity_rare')}ラウンド増加`,       desc:'挑戦できるラウンド数が1増加する',  targetMin:0, targetMax:0 },
    // #11: 4ターン増加
    { id:'turn_up4', name:`${GIcon('rarity_rare')}ターン増加`,         desc:'1ラウンドのターン数が4増加する',   targetMin:0, targetMax:0 },
    { id:'relic_slot_up1', name:`${GIcon('rarity_rare')}レリック所持数増加`, desc:'レリック所持数上限が1増加する',    targetMin:0, targetMax:0 },
    // #14 パック購入時の選択可能カード枚数+2
    { id:'pack_card_up2', name:`${GIcon('rarity_rare')}パック選択枚数増加`, desc:'パック購入時の選択可能カード枚数が2枚増加する', targetMin:0, targetMax:0 },
    // #29: 全引き後確定性質変化付与は applyEffect 側で処理
  ],

  BOARD_SIZE: 4,
  TURNS_PER_ROUND: 16,
  MAX_ROUNDS: 5, // v1.00 #6 初期ラウンド5
  HAND_SIZE: 8, // #12 手札上限を8枚に変更
  // #11 パック購入時に選択できるカードの枚数（通常7枚／爆発アップグレード9枚）
  PACK_CARD_COUNT: 6, // #2 通常・特別・ピックアップの選択可能カード初期枚数
  EXPLOSIVE_PACK_CARD_COUNT: 7, // #2 爆発アップグレード
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

  // #9 テンゲーム：マル/サンカク/シカクが基礎点10・付与効果なしで各10枚
  buildTenGameDeck(){
    const deck = [];
    let id = 0;
    for(const symbol of ['Circle','Triangle','Square']){
      for(let i = 0; i < 10; i++){
        deck.push({ id:'card_'+(id++), symbol, number:10, baseScore:10,
          jamming:null, enhance:null, trait:null, dragonUsed:false });
      }
    }
    return deck;
  },

  // #9 ゲームモード定義（初めから選択時に表示・選択する）
  GAME_MODES: {
    normal: { id:'normal', name:'通常デッキ',
      deckDesc:'マル・サンカク・シカクが基礎点1〜10で各10枚（一部にジャミング付き）、合計30枚',
      relicDesc:'なし', passiveDesc:'なし' },
    tengame: { id:'tengame', name:'テンゲーム',
      deckDesc:'マル・サンカク・シカクが基礎点10・付与効果なしで各10枚、合計30枚',
      relicDesc:'なし', passiveDesc:'なし' },
  },
  buildDeckForMode(modeId){
    return modeId==='tengame' ? this.buildTenGameDeck() : this.buildInitialDeck();
  },

  // #7/#8 報酬G計算式の基本G
  CLEAR_REWARD_BASE_G: 5,
  SKIP_REWARD_BASE_G: 8, // #9 スキップ報酬の基本G

  // #12 多階層
  buildFloorStages(floor){
    const baseCommon=[250,1000,5000,20000,100000,250000,1000000,3000000,10000000,25000000];
    const c=baseCommon[Math.min(floor-1,9)]||250;
    const bossMulti=floor>=10?4:3;
    // #6 階層10はボス効果2つに下方修正（特有ボス効果は別枠で付与）
    const bossEffectCount=floor>=10?2:1; // #9 階層1〜9は1つ、階層10は2つ＋最終決戦
    // #6 階層10はコモン・ハイレベルを削除し、ボスステージのみの特殊構成にする
    if(floor>=10){
      return [{key:'boss',name:'ボス',tag:'BOSS',targetScore:c*bossMulti,skippable:false,bossEffectCount}];
    }
    return [{key:'common',name:'コモン',tag:'COMMON',targetScore:c,skippable:true,bossEffectCount:0},{key:'high',name:'ハイレベル',tag:'HIGH LEVEL',targetScore:c*2,skippable:true,bossEffectCount:0},{key:'boss',name:'ボス',tag:'BOSS',targetScore:c*bossMulti,skippable:false,bossEffectCount}];
  },

  STAGE_TYPES: [
    { key:'common', name:'コモン',    tag:'COMMON',     targetScore:250, skippable:true },
    { key:'high',   name:'ハイレベル',tag:'HIGH LEVEL', targetScore:450, skippable:true },
    { key:'boss',   name:'ボス',      tag:'BOSS',       targetScore:700, skippable:false },
  ],
};
