/* startEvent.js — スタートイベント「神の寵愛」
 * 「はじめから」で新規ゲームを開始した直後（マップへ行く前）に一度だけ発生する。
 * 聖なる声がゲームの目的と基本を語り（チュートリアルを兼ねる）、4種の施しからランダムに提示された3つの中から1つを授ける。
 * 公開API（グローバル const StartEvent）:
 *   StartEvent.open() -> Promise      イベント画面を開く（完了時に App.saveGame() 済みで resolve。マップ遷移は呼び出し側）
 *   StartEvent.isOpen()
 *   StartEvent.close()                強制終了（resolve される）
 *   StartEvent.skipStory()            語りをスキップして寵愛選択へ
 *   StartEvent.pickOffer(rng)         4種から3つを抽選（id配列）
 *   StartEvent.debugForce(opts)       テスト用：次回 open の提示内容を固定
 *       opts = { offer:['card_pack','all_mult','enhance'], upgradeEffects:['base_up5',...], skipIntro:true }
 *   StartEvent.BLESSINGS / StartEvent.PAGES
 * 状態変更は GameState / GameData の既存フィールドのみ（gold, currentDeck, BINGO_MULTIPLIER_BASE 等）。セーブ項目は増やさない。
 * 使用CSS: css/startevent.css（クラスはすべて sev- プレフィックス）
 */
