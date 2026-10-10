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
    if(typeof GameMeta!=='undefined'&&!GameMeta.isModeUnlocked(this.selectedGameMode)) this.selectedGameMode='normal';
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
    // #7 第5階層攻略で解放される追加モードは、未解放ならグレー表示＋「5階層攻略で解放」
    modes.forEach(m=>{
      const b=document.createElement('button');
      const locked=typeof GameMeta!=='undefined'&&!GameMeta.isModeUnlocked(m.id);
      b.innerHTML=locked?`${m.name}<small class="gamemode-lock">5階層攻略で解放</small>`:m.name;
      b.className='gamemode-btn'+(this.selectedGameMode===m.id?' active':'')+(locked?' locked':'');
      b.dataset.mode=m.id;
      if(locked){ b.disabled=true; b.setAttribute('aria-disabled','true'); }
      else b.addEventListener('click',()=>{ this.selectedGameMode=m.id; this.showSaveSlotSelect('new'); });
      btnRow.appendChild(b);
    });
    return wrap;
  },

  startNewGame(slotIndex){
    this.currentSaveSlot=slotIndex;
    if(typeof GameMeta!=='undefined'&&!GameMeta.isModeUnlocked(this.selectedGameMode)) this.selectedGameMode='normal';
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

  // 第5階層ボス撃破後：クリア報酬（爆発アップグレード等）の前に「神の啓示」を一度だけ挟む（チュートリアル非表示設定に関係なく常に再生）
  _floor5Revelation(next){
    if(typeof Revelation==='undefined'||!Revelation.shouldPlayFloor5()||(typeof ShopScene!=='undefined'&&ShopScene.miniShop)) return false;
    if(Revelation.isOpen()) return true;
    this.container.innerHTML='';
    Revelation.openFloor5().catch(e=>console.error(e))
      .then(()=>(typeof GameMeta!=='undefined')?GameMeta.onFloor5Cleared().catch(e=>console.error(e)):null) // #7 第5階層攻略でゲームモードを1つ解放
      .then(next);
    return true;
  },
  showMapSelect(){ if(this._floor5Revelation(()=>this.showMapSelect())) return; this.container.innerHTML=''; MapSelectScene.render(this.container); },
  showGameMain(stage){ this.container.innerHTML=''; GameMainScene.render(this.container,stage); },
  showShop(){ if(this._floor5Revelation(()=>this.showShop())) return; this.container.innerHTML=''; ShopScene.render(this.container); },
  // #2 階層10クリア時のエンディング（ゲームクリア画面＋スタッフロール）
  showEnding(){ try{ if(typeof GameMeta!=='undefined') GameMeta.setCleared10(); }catch(e){} this.container.innerHTML=''; EndingScene.render(this.container); }, // #8 10階層クリア特典（タイトルに裏世界）

  showGallery(){
    this.container.innerHTML='';
    const el=document.createElement('div'); el.className='title-screen gallery-screen';
    const g=GlobalFunctions.getGallery();
    // 図鑑：全項目を仕様書（エクセル）の並び順で固定サイズのマスに表示。未発見は空白マス、発見済みはタップで全文表示
    // 仕様書の順番（シートに無い項目はゲームデータ順で末尾、ゲームから消えた項目は表示しない）
    const SHEET={
      jamming:['スタン','サンダー','混乱','ブレイク','延命','ビンゴ阻害','リンク','引き直し','封印','誘導'],
      enhance:['数値強化','拡大','横拡張','マルマルチ','サンカクマルチ','シカクマルチ','バツマルチ','ハブ','連鎖','オールマルチ'],
      trait:['塗りつぶし','指令官','ネガティブ','ディスカード','レリック特攻','ミニマム','マキシマム','将軍','保留','竜頭蛇尾'],
      relic:['ビンゴ','チャージ','ダブル','奇数補正','偶数補正','マル補正','サンカク補正','シカク補正','コンボ','レリック強化','ペイント','ターン強化','ジャミング増強','空きマス強化','ドロー強化','背水の陣','補正基礎点強化','ラウンド強化','リロール強化','手札強化','G獲得'],
      relicEnhance:['廃棄強化','マルオール','シカクオール','サンカクオール','オンリーワン','ペアルック','ネガティブ','ディスカード','将軍','オールリンク','G獲得','ドロー強化','倍化','3倍化','バツ強化','NPC強化','山札強化','捨て札強化','ブラックカード','手番高速','グレードオール'],
    };
    const sheetOrder=(sheet,list,nameOf)=>{ const rank=x=>{ const i=sheet.indexOf(nameOf(x)); return i<0?sheet.length:i; }; return list.map((x,i)=>({x,i})).sort((a,b)=>rank(a.x)-rank(b.x)||a.i-b.i).map(o=>o.x); };
    const details=[];
    // entries: {found,icon,name,desc,cls,badge}
    const sec=(title,cols,entries)=>{
      const found=entries.filter(e=>e.found).length;
      const body=entries.map((e,i)=>{
        if(!e.found) return `<div class="gallery-item gi-blank" aria-label="未発見"><span class="gi-no">${i+1}</span></div>`;
        const di=details.push(e)-1;
        return `<button type="button" class="gallery-item ${e.cls||''}" data-gi="${di}"><span class="gi-no">${i+1}</span><div class="gallery-head"><span class="gallery-ico">${e.icon||''}</span><b>${e.name}</b></div>${e.badge?`<div class="gi-badge-row">${e.badge}</div>`:''}<div class="gallery-desc">${e.desc||''}</div></button>`;
      }).join('');
      return `<div class="gallery-section"><h3>${title}<small>${found} / ${entries.length}</small></h3><div class="gallery-list gl-cols-${cols}">${body}</div></div>`;
    };
    let html='<h2>図鑑</h2><div class="gallery-hint">発見した効果をタップすると全文を表示します</div>';
    const jamKeys=sheetOrder(SHEET.jamming,Object.keys(GameData.JAMMING_DESC),k=>k);
    html+=sec('ジャミング効果',3,jamKeys.map(k=>({found:g.jamming.includes(k),icon:GameData.iconFor('jamming',k),name:k,desc:GameData.JAMMING_DESC[k],cls:'gi-jam'})));
    const enhKeys=sheetOrder(SHEET.enhance,GameData.ENHANCE_NAME_POOL.slice(),k=>k);
    html+=sec('カード強化効果',3,enhKeys.map(k=>({found:g.enhance.includes(k),icon:GameData.iconFor('enhance',k),name:k,desc:GameData.ENHANCE_DESC[k],cls:'gi-enh'})));
    // 性質変化は TRAIT_NAME_POOL の10種のみ（塗りつぶし(レリック)・ネガティブ(パッシブ)は掲載しない）
    const traitKeys=sheetOrder(SHEET.trait,GameData.TRAIT_NAME_POOL.slice(),k=>k);
    html+=sec('性質変化',3,traitKeys.map(k=>({found:g.trait.includes(k),icon:GameData.iconFor('trait',k),name:k,desc:GameData.TRAIT_DESC[k],cls:'gi-trait'})));
    // レリック：グレードの低い順（ノーマル→レア→スーパーレア→レジェンド）、同グレード内は仕様書順。魔神のお墨付きはレジェンドの末尾
    const GRADE_ORDER=Object.keys(GameData.RELIC_GRADES||{normal:1,rare:1,super:1,legend:1});
    const gRank=r=>{ const i=GRADE_ORDER.indexOf(GameData.relicGrade(r)); return i<0?0:i; };
    const relicsSheet=sheetOrder(SHEET.relic,GameData.RELIC_POOL.filter(r=>r.id!=='majin_seal'),r=>r.name);
    const relics=relicsSheet.map((r,i)=>({r,i})).sort((a,b)=>gRank(a.r)-gRank(b.r)||a.i-b.i).map(o=>o.r);
    if(GameData.MAJIN_SEAL_RELIC) relics.push(GameData.MAJIN_SEAL_RELIC);
    html+=sec('レリック',2,relics.map(r=>({found:g.relic.includes(r.id),icon:GameIcons.relic(r),name:r.name,badge:GameMainScene.relicGradeBadgeHtml(r),desc:r.desc,cls:'gi-relic '+GameMainScene.relicGradeClass(r)})));
    const rens=sheetOrder(SHEET.relicEnhance,GameData.RELIC_ENHANCE_POOL.slice(),r=>r.name);
    html+=sec('レリック強化効果',2,rens.map(r=>({found:g.relicEnhance.includes(r.id),icon:GameData.iconFor('relicEnhance',r.id),name:r.name,desc:r.desc,cls:'gi-ren'})));
    // パッシブ：仕様書に一覧が無いためゲームデータ順（記号ごとにLv1→3、最後に魔力A→E）
    const pEntries=[];
    Object.keys(GameData.SYMBOL_PASSIVES).forEach(sym=>{ const t=GameData.SYMBOL_PASSIVES[sym];
      Object.keys(t).map(Number).sort((a,b)=>a-b).forEach(lv=>{ const p=t[lv];
        pEntries.push({found:g.passive.includes(sym+':'+lv),icon:GIconSym(sym),name:`${GameData.SYMBOL_PASSIVE_NAMES[sym]} Lv${lv}：${p.name}`,desc:p.desc,cls:'gi-passive'}); }); });
    Object.keys(GameData.MANA_STAGES).forEach(st=>{ const d=GameData.MANA_STAGES[st];
      pEntries.push({found:g.passive.includes('Mana:'+st),icon:GIcon('passive_mana'),name:d.name,desc:d.desc,cls:'gi-mana'}); });
    html+=sec('パッシブ',2,pEntries);
    html+='<button id="btn-back">タイトルへ</button>';
    html+='<div class="gallery-pop" hidden><div class="gallery-pop-card"></div></div>';
    el.innerHTML=html;
    this.container.appendChild(el);
    const pop=el.querySelector('.gallery-pop'), popCard=pop.querySelector('.gallery-pop-card');
    el.querySelectorAll('.gallery-item[data-gi]').forEach(b=>b.addEventListener('click',()=>{
      const e=details[+b.dataset.gi]; if(!e) return;
      popCard.className='gallery-pop-card '+(e.cls||'');
      popCard.innerHTML=`<div class="gallery-head"><span class="gallery-ico">${e.icon||''}</span><b>${e.name}</b></div>${e.badge?`<div class="gi-badge-row">${e.badge}</div>`:''}<div class="gallery-pop-desc">${e.desc||''}</div><button type="button" class="gallery-pop-close">閉じる</button>`;
      pop.hidden=false;
    }));
    pop.addEventListener('click',ev=>{ if(ev.target===pop||ev.target.closest('.gallery-pop-close')) pop.hidden=true; });
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
        <div class="br-stat br-stat-gold"><span class="br-stat-ico">${GIcon('gold_coin')}</span><span class="br-stat-label">所持金</span><b class="br-stat-val">${b.gold!=null?esc(b.gold):'-'}</b></div>
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
          Object.keys(table).map(Number).filter(t=>t<=tier).sort((a,c)=>a-c).map(t=>`<div class="br-d-line"><span class="br-d-lv">Lv${t}</span><span><b>${esc(table[t].name)}</b><br>${(table[t].desc)}</span></div>`).join('') });
    });
    manaKeys.forEach(k=>{ const d=GameData.MANA_STAGES[k];
      pItems.push({ html:`<span class="br-p-ico br-p-mana">${GIcon('passive_mana')}</span><span class="br-p-main"><span class="br-p-name">${esc(d.name)}</span><span class="br-p-lv">魔力</span></span>`,
        detail:`<div class="br-d-head"><span class="br-p-ico br-p-mana">${GIcon('passive_mana')}</span><b>${esc(d.name)}</b></div><div class="br-d-desc">${(d.desc)}</div>` }); });
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
      rDetail.innerHTML=`<div class="br-d-head">${GM.relicGradeIconHtml(r,'relic-ico-lg')}<b>${esc(r.name)}</b>${GM.relicGradeBadgeHtml(r)}<span class="br-d-no">${rSel+1}/${relics.length}</span></div><div class="br-d-desc">${(r.desc||'')}${r.sealValue!=null?`<br>n = <b>${esc(r.sealValue)}</b>`:''}</div>`+
        (ren?`<div class="relic-ren-detail"><span class="relic-ren-detail-ico">${GameIcons.has(ren.id)?GameIcons.svg(ren.id):''}</span><div class="relic-ren-detail-text"><div class="relic-ren-detail-name">レリック強化：${esc(ren.name)}</div><div class="info-desc relic-enhance-desc">${(ren.desc)}</div></div></div>`:'');
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
      if(c.enhance) lines.push(`<div class="br-d-line"><span class="br-d-ico">${GameData.iconFor('enhance',c.enhance)}</span><span><b class="desc-enhance">【${esc(c.enhance)}】</b>${(GameData.ENHANCE_DESC[c.enhance]||'')}</span></div>`);
      if(c.jamming) lines.push(`<div class="br-d-line"><span class="br-d-ico">${GameData.iconFor('jamming',c.jamming)}</span><span><b class="desc-jamming">【${esc(c.jamming)}】</b>${(GameData.JAMMING_DESC[c.jamming]||'')}</span></div>`);
      if(c.trait) lines.push(`<div class="br-d-line"><span class="br-d-ico">${GameData.iconFor('trait',c.trait)}</span><span><b class="desc-trait">【${esc(c.trait)}】</b>${(GameData.TRAIT_DESC[c.trait]||'')}</span></div>`);
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
