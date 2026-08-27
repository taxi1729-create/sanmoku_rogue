const TitleScene = {
  render(container){
    const el=document.createElement('div'); el.className='title-screen';
    const maxInfo=GameState.maxClearedFloor>0
      ?`<div class="title-record">最高クリア：第${GameState.maxClearedFloor}階層 ${GameState.maxClearedStage}</div>`:'';
    el.innerHTML=`
      <div>
        <div class="title-logo">三目ローグライク</div>
        <div class="title-sub">roguelike tic-tac-toe deckbuilder</div>
        ${maxInfo}
      </div>
      <div class="title-menu">
        <button id="btn-new">はじめから</button>
        <button id="btn-continue" id="btn-continue">続きから</button>
        <button id="btn-gallery">図鑑（発見した効果）</button>
      </div>
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
  },
};
