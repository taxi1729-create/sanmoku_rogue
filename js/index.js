const App = {
  container: null,
  currentSaveSlot: 0,

  init(){
    this.container=document.getElementById('app');
    // maxClearedFloor を localStorage から読み込む
    const saves=GlobalFunctions.getSaves();
    let maxFloor=0, maxStage='';
    saves.forEach(s=>{if(s&&s.maxClearedFloor>maxFloor){maxFloor=s.maxClearedFloor;maxStage=s.maxClearedStage||'';}});
    GameState.maxClearedFloor=maxFloor; GameState.maxClearedStage=maxStage;
    this.showTitle();
  },

  showTitle(){ this.container.innerHTML=''; TitleScene.render(this.container); },

  showSaveSlotSelect(mode){
    this.container.innerHTML='';
    const el=document.createElement('div'); el.className='title-screen';
    const saves=GlobalFunctions.getSaves();
    el.innerHTML=`<h2>${mode==='new'?'セーブスロット選択（新規）':'セーブスロット選択（続きから）'}</h2><div id="slot-list" class="slot-list"></div><button id="btn-back-title" style="margin-top:16px;">戻る</button>`;
    this.container.appendChild(el);
    el.querySelector('#btn-back-title').addEventListener('click',()=>this.showTitle());
    const slotList=el.querySelector('#slot-list');
    for(let i=0;i<3;i++){
      const save=saves[i];
      const btn=document.createElement('div'); btn.className='save-slot'+(save?' has-save':'');
      if(save){
        const d=new Date(save.savedAt); const ds=d.toLocaleString('ja-JP');
        btn.innerHTML=`<div class="slot-info"><b>スロット${i+1}</b> 第${save.currentFloor||1}階層 G:${save.gold||0} （${ds}）</div>`;
        if(mode==='load'){
          const loadBtn=document.createElement('button'); loadBtn.textContent='ロード';
          loadBtn.addEventListener('click',()=>{ this.currentSaveSlot=i; this.loadGame(i); });
          btn.appendChild(loadBtn);
        }
        if(mode==='new'){
          const overBtn=document.createElement('button'); overBtn.textContent='このスロットで開始（上書き）';
          overBtn.addEventListener('click',()=>{ this.currentSaveSlot=i; this.startNewGame(i); });
          btn.appendChild(overBtn);
        }
      }else{
        btn.innerHTML=`<div class="slot-info"><b>スロット${i+1}</b>（空き）</div>`;
        if(mode==='new'){
          const newBtn=document.createElement('button'); newBtn.textContent='このスロットで開始';
          newBtn.addEventListener('click',()=>{ this.currentSaveSlot=i; this.startNewGame(i); });
          btn.appendChild(newBtn);
        }
      }
      slotList.appendChild(btn);
    }
  },

  startNewGame(slotIndex){
    this.currentSaveSlot=slotIndex;
    GameState.initNewGame();
    GameState.currentFloor=1;
    this.showMapSelect();
  },

  loadGame(slotIndex){
    const save=GlobalFunctions.loadSlot(slotIndex);
    if(!save){ alert('セーブデータがありません'); return; }
    GameState.initNewGame();
    GameState.fromSaveData(save);
    this.currentSaveSlot=slotIndex;
    this.showMapSelect();
  },

  saveGame(){
    GlobalFunctions.saveSlot(this.currentSaveSlot, GameState.toSaveData());
  },

  showMapSelect(){ this.container.innerHTML=''; MapSelectScene.render(this.container); },
  showGameMain(stage){ this.container.innerHTML=''; GameMainScene.render(this.container,stage); },
  showShop(){ this.container.innerHTML=''; ShopScene.render(this.container); },

  showGallery(){
    this.container.innerHTML='';
    const el=document.createElement('div'); el.className='title-screen'; el.style.marginTop='4vh';
    const g=GlobalFunctions.getGallery();
    const sections=[
      ['ジャミング効果',g.jamming,GameData.JAMMING_DESC],
      ['カード強化効果',g.enhance,GameData.ENHANCE_DESC],
      ['性質変化',g.trait,GameData.TRAIT_DESC],
    ];
    let html='<h2>図鑑</h2>';
    sections.forEach(([title,keys,desc])=>{
      html+=`<div class="gallery-section"><h3>${title}（${keys.length}件）</h3><div class="gallery-list">`;
      keys.forEach(k=>{ html+=`<div class="gallery-item"><b>${k}</b><div class="gallery-desc">${desc[k]||''}</div></div>`; });
      html+='</div></div>';
    });
    html+=`<div class="gallery-section"><h3>レリック（${g.relic.length}件）</h3><div class="gallery-list">`;
    g.relic.forEach(id=>{
      const r=GameData.RELIC_POOL.find(x=>x.id===id);
      if(r) html+=`<div class="gallery-item"><b>${r.name}</b><div class="gallery-desc">${r.desc}</div></div>`;
    });
    html+='</div></div>';
    html+='<button id="btn-back">タイトルへ</button>';
    el.innerHTML=html;
    this.container.appendChild(el);
    el.querySelector('#btn-back').addEventListener('click',()=>this.showTitle());
  },
};
window.addEventListener('DOMContentLoaded',()=>App.init());
