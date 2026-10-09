// stageFx.js — ステージ演出（クラスはすべて stfx- プレフィックス / css/stagefx.css）
//  1. ステージクリア報酬の受け取り演出（showResult） ＋ パッシブ報酬の降臨演出（showPassiveChoice）
//  2. ボス効果の付与演出（bossIntro） ＋ コンパクトなボスバッジと吹き出し（bossBadge）
//  3. カード配置時の効果演出（placement）：強化20種＝黄 / ジャミング10種＝緑 / 性質変化12種＝青
// 方針：
//  - 演出要素はすべて document.body 直下の position:fixed 永続要素。GameMainScene.renderAll() で作り直されないため巻き戻らず、
//    ゲーム画面のレイアウトは一切動かさない（盤面などは getBoundingClientRect で実測して上に重ねるだけ）
//  - 絵文字は使わない。アイコンは GameIcons.svg(key) の既存キー、または本ファイル内のオリジナルSVG
//  - prefers-reduced-motion 時は動きを省いた短いフェードのみ。GameMainScene.scoreFastForward 時は短縮
const StageFX = (function(){
  'use strict';

  // ---------- 共通ヘルパー ----------
  const reduced = () => { try{ return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }catch(e){ return false; } };
  const fastFwd = () => (typeof GameMainScene!=='undefined' && !!GameMainScene.scoreFastForward);
  const sleep = ms => new Promise(r=>setTimeout(r, Math.max(0,ms)));
  const esc = v => String(v==null?'':v).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = (k,o) => (typeof GameIcons!=='undefined' && GameIcons.has && GameIcons.has(k)) ? GameIcons.svg(k,o) : '';
  const rnd = (a,b) => a+Math.random()*(b-a);
  const sfx = (n,o) => { try{ if(typeof SFX!=='undefined') SFX.play(n,o); }catch(e){} }; // 効果音（js/sfx.js）
  function el(tag, cls, html){ const e=document.createElement(tag); if(cls) e.className=cls; if(html!=null) e.innerHTML=html; return e; }
  function anim(node, frames, opts){
    // 3つ以上のキーフレームでは、イージングを全体ではなく各区間に掛ける（全体に掛けると中間キーフレームの時刻がずれるため）
    if(Array.isArray(frames) && frames.length>2 && opts && opts.easing && opts.easing!=='linear'){
      frames=frames.map((f,i)=>(i<frames.length-1 && !f.easing)?Object.assign({},f,{easing:opts.easing}):f);
      opts=Object.assign({},opts,{easing:'linear'});
    }
    try{ if(node && node.animate) return node.animate(frames, opts); }catch(e){}
    return { finished:Promise.resolve(), cancel(){}, finish(){} };
  }
  function rectOf(x){
    const n = typeof x==='string' ? document.querySelector(x) : x;
    if(!n) return null; const r=n.getBoundingClientRect();
    if(!(r.width>0||r.height>0)) return null;
    // 配置ポップ等の transform: scale 中でも本来の大きさで測る（中心は保ったまま、レイアウト上の幅・高さを使う）
    const w=n.offsetWidth||r.width, h=n.offsetHeight||r.height;
    if(Math.abs(w-r.width)<.5 && Math.abs(h-r.height)<.5) return r;
    const cx=r.left+r.width/2, cy=r.top+r.height/2;
    return { left:cx-w/2, top:cy-h/2, right:cx+w/2, bottom:cy+h/2, width:w, height:h };
  }
  const cellNode = ci => document.querySelector(`.board .cell[data-ci="${ci}"]`);
  const cellRect = ci => rectOf(cellNode(ci));
  const ctr = r => ({ x:r.left+r.width/2, y:r.top+r.height/2 });
  function unionRect(list){
    const rs=list.filter(Boolean); if(!rs.length) return null;
    const l=Math.min(...rs.map(r=>r.left)), t=Math.min(...rs.map(r=>r.top)), r=Math.max(...rs.map(r=>r.right)), b=Math.max(...rs.map(r=>r.bottom));
    return { left:l, top:t, right:r, bottom:b, width:r-l, height:b-t };
  }
  // 位置を px で指定して絶対配置
  function put(parent, cls, x, y, w, h, html){
    const e=el('div', cls, html);
    e.style.left=x+'px'; e.style.top=y+'px';
    if(w!=null) e.style.width=w+'px'; if(h!=null) e.style.height=h+'px';
    parent.appendChild(e); return e;
  }
  // 中心座標で配置（translate(-50%,-50%) は CSS の .stfx-c で付与）
  function putC(parent, cls, cx, cy, w, h, html){ return put(parent, 'stfx-c '+(cls||''), cx, cy, w, h, html); }
  // 2点を結ぶ線（div を回転）
  function line(parent, cls, a, b, thick){
    const dx=b.x-a.x, dy=b.y-a.y, len=Math.hypot(dx,dy), ang=Math.atan2(dy,dx)*180/Math.PI;
    const e=put(parent, 'stfx-line '+(cls||''), a.x, a.y-(thick||3)/2, len, thick||3);
    e.style.transform=`rotate(${ang}deg)`; e.style.transformOrigin='0 50%';
    e._ang=ang; return e;
  }
  const symSvg = s => (typeof GameData!=='undefined' && GameData.SYMBOL_LABEL && GameData.SYMBOL_LABEL[s]) || '';

  // ---------- オリジナルSVG（24x24 / 線幅2 / 丸キャップ。GameIcons と同じ作法） ----------
  const S = (body, vb) => `<svg viewBox="${vb||'0 0 24 24'}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
  const SVG = {
    star:    S('<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z" fill="currentColor" stroke-width="1.2"/>'),
    lock:    S('<rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor" fill-opacity=".25"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/><path d="M12 15v2.5"/>'),
    shield:  S('<path d="M12 3l7 3v5c0 5-3.2 8.4-7 10-3.8-1.6-7-5-7-10V6z" fill="currentColor" fill-opacity=".22"/><path d="M9 12l2 2 4-4"/>'),
    clock:   S('<circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity=".15"/><path d="M12 3v2M21 12h-2M12 21v-2M3 12h2"/>'),
    hand:    S('<path d="M12 12V6.5"/>'),
    hand2:   S('<path d="M12 12h4"/>'),
    flag:    S('<path d="M6 21V3"/><path d="M6 4h11l-3 4 3 4H6" fill="currentColor" fill-opacity=".35"/>'),
    crown:   S('<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" fill="currentColor" fill-opacity=".3"/><path d="M5 19h14"/>'),
    pin:     S('<path d="M7 3h10v18l-5-4-5 4z" fill="currentColor" fill-opacity=".3"/>'),
    loop:    S('<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v4h-4"/>'),
    rewind:  S('<path d="M4 12a8 8 0 1 0 2.3-5.6"/><path d="M4 4v4h4"/>'),
    weight:  S('<path d="M9 7a3 3 0 0 1 6 0"/><path d="M6 8h12l2.5 12h-17z" fill="currentColor" fill-opacity=".35"/>'),
    bubble:  S('<circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity=".18"/><path d="M8 8.5a5 5 0 0 1 4-2"/>'),
    arrowR:  S('<path d="M4 12h15"/><path d="M14 6l6 6-6 6"/>'),
    arrowU:  S('<path d="M12 20V5"/><path d="M6 10l6-6 6 6"/>'),
    chev:    S('<path d="M5 6l6 6-6 6"/><path d="M13 6l6 6-6 6"/>'),
    plus:    S('<path d="M12 5v14M5 12h14" stroke-width="3"/>'),
    qmark:   S('<path d="M9 9a3 3 0 1 1 4.5 2.6c-1 .6-1.5 1.3-1.5 2.4"/><circle cx="12" cy="18" r=".6" fill="currentColor"/>'),
    spiral:  S('<path d="M12 12a1.5 1.5 0 0 1 3 0 3 3 0 0 1-6 0 4.5 4.5 0 0 1 9 0 6 6 0 0 1-12 0 7.5 7.5 0 0 1 15 0"/>'),
    bolt:    S('<path d="M13 2L5 14h6l-1 8 8-12h-6z" fill="currentColor" stroke-width="1.2"/>'),
    chainLk: S('<rect x="3" y="8" width="10" height="8" rx="4"/><rect x="11" y="8" width="10" height="8" rx="4"/>'),
    card:    S('<rect x="5" y="3" width="14" height="18" rx="2.5" fill="currentColor" fill-opacity=".25"/><path d="M9 9l6 6M15 9l-6 6" stroke-width="1.4" opacity=".6"/>'),
    hourglass: S('<path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9"/>'),
    trash:   S('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
    sword:   S('<path d="M14.5 3H21v6.5L10 20.5 3.5 14z" fill="currentColor" fill-opacity=".2"/><path d="M6 17l-3 3M8 13l3 3"/>'),
    nodes:   S('<circle cx="12" cy="12" r="3" fill="currentColor"/><circle cx="4" cy="12" r="1.6"/><circle cx="20" cy="12" r="1.6"/><circle cx="12" cy="4" r="1.6"/><circle cx="12" cy="20" r="1.6"/>'),
    // 竜の影（オリジナルのシルエット）
    dragon:  `<svg viewBox="0 0 120 48" aria-hidden="true" focusable="false"><path fill="currentColor" d="M4 22c6-6 14-9 22-8l6-6 2 7c5 1 9 3 12 6 8-2 17-1 26 3 9 4 19 6 30 3l14-3c-9 7-20 11-32 11-9 0-17-3-25-5-6 4-13 6-21 6l-5 7-1-7c-7 0-15-2-21-6l-8 2z"/><path fill="currentColor" d="M30 14l8-10 2 10M46 21l12-14 1 14" opacity=".75"/></svg>`,
    sigil:   `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="50" cy="50" r="46"/><circle cx="50" cy="50" r="38" stroke-dasharray="3 5"/><path d="M50 8L86 71H14z"/><path d="M50 92L14 29h72z"/><circle cx="50" cy="50" r="14"/></svg>`,
  };

  // ---------- ルート要素（永続） ----------
  let layerEl=null;
  function layer(){
    if(layerEl && document.body.contains(layerEl)) return layerEl;
    layerEl=el('div','stfx-layer'); layerEl.setAttribute('aria-hidden','true');
    document.body.appendChild(layerEl); return layerEl;
  }

  // ゲーム画面を離れたら（ショップ等）残った演出を片付けるウォッチドッグ
  let watchTimer=null;
  function watch(){
    if(watchTimer) return;
    watchTimer=setInterval(()=>{
      if(document.querySelector('.game-screen')) return;
      clearAll();
    }, 400);
  }
  function stopWatchIfIdle(){
    if(!resultUI && !pvUI && !bossUI && watchTimer){ clearInterval(watchTimer); watchTimer=null; }
  }

  // =====================================================================
  // 3. カード配置時の効果演出
  // =====================================================================
  const KIND_LABEL = { enh:'強化', jam:'ジャミング', trait:'性質変化' };

  // 配置前の盤面の情報（サンダー・引き直しの対象を記録）
  function snapshot(scene){
    try{
      const crosses=[]; (scene.board||[]).forEach((c,i)=>{ if(c&&c.symbol==='Cross') crosses.push(i); });
      const ln=scene.lastNpcCell;
      return { crosses, lastNpcCross:(ln!=null && scene.board[ln] && scene.board[ln].symbol==='Cross') ? ln : null };
    }catch(e){ return { crosses:[], lastNpcCross:null }; }
  }

  function placement(card, targets, pre){
    try{
      if(!card || !targets || !targets.length) return Promise.resolve();
      const list=[];
      if(card.enhance) list.push(['enh', card.enhance]);
      if(card.jamming) list.push(['jam', card.jamming]);
      if(card.trait)   list.push(['trait', card.trait]);
      if(!list.length) return Promise.resolve();
      const main=targets[0];
      const mr=cellRect(main); if(!mr) return Promise.resolve();
      const R=reduced(), F=fastFwd();
      const D = R ? 420 : (F ? 320 : 720);
      const stagger = R ? 60 : (F ? 90 : (list.length>1 ? Math.min(300, (1150-D)/(list.length-1)) : 0));
      const L=layer();
      const ctx={ card, targets, main, pre:pre||{crosses:[],lastNpcCross:null}, D, R, F, L, mr,
        br:rectOf('.board'), bs:(typeof GameData!=='undefined'?GameData.BOARD_SIZE:4) };
      return Promise.all(list.map(([kind,name],i)=>sleep(i*stagger).then(()=>playOne(kind,name,ctx,i))));
    }catch(e){ console.error('StageFX.placement', e); return Promise.resolve(); }
  }

  function playOne(kind, name, ctx, idx){
    return new Promise(resolve=>{
      const g=el('div', `stfx-g stfx-k-${kind}`);
      ctx.L.appendChild(g);
      const mr=cellRect(ctx.main)||ctx.mr;
      const c=mr;
      const sub={ ...ctx, g, mr:c, mc:ctr(c), br:rectOf('.board')||ctx.br };
      // ラベル（効果名を小さく添える）
      const lbl=el('div','stfx-label',`<span class="stfx-label-k">${KIND_LABEL[kind]}</span>${esc(name)}`);
      // 効果名ラベルはセルの下（演出の浮き文字はセルの上）。画面下端に近い時だけ上に出す
      const above = c.bottom+30+idx*20 > innerHeight;
      lbl.style.left=Math.max(64, Math.min(innerWidth-64, sub.mc.x))+'px';
      lbl.style.top=(above ? c.top-6-idx*20 : c.bottom+4+idx*20)+'px';
      lbl.classList.add(above?'up':'down');
      g.appendChild(lbl);
      if(kind==='enh') sfx('upgrade',{volume:0.75,minGap:0}); else if(kind==='trait') sfx('reveal',{minGap:0}); // jam はGameMainScene.queueJammingEffect側で鳴らす
      anim(lbl,[{opacity:0,transform:`translate(-50%,${above?'-100%':'0'}) translateY(${above?6:-6}px) scale(.8)`},{opacity:1,transform:`translate(-50%,${above?'-100%':'0'}) scale(1)`,offset:.18},{opacity:1,transform:`translate(-50%,${above?'-100%':'0'}) scale(1)`,offset:.8},{opacity:0,transform:`translate(-50%,${above?'-100%':'0'}) translateY(${above?-6:6}px)`}],{duration:sub.D+120,easing:'ease-out',fill:'both'});
      try{
        if(ctx.R) drawReduced(sub);
        else (DRAW[name]||drawGeneric)(sub);
      }catch(e){ console.error('StageFX draw', name, e); }
      setTimeout(()=>{ g.remove(); }, sub.D+180);
      setTimeout(resolve, sub.D);
    });
  }

  // タイミング指定アニメーション（t0,t1 は D に対する比率）
  function T(sub, node, frames, t0, t1, easing, extra){
    return anim(node, frames, Object.assign({ delay:Math.round(sub.D*t0), duration:Math.max(30,Math.round(sub.D*(t1-t0))), easing:easing||'ease-out', fill:'both' }, extra||{}));
  }
  const FADE = [{opacity:0},{opacity:1,offset:.2},{opacity:1,offset:.75},{opacity:0}];

  function ring(sub, r, t0, t1, cls, maxScale){
    const c=ctr(r), s=Math.max(r.width,r.height);
    const e=putC(sub.g,'stfx-ring '+(cls||''),c.x,c.y,s,s);
    T(sub,e,[{opacity:.95,transform:'translate(-50%,-50%) scale(.35)'},{opacity:0,transform:`translate(-50%,-50%) scale(${maxScale||1.7})`}],t0,t1,'cubic-bezier(.2,.7,.3,1)');
    return e;
  }
  function glow(sub, r, t0, t1, cls){
    const e=put(sub.g,'stfx-glow '+(cls||''),r.left,r.top,r.width,r.height);
    T(sub,e,FADE,t0,t1,'ease-in-out'); return e;
  }
  function iconPop(sub, html, x, y, size, t0, t1, cls){
    const e=putC(sub.g,'stfx-icon '+(cls||''),x,y,size,size,html);
    T(sub,e,[{opacity:0,transform:'translate(-50%,-50%) scale(.2) rotate(-25deg)'},{opacity:1,transform:'translate(-50%,-50%) scale(1.18) rotate(4deg)',offset:.25},{opacity:1,transform:'translate(-50%,-50%) scale(1)',offset:.7},{opacity:0,transform:'translate(-50%,-50%) scale(.9)'}],t0,t1,'ease-out');
    return e;
  }
  function neighbors(ci, bs, diag){
    const r=Math.floor(ci/bs), c=ci%bs, out=[];
    for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++){
      if(!dr&&!dc) continue; if(!diag && dr&&dc) continue;
      const nr=r+dr, nc=c+dc; if(nr>=0&&nr<bs&&nc>=0&&nc<bs) out.push(nr*bs+nc);
    }
    return out;
  }
  function centerCells(bs){
    if(bs%2===1){ const m=(bs-1)/2; return [m*bs+m]; }
    const a=bs/2-1, b=bs/2; return [a*bs+a,a*bs+b,b*bs+a,b*bs+b];
  }
  function sceneBoard(){ return (typeof GameMainScene!=='undefined' && GameMainScene.board) || []; }

  function drawReduced(sub){ glow(sub, sub.mr, 0, 1); }
  function drawGeneric(sub){ glow(sub, sub.mr, 0, .9); ring(sub, sub.mr, .05, .8); }

  // 回転する記号（マルチ系）
  function orbitSymbols(sub, syms){
    const c=sub.mc, R=Math.max(sub.mr.width,sub.mr.height)*.62;
    const wrap=putC(sub.g,'stfx-orbit',c.x,c.y,R*2,R*2);
    syms.forEach((s,i)=>{
      const a=i/syms.length*Math.PI*2;
      const d=put(wrap,'stfx-orbit-item sym-'+s, R+Math.cos(a)*R, R+Math.sin(a)*R, 22, 22, symSvg(s));
      d.style.marginLeft='-11px'; d.style.marginTop='-11px';
      T(sub,d,[{transform:'rotate(0deg)'},{transform:'rotate(-540deg)'}],0,1,'linear');
    });
    T(sub,wrap,[{opacity:0,transform:'translate(-50%,-50%) scale(.3) rotate(0deg)'},{opacity:1,transform:'translate(-50%,-50%) scale(1) rotate(200deg)',offset:.3},{opacity:1,transform:'translate(-50%,-50%) scale(1) rotate(420deg)',offset:.75},{opacity:0,transform:'translate(-50%,-50%) scale(.1) rotate(540deg)'}],0,1,'ease-in-out');
    ring(sub, sub.mr, .7, 1);
  }
  function expandTo(sub, arrowSvg, dirCls){
    const rs=sub.targets.map(cellRect).filter(Boolean); const u=unionRect(rs)||sub.mr; const m=sub.mr;
    const box=put(sub.g,'stfx-expand',m.left,m.top,m.width,m.height);
    T(sub,box,[{left:m.left+'px',top:m.top+'px',width:m.width+'px',height:m.height+'px',opacity:1},{left:u.left+'px',top:u.top+'px',width:u.width+'px',height:u.height+'px',opacity:1,offset:.55},{left:(u.left-6)+'px',top:(u.top-6)+'px',width:(u.width+12)+'px',height:(u.height+12)+'px',opacity:0}],0,.95,'cubic-bezier(.3,.9,.3,1)');
    rs.forEach((r,i)=>ring(sub,r,.15+i*.08,.75+i*.05));
    if(arrowSvg){
      const c=ctr(u);
      const a=putC(sub.g,'stfx-icon stfx-arrow '+(dirCls||''),c.x,c.y,30,30,arrowSvg);
      const v = dirCls==='right' ? ['translate(-80%,-50%)','translate(-10%,-50%)'] : dirCls==='up' ? ['translate(-50%,-10%)','translate(-50%,-80%)'] : ['translate(-50%,-50%) scale(.6)','translate(-50%,-50%) scale(1.3)'];
      T(sub,a,[{opacity:0,transform:v[0]},{opacity:1,offset:.4},{opacity:0,transform:v[1]}],.1,.85,'ease-out');
    }
  }
  function concentric(sub, from, to, n){
    for(let i=0;i<n;i++){
      const e=put(sub.g,'stfx-square',from.left,from.top,from.width,from.height);
      T(sub,e,[{left:from.left+'px',top:from.top+'px',width:from.width+'px',height:from.height+'px',opacity:0},{opacity:.95,offset:.2},{left:to.left+'px',top:to.top+'px',width:to.width+'px',height:to.height+'px',opacity:0}],i*.15,.6+i*.15,'ease-in-out');
    }
  }
  function flyCard(sub, from, to, t0, t1, cls){
    const e=putC(sub.g,'stfx-flycard '+(cls||''),from.x,from.y,26,36,SVG.card);
    const dx=to.x-from.x, dy=to.y-from.y;
    T(sub,e,[{opacity:0,transform:'translate(-50%,-50%) scale(.6) rotate(-20deg)'},{opacity:1,transform:`translate(calc(-50% + ${dx*.4}px),calc(-50% + ${dy*.4-40}px)) scale(1.1) rotate(10deg)`,offset:.45},{opacity:0,transform:`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(.8) rotate(25deg)`}],t0,t1,'ease-in-out');
    return e;
  }
  function floatText(sub, text, x, y, t0, t1, cls){
    const e=putC(sub.g,'stfx-ftext '+(cls||''),x,y,null,null,esc(text));
    T(sub,e,[{opacity:0,transform:'translate(-50%,-30%) scale(.7)'},{opacity:1,transform:'translate(-50%,-80%) scale(1.1)',offset:.3},{opacity:1,transform:'translate(-50%,-110%) scale(1)',offset:.75},{opacity:0,transform:'translate(-50%,-150%)'}],t0,t1,'ease-out');
    return e;
  }
  function chainToRect(sub, r){
    const c=ctr(r), m=sub.mc;
    const ln=line(sub.g,'stfx-chain',m,c,6);
    T(sub,ln,[{transform:`rotate(${ln._ang}deg) scaleX(0)`,opacity:1},{transform:`rotate(${ln._ang}deg) scaleX(1)`,opacity:1,offset:.5},{transform:`rotate(${ln._ang}deg) scaleX(1)`,opacity:0}],.05,.95,'ease-out');
    return ln;
  }

  const DRAW = {
    // ===== 強化（黄） =====
    '数値強化'(s){
      glow(s,s.mr,0,.9);
      for(let i=0;i<4;i++){
        const x=s.mr.left+s.mr.width*(.2+.2*i), y=s.mr.bottom-8;
        const p=putC(s.g,'stfx-icon',x,y,14,14,SVG.plus);
        T(s,p,[{opacity:0,transform:'translate(-50%,0)'},{opacity:1,offset:.3},{opacity:0,transform:`translate(-50%,-${s.mr.height*.9}px)`}],.05+i*.1,.75+i*.06,'ease-out');
      }
      floatText(s,'UP',s.mc.x,s.mr.top,.15,.95);
    },
    '拡大'(s){ expandTo(s, null, 'rect'); },
    '横拡張'(s){ expandTo(s, SVG.arrowR, 'right'); },
    '縦拡張'(s){ expandTo(s, SVG.arrowU, 'up'); },
    'マルマルチ'(s){ orbitSymbols(s,[s.card.symbol==='Circle'?'Triangle':s.card.symbol,'Circle','Circle']); },
    'サンカクマルチ'(s){ orbitSymbols(s,[s.card.symbol==='Triangle'?'Circle':s.card.symbol,'Triangle','Triangle']); },
    'シカクマルチ'(s){ orbitSymbols(s,[s.card.symbol==='Square'?'Circle':s.card.symbol,'Square','Square']); },
    'バツマルチ'(s){ orbitSymbols(s,[s.card.symbol==='Cross'?'Circle':s.card.symbol,'Cross','Cross']); },
    'オールマルチ'(s){ orbitSymbols(s,['Circle','Triangle','Square','Circle','Triangle','Square']); },
    'ハブ'(s){
      const b=s.br||s.mr, len=Math.max(b.width,b.height)*1.25;
      [0,45,90,135].forEach((ang,i)=>{
        const e=putC(s.g,'stfx-spoke',s.mc.x,s.mc.y,len,4);
        T(s,e,[{opacity:0,transform:`translate(-50%,-50%) rotate(${ang}deg) scaleX(0)`},{opacity:1,transform:`translate(-50%,-50%) rotate(${ang}deg) scaleX(1)`,offset:.45},{opacity:0,transform:`translate(-50%,-50%) rotate(${ang}deg) scaleX(1)`}],i*.05,.85,'ease-out');
      });
      iconPop(s,icon('enh_hub')||SVG.nodes,s.mc.x,s.mc.y,30,.1,.95);
    },
    '連鎖'(s){
      const others=[]; sceneBoard().forEach((c,i)=>{ if(i!==s.main && c&&c.card&&c.card.enhance==='連鎖') others.push(i); });
      others.forEach(i=>{ const r=cellRect(i); if(!r) return; chainToRect(s,r); ring(s,r,.35,.95); glow(s,r,.3,1); });
      if(!others.length){
        const e=putC(s.g,'stfx-icon',s.mc.x,s.mc.y,36,36,SVG.chainLk);
        T(s,e,[{opacity:0,transform:'translate(-50%,-50%) rotate(0) scale(.4)'},{opacity:1,transform:'translate(-50%,-50%) rotate(180deg) scale(1.1)',offset:.5},{opacity:0,transform:'translate(-50%,-50%) rotate(360deg) scale(.9)'}],0,1,'ease-in-out');
      }
      iconPop(s,icon('enh_chain'),s.mc.x,s.mr.top+10,20,0,.9);
      floatText(s,`連鎖×${others.length+1}`,s.mc.x,s.mr.top,.2,1);
    },
    '巨大化'(s){
      for(let i=0;i<2;i++){
        const e=put(s.g,'stfx-ghost',s.mr.left,s.mr.top,s.mr.width,s.mr.height);
        T(s,e,[{opacity:.9,transform:'scale(1)'},{opacity:0,transform:'scale(1.75)'}],i*.25,.6+i*.25,'ease-out');
      }
      iconPop(s,SVG.arrowU,s.mc.x,s.mr.top+4,22,.1,.9);
    },
    '肥大化'(s){
      const b=putC(s.g,'stfx-bubble',s.mc.x,s.mc.y,s.mr.width*.9,s.mr.width*.9);
      T(s,b,[{opacity:0,transform:'translate(-50%,-50%) scale(.2)'},{opacity:.9,transform:'translate(-50%,-50%) scale(1.25)',offset:.6},{opacity:0,transform:'translate(-50%,-50%) scale(1.7)'}],0,.8,'cubic-bezier(.3,1.4,.6,1)');
      for(let i=0;i<6;i++){
        const a=i/6*Math.PI*2, d=s.mr.width*.9;
        const p=putC(s.g,'stfx-dot',s.mc.x,s.mc.y,7,7);
        T(s,p,[{opacity:0,transform:'translate(-50%,-50%)'},{opacity:1,offset:.1},{opacity:0,transform:`translate(calc(-50% + ${Math.cos(a)*d}px),calc(-50% + ${Math.sin(a)*d}px))`}],.5,.95,'ease-out');
      }
      floatText(s,'×2',s.mc.x,s.mc.y,.5,1,'big');
    },
    'ブルジョワ'(s){
      const top=(s.br?s.br.top:s.mr.top)-60;
      for(let i=0;i<8;i++){
        const x=s.mc.x+rnd(-s.mr.width*.45,s.mr.width*.45);
        const cn=putC(s.g,'stfx-coin',x,top,16,16,'G');
        T(s,cn,[{opacity:0,transform:'translate(-50%,-50%) rotateY(0deg)'},{opacity:1,offset:.15},{opacity:1,transform:`translate(-50%,calc(-50% + ${s.mc.y-top}px)) rotateY(720deg)`,offset:.8},{opacity:0,transform:`translate(-50%,calc(-50% + ${s.mc.y-top-10}px)) rotateY(800deg)`}],i*.06,.62+i*.05,'cubic-bezier(.5,0,.7,1)');
      }
      glow(s,s.mr,.45,1);
    },
    'ドロー'(s){
      const from=rectOf('.controls-row button[title="山札"]')||s.mr, to=rectOf('.hand-row')||s.mr;
      for(let i=0;i<2;i++) flyCard(s, ctr(from), {x:ctr(to).x+(i?24:-24), y:ctr(to).y}, i*.12, .8+i*.12);
      ring(s,from,0,.5);
      floatText(s,'DRAW',s.mc.x,s.mr.top,.1,.9);
    },
    'エクステンド'(s){
      const b=s.br||s.mr;
      const bar=put(s.g,'stfx-band',b.left,s.mc.y-13,b.width,26,`<span>${SVG.chev}${SVG.chev}</span><b>判定保留</b><span>${SVG.chev}${SVG.chev}</span>`);
      T(s,bar,[{opacity:0,transform:'scaleX(0)'},{opacity:1,transform:'scaleX(1)',offset:.35},{opacity:1,transform:'scaleX(1)',offset:.75},{opacity:0,transform:'scaleX(1.05)'}],0,1,'ease-out');
      iconPop(s,icon('enh_extend'),s.mc.x,s.mr.top+6,22,.05,.9);
    },
    '加重'(s){
      const top=s.mr.top-90;
      const w=putC(s.g,'stfx-icon stfx-weight',s.mc.x,top,34,34,SVG.weight);
      T(s,w,[{opacity:0,transform:'translate(-50%,-50%)'},{opacity:1,offset:.1},{opacity:1,transform:`translate(-50%,calc(-50% + ${s.mc.y-top}px))`,offset:.45,easing:'cubic-bezier(.6,0,1,1)'},{opacity:1,transform:`translate(-50%,calc(-50% + ${s.mc.y-top}px)) scale(1.15,.85)`,offset:.55},{opacity:0,transform:`translate(-50%,calc(-50% + ${s.mc.y-top}px)) scale(1)`}],0,1);
      ring(s,s.mr,.45,.95,'',2);
      for(let i=0;i<5;i++){
        const p=putC(s.g,'stfx-dust',s.mc.x,s.mr.bottom-4,6,6);
        const dx=(i-2)*16;
        T(s,p,[{opacity:0},{opacity:.9,offset:.1},{opacity:0,transform:`translate(${dx}px,-14px)`}],.45,.9);
      }
    },
    'ギャンブル'(s){
      const delta=s.card._gambleDelta||0;
      const fin=(delta>=0?'+':'-')+String(Math.abs(Math.round(delta))).padStart(2,'0');
      const box=putC(s.g,'stfx-slot',s.mc.x,s.mr.top-22,84,30);
      const chars=fin.split('');
      chars.forEach((ch,i)=>{
        const win=el('div','stfx-reel');
        const strip=el('div','stfx-reel-strip');
        const pool=i===0?['+','-','+','-','+','-','+']:['7','3','9','1','5','8','2','6','0','4'];
        const seq=[]; for(let k=0;k<8+i*3;k++) seq.push(pool[k%pool.length]); seq.push(ch);
        strip.innerHTML=seq.map(v=>`<span>${esc(v)}</span>`).join('');
        win.appendChild(strip); box.appendChild(win);
        T(s,strip,[{transform:'translateY(0)'},{transform:`translateY(-${(seq.length-1)*24}px)`}],0,.45+i*.15,'cubic-bezier(.2,.6,.3,1)');
      });
      box.classList.add(delta>=0?'win':'lose');
      T(s,box,[{opacity:0,transform:'translate(-50%,-50%) scale(.6)'},{opacity:1,transform:'translate(-50%,-50%) scale(1)',offset:.12},{opacity:1,offset:.85},{opacity:0}],0,1);
      iconPop(s,icon('enh_gamble'),s.mc.x,s.mc.y,24,.7,1);
    },
    'トップスピード'(s){
      const b=s.br||s.mr;
      for(let i=0;i<5;i++){
        const y=s.mr.top+s.mr.height*(.15+.17*i), w=rnd(40,80);
        const e=put(s.g,'stfx-speed',b.left-20,y,w,3);
        T(s,e,[{opacity:0,transform:'translateX(0)'},{opacity:1,offset:.2},{opacity:0,transform:`translateX(${b.width+40-w}px)`}],i*.05,.55+i*.06,'cubic-bezier(.3,0,.2,1)');
      }
      const ic=putC(s.g,'stfx-icon',b.left,s.mc.y,26,26,icon('enh_top_speed')||SVG.chev);
      T(s,ic,[{opacity:0,transform:'translate(-50%,-50%)'},{opacity:1,offset:.2},{opacity:0,transform:`translate(calc(-50% + ${s.mc.x-b.left}px),-50%)`}],.1,.6,'cubic-bezier(.3,0,.2,1)');
      ring(s,s.mr,.55,1);
    },
    '重ね掛け'(s){
      for(let i=0;i<3;i++){
        const e=put(s.g,'stfx-layer-card',s.mr.left,s.mr.top,s.mr.width,s.mr.height);
        T(s,e,[{opacity:0,transform:'translateY(-40px) scale(1.1)'},{opacity:.95,transform:`translate(${(2-i)*3}px,${-(2-i)*3}px) scale(1)`,offset:.5},{opacity:.95,offset:.8},{opacity:0,transform:'translate(0,0) scale(1)'}],i*.14,.7+i*.1,'cubic-bezier(.3,1.3,.6,1)');
      }
      floatText(s,'重ねがけ',s.mc.x,s.mr.top,.3,1);
    },

    // ===== ジャミング（緑） =====
    'スタン'(s){
      const R=s.mr.width*.55;
      const wrap=putC(s.g,'stfx-stun',s.mc.x,s.mr.top+6,R*2,R*2);
      wrap.style.transform='translate(-50%,-50%) scaleY(.38)';
      const spin=el('div','stfx-stun-spin'); wrap.appendChild(spin);
      for(let i=0;i<5;i++){
        const a=i/5*Math.PI*2;
        const st=put(spin,'stfx-icon',R+Math.cos(a)*R-8,R+Math.sin(a)*R-8,16,16,SVG.star);
        T(s,st,[{transform:'scaleY(2.6) rotate(0)'},{transform:'scaleY(2.6) rotate(360deg)'}],0,1,'linear');
      }
      T(s,spin,[{transform:'rotate(0deg)',opacity:0},{opacity:1,offset:.15},{opacity:1,offset:.8},{transform:'rotate(540deg)',opacity:0}],0,1,'linear');
      iconPop(s,icon('jam_stun'),s.mc.x,s.mc.y,24,.2,1);
    },
    'サンダー'(s){
      const tg=(s.pre.crosses&&s.pre.crosses.length)?s.pre.crosses:[s.main];
      const fl=el('div','stfx-flash'); s.g.appendChild(fl); T(s,fl,[{opacity:0},{opacity:.35,offset:.3},{opacity:0,offset:.5},{opacity:.2,offset:.6},{opacity:0}],0,.7,'linear');
      tg.forEach((ci,i)=>{
        const r=cellRect(ci); if(!r) return; const c=ctr(r);
        const top=Math.max(0,(s.br?s.br.top:r.top)-140);
        const h=c.y-top;
        const pts=[]; const n=6; for(let k=0;k<=n;k++){ pts.push(`${(k===0||k===n)?20:20+rnd(-12,12)},${(k/n)*100}`); }
        const bolt=put(s.g,'stfx-bolt',c.x-20,top,40,h,`<svg viewBox="0 0 40 100" preserveAspectRatio="none"><polyline points="${pts.join(' ')}" fill="none" stroke="currentColor" stroke-opacity=".35" stroke-width="12" stroke-linejoin="round" vector-effect="non-scaling-stroke"/><polyline points="${pts.join(' ')}" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round" vector-effect="non-scaling-stroke"/><polyline points="${pts.join(' ')}" fill="none" stroke="#fff" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>`);
        const d=.05+i*.06;
        T(s,bolt,[{opacity:0,clipPath:'inset(0 0 100% 0)'},{opacity:1,clipPath:'inset(0 0 0 0)',offset:.25},{opacity:1,offset:.35},{opacity:0,offset:.45},{opacity:1,offset:.55},{opacity:0}],d,d+.6,'linear');
        ring(s,r,d+.18,d+.75,'',1.9);
        // 落雷でバツが砕ける
        if(ci!==s.main || (s.pre.crosses&&s.pre.crosses.includes(ci))){
          [-1,1].forEach(side=>{
            const sh=putC(s.g,'stfx-shard sym-Cross',c.x,c.y,26,26,symSvg('Cross'));
            sh.style.clipPath=side<0?'polygon(0 0,55% 0,45% 100%,0 100%)':'polygon(55% 0,100% 0,100% 100%,45% 100%)';
            T(s,sh,[{opacity:1,transform:'translate(-50%,-50%)'},{opacity:0,transform:`translate(calc(-50% + ${side*22}px),calc(-50% + 18px)) rotate(${side*35}deg)`}],d+.2,d+.75,'ease-in');
          });
        }
      });
      iconPop(s,icon('jam_thunder')||SVG.bolt,s.mc.x,s.mr.top+6,22,0,.8);
    },
    '混乱'(s){
      const b=s.br||s.mr, c=ctr(b);
      const sp=putC(s.g,'stfx-icon stfx-spiral',c.x,c.y,b.width*.5,b.width*.5,SVG.spiral);
      T(s,sp,[{opacity:0,transform:'translate(-50%,-50%) rotate(0) scale(.3)'},{opacity:.85,transform:'translate(-50%,-50%) rotate(-360deg) scale(1)',offset:.5},{opacity:0,transform:'translate(-50%,-50%) rotate(-720deg) scale(.2)'}],0,1,'ease-in-out');
      for(let i=0;i<6;i++){
        const a=i/6*Math.PI*2, R=b.width*.45;
        const q=putC(s.g,'stfx-icon',c.x,c.y,20,20,SVG.qmark);
        const k=[];
        for(let f=0;f<=4;f++){ const aa=a+f*1.4, rr=R*(1-f/4); k.push({opacity:f===0?0:f===4?0:1,transform:`translate(calc(-50% + ${Math.cos(aa)*rr}px),calc(-50% + ${Math.sin(aa)*rr}px)) rotate(${f*90}deg)`}); }
        T(s,q,k,i*.03,.9,'ease-in');
      }
    },
    'ブレイク'(s){
      const sh=putC(s.g,'stfx-icon stfx-shield',s.mc.x,s.mc.y,s.mr.width*.8,s.mr.width*.8,SVG.shield);
      T(s,sh,[{opacity:0,transform:'translate(-50%,-50%) scale(1.8)'},{opacity:1,transform:'translate(-50%,-50%) scale(1)',offset:.3},{opacity:1,offset:.8},{opacity:0,transform:'translate(-50%,-50%) scale(.95)'}],0,1,'cubic-bezier(.5,0,.4,1.3)');
      ring(s,s.mr,.25,.9,'',2.2);
      // バツのビンゴ線が盾で砕ける
      const b=s.br||s.mr;
      [-1,1].forEach(side=>{
        const ln=put(s.g,'stfx-breakline',side<0?b.left:s.mc.x,s.mc.y-2,(side<0?s.mc.x-b.left:b.right-s.mc.x),4);
        T(s,ln,[{opacity:0},{opacity:1,offset:.3},{opacity:0,transform:`translateY(${side*10}px) rotate(${side*8}deg)`}],.3,.9,'ease-in');
      });
      iconPop(s,icon('jam_break'),s.mc.x,s.mr.top+4,18,.2,1);
    },
    '延命'(s){
      const bs=s.bs, row=Math.floor(s.main/bs);
      const cells=[]; for(let c=0;c<Math.min(4,bs);c++) cells.push(row*bs+c);
      cells.forEach((ci,i)=>{ const r=cellRect(ci); if(!r) return; glow(s,r,.08*i,.7+.06*i,'thin'); });
      const u=unionRect(cells.map(cellRect));
      if(u){ const t=put(s.g,'stfx-tag4',u.left,u.top-18,u.width,16,'<b>4</b>列のみ'); T(s,t,FADE,.2,1); }
      iconPop(s,icon('jam_prolong')||SVG.hourglass,s.mc.x,s.mc.y,26,0,.9);
    },
    'ビンゴ阻害'(s){
      const b=s.br||s.mr; const n=Math.max(1,sceneBoard().filter(c=>c&&c.card&&c.card.jamming==='ビンゴ阻害').length);
      // 1枚：縦を封鎖 / 2枚：縦横 / 3枚以上：全面
      const bs=s.bs;
      for(let c=0;c<bs;c++){
        const r=cellRect(c); if(!r) continue;
        const v=put(s.g,'stfx-gate',r.left+r.width/2-3,b.top,6,b.height);
        T(s,v,[{transform:'scaleY(0)',opacity:1},{transform:'scaleY(1)',opacity:1,offset:.4},{opacity:1,offset:.8},{opacity:0}],c*.04,.95,'ease-out');
        v.style.transformOrigin='50% 0';
      }
      if(n>=2) for(let rr=0;rr<bs;rr++){
        const r=cellRect(rr*bs); if(!r) continue;
        const h=put(s.g,'stfx-gate',b.left,r.top+r.height/2-3,b.width,6);
        h.style.transformOrigin='0 50%';
        T(s,h,[{transform:'scaleX(0)',opacity:1},{transform:'scaleX(1)',opacity:1,offset:.4},{opacity:1,offset:.8},{opacity:0}],.15+rr*.04,.95,'ease-out');
      }
      if(n>=3){ const g=put(s.g,'stfx-veil',b.left,b.top,b.width,b.height); T(s,g,FADE,.3,1); }
      iconPop(s,icon('jam_bingo_block'),s.mc.x,s.mc.y,24,.1,.95);
    },
    'リンク'(s){
      const ns=neighbors(s.main,s.bs,false);
      ns.forEach(ci=>{ const r=cellRect(ci); if(!r) return; chainToRect(s,r); ring(s,r,.4,.95); glow(s,r,.4,1,'thin'); });
      iconPop(s,icon('jam_link')||SVG.chainLk,s.mc.x,s.mc.y,24,0,.9);
    },
    '引き直し'(s){
      const ci=s.pre.lastNpcCross!=null?s.pre.lastNpcCross:s.main;
      const r=cellRect(ci)||s.mr, c=ctr(r);
      const rw=putC(s.g,'stfx-icon stfx-rewind',c.x,c.y,r.width*.9,r.width*.9,SVG.rewind);
      T(s,rw,[{opacity:0,transform:'translate(-50%,-50%) rotate(0)'},{opacity:1,offset:.2},{opacity:1,transform:'translate(-50%,-50%) rotate(-540deg)',offset:.75},{opacity:0,transform:'translate(-50%,-50%) rotate(-620deg) scale(.6)'}],0,1,'ease-in-out');
      if(s.pre.lastNpcCross!=null){
        const gx=putC(s.g,'stfx-ghostsym sym-Cross',c.x,c.y,30,30,symSvg('Cross'));
        T(s,gx,[{opacity:1,transform:'translate(-50%,-50%) scale(1)'},{opacity:0,transform:'translate(-50%,-50%) scale(.2) rotate(-180deg)'}],.1,.7,'ease-in');
        const ban=putC(s.g,'stfx-ban',c.x,c.y,r.width*.7,r.width*.7);
        T(s,ban,[{opacity:0,transform:'translate(-50%,-50%) scale(1.4)'},{opacity:1,transform:'translate(-50%,-50%) scale(1)',offset:.4},{opacity:0}],.6,1);
      }
      if(ci!==s.main) iconPop(s,icon('jam_redraw'),s.mc.x,s.mc.y,22,0,.8);
    },
    '封印'(s){
      neighbors(s.main,s.bs,true).forEach((ci,i)=>{
        const r=cellRect(ci); if(!r) return; const c=ctr(r);
        const lk=putC(s.g,'stfx-icon stfx-lock',c.x,c.y,26,26,SVG.lock);
        T(s,lk,[{opacity:0,transform:'translate(-50%,-50%) scale(2) rotate(-20deg)'},{opacity:1,transform:'translate(-50%,-50%) scale(1) rotate(0)',offset:.3},{opacity:1,offset:.8},{opacity:0}],.04*i,.75+.03*i,'cubic-bezier(.5,0,.5,1.4)');
        const sq=put(s.g,'stfx-seal',r.left+4,r.top+4,r.width-8,r.height-8); T(s,sq,FADE,.04*i+.15,.95);
      });
      iconPop(s,icon('jam_seal')||SVG.lock,s.mc.x,s.mc.y,24,0,.85);
    },
    '誘導'(s){
      const cc=centerCells(s.bs).map(cellRect).filter(Boolean); const u=unionRect(cc); const b=s.br||s.mr;
      if(!u) return;
      cc.forEach(r=>glow(s,r,.3,1));
      const c=ctr(u);
      [[0,-1],[1,0],[0,1],[-1,0]].forEach(([dx,dy],i)=>{
        const sx=dx? (dx<0?b.left:b.right) : c.x, sy=dy? (dy<0?b.top:b.bottom) : c.y;
        const ar=putC(s.g,'stfx-icon stfx-guide',sx,sy,24,24,SVG.arrowR);
        const ang=Math.atan2(-dy,-dx)*180/Math.PI;
        const tx=(c.x-sx)*.75, ty=(c.y-sy)*.75;
        T(s,ar,[{opacity:0,transform:`translate(-50%,-50%) rotate(${ang}deg)`},{opacity:1,offset:.25},{opacity:0,transform:`translate(calc(-50% + ${tx}px),calc(-50% + ${ty}px)) rotate(${ang}deg)`}],i*.05,.75+i*.05,'ease-in');
      });
      iconPop(s,icon('jam_guide'),c.x,c.y,26,.4,1);
    },

    // ===== 性質変化（青） =====
    '塗りつぶし'(s){ ink(s,false); },
    '塗りつぶし(レリック)'(s){ ink(s,true); },
    '指令官'(s){
      const f=putC(s.g,'stfx-icon stfx-flag',s.mc.x,s.mc.y,30,30,SVG.flag);
      T(s,f,[{opacity:0,transform:'translate(-50%,10%) scaleY(.2)'},{opacity:1,transform:'translate(-50%,-70%) scaleY(1)',offset:.35},{opacity:1,transform:'translate(-50%,-70%) skewY(-6deg)',offset:.55},{opacity:1,transform:'translate(-50%,-70%) skewY(4deg)',offset:.75},{opacity:0,transform:'translate(-50%,-70%)'}],0,1,'ease-out');
      floatText(s,'T7-10 ×1.2',s.mc.x,s.mr.top,.25,1);
    },
    'ネガティブ'(s){ clockBack(s,false); },
    'ネガティブ(パッシブ)'(s){ clockBack(s,true); },
    'ディスカード'(s){
      const to=rectOf('.controls-row button[title="捨て札"]')||s.mr;
      flyCard(s,s.mc,ctr(to),0,.75,'discard');
      const coin=putC(s.g,'stfx-coin',ctr(to).x,ctr(to).y,18,18,'G');
      T(s,coin,[{opacity:0,transform:'translate(-50%,-50%) scale(.3)'},{opacity:1,transform:'translate(-50%,-120%) scale(1.1)',offset:.5},{opacity:0,transform:'translate(-50%,-180%)'}],.55,1);
      floatText(s,'捨て札で+2G',s.mc.x,s.mr.top,.1,.9);
    },
    'レリック特攻'(s){
      const rel=Array.from(document.querySelectorAll('.relic-display-row .relic-card')).map(rectOf).filter(Boolean);
      const srcs=rel.length?rel:[rectOf('.relic-display-row')].filter(Boolean);
      srcs.forEach((r,i)=>{
        const a=ctr(r); const ln=line(s.g,'stfx-beam',a,s.mc,4);
        T(s,ln,[{transform:`rotate(${ln._ang}deg) scaleX(0)`,opacity:1},{transform:`rotate(${ln._ang}deg) scaleX(1)`,opacity:1,offset:.5},{transform:`rotate(${ln._ang}deg) scaleX(1)`,opacity:0}],i*.06,.8+i*.04,'ease-in');
        ring(s,r,i*.06,.6);
      });
      iconPop(s,SVG.sword,s.mc.x,s.mc.y,28,.35,1);
      floatText(s,`+10×${rel.length}`,s.mc.x,s.mr.top,.45,1);
    },
    'ミニマム'(s){
      const b=s.br||s.mr; concentric(s, b, s.mr, 3);
      floatText(s,'MIN',s.mc.x,s.mc.y,.5,1);
    },
    'マキシマム'(s){
      const b=s.br||s.mr; concentric(s, s.mr, b, 3);
      floatText(s,'MAX',s.mc.x,s.mc.y,.35,1);
    },
    '将軍'(s){
      const hr=rectOf('.hand-row');
      const cr=putC(s.g,'stfx-icon stfx-crown',s.mc.x,s.mr.top-40,34,34,SVG.crown);
      const tx=hr?ctr(hr).x-s.mc.x:0, ty=hr?(hr.top+10)-(s.mr.top-40):60;
      T(s,cr,[{opacity:0,transform:'translate(-50%,-50%) scale(.5)'},{opacity:1,transform:'translate(-50%,-50%) scale(1.15)',offset:.3},{opacity:1,transform:`translate(calc(-50% + ${tx}px),calc(-50% + ${ty}px)) scale(1)`,offset:.75},{opacity:0,transform:`translate(calc(-50% + ${tx}px),calc(-50% + ${ty}px)) scale(1.4)`}],0,1,'ease-in-out');
      if(hr) glow(s,hr,.55,1);
      floatText(s,'手札で×1.1',s.mc.x,s.mr.top,.2,.9);
    },
    '保留'(s){
      const R=s.mr.width*.6;
      const lp=putC(s.g,'stfx-icon stfx-loop',s.mc.x,s.mc.y,R*2,R*2,SVG.loop);
      T(s,lp,[{opacity:0,transform:'translate(-50%,-50%) rotate(0)'},{opacity:1,offset:.25},{opacity:1,transform:'translate(-50%,-50%) rotate(300deg)',offset:.8},{opacity:0,transform:'translate(-50%,-50%) rotate(360deg)'}],0,1,'ease-in-out');
      const pn=putC(s.g,'stfx-icon',s.mr.right-8,s.mr.top+4,18,18,SVG.pin);
      T(s,pn,[{opacity:0,transform:'translate(-50%,-140%)'},{opacity:1,transform:'translate(-50%,-50%)',offset:.3},{opacity:1,offset:.8},{opacity:0}],.15,1,'cubic-bezier(.4,1.6,.6,1)');
      floatText(s,'次ラウンドへ保留',s.mc.x,s.mr.top,.3,1);
    },
    '竜頭蛇尾'(s){
      const b=s.br||s.mr; const w=Math.min(innerWidth*.9,b.width*1.1);
      const sh=put(s.g,'stfx-dragon-shade',b.left,b.top,b.width,b.height); T(s,sh,FADE,0,.8,'ease-in-out');
      const d=putC(s.g,'stfx-dragon',b.right+w/2,b.top+b.height*.35,w,w*.4,SVG.dragon);
      T(s,d,[{opacity:0,transform:'translate(-50%,-50%) scale(1.1)'},{opacity:.95,offset:.15},{opacity:.95,transform:`translate(calc(-50% - ${b.width*.9}px),calc(-50% + ${b.height*.15}px)) scale(.75)`,offset:.6},{opacity:0,transform:`translate(calc(-50% - ${b.width*1.2+w*.2}px),calc(-50% + ${b.height*.25}px)) scale(.3)`}],0,.9,'ease-in-out');
      // しっぽが細って消える
      const tail=putC(s.g,'stfx-tail',s.mc.x,s.mc.y,s.mr.width*.9,10);
      T(s,tail,[{opacity:0,transform:'translate(-50%,-50%) scaleX(1)'},{opacity:1,offset:.2},{opacity:0,transform:'translate(-50%,-50%) scaleX(.1) scaleY(.3)'}],.45,1,'ease-in');
      floatText(s,'+300 → 先細り',s.mc.x,s.mr.top,.3,1);
    },
  };
  function ink(s, relic){
    s.targets.forEach((ci,i)=>{
      const r=cellRect(ci); if(!r) return; const c=ctr(r);
      const blob=putC(s.g,'stfx-ink'+(relic?' relic':''),c.x,c.y,r.width*1.05,r.width*1.05);
      T(s,blob,[{opacity:.95,transform:'translate(-50%,-50%) scale(.1) rotate(0)',borderRadius:'50% 40% 55% 45%'},{opacity:.85,transform:'translate(-50%,-50%) scale(1) rotate(40deg)',borderRadius:'42% 58% 38% 62%',offset:.45},{opacity:0,transform:'translate(-50%,-50%) scale(1.15) rotate(60deg)',borderRadius:'55% 45% 60% 40%'}],i*.05,.95,'cubic-bezier(.2,.8,.3,1)');
      for(let k=0;k<5;k++){
        const a=rnd(0,Math.PI*2), d=r.width*rnd(.55,.85);
        const dr=putC(s.g,'stfx-drop'+(relic?' relic':''),c.x,c.y,rnd(5,9),rnd(5,9));
        T(s,dr,[{opacity:0,transform:'translate(-50%,-50%)'},{opacity:1,offset:.2},{opacity:0,transform:`translate(calc(-50% + ${Math.cos(a)*d}px),calc(-50% + ${Math.sin(a)*d}px))`}],.1+i*.05,.8,'ease-out');
      }
    });
    if(relic) for(let k=0;k<4;k++){ const sp=putC(s.g,'stfx-icon stfx-relic-spark',s.mc.x+rnd(-24,24),s.mc.y+rnd(-24,24),12,12,icon('fx_sparkle')||SVG.star); T(s,sp,FADE,.3+k*.08,.9); }
  }
  function clockBack(s, passive){
    const sz=s.mr.width*.85;
    const ck=putC(s.g,'stfx-clock'+(passive?' passive':''),s.mc.x,s.mc.y,sz,sz,SVG.clock);
    const h1=el('div','stfx-hand',SVG.hand), h2=el('div','stfx-hand short',SVG.hand2); ck.appendChild(h1); ck.appendChild(h2);
    T(s,ck,[{opacity:0,transform:'translate(-50%,-50%) scale(.5)'},{opacity:1,transform:'translate(-50%,-50%) scale(1)',offset:.2},{opacity:1,offset:.8},{opacity:0,transform:'translate(-50%,-50%) scale(1.1)'}],0,1);
    T(s,h1,[{transform:'rotate(0deg)'},{transform:'rotate(-720deg)'}],.1,.85,'ease-in-out');
    T(s,h2,[{transform:'rotate(0deg)'},{transform:'rotate(-180deg)'}],.1,.85,'ease-in-out');
    if(passive){ const sy=putC(s.g,'stfx-icon sym-Circle',s.mr.right-8,s.mr.top+8,16,16,symSvg('Circle')); T(s,sy,FADE,.1,1); }
    floatText(s,'追加ターン',s.mc.x,s.mr.top,.35,1);
  }

  // =====================================================================
  // 2. ボス効果：バッジ・吹き出し・付与演出
  // =====================================================================
  // 一覧：ボス効果オブジェクト（GameData.bossEffectForFloor の結果。power=1 通常 / 2 強化版で name・desc 差し替え済み）をそのまま使う
  function bossList(scene){
    const list=[];
    if(scene && scene.bossEffect) (scene.bossEffects||[scene.bossEffect]).forEach(be=>list.push({id:be.id,name:be.name,desc:be.desc,power:be.power||1}));
    if(typeof GameState!=='undefined' && GameState.floor10SpecialBoss) list.push({id:'final',name:'最終決戦',desc:'5ターンごと（6,11,16…ターン目）は強制的にNPCの番になる',power:1,special:true});
    return list;
  }
  const BOSS_ICON = () => `<svg class="stfx-boss-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4l3.5 4.5M20 4l-3.5 4.5"/><path d="M5 12a7 7 0 0 1 14 0v3.5a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z" fill="currentColor" fill-opacity=".25"/><path d="M9 13h.01M15 13h.01" stroke-width="3"/><path d="M10 17h4"/></svg>`;
  const FLAME_ICON = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M12 2c1 3.5 5 6 5 11a5 5 0 0 1-10 0c0-2.4 1.2-4 2.4-5.2.2 1.6.9 2.7 2 3.2C11 8.6 11.2 5 12 2z"/></svg>`;
  const isPowered = b => (b && b.power||1)>=2;
  const powerTag = (b, cls) => isPowered(b) ? `<span class="stfx-boss-pw ${cls||''}">${FLAME_ICON}強化</span>` : '';

  function bossBadge(list, open, onToggle){
    const wrap=el('div','stfx-boss-badge-wrap');
    const anyPw=list.some(isPowered);
    const btn=el('button','stfx-boss-badge'+(anyPw?' pw2':'')+(open?' open':'')+((bossUI&&!bossUI.lit)?' pending':''),`${BOSS_ICON()}<span>BOSS</span><b>×${list.length}</b>`);
    btn.type='button'; btn.setAttribute('aria-label',`ボス効果 ${list.length}件${anyPw?'（強化あり）':''}（タップで一覧）`); btn.setAttribute('aria-expanded',open?'true':'false');
    btn.addEventListener('click',(e)=>{ e.stopPropagation(); onToggle&&onToggle(); });
    wrap.appendChild(btn);
    if(open){
      const bub=el('div','stfx-boss-bubble');
      bub.innerHTML=`<div class="stfx-boss-bubble-title">${BOSS_ICON()}ボス効果一覧（${list.length}）<span class="stfx-boss-bubble-close">タップで閉じる</span></div>`+
        list.map(b=>`<div class="stfx-boss-entry${isPowered(b)?' pw2':''}${b.special?' special':''}"><div class="stfx-boss-entry-name">${esc(b.name)}${powerTag(b)}${b.special?'<span class="stfx-boss-sp">階層10</span>':''}</div><div class="stfx-boss-entry-desc">${(b.desc)}</div></div>`).join('');
      bub.addEventListener('click',(e)=>{ e.stopPropagation(); onToggle&&onToggle(); });
      wrap.appendChild(bub);
      // 吹き出しを画面内に収め、しっぽをバッジに向ける（absolute 配置。レイアウトに影響しない／スクロールにも追従）
      requestAnimationFrame(()=>{
        const br=btn.getBoundingClientRect(), wr=wrap.getBoundingClientRect(); const vw=document.documentElement.clientWidth||innerWidth;
        const w=Math.min(340, vw-24); bub.style.width=w+'px';
        const left=Math.max(12, Math.min(vw-w-12, br.left+br.width/2-w/2));
        bub.style.left=(left-wr.left)+'px'; bub.style.top=(br.bottom-wr.top+10)+'px';
        bub.style.setProperty('--tail-x',(br.left+br.width/2-left)+'px');
        bub.classList.add('placed');
      });
    }
    return wrap;
  }

  // ---------- ボス効果の文言・数値（be.name / be.desc / power から生成。ハードコードしない） ----------
  const toHalf = s => String(s||'').replace(/[０-９]/g, d=>String.fromCharCode(d.charCodeAt(0)-0xFEE0)).replace(/[−－ー](?=\d)/g,'-').replace(/＋/g,'+');
  // 名前→説明の順に「±数値」を探す（例：ターン制限-4 → "-4"）
  function signedNum(be){
    for(const s of [be.name, be.desc]){ const m=toHalf(s).match(/([+-])\s*(\d+)/); if(m) return m[1]+m[2]; }
    return '';
  }
  function bigNum(be){ for(const s of [be.name, be.desc]){ const m=toHalf(s).match(/\d{3,}/); if(m) return m[0]; } return ''; }
  function firstNum(be){ for(const s of [be.name, be.desc]){ const m=toHalf(s).match(/\d+/); if(m) return m[0]; } return ''; }
  const fmtMinus = v => String(v).replace(/^-/,'−');

  let bossUI=null;
  function bossIntro(opts){
    const list=(opts&&opts.list)||[];
    if(!list.length) return Promise.resolve();
    endBoss(true);
    const R=reduced();
    const n=list.length;
    const ov=el('div','stfx-boss'+(R?' stfx-reduced':''));
    ov.innerHTML=`<div class="stfx-boss-vig"></div><div class="stfx-boss-fx"></div>
      <div class="stfx-boss-band"><div class="stfx-boss-band-stripe"></div><div class="stfx-boss-band-text"><b>BOSS</b><span>${opts.floor?`第${esc(opts.floor)}階層 `:''}ボスステージ<em>ボス効果 ×${n}</em></span></div><div class="stfx-boss-band-stripe"></div></div>
      ${n>1?`<div class="stfx-boss-steps">${list.map(b=>`<i class="${isPowered(b)?'pw2':''}"></i>`).join('')}</div>`:''}
      <div class="stfx-boss-hint">タップでスキップ</div>`;
    document.body.appendChild(ov);
    const ui=bossUI={ ov, skip:false, lit:false, fx:ov.querySelector('.stfx-boss-fx') };
    document.querySelectorAll('.stfx-boss-badge').forEach(b=>b.classList.add('pending'));
    watch();
    const w=ms=>ui.skip?Promise.resolve():new Promise(r=>{ const t=setTimeout(r,R?Math.min(ms,120):ms); ui.wake=()=>{ clearTimeout(t); r(); }; });
    ov.addEventListener('click',()=>{ ui.skip=true; ov.getAnimations({subtree:true}).forEach(a=>{ try{a.finish();}catch(e){} }); if(ui.wake) ui.wake(); });
    return (async()=>{
      try{
        ov.classList.add('st-on');
        sfx('boss');
        anim(ov.querySelector('.stfx-boss-vig'),[{opacity:0},{opacity:1,offset:.25},{opacity:.55,offset:.5},{opacity:1,offset:.75},{opacity:.7}],{duration:R?200:900,fill:'forwards'});
        await w(420);
        const band=ov.querySelector('.stfx-boss-band');
        if(!ui.skip) sfx('swipe',{pitch:-5});
        anim(band,[{transform:'translateX(-110%) skewX(-12deg)',opacity:1},{transform:'translateX(0) skewX(-12deg)',offset:.35},{transform:'translateX(0) skewX(-12deg)',offset:.75},{transform:'translateX(110%) skewX(-12deg)',opacity:1}],{duration:R?300:1500,easing:'cubic-bezier(.7,0,.3,1)',fill:'both'});
        await w(1150);
        // 効果1つ：じっくり見せる / 複数：1つずつ、前の効果の差分演出を片付けてから次を叩きつける（重ならない）
        const hold = n===1 ? 1500 : 1050;
        for(let i=0;i<n;i++){
          if(ui.skip) break;
          const dots=ov.querySelectorAll('.stfx-boss-steps i'); dots.forEach((d,k)=>d.classList.toggle('on',k===i));
          await stampBoss(ui, list[i], i, n, w, R, hold);
          if(dots[i]) dots[i].classList.add('done');
        }
      }catch(e){ console.error('StageFX.bossIntro', e); }
      await endBoss(false);
    })();
  }

  // 刻印の置き場所：差分演出の対象（盤面のマス・UI）と重ならない位置を選ぶ
  //   候補：盤面中央 → 盤面の下 → 盤面の上（画面内に収める）
  function plateSpot(br, target, ph){
    const vh=document.documentElement.clientHeight||innerHeight, vw=document.documentElement.clientWidth||innerWidth;
    const cands=[ br.top+br.height/2, br.bottom+30+ph/2, br.top-30-ph/2 ];
    const clampY=y=>Math.max(ph/2+8, Math.min(vh-ph/2-36, y));
    const hit=(y)=>{ if(!target) return false; const t=y-ph/2, b=y+ph/2; return !(b<target.top-26 || t>target.bottom+26); };
    for(const y of cands){ const yy=clampY(y); if(!hit(yy)) return {x:vw/2,y:yy}; }
    return {x:vw/2, y:clampY(cands[1])};
  }

  async function stampBoss(ui, be, i, n, w, R, hold){
    const br=rectOf('.board'); if(!br) return;
    const pw=isPowered(be);
    // 前の効果の差分演出は退場させる（複数効果で重ならないように）
    Array.from(ui.fx.children).forEach(g=>{ const a=anim(g,[{opacity:1},{opacity:0}],{duration:R?60:220,fill:'forwards'}); a.finished.catch(()=>{}).then(()=>g.remove()); });
    const grp=el('div','stfx-boss-grp'); ui.fx.appendChild(grp);
    const plan=bossPlan(be);
    const kicker=`ボス効果${n>1?` ${i+1}/${n}`:''}${be.special?' ・ 階層10':''}`;
    const plate=el('div','stfx-boss-plate'+(pw?' pw2':'')+(be.special?' special':''),
      `${pw?`<div class="stfx-boss-plate-flame"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>`:''}`+
      `<div class="stfx-boss-plate-k">${esc(kicker)}${powerTag(be,'onplate')}</div><div class="stfx-boss-plate-n">${esc(be.name)}</div><div class="stfx-boss-plate-d">${(be.desc)}</div>`);
    plate.style.visibility='hidden'; ui.ov.appendChild(plate);
    const ph=plate.offsetHeight||110;
    const c=plateSpot(br, plan.target, ph);
    plate.style.left=c.x+'px'; plate.style.top=c.y+'px'; plate.style.visibility='';
    if(!ui.skip) sfx('open',{pitch:-7});
    await anim(plate,[{opacity:0,transform:'translate(-50%,-50%) scale(2.6) rotate(-4deg)'},{opacity:1,transform:'translate(-50%,-50%) scale(.94) rotate(0)',offset:.8},{opacity:1,transform:'translate(-50%,-50%) scale(1)'}],{duration:R?120:340,easing:'cubic-bezier(.7,0,.9,.6)',fill:'forwards'}).finished.catch(()=>{});
    // 叩きつけの衝撃（オーバーレイ側を揺らす。盤面そのものは動かさない）。強化版は揺れ・衝撃波が強い
    if(!ui.skip){ sfx('land',{pitch:-5,volume:1.3}); sfx(pw?'thunder':'jam',{volume:pw?0.8:0.7}); }
    if(!R){
      const k=pw?1.6:1;
      anim(ui.ov,[{transform:'translate(0,0)'},{transform:`translate(${-6*k}px,${4*k}px)`},{transform:`translate(${5*k}px,${-3*k}px)`},{transform:`translate(${-3*k}px,${2*k}px)`},{transform:'translate(0,0)'}],{duration:pw?380:280});
      const sw=el('div','stfx-boss-shock'+(pw?' pw2':'')); sw.style.left=c.x+'px'; sw.style.top=c.y+'px'; grp.appendChild(sw);
      anim(sw,[{opacity:.9,transform:'translate(-50%,-50%) scale(.2)'},{opacity:0,transform:`translate(-50%,-50%) scale(${pw?3:2.4})`}],{duration:600,easing:'ease-out',fill:'forwards'});
      for(let q=0;q<(pw?8:6);q++){
        const cr=el('div','stfx-boss-crack'+(pw?' pw2':'')); cr.style.left=c.x+'px'; cr.style.top=c.y+'px';
        const a=q*(360/(pw?8:6))+rnd(-15,15); cr.style.transform=`rotate(${a}deg)`; grp.appendChild(cr);
        anim(cr,[{opacity:1,width:'0px'},{opacity:.9,width:rnd(60,120)+'px',offset:.3},{opacity:0,width:rnd(90,140)+'px'}],{duration:900,easing:'ease-out',fill:'forwards'});
      }
    }
    try{ plan.run(grp, R); }catch(e){ console.error('StageFX.bossFlourish', e); }
    await w(hold);
    // 盤面に宿る：刻印がバッジへ吸い込まれる
    const badge=rectOf('.stfx-boss-badge');
    const t=badge?ctr(badge):{x:c.x,y:br.top};
    await anim(plate,[{opacity:1,transform:'translate(-50%,-50%) scale(1)'},{opacity:0,transform:`translate(calc(-50% + ${t.x-c.x}px),calc(-50% + ${t.y-c.y}px)) scale(.12)`}],{duration:R?100:420,easing:'cubic-bezier(.6,0,.8,.4)',fill:'forwards'}).finished.catch(()=>{});
    plate.remove();
    if(!ui.skip) sfx('close',{pitch:-3});
    ui.lit=true;
    const bdg=document.querySelector('.stfx-boss-badge');
    if(bdg){ bdg.classList.remove('pending'); anim(bdg,[{transform:'scale(1.35)',filter:'brightness(2)'},{transform:'scale(1)',filter:'brightness(1)'}],{duration:380,easing:'ease-out'}); }
  }

  // 効果ごとの差分：盤面・UIへ効果が宿る。{ target: 刻印を避ける矩形, run(grp,R): 演出 }
  function bossPlan(be){
    const pw=isPowered(be);
    const scene=(typeof GameMainScene!=='undefined')?GameMainScene:null;
    const bs=(typeof GameData!=='undefined')?GameData.BOARD_SIZE:4;
    const dur0=R=>R?200:900;
    let fx=null, R=false;
    const add=(cls,r,html)=>{ const e=el('div','stfx-bf '+cls+(pw?' pw2':''),html||''); e.style.left=r.left+'px'; e.style.top=r.top+'px'; e.style.width=r.width+'px'; e.style.height=r.height+'px'; fx.appendChild(e); return e; };
    const frame=(r,label,cls,delay)=>{ if(!r) return; const e=add('stfx-bf-frame '+(cls||''),{left:r.left-4,top:r.top-4,width:r.width+8,height:r.height+8},label?`<span>${label}</span>`:''); fitLabel(e); anim(e,[{opacity:0,transform:'scale(1.15)'},{opacity:1,transform:'scale(1)',offset:.35},{opacity:1}],{duration:dur0(R),delay:R?0:(delay||0),fill:'both',easing:'ease-out'}); return e; };
    const stampOn=(r,html,cls,delay)=>{ if(!r) return; const c=ctr(r); const e=el('div','stfx-bf stfx-bf-stamp '+(cls||'')+(pw?' pw2':''),html); e.style.left=c.x+'px'; e.style.top=c.y+'px'; fx.appendChild(e); anim(e,[{opacity:0,transform:'translate(-50%,-50%) scale(2.2) rotate(-12deg)'},{opacity:1,transform:'translate(-50%,-50%) scale(1) rotate(-6deg)',offset:.4},{opacity:1,transform:'translate(-50%,-50%) scale(1) rotate(-6deg)'}],{duration:dur0(R)*.6,delay:R?0:(delay||0),fill:'both',easing:'cubic-bezier(.6,0,.6,1.4)'}); return e; };
    const chains=(r,label)=>{ if(!r) return; const e=add('stfx-bf-chains',{left:r.left-6,top:r.top+r.height/2-9,width:r.width+12,height:18},''); e.innerHTML=Array.from({length:Math.max(4,Math.round((r.width+12)/16))},()=>'<i></i>').join(''); anim(e,[{clipPath:'inset(0 100% 0 0)'},{clipPath:'inset(0 0 0 0)'}],{duration:dur0(R)*.6,fill:'forwards',easing:'ease-out'}); if(label) frame(r,label,'thin'); stampOn(r,SVG.lock,'lock'); };
    // 枠のラベルが画面外にはみ出さないよう左右に寄せる（transform の拡大中でも offset 系で測る）
    const fitLabel=(e)=>{ const sp=e.querySelector('span'); if(!sp) return; const vw=document.documentElement.clientWidth||innerWidth;
      const fl=parseFloat(e.style.left)||0, fw=parseFloat(e.style.width)||0, w=sp.offsetWidth||0; const l=fl+fw/2-w/2;
      const dx=l<6?6-l:(l+w>vw-6?(vw-6)-(l+w):0); if(dx) sp.style.marginLeft=dx+'px';
      const ft=parseFloat(e.style.top)||0; if(ft-10-(sp.offsetHeight||20)<4 && !e.classList.contains('below')) e.classList.add('below'); };
    const P=(target, run)=>({ target, run:(g,r)=>{ fx=g; R=r; run(); } });
    const boardR=()=>rectOf('.board');
    switch(be.id){
      case 'block_cells':{
        // 実際に封鎖されたマス（GameMainScene.blockedCells）だけ
        const cells=scene?Array.from(scene.blockedCells||[]):[];
        return P(boardR(), ()=>{
          cells.forEach((ci,k)=>{ const r=cellRect(ci); if(!r) return; const e=add('stfx-bf-block',r,icon('cell_blocked')||SVG.lock); e.dataset.ci=ci; anim(e,[{opacity:0,transform:'scale(1.8)'},{opacity:1,transform:'scale(1)',offset:.5},{opacity:1}],{duration:R?120:420,delay:R?0:k*110,fill:'both',easing:'cubic-bezier(.6,0,.6,1.4)'}); });
          const b=boardR(); if(b) frame(b,`${esc(be.name)}<small>封鎖 ${cells.length}マス</small>`,'ghost');
        });
      }
      case 'cross_corner':{
        // 実際に×が置かれた四隅（board の owner:'npc' かつ Cross）だけに×が降る
        const corners=[0,bs-1,bs*(bs-1),bs*bs-1];
        const placed=scene?corners.filter(ci=>{ const c=(scene.board||[])[ci]; return c&&c.owner==='npc'&&c.symbol==='Cross'; }):[];
        return P(boardR(), ()=>{
          placed.forEach((ci,k)=>{
            const r=cellRect(ci); if(!r) return; const c=ctr(r);
            const e=el('div','stfx-bf stfx-bf-fall sym-Cross'+(pw?' pw2':''),symSvg('Cross')); e.dataset.ci=ci; e.style.left=c.x+'px'; e.style.top=c.y+'px'; fx.appendChild(e);
            anim(e,[{opacity:0,transform:`translate(-50%,calc(-50% - ${c.y+40}px)) rotate(-180deg)`},{opacity:1,transform:'translate(-50%,-50%) rotate(0) scale(1.3)',offset:.7},{opacity:1,transform:'translate(-50%,-50%) scale(1)'}],{duration:R?120:520,delay:R?0:k*120,fill:'both',easing:'cubic-bezier(.5,0,.8,.6)'});
            const rg=el('div','stfx-boss-shock small'); rg.style.left=c.x+'px'; rg.style.top=c.y+'px'; fx.appendChild(rg);
            anim(rg,[{opacity:0,transform:'translate(-50%,-50%) scale(.2)'},{opacity:.9,transform:'translate(-50%,-50%) scale(.3)',offset:.01},{opacity:0,transform:'translate(-50%,-50%) scale(1.2)'}],{duration:500,delay:R?0:k*120+360,fill:'both'});
          });
          const b=boardR(); if(b) frame(b,`${esc(be.name)}<small>× ${placed.length}マス</small>`,'ghost');
        });
      }
      case 'blackout': { const r=rectOf('.status-top-row .passive-bar'); return P(r, ()=>chains(r, esc(be.name))); }
      case 'no_relic': { const r=rectOf('.relic-display-row'); return P(r, ()=>chains(r, esc(be.name))); }
      case 'cross5000':{
        const v=bigNum(be);
        return P(boardR(), ()=>{ const b=boardR(); frame(b,`NPCの<b>×</b> = <b>${esc(v)}</b>`); if(b) stampOn({left:b.left,top:b.top,width:b.width,height:b.height},`<span class="x">${symSvg('Cross')}</span><b>${esc(v)}</b>`,'num big',260); });
      }
      case 'quad_only':{
        // プレイヤーは4列以上のみ／NPCは3列でもビンゴ可
        const q=Math.min(+firstNum(be)||4, bs);
        const base=Math.max(1, q-1);
        return P(boardR(), ()=>{
          const pr=unionRect(Array.from({length:q},(_,c)=>cellRect(c)));
          const nr=unionRect(Array.from({length:base},(_,c)=>cellRect((bs-1)*bs+c)));
          frame(pr,`あなた：<b>${q}</b>列以上でビンゴ`,'player');
          frame(nr,`NPC：<b>${base}</b>列でもビンゴ`,'npc below',300);
        });
      }
      case 'unify':{
        const d=toHalf(be.desc); const up=(d.match(/\+\s*(\d+)/)||[])[1]||''; const dn=(d.match(/-\s*(\d+)/)||[])[1]||'';
        // どの記号が上がったか（applyBossEffect が保存した元の値との差分から求める）
        let sym=null;
        try{ const rd=scene&&scene.unifyRestoreData; if(rd) sym=Object.keys(rd).find(s=>GameData.BINGO_MULTIPLIER_BASE[s]>rd[s])||null; }catch(e){}
        const r=rectOf('.mult-legend');
        return P(r, ()=>frame(r,`${esc(be.name)}：${sym?`<i class="sym">${symSvg(sym)}</i>`:''}<b>+${esc(up)}</b> ／ 他 <b>−${esc(dn)}</b>`));
      }
      case 'turn_limit':{
        const v=signedNum(be); const r=rectOf('.turn-count');
        return P(r, ()=>{ frame(r,esc(be.name)); stampOn(r,`<b>${esc(fmtMinus(v))}</b>`,'num',120); });
      }
      case 'reroll_limit':{
        const v=signedNum(be); const ban=!v; // 強化版「リロール禁止」は数値なし → 0回
        const r=rectOf('.board-reroll-btn')||rectOf('.controls-row button'); // v1.13 リロールボタンは盤面左上へ移動済み
        return P(r, ()=>{ frame(r,esc(be.name)); stampOn(r, ban?`<span class="ban"></span><b>0</b>`:`<b>${esc(fmtMinus(v))}</b>`, 'num'+(ban?' banned':''),120); });
      }
      case 'hand_limit':{
        const v=signedNum(be); const r=rectOf('.hand-row');
        return P(r, ()=>{ frame(r,`手札上限 <b>${esc(fmtMinus(v))}</b>`); });
      }
      case 'discard_used':{
        return P(boardR(), ()=>{ const b=boardR(); frame(b,`${esc(be.name)}：使用カードはデッキに戻らない`); stampOn(b,icon('btn_trash')||SVG.trash,'lock',200); });
      }
      case 'final':{
        const m=toHalf(be.desc).match(/[（(]([\d,、…・\s]+)ターン目[）)]/);
        const seq=m?m[1].replace(/[,、]\s*/g,'・'):'';
        const r=rectOf('.turn-indicator');
        return P(r, ()=>{ frame(r,esc(be.name)); stampOn(r,esc(seq||be.name),'num wide',120); });
      }
      default: return P(boardR(), ()=>frame(boardR(),esc(be.name)));
    }
  }
  function endBoss(immediate){
    const ui=bossUI; if(!ui) return Promise.resolve();
    bossUI=null;
    document.querySelectorAll('.stfx-boss-badge.pending').forEach(b=>b.classList.remove('pending'));
    if(immediate){ ui.ov.remove(); stopWatchIfIdle(); return Promise.resolve(); }
    const a=anim(ui.ov,[{opacity:1},{opacity:0}],{duration:reduced()?80:320,fill:'forwards'});
    return a.finished.catch(()=>{}).then(()=>{ ui.ov.remove(); stopWatchIfIdle(); });
  }

  // =====================================================================
  // 1. ステージクリア報酬の受け取り演出
  // =====================================================================
  let resultUI=null;
  // opts: { win, title, scoreText, reward(GameState.lastReward|null), goldBefore, goldAfter, btnLabel, onNext, formulaText, debugHtml,
  //         retreat({gold,num,ratio,livesBefore,livesLeft,maxLives}|null：一時撤退), gameOver(bool：残機0の敗北) }
  // 残機アイコン（i番目が on / breaking / off）
  function livesRowHtml(max, on, breakingIdx){
    let h='';
    for(let i=0;i<max;i++){
      const st=i===breakingIdx?'breaking':(i<on?'on':'off');
      h+=`<span class="stfx-rt-heart ${st}" data-i="${i}">${icon(st==='off'?'life_heart_empty':'life_heart')}</span>`;
    }
    return h;
  }
  // 残機が砕ける：揺れ→割れたハートへ差し替え→破片が飛び散る
  async function shatterHeart(ui, node, R, w){
    if(!node) return;
    if(!R) await anim(node,[{transform:'translateX(0) scale(1)'},{transform:'translateX(-4px) scale(1.15)'},{transform:'translateX(4px) scale(1.15)'},{transform:'translateX(-3px) scale(1.1)'},{transform:'translateX(0) scale(1.2)',filter:'brightness(2.2)'}],{duration:ui.skip?1:460,easing:'ease-in-out'}).finished.catch(()=>{});
    node.classList.remove('breaking'); node.classList.add('broken');
    if(!ui.skip) sfx('glitch',{volume:0.8});
    node.innerHTML=icon('life_heart_broken');
    if(!R && !ui.skip){
      const r=node.getBoundingClientRect(); const c=ctr(r);
      for(let i=0;i<9;i++){
        const sh=el('div','stfx-rt-shard'); sh.style.left=c.x+'px'; sh.style.top=c.y+'px'; ui.rl.appendChild(sh);
        const a=rnd(0,Math.PI*2), d=rnd(26,60);
        anim(sh,[{opacity:1,transform:'translate(-50%,-50%) rotate(0) scale(1)'},{opacity:0,transform:`translate(calc(-50% + ${Math.cos(a)*d}px),calc(-50% + ${Math.sin(a)*d+18}px)) rotate(${rnd(-200,200)}deg) scale(.5)`}],{duration:rnd(520,820),easing:'cubic-bezier(.2,.7,.4,1)',fill:'forwards'})
          .finished.catch(()=>{}).then(()=>sh.remove());
      }
      anim(node,[{transform:'scale(1.25)',opacity:1},{transform:'scale(1)',opacity:.75}],{duration:420,fill:'forwards',easing:'ease-out'});
    }
    await w(380);
  }
  function showResult(opts){
    if(resultUI && document.body.contains(resultUI.ov)){ resultUI.opts.onNext=opts.onNext; return; }
    const R=reduced();
    const rt=(!opts.win&&opts.retreat)?opts.retreat:null;
    const go=(!opts.win&&!rt);
    const ov=el('div','stfx-result'+(opts.win?' win':' lose')+(rt?' retreat':'')+(go?' gameover':'')+(R?' stfx-reduced':''));
    const box=el('div','stfx-res-box');
    const r=opts.reward;
    const b=r&&r.breakdown;
    const fmt=v=>Math.round(v*100)/100;
    let lines=[];
    const gf=opts.goldFx||null;            // G獲得レリック／レリック強化「G獲得」の内訳演出
    const rfx=(opts.relicFx||[]).filter(Boolean); // クリア時に発動した効果（倍率・カード変化）
    const hasGoldFx=!!(gf&&(gf.relic||gf.ren));
    const lineHtml=(l)=>{
      const g=l[3]&&gf?gf[l[3]]:null;
      if(!g) return `<div class="stfx-res-line ${l[2]||''}"><span>${l[0]}</span><b>${l[1]}</b></div>`;
      // 金貨はこの行のアイコンから飛び出し、値は +0 から加算される（最終値は data-final）
      return `<div class="stfx-res-line g-line ${l[3]}" data-g="${l[3]}" data-amt="${g.amount}" data-gname="${esc(g.name)}"><span><span class="stfx-res-gicons">${Array.from({length:Math.min(3,Math.max(1,g.count||1))},()=>`<i class="stfx-res-gico">${g.iconHtml}</i>`).join('')}</span>${l[0]}</span><b data-final="+${g.amount}">+0</b></div>`;
    };
    if(opts.win && b){
      // #8 新式：基本G×num ＋ 残りラウンド×1 ＋ 残りリロール×1/2 ＋ レリック効果 ＋ レリック強化効果
      const numNote=['基本2',b.floorBonus?'階層6以上+1':'',b.scoreBonus?'目標点数の2倍以上+1':''].filter(Boolean).join('・');
      lines=[
        [`基本G${b.base} × num${b.num}<small>（${numNote}）</small>`, `${b.base*b.num}`],
        ['残りラウンド ×1', `+${fmt(b.roundBonus)}`],
        ['小計（端数切り捨て）', `= ${b.subtotal}`, 'sub'],
        ['レリック効果', `+${b.relicBonus}`, b.relicBonus?'':'zero', gf&&gf.relic?'relic':null],
        ['レリック強化効果', `+${b.relicEnhanceBonus}`, b.relicEnhanceBonus?'':'zero', gf&&gf.ren?'ren':null],
      ];
    }
    const extras=(opts.win&&r&&r.extra)?String(r.extra).split('／').filter(Boolean):[];
    const hasGold=!!(opts.win&&r&&b);
    // 一時撤退：残機が1つ砕ける → 撤退G（10×num×達成率）を獲得 → 残り残機
    const pct=rt?Math.round((rt.ratio||0)*1000)/10:0;
    const rtHtml=rt?`
      <div class="stfx-rt">
        <div class="stfx-rt-sub">${icon('btn_retreat')}残機を1つ消費して一時撤退</div>
        <div class="stfx-rt-lives">${livesRowHtml(Math.max(rt.maxLives||2,rt.livesBefore||0), rt.livesLeft, rt.livesLeft)}</div>
        <div class="stfx-rt-left">残り残機 <b>${rt.livesLeft}</b><small> / ${rt.maxLives||2}</small></div>
      </div>
      <div class="stfx-res-wallet"><span class="stfx-coin static">G</span>所持G <b class="stfx-res-wallet-v">${opts.goldBefore}</b></div>
      <div class="stfx-res-panel stfx-rt-panel">
        <div class="gr-label">撤退G</div>
        <div class="stfx-res-lines">
          <div class="stfx-res-line"><span>基本G10 × num${rt.num}<small>（基本1${rt.num>1?'・階層6以上+1':''}）</small></span><b>${10*rt.num}</b></div>
          <div class="stfx-res-line"><span>× 達成率（点数 / 目標点数）</span><b>${pct}%</b></div>
          <div class="stfx-res-line sub"><span>端数切り捨て</span><b>= ${rt.gold}</b></div>
        </div>
        <div class="stfx-res-total">+<span class="stfx-res-total-v" data-final="${rt.gold}">0</span>G</div>
        <div class="stfx-res-formula">撤退G ＝ floor(10 × num × 現在の点数 / 目標点数)</div>
      </div>
      <div class="stfx-rt-note">ミニショップで体制を整え、同じステージに再挑戦できます</div>`:'';
    const goHtml=go?`
      <div class="stfx-rt stfx-go">
        <div class="stfx-rt-lives">${livesRowHtml(2,0,-1)}</div>
        <div class="stfx-rt-left">残機がありません</div>
        <div class="stfx-rt-note">発見した効果・レリックは図鑑に記録されました</div>
      </div>`:'';
    box.innerHTML=`
      <div class="stfx-res-rays"></div>
      <div class="stfx-res-title ${opts.win?'win':(rt?'lose retreat':'lose')}">${(opts.win?'STAGE CLEAR':(rt?'一時撤退':'GAME OVER')).split('').map(ch=>`<span>${ch===' '?'&nbsp;':ch}</span>`).join('')}</div>
      <div class="stfx-res-score">${opts.scoreText}</div>
      ${rtHtml}${goHtml}
      ${rfx.length?`<div class="stfx-res-relics"><div class="stfx-res-relics-h">発動した効果<small>タップで確認</small></div><div class="stfx-res-rchips">${rfx.map((f,i)=>`<button type="button" class="stfx-res-rchip${f.grade?' rg-'+f.grade:''}" data-i="${i}"><span class="stfx-res-rchip-ico">${f.iconHtml}</span>${esc(f.name)}</button>`).join('')}</div></div>`:''}
      ${hasGold?`<div class="stfx-res-wallet"><span class="stfx-coin static">G</span>所持G <b class="stfx-res-wallet-v">${opts.goldBefore}</b><span class="stfx-res-wallet-d"></span></div>
      <div class="stfx-res-panel">
        <div class="gr-label">獲得ゴールド</div>
        <div class="stfx-res-lines">${lines.map(lineHtml).join('')}</div>
        <div class="stfx-res-total">+<span class="stfx-res-total-v" data-final="${r.gold}">${hasGoldFx?b.subtotal:r.gold}</span>G</div>
        ${opts.formulaText?`<div class="stfx-res-formula">${opts.formulaText}</div>`:''}
      </div>`:''}
      ${extras.length?`<div class="stfx-res-extras"><div class="stfx-res-extras-h">追加報酬</div>${extras.map(x=>`<div class="stfx-res-extra">${x}</div>`).join('')}</div>`:''}
      ${opts.debugHtml||''}
      <button type="button" class="stfx-res-next" id="btn-next" disabled>${esc(opts.btnLabel)}</button>
      <div class="stfx-res-hint">タップでスキップ</div>`;
    ov.appendChild(box);
    document.body.appendChild(ov);
    // 報酬演出（z70）より上・パッシブ選択（z80）より下のレイヤー：レリック効果の表示と G獲得 の金貨
    const rl=el('div','stfx-relic-layer'+(R?' stfx-reduced':''));
    document.body.appendChild(rl);
    const ui=resultUI={ ov, box, opts, done:false, skip:false, rl, rfx };
    watch();
    box.querySelectorAll('.stfx-res-rchip').forEach(ch=>ch.addEventListener('click',(e)=>{
      if(!ui.done) return; // 演出中のタップはスキップ扱い（下の ov のハンドラへ）
      e.stopPropagation(); openRelicViewer(ui, parseInt(ch.dataset.i,10));
    }));
    const btn=box.querySelector('.stfx-res-next');
    btn.addEventListener('click',(e)=>{ e.stopPropagation(); if(!ui.done) return; const fn=ui.opts.onNext; if(fn) fn(); });
    const finish=()=>{
      if(ui.done) return; ui.done=true; ui.skip=true;
      ov.getAnimations({subtree:true}).forEach(a=>{ try{a.finish();}catch(e){} });
      ov.classList.add('st-done');
      // 演出中のレリック効果表示は畳んで「発動した効果」チップに残す（タップで再確認できる）
      rl.querySelectorAll('.stfx-rfx:not(.viewer),.stfx-rfx-tag,.stfx-coin').forEach(n=>n.remove());
      box.querySelectorAll('.stfx-res-rchip').forEach(c=>c.classList.add('on'));
      box.querySelectorAll('[data-final]').forEach(n=>{ n.textContent=n.dataset.final; });
      box.querySelectorAll('.g-line').forEach(n=>n.classList.add('lit'));
      const wv=box.querySelector('.stfx-res-wallet-v'); if(wv) wv.textContent=opts.goldAfter;
      // 一時撤退：砕ける途中でスキップされても、残機は割れた状態にそろえる
      box.querySelectorAll('.stfx-rt-heart.breaking').forEach(n=>{ n.classList.remove('breaking'); n.classList.add('broken'); n.innerHTML=icon('life_heart_broken'); });
      const wd=box.querySelector('.stfx-res-wallet-d'); if(wd && r && opts.goldBefore+r.gold!==opts.goldAfter){ wd.textContent=`（${opts.goldAfter-(opts.goldBefore+r.gold)}G 消費）`; }
      btn.disabled=false; btn.classList.add('ready');
      const hint=box.querySelector('.stfx-res-hint'); if(hint) hint.remove();
    };
    ui.finish=finish;
    ov.addEventListener('click',(e)=>{ if(e.target.closest('.stfx-res-next')) return; if(!ui.done){ ui.skip=true; if(ui.wake) ui.wake(); finish(); } });
    const w=ms=>ui.skip?Promise.resolve():new Promise(res=>{ const t=setTimeout(res,R?Math.min(ms,60):ms); ui.wake=()=>{ clearTimeout(t); res(); }; });
    (async()=>{
      try{
        anim(ov,[{backgroundColor:'rgba(6,7,12,0)'},{backgroundColor:'rgba(6,7,12,.84)'}],{duration:R?100:(opts.win?350:900),fill:'forwards'});
        anim(box,[{opacity:0,transform:'translateY(16px) scale(.96)'},{opacity:1,transform:'none'}],{duration:R?100:(opts.win?320:700),fill:'both',easing:'ease-out'});
        sfx(opts.win?'win':'lose',{fast:false,pitch:go?-3:0});
        if(rt){ await retreatSeq(ui, box, rt, R, w); finish(); return; }
        if(!opts.win){ await w(500); finish(); return; }
        // STAGE CLEAR の登場
        box.querySelectorAll('.stfx-res-title span').forEach((sp,i)=>anim(sp,[{opacity:0,transform:'translateY(-30px) scale(1.8)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:R?60:380,delay:R?0:120+i*45,fill:'both',easing:'cubic-bezier(.3,1.6,.5,1)'}));
        anim(box.querySelector('.stfx-res-rays'),[{opacity:0,transform:'translateX(-50%) rotate(0)'},{opacity:.85,transform:'translateX(-50%) rotate(60deg)',offset:.4},{opacity:.5,transform:'translateX(-50%) rotate(180deg)'}],{duration:R?100:4000,fill:'forwards'});
        await w(760);
        const sc=box.querySelector('.stfx-res-score'); anim(sc,[{opacity:0},{opacity:1}],{duration:220,fill:'both'});
        // クリア時に発動した効果を、報酬演出の上で1つずつ見せる（タップで次へ。見せ終わると「発動した効果」チップへ畳む）
        if(rfx.length){
          const rs=box.querySelector('.stfx-res-relics'); anim(rs,[{opacity:0},{opacity:1}],{duration:200,fill:'both'});
          for(let i=0;i<rfx.length;i++){ if(ui.skip) break; await relicPop(ui, i, R, w); }
        }
        if(!hasGold){ await w(300); finish(); return; }
        const wal=box.querySelector('.stfx-res-wallet'); anim(wal,[{opacity:0,transform:'translateY(-6px)'},{opacity:1,transform:'none'}],{duration:240,fill:'both'});
        const panel=box.querySelector('.stfx-res-panel'); anim(panel,[{opacity:0},{opacity:1}],{duration:200,fill:'both'});
        await w(260);
        // 内訳が1行ずつ
        const rows=box.querySelectorAll('.stfx-res-line');
        for(const row of rows){
          if(ui.skip) break;
          anim(row,[{opacity:0,transform:'translateX(-14px)'},{opacity:1,transform:'none'}],{duration:220,fill:'both',easing:'ease-out'});
          sfx('scoreTick',{pitch:4});
          await w(230);
          // G獲得：レリック（強化）アイコンから金貨が飛び出し、この行の値に加算される
          if(row.dataset.g && !ui.skip) await goldBurst(ui, row, R, w);
        }
        // 合計
        const tot=box.querySelector('.stfx-res-total');
        if(!ui.skip) sfx('scoreChip',{pitch:5});
        anim(tot,[{opacity:0,transform:'scale(2)'},{opacity:1,transform:'scale(.95)',offset:.7},{opacity:1,transform:'scale(1)'}],{duration:380,fill:'both',easing:'cubic-bezier(.6,0,.6,1.4)'});
        await w(450);
        // レリック効果ぶんの G を獲得G（合計）へ流し込む：小計 → 合計
        if(hasGoldFx && !ui.skip){
          const tv=box.querySelector('.stfx-res-total-v'); let cur=b.subtotal;
          for(const row of box.querySelectorAll('.g-line')){
            if(ui.skip) break;
            const amt=+row.dataset.amt||0; if(!amt) continue;
            const src=row.querySelector('b');
            flyCoins(ui, src, tv, Math.min(6,Math.max(2,amt*2)), R, row.dataset.g==='ren');
            await w(R?40:420);
            await countTo(ui, tv, cur, cur+amt, R?40:380); cur+=amt;
            anim(tot,[{transform:'scale(1.15)'},{transform:'scale(1)'}],{duration:240});
          }
          tv.textContent=r.gold;
        }
        // 金貨が所持Gへ流れ込み、Gがカウントアップ
        if(!ui.skip) await coinFlow(ui, tot, box.querySelector('.stfx-res-wallet-v'), opts.goldBefore, opts.goldBefore+r.gold, R);
        // 大爆発などで消費があった場合
        const spent=(opts.goldBefore+r.gold)-opts.goldAfter;
        if(!ui.skip && spent>0){
          const wd=box.querySelector('.stfx-res-wallet-d'); wd.textContent=`−${spent}G`; wd.classList.add('spend');
          anim(wd,[{opacity:0,transform:'translateY(-8px)'},{opacity:1,transform:'none'}],{duration:260,fill:'both'});
          await countTo(ui, box.querySelector('.stfx-res-wallet-v'), opts.goldBefore+r.gold, opts.goldAfter, 500);
        }
        // 追加報酬の告知
        const ex=box.querySelector('.stfx-res-extras');
        if(ex && !ui.skip){
          anim(ex,[{opacity:0,transform:'scale(.9)'},{opacity:1,transform:'scale(1)'}],{duration:260,fill:'both'});
          for(const x of ex.querySelectorAll('.stfx-res-extra')){
            if(ui.skip) break;
            sfx('reveal');
            anim(x,[{opacity:0,transform:'translateX(30px)',filter:'brightness(2.4)'},{opacity:1,transform:'none',filter:'brightness(1)'}],{duration:380,fill:'both',easing:'cubic-bezier(.3,1.4,.5,1)'});
            await w(420);
          }
        }
        await w(150);
      }catch(e){ console.error('StageFX.showResult', e); }
      finish();
    })();
  }
  // 一時撤退の演出シーケンス
  async function retreatSeq(ui, box, rt, R, w){
    try{
      box.querySelectorAll('.stfx-res-title span').forEach((sp,i)=>anim(sp,[{opacity:0,transform:'translateY(-18px)'},{opacity:1,transform:'none'}],{duration:R?60:420,delay:R?0:200+i*110,fill:'both',easing:'ease-out'}));
      await w(760);
      const sc=box.querySelector('.stfx-res-score'); anim(sc,[{opacity:0},{opacity:1}],{duration:220,fill:'both'});
      const blk=box.querySelector('.stfx-rt'); anim(blk,[{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'none'}],{duration:260,fill:'both'});
      await w(520);
      if(!ui.skip) await shatterHeart(ui, box.querySelector('.stfx-rt-heart.breaking'), R, w);
      const left=box.querySelector('.stfx-rt-left'); anim(left,[{opacity:0},{opacity:1}],{duration:240,fill:'both'});
      await w(300);
      const wal=box.querySelector('.stfx-res-wallet'); anim(wal,[{opacity:0,transform:'translateY(-6px)'},{opacity:1,transform:'none'}],{duration:240,fill:'both'});
      const panel=box.querySelector('.stfx-rt-panel'); anim(panel,[{opacity:0},{opacity:1}],{duration:200,fill:'both'});
      await w(240);
      for(const row of box.querySelectorAll('.stfx-rt-panel .stfx-res-line')){
        if(ui.skip) break;
        anim(row,[{opacity:0,transform:'translateX(-14px)'},{opacity:1,transform:'none'}],{duration:220,fill:'both',easing:'ease-out'});
        sfx('scoreTick',{pitch:4});
        await w(240);
      }
      const tot=box.querySelector('.stfx-rt-panel .stfx-res-total'); const tv=box.querySelector('.stfx-rt-panel .stfx-res-total-v');
      anim(tot,[{opacity:0,transform:'scale(2)'},{opacity:1,transform:'scale(.95)',offset:.7},{opacity:1,transform:'scale(1)'}],{duration:380,fill:'both',easing:'cubic-bezier(.6,0,.6,1.4)'});
      await countTo(ui, tv, 0, rt.gold, R?40:420);
      await w(200);
      if(!ui.skip && rt.gold>0) await coinFlow(ui, tot, box.querySelector('.stfx-res-wallet-v'), ui.opts.goldBefore, ui.opts.goldAfter, R);
      const note=box.querySelector('.stfx-rt-note'); if(note) anim(note,[{opacity:0},{opacity:1}],{duration:260,fill:'both'});
      await w(200);
    }catch(e){ console.error('StageFX.retreat', e); }
  }
  function countTo(ui, node, from, to, ms, fmt){
    const F=fmt||(v=>v);
    return new Promise(res=>{
      if(!node){ res(); return; }
      const t0=performance.now();
      const step=()=>{
        if(ui.skip){ node.textContent=F(to); res(); return; }
        const p=Math.min(1,(performance.now()-t0)/ms); const e=1-Math.pow(1-p,3);
        node.textContent=F(Math.round(from+(to-from)*e));
        if(p<1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
  }
  async function coinFlow(ui, fromNode, toNode, a, b, R){
    if(!fromNode||!toNode) return;
    const fr=fromNode.getBoundingClientRect(), tr=toNode.getBoundingClientRect();
    const n=R?0:Math.max(3,Math.min(14,b-a));
    const fc=ctr(fr), tc=ctr(tr);
    for(let i=0;i<n;i++){
      const c=el('div','stfx-coin fly','G'); c.style.left=(fc.x+rnd(-24,24))+'px'; c.style.top=fc.y+'px'; ui.ov.appendChild(c);
      const dx=tc.x-parseFloat(c.style.left), dy=tc.y-fc.y;
      const an=anim(c,[{opacity:0,transform:'translate(-50%,-50%) scale(.6)'},{opacity:1,transform:`translate(calc(-50% + ${dx*.3}px),calc(-50% + ${dy*.5-50}px)) scale(1.1)`,offset:.4},{opacity:1,transform:`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(.7)`}],{duration:620,delay:i*55,easing:'cubic-bezier(.4,0,.6,1)',fill:'both'});
      an.finished.catch(()=>{}).then(()=>c.remove());
    }
    if(!ui.skip) for(let i=0;i<Math.min(6,n);i++) sfx('coin',{delay:0.3+i*0.07,minGap:0,pitch:i});
    const wal=toNode.closest('.stfx-res-wallet');
    setTimeout(()=>{ if(wal&&!ui.skip) wal.classList.add('pulse'); }, R?0:420);
    await (R?Promise.resolve():new Promise(r=>setTimeout(r,R?0:380)));
    await countTo(ui, toNode, a, b, R?50:Math.min(1100, 300+n*60));
    if(wal) wal.classList.remove('pulse');
  }
  // ---- 1a. レリック効果（報酬演出の上のレイヤー stfx-relic-layer / z78） ----
  function rfxCard(f, viewer){
    return el('div','stfx-rfx k-'+(f.kind||'info')+(viewer?' viewer':''),
      `<div class="stfx-rfx-head"><span class="stfx-rfx-ico${f.grade?' rg-'+f.grade:''}">${f.iconHtml||''}</span><span class="stfx-rfx-ttl"><small>${esc(f.head||'レリック効果が発動')}</small><b>${esc(f.name)}</b></span></div>
       <div class="stfx-rfx-body">${f.bodyHtml||''}</div><div class="stfx-rfx-hint">${viewer?'タップで閉じる':'タップで次へ'}</div>`);
  }
  async function relicPop(ui, i, R, w){
    const f=ui.rfx[i]; if(!f) return;
    const card=rfxCard(f,false); ui.rl.appendChild(card);
    const chip=ui.box.querySelector(`.stfx-res-rchip[data-i="${i}"]`);
    card.addEventListener('click',(e)=>{ e.stopPropagation(); if(ui.wake) ui.wake(); });
    sfx('relic'); sfx(f.kind==='card'?'cardFlip':'upgrade',{delay:0.12});
    // 登場：アイコンが弾け、カードが展開
    if(!R){
      const ico=card.querySelector('.stfx-rfx-ico');
      anim(ico,[{transform:'scale(.3) rotate(-30deg)',filter:'brightness(3)'},{transform:'scale(1.35) rotate(6deg)',filter:'brightness(1.8)',offset:.6},{transform:'scale(1)',filter:'brightness(1)'}],{duration:520,fill:'both',easing:'ease-out'});
    }
    await anim(card,[{opacity:0,transform:'translate(-50%,-50%) scale(.6)'},{opacity:1,transform:'translate(-50%,-50%) scale(1.04)',offset:.7},{opacity:1,transform:'translate(-50%,-50%) scale(1)'}],{duration:R?80:340,fill:'both',easing:'ease-out'}).finished.catch(()=>{});
    // 変化（倍率表・カードの横回転）を確認できるよう保持
    await w(f.kind==='card'?2600:2000);
    if(!card.isConnected) return;
    // 「発動した効果」チップへ畳む
    const cr=chip?chip.getBoundingClientRect():null, kr=card.getBoundingClientRect();
    const dx=cr?(cr.left+cr.width/2)-(kr.left+kr.width/2):0, dy=cr?(cr.top+cr.height/2)-(kr.top+kr.height/2):0;
    await anim(card,[{opacity:1,transform:'translate(-50%,-50%) scale(1)'},{opacity:0,transform:`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(.15)`}],{duration:(R||ui.skip)?60:360,fill:'forwards',easing:'cubic-bezier(.5,0,.8,.5)'}).finished.catch(()=>{});
    card.remove();
    if(chip){ chip.classList.add('on'); anim(chip,[{transform:'scale(1.3)',filter:'brightness(2)'},{transform:'scale(1)',filter:'brightness(1)'}],{duration:R?60:320}); }
  }
  function openRelicViewer(ui, i){
    const f=ui.rfx[i]; if(!f) return;
    closeRelicViewer(ui);
    ui.rl.classList.add('viewing');
    const card=rfxCard(f,true); ui.rl.appendChild(card);
    sfx('open');
    // カード変化は再生し直して変化後を見せる
    anim(card,[{opacity:0,transform:'translate(-50%,-50%) scale(.85)'},{opacity:1,transform:'translate(-50%,-50%) scale(1)'}],{duration:reduced()?60:220,fill:'both',easing:'ease-out'});
    ui.rl.onclick=(e)=>{ e.stopPropagation(); sfx('close'); closeRelicViewer(ui); };
  }
  function closeRelicViewer(ui){
    if(!ui||!ui.rl) return;
    ui.rl.querySelectorAll('.stfx-rfx.viewer').forEach(n=>n.remove());
    ui.rl.classList.remove('viewing'); ui.rl.onclick=null;
  }
  // 金貨を a 要素から b 要素へ飛ばす（報酬演出の上のレイヤー）
  function flyCoins(ui, from, to, n, R, small){
    if(!from||!to||R) return;
    if(!ui.skip) for(let i=0;i<Math.min(4,n);i++) sfx('coin',{delay:0.25+i*0.06,minGap:0,pitch:i+(small?3:0),volume:small?0.7:1});
    const fc=ctr(from.getBoundingClientRect()), tc=ctr(to.getBoundingClientRect());
    for(let i=0;i<n;i++){
      const c=el('div','stfx-coin fly'+(small?' small':''),'G'); const sx=fc.x+rnd(-8,8);
      c.style.left=sx+'px'; c.style.top=fc.y+'px'; ui.rl.appendChild(c);
      const dx=tc.x-sx, dy=tc.y-fc.y;
      anim(c,[{opacity:0,transform:'translate(-50%,-50%) scale(.5)'},{opacity:1,transform:`translate(calc(-50% + ${dx*.35+rnd(-18,18)}px),calc(-50% + ${dy*.35-rnd(26,44)}px)) scale(1.15)`,offset:.45},{opacity:1,transform:`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(.7)`}],{duration:560,delay:i*60,easing:'cubic-bezier(.4,0,.6,1)',fill:'both'})
        .finished.catch(()=>{}).then(()=>c.remove());
    }
  }
  // G獲得（レリック）／G獲得（レリック強化）：アイコンから金貨が飛び出し、内訳行の値が +0 → +n
  async function goldBurst(ui, row, R, w){
    const amt=+row.dataset.amt||0; if(!amt) return;
    const small=row.dataset.g==='ren';
    const icons=row.querySelector('.stfx-res-gicons'); const val=row.querySelector('b');
    row.classList.add('lit');
    sfx('relic');
    if(icons) anim(icons,[{transform:'scale(1)',filter:'brightness(1)'},{transform:'scale(1.7) translateY(-3px)',filter:'brightness(2.2)',offset:.35},{transform:'scale(1)',filter:'brightness(1)'}],{duration:R?60:620,easing:'ease-out'});
    const rr=row.getBoundingClientRect();
    const tag=el('div','stfx-rfx-tag'+(small?' small':''),`<span class="stfx-rfx-tag-ico">${row.querySelector('.stfx-res-gico')?row.querySelector('.stfx-res-gico').innerHTML:''}</span>レリック${small?'強化':''}効果が発動：${esc(row.dataset.gname)} <b>+${amt}G</b>`);
    tag.style.left=Math.max(110,Math.min(innerWidth-110,rr.left+rr.width/2))+'px'; tag.style.top=(rr.top-4)+'px';
    ui.rl.appendChild(tag);
    anim(tag,[{opacity:0,transform:'translate(-50%,-60%) scale(.7)'},{opacity:1,transform:'translate(-50%,-100%) scale(1)',offset:.18},{opacity:1,transform:'translate(-50%,-110%) scale(1)',offset:.85},{opacity:0,transform:'translate(-50%,-130%) scale(1)'}],{duration:R?300:1500,fill:'forwards'}).finished.catch(()=>{}).then(()=>tag.remove());
    flyCoins(ui, icons||row, val, small?Math.min(4,1+amt):Math.min(9,amt*2+1), R, small);
    await w(R?40:380);
    await countTo(ui, val, 0, amt, R?40:(small?260:420), v=>'+'+v);
    await w(small?180:280);
  }
  function hideResult(){
    if(!resultUI) return; resultUI.ov.remove(); if(resultUI.rl) resultUI.rl.remove(); resultUI=null; stopWatchIfIdle();
  }

  // =====================================================================
  // 1b. パッシブ報酬：神々しい降臨演出
  // =====================================================================
  let pvUI=null;
  // opts: { picks(array identity), items:[{sym,tier,symHtml,name,desc,live}], remaining, onChoose(idx), onSkip() }
  function showPassiveChoice(opts){
    if(pvUI && pvUI.picks===opts.picks && document.body.contains(pvUI.ov)){ pvUI.opts=opts; return; }
    const R=reduced();
    const repeat=!!(pvUI && document.body.contains(pvUI.ov));
    let ov;
    if(repeat){ ov=pvUI.ov; ov.querySelector('.stfx-pv-content').remove(); ov.classList.remove('st-choosing','st-fly','st-ready'); ov.style.opacity=''; }
    else{
      ov=el('div','stfx-pv'+(R?' stfx-reduced':''));
      ov.innerHTML=`<div class="stfx-pv-bg"></div><div class="stfx-pv-halo"></div><div class="stfx-pv-pillar main"></div><div class="stfx-pv-pillar l"></div><div class="stfx-pv-pillar r"></div><div class="stfx-pv-motes"></div>`;
      const motes=ov.querySelector('.stfx-pv-motes');
      if(!R) for(let i=0;i<34;i++){ const m=el('i'); m.style.left=rnd(0,100)+'%'; m.style.animationDelay=(-rnd(0,6))+'s'; m.style.animationDuration=rnd(4,8)+'s'; const sz=rnd(2,5); m.style.width=m.style.height=sz+'px'; m.style.opacity=rnd(.4,1); motes.appendChild(m); }
      document.body.appendChild(ov);
    }
    const content=el('div','stfx-pv-content');
    content.innerHTML=`<div class="stfx-pv-head"><div class="stfx-pv-title">記号パッシブを授かる</div><div class="stfx-pv-sub">1つ選んでください${(opts.remaining||1)>1?`<span class="stfx-pv-remain">魔力ステージD：あと${opts.remaining}回</span>`:''}</div></div>
      <div class="stfx-pv-list">${opts.items.map((it,i)=>`
        <button type="button" class="stfx-pv-card" data-idx="${i}">
          <span class="stfx-pv-emblem sym-${esc(it.sym)}"><span class="stfx-pv-emblem-ring"></span><span class="stfx-pv-sym">${it.symHtml}</span><span class="stfx-pv-lv">Lv${esc(it.tier)}</span></span>
          <span class="stfx-pv-text"><b>${esc(it.name)}</b><span class="stfx-pv-desc">${(it.desc)}</span><span class="stfx-pv-live">${(it.live)}</span></span>
        </button>`).join('')}</div>
      <button type="button" class="stfx-pv-skip">スキップ</button>
      <div class="stfx-pv-hint">タップでスキップ</div>`;
    ov.appendChild(content);
    const ui=pvUI={ ov, picks:opts.picks, opts, busy:true, skip:false, sym:null };
    if(resultUI) anim(resultUI.ov,[{opacity:getComputedStyle(resultUI.ov).opacity},{opacity:1}],{duration:200,fill:'forwards'});
    watch();
    const cards=Array.from(content.querySelectorAll('.stfx-pv-card'));
    const skipBtn=content.querySelector('.stfx-pv-skip');
    const settle=()=>{
      if(!ui.busy || ui.choosing) return; ui.skip=true;
      ov.getAnimations({subtree:true}).forEach(a=>{ if(a.effect&&a.effect.getTiming&&a.effect.getTiming().iterations===Infinity) return; try{a.finish();}catch(e){} });
      ui.busy=false; ov.classList.add('st-ready'); const h=content.querySelector('.stfx-pv-hint'); if(h) h.remove();
    };
    ov.onclick=(e)=>{ if(ui!==pvUI) return; if(ui.busy && !ui.choosing){ e.stopPropagation(); settle(); } };
    cards.forEach(cd=>cd.addEventListener('click',(e)=>{
      e.stopPropagation();
      if(ui!==pvUI || ui.choosing) return;
      if(ui.busy){ settle(); return; }
      choose(ui, parseInt(cd.dataset.idx,10));
    }));
    skipBtn.addEventListener('click',(e)=>{
      e.stopPropagation(); if(ui!==pvUI || ui.choosing) return;
      if(ui.busy){ settle(); return; }
      confirmSkip(()=>{
      if(ui!==pvUI || ui.choosing) return;
      ui.choosing=true;
      anim(content,[{opacity:1,transform:'none'},{opacity:0,transform:'translateY(-30px)'}],{duration:R?80:320,fill:'forwards'}).finished.catch(()=>{}).then(()=>{ const fn=ui.opts.onSkip; if(fn) fn(); });
      });
    });
    // 降臨
    (async()=>{
      const D=R?0:1;
      const pil=ov.querySelector('.stfx-pv-pillar.main');
      sfx('holy',{fast:false});
      // 2回目以降（魔力ステージD）は、選択時に薄めた背景・光の柱・後光を短く灯し直す
      const k=repeat?.45:1;
      ['.stfx-pv-bg','.stfx-pv-pillar','.stfx-pv-halo','.stfx-pv-motes'].forEach(sel=>ov.querySelectorAll(sel).forEach(n=>n.getAnimations().forEach(a=>{ if(!(a.effect&&a.effect.getTiming&&a.effect.getTiming().iterations===Infinity)) a.cancel(); })));
      anim(ov.querySelector('.stfx-pv-bg'),[{opacity:repeat?.25:0},{opacity:1}],{duration:R?80:600*k,fill:'forwards'});
      anim(ov.querySelector('.stfx-pv-motes'),[{opacity:0},{opacity:1}],{duration:R?80:600*k,fill:'forwards'});
      anim(pil,[{opacity:0,transform:'translateX(-50%) scaleX(0)'},{opacity:1,transform:'translateX(-50%) scaleX(1.6)',offset:.4},{opacity:.85,transform:'translateX(-50%) scaleX(1)'}],{duration:R?80:900*k,fill:'forwards',easing:'ease-out'});
      ov.querySelectorAll('.stfx-pv-pillar.l,.stfx-pv-pillar.r').forEach((p,i)=>anim(p,[{opacity:0},{opacity:.5}],{duration:R?80:900*k,delay:R?0:(300+i*120)*k,fill:'both'}));
      anim(ov.querySelector('.stfx-pv-halo'),[{opacity:0,transform:'translate(-50%,-50%) scale(.4)'},{opacity:1,transform:'translate(-50%,-50%) scale(1)'}],{duration:R?80:1100*k,delay:R?0:250*k,fill:'both',easing:'ease-out'});
      const head=content.querySelector('.stfx-pv-head');
      anim(head,[{opacity:0,transform:'translateY(-14px)',letterSpacing:'.5em'},{opacity:1,transform:'none',letterSpacing:'.12em'}],{duration:R?80:700,delay:R?0:(repeat?0:350),fill:'both',easing:'ease-out'});
      const base=R?0:(repeat?250:800);
      cards.forEach((cd,i)=>{
        anim(cd,[{opacity:0,transform:'translateY(-70vh) scale(.7)',filter:'blur(6px) brightness(3)'},{opacity:1,transform:'translateY(6px) scale(1.02)',filter:'blur(0) brightness(1.8)',offset:.8},{opacity:1,transform:'none',filter:'blur(0) brightness(1)'}],{duration:R?80:760,delay:base+i*D*200,fill:'both',easing:'cubic-bezier(.2,.7,.3,1)'});
        const fl=el('div','stfx-pv-landflash'); cd.appendChild(fl);
        sfx('cardFlip',{delay:(base+i*D*200+(R?0:600))/1000,minGap:0,pitch:i*2});
        anim(fl,[{opacity:0},{opacity:.9,offset:.1},{opacity:0}],{duration:R?60:600,delay:base+i*D*200+(R?0:600),fill:'both'});
      });
      anim(skipBtn,[{opacity:0},{opacity:1}],{duration:R?60:300,delay:base+cards.length*D*200+(R?0:500),fill:'both'});
      await sleep(base+cards.length*D*200+(R?60:900));
      if(ui===pvUI && ui.busy && !ui.choosing) settle();
    })();
  }
  async function choose(ui, idx){
    ui.choosing=true;
    const R=reduced();
    const ov=ui.ov; const content=ov.querySelector('.stfx-pv-content');
    const cards=Array.from(content.querySelectorAll('.stfx-pv-card'));
    const it=ui.opts.items[idx]; const cd=cards[idx];
    ov.classList.add('st-choosing'); cd.classList.add('chosen');
    sfx('passive',{fast:false});
    cards.forEach((c,i)=>{ if(i!==idx) anim(c,[{opacity:1,transform:'none'},{opacity:0,transform:'translateY(-40px) scale(.9)',filter:'blur(3px)'}],{duration:R?60:420,fill:'forwards',easing:'ease-in'}); });
    anim(content.querySelector('.stfx-pv-skip'),[{opacity:1},{opacity:0}],{duration:200,fill:'forwards'});
    anim(content.querySelector('.stfx-pv-head'),[{opacity:1},{opacity:.0}],{duration:R?60:500,fill:'forwards'});
    const em=cd.querySelector('.stfx-pv-emblem'); const er=em.getBoundingClientRect(); const ec=ctr(er);
    try{
      if(!R){
        // 光が収束
        for(let k=0;k<16;k++){
          const a=k/16*Math.PI*2, d=rnd(90,150);
          const p=el('div','stfx-pv-spark'); p.style.left=ec.x+'px'; p.style.top=ec.y+'px'; ov.appendChild(p);
          anim(p,[{opacity:0,transform:`translate(calc(-50% + ${Math.cos(a)*d}px),calc(-50% + ${Math.sin(a)*d}px)) scale(1.4)`},{opacity:1,offset:.3},{opacity:.9,transform:'translate(-50%,-50%) scale(.3)'}],{duration:620,delay:k*18,easing:'cubic-bezier(.5,0,.9,.6)',fill:'both'}).finished.catch(()=>{}).then(()=>p.remove());
        }
        anim(em,[{filter:'brightness(1)',transform:'scale(1)'},{filter:'brightness(2.6)',transform:'scale(1.2)'}],{duration:700,fill:'forwards',easing:'ease-in'});
        await sleep(720);
      }
      // 光の球となってパッシブバーへ
      const target=document.querySelector(`.status-top-row .passive-icon.sym-${it.sym}`)||document.querySelector('.status-top-row .passive-bar');
      const tr=target?target.getBoundingClientRect():null; const tc=tr?ctr(tr):{x:innerWidth/2,y:40};
      ov.classList.add('st-fly');
      anim(ov.querySelector('.stfx-pv-bg'),[{opacity:1},{opacity:.25}],{duration:R?60:420,fill:'forwards'});
      ['.stfx-pv-halo','.stfx-pv-pillar.main','.stfx-pv-pillar.l','.stfx-pv-pillar.r','.stfx-pv-motes'].forEach(sel=>{ const n=ov.querySelector(sel); if(n) anim(n,[{opacity:getComputedStyle(n).opacity},{opacity:0}],{duration:R?60:420,fill:'forwards'}); });
      anim(cd,[{opacity:1},{opacity:0}],{duration:R?60:300,fill:'forwards'});
      if(resultUI) anim(resultUI.ov,[{opacity:1},{opacity:.15}],{duration:R?60:420,fill:'forwards'});
      const orb=el('div','stfx-pv-orb sym-'+it.sym,`<span>${it.symHtml}</span>`); orb.style.left=ec.x+'px'; orb.style.top=ec.y+'px'; ov.appendChild(orb);
      const dx=tc.x-ec.x, dy=tc.y-ec.y;
      await anim(orb,[{opacity:1,transform:'translate(-50%,-50%) scale(1.3)'},{opacity:1,transform:`translate(calc(-50% + ${dx*.25+60}px),calc(-50% + ${dy*.55}px)) scale(1)`,offset:.45},{opacity:1,transform:`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(.45)`}],{duration:R?80:820,easing:'cubic-bezier(.45,0,.4,1)',fill:'forwards'}).finished.catch(()=>{});
      orb.remove();
      // 着弾：パッシブバーのレベルを先行表示して光らせる
      const land=document.querySelector(`.status-top-row .passive-icon.sym-${it.sym}`);
      if(land){ land.classList.add('active','stfx-pv-land'); const t=land.querySelector('.passive-tier'); if(t) t.textContent='Lv'+it.tier; }
      sfx('levelUp',{fast:false});
      const burst=el('div','stfx-pv-burst'); burst.style.left=tc.x+'px'; burst.style.top=tc.y+'px'; ov.appendChild(burst);
      anim(burst,[{opacity:1,transform:'translate(-50%,-50%) scale(.2)'},{opacity:0,transform:'translate(-50%,-50%) scale(2.2)'}],{duration:R?60:600,fill:'forwards',easing:'ease-out'});
      const tag=el('div','stfx-pv-gain',`${esc(it.name)} 習得`); tag.style.left=Math.max(70,Math.min(innerWidth-70,tc.x))+'px'; tag.style.top=(tc.y+26)+'px'; ov.appendChild(tag);
      anim(tag,[{opacity:0,transform:'translate(-50%,-6px)'},{opacity:1,transform:'translate(-50%,0)',offset:.25},{opacity:1,offset:.8},{opacity:0}],{duration:R?200:1100,fill:'forwards'});
      await sleep(R?200:700);
    }catch(e){ console.error('StageFX.choose', e); }
    if(ui!==pvUI) return;
    const fn=ui.opts.onChoose; if(fn) fn(idx);
  }
  function hidePassive(){
    if(!pvUI) return;
    pvUI.ov.remove(); pvUI=null;
    if(resultUI){ resultUI.ov.getAnimations().forEach(a=>{ try{a.cancel();}catch(e){} }); resultUI.ov.style.opacity=''; }
    stopWatchIfIdle();
  }

  // ---------- 片付け ----------
  function clearAll(){
    hidePassive(); hideResult(); endBoss(true);
    if(layerEl){ layerEl.innerHTML=''; }
    if(watchTimer){ clearInterval(watchTimer); watchTimer=null; }
  }
  function isResultOpen(){ return !!resultUI; }
  function isPassiveOpen(){ return !!pvUI; }

  return { snapshot, placement, bossList, bossBadge, bossIntro, showResult, hideResult, showPassiveChoice, hidePassive, clearAll, isResultOpen, isPassiveOpen,
    // 検証用
    _DRAW_KEYS:()=>Object.keys(DRAW) };
})();
