// ビンゴ時の点数計算演出（吹き出し）
// - document.body 直下の position:fixed 永続要素。renderAll() で作り直されないので、ゲーム画面のレイアウトは一切動かない
// - 盤面・ビンゴ倍率表・パッシブ・レリック・現在の点数に重ならない空き領域を実測して配置し、しっぽでビンゴ列を指す
// - 数値はすべてイージング付きのカウントアップ。速度は getSpeed()（早送り時8倍）に従う
// - 同時ビンゴ時は ScoreFX.create() で吹き出しを複数同時に出す（各インスタンスがDOM・タイマーを個別に持つ）。
//   後から出る吹き出しは先に出ている吹き出しと極力重ならない位置に置き、完全に覆い隠す位置には絶対に置かない
const ScoreFXProto = {
  root:null, bubble:null, body:null, tail:null, fx:null,
  el:{}, opts:null, _anchorCells:null, _raf:{}, _visible:false,
  reduced:false,

  // ---------- 基本 ----------
  speed(){ return (this.opts&&this.opts.getSpeed)?(this.opts.getSpeed()||1):1; },
  dur(ms){ return Math.max(16, Math.round(ms/this.speed())); },
  wait(ms){ return new Promise(res=>setTimeout(res,this.dur(ms))); },
  target(){ return (this.opts&&this.opts.targetScore)||1; },

  ensure(){
    if(this.root&&document.body.contains(this.root)) return;
    this.reduced=!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const root=document.createElement('div'); root.className='sfx-root';
    root.innerHTML=
      `<div class="sfx-bubble" role="status" aria-live="polite">
         <div class="sfx-tail"><div class="sfx-tail-in"></div></div>
         <div class="sfx-body">
           <div class="sfx-flash"></div>
           <div class="sfx-head">
             <div class="sfx-title"><span class="sfx-sym"></span><span class="sfx-title-text"></span></div>
             <button type="button" class="sfx-ff"></button>
           </div>
           <div class="sfx-caption"><span class="sfx-cap"></span></div>
           <div class="sfx-stage">
             <div class="sfx-pair">
               <div class="sfx-box sfx-a"><div class="sfx-flames"></div><div class="sfx-lbl"></div><div class="sfx-num">0</div></div>
               <div class="sfx-op">×</div>
               <div class="sfx-box sfx-b"><div class="sfx-lbl"></div><div class="sfx-num">0</div></div>
             </div>
             <div class="sfx-banner">目標達成！</div>
           </div>
           <div class="sfx-trace"></div>
         </div>
       </div>`;
    const fx=document.createElement('div'); fx.className='sfx-fx';
    document.body.appendChild(root); document.body.appendChild(fx);
    this.root=root; this.fx=fx;
    this.bubble=root.querySelector('.sfx-bubble'); this.body=root.querySelector('.sfx-body'); this.tail=root.querySelector('.sfx-tail');
    const q=s=>root.querySelector(s);
    this.el={ sym:q('.sfx-sym'), title:q('.sfx-title-text'), ff:q('.sfx-ff'), cap:q('.sfx-cap'), caption:q('.sfx-caption'),
      pair:q('.sfx-pair'), a:q('.sfx-a'), aLbl:q('.sfx-a .sfx-lbl'), aNum:q('.sfx-a .sfx-num'), flames:q('.sfx-flames'),
      op:q('.sfx-op'), b:q('.sfx-b'), bLbl:q('.sfx-b .sfx-lbl'), bNum:q('.sfx-b .sfx-num'),
      banner:q('.sfx-banner'), trace:q('.sfx-trace'), flash:q('.sfx-flash') };
    this.el.ff.addEventListener('click',(e)=>{ e.stopPropagation(); if(this.opts&&this.opts.onToggleFF) this.opts.onToggleFF(); this.updateFF(); });
    this._onResize=()=>{ if(this._visible) this.place(this._anchorCells); };
    window.addEventListener('resize',this._onResize);
    window.addEventListener('orientationchange',this._onResize);
    document.addEventListener('scroll',this._onResize,{passive:true,capture:true}); // body がスクロールコンテナの場合も拾う
  },
  // インスタンスの後片付け（DOM・リスナー・rAF をすべて破棄）
  destroy(){
    this._visible=false;
    Object.keys(this._raf).forEach(k=>cancelAnimationFrame(this._raf[k])); this._raf={};
    if(this._onResize){
      window.removeEventListener('resize',this._onResize);
      window.removeEventListener('orientationchange',this._onResize);
      document.removeEventListener('scroll',this._onResize,{capture:true});
      this._onResize=null;
    }
    if(this.root) this.root.remove();
    const fx=this.fx; if(fx) setTimeout(()=>fx.remove(),1600); // 飛散中のパーティクルは自然に消えるまで残す
    this.root=null; this.fx=null;
  },

  updateFF(){
    const on=this.speed()>1;
    this.el.ff.classList.toggle('active',on);
    this.el.ff.innerHTML=GameIcons.svg('btn_fast_forward',{cls:'gi-gap'})+(on?'早送り中':'早送り');
  },

  // ---------- 開閉 ----------
  // opts: { title, symLabel, symClass, cells:[盤面idx], targetScore, getSpeed, onToggleFF }
  open(opts){
    this.ensure(); this.opts=opts; this._anchorCells=opts.cells||[];
    const E=this.el;
    E.sym.innerHTML=opts.symLabel||''; /* 記号はインラインSVG（GameData.SYMBOL_LABEL。ゲーム内定数のみ） */ E.sym.className='sfx-sym '+(opts.symClass||'');
    E.title.textContent=opts.title||'';
    E.cap.textContent=''; E.caption.className='sfx-caption';
    E.trace.innerHTML=''; E.banner.classList.remove('show');
    [E.aNum,E.bNum,E.a,E.b,E.op].forEach(x=>{ if(x.getAnimations) x.getAnimations().forEach(an=>an.cancel()); });
    this.bubble.classList.remove('celebrate','negative','compact');
    this.setBox('a',{label:'基礎点',kind:'chips',value:0});
    this.setBox('b',{label:'倍率',kind:'mult',value:0,mult:true});
    E.op.textContent='×'; E.pair.classList.remove('solo');
    this.setHeat(0);
    this.updateFF();
    this.root.classList.add('measure');
    this.place(this._anchorCells);
    this.root.classList.remove('measure');
    this._visible=true;
    this.root.classList.remove('hide'); this.root.classList.add('show');
    this.anim(this.body,[{transform:'scale(.6) translateY(12px)',opacity:0},{transform:'scale(1.04)',opacity:1,offset:.7},{transform:'scale(1)',opacity:1}],{duration:this.dur(260),easing:'cubic-bezier(.34,1.56,.64,1)'});
    return this.wait(180);
  },
  async close(){
    if(!this.root) return;
    this._visible=false;
    this.root.classList.add('hide');
    await this.wait(220);
    this.root.classList.remove('show','hide');
    Object.keys(this._raf).forEach(k=>cancelAnimationFrame(this._raf[k])); this._raf={};
  },

  // ---------- 配置：空き領域を実測 ----------
  obstacleRects(){
    const list=[['.board',16],['.mult-legend',6],['.passive-bar',6],['.relic-display-row',6],['.score-combined-stat',4],['.board-ff-btn',4]];
    const out=[];
    list.forEach(([sel,m])=>document.querySelectorAll(sel).forEach(e=>{
      const r=e.getBoundingClientRect(); if(r.width<=0||r.height<=0) return;
      out.push({l:r.left-m,t:r.top-m,r:r.right+m,b:r.bottom+m,m,sel});
    }));
    return out;
  },
  // 同時に表示中の他の吹き出し（重なりを極力避ける対象）
  peerRects(){
    const out=[];
    if(typeof ScoreFX==='undefined'||!ScoreFX.instances) return out;
    ScoreFX.instances.forEach(o=>{
      if(o===this||!o._visible||!o.bubble||!o._rect) return;
      out.push(o._rect);
    });
    return out;
  },
  anchorPoint(cells){
    const rs=(cells||[]).map(i=>document.querySelector(`.board .cell[data-ci="${i}"]`)).filter(Boolean).map(e=>e.getBoundingClientRect());
    if(rs.length===0){ const bd=document.querySelector('.board'); if(!bd) return {x:innerWidth/2,y:innerHeight/2}; const r=bd.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2,box:r}; }
    const l=Math.min(...rs.map(r=>r.left)), t=Math.min(...rs.map(r=>r.top)), r=Math.max(...rs.map(r=>r.right)), b=Math.max(...rs.map(r=>r.bottom));
    return {x:(l+r)/2,y:(t+b)/2,box:{left:l,top:t,right:r,bottom:b}};
  },
  place(cells){
    if(!this.bubble) return;
    const vw=document.documentElement.clientWidth||innerWidth, vh=innerHeight;
    const G=6, EDGE=8, cols=Math.ceil(vw/G), rows=Math.ceil(vh/G);
    // occ: 余白込みの占有（吹き出し本体用）、raw: 余白なしの占有（しっぽが他要素に掛からないかの判定用）
    const W=cols+1;
    const build=(useMargin,rects)=>{
      const occ=new Uint8Array(cols*rows);
      (rects||this.obstacleRects()).forEach(o=>{
        const m=useMargin?0:o.m;
        const c0=Math.max(0,Math.floor((o.l+m)/G)), c1=Math.min(cols-1,Math.ceil((o.r-m)/G)-1);
        const r0=Math.max(0,Math.floor((o.t+m)/G)), r1=Math.min(rows-1,Math.ceil((o.b-m)/G)-1);
        for(let y=r0;y<=r1;y++) for(let x=c0;x<=c1;x++) occ[y*cols+x]=1;
      });
      // 2次元累積和
      const P=new Int32Array(W*(rows+1));
      for(let y=0;y<rows;y++){ let run=0; for(let x=0;x<cols;x++){ run+=occ[y*cols+x]; P[(y+1)*W+x+1]=P[y*W+x+1]+run; } }
      return (x0,y0,x1,y1)=>{ x0=Math.max(0,Math.min(cols,x0)); x1=Math.max(0,Math.min(cols,x1)); y0=Math.max(0,Math.min(rows,y0)); y1=Math.max(0,Math.min(rows,y1)); if(x1<=x0||y1<=y0) return 0; return P[y1*W+x1]-P[y0*W+x1]-P[y1*W+x0]+P[y0*W+x0]; };
    };
    const sum=build(true), rawSum=build(false);
    // 他の吹き出し：重なりはUI要素より重く数える。さらに「ほぼ完全に覆う」位置（x・y両方のずれが40%未満）は禁止
    const peers=this.peerRects();
    const PM=4;
    const peerSum=peers.length?build(true,peers.map(r=>({l:r.left-PM,t:r.top-PM,r:r.right+PM,b:r.bottom+PM,m:PM}))):null;
    const coversPeer=(x,y,bw,bh)=>peers.some(r=>{
      const pw=r.right-r.left, ph=r.bottom-r.top;
      return Math.abs(x-r.left)<0.4*Math.min(bw,pw)&&Math.abs(y-r.top)<0.4*Math.min(bh,ph);
    });
    const ap=this.anchorPoint(cells);
    // しっぽが盤面まで見通せる位置か：吹き出しの縁から盤面の縁までの帯に、盤面以外の要素（レリック列など）が無いこと
    const bd=document.querySelector('.board'); const bR=bd?bd.getBoundingClientRect():null;
    const tailOk=(x,y,bw,bh)=>{
      if(!bR) return true;
      let tx0,ty0,tx1,ty1;
      if(ap.y<y){ const px=Math.max(x+22,Math.min(x+bw-22,ap.x)); tx0=px-10; tx1=px+10; ty0=bR.bottom+2; ty1=y; }
      else if(ap.y>y+bh){ const px=Math.max(x+22,Math.min(x+bw-22,ap.x)); tx0=px-10; tx1=px+10; ty0=y+bh; ty1=bR.top-2; }
      else if(ap.x<x){ const py=Math.max(y+22,Math.min(y+bh-22,ap.y)); ty0=py-10; ty1=py+10; tx0=bR.right+2; tx1=x; }
      else { const py=Math.max(y+22,Math.min(y+bh-22,ap.y)); ty0=py-10; ty1=py+10; tx0=x+bw; tx1=bR.left-2; }
      if(tx1<=tx0||ty1<=ty0) return true;
      return rawSum(Math.ceil(tx0/G),Math.ceil(ty0/G),Math.floor(tx1/G),Math.floor(ty1/G))===0;
    };
    const bub=this.bubble;
    const maxW=Math.min(420,vw-EDGE*2);
    const widths=[...new Set([maxW,Math.min(360,maxW),Math.min(310,maxW),Math.min(270,maxW)])];
    const configs=[];
    [1,.9,.8,.72].forEach(s=>[false,true].forEach(compact=>widths.forEach(w=>configs.push({s,compact,w}))));
    let best=null;
    bub.style.transform='none';
    for(const cf of configs){
      bub.classList.toggle('compact',cf.compact);
      bub.style.width=cf.w+'px';
      const h=bub.offsetHeight;
      const bw=cf.w*cf.s, bh=h*cf.s;
      if(bw>vw-EDGE*2+1||bh>vh-EDGE*2+1) continue;
      const cw=Math.ceil(bw/G), ch=Math.ceil(bh/G);
      let local=null;
      for(let gy=Math.ceil(EDGE/G); gy+ch<=Math.floor((vh-EDGE)/G); gy++){
        for(let gx=Math.ceil(EDGE/G); gx+cw<=Math.floor((vw-EDGE)/G); gx++){
          const x=gx*G, y=gy*G;
          if(peers.length&&coversPeer(x,y,bw,bh)) continue;
          const ov=sum(gx,gy,gx+cw,gy+ch)+(peerSum?peerSum(gx,gy,gx+cw,gy+ch)*3:0);
          const nx=Math.max(x,Math.min(ap.x,x+bw)), ny=Math.max(y,Math.min(ap.y,y+bh));
          let dist=Math.hypot(ap.x-nx,ap.y-ny)+Math.abs(x+bw/2-ap.x)*.15;
          if(ov===0&&!tailOk(x,y,bw,bh)) dist+=400;
          const score=ov*1e6+dist;
          if(!local||score<local.score) local={score,ov,x,y,bw,bh,cf,h};
        }
      }
      if(local&&(!best||local.score<best.score)) best=local;
      if(best&&best.ov===0) break;
    }
    if(!best){ // 画面が極端に小さい場合の保険：画面下部（他の吹き出しがあれば高さの半分ずつずらす）
      const w=Math.min(420,vw-EDGE*2); bub.classList.add('compact'); bub.style.width=w+'px';
      const h=bub.offsetHeight; const y0=Math.max(EDGE,vh-h-EDGE-peers.length*Math.ceil(h*0.5));
      best={x:(vw-w)/2,y:y0,bw:w,bh:h,cf:{s:1,compact:true,w},h};
    }
    // 空き領域内で中央寄せ（x方向はアンカー寄り）
    let x=best.x, y=best.y;
    bub.classList.toggle('compact',best.cf.compact);
    bub.style.width=best.cf.w+'px';
    bub.style.left=Math.round(x)+'px'; bub.style.top=Math.round(y)+'px';
    bub.style.transform=best.cf.s===1?'none':`scale(${best.cf.s})`;
    this._scale=best.cf.s;
    this._rect={left:x,top:y,right:x+best.bw,bottom:y+best.bh};
    this.placeTail(ap,{left:x,top:y,right:x+best.bw,bottom:y+best.bh},best.cf.s);
  },
  placeTail(ap,rect,s){
    const t=this.tail; const box=ap.box;
    let side;
    if(ap.y<rect.top) side='top'; else if(ap.y>rect.bottom) side='bottom'; else if(ap.x<rect.left) side='left'; else side='right';
    let gap=0;
    if(box){
      if(side==='top') gap=rect.top-box.bottom; else if(side==='bottom') gap=box.top-rect.bottom;
      else if(side==='left') gap=rect.left-box.right; else gap=box.left-rect.right;
    }else gap=16;
    const len=Math.max(0,Math.min(18,gap-3));
    t.className='sfx-tail side-'+side+(len<6?' none':'');
    const L=len/s;
    t.style.setProperty('--tl',L+'px');
    const bw=(rect.right-rect.left)/s, bh=(rect.bottom-rect.top)/s;
    if(side==='top'||side==='bottom'){
      const px=Math.max(22,Math.min(bw-22,(ap.x-rect.left)/s));
      t.style.left=px+'px'; t.style.top=side==='top'?(-L+1)+'px':(bh-1)+'px';
    }else{
      const py=Math.max(22,Math.min(bh-22,(ap.y-rect.top)/s));
      t.style.top=py+'px'; t.style.left=side==='left'?(-L+1)+'px':(bw-1)+'px';
    }
  },

  // ---------- 表示部品 ----------
  fmtVal(v,mult){
    if(mult){ const r=Math.round(v*100)/100; return '×'+r.toLocaleString('ja-JP',{maximumFractionDigits:2}); }
    return (typeof GlobalFunctions!=='undefined')?GlobalFunctions.formatScore(v):String(Math.floor(v));
  },
  setBox(k,{label,kind,value,mult,prefix}){
    const box=this.el[k], lbl=this.el[k+'Lbl'], num=this.el[k+'Num'];
    if(label!=null) lbl.textContent=label;
    if(kind) box.className='sfx-box sfx-'+k+' kind-'+kind;
    box._mult=!!mult; box._prefix=prefix||'';
    if(value!=null){ box._v=value; this.writeNum(k,value); }
  },
  writeNum(k,v,force){
    const box=this.el[k], num=this.el[k+'Num'];
    if(k==='a'&&box.classList.contains('kind-score')&&!this.bubble.classList.contains('negative')){ const h=this.heatOf(v); if(h!==this._heat){ this.setHeat(h); force=true; } }
    const txt=(box._prefix&&v>=0?box._prefix:'')+this.fmtVal(v,box._mult);
    if(force||num.textContent!==txt){
      num.textContent=txt;
      // 桁数に合わせて文字サイズを調整（大きいほど大きく、ただし枠に収める）
      const avail=box.clientWidth-10;
      const base=(k==='a'&&box.classList.contains('kind-score'))?this.heatFont():(this.bubble.classList.contains('compact')?22:26);
      const fit=avail>0?avail/(txt.length*0.62):base;
      const hFit=box.clientHeight>0?(box.clientHeight-15)/1.12:base; // ラベルと重ならない高さに収める
      num.style.fontSize=Math.max(12,Math.min(base,fit,hFit))+'px';
    }
  },
  heatFont(){ return [26,29,32,35,38,40][this._heat||0]; },
  setHeat(h){
    this._heat=h;
    this.bubble&&this.bubble.style.setProperty('--heat',h);
    if(this.el.a) this.el.a.dataset.heat=h;
  },
  heatOf(v){
    const r=v/this.target();
    if(v<=0) return 0; if(r<0.1) return 0; if(r<0.3) return 1; if(r<0.6) return 2; if(r<1) return 3; if(r<3) return 4; return 5;
  },
  // イージング付きのローリングカウンター
  tweenTo(k,to,ms=380){
    const box=this.el[k]; const from=box._v||0;
    cancelAnimationFrame(this._raf[k]);
    const d=this.dur(ms), t0=performance.now();
    return new Promise(res=>{
      if(from===to||d<=20){ box._v=to; this.writeNum(k,to); return res(); }
      let lastSpark=0, done=false;
      const finish=()=>{ if(done) return; done=true; cancelAnimationFrame(this._raf[k]); box._v=to; this.writeNum(k,to); res(); };
      const step=(now)=>{
        if(done) return;
        const t=Math.min(1,(now-t0)/d); const e=1-Math.pow(1-t,3);
        const v=from+(to-from)*e; box._v=v; this.writeNum(k,v);
        if(k==='a'&&box.classList.contains('kind-score')&&this._heat>=2&&now-lastSpark>70){ lastSpark=now; this.sparks(box,1+Math.floor(this._heat/2),false); }
        if(t<1) this._raf[k]=requestAnimationFrame(step); else finish();
      };
      this._raf[k]=requestAnimationFrame(step);
      setTimeout(finish,d+120); // タブ非表示などで rAF が止まっても演出が止まらないようにする
    });
  },
  caption(text,cls){
    const c=this.el.caption; this.el.cap.textContent=text||'';
    c.className='sfx-caption'+(cls?' '+cls:'');
    this.anim(this.el.cap,[{transform:'translateY(6px)',opacity:0},{transform:'none',opacity:1}],{duration:this.dur(160),easing:'ease-out'});
  },
  trace(html,cls){
    const s=document.createElement('span'); s.className='sfx-t'+(cls?' '+cls:''); s.innerHTML=html;
    const tr=this.el.trace; tr.appendChild(s);
    // 2行に収まらない分は先頭から省略
    let guard=0;
    while(tr.scrollHeight>tr.clientHeight+1&&tr.children.length>1&&guard++<40){
      const first=tr.firstElementChild;
      if(first.classList.contains('ell')){ first.nextElementSibling&&first.nextElementSibling.remove(); }
      else { first.remove(); const e=document.createElement('span'); e.className='sfx-t ell'; e.textContent='…'; tr.insertBefore(e,tr.firstChild); }
    }
  },
  // 直前のトレース項目の末尾に文字を付け足す（閉じ括弧など）
  traceAppend(text){ const last=this.el.trace.lastElementChild; if(last) last.textContent+=text; else this.trace(text); },
  bump(k,strength=1){
    const box=this.el[k];
    this.anim(box,[{transform:'scale(1)'},{transform:`scale(${1+0.12*strength})`},{transform:'scale(1)'}],{duration:this.dur(220),easing:'ease-out'});
  },
  shake(strength=1){
    if(this.reduced) return;
    const a=4*strength;
    this.anim(this.body,[{transform:'translate(0,0)'},{transform:`translate(${-a}px,${a*.5}px) rotate(-1deg)`},{transform:`translate(${a}px,${-a*.4}px) rotate(1deg)`},{transform:`translate(${-a*.6}px,${-a*.3}px)`},{transform:`translate(${a*.4}px,${a*.2}px)`},{transform:'translate(0,0)'}],{duration:this.dur(320),easing:'ease-out'});
  },
  flash(color){
    const f=this.el.flash; f.style.background=color||'rgba(255,255,255,.55)';
    this.anim(f,[{opacity:this.reduced?.25:.75},{opacity:0}],{duration:this.dur(this.reduced?140:280),easing:'ease-out'});
  },
  anim(el,kf,o){ try{ if(el&&el.animate) return el.animate(kf,o); }catch(e){} return null; },

  // 小さな「+30」チップを from（要素 or 矩形）から箱kへ飛ばし、到着時に値を更新
  async chip(k,text,to,{from,cls,ms=380,strength=1}={}){
    const box=this.el[k];
    const tr=box.getBoundingClientRect();
    let fr=null;
    if(from&&from.getBoundingClientRect){ const r=from.getBoundingClientRect(); if(r.width>0&&r.bottom>0&&r.top<innerHeight) fr=r; }
    else if(from&&from.left!=null) fr=from;
    if(!fr) fr=this.el.caption.getBoundingClientRect();
    const c=document.createElement('div'); c.className='sfx-chip '+(cls||''); c.textContent=text;
    this.fx.appendChild(c);
    const cw=c.offsetWidth, chh=c.offsetHeight;
    const sx=fr.left+fr.width/2-cw/2, sy=fr.top+fr.height/2-chh/2;
    const ex=tr.left+tr.width/2-cw/2, ey=tr.top+tr.height/2-chh/2;
    c.style.left=sx+'px'; c.style.top=sy+'px';
    const fly=this.dur(ms*0.55);
    const a=this.anim(c,[
      {transform:'translate(0,0) scale(.4)',opacity:0},
      {transform:'translate(0,-10px) scale(1.25)',opacity:1,offset:.25},
      {transform:`translate(${ex-sx}px,${ey-sy}px) scale(.7)`,opacity:.9}
    ],{duration:fly,easing:'cubic-bezier(.5,0,.75,1)',fill:'forwards'});
    await new Promise(res=>setTimeout(res,fly));
    c.remove();
    this.bump(k,strength);
    if(!this.reduced&&strength>=1) this.sparks(box,3+strength*2,true);
    await this.tweenTo(k,to,ms*0.45);
  },

  // 火花パーティクル
  sparks(target,n,burst){
    if(this.reduced||!this.fx) return;
    const r=(target.getBoundingClientRect?target.getBoundingClientRect():target);
    n=Math.min(n,14);
    for(let i=0;i<n;i++){
      const p=document.createElement('div'); p.className='sfx-spark h'+(this._heat||0);
      const x=r.left+Math.random()*r.width, y=burst?(r.top+r.height/2):(r.top+r.height*(.3+Math.random()*.5));
      p.style.left=x+'px'; p.style.top=y+'px';
      this.fx.appendChild(p);
      const ang=burst?(Math.random()*Math.PI*2):(-Math.PI/2+(Math.random()-.5)*1.4);
      const dist=(burst?30:22)+Math.random()*(burst?40:34);
      const d=420+Math.random()*380;
      const a=this.anim(p,[{transform:'translate(0,0) scale(1)',opacity:1},{transform:`translate(${Math.cos(ang)*dist}px,${Math.sin(ang)*dist}px) scale(.2)`,opacity:0}],{duration:d,easing:'cubic-bezier(.2,.7,.4,1)',fill:'forwards'});
      setTimeout(()=>p.remove(),d+30);
    }
  },
  confetti(target,n=36){
    if(this.reduced||!this.fx) return;
    const r=target.getBoundingClientRect?target.getBoundingClientRect():target;
    const colors=['#fbbf24','#f472b6','#7dd3fc','#4ade80','#fff','#f87171'];
    for(let i=0;i<n;i++){
      const p=document.createElement('div'); p.className='sfx-confetti';
      p.style.background=colors[i%colors.length];
      p.style.left=(r.left+r.width/2)+'px'; p.style.top=(r.top+r.height/2)+'px';
      this.fx.appendChild(p);
      const ang=Math.random()*Math.PI*2, dist=60+Math.random()*120, d=900+Math.random()*600;
      this.anim(p,[{transform:'translate(0,0) rotate(0)',opacity:1},{transform:`translate(${Math.cos(ang)*dist}px,${Math.sin(ang)*dist*0.7+60}px) rotate(${Math.random()*720}deg)`,opacity:0}],{duration:d,easing:'cubic-bezier(.15,.8,.35,1)',fill:'forwards'});
      setTimeout(()=>p.remove(),d+30);
    }
  },

  // ---------- 複合演出 ----------
  // A(×/+)B を衝突させて A に統合する。 op: '×' | '+'
  async merge(to,{op='×',label,kind='score',strength=1,ms=560}={}){
    const E=this.el;
    const a=E.a.getBoundingClientRect(), b=E.b.getBoundingClientRect();
    const dx=(a.left+a.width/2)-(b.left+b.width/2);
    this.anim(E.b,[{transform:'translateX(0) scale(1)',opacity:1},{transform:`translateX(${dx*0.6}px) scale(.5)`,opacity:0}],{duration:this.dur(ms*0.35),easing:'cubic-bezier(.6,0,.9,.6)',fill:'forwards'});
    this.anim(E.op,[{transform:'scale(1)'},{transform:'scale(1.8) rotate(90deg)',opacity:0}],{duration:this.dur(ms*0.35),fill:'forwards'});
    await new Promise(r=>setTimeout(r,this.dur(ms*0.33)));
    E.pair.classList.add('solo');
    if(E.b.getAnimations) E.b.getAnimations().forEach(x=>x.cancel());
    if(E.op.getAnimations) E.op.getAnimations().forEach(x=>x.cancel());
    const wasScore=E.a.classList.contains('kind-score');
    this.setBox('a',{label:label||'得点',kind});
    if(!wasScore) this.el.a._v=this.el.a._v||0;
    if(strength>0){
      this.flash(op==='×'?'rgba(255,90,60,.55)':'rgba(120,220,255,.45)');
      this.shake(strength);
      this.anim(E.a,[{transform:'scale(1.25)'},{transform:'scale(.94)'},{transform:'scale(1)'}],{duration:this.dur(300),easing:'cubic-bezier(.34,1.56,.64,1)'});
      this.sparks(E.a,6+strength*3,true);
    }else this.bump('a',.5);
    await this.tweenTo('a',to,ms*0.65);
  },
  // 右側に修飾ボックス（列補正・最終乗算補正・最終加算補正）を出す
  showB({label,value,mult,kind='mod',op='×',prefix}){
    const E=this.el;
    E.op.textContent=op;
    this.setBox('b',{label,kind,value,mult,prefix});
    E.pair.classList.remove('solo');
    this.anim(E.b,[{transform:'scale(.3)',opacity:0},{transform:'scale(1.1)',opacity:1,offset:.7},{transform:'scale(1)',opacity:1}],{duration:this.dur(240),easing:'ease-out'});
    this.anim(E.op,[{transform:'scale(0)'},{transform:'scale(1)'}],{duration:this.dur(200)});
  },
  // 最終の加算点数を叩きつける
  async slam(value,label){
    const E=this.el;
    E.pair.classList.add('solo');
    this.setBox('a',{label,kind:'score',prefix:'+'});
    const neg=value<0;
    this.bubble.classList.toggle('negative',neg);
    this.setHeat(neg?0:this.heatOf(value));
    E.a._v=value; this.writeNum('a',value);
    this.anim(E.aNum,[{transform:'scale(2.6)',opacity:0,filter:'blur(4px)'},{transform:'scale(.9)',opacity:1,filter:'blur(0)',offset:.6},{transform:'scale(1.06)'},{transform:'scale(1)'}],{duration:this.dur(360),easing:'cubic-bezier(.2,.9,.3,1.2)'});
    await new Promise(r=>setTimeout(r,this.dur(200)));
    this.flash(neg?'rgba(255,80,80,.5)':'rgba(255,230,140,.7)');
    this.shake(neg?1:Math.min(3,1+Math.floor((this._heat||0)/2)));
    if(!neg) this.sparks(E.a,14,true);
  },
  // 加算点数が現在の点数へ吸い込まれる
  async flyTo(targetEl){
    const E=this.el; if(!targetEl) return;
    const s=E.aNum.getBoundingClientRect(), t=targetEl.getBoundingClientRect();
    const c=document.createElement('div'); c.className='sfx-flyer'+(this.bubble.classList.contains('negative')?' negative':'');
    c.textContent=E.aNum.textContent; c.style.fontSize=getComputedStyle(E.aNum).fontSize;
    c.style.left=s.left+'px'; c.style.top=s.top+'px';
    this.fx.appendChild(c);
    const dx=(t.left+Math.min(t.width,160)/2)-(s.left+s.width/2), dy=(t.top+t.height/2)-(s.top+s.height/2);
    const d=this.dur(360);
    this.anim(E.aNum,[{opacity:1},{opacity:.25}],{duration:d,fill:'forwards'});
    this.anim(c,[{transform:'translate(0,0) scale(1)',opacity:1},{transform:`translate(${dx*0.5}px,${dy*0.5-30}px) scale(.8)`,opacity:1,offset:.5},{transform:`translate(${dx}px,${dy}px) scale(.3)`,opacity:.2}],{duration:d,easing:'cubic-bezier(.55,0,.85,.45)',fill:'forwards'});
    await new Promise(r=>setTimeout(r,d));
    c.remove();
    if(E.aNum.getAnimations) E.aNum.getAnimations().forEach(x=>x.cancel());
    this.sparks(targetEl,10,true);
  },
  celebrate(scoreEl){
    this.bubble.classList.add('celebrate');
    const bn=this.el.banner; bn.classList.add('show');
    this.anim(this.el.aNum,[{opacity:1},{opacity:.12}],{duration:this.dur(200),fill:'forwards'});
    this.anim(bn,[{transform:'translate(-50%,-50%) scale(3) rotate(-8deg)',opacity:0},{transform:'translate(-50%,-50%) scale(.9) rotate(-4deg)',opacity:1,offset:.6},{transform:'translate(-50%,-50%) scale(1) rotate(-4deg)',opacity:1}],{duration:this.dur(420),easing:'cubic-bezier(.2,.9,.3,1.3)'});
    this.flash('rgba(255,215,90,.8)'); this.shake(2);
    this.confetti(this.bubble,40);
    if(scoreEl) this.confetti(scoreEl,24);
  }
};

