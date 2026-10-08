/* revelation.js — 「神の啓示」演出（聖なる声）
 *  1. 第5階層踏破の啓示：第5階層ボス撃破後、クリア報酬（爆発アップグレード等のショップ）へ進む直前に一度だけ発生。
 *     聖なる声が踏破を祝い、特別アップグレードを授け（クリア報酬の爆発アップグレードより先に開く）、第6階層以降の深層を示唆する。
 *  2. エンディングの啓示：第10階層（最終決戦）クリア時、エンドロールの前に旅を振り返るエピローグを語る。
 * 見た目はスタートイベント（css/startevent.css の sev- クラス）を流用し、差分のみ css/revelation.css（rev- プレフィックス）。
 * チュートリアル非表示設定に関係なく、常に再生する。
 * 公開API（グローバル const Revelation）:
 *   Revelation.shouldPlayFloor5()     第5階層踏破の啓示を再生すべきか
 *   Revelation.openFloor5() -> Promise 啓示を再生（完了時 GameState.floor5RevelationDone=true・App.saveGame() 済み）
 *   Revelation.openEnding() -> Promise エンディングの語り（完了で resolve。エンドロールは EndingScene 側）
 *   Revelation.isOpen() / Revelation.close() / Revelation.skip()
 */
const Revelation = (function(){
  'use strict';
  const G = () => GameState;
  const reduced = () => { try{ return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }catch(e){ return false; } };
  const ico = (k,o) => (typeof GameIcons!=='undefined' && GameIcons.has(k)) ? GameIcons.svg(k,o) : '';
  const traitCls = c => c&&c.trait ? ' trait-'+String(c.trait).replace(/[()]/g,'') : '';
  const fmt = n => (typeof GlobalFunctions!=='undefined' && GlobalFunctions.formatScore) ? GlobalFunctions.formatScore(n) : String(n);

  function cardHtml(c, cls){
    const gm=GameMainScene;
    return `<div class="card${traitCls(c)}${cls?' '+cls:''}">${gm.cardTagsHtml(c)}${gm.cardSymbolHtml(c)}${gm.cardScoreHtml(c, G().gold)}</div>`;
  }
  function cardDescHtml(c){
    const l=[];
    if(c.enhance) l.push(`<div class="sev-dl"><span class="sev-dl-ico">${GameData.iconFor('enhance',c.enhance)}</span><span><b class="desc-enhance">【${c.enhance}】</b>${GameData.ENHANCE_DESC[c.enhance]||''}</span></div>`);
    if(c.jamming) l.push(`<div class="sev-dl"><span class="sev-dl-ico">${GameData.iconFor('jamming',c.jamming)}</span><span><b class="desc-jamming">【${c.jamming}】</b>${GameData.JAMMING_DESC[c.jamming]||''}</span></div>`);
    if(c.trait) l.push(`<div class="sev-dl"><span class="sev-dl-ico">${GameData.iconFor('trait',c.trait)}</span><span><b class="desc-trait">【${c.trait}】</b>${GameData.TRAIT_DESC[c.trait]||''}</span></div>`);
    return l.length ? `<div class="sev-desc">${l.join('')}</div>` : '';
  }

  // ===================== 文言 =====================
  const FLOOR5_CELEBRATE = [
    { line:'……聞こえますか。よくぞ、五つの階層を踏破しました――。',
      tip:{ icon:'all_clear', title:'第5階層 踏破', body:'あなたは<b>神の祭壇</b>へ辿り着き、その穢れを払った。<b>旅の目的は果たされた。</b>' } },
    { line:'祭壇を覆っていた穢れは晴れ、聖なる灯が再び燃え上がりました。あなたの並べた印が、この地に光を還したのです。',
      tip:{ icon:'divine_favor', title:'聖なる灯', body:'__STATS__' } },
    { line:'その歩みに、心からの祝福を。……そして、約束の褒美を授けましょう。',
      tip:{ icon:'pack_special', title:'踏破の褒美', body:'<b>特別アップグレード</b>を授かる。啓示の後、クリア報酬より先に開かれる。' } },
  ];
  const FLOOR5_OMEN = [
    { line:'……ですが、迷える者よ。祭壇のさらに下、光の届かぬ深層から、なお冷たい気配が昇ってきます。',
      tip:{ icon:'majin', title:'深層の気配', body:'第6階層より先は<b>深層</b>。ボスはより強大になり、効果も重なって襲いかかる。' } },
    { line:'穢れの源は、まだ眠ってはいない。最奥――第10階層の闇の底で、真の主があなたを待っています。',
      tip:{ icon:'btn_boss_reroll', title:'最奥 第10階層', body:'第10階層の<b>最終決戦</b>こそ、穢れの源。挑むか否かは、あなた次第。' } },
    { line:'進むも、ここで剣を置くも、あなたの自由です。どちらを選んでも、私はいつも、あなたを見守っています。',
      tip:{ icon:'divine_favor', title:'旅の続き', body:'まずはクリア報酬を受け取り、深層への支度を整えよう。' } },
  ];
  const ENDING_LINES = [
    { line:'……聞こえますか。終わりの時が、来ました。',
      tip:{ icon:'divine_favor', title:'聖なる声', body:'第10階層の最奥に、静寂が訪れた。' } },
    { line:'最奥の闇に巣食っていた穢れの源は、あなたの手によって祓われました。十の階層すべてに、光が満ちていきます。',
      tip:{ icon:'all_clear', title:'全10階層 踏破', body:'穢れの源を打ち倒し、ダンジョンのすべてを踏破した。' } },
    { line:'思い返せば、長い旅でしたね。あなたが紡いだ道のりを、ここに記しましょう。',
      tip:{ icon:'btn_deck', title:'旅の記録', body:'__STATS__' } },
    { line:'並べた印のひとつひとつが、束ねた札の一枚一枚が、この世界を救ったのです。',
      tip:{ icon:'fx_sparkle', title:'あなたの印', body:'__SYMS__' } },
    { line:'ありがとう、勇敢なる者よ。あなたの名は、祭壇の灯とともに永く語り継がれるでしょう。……さようなら。',
      tip:{ icon:'divine_favor', title:'Thank you for playing', body:'三目ローグライクを遊んでいただき、ありがとうございました。' } },
  ];

  function statsHtml(full){
    const g=G();
    const relics=(g.relics||[]).length;
    const pas=g.symbolPassiveTier||{};
    const pasTotal=Object.keys(pas).reduce((a,k)=>a+(pas[k]||0),0);
    const rows=[
      ['到達階層', `第${g.currentFloor}階層`],
      ['デッキ', `${(g.currentDeck||[]).length}枚`],
      ['レリック', `${relics}個`],
      ['パッシブLv合計', `${pasTotal}`],
    ];
    if(g.totalBingoCount!=null) rows.push(['総ビンゴ数', `${g.totalBingoCount}`]);
    if(full){
      rows.push(['最終スコア', fmt(g.currentScore||0), 1]);
      rows.push(['所持G', `${g.gold||0}G`]);
      rows.push(['残機', `${g.lives!=null?g.lives:'-'}`]);
    }
    return `<div class="rev-stats">${rows.map(([k,v,w])=>`<div class="rev-stat${w?' wide':''}"><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;
  }
  function symsHtml(){
    const pas=G().symbolPassiveTier||{};
    const syms=['Circle','Triangle','Square','Cross','Hoshi','Check','Seven'].filter(s=>GameData.SYMBOL_LABEL&&GameData.SYMBOL_LABEL[s]!=null);
    return `<div class="rev-syms">${syms.map(s=>`<span class="rev-sym${pas[s]?' on':''}"><i>${typeof GIconSym==='function'?GIconSym(s):s}</i><small>Lv${pas[s]||0}</small></span>`).join('')}</div>`;
  }

  // ===================== 画面 =====================
  let ui=null;
  function isOpen(){ return !!ui; }
  function T(ms){ return reduced()?0:ms; }
  function wait(ms){ return new Promise(r=>{ if(!ui) return r(); const id=setTimeout(r, T(ms)); ui.timers.push(id); }); }
  function el(tag, cls, html){ const e=document.createElement(tag); if(cls) e.className=cls; if(html!=null) e.innerHTML=html; return e; }

  function emblemSvg(){
    let rays=''; for(let i=0;i<24;i++){ const a=i*15; rays+= i%2 ? `<path d="M100 14 L102 26 L98 26 Z" transform="rotate(${a} 100 100)"/>` : `<path d="M100 4 L104 24 L96 24 Z" transform="rotate(${a} 100 100)"/>`; }
    let tri=''; for(let i=0;i<3;i++){ const a=Math.PI*2/3*i-Math.PI/2; tri+=(i?'L':'M')+(100+Math.cos(a)*58).toFixed(1)+' '+(100+Math.sin(a)*58).toFixed(1); }
    let tri2=''; for(let i=0;i<3;i++){ const a=Math.PI*2/3*i+Math.PI/2; tri2+=(i?'L':'M')+(100+Math.cos(a)*58).toFixed(1)+' '+(100+Math.sin(a)*58).toFixed(1); }
    const star=(cx,cy,r)=>{ const k=r*0.16; return `M${cx} ${cy-r}L${cx+k} ${cy-k}L${cx+r} ${cy}L${cx+k} ${cy+k}L${cx} ${cy+r}L${cx-k} ${cy+k}L${cx-r} ${cy}L${cx-k} ${cy-k}Z`; };
    return `<svg class="sev-emblem-svg" viewBox="0 0 200 200" aria-hidden="true">
      <defs><radialGradient id="revCore" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#fff7d6"/><stop offset="1" stop-color="#fcd34d" stop-opacity="0"/></radialGradient></defs>
      <g class="sev-e-rays" fill="#fde68a">${rays}</g>
      <g class="sev-e-draw" fill="none" stroke="currentColor">
        <circle cx="100" cy="100" r="76" stroke-width="2.4" pathLength="100"/>
        <circle cx="100" cy="100" r="68" stroke-width="1" pathLength="100"/>
        <path d="${tri}Z" stroke-width="1.4" pathLength="100"/>
        <path d="${tri2}Z" stroke-width="1.4" pathLength="100"/>
        <circle cx="100" cy="100" r="30" stroke-width="1.6" pathLength="100"/>
      </g>
      <g class="sev-e-syms" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="100" cy="46" r="7" stroke="#7dd3fc"/>
        <path d="M146.8 126 l7.5 13 h-15 z" stroke="#86efac"/>
        <rect x="46.2" y="120" width="13" height="13" rx="1.5" stroke="#fde047"/>
      </g>
      <circle class="sev-e-core" cx="100" cy="100" r="34" fill="url(#revCore)"/>
      <path class="sev-e-star" d="${star(100,100,22)}" fill="#ffffff"/>
    </svg>`;
  }

  function buildOverlay(variant, chapter){
    const ov=el('div','sev-overlay rev-overlay rev-'+variant+(reduced()?' sev-reduced':''));
    ov.setAttribute('role','dialog'); ov.setAttribute('aria-label','神の啓示');
    const pillars=[[-38,26,0],[-18,40,.25],[0,64,.1],[18,40,.35],[38,26,.5]].map(([x,w,d])=>`<span class="sev-pillar" style="--x:${x}%;--w:${w}px;--d:${d}s"></span>`).join('');
    ov.innerHTML=`
      <div class="sev-bg"></div>
      <div class="rev-veil"></div>
      <div class="sev-pillars">${pillars}</div>
      <div class="sev-motes"></div>
      <div class="sev-flash"></div>
      <div class="sev-top">
        <span class="sev-chapter">${ico('divine_favor',{cls:'gi-gap'})}${chapter}</span>
        <span class="sev-stat"><span class="sev-deck">デッキ <b class="sev-deck-v">${G().currentDeck.length}</b>枚</span><span class="sev-gold">第<b>${G().currentFloor}</b>階層</span></span>
      </div>
      <div class="sev-stage">
        <div class="sev-halo"></div>
        <div class="sev-emblem">${emblemSvg()}</div>
        <div class="sev-burst"></div>
        <div class="sev-fx"></div>
      </div>
      <div class="sev-talk"><div class="sev-nameplate"><b>聖なる声</b><small>天上より響く</small></div><button type="button" class="sev-skip rev-skip">語りをスキップ</button><div class="sev-text"></div><div class="sev-more" hidden></div></div>
      <div class="sev-panel"></div>`;
    const q=s=>ov.querySelector(s);
    ui={ ov, timers:[], tap:null, skipped:false, cancelSay:null,
      panel:q('.sev-panel'), text:q('.sev-text'), more:q('.sev-more'), deckV:q('.sev-deck-v'),
      fx:q('.sev-fx'), motes:q('.sev-motes'), skipBtn:q('.sev-skip') };
    const onTap=e=>{ if(e&&e.target&&e.target.closest&&e.target.closest('button')) return; const h=ui&&ui.tap; if(h) h(); };
    q('.sev-talk').addEventListener('click', onTap);
    q('.sev-stage').addEventListener('click', onTap);
    q('.sev-bg').addEventListener('click', onTap);
    ui.panel.addEventListener('click', e=>{ if(e.target.closest('.sev-tip,.sev-pager,.sev-taphint')) onTap(e); });
    ui.skipBtn.addEventListener('click', e=>{ e.stopPropagation(); skip(); });
    spawnMotes(reduced()?0:26);
    document.body.appendChild(ov);
    document.documentElement.classList.add('sev-lock');
    return ov;
  }
  function spawnMotes(n){
    for(let i=0;i<n;i++){
      const m=el('span','sev-mote'+(i%5===0?' star':''));
      m.style.setProperty('--x',(Math.random()*100).toFixed(1)+'%');
      m.style.setProperty('--s',(2+Math.random()*4).toFixed(1)+'px');
      m.style.setProperty('--dur',(6+Math.random()*7).toFixed(2)+'s');
      m.style.setProperty('--d',(-Math.random()*12).toFixed(2)+'s');
      m.style.setProperty('--dx',((Math.random()*2-1)*40).toFixed(0)+'px');
      ui.motes.appendChild(m);
    }
  }
  function spawnRise(n){
    if(!ui||reduced()) return;
    for(let i=0;i<n;i++){
      const s=el('span','sev-rise');
      const a=Math.random()*Math.PI*2, d=50+Math.random()*110;
      s.style.setProperty('--dx',(Math.cos(a)*d).toFixed(0)+'px'); s.style.setProperty('--dy',(Math.sin(a)*d*0.7-40).toFixed(0)+'px');
      s.style.setProperty('--d',(Math.random()*0.35).toFixed(2)+'s');
      ui.fx.appendChild(s);
      ui.timers.push(setTimeout(()=>s.remove(), 2000));
    }
  }
  function pulse(cls, ms){
    if(!ui) return;
    const o=ui.ov; o.classList.remove(cls); void o.offsetWidth; o.classList.add(cls);
    ui.timers.push(setTimeout(()=>{ if(ui) o.classList.remove(cls); }, reduced()?50:ms));
  }
  function close(){
    if(!ui) return;
    if(ui.cancelSay) ui.cancelSay();
    ui.timers.forEach(id=>{ clearTimeout(id); clearInterval(id); });
    if(ui.ov.parentNode) ui.ov.parentNode.removeChild(ui.ov);
    document.documentElement.classList.remove('sev-lock');
    const r=ui.resolve; ui=null;
    if(r) r();
  }
  function say(text, opts){
    opts=opts||{};
    return new Promise(res=>{
      if(!ui) return res();
      if(ui.cancelSay) ui.cancelSay();
      const box=ui.text, more=ui.more; more.hidden=true;
      const chars=Array.from(text); let i=0, done=false, iv=null, settled=false;
      const finish=()=>{ if(settled) return; settled=true; if(ui&&ui.cancelSay===cancel) ui.cancelSay=null; res(); };
      const cancel=()=>{ if(iv) clearInterval(iv); done=true; if(ui){ ui.tap=null; more.hidden=true; } finish(); };
      ui.cancelSay=cancel;
      const complete=()=>{
        if(done) return; done=true; if(iv) clearInterval(iv);
        box.textContent=text;
        if(opts.wait){ more.hidden=false; ui.tap=()=>{ ui.tap=null; more.hidden=true; finish(); }; }
        else { ui.tap=null; finish(); }
      };
      if(reduced()){ complete(); return; }
      box.textContent=''; ui.tap=complete;
      iv=setInterval(()=>{ i++; box.textContent=chars.slice(0,i).join(''); if(i>=chars.length) complete(); }, 34);
      ui.timers.push(iv);
    });
  }
  function intro(){
    return new Promise(res=>{
      const o=ui.ov;
      const all=['st-dawn','st-pillar','st-sigil','st-talk'];
      let finished=false;
      const finish=()=>{ if(finished) return; finished=true; o.classList.add(...all); ui.tap=null; res(); };
      if(reduced()){ finish(); return; }
      ui.tap=()=>{ o.classList.add('sev-noanim'); finish(); ui.timers.push(setTimeout(()=>ui&&ui.ov.classList.remove('sev-noanim'),60)); };
      const at=(ms,fn)=>ui.timers.push(setTimeout(()=>{ if(!finished&&ui) fn(); }, ms));
      requestAnimationFrame(()=>o.classList.add('st-dawn'));
      at(500,()=>{ o.classList.add('st-pillar'); });
      at(1100,()=>{ o.classList.add('st-sigil'); pulse('rx-flash',600); spawnRise(14); });
      at(2100,()=>{ o.classList.add('st-talk'); finish(); });
    });
  }
  // 語りのスキップ：現在の語りの区切りを最後まで飛ばす（褒美の授与はスキップされない）
  function skip(){
    if(!ui||ui.skipped) return;
    ui.skipped=true;
    ui.skipBtn.hidden=true;
    if(ui.cancelSay) ui.cancelSay();
  }
  function tipHtml(pages, i){
    const t=pages[i].tip;
    const body=t.body.replace('__STATS__', statsHtml(ui&&ui.full)).replace('__SYMS__', symsHtml());
    const dots=pages.map((_,k)=>`<i class="${k===i?'on':(k<i?'done':'')}"></i>`).join('');
    return `<div class="sev-tip">${t.icon?`<div class="sev-tip-icos"><span class="sev-tip-ico">${ico(t.icon)}</span></div>`:''}<div class="sev-tip-title">${t.title}</div><div class="sev-tip-body">${body}</div></div>`
      + `<div class="sev-pager"><span class="sev-dots">${dots}</span><span class="sev-pager-n">${i+1} / ${pages.length}</span></div>`
      + `<div class="sev-taphint">タップで次へ</div>`;
  }
  async function story(pages){
    ui.skipped=false; ui.skipBtn.hidden=false;
    for(let i=0;i<pages.length;i++){
      if(!ui||ui.skipped) break;
      ui.panel.innerHTML=tipHtml(pages, i);
      ui.panel.scrollTop=0;
      await say(pages[i].line,{wait:true});
    }
    if(ui){ ui.skipBtn.hidden=true; ui.skipped=true; }
  }
  function clearPanel(){ ui.panel.innerHTML=''; ui.panel.scrollTop=0; }
  function panelTitle(t){ return el('div','sev-panel-title', t); }
  function pickCard(cards, title){
    return new Promise(res=>{
      clearPanel();
      const p=ui.panel;
      p.appendChild(panelTitle(title));
      p.appendChild(el('div','sev-hint','2枚のうち1枚を選択'));
      const grid=el('div','sev-pick-grid');
      let sel=-1;
      const detail=el('div','sev-pick-detail'); detail.hidden=true;
      const confirm=el('button','sev-confirm rev-confirm','決定'); confirm.disabled=true;
      cards.forEach((c,i)=>{
        const w=el('div','sev-pick-card', cardHtml(c)); w.dataset.i=i;
        w.addEventListener('click',()=>{
          sel=i;
          grid.querySelectorAll('.sev-pick-card').forEach(x=>x.classList.toggle('picked', +x.dataset.i===sel));
          const d=cardDescHtml(c); detail.hidden=!d; detail.innerHTML=d;
          confirm.disabled=false;
        });
        grid.appendChild(w);
      });
      p.appendChild(grid); p.appendChild(detail);
      confirm.addEventListener('click',()=>{ if(sel<0) return; res(sel); });
      p.appendChild(confirm);
    });
  }
  function button(title, html, label, cls){
    return new Promise(res=>{
      clearPanel();
      if(title) ui.panel.appendChild(panelTitle(title));
      if(html) ui.panel.appendChild(el('div','sev-result',html));
      const b=el('button','sev-confirm sev-depart'+(cls?' '+cls:''),label);
      b.addEventListener('click',()=>res());
      ui.panel.appendChild(b);
    });
  }
  function playPack(type, items){
    if(typeof PackFX==='undefined') return Promise.resolve();
    ui.ov.classList.add('sev-dim');
    return Promise.resolve(PackFX.play({type, items, rare:true})).catch(()=>{}).then(()=>{ if(ui) ui.ov.classList.remove('sev-dim'); });
  }
  function outroAnim(ms){
    return new Promise(res=>{
      if(!ui||reduced()) return res();
      ui.ov.classList.add('st-leave'); spawnRise(16);
      ui.timers.push(setTimeout(res, ms||1100));
    });
  }

  // ===================== 第5階層踏破の啓示 =====================
  function shouldPlayFloor5(){
    const g=G();
    return !!g && g.currentFloor===5 && Array.isArray(g.clearedStages) && g.clearedStages.includes('boss') && !g.floor5RevelationDone;
  }
  // v1.08 褒美はドリームカードパックから特別アップグレードに変更。啓示の後、ショップで爆発アップグレードより先に開く
  async function grantSpecial(){
    G().floor5GiftPending=true;
    pulse('rx-bless',1600); pulse('rx-flash',700); spawnRise(22);
    return `<div class="sev-grant"><span class="sev-grant-ico">${ico('pack_special')}</span><div><b>特別アップグレード</b>を授かった<div class="sev-grant-desc">啓示の後、クリア報酬（爆発アップグレード）より先に開かれる</div></div></div>`;
  }
  async function openFloor5(){
    if(ui) return;
    const done=new Promise(r=>{ buildOverlay('floor5','啓示・第5階層踏破'); ui.resolve=r; });
    const finishFlag=()=>{ G().floor5RevelationDone=true; try{ App.saveGame(); }catch(e){ console.error(e); } };
    try{
      await intro();
      await story(FLOOR5_CELEBRATE);
      if(!ui) return done;
      let html='';
      try{ html=await grantSpecial(); }catch(e){ console.error('Revelation gift error', e); html='<div class="sev-note">（褒美の途中で異変が起きた）</div>'; }
      if(!ui) return done;
      finishFlag(); // 褒美を受け取った時点で記録（以降リロードしても再発生しない）
      ui.ov.classList.add('sev-granted');
      const resP=button('踏破の褒美：特別アップグレード', html, '深層の声に耳を傾ける');
      say('特別な技を、あなたに授けます。');
      await resP;
      if(!ui) return done;
      ui.ov.classList.add('rev-dusk'); // 深層の示唆：光が翳る
      await story(FLOOR5_OMEN);
      if(!ui) return done;
      const hasExplosive=!!(typeof ShopScene!=='undefined' && (ShopScene.pickingPack||ShopScene.pendingRelicPacks||(ShopScene.packQueue&&ShopScene.packQueue.length)));
      const endP=button(null, null, `${ico('btn_map',{cls:'gi-gap'})}${hasExplosive?'クリア報酬（爆発アップグレード）へ':'クリア報酬へ'}`);
      say('さあ、行きなさい。あなたの旅路に、光あれ。');
      await endP;
      await outroAnim();
      close();
    }catch(e){
      console.error('Revelation error', e);
      if(!G().floor5RevelationDone) finishFlag();
      close();
    }
    return done;
  }

  // ===================== エンディングの語り =====================
  async function openEnding(){
    if(ui) return;
    const done=new Promise(r=>{ buildOverlay('ending','終章・祭壇の灯'); ui.resolve=r; ui.full=true; });
    try{
      await intro();
      pulse('rx-bless',1600); spawnRise(24);
      await story(ENDING_LINES);
      if(!ui) return done;
      const endP=button('旅の記録', statsHtml(true)+symsHtml(), 'エンドロールへ', 'rev-to-credits');
      say('……あなたの旅に、永遠の祝福を。');
      await endP;
      await outroAnim(1500);
      close();
    }catch(e){ console.error('Revelation ending error', e); close(); }
    return done;
  }

  return { shouldPlayFloor5, openFloor5, openEnding, isOpen, close, skip, statsHtml, FLOOR5_CELEBRATE, FLOOR5_OMEN, ENDING_LINES };
})();
if(typeof window!=='undefined') window.Revelation=Revelation;
