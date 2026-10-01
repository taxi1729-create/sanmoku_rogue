/* majinEvent.js — 魔神イベント
 * マップの「ハイレベル」ステージが一定条件で魔神イベントに置き換わる。
 * 公開API（グローバル const MajinEvent）:
 *   MajinEvent.ensureDecided(floor)            階層侵入時の発生判定（未判定なら判定して保存）
 *   MajinEvent.rollDecision(floor, st, rng)    発生判定の純粋ロジック（st=GameState.majin 形式を直接更新）
 *   MajinEvent.pickMajinId(used, rng)          魔神の抽選（幸運4%、登場済み除外）
 *   MajinEvent.pickEvents(majinId, rng)        その魔神のイベント抽選（4→3、幸運は5→3）
 *   MajinEvent.isMajinFloor(floor) / getInfo(floor)
 *   MajinEvent.buildStageCard(stage, locked, isCleared)  マップ用ステージカード要素
 *   MajinEvent.open(floor) -> Promise           魔神イベント画面を開く（終了時に resolve）
 *   MajinEvent.isOpen()
 *   MajinEvent.checkEvent(eventId) -> 理由文字列|null   実行不可理由
 *   MajinEvent.debugForce(floor, majinId, eventIds, params)  テスト用：強制発生
 *   MajinEvent.MAJINS / MajinEvent.EVENTS
 * 保存先: GameState.majin.decided[floor]=bool, GameState.majin.info[floor]={id, events, params}
 */
