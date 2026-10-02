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
    // スタートイベント（神の寵愛）：新規ゲームのみ、マップへ行く前に発生する（完了時に StartEvent 側で saveGame 済み）
    if(typeof StartEvent!=='undefined'){
      this.container.innerHTML='';
      StartEvent.open().catch(e=>console.error(e)).then(()=>this.showMapSelect());
      return;
    }
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
    html+=sec('レリック',g.relic.filter(id=>allRelics.some(x=>x.id===id)).length,allRelics.length,g.relic.map(id=>{const r=allRelics.find(x=>x.id===id); return r?item(GameIcons.relic(r),`${r.name}${GameMainScene.relicGradeBadgeHtml(r)}`,r.desc,'gi-relic '+GameMainScene.relicGradeClass(r)):'';}).join(''));
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
  // #6 自身の最高到達時のデッキ・レリック・パッシブを確認（GUI：ステータスカード／パッシブ・レリックのチップ／ゲーム内と同じカードUIのグリッド）
  // 保存データ（GlobalFunctions.getBestRun()：deck/relics/passives/gold/score/floor/stageName/savedAt）は読むだけで形式は変えない
  showBestRun(){
    this.container.innerHTML='';
    const el=document.createElement('div'); el.className='title-screen best-run-screen';
    const b=GlobalFunctions.getBestRun();
    const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const GM=GameMainScene;
    let html='<h2 class="br-title">最高到達記録</h2>';
    if(!b){
      html+=`<div class="br-empty"><div class="br-empty-ico">${GIcon('btn_map')}</div><b>まだ記録がありません</b><p>ステージをクリアすると、最も深く到達した時の<br>デッキ・レリック・パッシブがここに記録されます。</p></div>`;
      html+='<button id="btn-back" class="br-back">タイトルへ</button>';
      el.innerHTML=html; this.container.appendChild(el);
      el.querySelector('#btn-back').addEventListener('click',()=>this.showTitle());
      return;
    }
    const deck=Array.isArray(b.deck)?b.deck:[];
    const relics=Array.isArray(b.relics)?b.relics:[];
    const ds=b.savedAt?new Date(b.savedAt).toLocaleString('ja-JP'):'';
    // ---- ヘッダー：到達ステージ＋ステータスカード（到達階層・最終スコア・所持金） ----
    html+=`<div class="br-head">
      <div class="br-reach"><span class="br-reach-tag">到達</span><b>第${esc(b.floor??'-')}階層</b>${b.stageName?`<span class="br-reach-stage">${esc(b.stageName)}</span>`:''}${ds?`<small>${esc(ds)}</small>`:''}</div>
      <div class="br-stats">
        <div class="br-stat br-stat-floor"><span class="br-stat-ico">${GIcon('btn_map')}</span><span class="br-stat-label">到達階層</span><b class="br-stat-val">${esc(b.floor??'-')}<small>階層</small></b></div>
        <div class="br-stat br-stat-score"><span class="br-stat-ico">${GIcon('fx_sparkle')}</span><span class="br-stat-label">最終スコア</span><b class="br-stat-val">${b.score!=null?esc(GlobalFunctions.formatScore(b.score)):'-'}</b></div>
        <div class="br-stat br-stat-gold"><span class="br-stat-ico br-coin">G</span><span class="br-stat-label">所持金</span><b class="br-stat-val">${b.gold!=null?esc(b.gold):'-'}<small>G</small></b></div>
      </div>
    </div>`;
    // ---- パッシブ：記号アイコン＋名称＋Lv（段階ピップ） ----
    const pEntries=b.passives?Object.entries(b.passives).filter(([sym,tier])=>tier>0):[];
    const manaKeys=(b.mana&&typeof b.mana==='object')?Object.keys(GameData.MANA_STAGES).filter(k=>k==='D'?(b.mana.D||[]).length>0:(k==='C'?(b.mana.C||0)>0:!!b.mana[k])):[];
    const pItems=[];
    pEntries.forEach(([sym,tier])=>{
      const table=GameData.SYMBOL_PASSIVES[sym]||{}; const max=Math.max(Object.keys(table).length,tier);
      pItems.push({ html:`<span class="br-p-ico sym-${esc(sym)}">${GameData.SYMBOL_ICON_KEY[sym]?GIcon(GameData.SYMBOL_ICON_KEY[sym]):esc(GameData.SYMBOL_LABEL?.[sym]||sym)}</span><span class="br-p-main"><span class="br-p-name">${esc(GameData.SYMBOL_PASSIVE_NAMES[sym]||sym)}</span><span class="br-p-lv">Lv${tier}<span class="br-p-pips">${Array.from({length:max},(_,k)=>`<i class="${k<tier?'on':''}"></i>`).join('')}</span></span></span>`,
        detail:`<div class="br-d-head"><span class="br-p-ico sym-${esc(sym)}">${GameData.SYMBOL_ICON_KEY[sym]?GIcon(GameData.SYMBOL_ICON_KEY[sym]):''}</span><b>${esc(GameData.SYMBOL_PASSIVE_NAMES[sym]||sym)} Lv${tier}</b></div>`+
          Object.keys(table).map(Number).filter(t=>t<=tier).sort((a,c)=>a-c).map(t=>`<div class="br-d-line"><span class="br-d-lv">Lv${t}</span><span><b>${esc(table[t].name)}</b><br>${esc(table[t].desc)}</span></div>`).join('') });
    });
    manaKeys.forEach(k=>{ const d=GameData.MANA_STAGES[k];
      pItems.push({ html:`<span class="br-p-ico br-p-mana">${GIcon('passive_mana')}</span><span class="br-p-main"><span class="br-p-name">${esc(d.name)}</span><span class="br-p-lv">魔力</span></span>`,
        detail:`<div class="br-d-head"><span class="br-p-ico br-p-mana">${GIcon('passive_mana')}</span><b>${esc(d.name)}</b></div><div class="br-d-desc">${esc(d.desc)}</div>` }); });
    html+=`<section class="br-sec"><h3 class="br-sec-h">パッシブ<small>${pItems.length}種</small></h3>${pItems.length?`<div class="br-passives">${pItems.map((it,i)=>`<button type="button" class="br-passive" data-pi="${i}">${it.html}</button>`).join('')}</div><div class="br-detail br-passive-detail" hidden></div>`:'<div class="br-none">なし</div>'}</section>`;
    // ---- レリック：アイコン＋名称＋強化効果アイコン＋グレード演出のチップ（タップで詳細） ----
    html+=`<section class="br-sec"><h3 class="br-sec-h">レリック<small>${relics.length}個</small><span class="br-sec-hint">タップで詳細</span></h3>${relics.length?`<div class="br-relics">${relics.map((r,i)=>`<button type="button" class="br-relic ${GM.relicGradeClass(r)}${r.relicEnhance?' has-ren':''}" data-ri="${i}"><span class="relic-ico">${GameIcons.relic(r)}</span><span class="br-relic-name">${esc(r.name)}</span>${GM.relicEnhanceBadgeHtml(r)}</button>`).join('')}</div><div class="br-detail br-relic-detail" hidden></div>`:'<div class="br-none">なし</div>'}</section>`;
    // ---- デッキ：統計＋ソート＋カードグリッド ----
    html+=`<section class="br-sec"><h3 class="br-sec-h">デッキ<small>${deck.length}枚</small><span class="br-sec-hint">カードをタップで効果</span></h3><div class="br-deck-stats"></div><div class="deck-sort-row br-sort-row"></div><div class="br-detail br-card-detail" hidden></div><div class="pack-card-grid br-deck-grid"></div></section>`;
    html+='<button id="btn-back" class="br-back">タイトルへ</button>';
    el.innerHTML=html;
    this.container.appendChild(el);
    el.querySelector('#btn-back').addEventListener('click',()=>this.showTitle());

    // パッシブ詳細
    const pDetail=el.querySelector('.br-passive-detail'); let pSel=null;
    el.querySelectorAll('.br-passive').forEach(btn=>btn.addEventListener('click',()=>{
      const i=+btn.dataset.pi; pSel=(pSel===i)?null:i;
      el.querySelectorAll('.br-passive').forEach(x=>x.classList.toggle('active',+x.dataset.pi===pSel));
      if(pSel==null){ pDetail.hidden=true; pDetail.innerHTML=''; } else { pDetail.hidden=false; pDetail.innerHTML=pItems[pSel].detail; }
    }));
    // レリック詳細（グレード枠のアイコン・グレード名・説明・レリック強化）
    const rDetail=el.querySelector('.br-relic-detail'); let rSel=null;
    const showRelic=(i)=>{
      rSel=(rSel===i)?null:i;
      el.querySelectorAll('.br-relic').forEach(x=>x.classList.toggle('active',+x.dataset.ri===rSel));
      if(!rDetail) return;
      rDetail.className='br-detail br-relic-detail';
      if(rSel==null){ rDetail.hidden=true; rDetail.innerHTML=''; return; }
      const r=relics[rSel]; const ren=GM.relicEnhanceOf(r);
      rDetail.classList.add(GM.relicGradeClass(r));
      rDetail.hidden=false;
      rDetail.innerHTML=`<div class="br-d-head">${GM.relicGradeIconHtml(r,'relic-ico-lg')}<b>${esc(r.name)}</b>${GM.relicGradeBadgeHtml(r)}<span class="br-d-no">${rSel+1}/${relics.length}</span></div><div class="br-d-desc">${esc(r.desc||'')}${r.sealValue!=null?`<br>n = <b>${esc(r.sealValue)}</b>`:''}</div>`+
        (ren?`<div class="relic-ren-detail"><span class="relic-ren-detail-ico">${GameIcons.has(ren.id)?GameIcons.svg(ren.id):''}</span><div class="relic-ren-detail-text"><div class="relic-ren-detail-name">レリック強化：${esc(ren.name)}</div><div class="info-desc relic-enhance-desc">${esc(ren.desc)}</div></div></div>`:'');
    };
    el.querySelectorAll('.br-relic').forEach(btn=>btn.addEventListener('click',()=>showRelic(+btn.dataset.ri)));

    // デッキ統計
    const bySym={Circle:0,Triangle:0,Square:0,Cross:0}; let scoreSum=0,jamN=0,enhN=0,traitN=0;
    deck.forEach(c=>{ if(bySym[c.symbol]!==undefined) bySym[c.symbol]++; scoreSum+=c.baseScore||0; if(c.jamming) jamN++; if(c.enhance) enhN++; if(c.trait) traitN++; });
    const n=deck.length, avg=n>0?Math.round((scoreSum/n)*10)/10:0;
    const symTiles=GameData.SYMBOLS.map(sym=>`<div class="br-sym-tile sym-${sym}"><span class="br-sym-ico">${GIconSym(sym)}</span><b>${bySym[sym]||0}</b><span class="br-sym-bar"><i style="width:${n?Math.round((bySym[sym]||0)/n*100):0}%"></i></span></div>`).join('');
    el.querySelector('.br-deck-stats').innerHTML=`<div class="br-sym-tiles">${symTiles}</div>
      <div class="deck-stats-panel br-stats-panel">
        <span><small>合計</small><b>${n}</b>枚</span>
        <span><small>基礎点合計</small><b>${scoreSum}</b><em>（平均${avg}）</em></span>
        <span><small>強化</small><b>${enhN}</b></span>
        <span><small>ジャミング</small><b>${jamN}</b></span>
        <span><small>性質</small><b>${traitN}</b></span>
      </div>`;
    // ソート（表示専用）＋グリッド
    const symbolOrder={Circle:0,Triangle:1,Square:2,Cross:3};
    let sortMode='default'; let cSel=null;
    const grid=el.querySelector('.br-deck-grid'); const cDetail=el.querySelector('.br-card-detail');
    const sorted=()=>{ const arr=deck.map((c,i)=>({c,i}));
      if(sortMode==='symbol') arr.sort((a,z)=>((symbolOrder[a.c.symbol]??9)-(symbolOrder[z.c.symbol]??9))||((z.c.baseScore||0)-(a.c.baseScore||0))||(a.i-z.i));
      else if(sortMode==='score') arr.sort((a,z)=>((z.c.baseScore||0)-(a.c.baseScore||0))||(a.i-z.i));
      return arr; };
    const cardDetailHtml=(c)=>{
      const lines=[];
      if(c.enhance) lines.push(`<div class="br-d-line"><span class="br-d-ico">${GameData.iconFor('enhance',c.enhance)}</span><span><b class="desc-enhance">【${esc(c.enhance)}】</b>${esc(GameData.ENHANCE_DESC[c.enhance]||'')}</span></div>`);
      if(c.jamming) lines.push(`<div class="br-d-line"><span class="br-d-ico">${GameData.iconFor('jamming',c.jamming)}</span><span><b class="desc-jamming">【${esc(c.jamming)}】</b>${esc(GameData.JAMMING_DESC[c.jamming]||'')}</span></div>`);
      if(c.trait) lines.push(`<div class="br-d-line"><span class="br-d-ico">${GameData.iconFor('trait',c.trait)}</span><span><b class="desc-trait">【${esc(c.trait)}】</b>${esc(GameData.TRAIT_DESC[c.trait]||'')}</span></div>`);
      return `<div class="br-d-head"><span class="br-p-ico sym-${esc(c.symbol)}">${GameData.SYMBOL_ICON_KEY[c.symbol]?GIcon(GameData.SYMBOL_ICON_KEY[c.symbol]):''}</span><b>基礎点 ${esc(c.baseScore??0)}</b></div>`+(lines.length?lines.join(''):'<div class="br-d-desc">付与効果なし</div>');
    };
    const rebuild=()=>{
      grid.innerHTML='';
      sorted().forEach(({c,i})=>{
        const cardEl=document.createElement('div');
        cardEl.className='card'+(c.trait?` trait-${String(c.trait).replace(/[()]/g,'')}`:'')+(cSel===i?' br-card-picked':'');
        cardEl.innerHTML=`${GM.cardTagsHtml(c)}${GM.cardSymbolHtml(c)}${GM.cardScoreHtml(c,0)}`;
        cardEl.addEventListener('click',()=>{ cSel=(cSel===i)?null:i; if(cSel==null){ cDetail.hidden=true; cDetail.innerHTML=''; } else { cDetail.hidden=false; cDetail.innerHTML=cardDetailHtml(c); } grid.querySelectorAll('.card').forEach(x=>x.classList.remove('br-card-picked')); if(cSel!=null) cardEl.classList.add('br-card-picked'); });
        grid.appendChild(cardEl);
      });
      if(!deck.length) grid.innerHTML='<div class="br-none">なし</div>';
    };
    const sortRow=el.querySelector('.br-sort-row');
    [['default','初期順'],['symbol','記号順'],['score','基礎点順']].forEach(([v,label])=>{
      const bt=document.createElement('button'); bt.type='button'; bt.textContent=label; bt.className='deck-sort-btn'+(sortMode===v?' active':'');
      bt.addEventListener('click',()=>{ sortMode=v; sortRow.querySelectorAll('.deck-sort-btn').forEach(x=>x.classList.toggle('active',x===bt)); rebuild(); });
      sortRow.appendChild(bt);
    });
    rebuild();
  },
};
window.addEventListener('DOMContentLoaded',()=>App.init());
