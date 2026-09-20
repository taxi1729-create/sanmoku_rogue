const GameMainScene = {
  container:null, stage:null,
  board:[], windows:[], quadSiblings:{}, scoredWindowKeys:new Set(),
  prevRoundBingoSymbol:null, prevRoundScore:0, chargeActive:false,
  turnInRound:1, currentSide:'player', selectedCardId:null, boardInfoCell:null,
  logs:[], resultState:null, scoringAnim:null,
  rerollMode:false, rerollSelected:new Set(),
  effects:{ stunNextNpc:false, confuseNextNpc:false, breakCellIdx:null, linkRestrict:null, redirectBan:null, sealCell:null, lureRestrict:false },
  bossEffect:null, blockedCells:new Set(), bossBlackedOut:false,
  lastNpcCell:null, lastPlacedCell:null, turnsBonus_bossRestore:0, activeRelicId:null, scoringRelicIds:[],
  expandPending:null, paintPending:null,
  unifyRestoreData:null, // #2 統一ボス効果の復元用

  sleep(ms){ return new Promise(res=>setTimeout(res,ms)); },

  render(container,stage){
    this.container=container; this.stage=stage;
    // #3 ホシパッシブ2：5×5マスでプレイ
    GameData.BOARD_SIZE = GameState.symbolPassiveTier.Hoshi>=2 ? 5 : 4;
    this.board=new Array(GameData.BOARD_SIZE*GameData.BOARD_SIZE).fill(null);
    this.windows=this.buildWindows(GameData.BOARD_SIZE);
    this.logs=[]; this.resultState=null; this.boardInfoCell=null; this.scoringAnim=null;
    this.rerollMode=false; this.rerollSelected=new Set();
    this.prevRoundBingoSymbol=null; this.prevRoundScore=0; this.chargeActive=false;
    this.bossEffect=null; this.bossEffects=null; this.blockedCells=new Set(); this.bossBlackedOut=false;
    this.lastNpcCell=null; this.lastPlacedCell=null; this.activeRelicId=null; this.scoringRelicIds=[];
    this.justPlacedCell=null; this.justPlacedCells=null;
    this.justDrawnIds=new Set(); // #6 ドロー演出用
    this.extendActive=false; // #4 エクステンド
    GameState.currentDeck.forEach(c=>GlobalFunctions.recordCard(c)); // #5 図鑑：所持デッキの発見効果を反映
    GameState.relics.forEach(r=>GlobalFunctions.recordRelic(r.id));
    this.turnsBonus_bossRestore=0; this.expandPending=null; this.paintPending=null;
    this.unifyRestoreData=null;
    this.effects={stunNextNpc:false,confuseNextNpc:false,breakCellIdx:null,linkRestrict:null,redirectBan:null,sealCell:null,lureRestrict:false};
    GameState.initStage(stage);
    this.applyBossEffect();
    this.applyRelicInitEffects();
    this.stageBonusRounds=0;
    this.pendingDelayedJamming=[];
    // #8 マルパッシブ1：ゲーム開始時、ランダムなマルカード3×n枚（n=マルビンゴ倍率/10 切り捨て）にネガティブ(パッシブ)を付与する
    //    （既存の性質変化は上書きしない。ただしペイントの塗りつぶしは上書きする）。Lv1/Lv2入れ替えによりLv1条件に変更
    this._circleNegCards=null;
    if(GameState.symbolPassiveTier.Circle>=1){
      const n=Math.floor((GameData.BINGO_MULTIPLIER_BASE.Circle||0)/10);
      const count=3*n;
      const candidates=GameState.currentDeck.filter(c=>c.symbol==='Circle'&&(!c.trait||c.trait==='塗りつぶし(レリック)'||c.trait==='塗りつぶし'));
      const targets=GlobalFunctions.shuffle(candidates.slice()).slice(0,count);
      targets.forEach(c=>{ c.trait='ネガティブ(パッシブ)'; });
      this._circleNegCards=targets;
      this.addLog(`マルパッシブ1：マルカード${targets.length}枚にネガティブ(パッシブ)を付与`);
    }
    // #3 ホシパッシブ3：ゲーム開始時、目標点数の30%を現在の点数に加算
    if(GameState.symbolPassiveTier.Hoshi>=3){
      const bonus=Math.round(GameState.targetScore*0.3);
      GameState.currentScore=Math.max(0,GameState.currentScore+bonus);
      this.addLog(`ホシパッシブ3：目標点数の30%（+${bonus}点）を開始時に加算`);
    }
    GameState.bingoCountThisStage=0;
    // #6 ゲーム開始時：ボスステージクリア時と同様に、記号パッシブを3択（条件次第で4択）からランダムに1つ受け取れるようにする
    if(!GameState.initialPassiveGranted){
      GameState.initialPassiveGranted=true;
      const picks=this.generatePassiveChoicePicks();
      if(picks){ this.pendingPassiveChoice=picks; this.passiveModalOpen=true; this.passiveChoiceContext='start'; }
    }
    this.startRound();
    TutorialOverlay.show('gameMain'); // #1 初回のみゲームメイン画面のチュートリアルを表示
  },

  // #5 ビンゴ演出：8マス（カード基礎点／補正基礎点／ビンゴ倍率／補正倍率／列補正／最終乗算補正／最終加算補正／加算点数）
  cellIndex(r,c){ return r*GameData.BOARD_SIZE+c; },
  renderScoreCalcBoard(){
    if(!this.scoreBoxes||!this.scoreBoxes.items) return null;
    const wrap=document.createElement('div'); wrap.className='score-calc-grid';
    this.scoreBoxes.items.forEach(it=>{
      const d=document.createElement('div'); d.className='score-calc-box'+(it.cls?' '+it.cls:'');
      d.innerHTML=`<div class="scb-label">${it.label}</div><div class="scb-value">${it.value}</div>`;
      wrap.appendChild(d);
    });
    return wrap;
  },

  // #2 ブレイク：このカードが盤面にある間、バツのビンゴはラウンドを終了させない
  isBreakActive(){ const idx=this.effects.breakCellIdx; return idx!=null && this.board[idx]?.card?.jamming==='ブレイク'; },

  // #6 階層10特有ボス効果：ターン6,11,16…判定
  isForcedNpcTurn(turnNum){ return turnNum>=6 && (turnNum-6)%5===0; },

  // #4 レリック強化「廃棄強化」所持時は、捨て札になるカードを全て廃棄札へ送る
  pushToDiscard(card){
    // #4 ギャンブル：捨て札に行く時にリセットする
    if(card.enhance==='ギャンブル'&&card._gambleDelta){ card.baseScore-=card._gambleDelta; card._gambleDelta=0; }
    if(GameState.relics.some(r=>r.relicEnhance==='ren_discard')) GameState.discardedPile.push(card);
    else GameState.discardPile.push(card);
  },

  buildWindows(size){
    const dirs=[{dr:0,dc:1,type:'row'},{dr:1,dc:0,type:'col'},{dr:1,dc:1,type:'diag'},{dr:1,dc:-1,type:'diag'}];
    const maximal=[];
    for(const {dr,dc,type} of dirs) for(let r=0;r<size;r++) for(let c=0;c<size;c++){
      const pr=r-dr,pc=c-dc; if(pr>=0&&pr<size&&pc>=0&&pc<size) continue;
      const line=[]; let rr=r,cc=c;
      while(rr>=0&&rr<size&&cc>=0&&cc<size){ line.push(this.cellIndex(rr,cc)); rr+=dr; cc+=dc; }
      if(line.length>=3) maximal.push({line,type});
    }
    const windows=[]; const qs={};
    for(const {line,type} of maximal){
      if(line.length===5){
        // #2 ホシパッシブ2：5列ビンゴ。中央3マス窓が2つの4列窓で重複生成され二重加算されるバグを修正
        // 生成する窓：5列窓1つ、4列窓2つ、3列窓3つ（[0-2],[1-3],[2-4]。中央[1-3]は両4列窓で共有）
        const pi=windows.length;
        windows.push({cells:line.slice(0,5),type,isPenta:true,isQuad:false});
        const triA=windows.length; windows.push({cells:line.slice(0,3),type,isQuad:false});
        const triMid=windows.length; windows.push({cells:line.slice(1,4),type,isQuad:false});
        const triC=windows.length; windows.push({cells:line.slice(2,5),type,isQuad:false});
        const q1=windows.length; windows.push({cells:line.slice(0,4),type,isQuad:true});
        const q2=windows.length; windows.push({cells:line.slice(1,5),type,isQuad:true});
        qs[q1]=[triA,triMid];
        qs[q2]=[triMid,triC];
        qs[pi]=[q1,q2];
      }else if(line.length===4){
        const qi=windows.length;
        windows.push({cells:line.slice(0,4),type,isQuad:true});
        const s1=windows.length; windows.push({cells:line.slice(0,3),type,isQuad:false});
        const s2=windows.length; windows.push({cells:line.slice(1,4),type,isQuad:false});
        qs[qi]=[s1,s2];
      }else windows.push({cells:line,type,isQuad:false});
    }
    this.quadSiblings=qs; return windows;
  },

  applyRelicInitEffects(){
    // #3 「レリック使用不可」ボス効果の間はレリック効果を一切発動させない
    if(this.hasBossEffect('no_relic')) return;
    if(GameState.hasRelic('base_boost')) GameData.FINAL_ADD+=2000;
    if(GameState.hasRelic('paint')) this.applyPaintRelic();
    GameState.relics.forEach(r=>{
      if(r.relicEnhance==='ren_cross') GameData.BINGO_MULTIPLIER_BASE['Cross']*=5;
    });
  },

  applyPaintRelic(){
    // #5 ゲーム開始時、ランダムな記号を1つ選び、その記号のカード全てに塗りつぶし(レリック)を付与する
    const sym=GlobalFunctions.randChoice(GameData.SYMBOLS);
    GameState.currentDeck.forEach(c=>{ if(c.symbol===sym) c.trait='塗りつぶし(レリック)'; });
    this.addLog(`ペイント：${GameData.SYMBOL_LABEL[sym]}の全カードに塗りつぶし(レリック)を付与`);
  },

  removePaintRelic(){
    GameState.currentDeck.forEach(c=>{ if(c.trait==='塗りつぶし(レリック)') c.trait=null; });
    GameState.hand.forEach(c=>{ if(c.trait==='塗りつぶし(レリック)') c.trait=null; });
  },

  applyBossEffect(){
    if(this.stage.key!=='boss') return;
    // #6 階層10特有ボス効果：ターン6,11,16…は強制的にNPCの番になる（2つのランダムボス効果とは別枠）
    if(GameState.floor10SpecialBoss) this.addLog('ボス効果：「最終決戦」5ターンごと（6,11,16…ターン目）は強制的にNPCの番になる');
    // #2 マップ選択時に確定済みのボス効果を使用
    const effect = GameState.pendingBossEffect || (GameData.BOSS_EFFECT_POOL.length > 0 ? GlobalFunctions.randChoice(GameData.BOSS_EFFECT_POOL) : null);
    if(!effect) return;
    // #9 複数ボス効果（第5階層以降）が配列で渡された場合も全て適用されるように修正
    this.bossEffects = Array.isArray(effect) ? effect : [effect];
    this.bossEffect = this.bossEffects[0]; // 単一効果チェック箇所との後方互換用
    GameState.pendingBossEffect = null; // 使用済みにリセット（次の周回用）
    this.bossEffects.forEach(be=>{
      this.addLog(`ボス効果：「${be.name}」${be.desc}`);
      switch(be.id){
        case 'cross5000': GameState.currentDeck.forEach(c=>{if(c.symbol==='Cross') c.baseScore=5000;}); break;
        case 'block_cells': GlobalFunctions.shuffle(Array.from({length:GameData.BOARD_SIZE*GameData.BOARD_SIZE},(_,i)=>i)).slice(0,4).forEach(i=>this.blockedCells.add(i)); break;
        case 'blackout': this.bossBlackedOut=true; break;
        case 'unify':{
          const ch=GlobalFunctions.randChoice(['Circle','Triangle','Square']);
          this.unifyRestoreData={};
          GameData.SYMBOLS.forEach(s=>{
            this.unifyRestoreData[s]=GameData.BINGO_MULTIPLIER_BASE[s];
            if(s===ch) GameData.BINGO_MULTIPLIER_BASE[s]+=10;
            else if(s!=='Cross') GameData.BINGO_MULTIPLIER_BASE[s]-=20;
          });
          this.addLog(`統一：${GameData.SYMBOL_LABEL[ch]}倍率+10、他-20`);
          break;
        }
        case 'cross_corner':{ const bs=GameData.BOARD_SIZE; [0,bs-1,bs*(bs-1),bs*bs-1].forEach(i=>{this.board[i]={symbol:'Cross',baseScore:10,owner:'npc',card:null};}); break; }
        case 'turn_limit': this.turnsBonus_bossRestore=GameState.turnsBonus; GameState.turnsBonus=10-GameData.TURNS_PER_ROUND; break;
        case 'reroll_limit': GameState.rerollCount=0; break;
        case 'hand_limit': GameState.handSizeBonus=Math.min(-1,GameState.handSizeBonus-1); break;
        default: break;
      }
    });
  },

  // #9 複数ボス効果に対応した判定ヘルパー
  hasBossEffect(id){ return (this.bossEffects||(this.bossEffect?[this.bossEffect]:[])).some(e=>e.id===id); },

  startRound(){
    if(!this.hasBossEffect('cross_corner')) this.board=new Array(GameData.BOARD_SIZE*GameData.BOARD_SIZE).fill(null);
    // #8 チェックパッシブ2：盤面がリセットされる毎ラウンド、4隅にマル・シカク・サンカクのいずれかランダムな記号＋ランダムなマルチ効果のカードを配置し続ける
    if(GameState.symbolPassiveTier.Check>=2){
      const bs=GameData.BOARD_SIZE;
      const corners=[0,bs-1,bs*(bs-1),bs*bs-1];
      const cornerSymbols=['Circle','Square','Triangle'];
      const cornerMultis=['マルマルチ','シカクマルチ','サンカクマルチ','オールマルチ'];
      corners.forEach(idx=>{
        if(this.board[idx]) return;
        const sym=GlobalFunctions.randChoice(cornerSymbols);
        const multi=GlobalFunctions.randChoice(cornerMultis);
        const cornerCard={id:'check_corner_'+idx+'_'+Date.now()+'_'+Math.random(),symbol:sym,baseScore:100,number:100,enhance:multi,jamming:null,trait:null};
        this.board[idx]={symbol:sym,baseScore:100,owner:'player',card:cornerCard};
      });
      if(GameState.round===1) this.addLog('チェックパッシブ2：盤面4隅にランダムな記号・マルチ効果のカードを配置');
    }
    this.scoredWindowKeys=new Set(); this.turnInRound=1;
    const forceFirst=GameState.relics.some(r=>r.relicEnhance==='ren_first');
    this.currentSide=forceFirst?'player':((GameState.round%2===1)?'player':'npc');
    this.selectedCardId=null; this.boardInfoCell=null; this.rerollMode=false;
    this.rerollSelected=new Set(); this.activeRelicId=null;
    this.expandPending=null; this.paintPending=null;
    this.effects.linkRestrict=null; this.effects.stunNextNpc=false;
    this.effects.confuseNextNpc=false; this.effects.redirectBan=null;
    this.effects.sealCell=null; this.effects.lureRestrict=false;
    // #2 チェックパッシブ1：ラウンドごとにビンゴした記号の記録をリセット
    this.bingoSymbolsThisRound=new Set(); this._checkTriforceGranted=false;
    if(GameState.hasRelic('charge')&&GameState.round>1&&this.prevRoundScore===GameState.currentScore){
      this.chargeActive=true; this.addLog('チャージ発動：補正基礎点+100');
    }
    if(GameState.reserve.length>0){ GameState.hand.push(...GameState.reserve); GameState.reserve=[]; }
    this.drawToHandSize();
    this.addLog(`--- ラウンド ${GameState.round} 開始（先手：${this.currentSide==='player'?'プレイヤー':'NPC'}） ---`);
    this.renderAll();
    if(this.currentSide==='npc') this.scheduleAIMove();
    else this.checkAutoSkip();
  },

  endRound(){
    this.prevRoundScore=GameState.currentScore;
    // #7 レリック「ラウンド強化」：ラウンド終了時、最終加算補正+1000×n(n=現在ラウンド)
    if(GameState.hasRelic('round_boost')){
      const add=1000*GameState.round;
      GameData.FINAL_ADD+=add;
      this.addLog(`ラウンド強化：最終加算補正+${add}（現在ラウンド${GameState.round}）`);
    }
    for(const cell of this.board){
      if(!cell?.card) continue;
      const c=cell.card;
      if(c.trait==='保留'){
        GameState.reserve.push(c);
        // 保留カードは捨て札には入れない（次ラウンド手札へ戻る）
        continue;
      }
      if(this.hasBossEffect('discard_used')) GameState.discardedPile.push(c);
      else this.pushToDiscard(c);
    }
    // #1 保留：手札にある場合は捨てずにそのまま次ラウンドの手札に残す
    const keptHand=[];
    GameState.hand.forEach(c=>{
      if(c.trait==='保留'){ keptHand.push(c); return; }
      if(c.trait==='ディスカード') GameState.gold+=2;
      this.pushToDiscard(c);
    });
    GameState.hand=keptHand;
    // #5 ドロー関連の効果は重複可能：所持数分ドローする
    { const n=GameState.relics.filter(r=>r.relicEnhance==='ren_draw').length; for(let i=0;i<n;i++) this.drawOne(); }
    this.chargeActive=false;
    if(GameState.currentScore>=GameState.targetScore){ this.finishStage('win'); return; }
    // #8 チェックパッシブ3：3回ビンゴするまでラウンドが終了しない（延長し続ける）
    const checkExtend=GameState.symbolPassiveTier.Check>=3&&(GameState.bingoCountThisStage||0)<3;
    if(!checkExtend&&GameState.round>=GameState.effectiveMaxRounds()+(this.stageBonusRounds||0)){ this.finishStage('lose'); return; }
    if(checkExtend&&GameState.round>=GameState.effectiveMaxRounds()+(this.stageBonusRounds||0)){
      this.stageBonusRounds=(this.stageBonusRounds||0)+1;
      this.addLog('チェックパッシブ3：3回ビンゴするまでラウンド終了を延長');
    }
    GameState.round++;
    this.startRound();
  },

  // #6 記号パッシブの3択（セブンパッシブ条件を満たせば4択）を生成する共通処理（ボスクリア時・ゲーム開始時の両方で使用）
  generatePassiveChoicePicks(){
    const candidateSymbols=GameData.PASSIVE_SYMBOLS.filter(s=>(GameState.symbolPassiveTier[s]||0)<3);
    if(candidateSymbols.length===0) return null;
    const picks=GlobalFunctions.shuffle(candidateSymbols.slice()).slice(0,3);
    // #新規 セブンパッシブ：現在の点数の下1桁が7の時のみ、4つ目の選択肢として出現する
    const sevenTier=GameState.symbolPassiveTier.Seven||0;
    if(sevenTier<3 && Math.abs(GameState.currentScore)%10===7 && !picks.includes('Seven')){
      picks.push('Seven');
    }
    return picks.map(s=>({symbol:s,nextTier:(GameState.symbolPassiveTier[s]||0)+1}));
  },

  finishStage(result){
    // #3 ゲームスコア最高得点を記録
    GlobalFunctions.saveHighScoreIfBetter(GameState.currentScore);
    // #2 統一ボス効果の倍率を元に戻す
    if(this.hasBossEffect('turn_limit')) GameState.turnsBonus=this.turnsBonus_bossRestore;
    if(this.hasBossEffect('unify')&&this.unifyRestoreData){
      GameData.SYMBOLS.forEach(s=>{ GameData.BINGO_MULTIPLIER_BASE[s]=this.unifyRestoreData[s]; });
      this.unifyRestoreData=null;
    }
    this.resultState=result;
    // #4 マルパッシブ2：ステージ終了時にネガティブ(パッシブ)を除去する
    if(this._circleNegCards){
      this._circleNegCards.forEach(c=>{ if(c.trait==='ネガティブ(パッシブ)') c.trait=null; });
      this._circleNegCards=null;
    }
    // #3 ペイント：ステージ終了時、開始時に付与した塗りつぶし(レリック)を除去する
    if(GameState.hasRelic('paint')) this.removePaintRelic();
    // #4 ギャンブル：ゲーム終了時にリセットする
    GameState.currentDeck.forEach(c=>{ if(c.enhance==='ギャンブル'&&c._gambleDelta){ c.baseScore-=c._gambleDelta; c._gambleDelta=0; } });
    this.stageBonusRounds=0;
    if(result==='win'){
      if(this.stage&&!GameState.clearedStages.includes(this.stage.key)) GameState.clearedStages.push(this.stage.key);
      // #1 マルパッシブ3：ステージクリア時マルのビンゴ倍率を1.2倍(切り上げ)（1.5倍から変更）
      if(GameState.symbolPassiveTier.Circle>=3){
        const before=GameData.BINGO_MULTIPLIER_BASE.Circle;
        GameData.BINGO_MULTIPLIER_BASE.Circle=Math.ceil(before*1.2);
        this.addLog(`マルパッシブ：マル倍率 ${Math.round(before*100)/100}→${GameData.BINGO_MULTIPLIER_BASE.Circle}`);
      }
      // #12 最高クリア記録更新
      const stageOrder=['common','high','boss'];
      const stageIdx=stageOrder.indexOf(this.stage.key);
      const floorScore=GameState.currentFloor*3+stageIdx;
      const prevScore=(GameState.maxClearedFloor||0)*3+(stageOrder.indexOf(GameState.maxClearedStage||''));
      if(floorScore>prevScore){
        GameState.maxClearedFloor=GameState.currentFloor; GameState.maxClearedStage=this.stage.name;
        // #6 自身の最高到達時のデッキ・レリックを保存し、タイトルで確認できるようにする
        GlobalFunctions.saveBestRunIfBetter(floorScore,{
          floor:GameState.currentFloor, stageName:this.stage.name,
          deck:GameState.currentDeck, relics:GameState.relics, savedAt:Date.now(),
        });
      }
      const rd=this.calcClearReward();
      GameState.gold+=rd.total;
      // #7 ステージクリア報酬にも爆発通常アップグレードを組み込む（20%の確率でショップに用意される）
      let clearBonusMsg=null;
      if(GameState.currentDeck.length>0 && GameData.pickClearBonusType()==='normal_explosive_upgrade'){
        ShopScene.pickingPack = ShopScene.buildExplosiveUpgradePack(null);
        clearBonusMsg='💥爆発通常アップグレード：ショップで5つから最大3つまで選択できます';
      }
      GameState.lastReward={type:'clear',stageName:this.stage.name,gold:rd.total,breakdown:rd,debugLog:this.logs?this.logs.slice(-30):[],extra:clearBonusMsg};
      this.addLog(`クリア報酬：G+${rd.total}${rd.doubled?'（第6階層以降のため最終値を2倍）':''}${clearBonusMsg?'／'+clearBonusMsg:''}`);
      // #A ボスステージクリア時：記号パッシブを1つ選択
      if(this.stage.key==='boss'){
        this.pendingPassiveChoice=this.generatePassiveChoicePicks();
        this.passiveChoiceContext='boss'; // #6 選択後にショップへ進む通常フローと区別するためのコンテキスト
      }
      // #8 クリア時セーブ
      App.saveGame();
    } else if(result==='lose'){
      // #5 失敗時：開放済みのレリック・カード強化効果をタイトルの図鑑（デッキ確認）に反映し、進行中のデータを破棄する
      GameState.relics.forEach(r=>GlobalFunctions.recordRelic(r.id));
      GameState.currentDeck.forEach(c=>GlobalFunctions.recordCard(c));
      if(typeof App!=='undefined') GlobalFunctions.deleteSlot(App.currentSaveSlot);
      this.addLog('ステージ失敗：発見済みの効果・レリックを図鑑に記録し、進行中のセーブデータを破棄しました');
    }
    this.renderAll();
  },

  // #30/#7 報酬計算式：6 + 残りラウンド×2 + 残りリロール + レリック補正 + カード補正（第6階層以降は最終値を2倍）
  calcClearReward(){
    const base=6;
    const rawRoundBonus=Math.max(0,GameState.effectiveMaxRounds()+(this.stageBonusRounds||0)-GameState.round);
    const roundBonus=rawRoundBonus*2; // #7 ラウンド数×1 → ×2
    const rerollBonus=GameState.rerollCount;
    let relicBonus=0;
    if(GameState.hasRelic('gold_boost')) relicBonus+=3;
    GameState.relics.forEach(r=>{ if(r.relicEnhance==='ren_gold') relicBonus+=1; });
    const cardBonus=GameState.currentDeck.filter(c=>c.trait==='ディスカード').length;
    let total=base+roundBonus+rerollBonus+relicBonus+cardBonus;
    const doubled=GameState.currentFloor>=6; // #7 ステージ6以降は最終値を2倍
    if(doubled) total*=2;
    return {base,roundBonus,rerollBonus,relicBonus,cardBonus,total,doubled};
  },

  drawToHandSize(){ const n=GameState.effectiveHandSize()-GameState.hand.length; for(let i=0;i<n;i++) this.drawOne(); },
  drawOne(){
    if(GameState.drawPile.length===0){
      const ret=GameState.discardPile.filter(c=>!GameState.discardedPile.some(d=>d.id===c.id));
      if(ret.length===0) return;
      GameState.drawPile=GlobalFunctions.shuffle(ret); GameState.discardPile=[];
      this.addLog('山札切れ：捨て札をシャッフルして山札に戻した');
    }
    const card=GameState.drawPile.pop(); if(!card) return;
    // #24 竜頭蛇尾：最初の手札では-100しない。300分(-100×3回)減少しきったら性質変化を解除する
    if(card.trait==='竜頭蛇尾'){
      if(card.dragonUsed){
        card.baseScore=Math.max(0,card.baseScore-100);
        card.dragonReductions=(card.dragonReductions||0)+1;
        if(card.dragonReductions>=3){ card.trait=null; this.addLog('竜頭蛇尾：補正が0になり性質変化が解除された'); }
      }
      else card.dragonUsed=true;
    }
    GameState.hand.push(card);
    // #4 ギャンブル：手札に来るたび-50〜+50のランダムな値を基礎点に加算（前回分はリセットしてから再抽選）
    if(card.enhance==='ギャンブル'){
      if(card._gambleDelta) card.baseScore-=card._gambleDelta;
      const delta=Math.round(Math.random()*100-50);
      card.baseScore+=delta;
      card._gambleDelta=delta;
    }
    // #6 演出：ドロー時にデッキから出現したように見せる
    (this.justDrawnIds=this.justDrawnIds||new Set()).add(card.id);
    setTimeout(()=>{ if(this.justDrawnIds){ this.justDrawnIds.delete(card.id); this.renderAll(); } },500);
    return card;
  },

  enterRerollMode(){ if(this.currentSide!=='player'||this.resultState||GameState.rerollCount<=0) return; this.rerollMode=true; this.rerollSelected=new Set(); this.selectedCardId=null; this.renderAll(); },
  cancelReroll(){ this.rerollMode=false; this.rerollSelected=new Set(); this.renderAll(); },
  toggleRerollCard(id){ if(this.rerollSelected.has(id)) this.rerollSelected.delete(id); else this.rerollSelected.add(id); this.renderAll(); },
  confirmReroll(){
    if(!this.rerollMode||this.rerollSelected.size===0||GameState.rerollCount<=0) return;
    GameState.rerollCount--;
    const sel=GameState.hand.filter(c=>this.rerollSelected.has(c.id));
    GameState.hand=GameState.hand.filter(c=>!this.rerollSelected.has(c.id));
    sel.forEach(c=>{ if(c.trait==='ディスカード') GameState.gold+=2; this.pushToDiscard(c); });
    for(let i=0;i<sel.length;i++) this.drawOne();
    this.addLog(`${sel.length}枚リロール（残り${GameState.rerollCount}回）`);
    this.rerollMode=false; this.rerollSelected=new Set(); this.renderAll();
  },

  applyThunder(){ let n=0; for(let i=0;i<this.board.length;i++) if(this.board[i]?.symbol==='Cross'){this.board[i]=null;n++;} if(n) this.addLog(`サンダー：×を${n}個除去`); },

  queueJammingEffect(jamming,cellIdx){
    // #2 レリック「ジャミング増強」：ビンゴ阻害の効果を持つカードが盤面に配置された時、ビンゴ阻害自体の効果は変更せずそのまま残し、
    //    追加でスタンを発動する（手札上限・点数加算の仕様は変更なし）
    if(jamming==='ビンゴ阻害'&&GameState.relics.some(r=>r.id==='jamming_boost')){
      const bonus=Math.round(GameState.targetScore*0.05);
      GameState.currentScore=Math.max(0,GameState.currentScore+bonus);
      this.effects.stunNextNpc=true;
      this.addLog(`ジャミング増強：ビンゴ阻害のカードが配置され、スタンを追加付与し+${bonus}点（目標点数×0.05）`);
    }
    switch(jamming){
      case 'スタン': this.effects.stunNextNpc=true; this.addLog('スタン：次のNPC行動を封じる'); break;
      case '混乱': this.effects.confuseNextNpc=true; this.addLog('混乱：次のNPCは最低点マスへ'); break;
      case 'ブレイク': this.effects.breakCellIdx=cellIdx; this.addLog('ブレイク：このカードが盤面にある間、バツのビンゴはラウンドを終了させない'); break;
      case 'リンク':{
        const r=Math.floor(cellIdx/GameData.BOARD_SIZE), c=cellIdx%GameData.BOARD_SIZE;
        const cands=[[-1,0],[1,0],[0,-1],[0,1]].map(([dr,dc])=>{const nr=r+dr,nc=c+dc;return(nr>=0&&nr<GameData.BOARD_SIZE&&nc>=0&&nc<GameData.BOARD_SIZE)?this.cellIndex(nr,nc):-1;}).filter(i=>i>=0);
        const empty=cands.filter(i=>this.board[i]===null&&!this.blockedCells.has(i));
        if(empty.length===0){this.effects.stunNextNpc=true;this.addLog('リンク：隣接マスなし→スタン');}
        else{
          // #3 ジャミング効果は重複させる：既にリンク制限がある場合は両方を満たす交差マスにする
          if(this.effects.linkRestrict){
            const merged=this.effects.linkRestrict.filter(i=>empty.includes(i));
            this.effects.linkRestrict=merged.length>0?merged:empty;
          } else this.effects.linkRestrict=empty;
          this.addLog('リンク：NPCの配置を十字マスに制限');
        }
        break;
      }
      case '引き直し':{
        if(this.lastNpcCell!==null&&this.board[this.lastNpcCell]?.symbol==='Cross'){
          this.board[this.lastNpcCell]=null;
          // #3 ジャミング効果は重複させる：既存の禁止マスに追加する
          if(!this.effects.redirectBan) this.effects.redirectBan=new Set();
          this.effects.redirectBan.add(this.lastNpcCell);
          this.addLog(`引き直し：マス${this.lastNpcCell+1}のバツを除去`);
        }
        break;
      }
      case '封印':{
        const sr=Math.floor(cellIdx/GameData.BOARD_SIZE), sc=cellIdx%GameData.BOARD_SIZE;
        const sealed=this.effects.sealCell?new Set(this.effects.sealCell):new Set(); // #3 既存の封印マスと合算する
        for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++){
          if(dr===0&&dc===0) continue;
          const nr=sr+dr,nc=sc+dc;
          if(nr>=0&&nr<GameData.BOARD_SIZE&&nc>=0&&nc<GameData.BOARD_SIZE) sealed.add(this.cellIndex(nr,nc));
        }
        this.effects.sealCell=sealed; this.addLog('封印：周囲8マスにNPCは置けない');
        break;
      }
      case '誘導': this.effects.lureRestrict=true; this.addLog('誘導：NPCは中央にしか置けない'); break;
      default: break;
    }
  },

  countBoardJamming(name){ return this.board.filter(c=>c&&c.card&&c.card.jamming===name).length; },

  cellCanBeSymbol(cell, targetSym){
    if(!cell) return false;
    if(cell.symbol===targetSym) return true;
    const e=cell.card&&cell.card.enhance;
    const mm={'マルマルチ':'Circle','サンカクマルチ':'Triangle','シカクマルチ':'Square','バツマルチ':'Cross'};
    if(cell.card&&cell.card._passiveMultiSymbol&&mm[cell.card._passiveMultiSymbol]===targetSym) return true; // #A マルパッシブ3
    if(!e) return false;
    if(e==='オールマルチ') return ['Circle','Triangle','Square'].includes(targetSym);
    return mm[e]===targetSym;
  },

  async placeCard(cellIdx,symbol,baseScore,owner,card){
    // #3 ブレイク：このカード自身が今まさにブレイクを発動する場合も、このターンの判定から有効にする
    const breakActive=this.isBreakActive()||card?.jamming==='ブレイク';
    const isNeg=card&&(card.trait==='ネガティブ'||card.trait==='ネガティブ(パッシブ)')&&owner==='player';
    if(card&&(card.trait==='塗りつぶし'||card.trait==='塗りつぶし(レリック)')&&owner==='player'&&this.board[cellIdx]?.card) this.pushToDiscard(this.board[cellIdx].card);
    this.board[cellIdx]={symbol,baseScore,owner,card};
    this.lastPlacedCell=cellIdx;
    if(owner==='npc') this.lastNpcCell=cellIdx;
    // #3 シカクパッシブ1：プレイしたシカクカード自身にも基礎点+1を永続付与（盤面配置時点で反映）
    if(card&&card.symbol==='Square'&&owner==='player'&&GameState.symbolPassiveTier.Square>=1){
      card.baseScore+=1; this.board[cellIdx].baseScore+=1;
    }
    // #6 配置演出：置いた瞬間のポップアニメーション
    this.justPlacedCell=cellIdx;
    setTimeout(()=>{ if(this.justPlacedCell===cellIdx){ this.justPlacedCell=null; this.renderAll(); } },550);
    if(card) GameState.hand=GameState.hand.filter(c=>c.id!==card.id);
    if(card?.jamming==='サンダー') this.applyThunder();
    this.board.forEach(cell=>{
      if(!cell?.card) return;
      const sqP1c=cell.card.symbol==='Square'&&GameState.symbolPassiveTier.Square>=2; // #1 シカクパッシブ3はシカクカードのみ有効
      if(cell.card.enhance==='巨大化') cell.baseScore+=3*(sqP1c?2:1);
      // #2 肥大化：カード基礎点/2×対象ビンゴ倍率
      if(cell.card.enhance==='肥大化'){const a=Math.round((cell.card.baseScore/2)*GameData.BINGO_MULTIPLIER_BASE[cell.symbol]*(sqP1c?2:1));GameState.currentScore=Math.max(0,GameState.currentScore+a);}
    });
    // #9/#8 マルパッシブ2：マルカードをプレイした時、盤面のマル枚数×マル倍率×10点を加算（Lv1/Lv2入れ替えによりLv2条件に変更）
    if(card&&card.symbol==='Circle'&&owner==='player'&&GameState.symbolPassiveTier.Circle>=2){
      const n=this.board.filter(c=>c&&c.symbol==='Circle').length;
      const add=Math.round(n*GameData.BINGO_MULTIPLIER_BASE.Circle*10);
      GameState.currentScore=Math.max(0,GameState.currentScore+add);
      this.addLog(`マルパッシブ：マル${n}枚×倍率×10 = ${GlobalFunctions.formatSigned(add)}`);
    }
    // #2 肥大化などビンゴを介さない加点でも目標点数到達で即座にゲームクリアにする
    if(GameState.currentScore>=GameState.targetScore){ this.renderAll(); this.finishStage('win'); return; }
    if(card?.enhance==='ドロー'){ this.drawOne(); if(card?.symbol==='Square'&&GameState.symbolPassiveTier.Square>=2) this.drawOne(); }
    // #A シカクパッシブ3：シカクカードをプレイした時、カードを1枚ドロー
    if(card&&card.symbol==='Square'&&owner==='player'&&GameState.symbolPassiveTier.Square>=1){ const dc=this.drawOne(); if(dc) dc.baseScore+=1; }
    // #4 エクステンド：このカードを置いたターンはビンゴ判定を行わない（次の自分の配置で解除・判定される）
    const isExtending1 = card?.enhance==='エクステンド' && owner==='player';
    const newBingos = isExtending1 ? [] : this.detectNewBingos();
    if(isExtending1){ this.extendActive=true; this.addLog('エクステンド：このターンはビンゴ判定を行わない'); }
    else if(this.extendActive && owner==='player'){ this.extendActive=false; }
    if(!isNeg) this.turnInRound++;
    if(card?.jamming) this.queueJammingEffect(card.jamming,cellIdx);
    // #A サンカクパッシブ1：ジャミング使用の次のターンにもう一度同じ効果を付与
    if(card?.jamming&&card?.symbol==='Triangle'&&owner==='player'&&GameState.symbolPassiveTier.Triangle>=3){ // #4 サンカクカードのみ有効
      (this.pendingDelayedJamming=this.pendingDelayedJamming||[]).push({jamming:card.jamming,cellIdx,afterTurns:1});
    }
    { const n=GameState.relics.filter(r=>r.id==='draw_boost').length; for(let i=0;i<n&&GameState.hand.length<GameState.effectiveHandSize();i++) this.drawOne(); }
    this.selectedCardId=null; this.boardInfoCell=null; this.activeRelicId=null; this.expandPending=null; this.paintPending=null;
    this.renderAll();
    if(newBingos.length>0) await this.playScoreSequence(newBingos);
    const endByBingo=this.shouldBingoEndRound(newBingos,breakActive);
    if(endByBingo||this.turnInRound>GameState.effectiveTurnsPerRound()){this.renderAll();await this.sleep(300);this.endRound();return;}
    if(isNeg){this.renderAll();return;}
    this.currentSide=this.currentSide==='player'?'npc':'player';
    // #6 階層10特有ボス効果：ターン6,11,16…は強制的にNPCの番にする
    if(GameState.floor10SpecialBoss&&this.isForcedNpcTurn(this.turnInRound+1)) this.currentSide='npc';
    this.renderAll();
    if(this.currentSide==='npc') this.scheduleAIMove();
    else this.checkAutoSkip();
  },

  detectNewBingos(){
    const results=[];
    const lifeExt=this.countBoardJamming('延命');
    const blockCnt=this.countBoardJamming('ビンゴ阻害');
    const quadOnly=this.hasBossEffect('quad_only');
    const noRelic=this.hasBossEffect('no_relic');

    const evalWin=(win)=>{
      const cells=win.cells.map(i=>this.board[i]);
      if(cells.some(c=>!c)) return null;
      const candidates=GameData.SYMBOLS.filter(sym=>cells.every(c=>this.cellCanBeSymbol(c,sym)));
      if(candidates.length===0) return null;
      const sym=candidates.find(s=>s!=='Cross')||candidates[0];
      if(sym==='Cross'){
        if(blockCnt>=3) return null;
        if((lifeExt>0||blockCnt>=2)&&win.cells.length===3) return null;
        if(blockCnt>=1&&win.type==='col') return null;
      }
      if(quadOnly&&!win.isQuad) return null;
      return {sym,cells};
    };

    // #2 ハブ：2つ以上のビンゴに関わるマスを判定するため、消費前の全窓を走査してマスごとのビンゴ関与数を数える
    const cellBingoCount={};
    this.windows.forEach((win)=>{
      const r=evalWin(win); if(!r) return;
      win.cells.forEach(ci=>{ cellBingoCount[ci]=(cellBingoCount[ci]||0)+1; });
    });

    const scoringRelics=new Set();
    const makeResult=(idx,win,r,baseMult)=>{
      const lineFactor = win.isPenta ? GameData.PENTA_MULTIPLIER_FACTOR : (win.isQuad ? GameData.QUAD_MULTIPLIER_FACTOR : 1); // #5 演出用：列補正を分離
      let pureBaseMult = (win.isPenta||win.isQuad) ? baseMult/lineFactor : baseMult; // #5 演出用：列補正を除いた素のビンゴ倍率
      const sqP3=GameState.symbolPassiveTier.Square>=2; // #A シカクパッシブ3：強化効果2倍
      // #A 記号パッシブ：カード基礎点の個別補正（マルP3の加算、シカクP2の2倍、バツP2のデッキ枚数×3上書き）
      const perCellScore=(c,ci)=>{
        let v=c.baseScore;
        if(c.card?._passiveScoreAdd) v+=c.card._passiveScoreAdd;
        if(c.symbol==='Cross'&&GameState.symbolPassiveTier.Cross>=2) v=GameState.currentDeck.length*3;
        if(c.symbol==='Triangle'&&GameState.symbolPassiveTier.Triangle>=1){
          const total=GameState.currentDeck.length||1;
          const n=GameState.currentDeck.filter(cc=>cc.symbol==='Triangle').length/total;
          v*=(1+n);
        }
        // #1 ハブ：2つ以上のビンゴに関わるマスはカード基礎点×1.5（シカクパッシブ3はシカクカードのみ×2）
        if(c.card?.enhance==='ハブ'&&(cellBingoCount[ci]||0)>=2){
          v*=(sqP3&&c.symbol==='Square')?2:1.5;
        }
        return v;
      };
      const cardScores=win.cells.map((ci,i)=>perCellScore(r.cells[i],ci));
      // #A バツパッシブ3：一番高いビンゴ倍率をバツ倍率に反映
      if(r.sym==='Cross'&&GameState.symbolPassiveTier.Cross>=1){
        baseMult=Math.max(...GameData.SYMBOLS.map(s=>GameData.BINGO_MULTIPLIER_BASE[s]));
        pureBaseMult=baseMult;
      }
      // #A バツパッシブ3：点数計算時にバツ倍率をさらに4倍
      if(r.sym==='Cross'&&GameState.symbolPassiveTier.Cross>=3){ baseMult*=4; pureBaseMult*=4; }
      // #18 点数計算式: (補正基礎点+カード基礎点) × (ビンゴ倍率+補正倍率) × 4列補正 × 最終乗算補正 + 最終加算補正
      let correctionBase=GameData.CORRECTION_BASE_SCORE;
      let relicBonus=0;
      if(!noRelic){
        if(GameState.hasRelic('bingo')){relicBonus+=30;scoringRelics.add('bingo');}
        if(this.chargeActive&&GameState.hasRelic('charge')){relicBonus+=100;scoringRelics.add('charge');}
        cardScores.forEach(sc=>{
          if(sc%2===1&&GameState.hasRelic('odd_boost')){relicBonus+=15;scoringRelics.add('odd_boost');}
          if(sc%2===0&&GameState.hasRelic('even_boost')){relicBonus+=15;scoringRelics.add('even_boost');}
        });
        if(r.sym==='Circle'&&GameState.hasRelic('circle_boost')){relicBonus+=60;scoringRelics.add('circle_boost');}
        if(r.sym==='Triangle'&&GameState.hasRelic('triangle_boost')){relicBonus+=60;scoringRelics.add('triangle_boost');}
        if(r.sym==='Square'&&GameState.hasRelic('square_boost')){relicBonus+=60;scoringRelics.add('square_boost');}
        if(GameState.hasRelic('relic_boost')){const n=GameState.relicCount();relicBonus+=5+8*n;scoringRelics.add('relic_boost');}
        // base_boost is now FINAL_ADD; handled via FINAL_ADD
        if(GameState.hasRelic('empty_boost')){const ec=this.board.filter(c=>!c).length;relicBonus+=6*ec+5;scoringRelics.add('empty_boost');}
        // #7 レリック「リロール強化」：ビンゴ時、残りリロール回数n×10を補正基礎点に加算
        if(GameState.hasRelic('reroll_boost')){correctionBase+=GameState.rerollCount*10;scoringRelics.add('reroll_boost');}
        GameState.relics.forEach(rel=>{
          const ren=rel.relicEnhance; if(!ren) return;
          if(ren==='ren_circle'){const n=GameState.currentDeck.filter(c=>c.symbol==='Circle').length;relicBonus+=n;scoringRelics.add(rel.id);}
          if(ren==='ren_triangle'){const n=GameState.currentDeck.filter(c=>c.symbol==='Triangle').length;relicBonus+=n;scoringRelics.add(rel.id);}
          if(ren==='ren_square'){const n=GameState.currentDeck.filter(c=>c.symbol==='Square').length;relicBonus+=n;scoringRelics.add(rel.id);}
          if(ren==='ren_disc_pile'){relicBonus+=GameState.discardPile.length;scoringRelics.add(rel.id);}
          if(ren==='ren_discard'){scoringRelics.add(rel.id);}
        });
      }
      const totalBase=cardScores.reduce((s,v)=>s+v,0)+correctionBase+relicBonus;

      let finalMult=baseMult+GameData.CORRECTION_MULTIPLIER;
      // #1 演出用：補正倍率に効く、普段は非表示のレリック強化効果・パッシブ・性質変化・手札効果の内訳を記録しておく
      const correctionMultParts=[];
      // #新規 セブンパッシブ1：ビンゴ時、7の倍数の基礎点を持つカード1枚につき補正倍率+77
      if(GameState.symbolPassiveTier.Seven>=1){
        const n7=r.cells.filter(c=>c&&c.baseScore%7===0).length;
        if(n7>0){ finalMult+=n7*77; correctionMultParts.push({label:'セブンパッシブ1',op:'+',val:n7*77}); }
      }
      if(!noRelic){
        if(GameState.hasRelic('combo')&&this.prevRoundBingoSymbol&&this.prevRoundBingoSymbol!==r.sym){finalMult+=1.5;correctionMultParts.push({label:'コンボ',op:'+',val:1.5});scoringRelics.add('combo');}
        if(GameState.hasRelic('turn_boost')){const f=Math.pow(1.01,this.turnInRound);finalMult*=f;correctionMultParts.push({label:'ターン強化',op:'×',val:f});scoringRelics.add('turn_boost');} // #1 1.1^n→1.01^nに修正
        if(GameState.hasRelic('hand_boost')){const v=GameState.hand.length*3;finalMult+=v;correctionMultParts.push({label:'手札強化',op:'+',val:v});scoringRelics.add('hand_boost');} // #1 ビンゴ時、手札の数×3を補正倍率に加算
        if(GameState.hasRelic('last_stand')&&GameState.round>=4){finalMult*=2;correctionMultParts.push({label:'背水の陣',op:'×',val:2});scoringRelics.add('last_stand');}
        GameState.relics.forEach(rel=>{
          if(rel.relicEnhance==='ren_general'){finalMult*=1.1;correctionMultParts.push({label:'将軍(レリック強化)',op:'×',val:1.1});scoringRelics.add(rel.id);}
          if(rel.relicEnhance==='ren_only_one'&&GameState.relicCount()===1){finalMult+=20;correctionMultParts.push({label:'オンリーワン',op:'+',val:20});scoringRelics.add(rel.id);}
          if(rel.relicEnhance==='ren_grade'){const n=GameState.currentDeck.reduce((s,c)=>{let x=0;if(c.enhance)x++;if(c.jamming)x++;if(c.trait)x++;return s+x;},0);finalMult+=n;correctionMultParts.push({label:'グレードオール',op:'+',val:n});scoringRelics.add(rel.id);}
          if(rel.relicEnhance==='ren_discard'){finalMult*=1.5;correctionMultParts.push({label:'ディスカード(レリック強化)',op:'×',val:1.5});scoringRelics.add(rel.id);}
        });
      }
      // 性質変化
      r.cells.forEach(cidx=>{
        const cell=this.board[cidx]; if(!cell?.card) return;
        if(cell.card.trait==='指令官'&&this.turnInRound>=7&&this.turnInRound<=10){finalMult*=1.2;correctionMultParts.push({label:'指令官',op:'×',val:1.2});}
        // #3 ミニマム：値を+nから+20nに変更（nは盤面最少記号の数）
        if(cell.card.trait==='ミニマム'){const counts={};GameData.SYMBOLS.forEach(s=>{counts[s]=this.board.filter(c=>c&&c.symbol===s).length;});const minv=Math.min(...Object.values(counts).filter(v=>v>0));finalMult+=minv*20;correctionMultParts.push({label:'ミニマム',op:'+',val:minv*20});}
        // #3 マキシマム：値を+1から+10nに変更（nは盤面最多記号の数）
        if(cell.card.trait==='マキシマム'){const counts={};GameData.SYMBOLS.forEach(s=>{counts[s]=this.board.filter(c=>c&&c.symbol===s).length;});const maxS=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];if(maxS&&maxS[0]===r.sym){finalMult+=maxS[1]*10;correctionMultParts.push({label:'マキシマム',op:'+',val:maxS[1]*10});}}
        if(cell.card.trait==='レリック特攻') correctionBase+=10*GameState.relicCount();
        if(cell.card.enhance==='連鎖'){const n=this.board.filter(c=>c&&c.card&&c.card.enhance==='連鎖').length;cell.baseScore+=30*n;}
      });
      if(GameState.hand.some(c=>c.trait==='将軍')){finalMult*=1.1;correctionMultParts.push({label:'将軍(手札)',op:'×',val:1.1});}
      // #1 演出用：「補正倍率」として実際に使われる合計値（定数＋上記の隠れた内訳すべて）
      const correctionMultiplierTotal=finalMult-baseMult;

      // 4列補正はbaseMult計算済み（quadMultで1.5倍）、最終乗算補正
      // #1 演出用：最終乗算補正の内訳（普段は非表示の各要素）を記録しておく
      const finalMultParts=[];
      let finalMultiplier=GameData.FINAL_MULTIPLIER;
      if(GameState.relics.some(r=>r.relicEnhance==='ren_double')){finalMultiplier*=1.5;finalMultParts.push({label:'ダブル',op:'×',val:1.5});}
      if(GameState.relics.some(r=>r.relicEnhance==='ren_triple')){finalMultiplier*=2;finalMultParts.push({label:'トリプル',op:'×',val:2});}
      // #A サンカクパッシブ2：デッキ内ジャミング所持カード1枚につき最終補正倍率+0.1
      if(GameState.symbolPassiveTier.Triangle>=2){
        const n=GameState.currentDeck.filter(c=>c.jamming).length;
        if(n>0){finalMultiplier+=n*0.1;finalMultParts.push({label:'サンカクパッシブ2',op:'+',val:n*0.1});}
      }
      // #新規 セブンパッシブ2：前回の節目で立てたフラグを消費し、今回のビンゴの最終乗算補正×7
      if(GameState.symbolPassiveTier.Seven>=2 && GameState.sevenPendingMultBoost){
        finalMultiplier*=7;
        finalMultParts.push({label:'セブンパッシブ2',op:'×',val:7});
        GameState.sevenPendingMultBoost=false;
        this.addLog('セブンパッシブ：最終乗算補正×7が発動！');
      }
      // #1 演出用：最終加算補正の内訳（普段は非表示の各要素）を記録しておく
      const finalAddParts=[];
      const finalAdd=GameData.FINAL_ADD;
      // 山札強化
      let finalAddTotal=finalAdd;
      if(!noRelic) GameState.relics.forEach(rel=>{if(rel.relicEnhance==='ren_draw_pile'){const v=GameState.drawPile.length*100;finalAddTotal+=v;finalAddParts.push({label:'山札強化',op:'+',val:v});scoringRelics.add(rel.id);}});
      // #新規 セブンパッシブ3：デッキの枚数が7の倍数の時、最終加算補正+目標点数の7%
      if(GameState.symbolPassiveTier.Seven>=3 && GameState.currentDeck.length%7===0){
        const v=Math.round(GameState.targetScore*0.07);
        finalAddTotal+=v;
        finalAddParts.push({label:'セブンパッシブ3',op:'+',val:v});
      }

      // #2 チェックパッシブ1：1ラウンド内でマル・サンカク・シカクのビンゴが全て発生した時、残りラウンド+1（一度きり）
      if(GameState.symbolPassiveTier.Check>=1){
        this.bingoSymbolsThisRound=this.bingoSymbolsThisRound||new Set();
        this.bingoSymbolsThisRound.add(r.sym);
        if(!this._checkTriforceGranted && ['Circle','Triangle','Square'].every(s=>this.bingoSymbolsThisRound.has(s))){
          this.stageBonusRounds=(this.stageBonusRounds||0)+1;
          this._checkTriforceGranted=true;
          this.addLog('チェックパッシブ1：マル・サンカク・シカクのビンゴが揃い、残りラウンド+1');
        }
      }
      // #8 チェックパッシブ3：このステージのビンゴ回数をカウント
      GameState.bingoCountThisStage=(GameState.bingoCountThisStage||0)+1;
      // #新規 セブンパッシブ2：累計ビンゴ回数をカウントし、7の倍数に到達した時点で全記号のビンゴ倍率+7・次回×7フラグを立てる
      if(GameState.symbolPassiveTier.Seven>=2){
        GameState.totalBingoCount=(GameState.totalBingoCount||0)+1;
        if(GameState.totalBingoCount%7===0){
          GameData.SYMBOLS.forEach(s=>{GameData.BINGO_MULTIPLIER_BASE[s]+=7;});
          GameState.sevenPendingMultBoost=true;
          this.addLog(`セブンパッシブ：累計${GameState.totalBingoCount}回目のビンゴ！全記号のビンゴ倍率+7、次のビンゴで最終乗算補正×7`);
        }
      }
      // #4 加算点数自体はマイナスを許容する（現在の点数がマイナスにならないようにするのは適用時のみ）
      const score=Math.round(totalBase*finalMult*finalMultiplier)+finalAddTotal;
      // #2 デバッグ用：計算式と各値の出所をログに表示
      const debugMsg=`[計算式] 基礎点=(カード基礎点[${cardScores.join('+')}]${cardScores.reduce((s,v)=>s+v,0)} + 補正基礎点(GameData.CORRECTION_BASE_SCORE)${correctionBase} + レリック補正(relicBonus)${relicBonus}) = ${totalBase} ／ 倍率=(ビンゴ倍率(GameData.BINGO_MULTIPLIER_BASE/quadMult)${baseMult} + 補正倍率(GameData.CORRECTION_MULTIPLIER)${GameData.CORRECTION_MULTIPLIER} + レリック加算) = ${Math.round(finalMult*100)/100} ／ 最終乗算補正(GameData.FINAL_MULTIPLIER×レリック)=${Math.round(finalMultiplier*100)/100} ／ 最終加算補正(GameData.FINAL_ADD+山札強化)=${finalAddTotal} ⇒ score=round(totalBase×倍率×最終乗算補正)+最終加算補正 = round(${totalBase}×${Math.round(finalMult*100)/100}×${Math.round(finalMultiplier*100)/100})+${finalAddTotal} = ${score}`;
      console.log('[ScoreCalc]',{symbol:r.sym,cardScores,correctionBase,relicBonus,totalBase,baseMult,correctionMultiplier:GameData.CORRECTION_MULTIPLIER,finalMult,finalMultiplierGlobal:GameData.FINAL_MULTIPLIER,finalMultiplier,finalAddGlobal:GameData.FINAL_ADD,finalAddTotal,score,activeRelics:GameState.relics.map(x=>x.id+(x.relicEnhance?('/'+x.relicEnhance):''))});
      return {idx,symbol:r.sym,cells:win.cells,cardScores,totalBase,relicBonus,correctionBase,cardBaseSum:cardScores.reduce((s,v)=>s+v,0),correctionBaseTotal:correctionBase+relicBonus,mult:finalMult,pureBaseMult,lineFactor,correctionMultiplier:correctionMultiplierTotal,correctionMultParts,finalMultiplier,finalMultParts,finalAdd:finalAddTotal,finalAddParts,score,isQuad:win.isQuad,isPenta:win.isPenta,debugMsg};
    };

    // #3 ホシパッシブ2：5列ビンゴを最優先で判定（内包する4列・3列窓は同時に消費済みにする）
    this.windows.forEach((win,idx)=>{
      if(!win.isPenta||this.scoredWindowKeys.has(idx)) return;
      const r=evalWin(win); if(!r) return;
      this.scoredWindowKeys.add(idx);
      (this.quadSiblings[idx]||[]).forEach(s=>{ this.scoredWindowKeys.add(s); (this.quadSiblings[s]||[]).forEach(s2=>this.scoredWindowKeys.add(s2)); });
      results.push(makeResult(idx,win,r,GameData.pentaMult(r.sym)));
    });
    this.windows.forEach((win,idx)=>{
      if(!win.isQuad||this.scoredWindowKeys.has(idx)) return;
      const r=evalWin(win); if(!r) return;
      this.scoredWindowKeys.add(idx);
      (this.quadSiblings[idx]||[]).forEach(s=>this.scoredWindowKeys.add(s));
      results.push(makeResult(idx,win,r,GameData.quadMult(r.sym)));
    });
    this.windows.forEach((win,idx)=>{
      if(win.isQuad||win.isPenta||this.scoredWindowKeys.has(idx)) return;
      const r=evalWin(win); if(!r) return;
      this.scoredWindowKeys.add(idx);
      results.push(makeResult(idx,win,r,GameData.BINGO_MULTIPLIER_BASE[r.sym]));
    });
    if(!noRelic&&GameState.hasRelic('double')&&results.length>=2){
      // #4 加算点数はマイナスを許容し、現在の点数のみ0未満にならないようにする
      results.forEach(b=>{b.finalMultiplier*=1.5;b.score=Math.round(b.totalBase*b.mult*b.finalMultiplier)+b.finalAdd;});
      scoringRelics.add('double');
    }
    this.scoringRelicIds=Array.from(scoringRelics);
    if(results.length>0) this.prevRoundBingoSymbol=results[results.length-1].symbol;
    return results;
  },

  shouldBingoEndRound(bingos,breakActive){
    if(bingos.length===0) return false;
    if(breakActive) return bingos.some(b=>b.symbol!=='Cross');
    return true;
  },

  async playScoreSequence(bingos){ for(const b of bingos) await this.showScoreStep(b); },

  async showScoreStep(b){
    const before=GameState.currentScore, after=Math.max(0,before+b.score);

    // #1 点数計算の演出速度を1/2スピード（時間2倍）に変更し、計算過程を見やすくする
    // 各セルを1枚ずつポップ（同セルが複数ビンゴに属する場合、その分繰り返す）
    for(const cellIdx of b.cells){
      this.scoringAnim={phase:0,cells:[],symbol:b.symbol,liveScore:before,before,score:b.score,reached:false,popCell:cellIdx};
      this.renderAll(); await this.sleep(400);
    }
    this.scoringAnim.cells=b.cells;
    // デバッグログ：計算式と計算値の出所を表示
    if(b.debugMsg){ this.addLog(b.debugMsg); console.log(b.debugMsg); }

    // #1 ビンゴ演出：基礎点・倍率を出したらすぐ乗算した「得点」1マスに統合し、以後は列補正→最終乗算補正→最終加算補正の順に
    //    「隠れた内訳を一度全て見せてから合算値へ畳み込む」形で「得点」に反映していく
    const fmt=(v)=>v==null?'-':GlobalFunctions.formatScore(v);
    const fmtMult=(v)=>v==null?'-':('×'+(Math.round(v*100)/100));
    const fmtAdd=(v)=>v==null?'-':GlobalFunctions.formatSigned(v);
    const fmtNum=(v)=>Math.round(v*100)/100;
    const boxData=(label,value,cls='')=>({label,value,cls});
    const lineLabel=b.isPenta?'5列':(b.isQuad?'4列':'3列');
    let items=[];
    const setItems=async(arr,ms)=>{ items=arr; this.scoreBoxes={items}; this.renderAll(); await this.sleep(ms); };

    // 1. カード基礎点を計算
    await setItems([boxData('カード基礎点',fmt(b.cardBaseSum))],550);
    // 2. 補正基礎点を計算
    await setItems([...items,boxData('補正基礎点',fmt(b.correctionBaseTotal))],550);
    // 3. カード基礎点と補正基礎点は掛け算ではなく足し算のため、2つのブロックを1つに融合し「基礎点」として表示する
    await setItems([boxData('基礎点',fmt(b.totalBase),'scb-merged')],500);
    const baseBox=items[0];
    // 4. ビンゴ倍率表示
    await setItems([baseBox,boxData('ビンゴ倍率',fmtMult(b.pureBaseMult))],550);
    // 5. 補正倍率(基本値)を計算
    await setItems([...items,boxData('補正倍率',fmtMult(GameData.CORRECTION_MULTIPLIER))],550);
    // 5b. #1 補正倍率に効く、レリック強化効果・パッシブ・性質変化・手札効果など普段は非表示の内訳を一度すべて見せる
    for(const part of (b.correctionMultParts||[])){
      await setItems([...items,boxData(part.label,part.op+fmtNum(part.val))],400);
    }
    // 6. ビンゴ倍率と補正倍率（内訳すべて含む）も足し算のため、1つに融合し「倍率」として表示する
    const combinedMult=b.pureBaseMult+b.correctionMultiplier;
    await setItems([baseBox,boxData('倍率',fmtMult(combinedMult),'scb-merged')],600);
    // 7. #1 基礎点×倍率を乗算した「得点」1マスに統合し、基礎点・倍率は非表示にする
    let running=b.totalBase*combinedMult;
    await setItems([boxData('得点',fmt(Math.round(running)),'scb-highlight scb-merged')],600);
    // 8. ビンゴ列補正を表示
    await setItems([...items,boxData(lineLabel,'×'+b.lineFactor)],500);
    // 9. 列補正を得点に乗算して統合する
    running*=b.lineFactor;
    await setItems([boxData('得点',fmt(Math.round(running)),'scb-highlight scb-merged')],600);

    // 10. #1 最終乗算補正：レリック強化効果や手札効果など普段非表示の内訳をすべて一度見せてから合算する
    const scoreBox=items[0];
    for(const part of (b.finalMultParts||[])){
      await setItems([scoreBox,...items.slice(1),boxData(part.label,part.op+fmtNum(part.val))],440);
    }
    await setItems([scoreBox,boxData('最終乗算補正',fmtMult(b.finalMultiplier),'scb-merged')],600);
    // 11. 最終乗算補正を得点に乗算して統合する
    running*=b.finalMultiplier;
    await setItems([boxData('得点',fmt(Math.round(running)),'scb-highlight scb-merged')],600);

    // 12. #1 最終加算補正：同様に内訳をすべて見せてから合算する
    const scoreBox2=items[0];
    for(const part of (b.finalAddParts||[])){
      await setItems([scoreBox2,...items.slice(1),boxData(part.label,part.op+fmtNum(part.val))],440);
    }
    await setItems([scoreBox2,boxData('最終加算補正',fmt(b.finalAdd),'scb-merged')],600);
    // 13. 最終加算補正を得点に加算する（丸め誤差を避けるため最終的にb.scoreへ厳密一致させる）
    await setItems([boxData('加算点数',fmtAdd(b.score),'scb-highlight'+(b.score<0?' negative':''))],700);

    // 14. 加算点数を現在の点数に加算：直接ジャンプさせず、1→5→7→10のように数字が段階的に上昇していく様子を見せる
    await this.animateScoreCountUp(before,after);
    this.scoringAnim.liveScore=GameState.currentScore; this.scoringAnim.reached=GameState.currentScore>=GameState.targetScore; this.scoringAnim.phase=8;
    this.addLog(`${GameData.SYMBOL_LABEL[b.symbol]}${lineLabel}ビンゴ！ ${GlobalFunctions.formatSigned(b.score)}（計${GlobalFunctions.formatScore(GameState.currentScore)}）`);
    this.renderAll(); await this.sleep(1100);
    this.scoringAnim=null; this.scoreBoxes=null; this.renderAll();
  },

  // #1 現在の点数を before→after へなめらかに段階上昇させる（半分スピードに合わせ時間を2倍に。最後は必ずafterに厳密一致させる）
  async animateScoreCountUp(before,after){
    const diff=after-before;
    if(diff===0){ GameState.currentScore=after; this.renderAll(); return; }
    const steps=4, totalMs=800;
    for(let i=1;i<=steps;i++){
      const t=i/steps;
      const eased=1-Math.pow(1-t,2); // 序盤を大きく、終盤を細かく動かす
      GameState.currentScore=(i===steps)?after:Math.round(before+diff*eased);
      this.renderAll();
      await this.sleep(totalMs/steps);
    }
  },

  // #4 スキップ実装：手札が無い、または盤面にこれ以上置ける場所が無い場合、自動的にスキップ（ターン消費）として扱う
  hasAnyValidPlacement(){
    if(GameState.hand.length===0) return false;
    const hasEmptyCell=this.board.some((c,i)=>c===null&&!this.blockedCells.has(i));
    if(hasEmptyCell) return true;
    // 塗りつぶし・重ね掛けは既存カードの上に配置できる可能性があるため、盤面が埋まっていても配置可能とみなす
    return GameState.hand.some(c=>c.trait==='塗りつぶし'||c.trait==='塗りつぶし(レリック)'||c.enhance==='重ね掛け');
  },
  async checkAutoSkip(){
    if(this.currentSide!=='player'||this.resultState) return;
    if(this.hasAnyValidPlacement()) return;
    const reason=GameState.hand.length===0?'手札がない':'盤面に置ける場所がない';
    this.addLog(`スキップ：${reason}ためターンを消費しました`);
    this.turnInRound++;
    if(this.turnInRound>GameState.effectiveTurnsPerRound()){ this.renderAll(); await this.sleep(300); this.endRound(); return; }
    this.currentSide='npc';
    if(GameState.floor10SpecialBoss&&this.isForcedNpcTurn(this.turnInRound+1)) this.currentSide='npc';
    this.renderAll();
    if(this.currentSide==='npc') this.scheduleAIMove();
  },

  async scheduleAIMove(){
    await this.sleep(500);
    if(this.currentSide!=='npc'||this.resultState) return;
    const npcDouble=GameState.relics.some(r=>r.relicEnhance==='ren_npc');

    // #A サンカクパッシブ1：遅延ジャミング再付与の処理
    if(this.pendingDelayedJamming&&this.pendingDelayedJamming.length>0){
      const due=this.pendingDelayedJamming.filter(p=>p.afterTurns<=0);
      this.pendingDelayedJamming=this.pendingDelayedJamming.filter(p=>p.afterTurns>0);
      due.forEach(p=>{ this.addLog(`サンカクパッシブ：ジャミング「${p.jamming}」を再付与`); this.queueJammingEffect(p.jamming,p.cellIdx); });
      this.pendingDelayedJamming.forEach(p=>p.afterTurns--);
    }

    // スタン事前チェック
    if(this.effects.stunNextNpc){
      this.effects.stunNextNpc=false;
      this.addLog('NPCはスタンした');
      this.turnInRound++;
      if(this.turnInRound>GameState.effectiveTurnsPerRound()){this.endRound();return;}
      this.currentSide='player';
      // #5 階層10：スタン解除後も5ターンごとの強制NPC番を正しく反映する（未反映だとプレイヤーが余分な1手を得てしまう不具合があった）
      if(GameState.floor10SpecialBoss&&this.isForcedNpcTurn(this.turnInRound+1)) this.currentSide='npc';
      this.renderAll();
      if(this.currentSide==='npc') this.scheduleAIMove(); else this.checkAutoSkip();
      return;
    }

    const ci=this.chooseAICell();

    // chooseAICell内でリンク/封印/誘導→配置不可→スタン設定された場合
    if(ci===null && this.effects.stunNextNpc){
      this.effects.stunNextNpc=false;
      this.addLog('NPCはスタンした（配置不可）');
      this.turnInRound++;
      if(this.turnInRound>GameState.effectiveTurnsPerRound()){this.endRound();return;}
      this.currentSide='player';
      // #5 階層10：スタン解除後も5ターンごとの強制NPC番を正しく反映する
      if(GameState.floor10SpecialBoss&&this.isForcedNpcTurn(this.turnInRound+1)) this.currentSide='npc';
      this.renderAll();
      if(this.currentSide==='npc') this.scheduleAIMove(); else this.checkAutoSkip();
      return;
    }

    if(ci===null){this.endRound();return;}
    await this.placeCard(ci,'Cross',10,'npc',null);
    if(npcDouble&&!this.resultState&&this.currentSide==='npc'){await this.sleep(400);const ci2=this.chooseAICell();if(ci2!==null) await this.placeCard(ci2,'Cross',10,'npc',null);}
  },

  chooseAICell(){
    let empty=this.board.map((v,i)=>(v===null&&!this.blockedCells.has(i))?i:-1).filter(i=>i>=0);
    if(this.effects.redirectBan!==null&&this.effects.redirectBan.size>0){const ban=this.effects.redirectBan;const e2=empty.filter(i=>!ban.has(i));this.effects.redirectBan=null;if(e2.length>0) empty=e2;else{this.effects.stunNextNpc=true;return null;}}
    if(this.effects.sealCell){const sealed=this.effects.sealCell;const e2=empty.filter(i=>!sealed.has(i));this.effects.sealCell=null;if(e2.length>0) empty=e2;else{this.effects.stunNextNpc=true;return null;}}
    if(this.effects.lureRestrict){
      this.effects.lureRestrict=false;
      // #4 誘導：4×4なら中央2×2、5×5なら中央1×1マスのみに制限
      const bs=GameData.BOARD_SIZE, size=(bs>=5)?1:Math.max(1,bs-2), start=Math.floor((bs-size)/2);
      const center=[];
      for(let r=start;r<start+size;r++) for(let c=start;c<start+size;c++) center.push(this.cellIndex(r,c));
      const e2=empty.filter(i=>center.includes(i));
      if(e2.length>0) empty=e2;else{this.effects.stunNextNpc=true;return null;}
    }
    // #1 ジャミング「リンク」：この一回限りの制限が優先される（オールリンクで上書きしない）
    let linkAppliedByJamming=false;
    if(this.effects.linkRestrict){const r=this.effects.linkRestrict.filter(i=>this.board[i]===null&&!this.blockedCells.has(i));this.effects.linkRestrict=null;if(r.length>0){empty=r;linkAppliedByJamming=true;}else{this.effects.stunNextNpc=true;return null;}}
    // #1 レリック「オールリンク」：直前に置かれたマス（プレイヤー・NPC問わず）の十字マスのみに配置可能。置けない場合スタン
    if(!linkAppliedByJamming&&GameState.relics.some(r=>r.relicEnhance==='ren_all_link')&&this.lastPlacedCell!==null){
      const r2=Math.floor(this.lastPlacedCell/GameData.BOARD_SIZE),c2=this.lastPlacedCell%GameData.BOARD_SIZE;
      const adj=[[-1,0],[1,0],[0,-1],[0,1]].map(([dr,dc])=>{const nr=r2+dr,nc=c2+dc;return(nr>=0&&nr<GameData.BOARD_SIZE&&nc>=0&&nc<GameData.BOARD_SIZE)?this.cellIndex(nr,nc):-1;}).filter(i=>i>=0);
      const e2=adj.filter(i=>this.board[i]===null&&!this.blockedCells.has(i));
      if(e2.length>0) empty=e2;
      else{this.effects.stunNextNpc=true;return null;}
    }
    const weighted=empty.map(ci=>{
      let w=0;
      for(const win of this.windows){
        if(!win.cells.includes(ci)) continue;
        const cells=win.cells.map(i=>this.board[i]);
        if(cells.some(c=>c&&c.symbol!=='Cross')) continue;
        const n=cells.filter(c=>c&&c.symbol==='Cross').length;
        w+=(n+1)*(n+1);
      }
      return{ci,w};
    });
    if(weighted.length===0) return null;
    const isConf=this.effects.confuseNextNpc;
    if(isConf){
      this.effects.confuseNextNpc=false;
      // #7 混乱高度化：プレイヤーにとって最も有利な（NPCにとって最も邪魔しにくい）マスを選ぶ
      // プレイヤーのビンゴ可能性が高いマスに置かせる（ビンゴの可能性重みが最小のマス）
      const tgt=weighted.reduce((a,b)=>b.w<a.w?b:a);
      return GlobalFunctions.randChoice(weighted.filter(w=>w.w===tgt.w)).ci;
    }
    const tgt=weighted.reduce((a,b)=>b.w>a.w?b:a);
    return GlobalFunctions.randChoice(weighted.filter(w=>w.w===tgt.w)).ci;
  },

  // #15/#17 ヒント計算：マルチカードが盤面にある場合も考慮、塗りつぶしも考慮
  computeHints(){
    if(this.rerollMode||this.currentSide!=='player'||!this.selectedCardId||this.resultState) return {};
    const card=GameState.hand.find(c=>c.id===this.selectedCardId); if(!card) return {};
    const hints={};
    const multiMap={'マルマルチ':'Circle','サンカクマルチ':'Triangle','シカクマルチ':'Square'};
    const extraSymbols=(c)=>{
      const ex=[];
      if(c.enhance==='マルマルチ') ex.push('Circle');
      if(c.enhance==='サンカクマルチ') ex.push('Triangle');
      if(c.enhance==='シカクマルチ') ex.push('Square');
      if(c.enhance==='バツマルチ') ex.push('Cross');
      if(c.enhance==='オールマルチ') ex.push('Circle','Triangle','Square');
      return [...new Set(ex)].filter(s=>s!==card.symbol);
    };
    const syms=[card.symbol,...extraSymbols(card)];
    const isPaint=card.trait==='塗りつぶし'||card.trait==='塗りつぶし(レリック)';

    const getTargetSets=(ci)=>{
      // #4 予測機能もシカクパッシブ2による拡張/拡大の強化に対応させる
      const doubled=card.symbol==='Square'&&GameState.symbolPassiveTier.Square>=2;
      if(card.enhance==='横拡張'){const t=this.getExpandTargets(ci,'right',isPaint,doubled);return t?[t]:[];}
      if(card.enhance==='縦拡張'){const t=this.getExpandTargets(ci,'up',isPaint,doubled);return t?[t]:[];}
      if(card.enhance==='拡大'){const t=this.getExpandTargets(ci,'rect',isPaint,doubled);return t?[t]:[];}
      return [[ci]];
    };

    const qObj={}; GameData.SYMBOLS.forEach(s=>{qObj[s]=GameData.quadMult(s);});

    // 配置可能なセル（塗りつぶしなら占有マスも含む）
    const empty=this.board.map((v,i)=>{
      if(this.blockedCells.has(i)) return -1;
      if(v===null) return i;
      if(isPaint) return i; // 塗りつぶし可能
      return -1;
    }).filter(i=>i>=0);

    for(const ci of empty){
      const targetSets=getTargetSets(ci); if(targetSets.length===0) continue;
      const targets=targetSets[0];
      if(targets.length>1&&!isPaint&&targets.some(t=>this.board[t]!==null)) continue;

      let total=0, any=false;
      for(const sym of syms){
        const sim=this.board.slice();
        let bs=card.baseScore;
        const ms=multiMap[card.enhance]; if(ms&&card.symbol===ms) bs+=20;
        targets.forEach(t=>{ sim[t]={symbol:sym,baseScore:bs,owner:'player',card}; });

        const local=new Set(this.scoredWindowKeys);
        const noRelic=this.hasBossEffect('no_relic');
        // #10 予測点数：レリック・パッシブ等の主要な計算要素も反映する
        const relicFlatBonus=(()=>{
          let n=0;
          if(!noRelic){
            if(GameState.hasRelic('reroll_boost')) n+=GameState.rerollCount*10;
            if(GameState.hasRelic('empty_boost')){ const ec=this.board.filter(c=>!c).length; n+=6*ec+5; }
          }
          return n;
        })();
        const tryW=(win,idx,multObj)=>{
          if(local.has(idx)) return false;
          if(!targets.some(t=>win.cells.includes(t))&&!win.cells.some(ci=>this.board[ci]&&this.cellCanBeSymbol(this.board[ci],win.cells.map(i=>sim[i]).filter(Boolean)[0]?.symbol))) return false;
          const cells=win.cells.map(i=>sim[i]);
          if(cells.some(c=>!c)) return false;
          const candidates=GameData.SYMBOLS.filter(s=>cells.every(c=>this.cellCanBeSymbol(c,s)));
          if(candidates.length===0) return false;
          const s=candidates.find(x=>x!=='Cross')||candidates[0];
          if(this.hasBossEffect('quad_only')&&!win.isQuad) return false;
          local.add(idx);
          // #8 予測計算の完全化：実際のmakeResult()に含まれる主要なレリック強化効果・パッシブ・性質変化も反映する
          const sqP3=GameState.symbolPassiveTier.Square>=2;
          const perCellScore=(c)=>{
            let v=c.baseScore;
            if(c.symbol==='Cross'&&GameState.symbolPassiveTier.Cross>=2) v=GameState.currentDeck.length*3;
            if(c.symbol==='Triangle'&&GameState.symbolPassiveTier.Triangle>=1){
              const total=GameState.currentDeck.length||1;
              const n=GameState.currentDeck.filter(cc=>cc.symbol==='Triangle').length/total;
              v*=(1+n);
            }
            if(c.card?.enhance==='ハブ'){ v*=(sqP3&&c.symbol==='Square')?2:1.5; }
            return v;
          };
          const cardScores=cells.map(c=>perCellScore(c));
          let baseMult=multObj[s];
          if(s==='Cross'&&GameState.symbolPassiveTier.Cross>=1) baseMult=Math.max(...GameData.SYMBOLS.map(sy=>GameData.BINGO_MULTIPLIER_BASE[sy]));
          if(s==='Cross'&&GameState.symbolPassiveTier.Cross>=3) baseMult*=4;
          let correctionBase=GameData.CORRECTION_BASE_SCORE;
          let relicBonus=relicFlatBonus;
          if(!noRelic){
            if(GameState.hasRelic('bingo')) relicBonus+=30;
            if(this.chargeActive&&GameState.hasRelic('charge')) relicBonus+=100;
            cardScores.forEach(sc=>{
              if(sc%2===1&&GameState.hasRelic('odd_boost')) relicBonus+=15;
              if(sc%2===0&&GameState.hasRelic('even_boost')) relicBonus+=15;
            });
            if(s==='Circle'&&GameState.hasRelic('circle_boost')) relicBonus+=60;
            if(s==='Triangle'&&GameState.hasRelic('triangle_boost')) relicBonus+=60;
            if(s==='Square'&&GameState.hasRelic('square_boost')) relicBonus+=60;
            if(GameState.hasRelic('relic_boost')){ const n=GameState.relicCount(); relicBonus+=5+8*n; }
            GameState.relics.forEach(rel=>{
              const ren=rel.relicEnhance; if(!ren) return;
              if(ren==='ren_circle') relicBonus+=GameState.currentDeck.filter(c=>c.symbol==='Circle').length;
              if(ren==='ren_triangle') relicBonus+=GameState.currentDeck.filter(c=>c.symbol==='Triangle').length;
              if(ren==='ren_square') relicBonus+=GameState.currentDeck.filter(c=>c.symbol==='Square').length;
              if(ren==='ren_disc_pile') relicBonus+=GameState.discardPile.length;
            });
          }
          // 性質変化（盤面上の既存カード・配置予定カードの両方を対象に、実際の点数計算と同じ範囲＝当該ビンゴ列のみを見る）
          cells.forEach(c=>{
            if(!c.card) return;
            if(c.card.trait==='レリック特攻') correctionBase+=10*GameState.relicCount();
            if(c.card.enhance==='連鎖'){ const n=this.board.filter(bc=>bc&&bc.card&&bc.card.enhance==='連鎖').length; correctionBase+=30*n; }
          });
          let lb=cardScores.reduce((a,v)=>a+v,0)+correctionBase+relicBonus;

          // #3 予測計算の修正：実際のmakeResult()と同じ「倍率（baseMult+補正倍率の内訳すべて）」×「最終乗算補正」の
          //    二段構成を正しく再現する（以前は両方を1つの掛け算にまとめてしまっており、実際の点数と乖離していた）
          let correctionMultTotal=GameData.CORRECTION_MULTIPLIER;
          // #新規 セブンパッシブ1：7の倍数の基礎点を持つカード1枚につき補正倍率+77
          if(GameState.symbolPassiveTier.Seven>=1){ const n7=cells.filter(c=>c.baseScore%7===0).length; if(n7>0) correctionMultTotal+=n7*77; }
          if(!noRelic){
            if(GameState.hasRelic('combo')&&this.prevRoundBingoSymbol&&this.prevRoundBingoSymbol!==s) correctionMultTotal+=1.5;
            if(GameState.hasRelic('turn_boost')) correctionMultTotal*=Math.pow(1.01,this.turnInRound);
            if(GameState.hasRelic('hand_boost')) correctionMultTotal+=GameState.hand.length*3;
            if(GameState.hasRelic('last_stand')&&GameState.round>=4) correctionMultTotal*=2;
            GameState.relics.forEach(rel=>{
              if(rel.relicEnhance==='ren_general') correctionMultTotal*=1.1;
              if(rel.relicEnhance==='ren_only_one'&&GameState.relicCount()===1) correctionMultTotal+=20;
              if(rel.relicEnhance==='ren_grade'){ const n=GameState.currentDeck.reduce((acc,c)=>{let x=0;if(c.enhance)x++;if(c.jamming)x++;if(c.trait)x++;return acc+x;},0); correctionMultTotal+=n; }
              if(rel.relicEnhance==='ren_discard') correctionMultTotal*=1.5;
            });
          }
          cells.forEach(c=>{
            if(!c.card) return;
            if(c.card.trait==='指令官'&&this.turnInRound>=7&&this.turnInRound<=10) correctionMultTotal*=1.2;
            if(c.card.trait==='ミニマム'){ const counts={}; GameData.SYMBOLS.forEach(sy=>{counts[sy]=this.board.filter(bc=>bc&&bc.symbol===sy).length;}); const minv=Math.min(...Object.values(counts).filter(v=>v>0)); correctionMultTotal+=minv*20; }
            if(c.card.trait==='マキシマム'){ const counts={}; GameData.SYMBOLS.forEach(sy=>{counts[sy]=this.board.filter(bc=>bc&&bc.symbol===sy).length;}); const maxS=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]; if(maxS&&maxS[0]===s) correctionMultTotal+=maxS[1]*10; }
          });
          if(GameState.hand.some(c=>c.trait==='将軍')) correctionMultTotal*=1.1;
          const mult=baseMult+correctionMultTotal;

          // #3 最終乗算補正：ren_double/ren_triple/サンカクパッシブ2/セブンパッシブ2のみ（倍率とは別の掛け算段階）
          let finalMul=GameData.FINAL_MULTIPLIER;
          if(!noRelic){
            if(GameState.relics.some(r=>r.relicEnhance==='ren_double')) finalMul*=1.5;
            if(GameState.relics.some(r=>r.relicEnhance==='ren_triple')) finalMul*=2;
          }
          if(GameState.symbolPassiveTier.Triangle>=2) finalMul+=GameState.currentDeck.filter(c=>c.jamming).length*0.1;
          // #新規 セブンパッシブ2：フラグが立っていれば次のビンゴで最終乗算補正×7
          if(GameState.symbolPassiveTier.Seven>=2 && GameState.sevenPendingMultBoost) finalMul*=7;
          let finalAddTotal=GameData.FINAL_ADD;
          if(!noRelic&&GameState.relics.some(r=>r.relicEnhance==='ren_draw_pile')) finalAddTotal+=GameState.drawPile.length*100;
          // #新規 セブンパッシブ3：デッキ枚数が7の倍数の時、最終加算補正+目標点数の7%
          if(GameState.symbolPassiveTier.Seven>=3 && GameState.currentDeck.length%7===0) finalAddTotal+=Math.round(GameState.targetScore*0.07);
          total+=Math.round(lb*mult*finalMul)+finalAddTotal;
          any=true; return true;
        };
        // #10 5×5盤面の5列ビンゴにも対応
        this.windows.forEach((win,idx)=>{ if(!win.isPenta) return; if(tryW(win,idx,GameData.SYMBOLS.reduce((o,sy)=>{o[sy]=GameData.pentaMult(sy);return o;},{}))) (this.quadSiblings[idx]||[]).forEach(s=>{local.add(s);(this.quadSiblings[s]||[]).forEach(s2=>local.add(s2));}); });
        this.windows.forEach((win,idx)=>{ if(!win.isQuad) return; if(tryW(win,idx,qObj)) (this.quadSiblings[idx]||[]).forEach(s=>local.add(s)); });
        this.windows.forEach((win,idx)=>{ if(win.isQuad||win.isPenta) return; tryW(win,idx,GameData.BINGO_MULTIPLIER_BASE); });
      }
      // #10 予測点数が0点（またはマイナス）の場合は表示しない
      if(any&&total>0) hints[ci]=total;
    }
    return hints;
  },

  onCardClick(id){
    if(this.rerollMode){this.toggleRerollCard(id);return;}
    if(this.currentSide!=='player'||this.resultState) return;
    this.selectedCardId=(this.selectedCardId===id)?null:id;
    this.boardInfoCell=null; this.activeRelicId=null; this.expandPending=null; this.paintPending=null;
    this.renderAll();
  },

  onCellClick(ci){
    if(this.resultState||this.rerollMode) return;
    if(!this.selectedCardId){
      const occ=this.board[ci]; if(occ){this.boardInfoCell=(this.boardInfoCell===ci)?null:ci;this.renderAll();} return;
    }
    const card=GameState.hand.find(c=>c.id===this.selectedCardId);
    if(!card||this.currentSide!=='player') return;
    if(this.blockedCells.has(ci)) return;
    const isPaint=card.trait==='塗りつぶし'||card.trait==='塗りつぶし(レリック)';
    if(card.enhance==='横拡張'){this.handleExpandPlace(ci,card,'right',isPaint);return;}
    if(card.enhance==='縦拡張'){this.handleExpandPlace(ci,card,'up',isPaint);return;}
    if(card.enhance==='拡大'){this.handleExpandPlace(ci,card,'rect',isPaint);return;}
    if(isPaint){
      // 空きマスなら確認不要で即配置
      if(!this.board[ci]){ this.paintPending=null; this.executePlacement([ci],card); return; }
      // 占有マスなら2タップ確認
      if(this.paintPending===ci){ this.paintPending=null; this.executePlacement([ci],card); }
      else{ this.paintPending=ci; this.boardInfoCell=null; this.renderAll(); }
      return;
    }
    const occ=this.board[ci];
    // #4 重ね掛け：盤面にある同じ記号のカードの上に上書き配置できる（上書きされたカードの基礎点を加算）
    if(card.enhance==='重ね掛け'&&occ&&occ.symbol===card.symbol){
      if(this.paintPending===ci){
        this.paintPending=null;
        card.baseScore+=occ.baseScore;
        this.executePlacement([ci],card,true);
      }else{ this.paintPending=ci; this.boardInfoCell=null; this.renderAll(); }
      return;
    }
    if(occ){this.boardInfoCell=(this.boardInfoCell===ci)?null:ci;this.renderAll();return;}
    this.paintPending=null; this.executePlacement([ci],card);
  },

  handleExpandPlace(ci,card,mode,isPaint){
    const doubled=card.symbol==='Square'&&GameState.symbolPassiveTier.Square>=2; // #4 シカクパッシブ2：拡張/拡大が強化される
    const targets=this.getExpandTargets(ci,mode,isPaint,doubled);
    if(!targets){this.addLog('この場所には配置できません');this.expandPending=null;this.renderAll();return;}
    if(this.expandPending&&this.expandPending.firstCi===ci){const c=this.expandPending.card;this.expandPending=null;this.executePlacement(targets,c);}
    else{this.expandPending={card,targets,firstCi:ci,mode};this.boardInfoCell=null;this.renderAll();}
  },

  getExpandTargets(startCi,mode,isPaint=false,doubled=false){
    const sr=Math.floor(startCi/GameData.BOARD_SIZE),sc=startCi%GameData.BOARD_SIZE;
    let offsets=[];
    // #4 シカクパッシブ2：横拡張/縦拡張は4マス、拡大は4×4マスに強化される
    if(mode==='right') offsets=doubled?[[0,0],[0,1],[0,2],[0,3]]:[[0,0],[0,1]];           // 右隣
    if(mode==='up')    offsets=doubled?[[0,0],[-1,0],[-2,0],[-3,0]]:[[0,0],[-1,0]];       // 上隣
    if(mode==='rect'){
      if(doubled){ offsets=[]; for(let dr=0;dr<4;dr++) for(let dc=0;dc<4;dc++) offsets.push([dr,dc]); } // シカクパッシブ2：拡大は4×4マス
      else offsets=[[0,0],[0,1],[1,0],[1,1]]; // 通常時：右・下・右下（2×2）
    }
    const targets=[];
    for(const [dr,dc] of offsets){
      const nr=sr+dr,nc=sc+dc;
      if(nr<0||nr>=GameData.BOARD_SIZE||nc<0||nc>=GameData.BOARD_SIZE) return null;
      const idx=this.cellIndex(nr,nc);
      if(this.blockedCells.has(idx)) return null;
      if(!isPaint&&this.board[idx]!==null) return null;
      targets.push(idx);
    }
    return targets.length>0?targets:null;
  },

  async executePlacement(targets,card,isOverlay=false){
    const mainCi=targets[0];
    const isPaint=card.trait==='塗りつぶし'||card.trait==='塗りつぶし(レリック)';
    // #3 シカクパッシブ1：プレイしたシカクカード自身にも基礎点+1を永続付与
    if(card.symbol==='Square'&&GameState.symbolPassiveTier.Square>=1) card.baseScore+=1;
    for(const ci of targets){
      if(this.board[ci]?.card&&(isPaint||isOverlay)) this.pushToDiscard(this.board[ci].card);
      this.board[ci]={symbol:card.symbol,baseScore:card.baseScore,owner:'player',card:ci===mainCi?card:null};
    }
    this.lastPlacedCell=mainCi;
    // #6 配置演出：複数マス配置時も全マスをポップ表示
    this.justPlacedCells=targets.slice();
    setTimeout(()=>{ this.justPlacedCells=null; this.renderAll(); },550);
    this.paintPending=null;
    GameState.hand=GameState.hand.filter(c=>c.id!==card.id);
    if(card.jamming==='サンダー') this.applyThunder();
    const breakActive=this.isBreakActive()||card?.jamming==='ブレイク'; // #3
    const isNeg=card.trait==='ネガティブ'||card.trait==='ネガティブ(パッシブ)';
    this.board.forEach(cell=>{
      if(!cell?.card) return;
      const sqP1c=cell.card.symbol==='Square'&&GameState.symbolPassiveTier.Square>=2; // #1 シカクパッシブ3はシカクカードのみ有効
      if(cell.card.enhance==='巨大化') cell.baseScore+=3*(sqP1c?2:1);
      // #2 肥大化：カード基礎点/2×対象ビンゴ倍率
      if(cell.card.enhance==='肥大化'){const a=Math.round((cell.card.baseScore/2)*GameData.BINGO_MULTIPLIER_BASE[cell.symbol]*(sqP1c?2:1));GameState.currentScore=Math.max(0,GameState.currentScore+a);}
    });
    // #9/#8 マルパッシブ2：マルカードをプレイした時、盤面のマル枚数×マル倍率×10点を加算（Lv1/Lv2入れ替えによりLv2条件に変更）
    if(card.symbol==='Circle'&&GameState.symbolPassiveTier.Circle>=2){
      const n=this.board.filter(c=>c&&c.symbol==='Circle').length;
      const add=Math.round(n*GameData.BINGO_MULTIPLIER_BASE.Circle*10);
      GameState.currentScore=Math.max(0,GameState.currentScore+add);
      this.addLog(`マルパッシブ：マル${n}枚×倍率×10 = ${GlobalFunctions.formatSigned(add)}`);
    }
    // #2 肥大化などビンゴを介さない加点でも目標点数到達で即座にゲームクリアにする
    if(GameState.currentScore>=GameState.targetScore){ this.renderAll(); this.finishStage('win'); return; }
    if(card.enhance==='ドロー'){ this.drawOne(); if(card.symbol==='Square'&&GameState.symbolPassiveTier.Square>=2) this.drawOne(); }
    // #A シカクパッシブ3
    if(card.symbol==='Square'&&GameState.symbolPassiveTier.Square>=1){ const dc=this.drawOne(); if(dc) dc.baseScore+=1; }
    // #4 エクステンド：このカードを置いたターンはビンゴ判定を行わない（次の自分の配置で解除・判定される）
    const isExtending2 = card.enhance==='エクステンド';
    const newBingos = isExtending2 ? [] : this.detectNewBingos();
    if(isExtending2){ this.extendActive=true; this.addLog('エクステンド：このターンはビンゴ判定を行わない'); }
    else if(this.extendActive){ this.extendActive=false; }
    if(!isNeg) this.turnInRound++;
    if(card.jamming) this.queueJammingEffect(card.jamming,mainCi);
    // #A サンカクパッシブ1
    if(card.jamming&&card.symbol==='Triangle'&&GameState.symbolPassiveTier.Triangle>=3){ // #4 サンカクカードのみ有効
      (this.pendingDelayedJamming=this.pendingDelayedJamming||[]).push({jamming:card.jamming,cellIdx:mainCi,afterTurns:1});
    }
    { const n=GameState.relics.filter(r=>r.id==='draw_boost').length; for(let i=0;i<n&&GameState.hand.length<GameState.effectiveHandSize();i++) this.drawOne(); }
    this.selectedCardId=null; this.boardInfoCell=null; this.activeRelicId=null; this.expandPending=null; this.paintPending=null;
    this.renderAll();
    if(newBingos.length>0) await this.playScoreSequence(newBingos);
    const endByBingo=this.shouldBingoEndRound(newBingos,breakActive);
    if(endByBingo||this.turnInRound>GameState.effectiveTurnsPerRound()){this.renderAll();await this.sleep(300);this.endRound();return;}
    if(isNeg){this.renderAll();return;}
    this.currentSide=this.currentSide==='player'?'npc':'player';
    // #6 階層10特有ボス効果：ターン6,11,16…は強制的にNPCの番にする
    if(GameState.floor10SpecialBoss&&this.isForcedNpcTurn(this.turnInRound+1)) this.currentSide='npc';
    this.renderAll(); if(this.currentSide==='npc') this.scheduleAIMove(); else this.checkAutoSkip();
  },

  onRelicClick(idx){ this.activeRelicId=(this.activeRelicId===idx)?null:idx; this.boardInfoCell=null; this.selectedCardId=null; this.renderAll(); },

  // #2 売却はインデックスベースで特定（同一idのレリックが複数あっても正しく売却）
  sellRelic(relicIndex){
    const idx=parseInt(relicIndex,10);
    if(isNaN(idx)||idx<0||idx>=GameState.relics.length) return;
    const relic=GameState.relics[idx];
    this.removeRelicEffect(relic);
    const ren=relic.relicEnhance;
    let price=1;
    if(ren==='ren_discard_sell') price=Math.floor(GameState.currentDeck.length/2);
    else if(ren) price+=2;
    GameState.relics.splice(idx,1);
    GameState.gold+=price;
    this.activeRelicId=null;
    this.addLog(`レリック「${relic.name}」を${price}Gで売却した`);
    this.renderAll();
  },

  // #20 レリック効果の除去
  removeRelicEffect(relic){
    switch(relic.id){
      case 'round_boost': break; // #7
      case 'reroll_boost': break; // #7
      case 'hand_boost': break; // #1
      case 'paint': this.removePaintRelic(); GameState.turnsBonus+=8; break; // #10 ターン変動-8に修正
      case 'jamming_boost': GameState.handSizeBonus+=3; break; // #7 手札上限-3の解除
      case 'base_boost': GameData.FINAL_ADD=Math.max(0,GameData.FINAL_ADD-2000); break;
      default: break;
    }
    if(relic.relicEnhance==='ren_cross') GameData.BINGO_MULTIPLIER_BASE['Cross']=Math.max(-30,GameData.BINGO_MULTIPLIER_BASE['Cross']/5);
  },

  addLog(text){ this.logs.push(text); if(this.logs.length>80) this.logs.shift(); },

  // ===== Render =====
  renderAll(){
    // #5 renderAll中の例外で画面が真っ暗（ブラックアウト）になるのを防ぐためのセーフティネット
    try{
      this._renderAllInner();
    }catch(e){
      console.error('renderAll error:', e);
      this.container.innerHTML='';
      const err=document.createElement('div'); err.style.cssText='padding:24px;text-align:center;color:#fff;';
      err.innerHTML=`<div style="margin-bottom:14px;">画面の表示中にエラーが発生しました。<br>お手数ですがマップに戻ってください。</div><button id="err-back-btn">マップに戻る</button>`;
      this.container.appendChild(err);
      document.getElementById('err-back-btn').addEventListener('click',()=>{ App.showMapSelect(); });
    }
  },

  _renderAllInner(){
    // #4 再描画のたびに画面が一番上へ戻る不具合を防ぐ：スクロール位置を保持
    const scrollY=window.scrollY;
    this.container.innerHTML='';
    const wrap=document.createElement('div'); wrap.className='game-screen';
    // #1 上画面のボックスに、ラウンド・点数・デッキ操作・レリック・パッシブをまとめて含める
    const topBox=document.createElement('div'); topBox.className='top-info-box';
    topBox.appendChild(this.renderStatusBar());
    // #6 リロール・デッキ/山札/捨て札一覧・レリックを上画面に移動
    topBox.appendChild(this.renderControls());
    topBox.appendChild(this.renderRelicRow());
    if(this.activeRelicId){const rp=this.renderRelicInfoPanel();if(rp) topBox.appendChild(rp);}
    wrap.appendChild(topBox);
    const pip=this.renderPassiveInfoPanel(); if(pip) wrap.appendChild(pip);
    const turnMax=GameState.effectiveTurnsPerRound();
    const turnEl=document.createElement('div'); turnEl.className='turn-indicator '+this.currentSide;
    turnEl.textContent=this.currentSide==='player'?`あなたの番（ターン ${this.turnInRound} / ${turnMax}）`:`NPCの番（ターン ${this.turnInRound} / ${turnMax}）`;
    wrap.appendChild(turnEl);
    if(this.bossEffect||GameState.floor10SpecialBoss){
      const bt=document.createElement('div'); bt.className='boss-tag';
      // #9 複数ボス効果（第5階層以降）を全て表示する
      let html=this.bossEffect?(this.bossEffects||[this.bossEffect]).map(be=>`<span class="boss-tag-name">ボス効果：${be.name}</span><span class="boss-tag-desc">${be.desc}</span>`).join(''):'';
      // #6 階層10特有ボス効果を常時表示
      if(GameState.floor10SpecialBoss) html+=`<span class="boss-tag-name">ボス効果：最終決戦</span><span class="boss-tag-desc">5ターンごと（6,11,16…ターン目）は強制的にNPCの番になる</span>`;
      bt.innerHTML=html;
      wrap.appendChild(bt);
    }
    const ba=document.createElement('div'); ba.className='board-area';
    const leftCol=document.createElement('div'); leftCol.className='board-left-col';
    const multLegend=this.renderMultLegend();
    if(this.scoringAnim?.phase===2) multLegend.classList.add('scoring-phase2');
    leftCol.appendChild(multLegend);
    leftCol.appendChild(this.renderEffectsPanel()); // #6 常時表示
    ba.appendChild(leftCol); ba.appendChild(this.renderBoard());
    wrap.appendChild(ba);
    const bi=this.renderBoardInfoPanel(); if(bi) wrap.appendChild(bi);
    wrap.appendChild(this.renderHand());
    const hi=this.renderHandInfoPanel(); if(hi) wrap.appendChild(hi);
    wrap.appendChild(this.renderLog());
    this.container.appendChild(wrap);
    // #1 報酬画面／パッシブ選択はゲームメイン画面の上にオーバーレイ表示する（両方同時に出ても良いよう独立したifにする）
    if(this.resultState) this.container.appendChild(this.renderResult());
    if(this.pendingPassiveChoice && this.passiveModalOpen) this.container.appendChild(this.renderPassiveChoiceModal());
    window.scrollTo(0,scrollY);
  },

  renderStatusBar(){
    const holder=document.createElement('div'); holder.style.width='100%';
    const bar=document.createElement('div'); bar.className='status-bar'; bar.style.flexDirection='column'; bar.style.alignItems='flex-start';
    // #3 点数バーは現在の点数(GameState.currentScore)にのみ連動させる。計算中の途中値は反映しない
    const live=GameState.currentScore;
    const sparkle=this.scoringAnim&&this.scoringAnim.reached;
    const pct=Math.min(100,Math.floor((live/GameState.targetScore)*100));
    // #6 ラウンドを大きく表示し、点数は「現在/目標」の1つの表示にまとめる
    const topRow=document.createElement('div'); topRow.style.cssText='display:flex;align-items:center;gap:14px;width:100%;flex-wrap:wrap;';
    const roundBox=document.createElement('div'); roundBox.className='round-big-stat';
    roundBox.innerHTML=`<div class="label">ラウンド</div><div class="round-big-value">${GameState.round}<span class="round-big-max">/${GameState.effectiveMaxRounds()+(this.stageBonusRounds||0)}</span></div>`;
    topRow.appendChild(roundBox);
    const stats=[['ステージ',this.stage.name],['G',GameState.gold]];
    for(const [label,val] of stats){const d=document.createElement('div');d.className='stat';d.innerHTML=`<div class="label">${label}</div><div class="value">${val}</div>`;topRow.appendChild(d);}
    // #4 パッシブ一覧をラウンド・ステージと同じ行の右側に配置する
    const passiveBar=this.renderPassiveBar(); passiveBar.style.marginLeft='auto';
    topRow.appendChild(passiveBar);
    bar.appendChild(topRow);
    const scoreBox=document.createElement('div'); scoreBox.className='stat score-combined-stat';
    scoreBox.innerHTML=`<div class="label">現在の点数 / 目標点数</div><div class="value${sparkle?' sparkle':''}">${GlobalFunctions.formatScore(live)} / ${GlobalFunctions.formatScore(GameState.targetScore)}</div>`;
    bar.appendChild(scoreBox);
    // #5 ビンゴ演出：8マスの計算過程を表示
    const scb=this.renderScoreCalcBoard(); if(scb) bar.appendChild(scb);
    holder.appendChild(bar);
    const outer=document.createElement('div');outer.className='progress-outer';outer.style.marginTop='8px';
    const inner=document.createElement('div');inner.className='progress-inner';inner.style.width=pct+'%';
    outer.appendChild(inner);holder.appendChild(outer);
    return holder;
  },

  // #5 カードタグ：ドット表示に変更
  // --- 共通カード表示ヘルパー（手札/盤面/ショップ共通） ---

  // #1 左上ドット（ジャミング緑・強化黄・性質変化青）
  cardTagsHtml(card){
    let h='';
    if(card.jamming) h+=`<div class="card-dot dot-jamming"></div>`;
    if(card.enhance) h+=`<div class="card-dot dot-enhance"></div>`;
    if(card.trait)   h+=`<div class="card-dot dot-trait"></div>`;
    return h?`<div class="card-dots-row">${h}</div>`:'';
  },

  // #4 各強化効果の視覚表現を記号に反映
  cardSymbolHtml(card){
    const label=GameData.SYMBOL_LABEL[card.symbol];
    const emoji=card.jamming?(GameData.JAMMING_EMOJI[card.jamming]||''):'';
    const emojiHtml=emoji?`<div class="card-jamming-emoji">${emoji}</div>`:'';
    const multiSym=GameData.MULTI_SYMBOL_LABEL[card.enhance];
    // #1 マルパッシブ2：マルマルチ(パッシブ専用枠)は通常の強化効果と別枠の黄色丸バッジで表示
    const passiveMultiHtml=card._passiveMultiSymbol?`<span class="passive-multi-badge" title="マルマルチ(パッシブ)">${card._passiveMultiSymbol}</span>`:'';

    // 拡張・拡大
    // #4 シカクパッシブ2以上でシカクの拡張/拡大が強化されている間、記号を青く光らせて拡縮させるループアニメーションを付与
    const squareBoosted=card.symbol==='Square'&&GameState.symbolPassiveTier.Square>=2;
    const boostCls=squareBoosted?' square-boosted':'';
    if(card.enhance==='横拡張')
      return `<div class="card-symbol-expand horiz"><span class="sym-${card.symbol} esym${boostCls}">${label}</span><span class="sym-${card.symbol} esym${boostCls}">${label}</span></div>${emojiHtml}${passiveMultiHtml}`;
    if(card.enhance==='縦拡張')
      return `<div class="card-symbol-expand vert"><span class="sym-${card.symbol} esym${boostCls}">${label}</span><span class="sym-${card.symbol} esym${boostCls}">${label}</span></div>${emojiHtml}${passiveMultiHtml}`;
    if(card.enhance==='拡大')
      return `<div class="card-symbol-expand grid2${squareBoosted?' grid4':''}"><span class="sym-${card.symbol} esym${boostCls}">${label}</span><span class="sym-${card.symbol} esym${boostCls}">${label}</span><span class="sym-${card.symbol} esym${boostCls}">${label}</span><span class="sym-${card.symbol} esym${boostCls}">${label}</span></div>${emojiHtml}${passiveMultiHtml}`;

    // 巨大化：記号1.5倍（ターンごとの変化をパルスで表現）
    if(card.enhance==='巨大化'){
      const sub=multiSym?`<span class="card-multi-sub">${multiSym}</span>`:'';
      return `<div class="card-symbol-wrap enhance-pulse"><span class="sym-${card.symbol} sym-large">${label}</span>${sub}</div>${emojiHtml}${passiveMultiHtml}`;
    }
    // ハブ：記号右に➕
    if(card.enhance==='ハブ'){
      const sub=multiSym?`<span class="card-multi-sub">${multiSym}</span>`:'';
      return `<div class="card-symbol-wrap"><span class="sym-${card.symbol}">${label}</span><span class="enhance-badge">➕</span>${sub}</div>${emojiHtml}${passiveMultiHtml}`;
    }
    // 連鎖：記号右に🤝
    if(card.enhance==='連鎖'){
      const sub=multiSym?`<span class="card-multi-sub">${multiSym}</span>`:'';
      return `<div class="card-symbol-wrap"><span class="sym-${card.symbol}">${label}</span><span class="enhance-badge">🤝</span>${sub}</div>${emojiHtml}${passiveMultiHtml}`;
    }
    // 肥大化：記号横に "+加算値" (黄色、ターンごとの変化をパルスで表現)
    if(card.enhance==='肥大化'){
      const sqP3=card.symbol==='Square'&&GameState.symbolPassiveTier?.Square>=2; // #1 シカクパッシブ3はシカクカードのみ有効
      const mult=GameData.BINGO_MULTIPLIER_BASE[card.symbol]||0;
      // #2 肥大化：カード基礎点/2×対象ビンゴ倍率
      const val=Math.round((card.baseScore/2)*mult*(sqP3?2:1));
      const sub=multiSym?`<span class="card-multi-sub">${multiSym}</span>`:'';
      return `<div class="card-symbol-wrap enhance-pulse"><span class="sym-${card.symbol}">${label}</span><span class="enhance-badge${sqP3?' passive-value':' gold-text'}">+${val}</span>${sub}</div>${emojiHtml}${passiveMultiHtml}`;
    }
    // #4 エクステンド：記号右に⏩
    if(card.enhance==='エクステンド'){
      const sub=multiSym?`<span class="card-multi-sub">${multiSym}</span>`:'';
      return `<div class="card-symbol-wrap"><span class="sym-${card.symbol}">${label}</span><span class="enhance-badge">⏩</span>${sub}</div>${emojiHtml}${passiveMultiHtml}`;
    }
    // #4 トップスピード：記号右に💨
    if(card.enhance==='トップスピード'){
      const sub=multiSym?`<span class="card-multi-sub">${multiSym}</span>`:'';
      return `<div class="card-symbol-wrap"><span class="sym-${card.symbol}">${label}</span><span class="enhance-badge">💨</span>${sub}</div>${emojiHtml}${passiveMultiHtml}`;
    }
    // #2 重ね掛け：記号右に「重」の文字を表示（以前は記号に重ねて表示していたため視認できなかった）
    if(card.enhance==='重ね掛け'){
      const sub=multiSym?`<span class="card-multi-sub">${multiSym}</span>`:'';
      return `<div class="card-symbol-wrap"><span class="sym-${card.symbol}">${label}</span><span class="enhance-badge">重</span>${sub}</div>${emojiHtml}${passiveMultiHtml}`;
    }
    // #3 加重：記号右に「基礎点+◯」（加算値は黄色）
    if(card.enhance==='加重'){
      const sub=multiSym?`<span class="card-multi-sub">${multiSym}</span>`:'';
      const addVal=card._weightedBonus!=null?card._weightedBonus:0;
      return `<div class="card-symbol-wrap"><span class="sym-${card.symbol}">${label}</span><span class="enhance-badge">基礎点<span class="gold-text">+${addVal}</span></span>${sub}</div>${emojiHtml}${passiveMultiHtml}`;
    }
    // #2 ギャンブル：記号右に🎰（以前は記号に重ねて表示していたため視認できなかった）
    if(card.enhance==='ギャンブル'){
      const sub=multiSym?`<span class="card-multi-sub">${multiSym}</span>`:'';
      return `<div class="card-symbol-wrap"><span class="sym-${card.symbol}">${label}</span><span class="enhance-badge">🎰</span>${sub}</div>${emojiHtml}${passiveMultiHtml}`;
    }
    // マルチ系
    const sub=multiSym?`<span class="card-multi-sub">${multiSym}</span>`:'';
    return `<div class="card-symbol-wrap"><span class="sym-${card.symbol}">${label}</span>${sub}</div>${emojiHtml}${passiveMultiHtml}`;
  },

  // #4 右上数字にブルジョワ・ドロー情報を付加
  // #1 ドット（黄緑青）をカード基礎点の左に inline 表示
  // #2 ブルジョワは現在Gを受け取って動的表示
  // #6 数値強化も +15 を明示
  cardScoreHtml(card, currentGold=0, boardBaseScore=null){
    const multiMap={'マルマルチ':'Circle','サンカクマルチ':'Triangle','シカクマルチ':'Square'};
    const ms=multiMap[card.enhance];
    // #6 巨大化・連鎖は盤面上のセルの基礎点(cell.baseScore)がターンごとに加算されていくが、
    // カード自身のbaseScoreは変化しないため、盤面表示時はセル側の値を優先して使う
    const baseForDisplay = boardBaseScore!=null ? boardBaseScore : card.baseScore;

    // 左側インラインドット
    let dotHtml='';
    if(card.enhance) dotHtml+=`<span class="score-dot dot-enhance"></span>`;
    if(card.jamming) dotHtml+=`<span class="score-dot dot-jamming"></span>`;
    if(card.trait)   dotHtml+=`<span class="score-dot dot-trait"></span>`;
    const dotsSpan=dotHtml?`<span class="score-dots">${dotHtml}</span>`:'';

    let bonusHtml='';
    const sqP3=card.symbol==='Square'&&GameState.symbolPassiveTier?.Square>=2; // #1 シカクパッシブ3はシカクカードのみ有効
    if(ms&&card.symbol===ms&&baseForDisplay>card.number){
      bonusHtml=`<span class="card-score-bonus">+${baseForDisplay-card.number}</span>`;
    } else if(card.enhance==='数値強化'){
      bonusHtml=`<span class="card-score-bonus${sqP3?' passive-value':''}">+${15*(sqP3?2:1)}</span>`;
    } else if(card.enhance==='ブルジョワ'){
      // #1 バッジは倍率のみの簡潔表示に。実際の加算数値は説明欄（cardInfoDescHtml）に記載する
      const mulG=sqP3?8:4;
      bonusHtml=`<span class="card-score-bonus gold-text${sqP3?' passive-value':''}">×${mulG}G</span>`;
    }

    // #4 パッシブ効果でカード基礎点が変化する場合、青字で実効値を表示する
    let displayScore=baseForDisplay, scoreIsPassive=(boardBaseScore!=null&&boardBaseScore!==card.baseScore);
    if(card.symbol==='Cross'&&GameState.symbolPassiveTier.Cross>=2){ displayScore=GameState.currentDeck.length*3; scoreIsPassive=true; }
    else if(card.symbol==='Triangle'&&GameState.symbolPassiveTier.Triangle>=1){
      const total=GameState.currentDeck.length||1;
      const n=GameState.currentDeck.filter(cc=>cc.symbol==='Triangle').length/total;
      displayScore=Math.round(baseForDisplay*(1+n)); scoreIsPassive=true;
    }
    const numHtml=scoreIsPassive?`<span class="passive-value">${displayScore}</span>`:`${baseForDisplay}`;
    let scoreHtml=`<span class="card-number">${dotsSpan}${numHtml}${bonusHtml}</span>`;
    if(card.enhance==='ドロー') scoreHtml+=`<span class="card-draw-label${sqP3?' passive-value':''}">draw${sqP3?2:1}</span>`;
    return scoreHtml;
  },

  cardInfoDescHtml(card){
    const l=[];
    if(card.jamming){
      const emoji=GameData.JAMMING_EMOJI[card.jamming]||'';
      l.push(`<div class="info-desc desc-jamming">${emoji} 【${card.jamming}】${GameData.JAMMING_DESC[card.jamming]||''}</div>`);
    }
    if(card.enhance){
      let extra='';
      // #1 ブルジョワ：付与時に確定した実際の加算数値を説明欄に明記する
      if(card.enhance==='ブルジョワ'){
        const base=card.number||0; const granted=card.baseScore-base;
        extra=`（付与時に基礎点+${granted}が確定済み。現在の基礎点${card.baseScore}に反映済み）`;
      }
      l.push(`<div class="info-desc desc-enhance">【${card.enhance}】${GameData.ENHANCE_DESC[card.enhance]||''}${extra}</div>`);
    }
    if(card.trait)   l.push(`<div class="info-desc desc-trait">【${card.trait}】${GameData.TRAIT_DESC[card.trait]||''}</div>`);
    return l.length>0?l.join(''):'<div class="info-desc">効果なし</div>';
  },

  effectDotClasses(card){ if(!card) return []; const d=[]; if(card.jamming) d.push('dot-jamming'); if(card.enhance) d.push('dot-enhance'); if(card.trait) d.push('dot-trait'); return d; },

  renderMultLegend(){
    const legend=document.createElement('div'); legend.className='mult-legend';
    const rows=GameData.SYMBOLS.map(s=>{const base=GameData.BINGO_MULTIPLIER_BASE[s]+GameData.CORRECTION_MULTIPLIER;const quad=Math.round(GameData.quadMult(s)+GameData.CORRECTION_MULTIPLIER);const f=v=>v>=0?'+'+Math.round(v):String(Math.round(v));return`<tr><td class="sym-${s}">${GameData.SYMBOL_LABEL[s]}</td><td>${f(base)}</td><td>${f(quad)}</td></tr>`;}).join('');
    legend.innerHTML=`<table><tr><th></th><th>基礎</th><th>4列</th></tr>${rows}</table>`;
    return legend;
  },

  // #6 盤面効果一覧：常時表示
  renderEffectsPanel(){
    const panel=document.createElement('div'); panel.className='effects-panel-side';
    panel.innerHTML='<h3>盤面効果</h3>';
    const entries=[];
    this.board.forEach((cd,i)=>{const card=cd&&cd.card;if(card&&(card.jamming||card.enhance||card.trait)) entries.push({i,symbol:cd.symbol,card});});
    if(entries.length===0){const empty=document.createElement('div');empty.className='eff-empty';empty.textContent='なし';panel.appendChild(empty);}
    else entries.forEach(e=>{
      const r=Math.floor(e.i/GameData.BOARD_SIZE)+1,c=(e.i%GameData.BOARD_SIZE)+1;
      const names=[e.card.jamming,e.card.enhance,e.card.trait].filter(Boolean).join('・');
      const entry=document.createElement('div');entry.className='effect-entry';
      entry.innerHTML=`<div class="eff-head"><span class="sym-${e.symbol}">${GameData.SYMBOL_LABEL[e.symbol]}</span> ${names}（${r}行${c}列）</div><div class="eff-desc">${this.cardInfoDescHtml(e.card)}</div>`;
      panel.appendChild(entry);
    });
    return panel;
  },

  renderBoard(){
    const wrapper=document.createElement('div'); wrapper.className='board-wrapper';
    const board=document.createElement('div'); board.className='board';
    // #3 ホシパッシブ2：5×5盤面はセルサイズを縮小してグリッドを動的に設定
    const bs=GameData.BOARD_SIZE;
    if(bs!==4){
      const cellPx = bs>=5 ? 54 : 70;
      board.style.gridTemplateColumns=`repeat(${bs},${cellPx}px)`;
      board.style.gridTemplateRows=`repeat(${bs},${cellPx}px)`;
    }
    const hints=this.computeHints();
    const sc=this.scoringAnim?this.scoringAnim.cells:[];
    const expandTargets=this.expandPending?new Set(this.expandPending.targets):new Set();
    const paintTarget=this.paintPending;
    for(let i=0;i<this.board.length;i++){
      const cd=this.board[i]; const cellEl=document.createElement('div');
      const isBlocked=this.blockedCells.has(i);
      const card=GameState.hand.find(c=>c.id===this.selectedCardId);
      const isPaint=card&&(card.trait==='塗りつぶし'||card.trait==='塗りつぶし(レリック)');
      const canPlace=this.currentSide==='player'&&!this.resultState&&!this.rerollMode&&(cd===null||isPaint)&&this.selectedCardId&&!isBlocked;
      cellEl.className='cell '+(isBlocked?'blocked':(cd===null?(canPlace?'empty':'disabled'):''));
      cellEl.dataset.ci=i;
      // #6 配置演出：直前に置かれたマスにポップアニメーション
      if(i===this.justPlacedCell||(this.justPlacedCells&&this.justPlacedCells.includes(i))) cellEl.classList.add('place-pop');
      if(isBlocked){cellEl.textContent='✕';cellEl.style.color='#333';}
      else if(cd){
        if(cd.card){
          // #5 盤面のカードは手札と同じUIヘルパーで描画（塗りつぶし材質・サンダー絵文字・強化効果を統一）
          cellEl.classList.add('card');
          if(cd.card.trait) cellEl.classList.add(`trait-${cd.card.trait.replace(/[()]/g,'')}`);
          cellEl.innerHTML+=`${this.cardTagsHtml(cd.card)}${this.cardSymbolHtml(cd.card)}${this.cardScoreHtml(cd.card,GameState.gold,cd.baseScore)}`;
          this.attachHoverTip(cellEl,cd.card);
        }else{
          const sym=document.createElement('div'); sym.className='card-symbol-wrap sym-'+cd.symbol;
          sym.textContent=GameData.SYMBOL_LABEL[cd.symbol];
          cellEl.appendChild(sym);
          const st=document.createElement('div');st.className='cell-score';st.textContent=cd.baseScore;cellEl.appendChild(st);
        }
        if(sc.includes(i)){
          cellEl.classList.add('scoring-cell');
          const isPopping=this.scoringAnim?.phase===0&&this.scoringAnim?.popCell===i;
          if(isPopping){
            cellEl.classList.add('scoring-pop');
            const badge=document.createElement('div');badge.className='score-badge';badge.textContent='+'+cd.baseScore;cellEl.appendChild(badge);
          }
          // #2 計算確定時：獲得した合計点数(+N)をビンゴ列の中央セルに大きく表示
          if(this.scoringAnim?.phase>=8&&sc.length>0&&i===sc[Math.floor(sc.length/2)]){
            const finalBadge=document.createElement('div');finalBadge.className='score-badge score-badge-final'+(this.scoringAnim.score<0?' negative':'');finalBadge.textContent=GlobalFunctions.formatSigned(this.scoringAnim.score);cellEl.appendChild(finalBadge);
          }
        }
        if(this.bossBlackedOut&&cd.owner==='player'){
          const symEl=cellEl.querySelector('.sym-'+cd.symbol)||cellEl.querySelector('.card-symbol-wrap');
          if(symEl) symEl.style.color='transparent';
        }
      }else if(hints[i]!==undefined){
        cellEl.classList.add('hint-blink');
        const bubble=document.createElement('div');bubble.className='cell-bubble';bubble.textContent=`予測+${GlobalFunctions.formatScore(hints[i])}`;cellEl.appendChild(bubble);
      }
      if(expandTargets.has(i)) cellEl.classList.add('expand-highlight');
      if(paintTarget===i) cellEl.classList.add('paint-highlight');
      cellEl.addEventListener('click',()=>this.onCellClick(i));
      // #5 ドラッグ&ドロップで盤面に配置
      cellEl.addEventListener('dragover',(e)=>{
        if(this.currentSide!=='player'||this.resultState||this.rerollMode) return;
        if(this.blockedCells.has(i)) return;
        e.preventDefault(); e.dataTransfer.dropEffect='move';
        cellEl.classList.add('drag-over');
      });
      cellEl.addEventListener('dragleave',()=>{ cellEl.classList.remove('drag-over'); });
      cellEl.addEventListener('drop',(e)=>{
        e.preventDefault(); cellEl.classList.remove('drag-over');
        if(this.currentSide!=='player'||this.resultState||this.rerollMode) return;
        if(this.blockedCells.has(i)) return;
        const cardId=e.dataTransfer.getData('cardId'); if(!cardId) return;
        const card=GameState.hand.find(c=>c.id===cardId); if(!card) return;
        this.selectedCardId=cardId;
        this.onCellClick(i);
      });
      board.appendChild(cellEl);
    }
    wrapper.appendChild(board); return wrapper;
  },

  // #4 カード説明を右上吹き出し表示
  renderBoardInfoPanel(){
    if(this.boardInfoCell===null) return null;
    const cd=this.board[this.boardInfoCell]; if(!cd) return null;
    const panel=document.createElement('div'); panel.className='card-tooltip-panel';
    panel.innerHTML=`<div class="info-title sym-${cd.symbol}">${GameData.SYMBOL_LABEL[cd.symbol]} 基礎点${cd.baseScore}</div>${this.cardInfoDescHtml(cd.card||{})}`;
    return panel;
  },

  renderHand(){
    const area=document.createElement('div'); area.className='hand-area';
    const row=document.createElement('div'); row.className='hand-row';

    // #11 保留札を左側に分離表示
    if(GameState.reserve.length>0){
      const reserveGroup=document.createElement('div'); reserveGroup.className='reserve-group';
      reserveGroup.innerHTML='<div class="reserve-label">保留</div>';
      const reserveRow=document.createElement('div'); reserveRow.className='reserve-row';
      GameState.reserve.forEach(card=>{
        const wrapper=document.createElement('div'); wrapper.className='card-wrapper';
        const c=document.createElement('div'); c.className='card reserve-card';
        c.innerHTML=`${this.cardTagsHtml(card)}${this.cardSymbolHtml(card)}${this.cardScoreHtml(card,GameState.gold)}`;
        this.attachHoverTip(c,card);
        wrapper.appendChild(c); reserveRow.appendChild(wrapper);
      });
      reserveGroup.appendChild(reserveRow);
      row.appendChild(reserveGroup);
      const divider=document.createElement('div'); divider.className='hand-divider'; row.appendChild(divider);
    }

    for(const card of GameState.hand){
      const wrapper=document.createElement('div'); wrapper.className='card-wrapper';
      const c=document.createElement('div');
      const isSel=!this.rerollMode&&this.selectedCardId===card.id;
      const isRe=this.rerollMode&&this.rerollSelected.has(card.id);
      c.className='card'+(isSel?' selected':'')+(isRe?' reroll-selected':'')+(card.trait?` trait-${card.trait.replace(/[()]/g,'')}`:'')+((this.justDrawnIds&&this.justDrawnIds.has(card.id))?' card-draw-in':'');
      if(this.bossBlackedOut&&!isSel){
        c.innerHTML=`${this.cardTagsHtml(card)}<div class="card-symbol-wrap"><span style="opacity:0;font-size:22px;">${GameData.SYMBOL_LABEL[card.symbol]}</span></div>${this.cardScoreHtml(card, GameState.gold)}`;
      }else{
        c.innerHTML=`${this.cardTagsHtml(card)}${this.cardSymbolHtml(card)}${this.cardScoreHtml(card, GameState.gold)}`;
      }

      // ドラッグ（マウス：0.18秒長押し、タッチ：0.25秒長押し）
      if(this.currentSide==='player'&&!this.resultState&&!this.rerollMode){
        let dragTimer=null, isDragging=false, dragGhost=null, dragTooltip=null;

        const removeDragTooltip=()=>{ if(dragTooltip){ dragTooltip.remove(); dragTooltip=null; } };

        const startDrag=(x,y)=>{
          isDragging=true;
          this.selectedCardId=card.id;
          this.expandPending=null; this.paintPending=null;
          dragGhost=c.cloneNode(true);
          dragGhost.className=c.className+' touch-drag-ghost';
          dragGhost.id='drag-ghost-'+card.id;
          dragGhost.style.left=(x-33)+'px'; dragGhost.style.top=(y-46)+'px';
          document.body.appendChild(dragGhost);
          c.classList.add('dragging-origin');
          // #8 ドラッグ開始時に効果テキストを吹き出し表示（移動を始めたらしまう）
          const lines=[];
          if(card.jamming){const emoji=GameData.JAMMING_EMOJI[card.jamming]||'';lines.push(`<span class="desc-jamming">${emoji} 【${card.jamming}】${GameData.JAMMING_DESC[card.jamming]||''}</span>`);}
          if(card.enhance) lines.push(`<span class="desc-enhance">【${card.enhance}】${GameData.ENHANCE_DESC[card.enhance]||''}</span>`);
          if(card.trait)   lines.push(`<span class="desc-trait">【${card.trait}】${GameData.TRAIT_DESC[card.trait]||''}</span>`);
          if(lines.length>0){
            dragTooltip=document.createElement('div'); dragTooltip.className='drag-tooltip-bubble';
            dragTooltip.innerHTML=lines.join('<br>');
            dragTooltip.style.left=x+'px'; dragTooltip.style.top=(y-70)+'px';
            document.body.appendChild(dragTooltip);
          }
          this.renderAll();
        };
        const clearDrag=()=>{
          if(dragGhost){ dragGhost.remove(); dragGhost=null; }
          removeDragTooltip();
          c.classList.remove('dragging-origin');
          document.querySelectorAll('.cell.touch-hover').forEach(x=>x.classList.remove('touch-hover'));
          isDragging=false;
        };
        const moveDrag=(x,y)=>{
          if(!isDragging) return;
          removeDragTooltip(); // #8 カードが移動を始めたら吹き出しをしまう
          if(dragGhost){ dragGhost.style.left=(x-33)+'px'; dragGhost.style.top=(y-46)+'px'; }
          document.querySelectorAll('.cell.touch-hover').forEach(x=>x.classList.remove('touch-hover'));
          const el=document.elementFromPoint(x,y);
          const cell=el?.closest('.cell[data-ci]'); if(cell) cell.classList.add('touch-hover');
        };
        const dropDrag=(x,y)=>{
          const el=document.elementFromPoint(x,y);
          const cellEl=el?.closest('.cell[data-ci]');
          clearDrag();
          if(cellEl){ const ci=parseInt(cellEl.dataset.ci,10); if(!isNaN(ci)) this.onCellClick(ci); }
        };

        // --- マウス長押し (0.18秒) ---
        c.addEventListener('mousedown',(e)=>{
          if(e.button!==0) return;
          dragTimer=setTimeout(()=>startDrag(e.clientX,e.clientY), 180);
        });
        window.addEventListener('mousemove',(e)=>{ clearTimeout(dragTimer); dragTimer=null; moveDrag(e.clientX,e.clientY); });
        window.addEventListener('mouseup',(e)=>{
          clearTimeout(dragTimer); dragTimer=null;
          if(!isDragging) return;
          dropDrag(e.clientX,e.clientY);
        });

        // --- タッチ長押し (0.38秒) ---
        c.addEventListener('touchstart',(e)=>{
          if(e.touches.length!==1) return;
          const t=e.touches[0];
          dragTimer=setTimeout(()=>startDrag(t.clientX,t.clientY), 250);
        },{passive:true});
        c.addEventListener('touchmove',(e)=>{
          const t=e.touches[0];
          if(!isDragging){ clearTimeout(dragTimer); dragTimer=null; return; }
          e.preventDefault();
          moveDrag(t.clientX,t.clientY);
        },{passive:false});
        c.addEventListener('touchend',(e)=>{
          clearTimeout(dragTimer); dragTimer=null;
          if(!isDragging) return;
          const t=e.changedTouches[0];
          dropDrag(t.clientX,t.clientY);
        });
        c.addEventListener('touchcancel',()=>{ clearTimeout(dragTimer); dragTimer=null; clearDrag(); });
      }

      this.attachHoverTip(c,card);
      c.addEventListener('click',()=>this.onCardClick(card.id));
      wrapper.appendChild(c);
      row.appendChild(wrapper);
    }
    area.appendChild(row); return area;
  },

  attachHoverTip(el,card){
    el.addEventListener('mouseenter',()=>{
      const lines=[];
      if(card.jamming){const emoji=GameData.JAMMING_EMOJI[card.jamming]||'';lines.push(`<span class="desc-jamming">${emoji} 【${card.jamming}】${GameData.JAMMING_DESC[card.jamming]||''}</span>`);}
      if(card.enhance) lines.push(`<span class="desc-enhance">【${card.enhance}】${GameData.ENHANCE_DESC[card.enhance]||''}</span>`);
      if(card.trait)   lines.push(`<span class="desc-trait">【${card.trait}】${GameData.TRAIT_DESC[card.trait]||''}</span>`);
      if(!lines.length) return;
      let tip=el.querySelector('.card-hover-tip');
      if(!tip){tip=document.createElement('div');tip.className='card-hover-tip';el.appendChild(tip);}
      tip.innerHTML=lines.join('<br>');
    });
    el.addEventListener('mouseleave',()=>{const t=el.querySelector('.card-hover-tip');if(t)t.remove();});
  },

  // #6 手札カードもパッシブと同様に吹き出し表示にする（配置操作を妨げないよう、背景クリックでは閉じない）
  renderHandInfoPanel(){
    if(this.rerollMode||!this.selectedCardId) return null;
    const card=GameState.hand.find(c=>c.id===this.selectedCardId); if(!card) return null;
    const panel=document.createElement('div'); panel.className='card-tooltip-panel passive-info-panel';
    panel.innerHTML=`<div class="info-title sym-${card.symbol}">${GameData.SYMBOL_LABEL[card.symbol]} 基礎点${card.baseScore}</div>${this.cardInfoDescHtml(card)}`;
    return panel;
  },

  renderRelicRow(){
    const row=document.createElement('div'); row.className='relic-display-row';
    if(GameState.relics.length===0){const empty=document.createElement('div');empty.className='relic-empty';empty.textContent='レリックなし';row.appendChild(empty);}
    else GameState.relics.forEach((relic,i)=>{
      const rc=document.createElement('div');
      const isActive=this.activeRelicId===i;
      const isScoring=this.scoringRelicIds.includes(relic.id);
      rc.className='relic-card'+(isActive?' active':'')+(isScoring?' bounce':'');
      rc.innerHTML=`<div class="relic-name">${relic.name}</div>${relic.relicEnhance?`<div class="relic-enhance-tag">${GameData.RELIC_ENHANCE_POOL.find(r=>r.id===relic.relicEnhance)?.name||''}</div>`:''}`;
      rc.addEventListener('click',()=>this.onRelicClick(i));
      row.appendChild(rc);
    });
    const maxEl=document.createElement('div');maxEl.className='relic-capacity';maxEl.textContent=`${GameState.usedRelicSlots()}/${GameState.effectiveMaxRelics()}`;
    row.appendChild(maxEl);
    return row;
  },

  // #5 レリックもパッシブと同様に吹き出し表示にする
  renderRelicInfoPanel(){
    const idx=this.activeRelicId;
    const relic=GameState.relics[idx]; if(!relic) return null;
    const backdrop=document.createElement('div'); backdrop.className='passive-info-backdrop';
    backdrop.addEventListener('click',()=>{ this.activeRelicId=null; this.renderAll(); });
    const panel=document.createElement('div'); panel.className='info-panel relic-info-panel passive-info-panel';
    panel.addEventListener('click',(e)=>e.stopPropagation());
    const ren=GameData.RELIC_ENHANCE_POOL.find(r=>r.id===relic.relicEnhance);
    let sellPrice=1; if(relic.relicEnhance==='ren_discard_sell') sellPrice=Math.floor(GameState.currentDeck.length/2); else if(ren) sellPrice+=2;
    panel.innerHTML=`<div class="info-title">${relic.name}</div><div class="info-desc">${relic.desc}</div>${ren?`<div class="info-desc relic-enhance-desc">【${ren.name}】${ren.desc}</div>`:''}<div class="relic-reorder-row"><button class="relic-move-btn" ${idx<=0?'disabled':''}>◀ 左へ</button><button class="relic-move-btn" ${idx>=GameState.relics.length-1?'disabled':''}>右へ ▶</button></div><button class="sell-relic-btn">売却（${sellPrice}G）</button>`;
    const moveBtns=panel.querySelectorAll('.relic-move-btn');
    moveBtns[0].addEventListener('click',()=>{ if(GameState.moveRelic(idx,-1)){ this.activeRelicId=idx-1; this.renderAll(); } });
    moveBtns[1].addEventListener('click',()=>{ if(GameState.moveRelic(idx,1)){ this.activeRelicId=idx+1; this.renderAll(); } });
    panel.querySelector('.sell-relic-btn').addEventListener('click',()=>this.sellRelic(idx));
    backdrop.appendChild(panel);
    return backdrop;
  },

  renderControls(){
    const controls=document.createElement('div'); controls.className='controls-row';
    if(this.rerollMode){
      const okBtn=document.createElement('button');okBtn.textContent=`確定（${this.rerollSelected.size}枚）`;okBtn.disabled=this.rerollSelected.size===0;okBtn.addEventListener('click',()=>this.confirmReroll());controls.appendChild(okBtn);
      const cancelBtn=document.createElement('button');cancelBtn.textContent='キャンセル';cancelBtn.addEventListener('click',()=>this.cancelReroll());controls.appendChild(cancelBtn);
    }else{
      const rBtn=document.createElement('button');rBtn.textContent=`♻️(${GameState.rerollCount})`;rBtn.disabled=GameState.rerollCount<=0||this.currentSide!=='player'||this.hasBossEffect('reroll_limit');rBtn.addEventListener('click',()=>this.enterRerollMode());controls.appendChild(rBtn);
    }
    // #4 デッキ/山札/捨て札/廃棄札確認ボタン（上画面に配置。今後のアプデでpng画像に置き換え予定のため一旦絵文字表記）
    const deckBtn=document.createElement('button'); deckBtn.textContent=`⭕️(${GameState.currentDeck.length})`; deckBtn.addEventListener('click',()=>this.showDeckModal('deck')); controls.appendChild(deckBtn);
    const drawBtn=document.createElement('button'); drawBtn.textContent=`🎴(${GameState.drawPile.length})`; drawBtn.addEventListener('click',()=>this.showDeckModal('drawpile')); controls.appendChild(drawBtn);
    const discBtn=document.createElement('button'); discBtn.textContent=`❎(${GameState.discardPile.length})`; discBtn.addEventListener('click',()=>this.showDeckModal('discard')); controls.appendChild(discBtn);
    if(GameState.discardedPile.length>0){
      const exlBtn=document.createElement('button'); exlBtn.textContent=`🗑️(${GameState.discardedPile.length})`; exlBtn.addEventListener('click',()=>this.showDeckModal('discarded')); controls.appendChild(exlBtn);
    }
    // #1 マップ一覧（確認のみ、遷移不可）
    const mapBtn=document.createElement('button'); mapBtn.textContent='🗺️'; mapBtn.addEventListener('click',()=>this.showDeckModal('map')); controls.appendChild(mapBtn);
    return controls;
  },

  showDeckModal(type){
    const existing=document.getElementById('deck-modal-overlay'); if(existing) existing.remove();
    const overlay=document.createElement('div'); overlay.id='deck-modal-overlay'; overlay.className='pack-modal-overlay';
    overlay.addEventListener('click',(e)=>{ if(e.target===overlay) overlay.remove(); });
    const modal=document.createElement('div'); modal.className='pack-modal';
    // #1/#2 マップ一覧（確認のみ・遷移不可）
    if(type==='map'){
      const stages=GameData.buildFloorStages(GameState.currentFloor);
      modal.innerHTML=`<h3>第${GameState.currentFloor}階層 マップ一覧（確認のみ）</h3>`;
      const list=document.createElement('div'); list.className='map-preview-list';
      stages.forEach(s=>{
        const cleared=GameState.clearedStages.includes(s.key);
        const row=document.createElement('div'); row.className='map-preview-row'+(cleared?' cleared':'');
        row.innerHTML=`<span class="map-preview-tag">${s.tag}</span><span class="map-preview-name">${s.name}</span><span class="map-preview-target">目標:${GlobalFunctions.formatScore(s.targetScore)}</span>${cleared?'<span class="map-preview-done">クリア済</span>':''}`;
        list.appendChild(row);
      });
      modal.appendChild(list);
      const closeBtn=document.createElement('button'); closeBtn.textContent='閉じる'; closeBtn.style.marginTop='14px'; closeBtn.addEventListener('click',()=>overlay.remove()); modal.appendChild(closeBtn);
      overlay.appendChild(modal); document.body.appendChild(overlay);
      return;
    }
    const titles={'deck':'デッキ','drawpile':'山札','discard':'捨て札','discarded':'廃棄札'};
    const piles={'deck':GameState.currentDeck,'drawpile':GameState.drawPile,'discard':GameState.discardPile,'discarded':GameState.discardedPile};
    const sourceCards=piles[type]||[];
    // #3 デッキ表示時のソート・統計機能（実際の山札の並び順＝ドロー順には影響を与えない、表示専用の並び替え）
    let sortMode='default';
    const symbolOrder={Circle:0,Triangle:1,Square:2,Cross:3};
    const sortCards=(list)=>{
      const arr=list.slice();
      if(sortMode==='symbol') arr.sort((a,b)=>(symbolOrder[a.symbol]-symbolOrder[b.symbol])||(a.baseScore-b.baseScore));
      else if(sortMode==='score_desc') arr.sort((a,b)=>b.baseScore-a.baseScore);
      else if(sortMode==='score_asc') arr.sort((a,b)=>a.baseScore-b.baseScore);
      else if(sortMode==='enhance_first') arr.sort((a,b)=>(b.enhance?1:0)-(a.enhance?1:0)||(b.jamming?1:0)-(a.jamming?1:0)||(b.trait?1:0)-(a.trait?1:0));
      return arr;
    };
    const buildStatsHtml=(list)=>{
      const n=list.length;
      const bySym={Circle:0,Triangle:0,Square:0,Cross:0};
      let scoreSum=0,jamN=0,enhN=0,traitN=0;
      list.forEach(c=>{ if(bySym[c.symbol]!==undefined) bySym[c.symbol]++; scoreSum+=c.baseScore||0; if(c.jamming) jamN++; if(c.enhance) enhN++; if(c.trait) traitN++; });
      const avg=n>0?Math.round((scoreSum/n)*10)/10:0;
      return `<div class="deck-stats-panel">
        <span>合計${n}枚</span>
        <span>${GameData.SYMBOL_LABEL.Circle}${bySym.Circle}</span>
        <span>${GameData.SYMBOL_LABEL.Triangle}${bySym.Triangle}</span>
        <span>${GameData.SYMBOL_LABEL.Square}${bySym.Square}</span>
        <span>${GameData.SYMBOL_LABEL.Cross}${bySym.Cross}</span>
        <span>基礎点合計${scoreSum}（平均${avg}）</span>
        <span>ジャミング${jamN}</span>
        <span>強化${enhN}</span>
        <span>性質${traitN}</span>
      </div>`;
    };
    // #7 シカクパッシブ3：デッキ画面でシカクカード同士の強化効果を入れ替えられる
    const swapEnabled = type==='deck' && GameState.symbolPassiveTier.Square>=3;
    let swapSelected=null;
    modal.innerHTML=`<h3>${titles[type]}（${sourceCards.length}枚）</h3>${swapEnabled?'<div class="swap-hint">シカクパッシブ3：シカクカードを2枚タップすると強化効果を入れ替えられます</div>':''}`;
    const statsWrap=document.createElement('div'); statsWrap.innerHTML=buildStatsHtml(sourceCards); modal.appendChild(statsWrap.firstElementChild);
    // #3 ソート機能
    const sortRow=document.createElement('div'); sortRow.className='deck-sort-row';
    const sortOptions=[['default','初期順'],['symbol','記号順'],['score_desc','基礎点が高い順'],['score_asc','基礎点が低い順'],['enhance_first','付与効果あり優先']];
    sortOptions.forEach(([val,label])=>{
      const b=document.createElement('button'); b.textContent=label; b.className='deck-sort-btn'+(sortMode===val?' active':'');
      b.addEventListener('click',()=>{ sortMode=val; rebuildGrid(); sortRow.querySelectorAll('.deck-sort-btn').forEach(x=>x.classList.remove('active')); b.classList.add('active'); });
      sortRow.appendChild(b);
    });
    modal.appendChild(sortRow);
    const grid=document.createElement('div'); grid.className='pack-card-grid'; grid.style.maxHeight='55vh'; grid.style.overflowY='auto';
    const rebuildGrid=()=>{
      grid.innerHTML='';
      const cards=sortCards(sourceCards);
      cards.forEach(card=>{
        const item=document.createElement('div'); item.className='card'+(card.trait?` trait-${card.trait.replace(/[()]/g,'')}`:'');
        item.innerHTML=`${this.cardTagsHtml(card)}${this.cardSymbolHtml(card)}${this.cardScoreHtml(card,GameState.gold)}`;
        item.addEventListener('mouseenter',()=>{
          const lines=[];
          if(card.jamming){const emoji=GameData.JAMMING_EMOJI[card.jamming]||'';lines.push(`<span class="desc-jamming">${emoji} 【${card.jamming}】${GameData.JAMMING_DESC[card.jamming]||''}</span>`);}
          if(card.enhance) lines.push(`<span class="desc-enhance">【${card.enhance}】${GameData.ENHANCE_DESC[card.enhance]||''}</span>`);
          if(card.trait)   lines.push(`<span class="desc-trait">【${card.trait}】${GameData.TRAIT_DESC[card.trait]||''}</span>`);
          if(!lines.length) return;
          let tip=item.querySelector('.card-hover-tip'); if(!tip){tip=document.createElement('div');tip.className='card-hover-tip';item.appendChild(tip);}
          tip.innerHTML=lines.join('<br>');
        });
        item.addEventListener('mouseleave',()=>{const t=item.querySelector('.card-hover-tip');if(t)t.remove();});
        if(swapEnabled&&card.symbol==='Square'){
          item.classList.add('swap-candidate');
          if(swapSelected===card) item.classList.add('swap-picked');
          item.addEventListener('click',()=>{
            if(!swapSelected){ swapSelected=card; rebuildGrid(); return; }
            if(swapSelected===card){ swapSelected=null; rebuildGrid(); return; }
            const tmp=swapSelected.enhance; swapSelected.enhance=card.enhance; card.enhance=tmp;
            swapSelected=null; rebuildGrid();
          });
        }
        grid.appendChild(item);
      });
    };
    rebuildGrid();
    modal.appendChild(grid);
    const closeBtn=document.createElement('button'); closeBtn.textContent='閉じる'; closeBtn.style.marginTop='14px'; closeBtn.addEventListener('click',()=>overlay.remove()); modal.appendChild(closeBtn);
    overlay.appendChild(modal); document.body.appendChild(overlay);
  },

  renderLog(){ const p=document.createElement('div');p.className='log-panel';p.innerHTML=this.logs.map(l=>`<div>${l}</div>`).join('');p.scrollTop=p.scrollHeight;return p; },

  renderResult(){
    const el=document.createElement('div'); el.className='result-screen pack-modal-overlay';
    const win=this.resultState==='win'; const goShop=win; // #4 ボスクリア時もショップへ
    const r=GameState.lastReward;
    const gr=(win&&r?.breakdown)?`<div class="gold-reveal-popup"><div class="gr-label">獲得ゴールド</div><div class="gr-total">+${r.gold}G</div><div class="gr-breakdown">基本6 ＋ 残りラウンド×2＝${r.breakdown.roundBonus} ＋ 残りリロール${r.breakdown.rerollBonus} ＋ レリック補正${r.breakdown.relicBonus} ＋ カード補正${r.breakdown.cardBonus}${r.breakdown.doubled?'（第6階層以降のため合計を2倍）':''}</div>${r.extra?`<div class="gr-breakdown">追加報酬：${r.extra}</div>`:''}</div>`:'';
    // #3 ゲームメイン画面のデバッグ用ログを報酬画面にも表示
    const debugHtml=(r?.debugLog&&r.debugLog.length>0)?`<div class="result-debug-log"><div class="result-debug-title">デバッグログ</div>${r.debugLog.map(l=>`<div class="result-debug-line">${l}</div>`).join('')}</div>`:'';
    const box=document.createElement('div'); box.className='result-box';
    // #1 ボスクリア時：ショップへ移動の代わりに「パッシブ報酬を受け取る」をタップさせる
    const hasPassiveChoice = win && this.stage.key==='boss' && this.pendingPassiveChoice && this.pendingPassiveChoice.length>0;
    const btnLabel = hasPassiveChoice ? 'パッシブ報酬を受け取る' : (goShop?'ショップへ':'マップに戻る');
    box.innerHTML=`<div class="result-title ${win?'win':'lose'}">${win?'STAGE CLEAR':'GAME OVER'}</div><div>最終点数：${GlobalFunctions.formatScore(GameState.currentScore)} / ${GlobalFunctions.formatScore(GameState.targetScore)}</div>${gr}${debugHtml}<button id="btn-next">${btnLabel}</button>`;
    el.appendChild(box);
    setTimeout(()=>{el.querySelector('#btn-next').addEventListener('click',()=>{
      if(hasPassiveChoice){ this.passiveModalOpen=true; this.renderAll(); }
      else if(goShop){ App.showShop(); } else { App.showMapSelect(); }
    });});
    return el;
  },

  // #A ボスクリア時：記号パッシブ選択モーダル（ゲームメイン画面上にオーバーレイ表示）
  renderPassiveChoiceModal(){
    const el=document.createElement('div'); el.className='pack-modal-overlay passive-choice-overlay';
    const box=document.createElement('div'); box.className='pack-modal';
    box.innerHTML='<h3>記号パッシブを1つ選んでください</h3>';
    const grid=document.createElement('div'); grid.className='pack-card-grid';
    this.pendingPassiveChoice.forEach((cand,idx)=>{
      const p=GameData.SYMBOL_PASSIVES[cand.symbol][cand.nextTier];
      const wrap=document.createElement('div'); wrap.className='card-pick-wrap';
      const item=document.createElement('div'); item.className=`card sym-${cand.symbol}`;
      // #5 記号とレベルをカード風に表示（右下にレベルバッジ）
      item.innerHTML=`<span class="passive-pick-symbol sym-${cand.symbol}">${GameData.SYMBOL_LABEL[cand.symbol]}</span><span class="passive-pick-level">Lv${cand.nextTier}</span>`;
      wrap.appendChild(item);
      const desc=document.createElement('div'); desc.className='card-pick-desc';
      desc.innerHTML=`<b>${p.name}</b><br>${p.desc}<br><span style="color:var(--gold)">${p.live()}</span>`;
      wrap.appendChild(desc);
      wrap.addEventListener('click',()=>this.choosePassive(idx));
      grid.appendChild(wrap);
    });
    box.appendChild(grid);
    el.appendChild(box);
    return el;
  },
  choosePassive(idx){
    const cand=this.pendingPassiveChoice[idx]; if(!cand) return;
    GameState.symbolPassiveTier[cand.symbol]=cand.nextTier;
    this.addLog(`記号パッシブ習得：${GameData.SYMBOL_LABEL[cand.symbol]}${GameData.SYMBOL_PASSIVE_NAMES[cand.symbol]}Lv${cand.nextTier}`);
    this.pendingPassiveChoice=null;
    this.passiveModalOpen=false;
    // #6 ゲーム開始時に選んだ場合はショップへ進まず、開始済みのラウンドをそのまま続ける
    if(this.passiveChoiceContext==='start'){
      this.passiveChoiceContext=null;
      App.saveGame();
      this.renderAll();
      return;
    }
    this.passiveChoiceContext=null;
    // #1 パッシブ選択後、ショップへ進む
    App.saveGame();
    App.showShop();
  },

  // #A 常時表示の記号パッシブバー（タップで詳細確認）
  renderPassiveBar(){
    const row=document.createElement('div'); row.className='passive-bar';
    // #新規 セブンパッシブは通常枠ではなく、習得済みの場合のみ常時バーに表示する
    const barSymbols=(GameState.symbolPassiveTier.Seven>0)?[...GameData.PASSIVE_SYMBOLS,'Seven']:GameData.PASSIVE_SYMBOLS;
    barSymbols.forEach(sym=>{
      const tier=GameState.symbolPassiveTier[sym]||0;
      const btn=document.createElement('div'); btn.className=`passive-icon sym-${sym}${tier>0?' active':''}`;
      btn.innerHTML=`<span class="passive-sym">${GameData.SYMBOL_LABEL[sym]}</span><span class="passive-tier">Lv${tier}</span>`;
      btn.addEventListener('click',()=>{ this.activePassiveInfo=(this.activePassiveInfo===sym)?null:sym; this.renderAll(); });
      row.appendChild(btn);
    });
    return row;
  },
  renderPassiveInfoPanel(){
    const sym=this.activePassiveInfo; if(!sym) return null;
    const tier=GameState.symbolPassiveTier[sym]||0;
    // #1 どこをタップしても閉じるよう全画面の透明バックドロップを敷く
    const backdrop=document.createElement('div'); backdrop.className='passive-info-backdrop';
    backdrop.addEventListener('click',()=>{ this.activePassiveInfo=null; this.renderAll(); });
    const panel=document.createElement('div'); panel.className='info-panel passive-info-panel';
    panel.addEventListener('click',(e)=>e.stopPropagation());
    let html=`<div class="info-title sym-${sym}">${GameData.SYMBOL_LABEL[sym]} ${GameData.SYMBOL_PASSIVE_NAMES[sym]}（現在Lv${tier}）</div>`;
    for(let t=1;t<=3;t++){
      const p=GameData.SYMBOL_PASSIVES[sym][t];
      const got=t<=tier;
      html+=`<div class="passive-detail-row${got?' got':''}"><b>Lv${t} ${p.name}</b>${got?'（習得済）':''}<br>${p.desc}${got?`<br><span style="color:var(--gold)">${p.live()}</span>`:''}</div>`;
    }
    panel.innerHTML=html;
    backdrop.appendChild(panel);
    return backdrop;
  },
};
