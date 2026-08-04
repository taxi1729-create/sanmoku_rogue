// インデックス：シーン遷移の管理と起動処理
const App = {
  container: null,

  init(){
    this.container = document.getElementById('app');
    this.showTitle();
  },

  showTitle(){
    this.container.innerHTML = '';
    TitleScene.render(this.container);
  },

  showMapSelect(){
    this.container.innerHTML = '';
    MapSelectScene.render(this.container);
  },

  showGameMain(stage){
    this.container.innerHTML = '';
    GameMainScene.render(this.container, stage);
  },

  showShop(){
    this.container.innerHTML = '';
    ShopScene.render(this.container);
  },
};

window.addEventListener('DOMContentLoaded', () => App.init());
