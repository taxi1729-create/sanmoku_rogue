// チュートリアル（初回訪問時のガイド）：マップ選択 'mapSelect'／ゲームメイン 'gameMain'／ショップ 'shop'
// 呼び出し側の API は従来どおり TutorialOverlay.show(key) のみ。
// 方針：
//  - 語り手はスタートイベントと同じ「聖なる声」。実際の画面要素をスポットライト（周囲を暗くし、
//    getBoundingClientRect で切り抜いて金の枠で強調）しながら吹き出しで説明するステップ形式。
//  - document.body 直下の position:fixed オーバーレイ（z-index 95）。ゲーム画面のレイアウトは一切動かさない。
//    renderAll() で DOM が作り直されても、毎フレーム対象を引き直して位置を追従する。
//  - 対象要素が見つからないステップは自動スキップ。画面外なら scrollIntoView。
//  - 「次へ」「戻る」「スキップ」を常時表示、進捗ドット、オーバーレイのタップで次へ（文字送り中は全文表示）。
//  - 既読は localStorage のバージョン付きキー（STORE_KEY）。リニューアル版を既存プレイヤーにも一度だけ見せる。
//    旧キー（GlobalFunctions.TUTORIAL_KEY）にも既読を書き込んで互換を保つ。
//  - 絵文字は使わない（GameIcons）。prefers-reduced-motion 時は文字送り・移動アニメーションなし。
//  - スタイルは css/tutorial.css（クラスはすべて tut- プレフィックス）。
const TutorialOverlay = (function(){
  'use strict';

  const STORE_KEY='sanmoku_tutorial_seen_v2';
  const Z_BLOCKERS='.sev-overlay, .mj-overlay, .stfx-boss, .stfx-pv, .pfx-overlay, #app .pack-modal-overlay';

  // ---------- 汎用ヘルパー ----------
  const reduced=()=>{ try{ return !!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches); }catch(e){ return false; } };
  const ico=(k,o)=>(typeof GameIcons!=='undefined'&&GameIcons.has&&GameIcons.has(k))?GameIcons.svg(k,o):'';
  const $=(s,r)=>(r||document).querySelector(s);
  const $$=(s,r)=>Array.from((r||document).querySelectorAll(s));
  const shown=(el)=>!!(el&&el.isConnected&&el.getClientRects().length>0);
  const pick=(...sels)=>{ for(const s of sels){ const el=$$(s).find(shown); if(el) return el; } return null; };
  const byText=(sel,text)=>$$(sel).find(b=>shown(b)&&b.textContent.indexOf(text)>=0)||null;
  const G=()=>(typeof GameState!=='undefined'?GameState:null);
  const safe=(fn,fb)=>{ try{ const v=fn(); return v==null?fb:v; }catch(e){ return fb; } };
  // 対象のスクロール容器（body が overflow で容器になる場合にも対応）
  const scroller=(el)=>{
    for(let p=el&&el.parentElement;p;p=p.parentElement){
      if(p.scrollHeight>p.clientHeight+1){ const oy=getComputedStyle(p).overflowY; if(oy==='auto'||oy==='scroll') return p; }
    }
    return document.scrollingElement||document.documentElement;
  };
  const fmt=(n)=>safe(()=>GlobalFunctions.formatScore(n),String(n));

  // ---------- 既読管理 ----------
  function readSeen(){ try{ return JSON.parse(localStorage.getItem(STORE_KEY)||'{}')||{}; }catch(e){ return {}; } }
  function isSeen(key){ return !!readSeen()[key]; }
  function markSeen(key){
    try{ const t=readSeen(); t[key]=true; localStorage.setItem(STORE_KEY,JSON.stringify(t)); }catch(e){}
    try{ if(typeof GlobalFunctions!=='undefined'&&GlobalFunctions.markTutorialSeen) GlobalFunctions.markTutorialSeen(key); }catch(e){}
  }
  function reset(key){
    try{
      if(!key){ localStorage.removeItem(STORE_KEY); return; }
      const t=readSeen(); delete t[key]; localStorage.setItem(STORE_KEY,JSON.stringify(t));
    }catch(e){}
  }

  // ---------- 補助表示（吹き出し内の小さな図解） ----------
  const symIco=(s)=>`<span class="tut-sym sym-${s}">${ico(({Circle:'sym_circle',Triangle:'sym_triangle',Square:'sym_square',Cross:'sym_cross'})[s])}</span>`;
  const EYE_SVG='<svg class="tut-ico-line" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z"/><circle cx="12" cy="12" r="2.6"/></svg>';
  const CLOCK_SVG='<svg class="tut-ico-line" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>';
  const chip=(t,cls)=>`<span class="tut-chip${cls?' '+cls:''}">${t}</span>`;
  const ASIDE={
    floors:()=>`<div class="tut-flow">${chip('コモン')}<i></i>${chip('ハイレベル')}<i></i>${chip('ボス','boss')}</div>`,
    dots:()=>`<div class="tut-dots-legend"><span><i class="tut-dot d-enh"></i>強化</span><span><i class="tut-dot d-jam"></i>ジャミング</span><span><i class="tut-dot d-trait"></i>性質変化</span></div>`,
    // 盤面は4×4：3つ並びでビンゴ、4つ並びで「4列」（倍率×1.5）。NPCの次手予告（点滅マス）も図示
    bingo:()=>`<div class="tut-bingo">
      <span class="tut-mini">${['Circle','Circle','Circle','','','Cross','','','Triangle','Triangle','Triangle','Triangle','','','Cross',''].map((s,i)=>`<b class="${(i<3||(i>=8&&i<12))?'on':''}${s==='Cross'?' npc':''}">${s?symIco(s):''}</b>`).join('')}</span>
      <span class="tut-bingo-txt">${chip('3つ並び：基礎倍率')}${chip('4つ並び：4列（×1.5）')}</span></div>`,
    npc:()=>`<div class="tut-bingo">
      <span class="tut-mini">${['Cross','','','','','Cross','','','','','?','','','','',''].map((s,i)=>`<b class="${s==='Cross'?'npc':''}${s==='?'?' next':''}">${s==='Cross'?symIco(s):''}</b>`).join('')}</span>
      <span class="tut-bingo-txt">${chip('点滅：NPCの次の手','npc')}${chip('バツ予測−：揃うと減点','boss')}</span></div>`,
    formula:()=>`<div class="tut-formula">
      <span class="tut-term">カード基礎点<em>＋</em>補正基礎点</span><span class="tut-op">×</span>
      <span class="tut-term">ビンゴ倍率<em>＋</em>補正倍率</span><span class="tut-op">×</span>
      <span class="tut-term">列補正</span><span class="tut-op">×</span>
      <span class="tut-term">最終乗算補正</span><span class="tut-op">＋</span>
      <span class="tut-term">最終加算補正</span></div>`,
    // 現在の盤面横ボタン（左：リロール／右：早送り・詳細非表示・ターン終了・クロックアップ）
    controls:()=>{
      const items=[[ico('btn_reroll'),'リロール'],[ico('btn_fast_forward'),'早送り'],[EYE_SVG,'詳細非表示'],[ico('btn_skip'),'ターン終了']];
      if(pick('.board-clockup-btn')) items.push([CLOCK_SVG,'クロックアップ']);
      return `<div class="tut-ctl-grid tut-ctl-2">${items.map(([i,l])=>`<span>${i}${l}</span>`).join('')}</div>`;
    },
    header:()=>`<div class="tut-ctl-grid">${[[ico('btn_deck'),'デッキ'],[ico('btn_drawpile'),'山札'],[ico('btn_discard'),'捨て札'],[ico('btn_map'),'マップ'],[ico('btn_settings'),'設定'],[ico('star_var'),'STAR']].map(([i,l])=>`<span>${i}${l}</span>`).join('')}</div>`,
    grades:()=>{
      const P=safe(()=>GameData.RELIC_GRADE_PRICE,{normal:3,rare:6,super:9,legend:12});
      return `<div class="tut-grades">${[['normal','ノーマル'],['rare','レア'],['super','スーパーレア'],['legend','レジェンド']].map(([g,n])=>`<span class="tut-grade g-${g}">${n}<b>${P[g]}G</b></span>`).join('')}</div><div class="tut-sub">レリック強化付きは +3G</div>`;
    },
    packs:()=>`<div class="tut-ctl-grid">${[['pack_card','？カード'],['pack_upgrade','アップグレード'],['pack_special','特別'],['pack_jamming','ジャミング'],['pack_enhance','強化'],['pack_relic','レリック']].map(([k,l])=>`<span>${ico(k)}${l}</span>`).join('')}</div>`,
    upgrade:()=>`<div class="tut-flow">${chip('効果を選ぶ')}<i></i>${chip('対象カードを選ぶ')}<i></i>${chip('完了','boss')}</div>`,
  };

  // ---------- ステップ定義 ----------
  // target(): 要素／要素配列／null（null を返したら自動スキップ）。target を持たないステップは中央表示。
  const firstStageCard=()=>$$('.map-path .stage-card').filter(c=>!c.classList.contains('final-shop-card')).find(shown)||null;
  const openStageCard=()=>$$('.map-path .stage-card').filter(c=>!c.classList.contains('final-shop-card')&&!c.classList.contains('locked')&&!c.classList.contains('majin-stage-card')).find(c=>shown(c)&&c.querySelector('.challenge-btn:not([disabled])'))||null;

  const CONTENT={
    // v1.25 画面に入るたびに表示されるため、要点だけに絞ったページ構成（マップ5／試練7／ショップ3）
    mapSelect:{
      title:'階層の地図',
      steps:[
        { target:()=>pick('.map-header'), icon:'divine_favor', title:'旅の目的',
          text:()=>`目指すは<b>第5階層ボスの踏破</b>。いまは第${safe(()=>G().currentFloor,1)}階層。上には所持G・<b>残機</b>・デッキ確認。` },
        { target:()=>firstStageCard(), icon:'fx_sparkle', title:'三つの試練', aside:'floors',
          text:()=>pick('.map-path .majin-stage-card')
            ?'<b>コモン → ハイレベル → ボス</b>の順。今回のハイレベルは代価で力を得る<b>魔神イベント</b>です。'
            :'<b>コモン → ハイレベル → ボス</b>の順。<b>目標点数</b>に届けば突破です。' },
        { target:()=>{ const c=openStageCard(); if(!c) return null; return [c.querySelector('.skip-bonus-tag'),c.querySelector('.stage-actions')].filter(Boolean); },
          icon:'btn_skip', title:'挑戦とスキップ',
          text:'「<b>挑戦する</b>」で試練へ。「<b>スキップ</b>」なら戦わずにGと報酬を得られます。' },
        { target:()=>pick('.map-path .boss-preview'), icon:'btn_boss_reroll', title:'ボス効果',
          text:'ボスには<b>ボス効果</b>が課されます。挑む前に確かめなさい。' },
        { target:()=>[pick('.map-screen .shop-relic-confirm'),pick('.scene-top-row .passive-bar','.map-screen .passive-bar')].filter(Boolean),
          icon:'relic_generic', title:'レリックとパッシブ',
          text:'<b>レリック</b>と<b>パッシブ</b>はタップで詳細。レリックは左から順に発動します。' },
      ],
    },

    // ゲームメイン（4×4盤面・左リロール／右ボタン列・NPC次手予告・倍率表・盤面効果・アイコン型レリック帯）
    // place：吹き出しを置きたい側（'above'/'below'）。収まらなければ自動配置。compact：フッター（進捗ドット）を省いて低くする
    gameMain:{
      title:'試練の進め方',
      steps:[
        { target:()=>[pick('.round-big-stat'),pick('.score-combined-stat'),pick('.turn-row')||pick('.turn-indicator')].filter(Boolean),
          icon:'fx_sparkle', title:'試練の目的', place:'below',
          text:()=>`全${safe(()=>G().effectiveMaxRounds(),4)}ラウンドで<b>目標${fmt(safe(()=>G().targetScore,0))}点</b>へ。1ラウンドは最大${safe(()=>G().effectiveTurnsPerRound(),16)}ターン。`
            +(pick('.stfx-boss-badge','.boss-tag')?'ターン表示の横の<b>BOSS</b>はタップで効果一覧。':'左上がラウンド、下が現在の点数です。') },
        { target:()=>[pick('.board-wrapper'),pick('.hand-area')].filter(Boolean), icon:'btn_deck', title:'手札を置く', aside:'dots', place:'above',
          text:'下の札をタップで選び、盤面の空きマスへ。マスに出る<b>予測</b>が得点の目安。札の点は宿った効果です。' },
        { target:()=>[pick('.board-wrapper'),pick('.mult-legend')].filter(Boolean), icon:'multi_all', title:'ビンゴと倍率', aside:'bingo', place:'above', compact:true,
          text:'同じ記号を縦横斜めに<b>3つ</b>でビンゴ、<b>4つ</b>で4列。倍率は<b>左下の表</b>に。' },
        { target:()=>pick('.board-wrapper .npc-next-cell')||pick('.board-wrapper'), icon:'sym_cross', title:'NPCのバツ', aside:'npc',
          text:'NPCと交互に置きます。<b>点滅するマス</b>がNPCの次の手。そこでバツが揃うなら<b>バツ予測</b>が出て減点です。' },
        { target:()=>[pick('.board-side-col-left'),pick('.board-side-col:not(.board-side-col-left)')].filter(Boolean),
          icon:'btn_reroll', title:'操作ボタン', aside:'controls', place:'below',
          text:()=>'左の<b>リロール</b>は札を選んで<b>決定</b>で引き直し。右は<b>早送り</b>・<b>詳細非表示</b>（予測などを隠す）・<b>ターン終了</b>。'
            +(pick('.board-clockup-btn')?'<b>クロックアップ</b>は1試練に1回。':'') },
        { target:()=>[pick('.top-info-box .passive-bar','.passive-bar'),pick('.top-info-box .controls-row','.controls-row'),pick('.top-info-box .relic-strip','.relic-strip')].filter(Boolean),
          icon:'relic_generic', title:'パッシブとレリック', aside:'header', place:'below', optionalTarget:true,
          text:'右上は記号ごとの<b>パッシブ</b>。ホシの下の<b>STAR</b>はその倍率。<b>レリック</b>のアイコンはタップで詳細。歯車は<b>設定</b>です。' },
        { target:()=>pick('.effects-panel-side'), icon:'btn_list', title:'盤面効果', place:'above',
          text:'盤面に効いている効果は<b>現在ラウンド</b>と<b>次ターン</b>に分けてここに。<b>タップで一覧</b>。迷ったら触れなさい。' },
      ],
    },

    shop:{
      title:'ショップ',
      steps:[
        { target:()=>{ const secs=$$('.shop-screen .shop-section').filter(shown); return secs.length?secs:pick('.shop-gold'); },
          icon:'pack_card', title:'品物とパック',
          text:'試練で得た<b>G</b>で買い物を。<b>パック</b>は開封して中身から選びます。' },
        { target:()=>pick('.shop-screen .shop-relic-confirm'), icon:'relic_generic', title:'所持レリック', aside:'grades',
          text:'タップで詳細・<b>売却</b>。枠に上限があるので、売って空けることも。' },
        { target:()=>{ const b=$$('.shop-actions button').filter(shown); return b.length?b:null; }, icon:'btn_map', title:'更新と出発',
          text:'<b>品揃え更新</b>で並びを変え、支度が済んだら地図へ戻りなさい。' },
      ],
    },
  };

  // ---------- 実行時状態 ----------
  let ui=null;      // 表示中の UI
  let pending=null; // 表示待ち（他の演出が終わるのを待っている）

  // v1.07 タイトルの「チュートリアルスキップ」がONの間は表示しない（最初の導入・5/10階層の啓示は対象外＝別モジュール）
  const SKIP_KEY='sanmoku_skipTutorial';
  function isSkipOn(){ try{ return localStorage.getItem(SKIP_KEY)==='1'; }catch(e){ return false; } }
  function setSkip(on){ try{ localStorage.setItem(SKIP_KEY, on?'1':'0'); }catch(e){} }
  function show(key){
    if(isSkipOn()) return;
    const content=CONTENT[key]; if(!content) return;
    // v1.24 チュートリアルスキップがOFFの間は、画面に入るたびに毎回表示する（既読でも表示）
    if(ui&&ui.key===key) return;
    if(pending&&pending.key===key) return;
    if(ui) close(false);
    if(pending) cancelPending();
    const sceneSel={mapSelect:'.map-screen',gameMain:'.game-screen',shop:'.shop-screen'}[key];
    const started=Date.now();
    pending={ key, timer:null };
    const tick=()=>{
      if(!pending||pending.key!==key) return;
      // シーンが切り替わったら中止（既読にはしない：次回の訪問で表示）
      if(sceneSel&&!$(sceneSel)&&Date.now()-started>600){ pending=null; return; }
      const blocking=$$(Z_BLOCKERS).some(shown);
      if(!blocking&&(!sceneSel||$(sceneSel))){ pending=null; open(key); return; }
      pending.timer=setTimeout(tick,250);
    };
    // 初回描画（手札の弓形配置など）が落ち着いてから開始
    pending.timer=setTimeout(tick, 180);
  }
  function cancelPending(){ if(pending&&pending.timer) clearTimeout(pending.timer); pending=null; }

  function open(key){
    const content=CONTENT[key];
    // 対象が存在するステップだけで構成（target を持たないステップは中央表示として残す）
    const steps=content.steps.filter(s=>!s.target||s.optionalTarget||resolveTarget(s).length>0);
    if(!steps.length){ markSeen(key); return; }
    const R=reduced();
    const root=document.createElement('div');
    root.className='tut-root'+(R?' tut-reduced':'');
    root.setAttribute('role','dialog'); root.setAttribute('aria-modal','true'); root.setAttribute('aria-label','チュートリアル：'+content.title);
    root.innerHTML=`
      <div class="tut-spot"><i class="tut-spot-ring"></i></div>
      <div class="tut-bubble" role="document">
        <i class="tut-tail"></i>
        <div class="tut-plate">${ico('divine_favor')}<b>聖なる声</b><small>${content.title}</small></div>
        <div class="tut-head"><span class="tut-head-ico"></span><span class="tut-head-title"></span><span class="tut-count"></span></div>
        <div class="tut-text"><div class="tut-text-size" aria-hidden="true"></div><div class="tut-text-live" aria-live="polite"></div></div>
        <div class="tut-aside"></div>
        <div class="tut-nav">
          <button type="button" class="tut-btn tut-skip">スキップ</button>
          <span class="tut-nav-sp"></span>
          <button type="button" class="tut-btn tut-prev">戻る</button>
          <button type="button" class="tut-btn tut-next">次へ</button>
        </div>
        <div class="tut-foot"><span class="tut-dots" aria-hidden="true"></span><span class="tut-taphint">画面をタップで次へ</span></div>
      </div>`;
    document.body.appendChild(root);
    const q=s=>root.querySelector(s);
    ui={ key, root, steps, idx:0, dir:1, R, raf:0, frame:0, stable:0, lastScrollY:window.scrollY||0, targets:[], lastSig:'', scrolledFor:-1, typing:null,
      spot:q('.tut-spot'), bubble:q('.tut-bubble'), tail:q('.tut-tail'), headIco:q('.tut-head-ico'), headTitle:q('.tut-head-title'),
      count:q('.tut-count'), size:q('.tut-text-size'), live:q('.tut-text-live'), aside:q('.tut-aside'), dots:q('.tut-dots'),
      prev:q('.tut-prev'), next:q('.tut-next'), skip:q('.tut-skip') };
    ui.dots.innerHTML=steps.map(()=>'<i></i>').join('');

    // 入力：オーバーレイ全体で受け止め、下のゲームには通さない
    root.addEventListener('click',(e)=>{ e.preventDefault(); e.stopPropagation(); if(ui&&ui.typing){ ui.typing.complete(); return; } go(1); });
    ui.prev.addEventListener('click',(e)=>{ e.stopPropagation(); go(-1); });
    ui.next.addEventListener('click',(e)=>{ e.stopPropagation(); if(ui&&ui.typing) ui.typing.complete(); go(1); });
    ui.skip.addEventListener('click',(e)=>{ e.stopPropagation(); close(true); });
    ui.onTouchMove=(e)=>{ e.preventDefault(); };
    ui.onWheel=(e)=>{ e.preventDefault(); };
    root.addEventListener('touchmove',ui.onTouchMove,{passive:false});
    root.addEventListener('wheel',ui.onWheel,{passive:false});
    ui.onKey=(e)=>{
      if(!ui) return;
      if(e.key==='Escape'){ e.preventDefault(); close(true); }
      else if(e.key==='ArrowRight'||e.key==='Enter'||e.key===' '){ e.preventDefault(); if(ui.typing) ui.typing.complete(); else go(1); }
      else if(e.key==='ArrowLeft'){ e.preventDefault(); go(-1); }
    };
    document.addEventListener('keydown',ui.onKey,true);
    ui.onResize=()=>{ if(ui) ui.lastSig=''; };
    window.addEventListener('resize',ui.onResize);
    if(window.visualViewport) window.visualViewport.addEventListener('resize',ui.onResize);

    renderStep();
    try{ if(typeof SFX!=='undefined') SFX.play('open'); }catch(e){} // 効果音（js/sfx.js）
    requestAnimationFrame(()=>{ if(ui) root.classList.add('tut-in'); });
    loop();
  }

  function resolveTarget(step){
    if(!step.target) return [];
    let t=safe(()=>step.target(),null);
    if(!t) return [];
    if(!Array.isArray(t)) t=[t];
    return t.filter(shown);
  }

  function go(d){
    if(!ui) return;
    let i=ui.idx+d;
    // 対象が消えたステップは進行方向へ飛ばす
    while(i>=0&&i<ui.steps.length&&ui.steps[i].target&&!ui.steps[i].optionalTarget&&resolveTarget(ui.steps[i]).length===0) i+=d;
    if(i<0) return;
    if(i>=ui.steps.length){ close(true); return; }
    try{ if(typeof SFX!=='undefined') SFX.play('page',{pitch:d<0?-3:0}); }catch(e){} // 効果音（js/sfx.js）
    ui.idx=i; ui.dir=d; renderStep();
  }

  function renderStep(){
    const s=ui.steps[ui.idx], n=ui.steps.length;
    ui.targets=resolveTarget(s);
    ui.scrolledFor=-1; ui.fitScrollFor=-1; ui.lastSig='';
    ui.headIco.innerHTML=s.icon?ico(s.icon):'';
    ui.headTitle.textContent=s.title||'';
    ui.count.textContent=`${ui.idx+1} / ${n}`;
    const html=typeof s.text==='function'?safe(()=>s.text(),''):(s.text||'');
    ui.size.innerHTML=html;
    const aside=s.aside&&ASIDE[s.aside]?safe(()=>ASIDE[s.aside](),''):'';
    ui.aside.innerHTML=aside; ui.aside.hidden=!aside;
    Array.from(ui.dots.children).forEach((d,k)=>{ d.className=k===ui.idx?'on':(k<ui.idx?'done':''); });
    ui.prev.disabled=ui.idx===0;
    ui.next.textContent=ui.idx>=n-1?'はじめる':'次へ';
    ui.root.classList.toggle('tut-no-target',ui.targets.length===0);
    ui.bubble.classList.toggle('tut-compact',!!s.compact); // 対象が大きく空きが少ないページ：進捗フッターを省いて吹き出しを低くする
    // 吹き出しの差し替え演出
    ui.bubble.classList.remove('tut-pop'); void ui.bubble.offsetWidth; ui.bubble.classList.add('tut-pop');
    typeText(html);
    layout(true);
  }

  // タイプライター（HTML の文字ノードを順に埋める。タップで全文表示）。サイズは非表示の全文コピーで先に確定させる
  function typeText(html){
    if(ui.typing){ ui.typing.stop(); ui.typing=null; }
    const live=ui.live; live.innerHTML=html;
    if(ui.R) return;
    const nodes=[]; const walk=(el)=>{ el.childNodes.forEach(c=>{ if(c.nodeType===3){ nodes.push({n:c,t:c.nodeValue}); c.nodeValue=''; } else walk(c); }); };
    walk(live);
    const total=nodes.reduce((a,x)=>a+Array.from(x.t).length,0);
    let i=0, iv=null;
    const paint=()=>{ let left=i; for(const x of nodes){ const ch=Array.from(x.t); const k=Math.min(ch.length,Math.max(0,left)); x.n.nodeValue=ch.slice(0,k).join(''); left-=ch.length; } };
    const typing={
      stop(){ if(iv) clearInterval(iv); iv=null; },
      complete(){ typing.stop(); i=total; paint(); if(ui&&ui.typing===typing) ui.typing=null; },
    };
    ui.typing=typing;
    iv=setInterval(()=>{ i+=2; paint(); if(i>=total) typing.complete(); }, 26);
  }

  // ---------- 配置 ----------
  function unionRect(els){
    let l=Infinity,t=Infinity,r=-Infinity,b=-Infinity;
    els.forEach(el=>{ const x=el.getBoundingClientRect(); if(x.width===0&&x.height===0) return; l=Math.min(l,x.left); t=Math.min(t,x.top); r=Math.max(r,x.right); b=Math.max(b,x.bottom); });
    if(!isFinite(l)) return null;
    return {left:l,top:t,right:r,bottom:b,width:r-l,height:b-t};
  }

  function loop(){
    if(!ui) return;
    ui.frame++;
    // renderAll() で DOM が作り直されても追従できるよう、定期的に対象を引き直す
    if(ui.frame%6===0){
      const s=ui.steps[ui.idx];
      if(s.target){
        const t=resolveTarget(s);
        if(t.length) ui.targets=t;
        else if(!ui.targets.some(shown)){ ui.targets=[]; }
      }
    }
    if(ui.targets[0]!==ui.scEl){ ui.scEl=ui.targets[0]; ui.sc=ui.scEl?scroller(ui.scEl):null; }
    const sy=(window.scrollY||0)+(document.body?document.body.scrollTop:0)+(ui.sc?(ui.sc.scrollTop||0):0);
    if(sy!==ui.lastScrollY){ ui.lastScrollY=sy; ui.stable=0; } else ui.stable++;
    layout(false);
    ui.raf=requestAnimationFrame(loop);
  }

  function layout(force){
    if(!ui) return;
    const vw=document.documentElement.clientWidth||window.innerWidth, vh=window.innerHeight;
    const s=ui.steps[ui.idx];
    let r=ui.targets.length?unionRect(ui.targets.filter(shown)):null;
    // 画面外なら一度だけスクロールして見せる
    if(r&&ui.scrolledFor!==ui.idx){
      ui.scrolledFor=ui.idx;
      const off=r.top<8||r.bottom>vh-8;
      if(off){
        try{
          const el=ui.targets[0];
          const tall=r.height>vh*0.7;
          el.scrollIntoView({block:tall?'start':'center',inline:'nearest',behavior:ui.R?'auto':'smooth'});
        }catch(e){}
      }
    }
    const sig=r?[r.left,r.top,r.width,r.height].map(v=>Math.round(v)).join(',')+'|'+vw+'x'+vh:'none|'+vw+'x'+vh;
    if(!force&&sig===ui.lastSig) return;
    ui.lastSig=sig;

    // スポットライト
    const sp=ui.spot.style;
    let hole=null;
    if(r){
      const pad=6;
      const L=Math.max(4,r.left-pad), T=Math.max(4,r.top-pad), Rr=Math.min(vw-4,r.right+pad), B=Math.min(vh-4,r.bottom+pad);
      if(Rr>L&&B>T) hole={left:L,top:T,right:Rr,bottom:B,width:Rr-L,height:B-T};
    }
    if(hole){
      sp.left=hole.left+'px'; sp.top=hole.top+'px'; sp.width=hole.width+'px'; sp.height=hole.height+'px';
      ui.root.classList.remove('tut-no-target');
    }else{
      sp.left=(vw/2)+'px'; sp.top=(vh/2)+'px'; sp.width='0px'; sp.height='0px';
      ui.root.classList.add('tut-no-target');
    }

    // 吹き出し
    const b=ui.bubble, m=10, gap=14;
    const wide=Math.min(vh<520?540:360,vw-2*m);
    b.style.maxWidth=wide+'px';
    let bw=b.offsetWidth, bh=b.offsetHeight;
    let x, y, side='none', tail=0;
    if(!hole){
      x=(vw-bw)/2; y=Math.max(m,(vh-bh)/2);
    }else{
      const cx=(hole.left+hole.right)/2, cy=(hole.top+hole.bottom)/2;
      const below=vh-m-(hole.bottom+gap), above=(hole.top-gap)-m, right=vw-m-(hole.right+gap), left=(hole.left-gap)-m;
      let pickK=null;
      // 0) ステップ指定の側（place）に収まるならそちらを優先
      if(s.place==='below'&&below>=bh) pickK='below';
      else if(s.place==='above'&&above>=bh) pickK='above';
      // 1) 上下（広い吹き出し）
      if(!pickK) for(const c of [{k:'below',sp:below},{k:'above',sp:above}].sort((a,c)=>c.sp-a.sp)){ if(c.sp>=bh){ pickK=c.k; break; } }
      // 2) 左右（空きの幅に合わせて吹き出しを細くし、高さが画面に収まるか確かめる）
      if(!pickK){
        for(const c of [{k:'right',sp:right},{k:'left',sp:left}].sort((a,c)=>c.sp-a.sp)){
          if(c.sp<260) continue;
          b.style.maxWidth=Math.min(400,c.sp)+'px';
          const w2=b.offsetWidth, h2=b.offsetHeight;
          if(h2<=vh-2*m&&w2<=c.sp){ pickK=c.k; bw=w2; bh=h2; break; }
        }
        if(!pickK){ b.style.maxWidth=wide+'px'; bw=b.offsetWidth; bh=b.offsetHeight; }
      }
      if(!pickK&&ui.fitScrollFor!==ui.idx&&ui.stable<6){ ui.lastSig=''; } // スクロール中は落ち着くまで待って判定し直す
      else if(!pickK&&ui.fitScrollFor!==ui.idx){
        // どこにも収まらない：ページをスクロールして、対象の上か下に吹き出し分の空きを作る（1ステップ1回）
        ui.fitScrollFor=ui.idx;
        const need=bh+gap+m;
        const sc=scroller(ui.targets[0]);
        const maxY=Math.max(0,sc.scrollHeight-sc.clientHeight), y0=sc.scrollTop||0;
        const opts=[];
        if(hole.height+need<=vh-m){
          opts.push(hole.top-need-2);            // 対象を下へずらし、上に吹き出し
          opts.push(hole.bottom-(vh-need)+2);    // 対象を上へずらし、下に吹き出し
        }
        const ok=opts.map(d=>({d,y:y0+d})).filter(o=>o.y>=-1&&o.y<=maxY+1).sort((a,c)=>Math.abs(a.d)-Math.abs(c.d))[0];
        if(ok&&Math.abs(ok.d)>1){ sc.scrollTop=Math.round(Math.max(0,Math.min(maxY,ok.y))); ui.lastSig=''; return; }
      }
      if(!pickK){
        // それでも収まらない：対象の中心から遠い側の画面端に寄せる（一部重なってもよい）
        pickK = cy<vh/2 ? 'pinBottom' : 'pinTop';
      }
      const clampX=v=>Math.max(m,Math.min(vw-m-bw,v)), clampY=v=>Math.max(m,Math.min(vh-m-bh,v));
      if(pickK==='below'){ x=clampX(cx-bw/2); y=hole.bottom+gap; side='top'; tail=cx-x; }
      else if(pickK==='above'){ x=clampX(cx-bw/2); y=hole.top-gap-bh; side='bottom'; tail=cx-x; }
      else if(pickK==='right'){ x=hole.right+gap; y=clampY(cy-bh/2); side='left'; tail=cy-y; }
      else if(pickK==='left'){ x=hole.left-gap-bw; y=clampY(cy-bh/2); side='right'; tail=cy-y; }
      else if(pickK==='pinBottom'){ x=clampX(cx-bw/2); y=vh-m-bh; side='none'; }
      else { x=clampX(cx-bw/2); y=m; side='none'; }
    }
    b.style.left=Math.round(x)+'px'; b.style.top=Math.round(Math.max(m,y))+'px';
    b.setAttribute('data-side',side);
    const t=ui.tail.style;
    if(side==='top'||side==='bottom'){ t.left=Math.max(18,Math.min(bw-18,tail))+'px'; t.top=''; }
    else if(side==='left'||side==='right'){ t.top=Math.max(18,Math.min(bh-18,tail))+'px'; t.left=''; }
  }

  function close(markAsSeen){
    cancelPending();
    if(!ui) return;
    const u=ui; ui=null;
    if(markAsSeen){ try{ if(typeof SFX!=='undefined') SFX.play('close'); }catch(e){} }
    if(markAsSeen) markSeen(u.key);
    // v1.28 ショップのチュートリアルまで見終えたら、自動でチュートリアルスキップをONにする
    if(u.key==='shop'){ setSkip(true); }
    if(u.typing) u.typing.stop();
    cancelAnimationFrame(u.raf);
    document.removeEventListener('keydown',u.onKey,true);
    window.removeEventListener('resize',u.onResize);
    if(window.visualViewport) window.visualViewport.removeEventListener('resize',u.onResize);
    const rm=()=>{ if(u.root.parentNode) u.root.parentNode.removeChild(u.root); };
    if(u.R){ rm(); return; }
    u.root.classList.remove('tut-in'); u.root.classList.add('tut-out');
    u.root.style.pointerEvents='none';
    setTimeout(rm,260);
  }

  return {
    show,
    close:()=>close(false),
    isOpen:()=>!!ui,
    isSeen, reset, markSeen, isSkipOn, setSkip,
    STORE_KEY, CONTENT,
    // テスト・デバッグ用：現在のステップと対象矩形
    _state:()=>ui?{ key:ui.key, idx:ui.idx, total:ui.steps.length, title:ui.steps[ui.idx].title, target:ui.targets.length?unionRect(ui.targets):null,
      spot:ui.spot.getBoundingClientRect(), bubble:ui.bubble.getBoundingClientRect(), typing:!!ui.typing }:null,
  };
})();
