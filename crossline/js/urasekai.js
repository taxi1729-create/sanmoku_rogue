/* urasekai.js — v1.13 裏世界（第3・8階層のコモンから入る、3つのイベントを選ぶ異界）
 *   UraSekai.open(stage, ev)   裏世界画面（オーバーレイ）を開く。ev = GameState.floorEvents[floor]
 *   UraSekai.close()           閉じる（マップはそのまま）
 *   UraSekai.showReward({name,win,gold,special,summary,onNext})  ミニゲーム報酬の結果パネル → onNext（ショップへ）
 *   ラインナップは MapSelectScene.ensureFloorEvent で階層ごとに一度だけ抽選・保存される（入り直しても不変）。
 */
const UraSekai = (function(){
  let ov=null, cur=null;
  const _se=(n,o)=>{ try{ if(typeof SFX!=='undefined') SFX.play(n,o); }catch(e){} };

  const ICONS={
    throw:'<svg viewBox="0 0 48 48"><path d="M8 38 Q20 8 40 14" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="4 4" stroke-linecap="round"/><rect x="30" y="8" width="12" height="16" rx="2" transform="rotate(20 36 16)" fill="currentColor"/><path d="M6 42h14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
    highlow:'<svg viewBox="0 0 48 48"><path d="M4 24 Q24 6 44 24 Q24 42 4 24Z" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="24" cy="24" r="7" fill="currentColor"/><path d="M24 2v6M24 40v6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>',
    eliteboss:'<svg viewBox="0 0 48 48"><path d="M6 36 L10 12 L18 24 L24 8 L30 24 L38 12 L42 36Z" fill="currentColor"/><rect x="6" y="38" width="36" height="5" rx="1.5" fill="currentColor"/></svg>',
    altar:'<svg viewBox="0 0 48 48"><path d="M24 4 L28.7 18.5 L44 18.5 L31.6 27.5 L36.3 42 L24 33 L11.7 42 L16.4 27.5 L4 18.5 L19.3 18.5Z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/><circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" stroke-width="1.6" opacity=".6"/></svg>',
    pachinko:'<svg viewBox="0 0 48 48"><g fill="currentColor"><circle cx="12" cy="12" r="2.5"/><circle cx="24" cy="12" r="2.5"/><circle cx="36" cy="12" r="2.5"/><circle cx="18" cy="22" r="2.5"/><circle cx="30" cy="22" r="2.5"/><circle cx="12" cy="32" r="2.5"/><circle cx="36" cy="32" r="2.5"/></g><circle cx="24" cy="32" r="5" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M16 44h16" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
    merchant:'<svg viewBox="0 0 48 48"><path d="M8 18 L12 8 H36 L40 18Z" fill="currentColor"/><path d="M10 18v24h28V18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/><path d="M24 23 L30 29 L24 37 L18 29Z" fill="currentColor"/><path d="M18 29h12" stroke="#000" stroke-opacity=".35" stroke-width="1.4"/></svg>',
    derby:'<svg viewBox="0 0 48 48"><path d="M10 44V6" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M12 7h26v18H12z" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M12 7h6.5v6H12zM25 7h6.5v6H25zM18.5 13H25v6h-6.5zM31.5 13H38v6h-6.5zM12 19h6.5v6H12zM25 19h6.5v6H25z" fill="currentColor"/></svg>',
  };

  function floor(){ return GameState.currentFloor; }
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  function availability(type, ev){
    if(ev.committed&&ev.active&&ev.active!==type) return { ok:false, why:'別のイベントが進行中' };
    if(['throw','highlow','pachinko','derby'].includes(type)){
      if(!MapSelectScene.minigameModule(type)) return { ok:false, why:'準備中' };
    }
    if(type==='altar'){
      if(typeof MajinEvent==='undefined'||typeof MajinEvent.makeInfo!=='function') return { ok:false, why:'準備中' };
      if(!ev.altarPaid&&(GameState.lives||0)<GameData.ALTAR_LIFE_COST) return { ok:false, why:`残機が足りません（残機${GameData.ALTAR_LIFE_COST}必要・残り${GameState.lives||0}）` };
    }
    return { ok:true };
  }

  function cardHtml(type, ev){
    const f=floor();
    const info=GameData.eventCommonInfo(type,f)||{name:type,desc:'',reward:''};
    const av=availability(type,ev);
    const resume=ev.committed&&ev.active===type;
    let extra='';
    if(type==='eliteboss'){
      const b=ev.eliteEffect;
      extra=`<div class="ura-ev-line">目標：<b>${GlobalFunctions.formatScore(MapSelectScene.eliteTarget(f))}点</b>（ボスの1.5倍）</div>`+(b?`<div class="ura-ev-line">ボス効果：<b>${esc(b.name)}</b>：${b.desc}</div>`:'');
    }
    if(type==='merchant'){
      const b=GameData.bossEffectForFloor(GameData.BOSS_EFFECT_POOL.find(e=>e.id==='block_cells')||{id:'block_cells',name:'マス妨害×2',desc:''},f);
      extra=`<div class="ura-ev-line">目標：<b>${GlobalFunctions.formatScore(MapSelectScene.merchantTarget(f))}点</b>（コモン）</div><div class="ura-ev-line">ボス効果：<b>${esc(b.name)}</b>：${b.desc}</div>`;
    }
    const label=resume?'再開する':(type==='altar'?`残機${GameData.ALTAR_LIFE_COST}を捧げて挑む`:'このイベントに挑む');
    return `<div class="ura-ev-card ura-ev-${type}${av.ok?'':' disabled'}${resume?' resume':''}" data-type="${type}">`
      +`<div class="ura-ev-head"><div class="ura-ev-icon">${ICONS[type]||''}</div><div class="ura-ev-titles"><div class="ura-ev-tag">${esc(info.tag||'EVENT')}</div><div class="ura-ev-name">${esc(info.name)}</div></div></div>`
      +`<div class="ura-ev-desc">${esc(info.desc)}</div>${extra}`
      +`<div class="ura-ev-reward"><span>報酬</span>${esc(info.reward)}</div>`
      +(av.ok?`<button class="ura-ev-go">${label}</button>`:`<div class="ura-ev-warn">${esc(av.why)}</div>`)
      +`</div>`;
  }

  function render(){
    if(!ov||!cur) return;
    const ev=cur.ev;
    const glitch='裏世界';
    ov.innerHTML=`<div class="ura-noise"></div><div class="ura-scan"></div>`
      +`<div class="ura-inner">`
      +`<div class="ura-head"><div class="ura-sub">第${floor()}階層　COMMON // REVERSE</div>`
      +`<h2 class="ura-title" data-text="${glitch}">${glitch}</h2>`
      +`<div class="ura-lead">${ev.committed?'進行中のイベントを再開しよう。':'3つから1つを選べ。終えたらショップへ。'}</div></div>`
      +`<div class="ura-ev-list">${ev.lineup.map(t=>cardHtml(t,ev)).join('')}</div>`
      +`<div class="ura-msg" hidden></div>`
      +`<button class="ura-exit-btn">裏世界から出る</button>`
      +`</div>`;
    ov.querySelectorAll('.ura-ev-go').forEach(btn=>{
      btn.addEventListener('click',(e)=>{
        e.stopPropagation();
        const type=btn.closest('.ura-ev-card').dataset.type;
        _se('select',{suppressTap:true});
        const ok=MapSelectScene.startEvent(cur.stage, cur.ev, type);
        if(!ok){ _se('error'); const m=ov&&ov.querySelector('.ura-msg'); if(m){ m.hidden=false; m.textContent='このイベントは今は始められない。'; } }
      });
    });
    ov.querySelector('.ura-exit-btn').addEventListener('click',()=>{ _se('close',{suppressTap:true}); close(); if(MapSelectScene.container&&document.body.contains(MapSelectScene.container)) MapSelectScene.renderAll(); });
  }

  function open(stage, ev){
    close();
    if(!ev||!Array.isArray(ev.lineup)||ev.done) return;
    cur={stage, ev};
    _se('glitch',{suppressTap:true});
    ov=document.createElement('div'); ov.id='ura-overlay'; ov.className='ura-overlay';
    document.body.appendChild(ov);
    document.body.classList.add('ura-open');
    render();
    ov.scrollTop=0;
  }

  function close(){
    if(ov){ ov.remove(); ov=null; }
    cur=null;
    document.body.classList.remove('ura-open');
  }

  function showReward(r){
    const old=document.getElementById('ura-reward'); if(old) old.remove();
    const box=document.createElement('div'); box.id='ura-reward'; box.className='ura-reward-overlay';
    const lines=[];
    if(r.gold>0) lines.push(`<div class="ura-rw-gold">+${r.gold}G</div>`);
    if(r.special>0) lines.push(`<div class="ura-rw-special">特別アップグレード ×${r.special}<small>ショップで最初に選択</small></div>`);
    if(lines.length===0) lines.push(`<div class="ura-rw-none">報酬なし</div>`);
    box.innerHTML=`<div class="ura-reward-box"><div class="ura-rw-head">裏世界 // RESULT</div><div class="ura-rw-name">${esc(r.name)}</div>`
      +`<div class="ura-rw-verdict ${r.win?'win':'lose'}">${r.win?'成功':'失敗'}</div>`
      +(r.summary?`<div class="ura-rw-summary">${esc(r.summary)}</div>`:'')
      +lines.join('')
      +`<button class="ura-rw-btn">ショップへ</button></div>`;
    document.body.appendChild(box);
    _se(r.win?'win':'lose');
    if(r.gold>0) setTimeout(()=>_se('coin'),450);
    if(r.special>0) setTimeout(()=>_se('upgrade'),r.gold>0?750:450);
    box.querySelector('.ura-rw-btn').addEventListener('click',()=>{ _se('confirm',{suppressTap:true}); box.remove(); if(typeof r.onNext==='function') r.onNext(); });
  }

  return { open, close, showReward, render, ICONS };
})();
