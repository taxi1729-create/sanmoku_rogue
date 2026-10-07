// #2 階層10クリア時のエンディング
//   1. 神の啓示（Revelation.openEnding）：聖なる声が旅を振り返るエピローグ（語りはスキップ可）
//   2. 白い光から明けるエンドロール（旅の記録・スタッフ・Thank you for playing）→ タイトルへ（スキップ可）
//   チュートリアル非表示設定に関係なく常に再生する。セーブは呼び出し側（App.saveGame()）で従来どおり保持
const EndingScene = {
  _timers:[],
  render(container){
    this._clear();
    if(typeof Revelation!=='undefined'){
      Revelation.openEnding().catch(e=>console.error(e)).then(()=>this.renderCredits(container));
      return;
    }
    this.renderCredits(container);
  },
  _clear(){ this._timers.forEach(t=>clearTimeout(t)); this._timers=[]; },
  renderCredits(container){
    const reduced=(()=>{ try{ return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){ return false; } })();
    const el=document.createElement('div'); el.className='end-roll';
    const highScore=GlobalFunctions.getHighScore();
    const stats=(typeof Revelation!=='undefined')?Revelation.statsHtml(true):'';
    const syms=['Circle','Triangle','Square','Cross','Hoshi','Check'].map(s=>GIconSym(s)).join(' ');
    el.innerHTML=`
      <div class="end-motes"></div>
      <div class="end-head">
        <div class="end-title">GAME CLEAR</div>
        <div class="end-sub">全10階層を踏破し、穢れの源を祓った</div>
        <div class="end-score">最終スコア：${GlobalFunctions.formatScore(GameState.currentScore)}　最高得点：${GlobalFunctions.formatScore(highScore)}</div>
      </div>
      <div class="end-viewport">
        <div class="end-scroll" id="ending-credits-scroll">
          <div class="end-logo">三目ローグライク</div>
          <div class="end-role">STAFF ROLL</div>
          <div class="end-role">THE JOURNEY</div>
          ${stats}
          <div class="end-role">GAME DESIGN</div><div class="end-name">小島</div>
          <div class="end-role">PROGRAMMING</div><div class="end-name">小島</div>
          <div class="end-role">CARD &amp; SYMBOL DESIGN</div><div class="end-name">${syms}</div>
          <div class="end-role">HOLY VOICE</div><div class="end-name">聖なる声</div>
          <div class="end-role">SPECIAL THANKS</div><div class="end-name">Playtesters</div><div class="end-name">And you, the hero of the altar</div>
          <div class="end-thanks">Thank you for playing<small>遊んでいただき、ありがとうございました</small></div>
          <div style="height:30vh"></div>
        </div>
      </div>
      <div class="end-actions"><button id="btn-skip-credits">スキップ</button></div>
      <div class="end-final">
        <div class="end-thanks">Thank you for playing<small>三目ローグライク</small></div>
        <button id="btn-ending-title">タイトルへ戻る</button>
      </div>
      ${reduced?'':'<div class="end-whiteout"></div>'}`;
    container.appendChild(el);
    if(!reduced){
      const m=el.querySelector('.end-motes');
      for(let i=0;i<22;i++){
        const s=document.createElement('span'); s.className='sev-mote'+(i%5===0?' star':'');
        s.style.setProperty('--x',(Math.random()*100).toFixed(1)+'%'); s.style.setProperty('--s',(2+Math.random()*4).toFixed(1)+'px');
        s.style.setProperty('--dur',(7+Math.random()*7).toFixed(2)+'s'); s.style.setProperty('--d',(-Math.random()*12).toFixed(2)+'s');
        s.style.setProperty('--dx',((Math.random()*2-1)*40).toFixed(0)+'px'); m.appendChild(s);
      }
    }
    const finish=()=>{ this._clear(); el.classList.add('done'); };
    const toTitle=()=>{ this._clear(); App.showTitle(); };
    el.querySelector('#btn-skip-credits').addEventListener('click',()=>{
      el.querySelector('#ending-credits-scroll')?.classList.remove('scrolling');
      finish();
    });
    el.querySelector('#btn-ending-title').addEventListener('click',toTitle);
    if(reduced){ return; }
    const dur=34;
    this._timers.push(setTimeout(()=>{
      const scroll=el.querySelector('#ending-credits-scroll');
      if(scroll){ scroll.style.setProperty('--dur',dur+'s'); scroll.classList.add('scrolling'); scroll.addEventListener('animationend',finish,{once:true}); }
    },900));
  },
};
