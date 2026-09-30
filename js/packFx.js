/* packFx.js — カードパック開封演出モジュール（自己完結 / 依存なし）
 * API:
 *   PackFX.EMOJI, PackFX.NAME
 *   PackFX.packHtml(type, {size:'mini'|'large', label})  -> string
 *   PackFX.play({type, title, items:[{html, rare}], rare}) -> Promise<void>
 *   PackFX.isPlaying() -> boolean
 * 使用CSS: css/packfx.css（クラスはすべて pfx- プレフィックス）
 */
const PackFX = (function(){
  'use strict';

  const EMOJI = {
    card_pack:'🎴', normal_upgrade:'⬆️', normal_explosive_upgrade:'💥', special_upgrade:'✨',
    card_focus:'🔍', dream_card:'🌙', jamming_pack:'🌀', relic_pack:'🏆', enhance_pack:'💪', bingo_focus:'🎰'
  };
  const NAME = {
    card_pack:'？カードパック', normal_upgrade:'通常アップグレード', normal_explosive_upgrade:'爆発通常アップグレード',
    special_upgrade:'特別アップグレード', card_focus:'カードフォーカスパック', dream_card:'ドリームカードパック',
    jamming_pack:'ジャミングカードパック', relic_pack:'レリックパック', enhance_pack:'強化カードパック', bingo_focus:'ビンゴフォーカスパック'
  };
  // mini（ショップ枠）用の短縮ラベル
  const SHORT = {
    card_pack:'？パック', normal_upgrade:'通常UP', normal_explosive_upgrade:'爆発UP', special_upgrade:'特別UP',
    card_focus:'フォーカス', dream_card:'ドリーム', jamming_pack:'ジャミング', relic_pack:'レリック', enhance_pack:'強化', bingo_focus:'ビンゴ'
  };
  // 光漏れ演出の色（シェイク中に隙間から漏れる光）
  const LEAK = { enhance_pack:'#facc15', jamming_pack:'#4ade80', card_focus:'#ffffff', bingo_focus:'#ffffff', relic_pack:'#ef4444' };
  // 開封時の光（それ以外のタイプ）
  const GLOW = {
    card_pack:'#bfdbfe', normal_upgrade:'#99f6e4', normal_explosive_upgrade:'#fb923c', special_upgrade:'#fde68a',
    dream_card:'#a5b4fc', enhance_pack:'#facc15', jamming_pack:'#4ade80', card_focus:'#ffffff', relic_pack:'#ef4444', bingo_focus:'#ffffff'
  };

  const TEAR_Y = 11; // 切り取り線の位置（パック高さ%）

  function esc(s){
    return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function normType(t){ return Object.prototype.hasOwnProperty.call(EMOJI, t) ? t : 'card_pack'; }
  function rnd(a,b){ return a + Math.random()*(b-a); }
  function rint(a,b){ return Math.floor(rnd(a,b+1)); }

  // パック外形：上下がギザギザ（圧着シール）の多角形
  const PACK_POLY = (function(){
    const teeth = 14, d = 2.2, pts = [];
    for(let i=0;i<=teeth*2;i++){ pts.push((i*50/teeth).toFixed(2)+'% '+(i%2?d:0)+'%'); }
    for(let i=teeth*2;i>=0;i--){ pts.push((i*50/teeth).toFixed(2)+'% '+(i%2?100-d:100)+'%'); }
    return 'polygon('+pts.join(',')+')';
  })();
  function clipStyle(poly){ return '-webkit-clip-path:'+poly+';clip-path:'+poly+';'; }

  function packHtml(type, opts){
    opts = opts || {};
    const t = normType(type);
    const size = opts.size === 'large' ? 'large' : 'mini';
    const label = opts.label != null ? opts.label : (size === 'mini' ? SHORT[t] : NAME[t]);
    return '<div class="pfx-pack pfx-pack-'+size+' pfx-th-'+t+'" role="img" aria-label="'+esc(NAME[t])+'">'
      + '<div class="pfx-pack-clip" style="'+clipStyle(PACK_POLY)+'">'
      +   '<div class="pfx-face"></div><div class="pfx-foil"></div>'
      +   '<div class="pfx-crimp pfx-crimp-t"></div><div class="pfx-crimp pfx-crimp-b"></div>'
      +   (size === 'large' ? '<div class="pfx-toptext">✦ BOOSTER PACK ✦</div>' : '')
      +   '<div class="pfx-medal"></div><div class="pfx-emoji">'+EMOJI[t]+'</div>'
      +   '<div class="pfx-band"><span>'+esc(label)+'</span></div>'
      +   '<div class="pfx-sheen"></div>'
      + '</div></div>';
  }

  // ===== 再生状態 =====
  let cur = null; // {overlay, timers, resolve, done}

  function isPlaying(){ return !!cur; }

  function finish(){
    const c = cur; if(!c) return;
    cur = null;
    c.timers.forEach(id => clearTimeout(id));
    c.timers.length = 0;
    if(c.overlay && c.overlay.parentNode) c.overlay.parentNode.removeChild(c.overlay);
    c.overlay = null;
    try{ c.resolve(); }catch(e){}
  }

  function prefersReduced(){
    try{ return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }catch(e){ return false; }
  }

  // 粒子生成ヘルパー
  function spawn(parent, n, make){
    const frag = document.createDocumentFragment();
    for(let i=0;i<n;i++){
      const el = document.createElement('span');
      make(el, i);
      frag.appendChild(el);
    }
    parent.appendChild(frag);
  }
  function setVars(el, vars){ for(const k in vars) el.style.setProperty('--'+k, vars[k]); }

  function tearPolys(){
    // ギザギザの破れ線（左→右）
    const n = 12, pts = [];
    for(let i=0;i<=n;i++){
      const x = i*100/n;
      const y = TEAR_Y + (i===0||i===n ? rnd(-0.6,0.6) : rnd(-1.8,1.8));
      pts.push([x,y]);
    }
    const f = p => p[0].toFixed(1)+'% '+p[1].toFixed(2)+'%';
    const top = 'polygon(-20% -30%,120% -30%,'+ pts.slice().reverse().map((p,i,a)=>{
      if(i===0) return '120% '+p[1].toFixed(2)+'%,'+f(p);
      if(i===a.length-1) return f(p)+',-20% '+p[1].toFixed(2)+'%';
      return f(p);
    }).join(',') + ')';
    const body = 'polygon(-20% '+pts[0][1].toFixed(2)+'%,'+ pts.map(f).join(',') + ',120% '+pts[n][1].toFixed(2)+'%,120% 130%,-20% 130%)';
    return {top, body};
  }

  function play(opts){
    opts = opts || {};
    if(cur) finish();
    const type = normType(opts.type);
    const title = opts.title != null ? String(opts.title) : NAME[type];
    const items = Array.isArray(opts.items) ? opts.items.filter(Boolean) : [];
    const rareAny = !!opts.rare;
    const sparkle = type === 'special_upgrade' || rareAny;
    const explosive = type === 'normal_explosive_upgrade';
    const dream = type === 'dream_card';
    const leak = LEAK[type] || null;
    const reduced = prefersReduced();
    const glow = GLOW[type];

    const T = reduced
      ? { shake1:0, shake2:0, shake3:0, tear:120, emerge:170, staggerMax:120, fly:260, hold:140, fade:160 }
      : { shake1:470, shake2:840, shake3:1080, tear:1250, emerge:1370, staggerMax:430, fly:500, hold:430, fade:320 };

    return new Promise(resolve => {
      const ov = document.createElement('div');
      ov.className = 'pfx-overlay pfx-t-'+type + (leak?' pfx-leaky':'') + (sparkle?' pfx-sparkly':'') + (explosive?' pfx-explosive':'')
        + (dream?' pfx-dream':'') + (reduced?' pfx-reduced':'');
      ov.setAttribute('role','dialog');
      ov.setAttribute('aria-label', title);
      ov.style.setProperty('--pfx-glow', leak || glow);
      const polys = tearPolys();
      const big = packHtml(type, {size:'large'});

      ov.innerHTML =
          '<div class="pfx-backdrop"></div>'
        + (dream ? '<div class="pfx-night"><div class="pfx-moon"></div><span class="pfx-shoot pfx-shoot-1"></span><span class="pfx-shoot pfx-shoot-2"></span></div>' : '')
        + '<div class="pfx-flash"></div>'
        + '<div class="pfx-quake"><div class="pfx-stage">'
        +   '<div class="pfx-items"></div>'
        +   '<div class="pfx-packwrap">'
        +     '<div class="pfx-rays"></div><div class="pfx-halo"></div>'
        +     '<div class="pfx-anim">'
        +       '<div class="pfx-body">'+big+'<div class="pfx-inside"></div></div>'
        +       '<div class="pfx-top" style="'+clipStyle(polys.top)+'"><div class="pfx-top-inner">'+big+'</div></div>'
        +       '<div class="pfx-seam" style="top:'+TEAR_Y+'%"></div>'
        +     '</div>'
        +     '<div class="pfx-burst" style="top:'+TEAR_Y+'%"></div>'
        +     '<div class="pfx-ring"></div>'
        +     '<div class="pfx-fx"></div>'
        +   '</div>'
        +   '<div class="pfx-title"><span>'+esc(title)+'</span>'+(rareAny?'<em class="pfx-rare-badge">✦ RARE ✦</em>':'')+'</div>'
        + '</div></div>';

      const c = { overlay:ov, timers:[], resolve, done:false };
      cur = c;
      const at = (ms, fn) => { c.timers.push(setTimeout(() => { if(cur === c) fn(); }, Math.max(0, ms))); };
      const $ = s => ov.querySelector(s);
      const itemsZone = $('.pfx-items'), packwrap = $('.pfx-packwrap'), fx = $('.pfx-fx');
      const bodyEl = $('.pfx-body');

      // タップでスキップ（click を使い、下のUIへのゴーストクリックを防ぐ）
      ov.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); if(cur === c) finish(); });

      // 夜空の星
      if(dream){
        const night = $('.pfx-night');
        spawn(night, reduced ? 14 : 26, el => {
          el.className = 'pfx-star';
          setVars(el, { x: rnd(2,98).toFixed(1)+'%', y: rnd(2,92).toFixed(1)+'%', s: rnd(1,3).toFixed(1)+'px',
            delay: rnd(0,2).toFixed(2)+'s', dur: rnd(1.2,2.6).toFixed(2)+'s' });
        });
      }
      // キラキラ（周囲）
      if(sparkle && !reduced){
        spawn(fx, 16, el => {
          el.className = 'pfx-twinkle';
          el.textContent = Math.random() < .7 ? '✦' : '✧';
          const a = rnd(0, Math.PI*2), r = rnd(.55, 1.05);
          setVars(el, { x: (Math.cos(a)*r*105).toFixed(0)+'px', y: (Math.sin(a)*r*140).toFixed(0)+'px',
            s: rnd(10,20).toFixed(0)+'px', delay: rnd(0,1.2).toFixed(2)+'s', dur: rnd(.9,1.6).toFixed(2)+'s',
            c: Math.random() < .6 ? '#fde68a' : '#ffffff' });
        });
      }

      // ===== アイテムのレイアウト =====
      const wraps = items.map((it, i) => {
        const w = document.createElement('div');
        w.className = 'pfx-item' + (it.rare ? ' pfx-item-rare' : '');
        const inner = document.createElement('div');
        inner.className = 'pfx-item-inner';
        inner.innerHTML = it.html || '';
        w.appendChild(inner);
        return w;
      });
      document.body.appendChild(ov);

      const vw = window.innerWidth || document.documentElement.clientWidth || 360;
      const vh = window.innerHeight || document.documentElement.clientHeight || 640;
      const packH = packwrap.offsetHeight || 210;
      const zoneW = Math.min(vw - 20, 560);
      const zoneH = Math.max(90, Math.min(270, vh - packH - 150));
      itemsZone.style.width = zoneW + 'px';
      itemsZone.style.height = zoneH + 'px';

      if(wraps.length){
        // 自然サイズを計測
        const meas = document.createElement('div');
        meas.className = 'pfx-measure';
        itemsZone.appendChild(meas);
        const sizes = wraps.map(w => { meas.appendChild(w); const inn = w.firstChild; return { w: Math.max(1, inn.offsetWidth), h: Math.max(1, inn.offsetHeight) }; });
        itemsZone.removeChild(meas);
        const n = wraps.length;
        const nRows = n <= 5 ? 1 : (n <= 12 ? 2 : Math.ceil(n/6));
        const per = Math.ceil(n / nRows);
        const rows = [];
        for(let r=0;r<nRows;r++) rows.push(wraps.map((w,i)=>i).slice(r*per, (r+1)*per));
        const gap = 6, rowGap = 10;
        let s = 1.3;
        rows.forEach(row => {
          const sumW = row.reduce((a,i)=>a+sizes[i].w, 0);
          s = Math.min(s, (zoneW - 16 - gap*(row.length-1)) / sumW);
        });
        const maxH = Math.max.apply(null, sizes.map(z=>z.h));
        s = Math.min(s, (zoneH - 22 - rowGap*(nRows-1)) / (nRows*maxH));
        s = Math.max(0.3, s);
        rows.forEach(row => {
          const rowEl = document.createElement('div');
          rowEl.className = 'pfx-row';
          rowEl.style.gap = gap + 'px';
          const mid = (row.length - 1) / 2;
          row.forEach((idx, k) => {
            const w = wraps[idx], z = sizes[idx];
            w.style.width = (z.w*s).toFixed(1)+'px';
            w.style.height = (z.h*s).toFixed(1)+'px';
            w.firstChild.style.transform = 'scale('+s.toFixed(3)+')';
            w.firstChild.style.webkitTransform = 'scale('+s.toFixed(3)+')';
            const off = k - mid;
            setVars(w, { rot: Math.max(-14, Math.min(14, off*5)).toFixed(1)+'deg',
              ay: Math.min(18, off*off*2.4).toFixed(1)+'px' });
            rowEl.appendChild(w);
          });
          itemsZone.appendChild(rowEl);
        });
      }

      // ===== タイムライン =====
      // 表示
      requestAnimationFrame(() => { if(cur === c) ov.classList.add('pfx-in'); });
      if(!reduced){
        at(T.shake1, () => { ov.dataset.st = '1'; });
        at(T.shake2, () => { ov.dataset.st = '2'; });
        at(T.shake3, () => { ov.dataset.st = '3'; });
      }

      at(T.tear, () => {
        ov.dataset.st = 'tear';
        ov.classList.add('pfx-torn');
        bodyEl.style.webkitClipPath = polys.body;
        bodyEl.style.clipPath = polys.body;
        if(reduced) return;
        if(explosive){
          // 爆発：デブリ（破片＋火の粉）
          spawn(fx, 22, (el, i) => {
            const shard = i < 8;
            el.className = shard ? 'pfx-shard' : 'pfx-ember';
            const a = rnd(0, Math.PI*2), d = rnd(120, 260);
            setVars(el, { dx: (Math.cos(a)*d).toFixed(0)+'px', dy: (Math.sin(a)*d*0.9 - 20).toFixed(0)+'px',
              rot: rint(-540,540)+'deg', s: (shard ? rnd(12,24) : rnd(4,9)).toFixed(0)+'px',
              delay: rnd(0,.08).toFixed(2)+'s', dur: rnd(.6,1.0).toFixed(2)+'s',
              c: ['#fff7ed','#fdba74','#fb923c','#f97316','#ef4444','#fde047'][rint(0,5)] });
          });
        } else {
          // 通常：開口部から光の粒
          spawn(fx, 12, el => {
            el.className = 'pfx-spark';
            const a = rnd(-Math.PI*0.95, -Math.PI*0.05), d = rnd(70, 150);
            setVars(el, { dx: (Math.cos(a)*d).toFixed(0)+'px', dy: (Math.sin(a)*d).toFixed(0)+'px',
              s: rnd(3,7).toFixed(0)+'px', delay: rnd(0,.1).toFixed(2)+'s', dur: rnd(.5,.9).toFixed(2)+'s' });
          });
        }
        if(sparkle){
          spawn(fx, 14, el => {
            el.className = 'pfx-starburst';
            el.textContent = '✦';
            const a = rnd(0, Math.PI*2), d = rnd(90, 190);
            setVars(el, { dx: (Math.cos(a)*d).toFixed(0)+'px', dy: (Math.sin(a)*d - 40).toFixed(0)+'px',
              s: rnd(10,20).toFixed(0)+'px', delay: rnd(0,.25).toFixed(2)+'s', dur: rnd(.8,1.3).toFixed(2)+'s',
              c: Math.random() < .6 ? '#fde68a' : '#ffffff' });
          });
        }
      });

      // 中身の出現
      at(T.emerge, () => {
        ov.classList.add('pfx-revealed');
        if(!wraps.length) return;
        const pr = packwrap.getBoundingClientRect();
        const ox = pr.left + pr.width/2;
        const oy = explosive ? pr.top + pr.height*0.45 : pr.top + pr.height*TEAR_Y/100 + 6;
        const n = wraps.length;
        const stagger = n > 1 ? Math.min(reduced ? 30 : 110, T.staggerMax/(n-1)) : 0;
        wraps.forEach((w, i) => {
          const r = w.getBoundingClientRect();
          setVars(w, { fx: (ox - (r.left + r.width/2)).toFixed(0)+'px', fy: (oy - (r.top + r.height/2)).toFixed(0)+'px',
            delay: (i*stagger/1000).toFixed(3)+'s', fly: (T.fly/1000).toFixed(3)+'s' });
          w.classList.add('pfx-go');
          if(w.classList.contains('pfx-item-rare')) at(i*stagger + T.fly*0.8, () => w.classList.add('pfx-landed'));
        });
      });

      const nItems = wraps.length;
      const stg = nItems > 1 ? Math.min(reduced ? 30 : 110, T.staggerMax/(nItems-1)) : 0;
      const fadeAt = T.emerge + stg*Math.max(0, nItems-1) + T.fly + T.hold;
      at(fadeAt, () => { ov.classList.add('pfx-out'); });
      at(fadeAt + T.fade, () => { finish(); });
    });
  }

  return { EMOJI, NAME, SHORT, packHtml, play, isPlaying, skip: finish };
})();
if(typeof window !== 'undefined') window.PackFX = PackFX;
