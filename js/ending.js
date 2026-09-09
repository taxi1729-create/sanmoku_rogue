// #2 階層10クリア時のエンディング：ゲームクリア画面＋スタッフロール（下画面にスキップボタン）
const EndingScene = {
  render(container){
    const el=document.createElement('div'); el.className='ending-screen';
    const highScore=GlobalFunctions.getHighScore();
    el.innerHTML=`
      <div class="ending-clear-title">GAME CLEAR</div>
      <div class="ending-clear-sub">全10階層をクリアしました！</div>
      <div class="ending-clear-score">最終スコア記録：${GlobalFunctions.formatScore(GameState.currentScore)}　最高得点：${GlobalFunctions.formatScore(highScore)}</div>
      <div class="ending-credits-viewport">
        <div class="ending-credits-scroll" id="ending-credits-scroll">
          <div class="ending-credits-title">三目ローグライク</div>
          <div class="ending-credits-role">STAFF ROLL</div>
          <br>
          <div class="ending-credits-role">GAME DESIGN</div>
          <div class="ending-credits-name">You</div>
          <br>
          <div class="ending-credits-role">PROGRAMMING</div>
          <div class="ending-credits-name">You</div>
          <br>
          <div class="ending-credits-role">CARD & SYMBOL DESIGN</div>
          <div class="ending-credits-name">○ △ □ × ☆ ✓</div>
          <br>
          <div class="ending-credits-role">SPECIAL THANKS</div>
          <div class="ending-credits-name">Playtesters</div>
          <br><br>
          <div class="ending-credits-role">THANK YOU FOR PLAYING</div>
          <br><br><br>
        </div>
      </div>
      <button id="btn-skip-credits">スキップ</button>
    `;
    container.appendChild(el);
    el.querySelector('#btn-skip-credits').addEventListener('click',()=>{
      el.querySelector('#ending-credits-scroll')?.classList.remove('scrolling');
      App.showTitle();
    });
    // スクロールアニメーション開始
    setTimeout(()=>{
      const scroll=el.querySelector('#ending-credits-scroll');
      if(scroll) scroll.classList.add('scrolling');
    },50);
  },
};
