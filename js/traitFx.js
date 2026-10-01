/* traitFx.js — 性質変化カードの常時演出レイヤー（css/traitfx.css とセット）
 * TraitFX.html(card)  … カードHTMLの先頭に差し込む演出DOM文字列（対象外の性質変化なら ''）
 *   - 位置・色などはカードidから決定的に決める（再描画で変わらない）
 *   - --tfx-t に「経過時間ぶんの負のディレイ」を入れ、renderAll でDOMが作り直されてもループの位相が飛ばないようにする
 * 演出DOMは全て pointer-events:none / aria-hidden。ロジックには一切触れない。
 * カードHTML生成側で差し込まれなかった .card[trait-*]（ボス暗転時など）は MutationObserver で後付けする。
 */
const TraitFX = (function(){
  'use strict';

  // 性質変化名 → 演出種別
  const KIND = {
    '塗りつぶし':'paint', '塗りつぶし(レリック)':'paint',
    '将軍':'general', '指令官':'cmd', 'マキシマム':'max', 'ミニマム':'min',
    '保留':'hold', 'ディスカード':'gold', '竜頭蛇尾':'dragon', 'レリック特攻':'relic',
  };
  // class名（()除去）→ 性質変化名
  const BY_CLASS = {};
  Object.keys(KIND).forEach(t=>{ BY_CLASS[t.replace(/[()]/g,'')] = t; });

  const PAINT = ['#e3262f','#2563eb','#facc15','#16a34a']; // 赤・青・黄・緑

  // 文字列ハッシュ（FNV-1a）→ 疑似乱数列
  function hash(str){ let h=2166136261>>>0; str=String(str); for(let i=0;i<str.length;i++){ h^=str.charCodeAt(i); h=Math.imul(h,16777619)>>>0; } return h>>>0; }
  function rng(seed){ let s=seed||1; return ()=>{ s^=s<<13; s>>>=0; s^=s>>17; s^=s<<5; s>>>=0; return (s%100000)/100000; }; }
  const pct = v => (Math.round(v*10)/10)+'%';

  // 共通：位相を保つための負ディレイ（秒）
  function phase(){ const t=(typeof performance!=='undefined'&&performance.now)?performance.now():Date.now(); return `--tfx-t:-${(t/1000).toFixed(3)}s`; }

  function seedOf(card){ return hash((card&&card.id!=null)?card.id:((card&&card.symbol)||'')+'|'+((card&&card.baseScore)||0)); }

  // ---- 塗りつぶし：赤青黄緑のペンキがベタ付け→垂れるループ ----
  function paintHtml(card){
    const r=rng(seedOf(card)+7);
    const cols=PAINT.slice(); for(let i=cols.length-1;i>0;i--){ const j=Math.floor(r()*(i+1)); [cols[i],cols[j]]=[cols[j],cols[i]]; }
    const n=3+(r()<0.5?1:0);
    let h='';
    for(let i=0;i<n;i++){
      const s=34+r()*18;                    // 幅（カード幅比 %）
      const x=-6+r()*(100-s+6);             // 左
      const y=-4+(i/(n))*62+r()*10;         // 上（縦に散らす）
      const br=[0,0,0,0,0,0,0,0].map(()=>Math.round(38+r()*24)+'%');
      const rot=Math.round(r()*360);
      const dl=Math.round(20+r()*55);       // 垂れの位置（blob内 %）
      const dh=Math.round(55+r()*70);       // 垂れの長さ（blob比 %）
      const d=(i*(4.8/n)+r()*0.4).toFixed(2);
      h+=`<i class="tfx-blob" style="--c:${cols[i%cols.length]};--s:${pct(s)};left:${pct(x)};top:${pct(y)};--br:${br.slice(0,4).join(' ')} / ${br.slice(4).join(' ')};--rot:${rot}deg;--dl:${dl}%;--dh:${dh}%;--d:${d}s">`
        +`<b class="tfx-splat"></b><b class="tfx-drip"><b class="tfx-drop"></b></b></i>`;
    }
    return `<div class="tfx tfx-paint" aria-hidden="true" style="${phase()}">${h}</div>`;
  }

  // ---- 将軍：ブラッシュドメタル＋鋼の光沢＋鋲 ----
  function generalHtml(){
    return `<div class="tfx tfx-general" aria-hidden="true" style="${phase()}"><i class="tfx-brush"></i><i class="tfx-sheen"></i><i class="tfx-bevel"></i><i class="tfx-rivet r1"></i><i class="tfx-rivet r2"></i><i class="tfx-rivet r3"></i><i class="tfx-rivet r4"></i></div>`;
  }

  // ---- 指令官：右側が旗のようにたなびく＋風の筋 ----
  function cmdHtml(card){
    const N=6; let s='';
    for(let i=0;i<N;i++) s+=`<i class="tfx-slice" style="--i:${i};--n:${N};--a:${[0,0,0.4,1.1,2,3][i]}"></i>`;
    const r=rng(seedOf(card)+3); let w='';
    for(let i=0;i<3;i++) w+=`<b class="tfx-wind" style="top:${pct(14+i*28+r()*12)};--d:${(i*0.75+r()*0.5).toFixed(2)}s;--w:${pct(38+r()*24)}"></b>`;
    return `<div class="tfx tfx-cmd" aria-hidden="true" style="${phase()}"><div class="tfx-flag">${s}</div><div class="tfx-winds">${w}</div></div>`;
  }

  // ---- マキシマム／ミニマム：ガウス曲線で拡大／縮小（カード本体は CSS の scale） ----
  function maxHtml(kind){
    return `<div class="tfx tfx-${kind}" aria-hidden="true" style="${phase()}"><i class="tfx-aura"></i><i class="tfx-chev c1"></i><i class="tfx-chev c2"></i><i class="tfx-chev c3"></i><i class="tfx-chev c4"></i></div>`;
  }

  // ---- 保留：ホログラム・スキャンライン・グリッチ ----
  function holdHtml(){
    return `<div class="tfx tfx-hold" aria-hidden="true" style="${phase()}"><i class="tfx-grid"></i><i class="tfx-iris"></i><i class="tfx-scan"></i><i class="tfx-glitch g1"></i><i class="tfx-glitch g2"></i><i class="tfx-hud"></i></div>`;
  }

  // ---- ディスカード：金箔・きらめき・光沢走査 ----
  function goldHtml(card){
    const r=rng(seedOf(card)+11); let sp='';
    for(let i=0;i<5;i++) sp+=`<b class="tfx-spark" style="left:${pct(8+r()*76)};top:${pct(6+r()*80)};--d:${(i*0.55+r()*0.4).toFixed(2)}s;--k:${(0.7+r()*0.6).toFixed(2)}"></b>`;
    return `<div class="tfx tfx-gold" aria-hidden="true" style="${phase()}"><i class="tfx-foil"></i><i class="tfx-glow"></i><i class="tfx-sheen"></i>${sp}</div>`;
  }

  // ---- 竜頭蛇尾：上は炎、下は灰になって崩れ落ちる ----
  function dragonHtml(card){
    const r=rng(seedOf(card)+5); let f='', a='';
    const F=5;
    for(let i=0;i<F;i++) f+=`<b class="tfx-flame" style="left:${pct(-8+i*(100/(F-1))*0.92+r()*6)};--h:${pct(36+r()*18)};--d:${(r()*0.9).toFixed(2)}s;--sp:${(0.55+r()*0.35).toFixed(2)}s"></b>`;
    for(let i=0;i<7;i++) a+=`<b class="tfx-ash" style="left:${pct(6+r()*86)};top:${pct(66+r()*20)};--d:${(i*0.37+r()*0.3).toFixed(2)}s;--dx:${Math.round(-5+r()*10)}px;--sz:${(1.5+r()*1.8).toFixed(1)}px"></b>`;
    return `<div class="tfx tfx-dragon" aria-hidden="true" style="${phase()}"><div class="tfx-body"><i class="tfx-ember"></i>${f}<i class="tfx-burnline"></i></div>${a}</div>`;
  }

  // ---- レリック特攻：所持レリックのアイコンがカード上に集結して揺れる ----
  function relicHtml(card){
    const relics=(typeof GameState!=='undefined'&&Array.isArray(GameState.relics))?GameState.relics:[];
    const icon=(r)=>{ try{ return (typeof GameIcons!=='undefined')?(r?GameIcons.relic(r,{size:'100%'}):GameIcons.svg('relic_generic',{size:'100%'})):''; }catch(e){ return ''; } };
    const list=relics.length?relics.slice(0,5):[null];
    const n=list.length, r=rng(seedOf(card)+13);
    const step=n>3?15:18;
    let h='';
    list.forEach((rel,i)=>{
      const off=(i-(n-1)/2);
      const x=50+off*step, y=22+Math.abs(off)*3;
      const ang=r()*Math.PI*2, dist=34+r()*20;
      h+=`<span class="tfx-ri" style="left:${pct(x)};top:${pct(y)};--fx:${Math.round(Math.cos(ang)*dist)}px;--fy:${Math.round(Math.sin(ang)*dist)}px;--d:${(i*0.12).toFixed(2)}s;--b:${(i*0.23).toFixed(2)}s"><span class="tfx-rb">${icon(rel)}</span></span>`;
    });
    return `<div class="tfx tfx-relic" aria-hidden="true" style="${phase()}"><i class="tfx-halo"></i>${h}</div>`;
  }

  function html(card){
    if(!card||!card.trait) return '';
    const k=KIND[card.trait]; if(!k) return '';
    switch(k){
      case 'paint':   return paintHtml(card);
      case 'general': return generalHtml(card);
      case 'cmd':     return cmdHtml(card);
      case 'max':     return maxHtml('max');
      case 'min':     return maxHtml('min');
      case 'hold':    return holdHtml(card);
      case 'gold':    return goldHtml(card);
      case 'dragon':  return dragonHtml(card);
      case 'relic':   return relicHtml(card);
    }
    return '';
  }

  // カードHTML生成側で差し込まれなかった .card（trait-* class 付き）に後付けする安全網
  function traitOfEl(el){
    for(const c of el.classList){ if(c.indexOf('trait-')===0){ const t=BY_CLASS[c.slice(6)]; if(t) return t; } }
    return null;
  }
  function decorate(root){
    if(!root||root.nodeType!==1) return;
    const list=[];
    if(root.classList.contains('card')) list.push(root);
    root.querySelectorAll('.card[class*="trait-"]').forEach(e=>list.push(e));
    root.querySelectorAll('.card > .tfx').forEach(e=>{ if(!e.parentNode.className.includes('trait-')) list.push(e.parentNode); });
    for(const el of list){
      let fx=el.querySelector(':scope > .tfx');
      if(!fx){
        const t=traitOfEl(el); if(!t) continue;
        const seed=(el.textContent||'')+'|'+t;
        el.insertAdjacentHTML('afterbegin', html({trait:t, id:seed}));
        fx=el.querySelector(':scope > .tfx'); if(!fx) continue;
      }
      // カード本体のアニメ（マキシマム/ミニマムの拡縮・保留の記号グリッチ）も位相を揃える
      if(!el.style.getPropertyValue('--tfx-t')) el.style.setProperty('--tfx-t', fx.style.getPropertyValue('--tfx-t'));
    }
  }
  function observe(){
    if(typeof MutationObserver==='undefined'||!document.body) return;
    decorate(document.body);
    new MutationObserver(muts=>{
      for(const m of muts) m.addedNodes.forEach(n=>decorate(n));
    }).observe(document.body,{childList:true,subtree:true});
  }
  if(typeof document!=='undefined'){
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',observe); else observe();
  }

  return { html, decorate, KIND };
})();