const StartEvent = (function(){
  'use strict';
  const _se=(n,o)=>{ try{ if(typeof SFX!=='undefined') SFX.play(n,o); }catch(e){} };

  const G = () => GameState;
  const reduced = () => { try{ return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }catch(e){ return false; } };
  const shuffleR = (arr, rng) => { const a=arr.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(rng()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; };
  const clone = c => JSON.parse(JSON.stringify(c));
  const traitCls = c => c&&c.trait ? ' trait-'+String(c.trait).replace(/[()]/g,'') : '';
  const ico = (k,o) => (typeof GameIcons!=='undefined' && GameIcons.has(k)) ? GameIcons.svg(k,o) : '';
  const sym = s => (typeof GIconSym==='function') ? GIconSym(s) : s;

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
  function beforeAfterHtml(before, after){
    return `<div class="sev-ba"><div class="sev-ba-col"><small>変化前</small>${cardHtml(before)}</div>`
      + `<div class="sev-ba-arrow"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 12h13M12 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`
      + `<div class="sev-ba-col"><small>変化後</small>${cardHtml(after,'sev-reveal')}</div></div>`;
  }

  // ===================== ショップ効果の適用（ShopScene の描画・ポップアップに依存しない） =====================
  function applyShopEffect(effectId, idxs){
    const S=ShopScene;
    const prevMsg=S.message;
    let res=[], msg='';
    try{
      res = (typeof S._applyEffectCore==='function') ? S._applyEffectCore(effectId, idxs||[]) : S.applyEffect(effectId, idxs||[]);
      msg = S.message;
    }finally{ S.message=prevMsg; }
    const cash=S._lastCashGain; S._lastCashGain=null;
    return { affected:res||[], message:msg, cashGain:cash };
  }

  // ===================== 語り（チュートリアル） =====================
  const PAGES = [
    { line:'……聞こえますか。迷える者よ、この声に耳を傾けて。',
      tip:{ icon:'divine_favor', title:'聖なる声', body:'ダンジョンの入口で、天より響く声を聞いた。' } },
    { line:'第5階層の奥、神の祭壇はいま深い穢れに覆われています。',
      tip:{ icon:'all_clear', title:'旅の目的', body:'第5階層のボスを倒し、<b>神の祭壇</b>の穢れを払えばクリア。' } },
    { line:'祭壇までは五つの階層。各階層に三つの試練が待っています。',
      tip:{ title:'階層と試練', body:'<div class="sev-floors"><span>コモン</span><i></i><span>ハイレベル</span><i></i><span class="boss">ボス</span></div><b>目標点数</b>に届けば突破。三つ越えると次の階層へ。' } },
    { line:'盤面に札を置き、同じ印を縦・横・斜めに揃えなさい。「ビンゴ」が力を生みます。',
      tip:{ title:'ビンゴで得点', body:'__BOARD__一列揃えば<b>ビンゴ</b>。基礎点×ビンゴ倍率が得点。' } },
    { line:'相手も札を置きます。バツが揃えば、点は大きく削られるでしょう。',
      tip:{ title:'NPCのバツに注意', body:`<span class="sev-big-sym">${sym('Cross')}</span>NPCと交互に置く。<b>バツのビンゴは減点</b>。置き場所で妨害しよう。` } },
    { line:'得た金貨でショップの札や遺物を求め、力を磨きなさい。',
      tip:{ icons:['pack_card','pack_upgrade','pack_relic'], title:'ショップで強化', body:'Gで<b>カード・アップグレード・レリック</b>を買い、デッキを育てる。' } },
    { line:'階層の主を倒せば、記号に宿る力――パッシブを授かります。',
      tip:{ icons:['passive_hoshi','passive_check','passive_seven'], title:'ボスとパッシブ', body:'ボスは特殊効果を持つ。倒すと<b>パッシブ</b>（常時効果）を獲得。' } },
    { line:'……時に、魔神が甘い取引を持ちかけます。乗るかはあなた次第。',
      tip:{ icon:'majin', title:'魔神との取引', body:'ハイレベルが<b>魔神イベント</b>に変わることも。代価と引き換えに強力な効果を得る。' } },
    { line:'旅立つあなたに寵愛を。三つの恵みから、ひとつを選びなさい。',
      tip:{ icon:'divine_favor', title:'神の寵愛', body:'3つの恵みから<b>1つ</b>を選んで旅立とう。' } },
  ];
  function boardHtml(){
    // 3×3 のミニ盤面（上段がマルのビンゴ、右下にNPCのバツ）
    const cells=['Circle','Circle','Circle','Triangle','','Cross','','Square','Cross'];
    return `<div class="sev-board">${cells.map((s,i)=>`<span class="sev-cell${i<3?' bingo':''}${s==='Cross'?' npc':''}">${s?sym(s):''}</span>`).join('')}<i class="sev-board-line"></i></div>`;
  }
  function tipHtml(p, i){
    const t=p.tip;
    const icons = t.icons ? t.icons.map(k=>`<span class="sev-tip-ico">${ico(k)}</span>`).join('') : (t.icon?`<span class="sev-tip-ico">${ico(t.icon)}</span>`:'');
    const body=t.body.replace('__BOARD__', boardHtml());
    const dots=PAGES.map((_,k)=>`<i class="${k===i?'on':(k<i?'done':'')}"></i>`).join('');
    return `<div class="sev-tip">${icons?`<div class="sev-tip-icos">${icons}</div>`:''}<div class="sev-tip-title">${t.title}</div><div class="sev-tip-body">${body}</div></div>`
      + `<div class="sev-pager"><span class="sev-dots">${dots}</span><span class="sev-pager-n">${i+1} / ${PAGES.length}</span></div>`
      + `<div class="sev-taphint">タップで次へ</div>`;
  }

  // ===================== 寵愛 =====================
  const BLESSINGS = {
    card_pack:{ id:'card_pack', name:'？カードパック', icon:'pack_card',
      desc:()=>'ランダムなカード2枚から1枚をデッキに加える。' },
    all_mult:{ id:'all_mult', name:'全ビンゴ強化', icon:'multi_all',
      desc:()=>'全記号のビンゴ倍率を+1する。' },
    enhance:{ id:'enhance', name:'カード強化効果付与', icon:'pack_enhance',
      desc:()=>`デッキの${Math.min(G().packCardCount(false), G().currentDeck.length)}枚から1枚を選び、ランダムなカード強化を付与。` },
    upgrade:{ id:'upgrade', name:'通常アップグレード', icon:'pack_upgrade',
      desc:()=>'3つの効果から1つを選んで適用（ショップの通常アップグレードと同じ）。' },
    gold:{ id:'gold', name:'5G', icon:'gold_coin',
      desc:()=>'5Gを授かる。' },
    // v1.00 #13 最初の施し：以下の4つに固定し、ランダムに選ばれた3つから1つを選ぶ
    gold10:{ id:'gold10', name:'10G', icon:'gold_coin',
      desc:()=>'10Gを授かる。' },
    jam_card:{ id:'jam_card', name:'ジャミングカード', icon:'pack_jamming',
      desc:()=>'スタン・混乱・引き直しのいずれか付きの基礎点15のカード（バツ以外）3枚から1枚をデッキに加える。' },
    enh_card:{ id:'enh_card', name:'強化カード', icon:'pack_enhance',
      desc:()=>'エクステンド・拡大・巨大化のいずれか付きの基礎点15のカード（バツ以外）3枚から1枚をデッキに加える。' },
    purge_enhance:{ id:'purge_enhance', name:'削除と強化', icon:'pack_upgrade',
      desc:()=>'デッキのランダムな3枚を削除し、ランダムな3枚にカード強化を付与する。' },
  };
  const BLESSING_IDS = ['gold10','jam_card','enh_card','purge_enhance'];
  function pickOffer(rng){ return shuffleR(BLESSING_IDS, rng||Math.random).slice(0,3); }

  let forced=null;
  function debugForce(opts){ forced=Object.assign({}, opts||{}); return forced; }

  // ===================== 画面 =====================
  let ui=null;
  function isOpen(){ return !!ui; }
  function T(ms){ return reduced()?0:ms; }
  function wait(ms){ return new Promise(r=>{ if(!ui) return r(); const id=setTimeout(r, T(ms)); ui.timers.push(id); }); }
  function el(tag, cls, html){ const e=document.createElement(tag); if(cls) e.className=cls; if(html!=null) e.innerHTML=GGoldify(String(html)); return e; } // ゴールド表記は金貨アイコンに

  function emblemSvg(){
    let rays=''; for(let i=0;i<24;i++){ const a=i*15; rays+= i%2 ? `<path d="M100 14 L102 26 L98 26 Z" transform="rotate(${a} 100 100)"/>` : `<path d="M100 4 L104 24 L96 24 Z" transform="rotate(${a} 100 100)"/>`; }
    let tri=''; for(let i=0;i<3;i++){ const a=Math.PI*2/3*i-Math.PI/2; tri+=(i?'L':'M')+(100+Math.cos(a)*58).toFixed(1)+' '+(100+Math.sin(a)*58).toFixed(1); }
    let tri2=''; for(let i=0;i<3;i++){ const a=Math.PI*2/3*i+Math.PI/2; tri2+=(i?'L':'M')+(100+Math.cos(a)*58).toFixed(1)+' '+(100+Math.sin(a)*58).toFixed(1); }
    const star=(cx,cy,r)=>{ const k=r*0.16; return `M${cx} ${cy-r}L${cx+k} ${cy-k}L${cx+r} ${cy}L${cx+k} ${cy+k}L${cx} ${cy+r}L${cx-k} ${cy+k}L${cx-r} ${cy}L${cx-k} ${cy-k}Z`; };
    return `<svg class="sev-emblem-svg" viewBox="0 0 200 200" aria-hidden="true">
      <defs>
        <radialGradient id="sevCore" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#fff7d6"/><stop offset="1" stop-color="#fcd34d" stop-opacity="0"/></radialGradient>
      </defs>
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
      <circle class="sev-e-core" cx="100" cy="100" r="34" fill="url(#sevCore)"/>
      <path class="sev-e-star" d="${star(100,100,22)}" fill="#ffffff"/>
    </svg>`;
  }

  function buildOverlay(){
    const ov=el('div','sev-overlay'+(reduced()?' sev-reduced':''));
    ov.setAttribute('role','dialog'); ov.setAttribute('aria-label','神の寵愛');
    const pillars=[[-38,26,0],[-18,40,.25],[0,64,.1],[18,40,.35],[38,26,.5]].map(([x,w,d])=>`<span class="sev-pillar" style="--x:${x}%;--w:${w}px;--d:${d}s"></span>`).join('');
    ov.innerHTML=`
      <div class="sev-bg"></div>
      <div class="sev-pillars">${pillars}</div>
      <div class="sev-motes"></div>
      <div class="sev-flash"></div>
      <div class="sev-top">
        <span class="sev-chapter">${ico('divine_favor',{cls:'gi-gap'})}序章・神の寵愛</span>
        <span class="sev-stat"><span class="sev-deck">デッキ <b class="sev-deck-v">${G().currentDeck.length}</b>枚</span><span class="sev-gold">所持${GCoin()} <b class="sev-gold-v">${G().gold}</b></span></span>
      </div>
      <div class="sev-stage">
        <div class="sev-halo"></div>
        <div class="sev-emblem">${emblemSvg()}</div>
        <div class="sev-burst"></div>
        <div class="sev-fx"></div>
      </div>
      <div class="sev-talk"><div class="sev-nameplate"><b>聖なる声</b><small>天上より響く</small></div><button type="button" class="sev-skip">語りをスキップ</button><div class="sev-text"></div><div class="sev-more" hidden></div></div>
      <div class="sev-panel"></div>`;
    const q=s=>ov.querySelector(s);
    ui={ ov, timers:[], tap:null, busy:false, skipped:false, cancelSay:null,
      panel:q('.sev-panel'), text:q('.sev-text'), more:q('.sev-more'), goldV:q('.sev-gold-v'), deckV:q('.sev-deck-v'),
      fx:q('.sev-fx'), motes:q('.sev-motes'), skipBtn:q('.sev-skip') };
    const onTap=e=>{ if(e&&e.target&&e.target.closest&&e.target.closest('button')) return; const h=ui&&ui.tap; if(h) h(); };
    q('.sev-talk').addEventListener('click', onTap);
    q('.sev-stage').addEventListener('click', onTap);
    q('.sev-bg').addEventListener('click', onTap);
    ui.panel.addEventListener('click', e=>{ if(e.target.closest('.sev-tip,.sev-pager,.sev-taphint')) onTap(e); });
    ui.skipBtn.addEventListener('click', e=>{ e.stopPropagation(); _se('skip',{suppressTap:true}); skipStory(); });
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
  function animateNum(v, from, to, dur){
    if(!ui) return;
    dur=T(dur||700);
    v.classList.remove('sev-up'); void v.offsetWidth; if(to!==from) v.classList.add('sev-up');
    if(!dur){ v.textContent=to; return; }
    const t0=performance.now();
    const step=now=>{ if(!ui) return; const k=Math.min(1,(now-t0)/dur); v.textContent=Math.round(from+(to-from)*k); if(k<1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  function refreshStats(g0, d0){
    if(!ui) return;
    if(g0!=null&&g0!==G().gold) _se('coin');
    if(d0!=null&&d0!==G().currentDeck.length) _se('draw');
    animateNum(ui.goldV, g0!=null?g0:+ui.goldV.textContent, G().gold);
    animateNum(ui.deckV, d0!=null?d0:+ui.deckV.textContent, G().currentDeck.length);
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

  // タイプライター（タップで全文表示、wait=true なら全文表示後にタップ待ち）
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
        if(opts.wait){ more.hidden=false; ui.tap=()=>{ ui.tap=null; more.hidden=true; _se('tap',{volume:0.5}); finish(); }; }
        else { ui.tap=null; finish(); }
      };
      if(reduced()){ complete(); return; }
      box.textContent=''; ui.tap=complete; _se('holy',{volume:0.3});
      iv=setInterval(()=>{ i++; box.textContent=chars.slice(0,i).join(''); if(i%6===1&&chars[i-1]&&chars[i-1].trim()) _se('page',{volume:0.25}); if(i>=chars.length) complete(); }, 34);
      ui.timers.push(iv);
    });
  }

  // 登場演出（タップでスキップ）
  function intro(){
    return new Promise(res=>{
      const o=ui.ov;
      const all=['st-dawn','st-pillar','st-sigil','st-talk'];
      let finished=false;
      const finish=()=>{ if(finished) return; finished=true; o.classList.add(...all); ui.tap=null; res(); };
      if(reduced()||(forcedNow&&forcedNow.skipIntro)){ finish(); return; }
      ui.tap=()=>{ o.classList.add('sev-noanim'); finish(); ui.timers.push(setTimeout(()=>ui&&ui.ov.classList.remove('sev-noanim'),60)); };
      const at=(ms,fn)=>ui.timers.push(setTimeout(()=>{ if(!finished&&ui) fn(); }, ms));
      requestAnimationFrame(()=>o.classList.add('st-dawn'));
      _se('holy',{volume:0.6});
      at(500,()=>{ o.classList.add('st-pillar'); });
      at(1100,()=>{ _se('reveal'); o.classList.add('st-sigil'); pulse('rx-flash',600); spawnRise(14); });
      at(2100,()=>{ o.classList.add('st-talk'); finish(); });
    });
  }

  function skipStory(){
    if(!ui||ui.skipped) return;
    ui.skipped=true;
    ui.skipBtn.hidden=true;
    if(ui.cancelSay) ui.cancelSay();
  }

  async function story(){
    for(let i=0;i<PAGES.length;i++){
      if(!ui||ui.skipped) break;
      ui.panel.innerHTML=tipHtml(PAGES[i], i);
      ui.panel.scrollTop=0;
      await say(PAGES[i].line,{wait:true});
    }
    if(ui){ ui.skipBtn.hidden=true; ui.skipped=true; }
  }

  // --- パネルUI ---
  function clearPanel(){ ui.panel.innerHTML=''; ui.panel.scrollTop=0; }
  function panelTitle(t){ return el('div','sev-panel-title', t); }

  function renderBlessings(ids){
    return new Promise(res=>{
      clearPanel();
      const p=ui.panel;
      p.appendChild(panelTitle('神の寵愛を選べ'));
      const list=el('div','sev-opts');
      let chosen=null;
      const confirm=el('button','sev-confirm','寵愛を選んでください'); confirm.disabled=true;
      ids.forEach((id,k)=>{
        const b=BLESSINGS[id];
        const item=el('div','sev-opt', `<span class="sev-opt-ico">${ico(b.icon)}</span><div class="sev-opt-body"><div class="sev-opt-title">${b.name}</div><div class="sev-opt-desc">${b.desc()}</div></div>`);
        item.dataset.bl=id; item.style.setProperty('--k',k);
        item.addEventListener('click',()=>{
          if(ui.busy) return;
          chosen=id; _se('select',{suppressTap:true});
          list.querySelectorAll('.sev-opt').forEach(x=>x.classList.toggle('chosen', x===item));
          confirm.disabled=false;
          confirm.textContent=`授かる：${b.name}`;
        });
        list.appendChild(item);
      });
      p.appendChild(list);
      confirm.addEventListener('click',()=>{ if(!chosen||ui.busy) return; ui.busy=true; _se('confirm',{suppressTap:true}); res(chosen); });
      p.appendChild(confirm);
    });
  }

  function pickCards(cards, opts){
    return new Promise(res=>{
      clearPanel();
      const p=ui.panel, min=opts.min||1, max=opts.max||1;
      p.appendChild(panelTitle(opts.title||'カードを選べ'));
      p.appendChild(el('div','sev-hint', max>1?`${min===max?max:min+'〜'+max}枚を選択`:(opts.hint||'1枚を選択')));
      const grid=el('div','sev-pick-grid');
      const sel=new Set();
      const detail=el('div','sev-pick-detail'); detail.hidden=true;
      const confirm=el('button','sev-confirm','決定'); confirm.disabled=true;
      const upd=()=>{ confirm.disabled=!(sel.size>=min&&sel.size<=max); confirm.textContent= max>1?`決定（${sel.size}/${max}）`:'決定'; };
      cards.forEach((c,i)=>{
        const w=el('div','sev-pick-card', cardHtml(c)+(opts.badge?`<span class="sev-badge">${opts.badge(c)}</span>`:''));
        w.dataset.i=i;
        w.addEventListener('click',()=>{
          if(sel.has(i)){ sel.delete(i); _se('deselect',{suppressTap:true}); }
          else{ if(max===1) sel.clear(); if(sel.size<max){ sel.add(i); _se('select',{suppressTap:true}); } else _se('error',{suppressTap:true}); }
          grid.querySelectorAll('.sev-pick-card').forEach(x=>x.classList.toggle('picked', sel.has(+x.dataset.i)));
          const d=cardDescHtml(c); detail.hidden=!d||!sel.has(i); detail.innerHTML=d;
          upd();
        });
        grid.appendChild(w);
      });
      // スワイプ複数選択
      if(max>1&&typeof SwipeSelect!=='undefined'){
        grid.classList.add('swipe-select-zone');
        SwipeSelect.attach(grid,{
          item:'.sev-pick-card', getKey:x=>+x.dataset.i,
          isSelected:k=>sel.has(k), canSelect:()=>sel.size<max,
          set:(k,on)=>{ if(on) sel.add(k); else sel.delete(k); },
          paint:(x,on)=>x.classList.toggle('picked',on),
          commit:()=>{ detail.hidden=true; upd(); },
        });
      }
      p.appendChild(grid);
      p.appendChild(detail);
      confirm.addEventListener('click',()=>{ if(confirm.disabled) return; _se('confirm',{suppressTap:true}); res([...sel].sort((a,b)=>a-b)); });
      p.appendChild(confirm); upd();
    });
  }

  function pickList(items, opts){
    return new Promise(res=>{
      clearPanel();
      const p=ui.panel;
      p.appendChild(panelTitle(opts.title||'選べ'));
      if(opts.hint) p.appendChild(el('div','sev-hint',opts.hint));
      const list=el('div','sev-opts sev-opts-compact');
      let chosen=null;
      const confirm=el('button','sev-confirm','効果を選んでください'); confirm.disabled=true;
      items.forEach((it,k)=>{
        const row=el('div','sev-opt'+(it.rare?' sev-opt-rare':''), `<div class="sev-opt-body"><div class="sev-opt-title">${it.label}</div>${it.desc?`<div class="sev-opt-desc">${it.desc}</div>`:''}</div>`);
        row.dataset.key=it.key; row.style.setProperty('--k',k);
        row.addEventListener('click',()=>{
          chosen=it.key; _se('select',{suppressTap:true});
          list.querySelectorAll('.sev-opt').forEach(x=>x.classList.toggle('chosen', x===row));
          confirm.disabled=false; confirm.textContent='決定';
        });
        list.appendChild(row);
      });
      p.appendChild(list);
      confirm.addEventListener('click',()=>{ if(chosen==null) return; _se('confirm',{suppressTap:true}); res(chosen); });
      p.appendChild(confirm);
    });
  }

  function showResult(title, html){
    return new Promise(res=>{
      clearPanel();
      ui.panel.appendChild(panelTitle(title));
      ui.panel.appendChild(el('div','sev-result',html));
      _se('reveal');
      const b=el('button','sev-confirm sev-depart',`${ico('btn_map',{cls:'gi-gap'})}祭壇を目指して出発する`);
      b.addEventListener('click',()=>{ _se('confirm',{suppressTap:true}); res(); });
      ui.panel.appendChild(b);
    });
  }

  function playPack(type, items, rare){
    if(typeof PackFX==='undefined') return Promise.resolve();
    ui.ov.classList.add('sev-dim');
    return PackFX.play({type, items, rare:!!rare}).then(()=>{ if(ui) ui.ov.classList.remove('sev-dim'); });
  }

  // 寵愛が降りる演出
  async function blessAnim(b){
    clearPanel();
    ui.panel.appendChild(el('div','sev-granting',`<span class="sev-granting-ico">${ico(b.icon)}</span><div class="sev-panel-title">寵愛：${b.name}</div>`));
    pulse('rx-bless',1600); pulse('rx-flash',700); spawnRise(22);
    _se('fanfare'); _se('holy',{volume:0.7});
    await say('光よ、この者に宿れ――');
    await wait(900);
  }

  // ===================== 各寵愛の実行（結果HTMLを返す） =====================
  // v1.00 #13 施し用：基礎点15・バツ以外のランダム記号のカード
  function startCard(fields){
    const c={ id:'start_'+Date.now()+'_'+Math.floor(Math.random()*100000), symbol:GlobalFunctions.randChoice(['Circle','Triangle','Square']), number:15, baseScore:15, jamming:null, enhance:null, trait:null, ...fields };
    if(G().symbolPassiveTier&&G().symbolPassiveTier.Cross>=3) c.symbol='Cross';
    GameData.applyGrantSideEffects(c, G().gold);
    return c;
  }
  async function pickStartCard(cands, title){
    await playPack('card_pack', cands.map(c=>({html:cardHtml(c)})));
    if(!ui) return '';
    say('天より降りし三枚の札。あなたの束に加えるものを選びなさい。');
    const [i]=await pickCards(cands,{title, hint:'3枚のうち1枚を選択'});
    const card=cands[i];
    const d0=G().currentDeck.length;
    G().currentDeck.push(card);
    GlobalFunctions.recordCard(card);
    refreshStats(null, d0);
    return `<div class="sev-sub">デッキに加わったカード</div><div class="sev-card-row">${cardHtml(card,'sev-reveal')}</div>${cardDescHtml(card)}<div class="sev-note">デッキ ${d0}枚 → <b>${G().currentDeck.length}枚</b></div>`;
  }
  const RUN = {
    async gold10(){
      const g0=G().gold;
      G().gold+=10;
      refreshStats(g0, null);
      spawnCoins(14);
      return `<div class="sev-grant"><span class="sev-grant-ico">${ico('gold_coin')}</span><div><b>+10G</b> を授かった<div class="sev-grant-desc">所持G ${g0} → <b>${G().gold}</b></div></div></div>`;
    },
    async jam_card(){
      const cands=[0,1,2].map(()=>startCard({ jamming:GlobalFunctions.randChoice(['スタン','混乱','引き直し']) }));
      return pickStartCard(cands,'デッキに加えるジャミングカードを選べ');
    },
    async enh_card(){
      const cands=[0,1,2].map(()=>startCard({ enhance:GlobalFunctions.randChoice(['エクステンド','拡大','巨大化']) }));
      return pickStartCard(cands,'デッキに加える強化カードを選べ');
    },
    async purge_enhance(){
      const deck=G().currentDeck;
      const d0=deck.length;
      const delN=Math.min(3, Math.max(0, deck.length-1));
      const delIdx=shuffleR(deck.map((_,k)=>k), Math.random).slice(0,delN).sort((a,b)=>b-a);
      const removed=delIdx.map(i=>deck[i]);
      delIdx.forEach(i=>deck.splice(i,1));
      const encIdx=shuffleR(deck.map((_,k)=>k), Math.random).slice(0,Math.min(3,deck.length));
      let html=`<div class="sev-sub">削除されたカード</div><div class="sev-card-row">${removed.map(c=>`<div class="sev-lost">${cardHtml(c)}<span class="sev-lost-mark">削除</span></div>`).join('')}</div>`;
      html+=`<div class="sev-sub">強化効果が付与されたカード</div>`;
      encIdx.forEach(di=>{
        const before=clone(deck[di]);
        const r=applyShopEffect('grant_enhance',[di]);
        const after=r.affected[0]||deck[di];
        GlobalFunctions.recordCard(after);
        html+=`<div class="sev-ba-wrap">${beforeAfterHtml(before, after)}${cardDescHtml(after)}</div>`;
      });
      refreshStats(null, d0);
      return html+`<div class="sev-note">デッキ ${d0}枚 → <b>${deck.length}枚</b></div>`;
    },
    async card_pack(){
      const cands=[GameData.generateShopCard(), GameData.generateShopCard()];
      await playPack('card_pack', cands.map(c=>({html:cardHtml(c)})));
      if(!ui) return '';
      say('天より降りし二枚の札。あなたの束に加えるものを選びなさい。');
      const [i]=await pickCards(cands,{title:'デッキに加えるカードを選べ', hint:'2枚のうち1枚を選択'});
      const card=cands[i];
      const d0=G().currentDeck.length;
      G().currentDeck.push(card);
      GlobalFunctions.recordCard(card);
      refreshStats(null, d0);
      return `<div class="sev-sub">デッキに加わったカード</div><div class="sev-card-row">${cardHtml(card,'sev-reveal')}</div>${cardDescHtml(card)}<div class="sev-note">デッキ ${d0}枚 → <b>${G().currentDeck.length}枚</b></div>`;
    },
    async all_mult(){
      const before=GameData.snapshotMult();
      applyShopEffect('all_mult_up1', []);
      return `<div class="sev-mult">${GameData.multChangeHtml(before)}</div><div class="sev-note">全記号のビンゴ倍率 <b>+1</b></div>`;
    },
    async enhance(){
      const deck=G().currentDeck;
      if(!deck.length) return '<div class="sev-note">デッキにカードがない</div>';
      const n=Math.min(G().packCardCount(false), deck.length);
      const idxs=shuffleR(deck.map((_,k)=>k), Math.random).slice(0,n);
      say('力を宿す札を、ひとつ選びなさい。');
      const [k]=await pickCards(idxs.map(i=>deck[i]),{title:'強化効果を付与するカードを選べ', hint:`${n}枚のうち1枚を選択`});
      const di=idxs[k];
      const before=clone(deck[di]);
      const r=applyShopEffect('grant_enhance',[di]);
      const after=r.affected[0]||deck[di];
      GlobalFunctions.recordCard(after);
      return beforeAfterHtml(before, after)+cardDescHtml(after);
    },
    async upgrade(){
      const deck=G().currentDeck;
      let pool=GameData.normalSelectPool().filter(e=>e.rarity?Math.random()<e.rarity:true);
      if(!pool.length) pool=GameData.normalSelectPool().filter(e=>!e.rarity);
      let effectPool=shuffleR(pool, Math.random).slice(0, Math.min(3,pool.length));
      if(forcedNow&&Array.isArray(forcedNow.upgradeEffects)){
        const all=GameData.NORMAL_SELECT_POOL;
        const f=forcedNow.upgradeEffects.map(id=>all.find(e=>e.id===id)).filter(Boolean);
        if(f.length) effectPool=f;
      }
      const cardIndexes=shuffleR(deck.map((_,k)=>k), Math.random).slice(0, Math.min(G().packCardCount(false), deck.length));
      const rare=effectPool.some(e=>e.rarity);
      await playPack('normal_upgrade', effectPool.map(e=>({html:`<div class="pfx-chip${e.rarity?' pfx-rare':''}">${e.name}</div>`, rare:!!e.rarity})), rare);
      if(!ui) return '';
      say('三つの技から、ひとつを選びなさい。');
      const effId=await pickList(effectPool.map(e=>({key:e.id, label:e.name, desc:e.desc, rare:!!e.rarity})),{title:'アップグレード効果を選べ', hint:'ショップの通常アップグレードと同じ効果'});
      const eff=effectPool.find(e=>e.id===effId);
      let targets=[];
      if(eff.targetMax>0){
        const cards=cardIndexes.map(i=>deck[i]);
        const badge = eff.id==='cash_in' ? (c=>`売却+${ShopScene.calcCashGain(c)}G`) : null;
        const picked=await pickCards(cards,{title:`対象カードを選べ：${eff.name}`, min:eff.targetMin, max:eff.targetMax, badge});
        targets=picked.map(k=>cardIndexes[k]);
      }else if(eff.id==='jam_favor'){
        targets=cardIndexes.slice();
      }
      const beforeMap=new Map(targets.map(i=>[deck[i], clone(deck[i])]));
      const multBefore=GameData.snapshotMult();
      const g0=G().gold, d0=deck.length;
      const r=applyShopEffect(eff.id, targets);
      refreshStats(g0, d0);
      let html=`<div class="sev-sub">${eff.name}</div>`;
      if(GameData.multChanged(multBefore)){
        html+=`<div class="sev-mult">${GameData.multChangeHtml(multBefore)}</div>`;
      }else if(eff.id==='cash_in'){
        const b=[...beforeMap.values()][0];
        html+=`<div class="sev-card-row"><div class="sev-lost">${b?cardHtml(b):''}<span class="sev-lost-mark">換金</span></div></div><div class="sev-note">所持G ${g0} → <b>${G().gold}</b>（+${r.cashGain||0}G）／デッキ ${d0}枚 → <b>${G().currentDeck.length}枚</b></div>`;
      }else if(eff.id==='duplicate'){
        const c=r.affected[0];
        if(c) GlobalFunctions.recordCard(c);
        html+=c?`<div class="sev-card-row sev-dup">${cardHtml([...beforeMap.values()][0]||c)}${cardHtml(c,'sev-reveal')}</div><div class="sev-note">デッキ ${d0}枚 → <b>${G().currentDeck.length}枚</b></div>`:'';
      }else if(r.affected.length){
        r.affected.forEach(c=>{ GlobalFunctions.recordCard(c); const b=beforeMap.get(c)||c; html+=`<div class="sev-ba-wrap">${beforeAfterHtml(b,c)}${cardDescHtml(c)}</div>`; });
      }else{
        html+=`<div class="sev-note">${r.message||'効果は現れなかった'}</div>`;
      }
      return html;
    },
    async gold(){
      const g0=G().gold;
      G().gold+=5;
      refreshStats(g0, null);
      spawnCoins(10);
      return `<div class="sev-grant"><span class="sev-grant-ico">${ico('gold_coin')}</span><div><b>+5G</b> を授かった<div class="sev-grant-desc">所持G ${g0} → <b>${G().gold}</b></div></div></div>`;
    },
  };
  function spawnCoins(n){
    if(!ui||reduced()) return;
    const gr=ui.goldV.getBoundingClientRect(), sr=ui.fx.getBoundingClientRect();
    const tx=gr.left+gr.width/2-sr.left, ty=gr.top+gr.height/2-sr.top;
    for(let i=0;i<n;i++){
      const c=el('span','sev-coin');
      const sx=sr.width/2+(Math.random()*60-30), sy=sr.height*0.45;
      c.style.left=sx+'px'; c.style.top=sy+'px';
      c.style.setProperty('--dx',(tx-sx)+'px'); c.style.setProperty('--dy',(ty-sy)+'px');
      c.style.setProperty('--d',(i*0.07).toFixed(2)+'s');
      ui.fx.appendChild(c);
      ui.timers.push(setTimeout(()=>c.remove(), 1600+i*70));
    }
  }

  const OUTRO = {
    card_pack:'その札が、あなたの道を拓くでしょう。',
    all_mult:'あなたの並べる印に、等しく光を。',
    enhance:'札に宿りし力、どうか正しく振るいなさい。',
    upgrade:'磨かれた力は、あなたを裏切りません。',
    gold:'ささやかな路銀です。ショップで役立てなさい。',
    gold10:'ささやかな路銀です。ショップで役立てなさい。',
    jam_card:'その札が、敵の歩みを乱すでしょう。',
    enh_card:'札に宿りし力、どうか正しく振るいなさい。',
    purge_enhance:'削ぎ落とし、磨き上げる。それもまた力です。',
  };

  function outroAnim(){
    return new Promise(res=>{
      if(!ui) return res();
      if(reduced()) return res();
      ui.ov.classList.add('st-leave'); spawnRise(16); _se('holy',{volume:0.4});
      ui.timers.push(setTimeout(res, 1100));
    });
  }

  let forcedNow=null;
  async function open(){
    if(ui) return;
    forcedNow=forced; forced=null;
    const done=new Promise(r=>{ buildOverlay(); ui.resolve=r; });
    try{
      await intro();
      await story();
      if(!ui) return done;
      let ids=(forcedNow&&Array.isArray(forcedNow.offer)&&forcedNow.offer.length)?forcedNow.offer.filter(id=>BLESSINGS[id]):pickOffer();
      if(!ids.length) ids=pickOffer();
      say('三つの恵みのうち、ひとつを。');
      const choice=await renderBlessings(ids);
      const b=BLESSINGS[choice];
      await blessAnim(b);
      let html='';
      try{ html=await RUN[choice](); }
      catch(e){ console.error('StartEvent run error', e); html='<div class="sev-note">（寵愛の途中で異変が起きた）</div>'; }
      if(!ui) return done;
      ui.ov.classList.add('sev-granted');
      pulse('rx-glow',1400);
      const resP=showResult(`授かった寵愛：${b.name}`, html);
      say(`${OUTRO[choice]}……さあ、祭壇を目指しなさい。`);
      await resP;
      try{ App.saveGame(); }catch(e){ console.error(e); }
      await outroAnim();
      close();
    }catch(e){
      console.error('StartEvent error', e);
      try{ App.saveGame(); }catch(_){}
      close();
    }
    return done;
  }

  return { open, isOpen, close, skipStory, pickOffer, debugForce, BLESSINGS, BLESSING_IDS, PAGES, _applyShopEffect:applyShopEffect };
})();
if(typeof window!=='undefined') window.StartEvent=StartEvent;