// ---------- インスタンス管理 ＋ 同時ビンゴのフィナーレ ----------
const ScoreFX = {
  instances:new Set(),
  // 新しい吹き出しインスタンスを作る（_raf・el などの状態はインスタンスごとに独立）
  create(){
    const o=Object.create(ScoreFXProto);
    o.root=null; o.bubble=null; o.body=null; o.tail=null; o.fx=null;
    o.el={}; o.opts=null; o._anchorCells=null; o._raf={}; o._visible=false; o._rect=null; o._heat=0; o._scale=1;
    this.instances.add(o);
    return o;
  },
  release(o){ if(!o) return; try{ o.destroy(); }catch(e){} this.instances.delete(o); },
  updateFF(){ this.instances.forEach(o=>{ if(o.root&&o.el&&o.el.ff) o.updateFF(); }); },
  reduced(){ return !!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches); },

  // 全ての点数計算が出揃った後の締め：今回の配置で得た合計点数を大きく叩きつける
  // opts: { total, count, getSpeed, scoreEl, shakeEl }
  finale(opts){
    const speed=()=>(opts.getSpeed&&opts.getSpeed())||1;
    const dur=(ms)=>Math.max(16,Math.round(ms/speed()));
    const reduced=this.reduced();
    const neg=opts.total<0;
    const fmt=(v)=>(v>=0?'+':'')+((typeof GlobalFunctions!=='undefined')?GlobalFunctions.formatScore(Math.abs(v)):String(Math.abs(v))).replace(/^/,v<0?'-':'');
    const tier=neg?0:(opts.total>=((opts.targetScore||1))?3:(opts.total>=(opts.targetScore||1)*0.3?2:1));
    const ov=document.createElement('div');
    ov.className='sfx-finale'+(neg?' negative':'')+' tier'+tier;
    ov.innerHTML=
      `<div class="sfx-fin-dim"></div>
       <div class="sfx-fin-flash"></div>
       <div class="sfx-fin-rays"></div>
       <div class="sfx-fin-core">
         <div class="sfx-fin-count"><span class="sfx-fin-n">${opts.count}</span> BINGO!</div>
         <div class="sfx-fin-num">+0</div>
         <div class="sfx-fin-sub">${neg?'合計加算点数…':'合計加算点数'}</div>
       </div>`;
    document.body.appendChild(ov);
    const q=s=>ov.querySelector(s);
    const core=q('.sfx-fin-core'), num=q('.sfx-fin-num'), cnt=q('.sfx-fin-count'), rays=q('.sfx-fin-rays'), flash=q('.sfx-fin-flash'), dim=q('.sfx-fin-dim');
    const A=(el,kf,o)=>{ try{ return el&&el.animate?el.animate(kf,o):null; }catch(e){ return null; } };
    let skipped=false, rafId=0;
    return new Promise(resolve=>{
      let done=false;
      const timers=[];
      const later=(fn,ms)=>timers.push(setTimeout(fn,ms));
      const finish=()=>{
        if(done) return; done=true;
        timers.forEach(clearTimeout); cancelAnimationFrame(rafId);
        num.textContent=fmt(opts.total);
        const a=A(ov,[{opacity:1},{opacity:0}],{duration:dur(220),fill:'forwards'});
        setTimeout(()=>{ ov.remove(); resolve(); },dur(220));
      };
      // タップで即座に締める（早送り）
      ov.addEventListener('pointerdown',(e)=>{ e.stopPropagation(); e.preventDefault(); if(!skipped){ skipped=true; finish(); } });
      // 登場
      A(dim,[{opacity:0},{opacity:1}],{duration:dur(160),fill:'forwards'});
      A(flash,[{opacity:reduced?.25:(neg?.45:.9)},{opacity:0}],{duration:dur(reduced?160:380),easing:'ease-out',fill:'forwards'});
      A(cnt,[{transform:'scale(2.4) rotate(-6deg)',opacity:0},{transform:'scale(.92) rotate(-3deg)',opacity:1,offset:.6},{transform:'scale(1) rotate(-3deg)',opacity:1}],{duration:dur(360),easing:'cubic-bezier(.2,.9,.3,1.3)',fill:'forwards'});
      A(num,[{transform:'scale(.2)',opacity:0,filter:'blur(6px)'},{transform:'scale(1.15)',opacity:1,filter:'blur(0)',offset:.7},{transform:'scale(1)',opacity:1}],{duration:dur(380),delay:dur(90),easing:'cubic-bezier(.34,1.56,.64,1)',fill:'both'});
      if(!reduced&&!neg) A(rays,[{transform:'translate(-50%,-50%) scale(.3) rotate(0deg)',opacity:0},{transform:'translate(-50%,-50%) scale(1) rotate(40deg)',opacity:1,offset:.35},{transform:'translate(-50%,-50%) scale(1.15) rotate(110deg)',opacity:0}],{duration:dur(1300),easing:'ease-out',fill:'forwards'});
      // 画面揺れ
      if(!reduced&&opts.shakeEl){
        const s=neg?3:(4+tier*2);
        A(opts.shakeEl,[{transform:'translate(0,0)'},{transform:`translate(${-s}px,${s*.6}px)`},{transform:`translate(${s}px,${-s*.5}px)`},{transform:`translate(${-s*.6}px,${-s*.3}px)`},{transform:`translate(${s*.4}px,${s*.3}px)`},{transform:'translate(0,0)'}],{duration:dur(380),easing:'ease-out'});
      }
      // 合計のカウントアップ（イージング・最後は厳密一致）
      const total=opts.total, cd=dur(480), t0=performance.now()+dur(120);
      let lastBurst=0;
      const r0=()=>num.getBoundingClientRect();
      const spark=(n,burst)=>{
        if(reduced||neg) return;
        const r=r0(); const host=document.body;
        for(let i=0;i<Math.min(n,22);i++){
          const p=document.createElement('div'); p.className='sfx-spark h'+Math.min(5,2+tier); p.style.zIndex=951;
          p.style.left=(r.left+Math.random()*r.width)+'px'; p.style.top=(r.top+r.height*(burst?.5:.3+Math.random()*.4))+'px';
          host.appendChild(p);
          const ang=burst?Math.random()*Math.PI*2:(-Math.PI/2+(Math.random()-.5)*1.6), dist=(burst?60:30)+Math.random()*(burst?110:50), d=500+Math.random()*500;
          A(p,[{transform:'translate(0,0) scale(1.4)',opacity:1},{transform:`translate(${Math.cos(ang)*dist}px,${Math.sin(ang)*dist}px) scale(.2)`,opacity:0}],{duration:d,easing:'cubic-bezier(.2,.7,.4,1)',fill:'forwards'});
          setTimeout(()=>p.remove(),d+40);
        }
      };
      const confetti=(n)=>{
        if(reduced||neg) return;
        const r=r0(); const colors=['#fbbf24','#f472b6','#7dd3fc','#4ade80','#fff','#f87171'];
        for(let i=0;i<n;i++){
          const p=document.createElement('div'); p.className='sfx-confetti'; p.style.zIndex=951;
          p.style.background=colors[i%colors.length]; p.style.left=(r.left+r.width/2)+'px'; p.style.top=(r.top+r.height/2)+'px';
          document.body.appendChild(p);
          const ang=Math.random()*Math.PI*2, dist=90+Math.random()*170, d=900+Math.random()*700;
          A(p,[{transform:'translate(0,0) rotate(0)',opacity:1},{transform:`translate(${Math.cos(ang)*dist}px,${Math.sin(ang)*dist*.8+80}px) rotate(${Math.random()*720}deg)`,opacity:0}],{duration:d,easing:'cubic-bezier(.15,.8,.35,1)',fill:'forwards'});
          setTimeout(()=>p.remove(),d+40);
        }
      };
      const step=(now)=>{
        if(done) return;
        const t=Math.max(0,Math.min(1,(now-t0)/cd)); const e=1-Math.pow(1-t,3);
        num.textContent=fmt(t>=1?total:Math.round(total*e));
        if(now-lastBurst>70&&t>0&&t<1){ lastBurst=now; spark(2+tier,false); }
        if(t<1) rafId=requestAnimationFrame(step);
        else{
          // 確定：叩きつけ＋爆発
          A(num,[{transform:'scale(1.45)'},{transform:'scale(.95)'},{transform:'scale(1)'}],{duration:dur(300),easing:'cubic-bezier(.34,1.56,.64,1)'});
          A(flash,[{opacity:reduced?.2:(neg?.35:.7)},{opacity:0}],{duration:dur(300),easing:'ease-out',fill:'forwards'});
          core.classList.add('landed');
          spark(22,true); confetti(18+tier*10);
          later(finish,dur(460));
        }
      };
      rafId=requestAnimationFrame(step);
      later(()=>{ if(!done&&num.textContent!==fmt(total)){ /* rAF停止時の保険 */ num.textContent=fmt(total); later(finish,dur(400)); } },dur(120)+cd+300);
    });
  }
};
