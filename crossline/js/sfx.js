// SFX：Web Audio API で合成する効果音（音声ファイル・通信なし）
// ─────────────────────────────────────────────────────────────
//   SFX.play(name, opts?)   opts: { pitch: 半音オフセット, rate: 周波数倍率, volume: 0..2 倍率, delay: 秒 or ms(>10ならms),
//                                   keepTap: true でボタン共通タップ音を打ち消さない }
//   SFX.setMuted(bool) / SFX.isMuted() / SFX.setVolume(0..1) / SFX.getVolume() / SFX.names()
//   localStorage 'sanmoku_sfx' に {muted, volume} を保存。
//
// ■ ボタン共通タップ音と個別SEの二重鳴り防止（他モジュール向けメモ）
//   document の capture フェーズ click で button / [role=button] / .btn 系を検知すると、tap を「予約」する
//   （setTimeout 0 で次のタスクに鳴らす）。その click の処理中（同期的に）に SFX.play('tap'以外') が呼ばれると
//   予約された tap は自動的に取り消される＝個別SEが優先。何もしなければ通常どおり tap が鳴る。
//   → 各ハンドラは「固有の音を鳴らしたい場所で SFX.play('confirm') 等を呼ぶだけ」でよい。特別な処理は不要。
//   要素側で data-sfx="none"（無音）/ data-sfx="buy"（その音を鳴らす）も指定できる。
//   SFX.suppressTap(ms) で一定時間タップ音を止めることも可能（非同期で後から個別SEを鳴らす場合など）。
//
// ■ iOS：最初の pointerdown / touchend / keydown（capture）で AudioContext を生成・resume する。
// ■ 早送り中（GameMainScene.scoreFastForward）は自動で短く・小さく鳴る。同名の音は30ms以内の連打を間引き、同時発音は最大12。
const SFX = (function(){
  const KEY='sanmoku_sfx';
  let muted=false, volume=0.7;
  try{ const s=JSON.parse(localStorage.getItem(KEY)||'null'); if(s){ muted=!!s.muted; if(typeof s.volume==='number') volume=Math.max(0,Math.min(1,s.volume)); } }catch(e){}
  const save=()=>{ try{ localStorage.setItem(KEY,JSON.stringify({muted,volume})); }catch(e){} };

  let ctx=null, master=null, comp=null, noiseBuf=null;
  const AC=(typeof window!=='undefined')&&(window.AudioContext||window.webkitAudioContext);
  function ensure(){
    if(!AC) return null;
    if(!ctx){
      try{
        ctx=new AC();
        comp=ctx.createDynamicsCompressor();
        comp.threshold.value=-14; comp.knee.value=10; comp.ratio.value=4; comp.attack.value=0.003; comp.release.value=0.15;
        master=ctx.createGain(); master.gain.value=volume;
        master.connect(comp); comp.connect(ctx.destination);
        const len=Math.floor(ctx.sampleRate*1.0);
        noiseBuf=ctx.createBuffer(1,len,ctx.sampleRate);
        const d=noiseBuf.getChannelData(0); for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
      }catch(e){ ctx=null; return null; }
    }
    if(ctx.state==='suspended'){ try{ ctx.resume(); }catch(e){} }
    return ctx;
  }
  function unlock(){
    const c=ensure(); if(!c) return;
    // iOS: 無音バッファを1回鳴らしてオーディオ経路を開通
    try{ const b=c.createBuffer(1,1,22050); const s=c.createBufferSource(); s.buffer=b; s.connect(c.destination); s.start(0); }catch(e){}
  }
  if(typeof document!=='undefined'){
    ['pointerdown','touchend','keydown','mousedown'].forEach(ev=>document.addEventListener(ev,unlock,{capture:true,passive:true}));
  }

  // ── 合成プリミティブ ──
  // tone(t, freq, dur, o) o:{type, vol, a(attack), to(終端周波数), q, lp(ローパス), hp, det}
  let P=1, V=1, D=1; // 現在の音のピッチ倍率・音量倍率・長さ倍率（play 中のみ有効）
  let voices=0;
  function track(dur){ voices++; setTimeout(()=>{ voices=Math.max(0,voices-1); },(dur+0.05)*1000); }
  function tone(t,f,dur,o={}){
    dur*=D;
    const os=ctx.createOscillator(), g=ctx.createGain();
    os.type=o.type||'sine';
    const f0=f*P; os.frequency.setValueAtTime(f0,t);
    if(o.to) os.frequency.exponentialRampToValueAtTime(Math.max(20,o.to*P),t+(o.toT?o.toT*D:dur));
    if(o.det) os.detune.value=o.det;
    const vol=(o.vol==null?0.25:o.vol)*V, a=Math.min(o.a==null?0.004:o.a,dur*0.5);
    g.gain.setValueAtTime(0.0001,t);
    g.gain.linearRampToValueAtTime(vol,t+a);
    g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    let node=os;
    if(o.lp||o.hp){ const fl=ctx.createBiquadFilter(); fl.type=o.lp?'lowpass':'highpass'; fl.frequency.value=o.lp||o.hp; fl.Q.value=o.q||0.7; node.connect(fl); node=fl; }
    node.connect(g); g.connect(master);
    os.start(t); os.stop(t+dur+0.02);
    return t+dur;
  }
  // noise(t, dur, o) o:{type:'bandpass'|'lowpass'|'highpass', f, to, q, vol, a}
  function noise(t,dur,o={}){
    dur*=D;
    const s=ctx.createBufferSource(); s.buffer=noiseBuf; s.loop=true;
    const fl=ctx.createBiquadFilter(); fl.type=o.type||'bandpass';
    fl.frequency.setValueAtTime((o.f||2000)*P,t);
    if(o.to) fl.frequency.exponentialRampToValueAtTime(Math.max(30,o.to*P),t+dur);
    fl.Q.value=o.q==null?1:o.q;
    const g=ctx.createGain(), vol=(o.vol==null?0.2:o.vol)*V, a=Math.min(o.a==null?0.003:o.a,dur*0.6);
    g.gain.setValueAtTime(0.0001,t); g.gain.linearRampToValueAtTime(vol,t+a); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    s.connect(fl); fl.connect(g); g.connect(master);
    s.start(t,Math.random()*0.5); s.stop(t+dur+0.02);
    return t+dur;
  }
  const N=n=>440*Math.pow(2,(n-69)/12); // MIDIノート→Hz
  const arp=(t,notes,step,o)=>{ notes.forEach((n,i)=>tone(t+i*step*D,N(n),o.dur||0.18,o)); return t+notes.length*step*D+(o.dur||0.18); };
  const chip=(t,f,vol=0.22)=>{ tone(t,f,0.07,{type:'triangle',vol}); tone(t,f*2.76,0.05,{type:'sine',vol:vol*0.5}); noise(t,0.025,{type:'highpass',f:5000,vol:vol*0.5}); };

  // ── 音色定義：fn(t) ──
  const S={
    tap:t=>{ tone(t,880,0.05,{type:'triangle',vol:0.14,to:660}); noise(t,0.02,{type:'highpass',f:4000,vol:0.06}); },
    select:t=>{ tone(t,740,0.06,{type:'triangle',vol:0.16,to:990}); tone(t+0.03*D,1480,0.05,{vol:0.07}); },
    deselect:t=>{ tone(t,880,0.07,{type:'triangle',vol:0.13,to:560}); },
    confirm:t=>{ tone(t,N(76),0.08,{type:'triangle',vol:0.18}); tone(t+0.07*D,N(83),0.14,{type:'triangle',vol:0.18}); },
    cancel:t=>{ tone(t,N(72),0.08,{type:'triangle',vol:0.15}); tone(t+0.06*D,N(65),0.12,{type:'triangle',vol:0.13}); },
    open:t=>{ noise(t,0.14,{type:'bandpass',f:800,to:3200,q:1.2,vol:0.09,a:0.04}); tone(t+0.04*D,N(79),0.1,{type:'sine',vol:0.1}); },
    close:t=>{ noise(t,0.12,{type:'bandpass',f:3000,to:700,q:1.2,vol:0.08,a:0.02}); tone(t,N(74),0.08,{type:'sine',vol:0.08,to:N(67)}); },
    page:t=>{ noise(t,0.11,{type:'bandpass',f:2500,to:5000,q:0.8,vol:0.12,a:0.03}); tone(t+0.02*D,1200,0.04,{vol:0.04}); },
    place:t=>{ tone(t,180,0.12,{type:'sine',vol:0.32,to:90}); noise(t,0.05,{type:'lowpass',f:1800,vol:0.18}); chip(t+0.01*D,1250,0.14); },
    placeNpc:t=>{ tone(t,140,0.12,{type:'square',vol:0.08,to:80,lp:900}); noise(t,0.05,{type:'lowpass',f:1200,vol:0.14}); tone(t+0.01*D,520,0.08,{type:'triangle',vol:0.08,to:380}); },
    draw:t=>{ noise(t,0.09,{type:'bandpass',f:1800,to:4200,q:1.4,vol:0.12,a:0.02}); tone(t+0.05*D,1320,0.04,{type:'triangle',vol:0.06}); },
    shuffle:t=>{ for(let i=0;i<6;i++) noise(t+i*0.045*D,0.05,{type:'bandpass',f:2200+Math.random()*1500,q:1.5,vol:0.1}); },
    reroll:t=>{ for(let i=0;i<4;i++) noise(t+i*0.05*D,0.05,{type:'bandpass',f:2500+i*400,q:2,vol:0.1}); tone(t+0.2*D,N(84),0.1,{type:'triangle',vol:0.12}); },
    bingo:t=>{ arp(t,[72,76,79,84],0.06,{type:'square',vol:0.07,lp:3500,dur:0.2}); arp(t,[72,76,79,84],0.06,{type:'triangle',vol:0.13,dur:0.22}); tone(t+0.24*D,N(96),0.3,{vol:0.07}); noise(t+0.24*D,0.25,{type:'highpass',f:7000,vol:0.06,a:0.01}); },
    scoreTick:t=>{ tone(t,1700,0.025,{type:'square',vol:0.04,lp:4000}); },
    scoreChip:t=>{ chip(t,1100,0.2); chip(t+0.035*D,1650,0.12); },
    mult:t=>{ tone(t,330,0.18,{type:'sawtooth',vol:0.09,to:990,lp:2500,q:4}); tone(t+0.06*D,N(81),0.16,{type:'triangle',vol:0.14}); noise(t,0.08,{type:'bandpass',f:1500,to:5000,vol:0.08}); },
    finale:t=>{ arp(t,[60,64,67,72,76,79,84],0.05,{type:'triangle',vol:0.13,dur:0.18}); tone(t+0.36*D,N(84),0.6,{type:'square',vol:0.05,lp:3000}); tone(t+0.36*D,N(88),0.6,{type:'triangle',vol:0.1}); tone(t+0.36*D,N(91),0.6,{type:'triangle',vol:0.08}); noise(t+0.36*D,0.5,{type:'highpass',f:6000,vol:0.07,a:0.02}); },
    win:t=>{ arp(t,[67,72,76],0.09,{type:'triangle',vol:0.15,dur:0.16}); tone(t+0.27*D,N(79),0.25,{type:'triangle',vol:0.15}); tone(t+0.45*D,N(84),0.55,{type:'triangle',vol:0.16}); tone(t+0.45*D,N(76),0.55,{type:'square',vol:0.04,lp:2500}); },
    lose:t=>{ arp(t,[67,63,60],0.16,{type:'triangle',vol:0.14,dur:0.22}); tone(t+0.48*D,N(55),0.7,{type:'sawtooth',vol:0.06,lp:900,to:N(50)}); },
    coin:t=>{ tone(t,N(88),0.06,{type:'square',vol:0.06,lp:5000}); tone(t+0.06*D,N(93),0.22,{type:'square',vol:0.06,lp:5000}); tone(t+0.06*D,N(93),0.22,{type:'sine',vol:0.08}); },
    buy:t=>{ S.coin(t); chip(t+0.1*D,900,0.14); tone(t+0.14*D,N(84),0.16,{type:'triangle',vol:0.1}); },
    sell:t=>{ tone(t,N(93),0.06,{type:'square',vol:0.05,lp:5000}); tone(t+0.06*D,N(88),0.14,{type:'square',vol:0.05,lp:5000}); chip(t+0.03*D,1300,0.12); },
    packOpen:t=>{ noise(t,0.3,{type:'bandpass',f:600,to:5000,q:0.9,vol:0.16,a:0.08}); tone(t+0.22*D,N(84),0.25,{type:'triangle',vol:0.12}); tone(t+0.22*D,N(91),0.25,{type:'sine',vol:0.06}); },
    cardFlip:t=>{ noise(t,0.06,{type:'bandpass',f:3200,to:1600,q:1.5,vol:0.14}); tone(t+0.02*D,640,0.05,{type:'triangle',vol:0.07,to:900}); },
    reveal:t=>{ tone(t,N(79),0.2,{type:'triangle',vol:0.12}); tone(t+0.05*D,N(86),0.24,{type:'sine',vol:0.08}); noise(t,0.2,{type:'highpass',f:6000,vol:0.04,a:0.05}); },
    rare:t=>{ arp(t,[79,83,86,91],0.05,{type:'triangle',vol:0.12,dur:0.22}); noise(t,0.35,{type:'highpass',f:7000,vol:0.06,a:0.05}); },
    legend:t=>{ tone(t,N(48),0.9,{type:'sawtooth',vol:0.07,lp:800}); arp(t+0.05*D,[72,76,79,84,88,91,96],0.045,{type:'triangle',vol:0.12,dur:0.3}); tone(t+0.35*D,N(84),0.8,{type:'triangle',vol:0.1}); tone(t+0.35*D,N(91),0.8,{type:'sine',vol:0.07,det:6}); noise(t+0.3*D,0.7,{type:'highpass',f:7000,vol:0.08,a:0.05}); },
    upgrade:t=>{ tone(t,N(72),0.3,{type:'square',vol:0.05,to:N(84),lp:3000}); arp(t+0.1*D,[79,84,88],0.06,{type:'triangle',vol:0.12,dur:0.18}); },
    error:t=>{ tone(t,180,0.09,{type:'square',vol:0.07,lp:1200}); tone(t+0.1*D,150,0.12,{type:'square',vol:0.07,lp:1200}); },
    skip:t=>{ noise(t,0.16,{type:'bandpass',f:4000,to:900,q:1,vol:0.1,a:0.02}); tone(t,N(74),0.08,{type:'triangle',vol:0.1,to:N(67)}); },
    turnEnd:t=>{ tone(t,N(69),0.1,{type:'triangle',vol:0.12}); tone(t+0.08*D,N(64),0.16,{type:'triangle',vol:0.1}); noise(t,0.08,{type:'lowpass',f:1200,vol:0.06}); },
    clockStart:t=>{ tone(t,200,0.4,{type:'sawtooth',vol:0.07,to:1600,lp:3000,q:6}); for(let i=0;i<4;i++) tone(t+i*0.07*D,2400,0.02,{type:'square',vol:0.04,lp:6000}); tone(t+0.35*D,N(88),0.25,{type:'triangle',vol:0.12}); },
    clockEnd:t=>{ tone(t,1400,0.4,{type:'sawtooth',vol:0.06,to:180,lp:2500,q:4}); tone(t+0.35*D,N(64),0.2,{type:'triangle',vol:0.1}); },
    jam:t=>{ tone(t,220,0.16,{type:'square',vol:0.06,to:110,lp:1500}); noise(t,0.12,{type:'bandpass',f:900,q:3,vol:0.1}); tone(t+0.05*D,N(70),0.12,{type:'triangle',vol:0.08,to:N(66)}); },
    thunder:t=>{ noise(t,0.05,{type:'highpass',f:3000,vol:0.25}); noise(t+0.02*D,0.8,{type:'lowpass',f:900,to:120,q:0.5,vol:0.32,a:0.01}); tone(t,60,0.6,{type:'sine',vol:0.18,to:35}); },
    stun:t=>{ for(let i=0;i<3;i++) tone(t+i*0.07*D,N(88-i*2),0.09,{type:'sine',vol:0.08,det:i*8}); noise(t,0.06,{type:'lowpass',f:900,vol:0.12}); },
    boss:t=>{ tone(t,N(36),1.0,{type:'sawtooth',vol:0.1,lp:600,a:0.04}); tone(t,N(43),1.0,{type:'sawtooth',vol:0.06,lp:500,a:0.04,det:-8}); tone(t,55,1.0,{type:'sine',vol:0.18,to:40}); noise(t,0.9,{type:'lowpass',f:300,vol:0.14,a:0.1}); tone(t+0.45*D,N(49),0.55,{type:'square',vol:0.04,lp:900}); },
    passive:t=>{ arp(t,[72,79,84],0.07,{type:'sine',vol:0.12,dur:0.35}); noise(t,0.5,{type:'highpass',f:5000,to:9000,vol:0.04,a:0.1}); },
    relic:t=>{ tone(t,N(86),0.12,{type:'triangle',vol:0.12}); tone(t+0.04*D,N(93),0.16,{type:'sine',vol:0.08}); chip(t,1900,0.08); },
    levelUp:t=>{ arp(t,[67,71,74,79,83,86],0.05,{type:'square',vol:0.05,lp:3500,dur:0.15}); arp(t,[67,71,74,79,83,86],0.05,{type:'triangle',vol:0.1,dur:0.16}); tone(t+0.3*D,N(91),0.4,{type:'triangle',vol:0.12}); },
    throw:t=>{ noise(t,0.22,{type:'bandpass',f:500,to:2600,q:1.2,vol:0.14,a:0.05}); },
    land:t=>{ tone(t,150,0.14,{type:'sine',vol:0.3,to:70}); noise(t,0.07,{type:'lowpass',f:1500,vol:0.16}); },
    pittari:t=>{ chip(t,1500,0.2); arp(t+0.05*D,[84,88,91,96],0.05,{type:'triangle',vol:0.13,dur:0.22}); noise(t+0.05*D,0.3,{type:'highpass',f:7000,vol:0.07,a:0.02}); },
    ball:t=>{ tone(t,N(76),0.08,{type:'sine',vol:0.12}); tone(t,N(88),0.05,{type:'triangle',vol:0.05}); },
    peg:t=>{ const f=1800+Math.random()*900; tone(t,f,0.04,{type:'triangle',vol:0.07}); tone(t,f*2.4,0.025,{type:'sine',vol:0.03}); },
    jump:t=>{ tone(t,300,0.14,{type:'square',vol:0.06,to:900,lp:2500}); },
    zone:t=>{ tone(t,N(72),0.5,{type:'sawtooth',vol:0.06,to:N(96),lp:3500,q:3}); noise(t,0.5,{type:'bandpass',f:800,to:6000,vol:0.08,a:0.15}); tone(t+0.42*D,N(96),0.3,{type:'triangle',vol:0.1}); },
    raceStart:t=>{ tone(t,N(72),0.14,{type:'square',vol:0.07,lp:3000}); tone(t+0.35*D,N(72),0.14,{type:'square',vol:0.07,lp:3000}); tone(t+0.7*D,N(84),0.4,{type:'square',vol:0.08,lp:3000}); },
    raceTick:t=>{ noise(t,0.04,{type:'lowpass',f:700,vol:0.1}); tone(t,110,0.04,{type:'sine',vol:0.08}); },
    raceFinish:t=>{ S.finale(t); },
    raise:t=>{ chip(t,1200,0.16); chip(t+0.06*D,1400,0.14); chip(t+0.12*D,1700,0.12); },
    call:t=>{ chip(t,1100,0.16); chip(t+0.07*D,1100,0.12); },
    fold:t=>{ noise(t,0.15,{type:'bandpass',f:2400,to:800,vol:0.1}); tone(t,N(64),0.18,{type:'triangle',vol:0.08,to:N(57)}); },
    fanfare:t=>{ const n=[72,72,72,77,81,84]; const st=[0,0.1,0.2,0.3,0.48,0.62]; n.forEach((m,i)=>{ tone(t+st[i]*D,N(m),i===5?0.6:0.12,{type:'square',vol:0.06,lp:3000}); tone(t+st[i]*D,N(m),i===5?0.6:0.12,{type:'triangle',vol:0.1}); }); tone(t+0.62*D,N(76),0.6,{type:'triangle',vol:0.08}); },
    holy:t=>{ [72,76,79,84,88].forEach((m,i)=>tone(t+i*0.03*D,N(m),1.3,{type:'sine',vol:0.07,a:0.25,det:(i%2?5:-5)})); noise(t,1.2,{type:'highpass',f:8000,vol:0.04,a:0.4}); },
    glitch:t=>{ for(let i=0;i<7;i++){ const tt=t+i*0.035*D; if(Math.random()<0.5) tone(tt,200+Math.random()*1800,0.03,{type:'square',vol:0.06,lp:4000}); else noise(tt,0.03,{type:'bandpass',f:500+Math.random()*5000,q:4,vol:0.12}); } },
    heartbeat:t=>{ tone(t,62,0.12,{type:'sine',vol:0.35,to:45}); tone(t+0.17*D,58,0.14,{type:'sine',vol:0.28,to:42}); },
    swipe:t=>{ noise(t,0.16,{type:'bandpass',f:900,to:4500,q:1.1,vol:0.12,a:0.04}); },
  };

  // ── 再生管理 ──
  const lastAt={};
  let pendingTap=null, tapSuppressUntil=0;
  function isFast(){ try{ return typeof GameMainScene!=='undefined'&&!!GameMainScene.scoreFastForward&&!!document.querySelector('.board-ff-btn'); }catch(e){ return false; } }
  function play(name,opts){
    opts=opts||{};
    if(name!=='tap'&&!opts.keepTap&&pendingTap){ clearTimeout(pendingTap); pendingTap=null; }
    if(muted||volume<=0) return false;
    if(!S[name]) name='tap';
    const c=ensure(); if(!c||c.state==='closed') return false;
    const now=performance.now();
    const gap=opts.minGap!=null?opts.minGap:30;
    if(lastAt[name]&&now-lastAt[name]<gap) return false;
    if(voices>=12) return false;
    lastAt[name]=now;
    let delay=opts.delay||0; if(delay>10) delay/=1000;
    const fast=opts.fast!=null?!!opts.fast:isFast();
    P=Math.pow(2,(opts.pitch||0)/12)*(opts.rate||1);
    V=(opts.volume==null?1:opts.volume)*(fast?0.7:1);
    D=fast?0.65:1;
    let end=0;
    try{ end=S[name](c.currentTime+0.005+delay)||0; }catch(e){ P=V=D=1; return false; }
    P=V=D=1;
    track(Math.min(2,Math.max(0.15,(end||0)-c.currentTime)));
    return true;
  }

  // ── ボタン共通タップ音（capture フェーズで予約、同期処理中に個別SEが鳴れば取り消し） ──
  const BTN_SEL='button, [role=button], .btn, [data-sfx]';
  if(typeof document!=='undefined'){
    document.addEventListener('click',e=>{
      const el=e.target&&e.target.closest&&e.target.closest(BTN_SEL);
      if(!el||el.disabled) return;
      const ds=el.getAttribute('data-sfx');
      if(ds==='none') return;
      if(ds){ api.play(ds,{keepTap:true}); return; }
      if(performance.now()<tapSuppressUntil) return;
      if(pendingTap) clearTimeout(pendingTap);
      pendingTap=setTimeout(()=>{ pendingTap=null; if(performance.now()<tapSuppressUntil) return; api.play('tap',{keepTap:true}); },0);
    },true);
  }

  const api={
    play,
    suppressTap(ms){ tapSuppressUntil=performance.now()+(ms==null?80:ms); if(pendingTap){ clearTimeout(pendingTap); pendingTap=null; } },
    setMuted(b){ muted=!!b; save(); if(!muted) ensure(); },
    isMuted(){ return muted; },
    toggleMuted(){ api.setMuted(!muted); if(!muted) api.play('confirm'); else if(pendingTap){ clearTimeout(pendingTap); pendingTap=null; } return muted; },
    setVolume(v){ volume=Math.max(0,Math.min(1,Number(v)||0)); if(master) master.gain.value=volume; save(); },
    getVolume(){ return volume; },
    names(){ return Object.keys(S); },
    unlock,
    _ctx(){ return ensure(); },
  };
  return api;
})();
if(typeof window!=='undefined') window.SFX=SFX;
