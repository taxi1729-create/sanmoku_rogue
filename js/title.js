const TitleScene = {
  render(container){
    const el=document.createElement('div'); el.className='title-screen';
    const maxInfo=GameState.maxClearedFloor>0
      ?`<div class="title-record">最高クリア：第${GameState.maxClearedFloor}階層 ${GameState.maxClearedStage}</div>`:'';
    // #3 ゲームスコア最高得点を表示
    const highScore=GlobalFunctions.getHighScore();
    const highScoreInfo=highScore>0?`<div class="title-record">最高得点：${GlobalFunctions.formatScore(highScore)}</div>`:'';
    el.innerHTML=`
      <div>
        <div class="title-logo">三目ローグライク</div>
        <div class="title-sub">roguelike tic-tac-toe deckbuilder</div>
        ${maxInfo}
        ${highScoreInfo}
      </div>
      <div class="title-menu">
        <button id="btn-new">はじめから</button>
        <button id="btn-continue" id="btn-continue">続きから</button>
        <button id="btn-gallery">図鑑（発見した効果）</button>
        <button id="btn-best-run">最高到達デッキ・レリックを見る</button>
        <button id="btn-skip-tutorial" class="title-toggle" type="button" aria-pressed="false">チュートリアルスキップ：<b>OFF</b></button>
      </div>
      ${typeof GameVersion!=='undefined'?`<div class="title-version"><span class="tv-ver">${GameVersion.version}</span><span class="tv-date">最終更新日 ${GameVersion.updated}</span><button type="button" id="btn-update-history" class="tv-history-btn">アップデート履歴</button></div>`:''}
    `;
    container.appendChild(el);
    el.querySelector('#btn-new').addEventListener('click',()=>{
      App.showSaveSlotSelect('new');
    });
    el.querySelector('#btn-continue').addEventListener('click',()=>{
      App.showSaveSlotSelect('load');
    });
    el.querySelector('#btn-gallery').addEventListener('click',()=>{
      App.showGallery();
    });
    el.querySelector('#btn-best-run').addEventListener('click',()=>{
      App.showBestRun();
    });
    // v1.07 チュートリアルスキップ（ONの間は各画面のチュートリアルを表示しない。最初の導入と5・10階層の啓示は対象外）
    const skipBtn=el.querySelector('#btn-skip-tutorial');
    const paintSkip=()=>{ const on=typeof TutorialOverlay!=='undefined'&&TutorialOverlay.isSkipOn&&TutorialOverlay.isSkipOn(); skipBtn.classList.toggle('on',!!on); skipBtn.setAttribute('aria-pressed',on?'true':'false'); skipBtn.querySelector('b').textContent=on?'ON':'OFF'; };
    if(skipBtn){ paintSkip(); skipBtn.addEventListener('click',()=>{ if(typeof TutorialOverlay==='undefined') return; TutorialOverlay.setSkip(!TutorialOverlay.isSkipOn()); paintSkip(); }); }
    const histBtn=el.querySelector('#btn-update-history');
    if(histBtn) histBtn.addEventListener('click',()=>this.showUpdateHistory());
  },
  // アップデート履歴モーダル（GameVersion.history を新しい順に表示）
  showUpdateHistory(){
    if(typeof GameVersion==='undefined') return;
    const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    const ov=document.createElement('div'); ov.className='pack-modal-overlay update-history-overlay';
    const body=GameVersion.history.map(h=>`<div class="uh-entry"><div class="uh-head"><b>${esc(h.version)}</b><span>${esc(h.date)}</span></div><ul>${(h.notes||[]).map(n=>`<li>${esc(n)}</li>`).join('')}</ul></div>`).join('');
    ov.innerHTML=`<div class="pack-modal update-history-modal"><h3>アップデート履歴</h3><div class="uh-list">${body}</div><button type="button" class="uh-close">閉じる</button></div>`;
    const close=()=>ov.remove();
    ov.querySelector('.uh-close').addEventListener('click',close);
    ov.addEventListener('click',e=>{ if(e.target===ov) close(); });
    document.body.appendChild(ov);
  },
};
