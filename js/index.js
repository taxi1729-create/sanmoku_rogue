const App = {
  container: null,
  currentSaveSlot: 0,
  selectedGameMode: 'normal', // #9 「はじめから」画面で選択するゲームモード

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
        const modeTag=(save.gameMode&&save.gameMode!=='normal')?` [${GameData.GAME_MODES[save.gameMode]?.name||save.gameMode}]`:'';
        btn.innerHTML=`<div class="slot-info"><b>スロット${i+1}</b>${modeTag} 第${save.currentFloor||1}階層 G:${save.gold||0} （${ds}）</div>`;
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
    // #9 「はじめから」の場合のみ、セーブデータ欄の下にゲームモード選択欄を追加する
    if(mode==='new'){
      el.appendChild(this.renderGameModeSelector());
    }
  },

  // #9 ゲームモード選択（現在のモード表示＋切替＋初期デッキ/レリック/パッシブのプレビュー）
  renderGameModeSelector(){
    const wrap=document.createElement('div'); wrap.className='gamemode-select';
    wrap.style.marginTop='20px';
    const modes=Object.values(GameData.GAME_MODES);
    const current=GameData.GAME_MODES[this.selectedGameMode]||GameData.GAME_MODES.normal;
    wrap.innerHTML=`
      <div class="shop-section-title">ゲームモード：現在のモードは${current.name}です</div>
      <div class="gamemode-btn-row"></div>
      <div class="gamemode-preview">
        <div class="info-desc"><b>初期デッキ：</b>${current.deckDesc}</div>
        <div class="info-desc"><b>初期所持レリック：</b>${current.relicDesc}</div>
        <div class="info-desc"><b>初期付与パッシブ：</b>${current.passiveDesc}</div>
      </div>
    `;
    const btnRow=wrap.querySelector('.gamemode-btn-row');
    modes.forEach(m=>{
      const b=document.createElement('button');
      b.textContent=m.name;
      b.className='gamemode-btn'+(this.selectedGameMode===m.id?' active':'');
      b.addEventListener('click',()=>{ this.selectedGameMode=m.id; this.showSaveSlotSelect('new'); });
      btnRow.appendChild(b);
    });
    return wrap;
  },

  startNewGame(slotIndex){
    this.currentSaveSlot=slotIndex;
    GameState.initNewGame(this.selectedGameMode);
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
    GlobalFunctions.recordOwned(); // #7 図鑑：所持レリック強化・パッシブを記録
    GlobalFunctions.saveSlot(this.currentSaveSlot, GameState.toSaveData());
  },

  showMapSelect(){ this.container.innerHTML=''; MapSelectScene.render(this.container); },
  showGameMain(stage){ this.container.innerHTML=''; GameMainScene.render(this.container,stage); },
  showShop(){ this.container.innerHTML=''; ShopScene.render(this.container); },
  // #2 階層10クリア時のエンディング（ゲームクリア画面＋スタッフロール）
  showEnding(){ this.container.innerHTML=''; EndingScene.render(this.container); },

  showGallery(){
    this.container.innerHTML='';
    const el=document.createElement('div'); el.className='title-screen'; el.style.marginTop='4vh';
    const g=GlobalFunctions.getGallery();
    // #7 図鑑：各効果に対応するアイコンを付け、レリック強化効果・パッシブも掲載する
    const item=(icon,name,desc,cls='')=>`<div class="gallery-item ${cls}"><div class="gallery-head"><span class="gallery-ico">${icon||''}</span><b>${name}</b></div><div class="gallery-desc">${desc||''}</div></div>`;
    const sec=(title,count,total,body)=>`<div class="gallery-section"><h3>${title}（${count}${total!=null?' / '+total:''}件）</h3><div class="gallery-list">${body||'<div class="gallery-desc">まだ発見していません</div>'}</div></div>`;
    let html='<h2>図鑑</h2>';
    html+=sec('ジャミング効果',g.jamming.length,Object.keys(GameData.JAMMING_DESC).length,g.jamming.map(k=>item(GameData.iconFor('jamming',k),k,GameData.JAMMING_DESC[k],'gi-jam')).join(''));
    html+=sec('カード強化効果',g.enhance.length,GameData.ENHANCE_NAME_POOL.length,g.enhance.map(k=>item(GameData.iconFor('enhance',k),k,GameData.ENHANCE_DESC[k],'gi-enh')).join(''));
    html+=sec('性質変化',g.trait.length,Object.keys(GameData.TRAIT_DESC).length,g.trait.map(k=>item(GameData.iconFor('trait',k),k,GameData.TRAIT_DESC[k],'gi-trait')).join(''));
    const allRelics=[...GameData.RELIC_POOL,GameData.MAJIN_SEAL_RELIC];
    html+=sec('レリック',g.relic.filter(id=>allRelics.some(x=>x.id===id)).length,allRelics.length,g.relic.map(id=>{const r=allRelics.find(x=>x.id===id); return r?item(GameIcons.relic(r),r.name,r.desc,'gi-relic'):'';}).join(''));
    html+=sec('レリック強化効果',g.relicEnhance.length,GameData.RELIC_ENHANCE_POOL.length,g.relicEnhance.map(id=>{const r=GameData.RELIC_ENHANCE_POOL.find(x=>x.id===id); return r?item(GameData.iconFor('relicEnhance',id),r.name,r.desc,'gi-ren'):'';}).join(''));
    const pBody=g.passive.map(k=>{
      const [sym,lv]=k.split(':');
      if(sym==='Mana'){ const d=GameData.MANA_STAGES[lv]; return d?item(GIcon('passive_mana'),d.name,d.desc,'gi-mana'):''; }
      const p=GameData.SYMBOL_PASSIVES[sym]?.[lv]; if(!p) return '';
      return item(GIconSym(sym),`${GameData.SYMBOL_PASSIVE_NAMES[sym]} Lv${lv}：${p.name}`,p.desc,'gi-passive');
    }).join('');
    const passiveTotal=Object.values(GameData.SYMBOL_PASSIVES).reduce((n,t)=>n+Object.keys(t).length,0)+5;
    html+=sec('パッシブ',g.passive.length,passiveTotal,pBody);
    html+='<button id="btn-back">タイトルへ</button>';
    el.innerHTML=html;
    this.container.appendChild(el);
    el.querySelector('#btn-back').addEventListener('click',()=>this.showTitle());
  },
  // #6 自身の最高到達時のデッキ・レリックを確認
  showBestRun(){
    this.container.innerHTML='';
    const el=document.createElement('div'); el.className='title-screen'; el.style.marginTop='4vh';
    const b=GlobalFunctions.getBestRun();
    let html='<h2>最高到達時のデッキ・レリック</h2>';
    if(!b){
      html+='<div class="gallery-desc">まだ記録がありません</div>';
    }else{
      const d=new Date(b.savedAt); const ds=d.toLocaleString('ja-JP');
      html+=`<div class="title-record">第${b.floor}階層 ${b.stageName} 到達時（${ds}）</div>`;
      // #10 最高到達時の所持金・最終スコア・所持パッシブも掲載する
      html+=`<div class="title-record">所持金：${b.gold!=null?b.gold+'G':'-'} ／ 最終スコア：${b.score!=null?GlobalFunctions.formatScore(b.score):'-'}</div>`;
      if(b.passives){
        const passiveEntries=Object.entries(b.passives).filter(([sym,tier])=>tier>0);
        html+=`<div class="gallery-section"><h3>パッシブ</h3><div class="gallery-desc">${passiveEntries.length>0?passiveEntries.map(([sym,tier])=>`${GameData.SYMBOL_ICON_KEY[sym]?GIconSym(sym):''}${GameData.SYMBOL_PASSIVE_NAMES[sym]||sym}Lv${tier}`).join('　'):'なし'}</div></div>`;
      }
      html+=`<div class="gallery-section"><h3>レリック（${(b.relics||[]).length}件）</h3><div class="gallery-list">`;
      (b.relics||[]).forEach(r=>{
        const ren=r.relicEnhance?GameData.RELIC_ENHANCE_POOL.find(x=>x.id===r.relicEnhance):null;
        html+=`<div class="gallery-item"><b>${r.name}</b>${ren?`<span class="relic-enhance-tag"> ${ren.name}</span>`:''}<div class="gallery-desc">${r.desc}${ren?`<br>【${ren.name}】${ren.desc}`:''}</div></div>`;
      });
      html+='</div></div>';
      html+=`<div class="gallery-section"><h3>デッキ（${(b.deck||[]).length}枚）</h3><div class="gallery-card-grid"></div></div>`;
    }
    html+='<button id="btn-back">タイトルへ</button>';
    el.innerHTML=html;
    this.container.appendChild(el);
    // #7 デッキ確認：性質変化(トレイト)の見た目（材質・アニメーション）をゲーム内カードと同じに反映する
    if(b){
      const grid=el.querySelector('.gallery-card-grid');
      if(grid) (b.deck||[]).forEach(c=>{
        const cardEl=document.createElement('div');
        cardEl.className='card'+(c.trait?` trait-${c.trait.replace(/[()]/g,'')}`:'');
        cardEl.innerHTML=`${GameMainScene.cardTagsHtml(c)}${GameMainScene.cardSymbolHtml(c)}${GameMainScene.cardScoreHtml(c,0)}`;
        grid.appendChild(cardEl);
      });
    }
    el.querySelector('#btn-back').addEventListener('click',()=>this.showTitle());
  },
};
window.addEventListener('DOMContentLoaded',()=>App.init());