const MajinEvent = (function(){
  'use strict';

  // ===================== 魔神定義 =====================
  const MAJINS = {
    card: {
      id:'card', name:'カードの魔神', epithet:'千札の魔公ザルヴァーン',
      c1:'#5b21b6', c2:'#c4b5fd', eye:'#f0abfc', dark:'#160b2e',
      events:['card_1','card_2','card_3','card_4'],
      intro:[
        '……ほう。久方ぶりに、生きた札の匂いがする。',
        '我は千の札を喰らいし者、カードの魔神。お前の束、なかなか旨そうだ。',
        '取引をしよう。代価は札か、金貨か……金貨ならなお良いがな。',
      ],
      pay:['金貨の音は良い……札を切る音の次にな。','チャリン、と。……ククッ、確かに受け取った。'],
      exec:{
        card_1:'数を示そう。この数に届く札が一枚でもあれば、お前の勝ちだ。',
        card_2:'一枚、いただく。代わりに同じ印の札へ、力を刻んでやろう。',
        card_3:'一枚、いただく。代わりに敵を惑わす呪いを刻んでやろう。',
        card_4:'写し身の儀だ。札よ、己が影を産み落とせ。',
      },
      special:{ card_1_ok:'見事。束ごと祝福してやろう。', card_1_ng:'クク……届かぬか。今日の札は、お前を見放したようだ。' },
      refuse:'……足りぬな。空の手で我が前に立つか。',
      leave:'去るか。臆病な札は長生きする……せいぜい大事に切るがいい。',
      outro:'契約は成った。札は裏切らぬ――裏切るのは、いつも人だ。',
    },
    score: {
      id:'score', name:'点数の魔神', epithet:'数刻の魔卿グラディオル',
      c1:'#991b1b', c2:'#fca5a5', eye:'#fde047', dark:'#1f0606',
      events:['score_1','score_2','score_3','score_4'],
      intro:[
        '数えよ。一、二、三……貴様の命の価値もまた、数に過ぎぬ。',
        '我は点数の魔神。倍率を歪め、数を捻じ曲げる者。',
        '対価を差し出せ。金貨ならば、端数まで余さず数えてやろう。',
      ],
      pay:['十枚。……正確だ。我は正確な者を好む。','金貨の重さ、確かに計った。'],
      exec:{
        score_1:'三つ並びを削ぎ、四つ五つを膨らませる。長き列こそ真の力よ。',
        score_2:'短き列に三倍の力を。長き列は……零に還れ。',
        score_3:'二枚を砕き、その数を倍率へと溶かし込む。',
        score_4:'全財産か。ならば、その数を丸ごと刻んでやろう。',
      },
      special:{},
      refuse:'計算が合わぬ。条件を満たさぬ取引は成立せぬ。',
      leave:'去れ。貴様の選ばなかった数も、我は覚えておく。',
      outro:'数は刻まれた。二度と元には戻らぬ。',
    },
    gold: {
      id:'gold', name:'金の魔神', epithet:'黄金喰らいのマモナス',
      c1:'#b45309', c2:'#fde68a', eye:'#fffbeb', dark:'#1f1403',
      events:['gold_1','gold_2','gold_3','gold_4'],
      intro:[
        'グハハハ！ 金の匂いだ、金の匂いがするぞォ！',
        '我こそは金の魔神。この世の全ての金貨は、いずれ我が腹に還る。',
        'さあ出せ、払え、差し出せ！ 払った分だけ、夢を見せてやろう！',
      ],
      pay:['ングッ……ングッ……うまい！ 金貨はやはり生に限る！','ジャラジャラと良い音だ……もっと鳴らせ！'],
      exec:{
        gold_1:'札の性（さが）を練り直してやろう。黄金の炉でな！',
        gold_2:'倍率を一・五倍に膨らませてやる。金は、殖やすものだ！',
        gold_3:'四十ずつ、束ごと底上げだ！ 豪勢であろう？',
        gold_4:'全部か！ 全部だな！ グハハ、その十倍の夢を見せてやる！',
      },
      special:{},
      refuse:'ケチくさい！ 払えぬ者に見せる夢などないわ！',
      leave:'何も買わずに去るだと？ ……ちっ、施しをくれてやる。次は財布を膨らませて来い！',
      outro:'毎度あり！ グハハハハ！',
    },
    ability: {
      id:'ability', name:'能力の魔神', epithet:'刻印の魔侯イェルザード',
      c1:'#0f766e', c2:'#5eead4', eye:'#e0f2fe', dark:'#031c19',
      events:['ability_1','ability_2','ability_3','ability_4'],
      intro:[
        '……契約者よ。汝の力の在処を見せよ。',
        '我は能力の魔神。捧げられし力を、異なる形に鋳直す者。',
        '奉納を。されば刻印を授けよう。……無論、金貨も歓迎する。',
      ],
      pay:['供物の金貨、確かに刻印台へ。','十の金貨、契約の封蝋として受け取った。'],
      exec:{
        ability_1:'汝の遺物、全てを炉へ。その数だけ、器を広げてやろう。',
        ability_2:'最も重き一枚を捧げよ。その重み、我が印として汝に返そう。',
        ability_3:'記号の力を一つ、還せ。代わりにこの階層へ祝福を。',
        ability_4:'倍率を半ばに削ぐ。その欠けた分、新たな力で埋めるがよい。',
      },
      special:{},
      refuse:'捧げる物なき者と、契約は結べぬ。',
      leave:'去るならば去れ。刻まれぬ者に、印は宿らぬ。',
      outro:'刻印は焼き付いた。汝の魂から消えることはない。',
    },
    luck: {
      id:'luck', name:'幸運の魔神', epithet:'巡り星のリュシエラ',
      c1:'#be185d', c2:'#fbcfe8', eye:'#ffffff', dark:'#1f0514',
      events:['luck_1','luck_2','luck_3','luck_4','luck_5'],
      intro:[
        'あら、あらあら？ こんな深い所まで来るなんて、運がいいのね。',
        'わたしは幸運の魔神。めったに姿は見せないのよ？',
        '今日は機嫌がいいの。……でも、金貨の輝きはもっと好きよ？',
      ],
      pay:['ふふ、ありがと。キラキラしてて素敵。'],
      exec:{
        luck_1:'好きな札を選んで。ちょっぴり強くして、もう一枚あげる。',
        luck_2:'あなたのお財布の中身、そのまま倍率にしてあげる。減らないわよ？',
        luck_3:'はい、お小遣い。それと……夢の詰まった贈り物！',
        luck_4:'星を四つ並べたわ。好きな輝きを選んで。',
        luck_5:'魔力の欠片をひとつ。……使い方には気をつけてね？',
      },
      special:{},
      refuse:'うーん、それは今のあなたには無理みたい。',
      leave:'もう行っちゃうの？ いいわ、お駄賃くらいはあげる。また会えるといいわね。',
      outro:'巡り星のご加護を。……次に会えるかは、運次第よ。',
    },
  };
  const MAJIN_IDS = ['card','score','gold','ability','luck'];
  const LUCK_RATE = 0.04;
  const OCCUR_RATE = 0.25;

  // ===================== 共通ヘルパー =====================
  const G = () => GameState;
  const rand = (rng, n) => Math.floor(rng()*n);
  const shuffleR = (arr, rng) => { const a=arr.slice(); for(let i=a.length-1;i>0;i--){ const j=rand(rng,i+1); [a[i],a[j]]=[a[j],a[i]]; } return a; };
  const pickLine = arr => Array.isArray(arr) ? arr[Math.floor(Math.random()*arr.length)] : arr;
  const reduced = () => { try{ return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }catch(e){ return false; } };
  const deck = () => G().currentDeck;
  const newId = p => p+'_'+Date.now()+'_'+Math.floor(Math.random()*100000);
  const symCount = () => { const m={}; deck().forEach(c=>{ m[c.symbol]=(m[c.symbol]||0)+1; }); return m; };
  const symLabel = s => `<span class="sym-${s}">${GameData.SYMBOL_LABEL[s]}</span>`;
  const ownedPassives = () => [...GameData.PASSIVE_SYMBOLS,'Seven'].filter(s=>(G().symbolPassiveTier[s]||0)>0);
  const passiveCandidates = () => GameData.PASSIVE_SYMBOLS.filter(s=>(G().symbolPassiveTier[s]||0)<3);
  const traitCls = c => c.trait ? ' trait-'+c.trait.replace(/[()]/g,'') : '';
  function cardHtml(c, cls){
    const gm = GameMainScene;
    return `<div class="card${traitCls(c)}${cls?' '+cls:''}">${gm.cardTagsHtml(c)}${gm.cardSymbolHtml(c)}${gm.cardScoreHtml(c, G().gold)}</div>`;
  }
  function cardDescHtml(c){
    const l=[];
    if(c.enhance) l.push(`<span class="desc-enhance">【${c.enhance}】</span>`);
    if(c.jamming) l.push(`<span class="desc-jamming">【${c.jamming}】</span>`);
    if(c.trait) l.push(`<span class="desc-trait">【${c.trait}】</span>`);
    return l.join('');
  }
  const clone = c => JSON.parse(JSON.stringify(c));
  function removeFromDeck(card){ const i=deck().indexOf(card); if(i>=0) deck().splice(i,1); }
  function beforeAfterHtml(before, after){
    return `<div class="mj-ba"><div class="mj-ba-col"><small>変化前</small>${cardHtml(before)}</div><div class="mj-ba-arrow"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 12h13M12 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div class="mj-ba-col"><small>変化後</small>${cardHtml(after,'mj-reveal')}</div></div><div class="mj-ba-desc">${cardDescHtml(after)}</div>`;
  }
  function lostHtml(cards, label){
    return `<div class="mj-lost-wrap"><div class="mj-sub-label">${label||'失ったカード'}</div><div class="mj-card-row">${cards.map(c=>`<div class="mj-lost">${cardHtml(c)}<span class="mj-lost-mark">喪失</span></div>`).join('')}</div></div>`;
  }
  function manaHtml(st){
    const d=GameData.MANA_STAGES[st];
    let extra='';
    if(st==='C') extra=`<div class="mj-note">レリック所持数上限 +${G().mana.C}（合計）</div>`;
    if(st==='D') extra=`<div class="mj-note">対象階層：第${(G().mana.D||[]).join('・')}階層</div>`;
    return `<div class="mj-grant mj-grant-mana"><div class="mj-grant-icon">魔</div><div><b>${d.name}</b> を宿した<div class="mj-grant-desc">${d.desc}</div>${extra}</div></div>`;
  }
  function passiveHtml(sym, tier, verb){
    if(tier<=0) return `<div class="mj-grant mj-grant-lost"><div class="mj-grant-icon ${'sym-'+sym}">${GameData.SYMBOL_LABEL[sym]}</div><div><b>${GameData.SYMBOL_PASSIVE_NAMES[sym]}</b> ${verb||'を失った（Lv0）'}</div></div>`;
    const p=GameData.SYMBOL_PASSIVES[sym][tier];
    return `<div class="mj-grant"><div class="mj-grant-icon ${'sym-'+sym}">${GameData.SYMBOL_LABEL[sym]}</div><div><b>${GameData.SYMBOL_PASSIVE_NAMES[sym]} Lv${tier}「${p.name}」</b> ${verb||'を習得'}<div class="mj-grant-desc">${p.desc}</div></div></div>`;
  }
  function relicHtml(r){
    const ren=r.relicEnhance?GameData.RELIC_ENHANCE_POOL.find(x=>x.id===r.relicEnhance):null;
    return `<div class="relic-card mj-relic ${GameMainScene.relicGradeClass(r)}"><div class="relic-name"><span class="relic-ico">${GameIcons.relic(r)}</span>${r.name}</div>${ren?`<div class="relic-enhance-tag">${ren.name}</div>`:''}</div>`;
  }
  const costLabel = ev => ev.cost==='all' ? `全財産（${G().gold}G）` : (ev.cost>0 ? `${ev.cost}G` : '無償');
  const costOf = ev => ev.cost==='all' ? G().gold : (ev.cost||0);

  // ===================== イベント定義 =====================
  // check: 実行不可なら理由文字列を返す。run(api): 効果を適用して結果HTMLを返す（非同期可）
  const needG = n => G().gold<n ? `所持Gが足りない（必要${n}G／所持${G().gold}G）` : null;
  const needDeck = n => deck().length<n ? `デッキの枚数が足りない（${n}枚以上必要）` : null;
  const manaHas = st => G().hasMana(st) ? `${GameData.MANA_STAGES[st].name}は既に宿している` : null;

  const EVENTS = {
    // ---------- カードの魔神 ----------
    card_1: { majin:'card', title:'札占いの試し', cost:0, rx:'eyes',
      desc: p => `魔神が数値「${p.card_1}」を示す。デッキからランダムに8枚を引き、基礎点${p.card_1}以上のカードが1枚でもあれば、その8枚すべての基礎点+10。無ければ何も起きない。`,
      check: () => needDeck(1),
      async run(api){
        const N=api.params.card_1;
        const cards=GlobalFunctions.shuffle(deck().slice()).slice(0,8);
        const before=cards.map(clone);
        const hit=cards.some(c=>c.baseScore>=N);
        if(hit) cards.forEach(c=>{ c.baseScore+=10; });
        const n=cards.length, step=reduced()?0:0.2;
        const html=`<div class="mj-judge"><div class="mj-judge-num"><small>魔神の提示</small><b>${N}</b><small>以上の札はあるか</small></div>`
          +`<div class="mj-judge-grid">${before.map((c,i)=>`<div class="mj-judge-slot${c.baseScore>=N?' hit':''}" style="--d:${(i*step).toFixed(2)}s;--v:${(n*step+0.35).toFixed(2)}s">${cardHtml(c)}${hit?'<span class="mj-plus">+10</span>':''}</div>`).join('')}</div>`
          +`<div class="mj-verdict ${hit?'ok':'ng'}" style="--v:${(n*step+0.35).toFixed(2)}s">${hit?`成就：${n}枚すべての基礎点+10`:'不成就：何も起きなかった'}</div></div>`;
        api.result.line = hit ? api.majin.special.card_1_ok : api.majin.special.card_1_ng;
        api.result.hit = hit;
        return html;
      } },
    card_2: { majin:'card', title:'生贄と強化の刻印', cost:0, rx:'laugh',
      desc: () => 'デッキからランダムに1枚を失う。失ったカードと同じ記号のカード（最大8枚）から1枚を選び、20種のカード強化から好きなものを付与する。',
      check: () => needDeck(2) || (Object.values(symCount()).some(n=>n>=2) ? null : '同じ記号のカードが2枚以上あるデッキでなければならない'),
      run: api => sacrificeAndGrant(api, 'enhance') },
    card_3: { majin:'card', title:'生贄と妨害の刻印', cost:0, rx:'laugh',
      desc: () => 'デッキからランダムに1枚を失う。失ったカードと同じ記号のカード（最大8枚）から1枚を選び、10種のジャミング効果から好きなものを付与する。',
      check: () => needDeck(2) || (Object.values(symCount()).some(n=>n>=2) ? null : '同じ記号のカードが2枚以上あるデッキでなければならない'),
      run: api => sacrificeAndGrant(api, 'jamming') },
    card_4: { majin:'card', title:'写し身の儀', cost:10, rx:'coins',
      desc: () => 'デッキから好きなカードを1枚選び、複製する。',
      check: () => needG(10) || needDeck(1),
      async run(api){
        const [src]=await api.pickCards(deck().slice(), {min:1,max:1,title:'複製するカードを1枚選べ'});
        const dup={...clone(src), id:newId('majin_dup')};
        deck().push(dup); GlobalFunctions.recordCard(dup);
        return `<div class="mj-sub-label">カードが複製された</div><div class="mj-card-row mj-dup">${cardHtml(src,'mj-dup-a')}${cardHtml(dup,'mj-dup-b')}</div><div class="mj-ba-desc">${cardDescHtml(dup)}</div>`;
      } },

    // ---------- 点数の魔神 ----------
    score_1: { majin:'score', title:'魔力ステージA', cost:10, rx:'seal',
      desc: () => `魔力ステージAを付与：${GameData.MANA_STAGES.A.desc}`,
      check: () => manaHas('A') || needG(10),
      run(){ G().grantMana('A'); return manaHtml('A'); } },
    score_2: { majin:'score', title:'魔力ステージB', cost:10, rx:'seal',
      desc: () => `魔力ステージBを付与：${GameData.MANA_STAGES.B.desc}`,
      check: () => manaHas('B') || needG(10),
      run(){ G().grantMana('B'); return manaHtml('B'); } },
    score_3: { majin:'score', title:'二枚の供物', cost:0, rx:'laugh',
      desc: () => 'デッキからランダムに2枚を失う。失ったカードの記号のビンゴ倍率（2種ならそれぞれ）に、失った2枚の合計基礎点の1/2（切り上げ）を加算する。',
      check: () => needDeck(3),
      run(){
        const lost=GlobalFunctions.shuffle(deck().slice()).slice(0,2);
        lost.forEach(removeFromDeck);
        const add=Math.ceil(lost.reduce((s,c)=>s+(c.baseScore||0),0)/2);
        const syms=[...new Set(lost.map(c=>c.symbol))];
        const before=GameData.snapshotMult();
        syms.forEach(s=>{ GameData.BINGO_MULTIPLIER_BASE[s]+=add; });
        return lostHtml(lost)+`<div class="mj-note">合計基礎点の1/2（切り上げ）＝ <b>+${add}</b> を ${syms.map(symLabel).join('・')} の倍率へ</div><div class="mj-mult">${GameData.multChangeHtml(before)}</div>`;
      } },
    score_4: { majin:'score', title:'全財産の換算', cost:'all', rx:'coins',
      desc: () => `全財産（${G().gold}G）を失い、その金額と同じ数値を全記号のビンゴ倍率に加算する。`,
      check: () => G().gold<=0 ? '所持Gが0では換算できない' : null,
      run(api){
        const g=api.paid;
        const before=GameData.snapshotMult();
        GameData.SYMBOLS.forEach(s=>{ GameData.BINGO_MULTIPLIER_BASE[s]+=g; });
        return `<div class="mj-note">${g}G を失い、全記号のビンゴ倍率 <b>+${g}</b></div><div class="mj-mult">${GameData.multChangeHtml(before)}</div>`;
      } },

    // ---------- 金の魔神 ----------
    gold_1: { majin:'gold', title:'黄金の変質', cost:15, rx:'coins',
      desc: () => 'デッキからランダムに8枚を提示。最大3枚まで選び、それぞれに現在と異なる性質変化をランダムに付与する。',
      check: () => needG(15) || needDeck(1),
      async run(api){
        const shown=GlobalFunctions.shuffle(deck().slice()).slice(0,8);
        const picked=await api.pickCards(shown,{min:1,max:3,title:'性質を練り直すカードを最大3枚選べ'});
        return picked.map(c=>{
          const b=clone(c);
          c.trait=GameData.pickDifferent(GameData.TRAIT_NAME_POOL, c.trait);
          GameData.applyGrantSideEffects(c, G().gold, 'trait');
          return beforeAfterHtml(b,c);
        }).join('');
      } },
    gold_2: { majin:'gold', title:'黄金の増幅', cost:30, rx:'coins',
      desc: () => '全てのビンゴ倍率を1.5倍にする（切り上げ）。',
      check: () => needG(30),
      run(){
        const before=GameData.snapshotMult();
        GameData.SYMBOLS.forEach(s=>{ GameData.BINGO_MULTIPLIER_BASE[s]=Math.ceil(GameData.BINGO_MULTIPLIER_BASE[s]*1.5); });
        return `<div class="mj-mult">${GameData.multChangeHtml(before)}</div>`;
      } },
    gold_3: { majin:'gold', title:'黄金の底上げ', cost:60, rx:'coins',
      desc: () => 'デッキの全カードの基礎点+40。',
      check: () => needG(60) || needDeck(1),
      run(){
        const sample=deck().slice(0,4).map(clone);
        deck().forEach(c=>{ c.baseScore+=40; });
        const after=deck().slice(0,4);
        return `<div class="mj-note">デッキ全${deck().length}枚の基礎点 <b>+40</b></div>${sample.map((b,i)=>`<div class="mj-ba mj-ba-mini"><div class="mj-ba-col">${cardHtml(b)}</div><div class="mj-ba-arrow">→</div><div class="mj-ba-col">${cardHtml(after[i],'mj-reveal')}</div></div>`).join('')}${deck().length>4?'<div class="mj-note">…ほか全カード</div>':''}`;
      } },
    gold_4: { majin:'gold', title:'全財産の夢', cost:'all', rx:'coins',
      desc: () => `全財産（${G().gold}G）を失い、その金額×10の基礎点のドリームカード2枚から1枚を選ぶ。`,
      check: () => G().gold<=0 ? '所持Gが0では夢は買えない' : null,
      async run(api){
        const g=api.paid*10; // #9 全財産×10の基礎点
        const cands=[ShopScene.genDreamCard(g), ShopScene.genDreamCard(g)];
        await api.packFx(cands);
        const [c]=await api.pickCards(cands,{min:1,max:1,title:`基礎点${g}のドリームカードを1枚選べ`,desc:true});
        deck().push(c); GlobalFunctions.recordCard(c);
        return `<div class="mj-sub-label">ドリームカードを獲得</div><div class="mj-card-row">${cardHtml(c,'mj-reveal')}</div><div class="mj-ba-desc">${cardDescHtml(c)}</div>`;
      } },

    // ---------- 能力の魔神 ----------
    ability_1: { majin:'ability', title:'遺物の奉納', cost:0, rx:'seal',
      desc: () => `所持レリックを全て（${G().relics.length}個）捧げ、魔力ステージC（捧げた数だけレリック所持数上限+）を得る。`,
      check: () => G().relics.length===0 ? '捧げるレリックを所持していない' : null,
      run(){
        const rs=G().relics.slice();
        rs.forEach(r=>{ try{ GameMainScene.removeRelicEffect(r); }catch(e){ console.error(e); } });
        G().relics.splice(0, G().relics.length);
        G().grantMana('C', rs.length);
        return `<div class="mj-sub-label">捧げたレリック（${rs.length}個）</div><div class="mj-card-row mj-relic-row">${rs.map(r=>`<div class="mj-lost">${relicHtml(r)}</div>`).join('')}</div>${manaHtml('C')}`;
      } },
    ability_2: { majin:'ability', title:'至高の一枚の奉納', cost:10, rx:'seal',
      desc: () => 'デッキで一番基礎点が高いカードを捧げ、レリック「魔神のお墨付き」（ネガティブ：所持数に数えない）を得る。効果量はそのカードの基礎点。',
      check: () => needG(10) || needDeck(2),
      run(){
        const top=deck().reduce((a,c)=>(!a||c.baseScore>a.baseScore)?c:a, null);
        removeFromDeck(top);
        const relic={...GameData.MAJIN_SEAL_RELIC, sealValue:top.baseScore, relicEnhance:'ren_negative'};
        G().relics.push(relic);
        GlobalFunctions.recordRelic(relic.id);
        return lostHtml([top],'捧げたカード')+`<div class="mj-sub-label">レリックを獲得</div><div class="mj-card-row">${relicHtml(relic)}</div><div class="mj-note">${relic.desc}<br>n = <b>${relic.sealValue}</b></div>`;
      } },
    ability_3: { majin:'ability', title:'記号の奉納', cost:0, rx:'seal',
      desc: () => `所持している記号パッシブを1つ選んで捧げ（Lv0になる）、魔力ステージD（第${G().currentFloor}階層のボスクリア報酬のパッシブが3つになる）を得る。`,
      check: () => ownedPassives().length===0 ? '捧げる記号パッシブを所持していない' : ((G().mana.D||[]).includes(G().currentFloor) ? 'この階層には既に魔力ステージDが宿っている' : null),
      async run(api){
        const key=await api.pickList(ownedPassives().map(s=>{
          const t=G().symbolPassiveTier[s];
          return { key:s, icon:GameData.SYMBOL_LABEL[s], iconCls:'sym-'+s, label:`${GameData.SYMBOL_PASSIVE_NAMES[s]} Lv${t}`, desc:GameData.SYMBOL_PASSIVES[s][t].name };
        }), {title:'捧げる記号パッシブを1つ選べ'});
        const oldT=G().symbolPassiveTier[key];
        G().symbolPassiveTier[key]=0;
        G().grantMana('D', G().currentFloor);
        return `<div class="mj-sub-label">捧げたパッシブ</div>${passiveHtml(key,0,`（Lv${oldT} → Lv0）を捧げた`)}${manaHtml('D')}`;
      } },
    ability_4: { majin:'ability', title:'半減の契約', cost:0, rx:'seal',
      desc: () => '全てのビンゴ倍率を半分にする（切り上げ）。代わりに記号パッシブ3つから1つを選んで習得する（次のLv）。',
      check: () => passiveCandidates().length===0 ? '習得できる記号パッシブが残っていない' : null,
      async run(api){
        const before=GameData.snapshotMult();
        GameData.SYMBOLS.forEach(s=>{ GameData.BINGO_MULTIPLIER_BASE[s]=Math.ceil(GameData.BINGO_MULTIPLIER_BASE[s]/2); });
        const multH=`<div class="mj-mult">${GameData.multChangeHtml(before)}</div>`;
        const got=await passivePick(api, 3, multH);
        return multH+got;
      } },

    // ---------- 幸運の魔神 ----------
    luck_1: { majin:'luck', title:'幸運の写し身', cost:0, rx:'sparkle',
      desc: () => 'デッキから好きなカードを1枚選び、基礎点+10した後に複製する。',
      check: () => needDeck(1),
      async run(api){
        const [src]=await api.pickCards(deck().slice(), {min:1,max:1,title:'祝福するカードを1枚選べ'});
        const b=clone(src);
        src.baseScore+=10;
        const dup={...clone(src), id:newId('majin_dup')};
        deck().push(dup); GlobalFunctions.recordCard(dup);
        return beforeAfterHtml(b,src)+`<div class="mj-sub-label">さらに複製</div><div class="mj-card-row mj-dup">${cardHtml(src,'mj-dup-a')}${cardHtml(dup,'mj-dup-b')}</div>`;
      } },
    luck_2: { majin:'luck', title:'富の反転', cost:0, rx:'sparkle',
      desc: () => `現在の所持金（${G().gold}G）と同じ数値を全記号のビンゴ倍率に加算する（Gは減らない）。`,
      check: () => G().gold<=0 ? '所持Gが0では何も起きない' : null,
      run(){
        const g=G().gold, before=GameData.snapshotMult();
        GameData.SYMBOLS.forEach(s=>{ GameData.BINGO_MULTIPLIER_BASE[s]+=g; });
        return `<div class="mj-note">全記号のビンゴ倍率 <b>+${g}</b></div><div class="mj-mult">${GameData.multChangeHtml(before)}</div>`;
      } },
    luck_3: { majin:'luck', title:'気紛れな施し', cost:0, rx:'sparkle',
      desc: () => '50Gを獲得し、さらにドリームカードパック（2枚から1枚）を開ける。',
      check: () => null,
      async run(api){
        const g0=G().gold; G().gold+=50; api.goldTo(g0, G().gold);
        const cands=[ShopScene.genDreamCard(), ShopScene.genDreamCard()];
        await api.packFx(cands);
        const [c]=await api.pickCards(cands,{min:1,max:1,title:'ドリームカードを1枚選べ',desc:true});
        deck().push(c); GlobalFunctions.recordCard(c);
        return `<div class="mj-grant mj-grant-gold"><div class="mj-grant-icon">G</div><div><b>+50G</b> を獲得</div></div><div class="mj-sub-label">ドリームカードを獲得</div><div class="mj-card-row">${cardHtml(c,'mj-reveal')}</div><div class="mj-ba-desc">${cardDescHtml(c)}</div>`;
      } },
    luck_4: { majin:'luck', title:'星の導き', cost:0, rx:'sparkle',
      desc: () => '記号パッシブ4つから1つを選んで習得する（次のLv）。',
      check: () => passiveCandidates().length===0 ? '習得できる記号パッシブが残っていない' : null,
      run: api => passivePick(api, 4, '') },
    luck_5: { majin:'luck', title:'魔力ステージE', cost:0, rx:'seal',
      desc: () => `魔力ステージEを付与：${GameData.MANA_STAGES.E.desc}`,
      check: () => manaHas('E'),
      run(){ G().grantMana('E'); return manaHtml('E'); } },
  };

  async function sacrificeAndGrant(api, kind){
    const cnt=symCount();
    const eligible=deck().filter(c=>cnt[c.symbol]>=2);
    const lost=GlobalFunctions.randChoice(eligible);
    removeFromDeck(lost);
    await api.interlude(lostHtml([lost],'魔神に喰われたカード'), '続ける');
    const same=GlobalFunctions.shuffle(deck().filter(c=>c.symbol===lost.symbol)).slice(0,8);
    const [target]=await api.pickCards(same,{min:1,max:1,title:`${symLabel(lost.symbol)}のカードから1枚選べ`});
    const pool = kind==='enhance' ? GameData.ENHANCE_NAME_POOL : Object.keys(GameData.JAMMING_DESC);
    const descs = kind==='enhance' ? GameData.ENHANCE_DESC : GameData.JAMMING_DESC;
    const key=await api.pickList(pool.map(n=>({ key:n, label:n, desc:descs[n]||'', disabled:(target[kind]===n)?'付与済み':null, cls: kind==='enhance'?'k-enhance':'k-jamming' })),
      {title: kind==='enhance'?'刻むカード強化を選べ（20種）':'刻むジャミング効果を選べ（10種）', preview:target});
    const before=clone(target);
    target[kind]=key;
    if(kind==='enhance') GameData.applyGrantSideEffects(target, G().gold, 'enhance');
    GlobalFunctions.recordCard(target);
    return lostHtml([lost])+beforeAfterHtml(before,target);
  }

  async function passivePick(api, n, headHtml){
    const cands=GlobalFunctions.shuffle(passiveCandidates()).slice(0,n);
    const key=await api.pickList(cands.map(s=>{
      const nt=(G().symbolPassiveTier[s]||0)+1, p=GameData.SYMBOL_PASSIVES[s][nt];
      return { key:s, icon:GameData.SYMBOL_LABEL[s], iconCls:'sym-'+s, label:`${GameData.SYMBOL_PASSIVE_NAMES[s]} Lv${nt}「${p.name}」`, desc:p.desc };
    }), {title:`記号パッシブを1つ選べ（${cands.length}択）`, head:headHtml});
    const nt=(G().symbolPassiveTier[key]||0)+1;
    G().symbolPassiveTier[key]=nt;
    return passiveHtml(key, nt);
  }

  // ===================== 発生判定 =====================
  function pickMajinId(used, rng){
    rng=rng||Math.random; used=used||[];
    let pool=MAJIN_IDS.filter(id=>!used.includes(id));
    if(pool.length===0) pool=MAJIN_IDS.slice();
    if(pool.includes('luck')){
      if(rng()<LUCK_RATE) return 'luck';
      const others=pool.filter(id=>id!=='luck');
      if(others.length===0) return 'luck';
      return others[rand(rng, others.length)];
    }
    return pool[rand(rng, pool.length)];
  }
  function pickEvents(majinId, rng){
    rng=rng||Math.random;
    const all=MAJINS[majinId].events;
    const chosen=shuffleR(all, rng).slice(0,3);
    return all.filter(e=>chosen.includes(e)); // 表示順は定義順
  }
  function makeParams(events, rng){
    const p={};
    if(events.includes('card_1')) p.card_1=1+rand(rng||Math.random, 50);
    return p;
  }
  // st: {decided, done1, done2, usedMajin, cleared, info}
  function rollDecision(floor, st, rng){
    rng=rng||Math.random;
    if(!(floor>=1&&floor<=9)) return null;
    const seg = floor<=5 ? 1 : 2;
    const key = 'done'+seg;
    if(st[key]) return null;
    const forced = floor===(seg===1?5:9);
    if(!forced && !(rng()<OCCUR_RATE)) return null;
    st[key]=true;
    if(!st.usedMajin) st.usedMajin=[];
    const id=pickMajinId(st.usedMajin, rng);
    st.usedMajin.push(id);
    const events=pickEvents(id, rng);
    return { id, events, params:makeParams(events, rng) };
  }
  function state(){
    const s=G().majin;
    if(!s.decided) s.decided={};
    if(!s.cleared) s.cleared={};
    if(!s.usedMajin) s.usedMajin=[];
    if(!s.info) s.info={};
    return s;
  }
  function ensureDecided(floor){
    if(!(floor>=1&&floor<=9)) return false;
    const st=state();
    if(Object.prototype.hasOwnProperty.call(st.decided, floor)) return !!st.decided[floor];
    // 旧セーブ等で既にハイレベルが終わっている階層は判定しない
    if(G().clearedStages.includes('high')){ st.decided[floor]=false; return false; }
    const r=rollDecision(floor, st);
    st.decided[floor]=!!r;
    if(r) st.info[floor]=r;
    try{ App.saveGame(); }catch(e){}
    return !!r;
  }
  function isMajinFloor(floor){ const st=state(); return !!st.decided[floor] && !!st.info[floor]; }
  function getInfo(floor){ return state().info[floor]||null; }

  function debugForce(floor, majinId, eventIds, params){
    const st=state();
    const id=majinId||'card';
    const events=(eventIds&&eventIds.length)?eventIds.slice():pickEvents(id);
    st.decided[floor]=true;
    st.info[floor]={ id, events, params:Object.assign(makeParams(events), params||{}) };
    if(!st.usedMajin.includes(id)) st.usedMajin.push(id);
    delete st.cleared[floor];
    G().clearedStages=G().clearedStages.filter(k=>k!=='high');
    return st.info[floor];
  }

  function checkEvent(evId){
    const ev=EVENTS[evId]; if(!ev) return '不明な選択肢';
    try{ return ev.check()||null; }catch(e){ console.error(e); return '条件を判定できない'; }
  }

  // ===================== SVG 描画 =====================
  const mirror = inner => `<g transform="translate(200,0) scale(-1,1)">${inner}</g>`;
  function figureSvg(m){
    const id=m.id, c1=m.c1, c2=m.c2, eye=m.eye, dk=m.dark;
    const both = s => s+mirror(s);
    let horns='', eyes='', mouth='', extraBack='', extraFront='', arms='', head='';
    // 共通の腕
    const arm = `<path d="M54 128 C36 136 26 156 32 180 L38 186 L40 176 L44 184 L46 172 L50 178 C48 160 54 146 64 138 Z" fill="url(#mjB-${id})"/>`;
    arms = both(arm);
    head = `<path class="mj-headshape" d="M72 72 C70 42 130 42 128 72 C128 98 114 114 100 116 C86 114 72 98 72 72 Z" fill="url(#mjH-${id})" stroke="${c2}" stroke-opacity=".35" stroke-width="1"/>`;
    eyes = both(`<path d="M79 74 L96 79 L92 85 L82 81 Z" fill="${eye}"/>`);
    mouth = `<path d="M86 96 Q100 104 114 96 Q100 110 86 96 Z" fill="#0a0208"/>`;
    if(id==='card'){
      horns = both(`<path d="M80 56 C66 42 58 22 66 4 C70 22 80 36 92 48 Z" fill="${c2}" opacity=".9"/>`);
      const cardSym=[['Circle',30,70,-14],['Triangle',170,66,12],['Square',22,140,-8],['Cross',178,138,10]];
      extraFront = cardSym.map(([s,x,y,r],i)=>`<g class="mj-float" style="--fd:${i*0.4}s"><g transform="translate(${x},${y}) rotate(${r})"><rect x="-11" y="-16" width="22" height="32" rx="3" fill="#1b1033" stroke="${c2}" stroke-width="1.5"/><text x="0" y="6" text-anchor="middle" font-size="16" font-weight="900" fill="${s==='Cross'?'#f87171':s==='Circle'?'#7dd3fc':s==='Triangle'?'#4ade80':'#facc15'}">${GameData.SYMBOL_LABEL[s]}</text></g></g>`).join('');
      mouth = `<path d="M88 97 Q100 102 112 97" fill="none" stroke="#0a0208" stroke-width="3" stroke-linecap="round"/><path d="M90 98 Q100 108 110 98 Z" fill="#0a0208"/>`;
      extraBack = `<path d="M60 64 C60 30 140 30 140 64 C150 90 146 120 132 130 L68 130 C54 120 50 90 60 64 Z" fill="${dk}" opacity=".85"/>`; // フード
    } else if(id==='score'){
      horns = both(`<path d="M78 58 C56 60 44 40 54 26 C62 16 78 20 78 32 C78 40 68 42 66 36" fill="none" stroke="${c2}" stroke-width="7" stroke-linecap="round"/>`);
      eyes = both(`<path d="M80 76 L96 78 L94 83 L82 82 Z" fill="${eye}"/>`) ;
      mouth = `<path d="M84 96 L116 96 L110 104 L90 104 Z" fill="#0a0208"/>`+[88,94,100,106,112].map(x=>`<path d="M${x-2} 96 L${x} 100 L${x+2} 96 Z" fill="#fef2f2"/>`).join('');
      const nums=[['×',26,62,16],['+',176,74,18],['10',20,150,14],['∞',180,150,18],['%',40,30,12],['7',160,28,14]];
      extraFront = nums.map(([t,x,y,f],i)=>`<text class="mj-float" style="--fd:${i*0.35}s" x="${x}" y="${y}" text-anchor="middle" font-size="${f}" font-weight="900" font-family="Space Mono,monospace" fill="${c2}" opacity=".8">${t}</text>`).join('');
      extraBack = `<g class="mj-spin"><circle cx="100" cy="150" r="30" fill="none" stroke="${c2}" stroke-width="1.5" stroke-dasharray="4 5" opacity=".7"/></g><circle cx="100" cy="150" r="9" fill="${eye}" opacity=".85" class="mj-core"/>`;
    } else if(id==='gold'){
      head = `<path class="mj-headshape" d="M66 76 C64 46 136 46 134 76 C134 104 118 118 100 118 C82 118 66 104 66 76 Z" fill="url(#mjH-${id})" stroke="${c2}" stroke-opacity=".4" stroke-width="1"/>`;
      horns = `<path d="M72 54 L76 28 L88 44 L100 20 L112 44 L124 28 L128 54 Z" fill="${c2}" stroke="#92400e" stroke-width="1.5"/><circle cx="100" cy="36" r="4" fill="#ef4444"/><circle cx="80" cy="44" r="3" fill="#60a5fa"/><circle cx="120" cy="44" r="3" fill="#60a5fa"/>`;
      eyes = both(`<circle cx="86" cy="78" r="7" fill="${c2}" stroke="#92400e" stroke-width="1.5"/><circle cx="86" cy="78" r="3.5" fill="none" stroke="#92400e" stroke-width="1.2"/>`);
      mouth = `<path d="M80 96 Q100 116 120 96 Q100 104 80 96 Z" fill="#0a0208"/><path d="M86 99 L114 99" stroke="#fde68a" stroke-width="2"/>`;
      const coins=[[28,70],[172,64],[20,140],[180,146],[46,196],[154,200]];
      extraFront = coins.map(([x,y],i)=>`<g class="mj-float" style="--fd:${i*0.3}s"><ellipse cx="${x}" cy="${y}" rx="9" ry="9" fill="#fbbf24" stroke="#92400e" stroke-width="1.5"/><text x="${x}" y="${y+4}" text-anchor="middle" font-size="10" font-weight="900" fill="#92400e">G</text></g>`).join('');
      extraBack = `<ellipse cx="100" cy="160" rx="64" ry="46" fill="${c1}" opacity=".85"/>`; // 太鼓腹
    } else if(id==='ability'){
      horns = both(`<path d="M84 52 L74 24 M78 36 L64 30 M76 30 L78 14" fill="none" stroke="${c2}" stroke-width="3" stroke-linecap="round"/>`);
      eyes = both(`<path d="M80 78 L96 80 L93 84 L82 83 Z" fill="${eye}"/>`)+`<ellipse cx="100" cy="62" rx="4" ry="7" fill="${eye}"/>`;
      mouth = `<path d="M92 99 L108 99" stroke="#0a0208" stroke-width="3" stroke-linecap="round"/>`;
      arms += both(`<path d="M58 118 C40 108 28 88 32 66 L38 62 L38 72 L44 64 L44 74 L50 70 C46 88 54 104 66 114 Z" fill="url(#mjB-${id})" opacity=".92"/>`);
      extraBack = `<g class="mj-spin"><circle cx="100" cy="70" r="56" fill="none" stroke="${c2}" stroke-width="1.5" stroke-dasharray="2 6" opacity=".8"/>${[0,45,90,135,180,225,270,315].map(a=>`<rect x="98" y="10" width="4" height="10" fill="${c2}" transform="rotate(${a} 100 70)"/>`).join('')}</g>`;
    } else if(id==='luck'){
      head = `<path class="mj-headshape" d="M74 72 C72 44 128 44 126 72 C126 96 112 110 100 112 C88 110 74 96 74 72 Z" fill="url(#mjH-${id})" stroke="${c2}" stroke-opacity=".5" stroke-width="1"/>`;
      horns = both(`<path d="M76 58 C60 66 54 96 60 124 C66 100 70 82 82 68 Z" fill="${c2}" opacity=".55"/>`);
      eyes = both(`<path d="M82 78 Q88 72 94 78" fill="none" stroke="${eye}" stroke-width="3" stroke-linecap="round"/>`);
      mouth = `<path d="M92 96 Q100 102 108 96" fill="none" stroke="#0a0208" stroke-width="2.5" stroke-linecap="round"/>`;
      const star=(x,y,r)=>{ let p=''; for(let i=0;i<10;i++){ const a=Math.PI/5*i-Math.PI/2, rr=i%2?r*0.45:r; p+=(i?'L':'M')+(x+Math.cos(a)*rr).toFixed(1)+' '+(y+Math.sin(a)*rr).toFixed(1); } return p+'Z'; };
      const stars=[[100,24,9],[70,32,6],[130,32,6],[46,52,5],[154,52,5],[30,120,6],[172,118,7]];
      extraFront = stars.map(([x,y,r],i)=>`<path class="mj-twinkle" style="--fd:${i*0.25}s" d="${star(x,y,r)}" fill="#fff" />`).join('')
        + `<g transform="translate(100,150)">${[[0,-7],[7,0],[0,7],[-7,0]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="6" fill="#86efac" opacity=".9"/>`).join('')}<circle r="3" fill="#fef9c3"/></g>`;
    }
    return `<svg class="mj-figure-svg" viewBox="0 0 200 240" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <radialGradient id="mjA-${id}" cx="50%" cy="45%" r="50%"><stop offset="0" stop-color="${c2}" stop-opacity=".5"/><stop offset="1" stop-color="${c1}" stop-opacity="0"/></radialGradient>
        <linearGradient id="mjB-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset=".7" stop-color="${dk}"/><stop offset="1" stop-color="${dk}" stop-opacity="0"/></linearGradient>
        <radialGradient id="mjH-${id}" cx="50%" cy="35%" r="70%"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${dk}"/></radialGradient>
        <filter id="mjG-${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <ellipse class="mj-aura" cx="100" cy="110" rx="98" ry="112" fill="url(#mjA-${id})"/>
      ${extraBack}
      <path class="mj-body" d="M54 126 C62 104 138 104 146 126 L160 172 C150 200 126 214 114 238 C106 224 94 224 86 238 C74 214 50 200 40 172 Z" fill="url(#mjB-${id})"/>
      ${arms}
      <g class="mj-head">${horns}${head}<g class="mj-eyes"><g filter="url(#mjG-${id})">${eyes}</g></g><g class="mj-mouth">${mouth}</g></g>
      ${extraFront}
    </svg>`;
  }
  function circleSvg(){
    const marks=[]; for(let i=0;i<24;i++){ const a=i*15; marks.push(i%3===0?`<path d="M100 9 L104 17 L96 17 Z" transform="rotate(${a} 100 100)"/>`:`<rect x="99" y="10" width="2" height="6" transform="rotate(${a} 100 100)"/>`); }
    let hex=''; for(let i=0;i<6;i++){ const a=Math.PI/3*i-Math.PI/2; hex+=(i?'L':'M')+(100+Math.cos(a)*62).toFixed(1)+' '+(100+Math.sin(a)*62).toFixed(1); }
    let hex2=''; for(let i=0;i<6;i++){ const a=Math.PI/3*i; hex2+=(i?'L':'M')+(100+Math.cos(a)*62).toFixed(1)+' '+(100+Math.sin(a)*62).toFixed(1); }
    return `<svg class="mj-circle-svg" viewBox="0 0 200 200" aria-hidden="true">
      <g class="mj-c-draw" fill="none" stroke="currentColor">
        <circle cx="100" cy="100" r="94" stroke-width="2.5" pathLength="100"/>
        <circle cx="100" cy="100" r="80" stroke-width="1.2" pathLength="100"/>
        <path d="${hex}Z" stroke-width="1.6" pathLength="100"/>
        <path d="${hex2}Z" stroke-width="1.6" pathLength="100"/>
        <circle cx="100" cy="100" r="30" stroke-width="1.2" pathLength="100"/>
      </g>
      <g class="mj-c-runes" fill="currentColor">${marks.join('')}</g>
    </svg>`;
  }
  function sealSvg(){
    let p=''; for(let i=0;i<5;i++){ const a=Math.PI*2/5*i*2-Math.PI/2; p+=(i?'L':'M')+(60+Math.cos(a)*44).toFixed(1)+' '+(60+Math.sin(a)*44).toFixed(1); }
    return `<svg viewBox="0 0 120 120" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="3"><circle cx="60" cy="60" r="54"/><circle cx="60" cy="60" r="46" stroke-width="1.2"/><path d="${p}Z"/></g><text x="60" y="68" text-anchor="middle" font-size="22" font-weight="900" fill="currentColor">契</text></svg>`;
  }
  function boltSvg(){
    return `<svg viewBox="0 0 100 300" preserveAspectRatio="none" aria-hidden="true"><path d="M58 0 L40 90 L60 96 L30 190 L52 196 L22 300" fill="none" stroke="#fff" stroke-width="4" stroke-linejoin="round"/><path d="M58 0 L40 90 L60 96 L30 190 L52 196 L22 300" fill="none" stroke="currentColor" stroke-width="10" stroke-opacity=".45" stroke-linejoin="round"/></svg>`;
  }

  // ===================== マップ用ステージカード =====================
  function buildStageCard(stage, locked, isCleared){
    const floor=G().currentFloor;
    const info=getInfo(floor);
    const m=info?MAJINS[info.id]:null;
    const card=document.createElement('div');
    card.className='stage-card majin-stage-card'+(locked?' locked':'')+(isCleared?' mj-sc-cleared':'');
    if(m) card.style.setProperty('--mj-c2', isCleared?m.c2:'#c084fc');
    const who = isCleared&&m ? `${m.name}との取引を終えた` : '禍々しい気配が漂う。何者かが取引を持ちかけてくる……';
    card.innerHTML=`<div class="mj-sc-sigil">${circleSvg()}</div><div class="stage-tag">MAJIN EVENT</div><div class="stage-name">魔神イベント</div><div class="mj-sc-desc">${who}</div>`
      +(isCleared?`<div class="stage-actions"><div class="stage-done-tag">クリア済み</div></div>`:`<div class="stage-actions"><button class="mj-meet-btn" ${locked?'disabled':''}>魔神に会う</button></div>`);
    const b=card.querySelector('.mj-meet-btn');
    if(b) b.addEventListener('click',()=>{ if(locked||isCleared) return; open(floor); });
    return card;
  }

  // ===================== イベント画面 =====================
  let ui=null;
  function isOpen(){ return !!ui; }
  function T(ms){ return reduced()?0:ms; }
  function wait(ms){ return new Promise(r=>{ if(!ui) return r(); const id=setTimeout(r, T(ms)); ui.timers.push(id); }); }
  function el(tag, cls, html){ const e=document.createElement(tag); if(cls) e.className=cls; if(html!=null) e.innerHTML=html; return e; }

  function buildOverlay(floor, info){
    const m=MAJINS[info.id];
    const ov=el('div','mj-overlay mj-m-'+m.id+(reduced()?' mj-reduced':''));
    ov.setAttribute('role','dialog'); ov.setAttribute('aria-label',m.name);
    ['c1','c2','eye','dark'].forEach(k=>ov.style.setProperty('--mj-'+k, m[k]));
    ov.innerHTML=`
      <div class="mj-bg"></div>
      <div class="mj-flash"></div>
      <div class="mj-top"><span class="mj-floor">第${floor}階層・魔神の間</span><span class="mj-gold">所持G <b class="mj-gold-v">${G().gold}</b></span></div>
      <div class="mj-stage">
        <div class="mj-circle">${circleSvg()}</div>
        <div class="mj-smokes"></div>
        <div class="mj-bolt mj-bolt-l">${boltSvg()}</div><div class="mj-bolt mj-bolt-r">${boltSvg()}</div>
        <div class="mj-figure"><div class="mj-figure-in">${figureSvg(m)}</div></div>
        <div class="mj-seal">${sealSvg()}</div>
        <div class="mj-fx"></div>
      </div>
      <div class="mj-talk"><div class="mj-nameplate"><b>${m.name}</b><small>${m.epithet}</small></div><div class="mj-text"></div><div class="mj-more" hidden></div></div>
      <div class="mj-panel"></div>`;
    const q=s=>ov.querySelector(s);
    ui={ ov, floor, info, m, timers:[], tap:null, busy:false,
      panel:q('.mj-panel'), text:q('.mj-text'), more:q('.mj-more'), goldV:q('.mj-gold-v'), stage:q('.mj-stage'), fx:q('.mj-fx'), smokes:q('.mj-smokes'), figure:q('.mj-figure') };
    const onTap=()=>{ const h=ui&&ui.tap; if(h) h(); };
    q('.mj-talk').addEventListener('click', onTap);
    q('.mj-stage').addEventListener('click', onTap);
    q('.mj-bg').addEventListener('click', onTap);
    document.body.appendChild(ov);
    document.documentElement.classList.add('mj-lock');
    return ov;
  }

  function close(){
    if(!ui) return;
    ui.timers.forEach(id=>{ clearTimeout(id); clearInterval(id); });
    if(ui.ov.parentNode) ui.ov.parentNode.removeChild(ui.ov);
    document.documentElement.classList.remove('mj-lock');
    const r=ui.resolve; ui=null;
    try{ if(typeof MapSelectScene!=='undefined'&&MapSelectScene.container&&document.body.contains(MapSelectScene.container)) MapSelectScene.renderAll(); }catch(e){ console.error(e); }
    if(r) r();
  }

  // タイプライター（タップで早送り、wait=true なら全文表示後にタップ待ち）
  function say(text, opts){
    opts=opts||{};
    return new Promise(res=>{
      if(!ui) return res();
      const box=ui.text, more=ui.more; more.hidden=true;
      const chars=Array.from(text); let i=0, done=false, iv=null;
      const complete=()=>{
        if(done) return; done=true; if(iv) clearInterval(iv);
        box.textContent=text;
        if(opts.wait){ more.hidden=false; ui.tap=()=>{ ui.tap=null; more.hidden=true; res(); }; }
        else { ui.tap=null; res(); }
      };
      if(reduced()){ complete(); return; }
      box.textContent=''; ui.tap=complete;
      iv=setInterval(()=>{ i++; box.textContent=chars.slice(0,i).join(''); if(i>=chars.length) complete(); }, 32);
      ui.timers.push(iv);
    });
  }

  function animateGold(from, to, dur){
    if(!ui) return;
    const v=ui.goldV; dur=T(dur||700);
    v.classList.remove('mj-gold-down','mj-gold-up'); void v.offsetWidth;
    v.classList.add(to<from?'mj-gold-down':'mj-gold-up');
    if(!dur){ v.textContent=to; return; }
    const t0=performance.now();
    const step=now=>{ if(!ui) return; const k=Math.min(1,(now-t0)/dur); v.textContent=Math.round(from+(to-from)*k); if(k<1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  function spawnCoins(n){
    if(!ui||reduced()) return;
    const gr=ui.goldV.getBoundingClientRect(), fr=ui.figure.getBoundingClientRect(), sr=ui.fx.getBoundingClientRect();
    const tx=fr.left+fr.width/2-sr.left, ty=fr.top+fr.height*0.42-sr.top;
    for(let i=0;i<n;i++){
      const c=el('span','mj-coin');
      const sx=gr.left+gr.width/2-sr.left+(Math.random()*30-15), sy=gr.top+gr.height/2-sr.top;
      c.style.left=sx+'px'; c.style.top=sy+'px';
      c.style.setProperty('--dx',(tx-sx)+'px'); c.style.setProperty('--dy',(ty-sy)+'px');
      c.style.setProperty('--d',(i*0.06).toFixed(2)+'s'); c.style.setProperty('--arc',(Math.random()*80-40).toFixed(0)+'px');
      ui.fx.appendChild(c);
      ui.timers.push(setTimeout(()=>c.remove(), 1600+i*60));
    }
  }
  function spawnSmoke(n, spread){
    if(!ui||reduced()) return;
    for(let i=0;i<n;i++){
      const s=el('span','mj-smoke');
      s.style.setProperty('--x',(Math.random()*2-1)*(spread||120)+'px');
      s.style.setProperty('--y',(Math.random()*-60)+'px');
      s.style.setProperty('--s',(0.6+Math.random()*0.9).toFixed(2));
      s.style.setProperty('--d',(Math.random()*0.35).toFixed(2)+'s');
      ui.smokes.appendChild(s);
      ui.timers.push(setTimeout(()=>s.remove(), 2600));
    }
  }
  function spawnSparkles(n){
    if(!ui||reduced()) return;
    for(let i=0;i<n;i++){
      const s=el('span','mj-sparkle');
      const a=Math.random()*Math.PI*2, d=60+Math.random()*90;
      s.style.setProperty('--dx',(Math.cos(a)*d).toFixed(0)+'px'); s.style.setProperty('--dy',(Math.sin(a)*d).toFixed(0)+'px');
      s.style.setProperty('--d',(Math.random()*0.4).toFixed(2)+'s');
      s.style.left='50%'; s.style.top='45%';
      ui.fx.appendChild(s);
      ui.timers.push(setTimeout(()=>s.remove(), 1800));
    }
  }
  function pulse(cls, ms){
    if(!ui) return;
    const o=ui.ov; o.classList.remove(cls); void o.offsetWidth; o.classList.add(cls);
    ui.timers.push(setTimeout(()=>{ if(ui) o.classList.remove(cls); }, reduced()?50:ms));
  }
  function reaction(kind, cost){
    if(!ui) return;
    if(kind==='coins'){ spawnCoins(Math.min(14, 4+Math.ceil((cost||10)/5))); pulse('rx-gulp',1400); pulse('rx-eyes',1400); }
    else if(kind==='laugh'){ pulse('rx-laugh',1300); pulse('rx-eyes',1300); spawnSmoke(4,80); }
    else if(kind==='seal'){ pulse('rx-seal',1800); pulse('rx-eyes',1500); pulse('rx-flash',500); }
    else if(kind==='sparkle'){ spawnSparkles(16); pulse('rx-eyes',1200); pulse('rx-laugh',900); }
    else { pulse('rx-eyes',1200); }
  }

  // 登場演出（タップでスキップ）
  function intro(){
    return new Promise(res=>{
      const o=ui.ov;
      const all=['st-dark','st-circle','st-bolt','st-smoke','st-rise','st-talk'];
      let finished=false;
      const finish=()=>{ if(finished) return; finished=true; o.classList.add(...all); if(!reduced()) o.classList.add('st-skipped'); ui.tap=null; res(); };
      if(reduced()){ finish(); return; }
      ui.tap=()=>{ o.classList.add('mj-noanim'); finish(); ui.timers.push(setTimeout(()=>ui&&ui.ov.classList.remove('mj-noanim'),60)); };
      const at=(ms,fn)=>ui.timers.push(setTimeout(()=>{ if(!finished&&ui) fn(); }, ms));
      requestAnimationFrame(()=>o.classList.add('st-dark'));
      at(350,()=>o.classList.add('st-circle'));
      at(1000,()=>{ o.classList.add('st-bolt'); pulse('rx-flash',260); pulse('rx-quake',520); });
      at(1150,()=>{ o.classList.add('st-smoke'); spawnSmoke(12,130); });
      at(1300,()=>{ pulse('rx-flash',200); });
      at(1400,()=>o.classList.add('st-rise'));
      at(2300,()=>{ o.classList.add('st-talk'); finish(); });
    });
  }
  function outroAnim(){
    return new Promise(res=>{
      if(!ui) return res();
      if(reduced()){ return res(); }
      ui.ov.classList.add('st-leave'); spawnSmoke(12,130);
      ui.timers.push(setTimeout(res, 1500));
    });
  }

  // --- パネルUI ---
  function clearPanel(){ ui.panel.innerHTML=''; ui.panel.scrollTop=0; }
  function panelTitle(t){ return el('div','mj-panel-title', t); }

  function renderOptions(){
    return new Promise(res=>{
      clearPanel();
      const p=ui.panel, info=ui.info;
      p.appendChild(panelTitle('契約を選べ'));
      const list=el('div','mj-opts');
      let chosen=null;
      const confirm=el('button','mj-confirm','選択肢を選んでください'); confirm.disabled=true;
      const opts=[...info.events.map(id=>({id, ev:EVENTS[id]})), {id:'leave'}];
      opts.forEach(o=>{
        let reason=null, html='';
        if(o.id==='leave'){
          const sr=G().calcSkipReward();
          html=`<div class="mj-opt-head"><span class="mj-opt-title">立ち去る</span><span class="mj-cost mj-cost-gain">+${sr.total}G</span></div><div class="mj-opt-desc">契約を結ばずに立ち去る。スキップ報酬（G+${sr.total}）を受け取る。</div>`;
        }else{
          reason=checkEvent(o.id);
          const ev=o.ev;
          html=`<div class="mj-opt-head"><span class="mj-opt-title">${ev.title}</span><span class="mj-cost${costOf(ev)>0?'':' mj-cost-free'}">${costLabel(ev)}</span></div><div class="mj-opt-desc">${ev.desc(info.params||{})}</div>${reason?`<div class="mj-opt-reason">${reason}</div>`:''}`;
        }
        const item=el('div','mj-opt'+(o.id==='leave'?' mj-opt-leave':'')+(reason?' disabled':''), html);
        item.dataset.ev=o.id;
        item.addEventListener('click',()=>{
          if(ui.busy) return;
          if(reason){ reaction('eyes'); say(`${ui.m.refuse}（${reason}）`); return; }
          chosen=o.id;
          list.querySelectorAll('.mj-opt').forEach(x=>x.classList.toggle('chosen', x===item));
          confirm.disabled=false;
          confirm.textContent = o.id==='leave' ? '立ち去る' : `契約する：${o.ev.title}`;
        });
        list.appendChild(item);
      });
      p.appendChild(list);
      confirm.addEventListener('click',()=>{ if(!chosen||ui.busy) return; ui.busy=true; res(chosen); });
      p.appendChild(confirm);
    });
  }

  function pickCards(cards, opts){
    return new Promise(res=>{
      clearPanel();
      const p=ui.panel, min=opts.min||1, max=opts.max||1;
      p.appendChild(panelTitle(opts.title||'カードを選べ'));
      if(max>1) p.appendChild(el('div','mj-hint',`${min}〜${max}枚を選択`));
      const grid=el('div','mj-pick-grid'+(cards.length>12?' mj-pick-scroll':''));
      const sel=new Set();
      const confirm=el('button','mj-confirm','決定'); confirm.disabled=true;
      const upd=()=>{ confirm.disabled=!(sel.size>=min&&sel.size<=max); confirm.textContent= max>1?`決定（${sel.size}/${max}）`:'決定'; };
      cards.forEach((c,i)=>{
        const w=el('div','mj-pick-card', cardHtml(c)+(opts.desc?`<div class="mj-pick-desc">${cardDescHtml(c)}</div>`:''));
        w.dataset.i=i;
        w.addEventListener('click',()=>{
          if(sel.has(i)) sel.delete(i);
          else{ if(max===1) sel.clear(); if(sel.size<max) sel.add(i); }
          grid.querySelectorAll('.mj-pick-card').forEach(x=>x.classList.toggle('picked', sel.has(+x.dataset.i)));
          upd();
        });
        grid.appendChild(w);
      });
      p.appendChild(grid);
      confirm.addEventListener('click',()=>{ if(confirm.disabled) return; res([...sel].sort((a,b)=>a-b).map(i=>cards[i])); });
      p.appendChild(confirm); upd();
    });
  }

  function pickList(items, opts){
    return new Promise(res=>{
      clearPanel();
      const p=ui.panel;
      if(opts.head) p.appendChild(el('div','mj-head-html',opts.head));
      p.appendChild(panelTitle(opts.title||'選べ'));
      if(opts.preview) p.appendChild(el('div','mj-card-row mj-preview', cardHtml(opts.preview)));
      const list=el('div','mj-pick-list');
      let chosen=null;
      const confirm=el('button','mj-confirm','決定'); confirm.disabled=true;
      items.forEach(it=>{
        const row=el('div','mj-pick-item'+(it.disabled?' disabled':'')+(it.cls?' '+it.cls:''),
          `${it.icon?`<span class="mj-pi-icon ${it.iconCls||''}">${it.icon}</span>`:''}<div class="mj-pi-body"><div class="mj-pi-label">${it.label}${it.disabled?`<span class="mj-pi-dis">${it.disabled}</span>`:''}</div>${it.desc?`<div class="mj-pi-desc">${it.desc}</div>`:''}</div>`);
        row.dataset.key=it.key;
        row.addEventListener('click',()=>{
          if(it.disabled) return;
          chosen=it.key;
          list.querySelectorAll('.mj-pick-item').forEach(x=>x.classList.toggle('chosen', x===row));
          confirm.disabled=false;
        });
        list.appendChild(row);
      });
      p.appendChild(list);
      confirm.addEventListener('click',()=>{ if(chosen==null) return; res(chosen); });
      p.appendChild(confirm);
    });
  }

  function interlude(html, label){
    return new Promise(res=>{
      clearPanel();
      ui.panel.appendChild(el('div','mj-result',html));
      const b=el('button','mj-confirm mj-next',label||'続ける');
      b.addEventListener('click',()=>res());
      ui.panel.appendChild(b);
    });
  }

  function showResult(html){
    return new Promise(res=>{
      clearPanel();
      ui.panel.appendChild(panelTitle('契約の結果'));
      ui.panel.appendChild(el('div','mj-result',html));
      const b=el('button','mj-confirm mj-done','マップへ戻る');
      b.addEventListener('click',()=>res());
      ui.panel.appendChild(b);
    });
  }

  function playPack(cards){
    if(typeof PackFX==='undefined') return Promise.resolve();
    ui.ov.classList.add('mj-dim');
    return PackFX.play({type:'dream_card', items:cards.map(c=>({html:cardHtml(c)}))}).then(()=>{ if(ui) ui.ov.classList.remove('mj-dim'); });
  }

  function markCleared(){
    if(!G().clearedStages.includes('high')) G().clearedStages.push('high');
    state().cleared[ui.floor]=true;
    try{ App.saveGame(); }catch(e){ console.error(e); }
  }

  async function runChoice(evId){
    const m=ui.m;
    if(evId==='leave'){
      const sr=G().calcSkipReward();
      const g0=G().gold; G().gold+=sr.total;
      markCleared();
      clearPanel();
      ui.panel.appendChild(el('div','mj-result',`<div class="mj-grant mj-grant-gold"><div class="mj-grant-icon">G</div><div>スキップ報酬 <b>+${sr.total}G</b></div></div>`));
      animateGold(g0, G().gold);
      pulse('rx-laugh',1000);
      await say(m.leave,{wait:true});
      await outroAnim();
      close();
      return;
    }
    const ev=EVENTS[evId];
    const paid=costOf(ev);
    const g0=G().gold;
    G().gold-=paid;
    markCleared();
    clearPanel();
    ui.panel.appendChild(el('div','mj-panel-title mj-contract',`契約：${ev.title}`));
    if(paid>0){
      reaction('coins', paid);
      animateGold(g0, G().gold, 800);
      await say(pickLine(m.pay));
      await wait(500);
    }
    reaction(ev.rx, paid);
    await say(m.exec[evId]);
    await wait(700);
    const api={ majin:m, params:ui.info.params||{}, paid, result:{},
      pickCards, pickList, interlude, packFx:playPack, goldTo:(a,b)=>animateGold(a,b), say };
    let html='';
    try{ html=await ev.run(api); }
    catch(e){ console.error('MajinEvent run error', e); html='<div class="mj-note">（契約の途中で異変が起きた）</div>'; }
    try{ App.saveGame(); }catch(e){}
    try{ if(MapSelectScene.container) MapSelectScene.renderAll(); }catch(e){}
    if(evId==='card_1'){ pulse(api.result.hit?'rx-eyes':'rx-laugh', 1400); }
    else reaction('eyes');
    const resP=showResult(html);
    await say(api.result.line || m.outro);
    await resP;
    await outroAnim();
    close();
  }

  async function open(floor){
    if(ui) return;
    floor=floor||G().currentFloor;
    const info=getInfo(floor);
    if(!info){ console.warn('MajinEvent: no majin on floor', floor); return; }
    const done=new Promise(r=>{ buildOverlay(floor, info); ui.resolve=r; });
    try{
      await intro();
      for(const line of ui.m.intro){ if(!ui) break; await say(line,{wait:true}); }
      if(!ui) return done;
      const choice=await renderOptions();
      await runChoice(choice);
    }catch(e){
      console.error('MajinEvent error', e);
      close();
    }
    return done;
  }

  return { MAJINS, EVENTS, MAJIN_IDS, LUCK_RATE, OCCUR_RATE,
    ensureDecided, rollDecision, pickMajinId, pickEvents, isMajinFloor, getInfo,
    buildStageCard, open, isOpen, checkEvent, debugForce, close,
    _figureSvg: figureSvg };
})();
if(typeof window!=='undefined') window.MajinEvent=MajinEvent;
