// タイトル：起動時最初に開かれるシーン
const TitleScene = {
  render(container){
    const el = document.createElement('div');
    el.className = 'title-screen';
    el.innerHTML = `
      <div>
        <div class="title-logo">三目ローグライク</div>
        <div class="title-sub">roguelike tic-tac-toe deckbuilder</div>
      </div>
      <div class="title-menu">
        <button id="btn-new">はじめから</button>
        <button id="btn-continue" disabled title="Chap6で実装予定">続きから</button>
        <button id="btn-relics" disabled title="Chap5で実装予定">レリック確認</button>
        <button id="btn-cards" disabled title="Chap4で実装予定">カード効果確認</button>
      </div>
    `;
    container.appendChild(el);

    el.querySelector('#btn-new').addEventListener('click', () => {
      GameState.initNewGame();
      App.showMapSelect();
    });
  }
};
