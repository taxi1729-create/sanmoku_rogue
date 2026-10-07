const GameMainScene = {
  container:null, stage:null,
  board:[], windows:[], quadSiblings:{}, scoredWindowKeys:new Set(),
  prevRoundBingoSymbol:null, prevRoundScore:0, chargeActive:false,
  turnInRound:1, currentSide:'player', selectedCardId:null, boardInfoCell:null,
  logs:[], resultState:null, scoringAnim:null,
  rerollMode:false, rerollSelected:new Set(),
  effects:{ stunNextNpc:false, confuseNextNpc:false, breakUntilTurn:null, linkRestrict:null, redirectBan:null, sealCell:null, lureRestrict:false },
  bossEffect:null, blockedCells:new Set(), bossBlackedOut:false,
  lastNpcCell:null, lastPlacedCell:null, turnsBonus_bossRestore:0, activeRelicId:null, scoringRelicIds:[],
  // #3 レリック・パッシブの点数計算ポップ演出用の状態
  scoringRelicValues:{}, scoringPassiveIds:[], scoringPassiveValues:{},
  scoreFastForward:false, // #2 一度ONにしたら次にOFFにするまで持続するトグル
  expandPending:null, paintPending:null,
  unifyRestoreData:null, // #2 統一ボス効果の復元用

  sleep(ms){ return new Promise(res=>setTimeout(res,ms)); },

  render(container,stage){
    this.container=container; this.stage=stage;
    // #演出 前ステージの報酬・パッシブ・ボス演出が残っていれば片付ける（StageFX / js/stageFx.js）
    if(typeof StageFX!=='undefined') StageFX.clearAll();
    this.bossBubbleOpen=false;
    // #3 ホシパッシブ2：5×5マスでプレイ
    GameData.BOARD_SIZE = GameState.symbolPassiveTier.Hoshi>=2 ? 5 : 4;
    this.board=new Array(GameData.BOARD_SIZE*GameData.BOARD_SIZE).fill(null);
    this.windows=this.buildWindows(GameData.BOARD_SIZE);
    this.logs=[]; this.resultState=null; this.boardInfoCell=null; this.scoringAnim=null;
    this.rerollMode=false; this.rerollSelected=new Set();
    this.prevRoundBingoSymbol=null; this.prevRoundScore=0; this.chargeActive=false; this.chargeN=0; this._chargeUpdatedThisRound=false; this.roundCorrMultBonus=0; this.roundBoostAdd=0; // #3 チャージn・ジャミング増強の今ラウンド補正
    this.bossEffect=null; this.bossEffects=null; this.blockedCells=new Set(); this.bossBlackedOut=false;
    this.lastNpcCell=null; this.lastPlacedCell=null; this.activeRelicId=null; this.relicListOpen=false; this.scoringRelicIds=[];
    this.scoringRelicValues={}; this.scoringPassiveIds=[]; this.scoringPassiveValues={};
    this.justPlacedCell=null; this.justPlacedCells=null;
    this.justDrawnIds=new Set(); // #6 ドロー演出用
    this.extendActive=false; // #4 エクステンド
    GameState.currentDeck.forEach(c=>GlobalFunctions.recordCard(c)); // #5 図鑑：所持デッキの発見効果を反映
    GameState.relics.forEach(r=>GlobalFunctions.recordRelic(r.id));
    this.turnsBonus_bossRestore=0; this.expandPending=null; this.paintPending=null;
    this.unifyRestoreData=null;
    this.effects={stunNextNpc:false,confuseNextNpc:false,breakUntilTurn:null,linkRestrict:null,redirectBan:null,sealCell:null,lureRestrict:false};
    GameState.initStage(stage);
    this.applyBossEffect();
    this.applyRelicInitEffects();
    this.stageBonusRounds=0;
    this.pendingDelayedJamming=[];
    // #4 マルパッシブ1：ゲーム開始時、ランダムなマルカード1×n枚（n=マルビンゴ倍率/10 切り捨て）にネガティブ(パッシブ)を付与する
    //    （既存の性質変化は上書きしない。ただしペイントの塗りつぶしは上書きする）。Lv1/Lv2入れ替えによりLv1条件に変更
    this._circleNegCards=null;
    if(GameState.symbolPassiveTier.Circle>=1){
      const n=Math.floor((GameData.BINGO_MULTIPLIER_BASE.Circle||0)/10);
      const count=1*n;
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
    // #1 ゲーム開始時のパッシブ選択は廃止し、代わりに？カードパックを1パック無料で獲得できるようにする
    if(!GameState.initialPassiveGranted){
      GameState.initialPassiveGranted=true;
      // #8 階層1コモン侵入時の無料？カードパックは廃止（スタートイベント「神の寵愛」に置き換え）
      // this.pendingInitialCardPack=[GameData.generateShopCard(),GameData.generateShopCard()];
    }
    this.startRound();
    // #演出 ボスステージ開始時：ボス効果が盤面に付与される演出（初回描画後。タップで早送り）
    if(this.stage.key==='boss'&&typeof StageFX!=='undefined') StageFX.bossIntro({list:StageFX.bossList(this),floor:GameState.currentFloor});
    TutorialOverlay.show('gameMain'); // #1 初回のみゲームメイン画面のチュートリアルを表示
  },

  // #5 ビンゴ演出：8マス（カード基礎点／補正基礎点／ビンゴ倍率／補正倍率／列補正／最終乗算補正／最終加算補正／加算点数）
  cellIndex(r,c){ return r*GameData.BOARD_SIZE+c; },
  // #演出刷新 計算マスはステータスバーに差し込まず、吹き出し（ScoreFX / js/scoreFx.js）で表示する。
  //   ステータスバーの高さが変わってゲーム画面が揺れるのを防ぐため、この関数は互換用に null を返すだけ
  renderScoreCalcBoard(){ return null; },

  // #2 ブレイク：このカードが盤面にある間、バツのビンゴはラウンドを終了させない
  isBreakActive(){ const t=this.effects.breakUntilTurn; return t!=null && this.turnInRound<=t; }, // v12 #1 ブレイクは使用した次のターンまで有効

  // #6 階層10特有ボス効果：ターン6,11,16…判定
  isForcedNpcTurn(turnNum){ return turnNum>=6 && (turnNum-6)%5===0; },

  // #4 レリック強化「廃棄強化」所持時は、捨て札になるカードを全て廃棄札へ送る
  pushToDiscard(card){
    if(!card||card._boardOnly) return; // v11 #5 チェックパッシブ2の4隅カードはストックしない
    if(card._reserveCarry) delete card._reserveCarry; // #4
    // #4 ギャンブル：捨て札に行く時にリセットする
    if(card.enhance==='ギャンブル'&&card._gambleDelta){ card.baseScore-=card._gambleDelta; card._gambleDelta=0; }
    if(GameState.relics.some(r=>r.relicEnhance==='ren_discard')&&this.relicActive()) GameState.discardedPile.push(card);
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
    // #5 補正基礎点強化（最終加算補正+2000）は所持している間だけ点数計算時に加算する（以前は毎ステージ累積していた）
    if(GameState.hasRelic('paint')) this.applyPaintRelic();
    GameState.relics.forEach(r=>{
      // #2 バツ強化：即時に倍率を変えず、バツビンゴ時のビンゴ倍率を2倍にする（detectNewBingos で処理）
    });
  },

  applyPaintRelic(){
    // #5 ゲーム開始時、ランダムな記号を1つ選び、その記号のカード全てに塗りつぶし(レリック)を付与する
    const sym=GlobalFunctions.randChoice(GameData.SYMBOLS);
    GameState.currentDeck.forEach(c=>{ if(c.symbol===sym) c.trait='塗りつぶし(レリック)'; });
    this.addLog(`ペイント：${GIconSym(sym)}の全カードに塗りつぶし(レリック)を付与`);
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
        // #3 バツ5000：NPCが置くバツのカード基礎点のみを5000にする（プレイヤーのデッキのバツカードは変更しない）
        case 'cross5000': break;
        case 'block_cells': GlobalFunctions.shuffle(Array.from({length:GameData.BOARD_SIZE*GameData.BOARD_SIZE},(_,i)=>i)).slice(0,2*(be.power||1)).forEach(i=>this.blockedCells.add(i)); break; // #8 2マス（階層6以降4マス）
        // #4 パッシブ効果無効：ゲーム開始時に記号パッシブを退避して無効化（魔力は例外）。ゲーム終了時に復元
        case 'blackout':
          if(!GameState.passiveSuspended){ GameState.passiveSuspended={...GameState.symbolPassiveTier}; Object.keys(GameState.symbolPassiveTier).forEach(k=>GameState.symbolPassiveTier[k]=0); }
          break;
        case 'unify':{
          const ch=GlobalFunctions.randChoice(['Circle','Triangle','Square']);
          this.unifyRestoreData={};
          GameData.SYMBOLS.forEach(s=>{
            this.unifyRestoreData[s]=GameData.BINGO_MULTIPLIER_BASE[s];
            if(s===ch) GameData.BINGO_MULTIPLIER_BASE[s]+=10*(be.power||1);
            else if(s!=='Cross') GameData.BINGO_MULTIPLIER_BASE[s]-=20*(be.power||1);
          });
          this.addLog(`統一：${GIconSym(ch)}倍率+10、他-20`);
          break;
        }
        case 'cross_corner': break; // 四隅のバツはラウンド開始ごとにstartRound()で配置する
        case 'turn_limit': this.turnsBonus_bossRestore=GameState.turnsBonus; GameState.turnsBonus-=4*(be.power||1); break; // #8 -4（階層6以降-8）
        case 'reroll_limit': GameState.rerollCount=(be.power||1)>=2?0:Math.max(0,GameState.rerollCount-3); break; // #8 -3（階層6以降は禁止）
        // 手札制限：ステージ終了時に元の値へ戻す（以前は永続的に減ったままになっていた）
        case 'hand_limit': this.handLimitRestore=GameState.handSizeBonus; GameState.handSizeBonus-=1*(be.power||1); break; // #8 -1（階層6以降-2）
        default: break;
      }
    });
  },

  restoreSuspendedPassives(){
    if(GameState.passiveSuspended){ GameState.symbolPassiveTier={...GameState.passiveSuspended}; GameState.passiveSuspended=null; this.addLog('パッシブ効果無効：パッシブが元に戻った'); }
  },
  // #4 レリック効果が有効か（ボス効果「レリック使用不可」中は全レリック・レリック強化効果が無効）
  relicActive(){ return !this.hasBossEffect('no_relic'); },
  // #9 複数ボス効果に対応した判定ヘルパー
  hasBossEffect(id){ return (this.bossEffects||(this.bossEffect?[this.bossEffect]:[])).some(e=>e.id===id); },
  // #3 NPCが置くバツのカード基礎点（ボス効果「バツ5000」の時のみ5000）
  npcCrossBase(){ const be=this.bossEffectById('cross5000'); return be?5000*(be.power||1):10; }, // #9 階層6以降はバツ10000
  bossEffectById(id){ return (this.bossEffects||(this.bossEffect?[this.bossEffect]:[])).find(e=>e.id===id)||null; },
  // #2 バツパッシブ1：NPCのバツのカード基礎点のみデッキ枚数×3（ボス効果「バツ5000」の時はボス効果を優先）
  isNpcCrossCell(c){ return !!c && c.symbol==='Cross' && c.owner==='npc' && !c.card; },
  npcCrossScore(c){
    if(this.hasBossEffect('cross5000')) return c.baseScore;
    if(GameState.symbolPassiveTier.Cross>=1) return GameState.currentDeck.length*3;
    return c.baseScore;
  },
  // #20 チェックパッシブ3：このラウンドで同じ記号のビンゴが2回目になるまで盤面がエクステンド状態
  isCheckExtendActive(){ return GameState.symbolPassiveTier.Check>=3 && !this.checkExtendReleased; },

  startRound(){
    // 盤面は毎ラウンドリセットする（以前はボス効果「バツ配置」時に前ラウンドの盤面が残ってしまっていた）
    this.board=new Array(GameData.BOARD_SIZE*GameData.BOARD_SIZE).fill(null);
    if(this.hasBossEffect('cross_corner')){ const bs=GameData.BOARD_SIZE; const ccBe=this.bossEffectById('cross_corner'); GlobalFunctions.shuffle([0,bs-1,bs*(bs-1),bs*bs-1]).slice(0,2*(ccBe.power||1)).forEach(i=>{ /* #8 四隅のうち2つ（階層6以降は4つ） */ if(!this.blockedCells.has(i)) this.board[i]={symbol:'Cross',baseScore:this.npcCrossBase(),owner:'npc',card:null}; }); }
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
        const cornerCard={id:'check_corner_'+idx+'_'+Date.now()+'_'+Math.random(),symbol:sym,baseScore:100,number:100,enhance:multi,jamming:null,trait:null,_boardOnly:true}; /* v11 #5 盤面効果専用：捨て札・廃棄札にストックしない */
        this.board[idx]={symbol:sym,baseScore:100,owner:'player',card:cornerCard};
      });
      if(GameState.round===1) this.addLog('チェックパッシブ2：盤面4隅にランダムな記号・マルチ効果のカードを配置');
    }
    this.scoredWindowKeys=new Set(); this.turnInRound=1;
    const forceFirst=GameState.relics.some(r=>r.relicEnhance==='ren_first')&&this.relicActive();
    this.currentSide=forceFirst?'player':((GameState.round%2===1)?'player':'npc');
    this.selectedCardId=null; this.boardInfoCell=null; this.rerollMode=false;
    this.rerollSelected=new Set(); this.activeRelicId=null;
    this.expandPending=null; this.paintPending=null;
    this.extendActive=false; // #2 エクステンドはラウンドをまたがない
    this.effects.linkRestrict=null; this.effects.stunNextNpc=false; this.effects.breakUntilTurn=null;
    this.effects.confuseNextNpc=false; this.effects.redirectBan=null;
    this.effects.sealCell=null; this.effects.lureRestrict=false;
    // #2 チェックパッシブ1：ラウンドごとにビンゴした記号の記録をリセット
    this.bingoSymbolsThisRound=new Set(); this._checkTriforceGranted=false;
    // #20 チェックパッシブ3：ラウンドごとに記号別ビンゴ回数とエクステンド解除状態をリセット
    this.bingoSymbolCountThisRound={}; this.checkExtendReleased=false;
    this.effectsBubbleOpen=false;
    this.roundCorrMultBonus=0; // #3 ジャミング増強の補正倍率はラウンドごと
    // #4 保留：盤面の保留カードは手札に戻さない（reserveは旧データ互換のため残っていれば手札へ）
    if(GameState.reserve.length>0){ GameState.reserve.forEach(c=>{c._reserveCarry=true;}); GameState.hand.push(...GameState.reserve); GameState.reserve=[]; }
    this.drawToHandSize();
    this.addLog(`--- ラウンド ${GameState.round} 開始（先手：${this.currentSide==='player'?'プレイヤー':'NPC'}） ---`);
    this.renderAll();
    if(this.currentSide==='npc') this.scheduleAIMove();
    else this.checkAutoSkip();
  },

  endRound(){
    this.prevRoundScore=GameState.currentScore;
    // #7 レリック「ラウンド強化」：ラウンド終了時、最終加算補正+1000×n(n=現在ラウンド)
    if(GameState.hasRelic('round_boost')&&this.relicActive()){
      const add=1000*GameState.round;
      this.roundBoostAdd=(this.roundBoostAdd||0)+add; // #5 ステージ内で累積し、所持中のみ加算（以前は永久に累積していた）
      this.addLog(`ラウンド強化：最終加算補正+${add}（現在ラウンド${GameState.round}）`);
    }
    for(const cell of this.board){
      if(!cell?.card||cell.card._ghostOf) continue; // #6 分身カードは捨て札に送らない
      const c=cell.card;
      // #4 保留：盤面に置いた保留カードは手札に戻さず、通常のカードと同様に捨て札（廃棄）へ送る
      if(c._boardOnly) continue; // v11 #5
      if(this.hasBossEffect('discard_used')) GameState.discardedPile.push(c);
      else this.pushToDiscard(c);
    }
    // #3 レリック「チャージ」：次ラウンドへ行く直前の手札の基礎点合計をnに加算。300を超えたらn=-10
    const chargeHandSum=GameState.hand.reduce((t,c)=>t+(c.baseScore||0),0); /* v12 #9 ラウンド上昇時に加算するため、捨てる前の手札合計を控える */
    // #1 保留：手札にある場合は捨てずにそのまま次ラウンドの手札に残す
    // #4 残ったカードは次ラウンドの手札上限に数えない（_reserveCarryフラグ）
    const keptHand=[];
    GameState.hand.forEach(c=>{
      if(c.trait==='保留'){ c._reserveCarry=true; keptHand.push(c); return; }
      if(c.trait==='ディスカード') GameState.gold+=2;
      this.pushToDiscard(c);
    });
    GameState.hand=keptHand;
    // #5 ドロー関連の効果は重複可能：所持数分ドローする
    { const n=this.relicActive()?GameState.relics.filter(r=>r.relicEnhance==='ren_draw').length:0; for(let i=0;i<n;i++) this.drawOne(); }
    this.chargeActive=false;
    if(GameState.currentScore>=GameState.targetScore){ this.finishStage('win'); return; }
    if(GameState.round>=GameState.effectiveMaxRounds()+(this.stageBonusRounds||0)){ this.finishStage('lose'); return; }
    this.updateCharge(chargeHandSum);
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

  // #1 ゲーム開始時の無料？カードパック（2枚から1枚選択）
  renderInitialCardPackModal(){
    if(!this.pendingInitialCardPack) return null;
    const overlay=document.createElement('div'); overlay.className='pack-modal-overlay';
    const modal=document.createElement('div'); modal.className='pack-modal';
    modal.innerHTML='<h3>'+GIcon('pack_card',{cls:'gi-gap'})+'？カードパック（無料）</h3><div class="slot-desc" style="margin-bottom:10px;">2枚から1枚選んで獲得しましょう</div>';
    const grid=document.createElement('div'); grid.className='pack-card-grid';
    this.pendingInitialCardPack.forEach(card=>{
      const wrap=document.createElement('div'); wrap.className='card-pick-wrap';
      const el=document.createElement('div'); el.className='card'+(card.trait?' trait-'+card.trait.replace(/[()]/g,''):'');
      el.innerHTML=`${this.cardTagsHtml(card)}${this.cardSymbolHtml(card)}${this.cardScoreHtml(card,GameState.gold)}`;
      el.addEventListener('click',()=>this.pickInitialCardPack(card));
      wrap.appendChild(el); grid.appendChild(wrap);
    });
    modal.appendChild(grid);
    overlay.appendChild(modal);
    return overlay;
  },
  pickInitialCardPack(card){
    GameState.currentDeck.push(card);
    // #5 initStage()の時点で山札は既にシャッフル済みのため、デッキに追加するだけでは今回のステージで引けない。
    //    このステージの山札にも直接追加し、実際に反映されるようにする
    GameState.drawPile.push(card);
    GlobalFunctions.recordCard(card);
    this.addLog(`？カードパック：${GIconSym(card.symbol)}（基礎点${card.baseScore}）を獲得`);
    this.pendingInitialCardPack=null;
    this.renderAll();
  },

  // #9 レリック「ジョーカー」：売却後にデッキから好きなカードを1枚選ばせ、基礎点+10・記号をランダムに変更する
  renderJokerPickModal(){
    if(!this.pendingJokerPick) return null;
    const overlay=document.createElement('div'); overlay.className='pack-modal-overlay';
    const modal=document.createElement('div'); modal.className='pack-modal pack-modal-wide';
    // 2段階：①好きなカードを選ぶ → ②記号を選ぶ
    if(this.jokerSelectedCard){
      const c=this.jokerSelectedCard;
      modal.innerHTML='<h3>'+GIcon('joker',{cls:'gi-gap'})+'ジョーカー：カードの記号を選んでください</h3><div class="slot-desc" style="margin-bottom:10px;">選んだカードは基礎点+10され、選んだ記号に変わります</div>';
      const prev=document.createElement('div'); prev.style.cssText='display:flex;justify-content:center;margin-bottom:12px;';
      const pel=document.createElement('div'); pel.className='card'+(c.trait?' trait-'+c.trait.replace(/[()]/g,''):'');
      pel.innerHTML=`${this.cardTagsHtml(c)}${this.cardSymbolHtml(c)}${this.cardScoreHtml(c,GameState.gold)}`;
      prev.appendChild(pel); modal.appendChild(prev);
      const row=document.createElement('div'); row.className='pack-modal-actions';
      ['Circle','Triangle','Square','Cross'].forEach(sym=>{
        const btn=document.createElement('button'); btn.className=`sym-${sym}`; btn.style.fontSize='22px'; btn.innerHTML=GameData.SYMBOL_LABEL[sym]; btn.setAttribute('aria-label',GameData.SYMBOL_TEXT[sym]);
        btn.addEventListener('click',()=>this.applyJokerPick(c,sym));
        row.appendChild(btn);
      });
      modal.appendChild(row);
    }else{
      modal.innerHTML='<h3>'+GIcon('joker',{cls:'gi-gap'})+'ジョーカー：好きなカードを1枚選んでください</h3><div class="slot-desc" style="margin-bottom:10px;">選んだカードは基礎点+10され、記号を選び直せます</div>';
      const grid=document.createElement('div'); grid.className='pack-card-grid'; grid.style.maxHeight='55vh'; grid.style.overflowY='auto';
      GameState.currentDeck.forEach(card=>{
        const wrap=document.createElement('div'); wrap.className='card-pick-wrap';
        const el=document.createElement('div'); el.className='card'+(card.trait?' trait-'+card.trait.replace(/[()]/g,''):'');
        el.innerHTML=`${this.cardTagsHtml(card)}${this.cardSymbolHtml(card)}${this.cardScoreHtml(card,GameState.gold)}`;
        el.addEventListener('click',()=>{ this.jokerSelectedCard=card; this.renderAll(); });
        wrap.appendChild(el); grid.appendChild(wrap);
      });
      modal.appendChild(grid);
    }
    overlay.appendChild(modal);
    return overlay;
  },
  applyJokerPick(card,sym){
    const before={...card};
    card.baseScore+=10;
    card.symbol=sym;
    this.addLog(`ジョーカー：選んだカードの基礎点+10、記号が${GIconSym(sym)}に変化`);
    this.pendingJokerPick=null; this.jokerSelectedCard=null;
    this.showCardChangeToast([{before,after:card}]); // アップグレードと同様に右枠へ変化を表示
    this.renderAll();
  },

  // #11 レリック等によるカード変化を、ショップと同様に画面右側へ非ブロッキング表示する（横回転で変化後を見せる）
  showCardChangeToast(list){
    const token={}; this._toastToken=token;
    this.cardChangeToast=list.slice(0,4);
    setTimeout(()=>{
      if(this._toastToken===token){ this.cardChangeToast=null; const el=document.querySelector('.game-change-toast'); if(el) el.remove(); }
    },2600);
  },
  // #2 ビンゴ倍率が変化した時、アップグレードと同様に右枠へ変化後の倍率を表示する
  showMultChangeToast(before){
    if(!GameData.multChanged(before)) return;
    const token={}; this._multToastToken=token;
    this.multChangeToast={before};
    setTimeout(()=>{ if(this._multToastToken===token){ this.multChangeToast=null; const el=document.querySelector('.mult-change-toast'); if(el) el.remove(); } },3000);
  },
  renderMultChangeToast(){
    if(!this.multChangeToast) return null;
    const outer=document.createElement('div'); outer.className='card-reveal-toast mult-change-toast'+(this.cardChangeToast?' stacked':'');
    const box=document.createElement('div'); box.className='card-reveal-popup';
    box.innerHTML=GameData.multChangeHtml(this.multChangeToast.before);
    outer.appendChild(box); return outer;
  },
  renderCardChangeToast(){
    if(!this.cardChangeToast||this.cardChangeToast.length===0) return null;
    const outer=document.createElement('div'); outer.className='card-reveal-toast game-change-toast';
    const box=document.createElement('div'); box.className='card-reveal-popup';
    box.innerHTML='<div class="gr-label">カードが更新されました</div>';
    const grid=document.createElement('div'); grid.className='pack-card-grid';
    this.cardChangeToast.forEach(({before,after})=>{
      const flip=document.createElement('div'); flip.className='flip-card-wrap';
      const cls=(c)=>'card'+(c.trait?' trait-'+c.trait.replace(/[()]/g,''):'');
      flip.innerHTML=`<div class="flip-card-inner">
        <div class="flip-card-face flip-card-front"><div class="${cls(before)}">${this.cardTagsHtml(before)}${this.cardSymbolHtml(before)}${this.cardScoreHtml(before,GameState.gold)}</div></div>
        <div class="flip-card-face flip-card-back"><div class="${cls(after)} reveal-glow">${this.cardTagsHtml(after)}${this.cardSymbolHtml(after)}${this.cardScoreHtml(after,GameState.gold)}</div></div>
      </div>`;
      grid.appendChild(flip);
    });
    box.appendChild(grid); outer.appendChild(box); return outer;
  },

  // #演出 ビンゴ倍率の変化表（before→after を明示。GameData.multChangeHtml と同じ見た目）
  multDiffHtml(before,after){
    const f=v=>Math.round(v*100)/100;
    const rows=GameData.SYMBOLS.map(s=>{
      const a=before[s], b=after[s], d=b-a;
      const cls=d>0?'mc-up':(d<0?'mc-down':'mc-same');
      return `<tr class="${cls}"><td class="sym-${s}">${GameData.SYMBOL_LABEL[s]}</td><td>${f(a)}</td><td>→</td><td class="mc-after">${f(b)}</td><td class="mc-diff">${d===0?'':(d>0?'+':'')+f(d)}</td></tr>`;
    }).join('');
    return `<div class="gr-label">ビンゴ倍率が変化しました</div><table class="mult-change-table">${rows}</table>`;
  },
  // #演出 カード変化（横回転で変化後を見せる）。renderCardChangeToast と同じ見た目
  cardChangeGridHtml(list){
    const cls=(c)=>'card'+(c.trait?' trait-'+c.trait.replace(/[()]/g,''):'');
    return `<div class="pack-card-grid">${list.slice(0,4).map(({before,after})=>`<div class="flip-card-wrap"><div class="flip-card-inner">
        <div class="flip-card-face flip-card-front"><div class="${cls(before)}">${this.cardTagsHtml(before)}${this.cardSymbolHtml(before)}${this.cardScoreHtml(before,GameState.gold)}</div></div>
        <div class="flip-card-face flip-card-back"><div class="${cls(after)} reveal-glow">${this.cardTagsHtml(after)}${this.cardSymbolHtml(after)}${this.cardScoreHtml(after,GameState.gold)}</div></div>
      </div></div>`).join('')}</div>`;
  },

  finishStage(result){
    if(result==='lose'&&this.resultState==='lose') return; // 二重の失敗処理で残機を2つ消費しないためのガード
    this._clearFx=[];
    // #3 ゲームスコア最高得点を記録
    GlobalFunctions.saveHighScoreIfBetter(GameState.currentScore);
    // #2 統一ボス効果の倍率を元に戻す
    if(this.hasBossEffect('turn_limit')) GameState.turnsBonus=this.turnsBonus_bossRestore;
    if(this.hasBossEffect('hand_limit')&&this.handLimitRestore!=null){ GameState.handSizeBonus=this.handLimitRestore; this.handLimitRestore=null; }
    GameState.currentDeck.forEach(c=>{ if(c._reserveCarry) delete c._reserveCarry; }); // #4
    if(this.hasBossEffect('unify')&&this.unifyRestoreData){
      GameData.SYMBOLS.forEach(s=>{ GameData.BINGO_MULTIPLIER_BASE[s]=this.unifyRestoreData[s]; });
      this.unifyRestoreData=null;
    }
    this.restoreSuspendedPassives(); // #4
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
      const multBeforeClear=GameData.snapshotMult(); // #2
      // #演出 クリア時に発動した効果（倍率・カードの変化）は報酬演出（StageFX z70）の上に順に見せる。トーストは報酬演出の裏に隠れるため使わない
      const clearFx=[]; this._clearFx=clearFx;
      const useStageFx=(typeof StageFX!=='undefined');
      // #5 マルパッシブ3：ステージクリア時、マル以外の3つのビンゴ倍率（バツはバツパッシブ適用後の実効値）を合算して加算する（合計が負の場合は加算しない）
      if(GameState.symbolPassiveTier.Circle>=3){
        const before=GameData.BINGO_MULTIPLIER_BASE.Circle;
        let crossEff=GameData.BINGO_MULTIPLIER_BASE.Cross;
        if(GameState.symbolPassiveTier.Cross>=2) crossEff=Math.max(...GameData.SYMBOLS.map(s=>GameData.BINGO_MULTIPLIER_BASE[s]));
        if(GameState.symbolPassiveTier.Cross>=3) crossEff*=4;
        const sum=GameData.BINGO_MULTIPLIER_BASE.Triangle+GameData.BINGO_MULTIPLIER_BASE.Square+crossEff;
        if(sum>0){
          GameData.BINGO_MULTIPLIER_BASE.Circle=before+Math.round(sum);
          this.addLog(`マルパッシブ：マル倍率 ${Math.round(before*100)/100}→${GameData.BINGO_MULTIPLIER_BASE.Circle}（サンカク+シカク+バツ実効値の合計+${Math.round(sum)}）`);
        }
      }
      const multAfterPassive=GameData.snapshotMult();
      if(GameData.SYMBOLS.some(s=>multAfterPassive[s]!==multBeforeClear[s])) clearFx.push({kind:'mult', head:'パッシブ効果が発動', name:'マルパッシブ3', iconHtml:`<span class="sym-Circle">${GameData.SYMBOL_LABEL.Circle}</span>`, bodyHtml:this.multDiffHtml(multBeforeClear,multAfterPassive)});
      // #10 レリック「オールビンゴ獲得」：ステージクリア時、全記号のビンゴ倍率+1
      const cAllBingo=GameState.relicCountOf('all_bingo_gain');
      if(cAllBingo>0){
        GameData.SYMBOLS.forEach(s=>{GameData.BINGO_MULTIPLIER_BASE[s]+=1*cAllBingo;});
        this.addLog(`オールビンゴ獲得：全記号のビンゴ倍率+${1*cAllBingo}`);
        clearFx.push({kind:'mult', head:'レリック効果が発動', name:'オールビンゴ獲得'+(cAllBingo>1?` ×${cAllBingo}`:''), iconHtml:GameIcons.relic('all_bingo_gain'), grade:this.relicGradeOf('all_bingo_gain'), bodyHtml:this.multDiffHtml(multAfterPassive,GameData.snapshotMult())});
      }
      // #11 レリック「数値強化1獲得」：ステージクリア時、デッキ内のランダムなカード1枚の基礎点+10（変化はショップ同様に画面右側へ表示）
      const cNumBoost=GameState.relicCountOf('num_boost3');
      if(cNumBoost>0 && GameState.currentDeck.length>0){
        const changed=[];
        for(let i=0;i<cNumBoost;i++){ const card=GlobalFunctions.randChoice(GameState.currentDeck); const before={...card}; card.baseScore+=10; changed.push({before,after:card}); }
        this.addLog(`数値強化1獲得：ランダムなカード${cNumBoost}枚の基礎点+10`);
        if(useStageFx) clearFx.push({kind:'card', head:'レリック効果が発動', name:'数値強化1獲得'+(cNumBoost>1?` ×${cNumBoost}`:''), iconHtml:GameIcons.relic('num_boost3'), grade:this.relicGradeOf('num_boost3'), bodyHtml:`<div class="gr-label">基礎点+10</div>`+this.cardChangeGridHtml(changed)});
        else this.showCardChangeToast(changed);
      }
      // #9 レリック「趣味レリック集め」：ステージクリア時、クリア報酬の爆発アップグレードの前にレリックパックを1つ無料で獲得（所持数分）
      const cHobby=this.relicActive()?GameState.relicCountOf('hobby_collect'):0;
      ShopScene.pendingRelicPacks=0; ShopScene.pickingRelicPack=null;
      if(cHobby>0 && GameState.currentFloor<10){
        ShopScene.pendingRelicPacks=cHobby;
        ShopScene.openNextFreeRelicPack();
        this.addLog(`レリック効果が発動：趣味レリック集め（レリックパック×${cHobby}を無料で獲得）`);
      }
      if(!useStageFx) this.showMultChangeToast(multBeforeClear); // #2 マルパッシブ3・オールビンゴ獲得による倍率変化を右枠に表示（StageFX がある時は報酬演出の上で表示）
      // #12 最高クリア記録更新
      const stageOrder=['common','high','boss'];
      const stageIdx=stageOrder.indexOf(this.stage.key);
      const floorScore=GameState.currentFloor*3+stageIdx;
      const prevScore=(GameState.maxClearedFloor||0)*3+(stageOrder.indexOf(GameState.maxClearedStage||''));
      if(floorScore>prevScore){
        GameState.maxClearedFloor=GameState.currentFloor; GameState.maxClearedStage=this.stage.name;
        // #6/#10 自身の最高到達時のデッキ・レリック・パッシブ・所持金・最終スコアを保存し、タイトルで確認できるようにする
        GlobalFunctions.saveBestRunIfBetter(floorScore,{
          floor:GameState.currentFloor, stageName:this.stage.name,
          deck:GameState.currentDeck, relics:GameState.relics, savedAt:Date.now(),
          passives:{...GameState.symbolPassiveTier}, gold:GameState.gold, score:GameState.currentScore,
        });
      }
      // #4 階層10（最終決戦）クリア時はショップにも戻らないため、報酬・パッシブ選択はどちらも不要
      if(GameState.currentFloor<10){
        const rd=this.calcClearReward();
        this._rewardGoldBefore=GameState.gold; // #演出 報酬受け取り演出のカウントアップ開始値（表示専用）
        GameState.gold+=rd.total;
        // #7 ステージクリア報酬にも爆発通常アップグレードを組み込む（20%の確率でショップに用意される）
        let clearBonusMsg=null;
        if(GameState.currentDeck.length>0 && GameData.pickClearBonusType()==='normal_explosive_upgrade'){
          ShopScene.pickingPack = ShopScene.buildExplosiveUpgradePack(null);
          clearBonusMsg=GIcon('pack_explosive',{cls:'gi-gap'})+'爆発通常アップグレード：ショップで5つから最大3つまで選択できます';
        }
        if(cHobby>0){
          clearBonusMsg=`${GameIcons.relic('hobby_collect',{cls:'gi-gap'})}趣味レリック集め：レリックパック×${cHobby}（爆発アップグレードの前に選択）`+(clearBonusMsg?'／'+clearBonusMsg:'');
        }
        // #12 レリック「大爆発」：クリア報酬のG獲得後、所持Gが規定数以上ならその分を消費し、
        //     クリア報酬の爆発アップグレードが終わった後に「レリック効果が発動」と共に追加で1パック獲得する
        ShopScene.packQueue=[];
        const cBigExplosion=GameState.relicCountOf('big_explosion');
        if(cBigExplosion>0 && !this.hasBossEffect('no_relic')){
          const hasBlack=GameState.relics.some(r=>r.relicEnhance==='ren_black');
          const threshold=hasBlack?5:10;
          for(let i=0;i<cBigExplosion;i++){
            if(GameState.gold>=threshold && GameState.currentDeck.length>0){
              GameState.gold-=threshold;
              ShopScene.packQueue.push({relic:'大爆発'});
              this.addLog(`レリック効果が発動：大爆発（${threshold}G消費して爆発通常アップグレードを追加取得）`);
            }
          }
          if(ShopScene.packQueue.length>0){
            clearBonusMsg=(clearBonusMsg?clearBonusMsg+'／':'')+`${GameIcons.relic('big_explosion',{cls:'gi-gap'})}レリック効果が発動：大爆発（爆発通常アップグレード+${ShopScene.packQueue.length}）`;
            if(!ShopScene.pickingPack) ShopScene.advancePackQueue();
          }
        }
        GameState.lastReward={type:'clear',stageName:this.stage.name,gold:rd.total,breakdown:rd,/* #11 デバッグログは非表示（復活用に残す） debugLog:this.logs?this.logs.slice(-30):[], */extra:clearBonusMsg};
        this.addLog(`クリア報酬：G+${rd.total}（num=${rd.num}）${clearBonusMsg?'／'+clearBonusMsg:''}`);
        // #A ボスステージクリア時：記号パッシブを1つ選択
        if(this.stage.key==='boss'){
          this.pendingPassiveChoice=this.generatePassiveChoicePicks();
          this.passiveRewardsRemaining=GameState.passiveRewardCount(); // #1 魔力ステージD：この階層はパッシブ報酬3つ
          this.passiveChoiceContext='boss'; // #6 選択後にショップへ進む通常フローと区別するためのコンテキスト
        }
      }else{
        GameState.lastReward=null;
        this.addLog('第10階層（最終決戦）クリア！');
      }
      // #8 クリア時セーブ
      App.saveGame();
    } else if(result==='lose'){
      this.retreatInfo=null;
      if((GameState.lives||0)>0){
        // 残機あり：残機を1つ消費して「一時撤退」。セーブは破棄せず、撤退Gを得てミニショップ→マップで同じステージに再挑戦できる
        const livesBefore=GameState.lives;
        GameState.lives=livesBefore-1;
        const rr=GameState.calcRetreatReward(GameState.currentScore,GameState.targetScore);
        this._rewardGoldBefore=GameState.gold;
        GameState.gold+=rr.total;
        // ボス効果は applyBossEffect で pendingBossEffect から取り出して null にしているため、再挑戦で同じ効果になるよう戻す
        if(this.stage&&this.stage.key==='boss'&&this.bossEffects&&this.bossEffects.length>0){
          GameState.pendingBossEffect=this.bossEffects.length>1?this.bossEffects.slice():this.bossEffects[0];
        }
        GameState.lastReward=null;
        GameState.retreat={ floor:GameState.currentFloor, stageKey:this.stage?this.stage.key:'', stageName:this.stage?this.stage.name:'',
          score:GameState.currentScore, target:GameState.targetScore, ratio:rr.ratio, num:rr.num, gold:rr.total,
          livesBefore, livesLeft:GameState.lives, offers:null };
        this.retreatInfo=GameState.retreat;
        this.addLog(`ステージ失敗：残機を1つ消費して一時撤退（撤退G+${rr.total}、残機${GameState.lives}）`);
        // 一時撤退時セーブ（retreat を保存するので、ここでリロードしてもマップ表示時にミニショップへ復帰する）
        if(typeof App!=='undefined') App.saveGame();
      }else{
        // #5 残機0での失敗：開放済みのレリック・カード強化効果をタイトルの図鑑（デッキ確認）に反映し、進行中のデータを破棄する
        GameState.relics.forEach(r=>GlobalFunctions.recordRelic(r.id));
        GameState.currentDeck.forEach(c=>GlobalFunctions.recordCard(c));
        GameState.retreat=null;
        if(typeof App!=='undefined') GlobalFunctions.deleteSlot(App.currentSaveSlot);
        this.addLog('ゲームオーバー：発見済みの効果・レリックを図鑑に記録し、進行中のセーブデータを破棄しました');
      }
    }
    this.renderAll();
  },

  // #7 クリア報酬G＝((基本G3)+(残りラウンド×1)+(残りリロール×1/2))×num＋レリック効果＋レリック強化効果
  //    num=1、階層6以上で+1、現在の点数が目標点数の2倍以上で+1（1≦num≦3）。端数は切り捨て
  // v11 #8 クリア報酬G＝(基本G5)×num＋(残りラウンド×1)＋レリック効果＋レリック強化効果
  //    num=2、階層6以上で+1、現在の点数が目標点数の2倍以上で+1（2≦num≦4）。端数は切り捨て
  calcClearReward(){
    const base=GameData.CLEAR_REWARD_BASE_G;
    const roundBonus=Math.max(0,GameState.effectiveMaxRounds()+(this.stageBonusRounds||0)-GameState.round);
    const rerollBonus=0; // v11 #8 残りリロールはクリア報酬に含めない
    let num=2;
    const floorBonus=GameState.currentFloor>=6; if(floorBonus) num++;
    const scoreBonus=GameState.currentScore>=GameState.targetScore*2; if(scoreBonus) num++;
    num=Math.max(2,Math.min(4,num));
    const rg=GameState.rewardRelicGold(this.hasBossEffect('no_relic'));
    const subtotal=Math.floor(base*num+roundBonus+rerollBonus);
    const total=subtotal+rg.relic+rg.relicEnhance;
    return {base,roundBonus,rerollBonus,num,floorBonus,scoreBonus,subtotal,relicBonus:rg.relic,relicEnhanceBonus:rg.relicEnhance,total};
  },

  // #4 保留で前ラウンドから残ったカードは手札上限に数えない
  // #7 クリア報酬の内訳表示（リザルト画面・ショップで共通）
  clearRewardBreakdownText(b){
    const fmt=v=>Math.round(v*100)/100;
    const numNote=['基本2',b.floorBonus?'階層6以上+1':'',b.scoreBonus?'目標点数の2倍以上+1':''].filter(Boolean).join('、');
    return `基本G${b.base}×num${b.num}（${numNote}） ＋ 残りラウンド${fmt(b.roundBonus)}×1 ＝ ${b.subtotal} ＋ レリック効果${b.relicBonus} ＋ レリック強化効果${b.relicEnhanceBonus}`;
  },

  drawToHandSize(){ const n=GameState.effectiveHandSize()-GameState.handCountForLimit(); for(let i=0;i<n;i++) this.drawOne(); },
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
    // #12 レリック「ギャンブル依存症」：効果量が常に+50か-50のどちらかのみになる
    if(card.enhance==='ギャンブル'){
      if(card._gambleDelta) card.baseScore-=card._gambleDelta;
      const addicted=GameState.hasRelic('gambling_addict')&&this.relicActive();
      const delta=addicted?(Math.random()<0.5?50:-50):Math.round(Math.random()*100-50);
      card.baseScore+=delta;
      card._gambleDelta=delta;
    }
    // #6 演出：ドロー時にデッキから出現したように見せる
    (this.justDrawnIds=this.justDrawnIds||new Set()).add(card.id);
    setTimeout(()=>{ if(this.justDrawnIds){ this.justDrawnIds.delete(card.id); this.renderAll(); } },500);
    return card;
  },

  // #4 手札のリロールはサンカクパッシブと無関係（解放対象はショップの品揃え更新）
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
    if(jamming==='ビンゴ阻害'&&GameState.relics.some(r=>r.id==='jamming_boost')&&this.relicActive()){ // #4 レリック使用不可中は発動しない
      const bonus=Math.round(GameState.targetScore*0.05);
      GameState.currentScore=Math.max(0,GameState.currentScore+bonus);
      this.effects.stunNextNpc=true;
      this.addLog(`ジャミング増強：ビンゴ阻害のカードが配置され、スタンを追加付与し+${bonus}点（目標点数×0.05）`);
    }
    switch(jamming){
      case 'スタン': this.effects.stunNextNpc=true; this.addLog('スタン：次のNPC行動を封じる'); break;
      case '混乱': this.effects.confuseNextNpc=true; this.addLog('混乱：次のNPCは最低点マスへ'); break;
      case 'ブレイク':
        /* v12 #1 配置時はターン加算後に呼ばれるので現在値＝次のターン。それ以外（再付与など）は+1 */
        this.effects.breakUntilTurn=Math.max(this.effects.breakUntilTurn||0,this.turnInRound+(this._jamFromPlacement?0:1)); this.addLog('ブレイク：次のターンまで、バツでビンゴしてもラウンドが終了しない');
        // #3 レリック「ジャミング増強」：ブレイク発動時、現在ラウンドの補正倍率+20（所持数分）
        if(!this.hasBossEffect('no_relic')&&GameState.relicCountOf('jamming_boost')>0){ const v=20*GameState.relicCountOf('jamming_boost'); this.roundCorrMultBonus=(this.roundCorrMultBonus||0)+v; this.addLog(`ジャミング増強：ブレイク発動により、このラウンドの補正倍率+${v}`); }
        break;
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

  // #10 レリック強化「オールリンク」：プレイヤーが配置したカードに常にジャミング「リンク」が付与されている状態（他のジャミングと重複）
  applyAllLink(cellIdx,card){
    if(this.hasBossEffect('no_relic')) return;
    if(!GameState.relics.some(r=>r.relicEnhance==='ren_all_link')) return;
    if(card&&card.jamming==='リンク') return; // カード自身のリンクと同一効果のため二重適用しない
    this.addLog('オールリンク：リンク効果が発動');
    this.queueJammingEffect('リンク',cellIdx);
  },

  // #10 追加配置マス（分身）のジャミングもカウントする（ビンゴ阻害は拡大なら4枚分）
  countBoardJamming(name){ return this.board.filter(c=>c&&c.card&&c.card.jamming===name).length; },
  queueJammingEffectMulti(jamming,cells){
    if(cells.length<=1){ this.queueJammingEffect(jamming,cells[0]); return; }
    if(jamming==='リンク'){
      const bs=GameData.BOARD_SIZE; const set=new Set();
      cells.forEach(ci=>{ const r=Math.floor(ci/bs),c=ci%bs; [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr,dc])=>{ const nr=r+dr,nc=c+dc; if(nr>=0&&nr<bs&&nc>=0&&nc<bs){ const i=this.cellIndex(nr,nc); if(this.board[i]===null&&!this.blockedCells.has(i)) set.add(i); } }); });
      if(set.size===0){ this.effects.stunNextNpc=true; this.addLog('リンク：隣接マスなし→スタン'); return; }
      const arr=[...set];
      if(this.effects.linkRestrict){ const merged=this.effects.linkRestrict.filter(i=>set.has(i)); this.effects.linkRestrict=merged.length>0?merged:arr; } else this.effects.linkRestrict=arr;
      this.addLog(`リンク：NPCの配置を${cells.length}マス分の十字マスに制限`); return;
    }
    cells.forEach(ci=>this.queueJammingEffect(jamming,ci));
  },

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
    const fxPre=(owner==='player'&&card&&typeof StageFX!=='undefined')?StageFX.snapshot(this):null; // #演出 配置前の盤面（サンダー等の対象）
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
    // #1 巨大化・肥大化：ターン消費のたびに発動する（配置のたびではなく）。applyPerTurnEnhances()側に移設
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
    // #2 エクステンド中はNPCの配置でもビンゴ判定・点数計算を行わない（次に自分がカードを置いた時に解除・判定）
    const newBingos = (isExtending1 || (this.extendActive && owner!=='player')) ? [] : this.detectNewBingos();
    if(isExtending1){ this.extendActive=true; this.addLog('エクステンド：このターンはビンゴ判定を行わない'); }
    else if(this.extendActive && owner==='player'){ this.extendActive=false; }
    if(!isNeg){ this.turnInRound++; this.applyPerTurnEnhances(); }
    if(card?.jamming){ this._jamFromPlacement=true; try{ this.queueJammingEffect(card.jamming,cellIdx); } finally{ this._jamFromPlacement=false; } }
    if(owner==='player') this.applyAllLink(cellIdx,card); // #10
    // #A サンカクパッシブ1：ジャミング使用の次のターンにもう一度同じ効果を付与
    if(card?.jamming&&card?.symbol==='Triangle'&&owner==='player'&&GameState.symbolPassiveTier.Triangle>=3){ // #4 サンカクカードのみ有効
      (this.pendingDelayedJamming=this.pendingDelayedJamming||[]).push({jamming:card.jamming,cellIdx,afterTurns:1});
    }
    // #8 ドロー強化：ネガティブカード配置時は発動させず、ターンが4の倍数になった時のみ発動する
    if(!isNeg && this.turnInRound%4===0){ const n=this.relicActive()?GameState.relics.filter(r=>r.id==='draw_boost').length:0; for(let i=0;i<n&&GameState.handCountForLimit()<GameState.effectiveHandSize();i++) this.drawOne(); }
    this.selectedCardId=null; this.boardInfoCell=null; this.activeRelicId=null; this.expandPending=null; this.paintPending=null;
    this.renderAll();
    // #演出 カード効果ごとの配置演出（ビンゴがある時だけ点数演出と重ならないよう短く待つ）
    const fxP=fxPre?StageFX.placement(card,[cellIdx],fxPre):null;
    if(fxP&&newBingos.length>0) await fxP;
    if(newBingos.length>0) await this.playScoreSequence(newBingos);
    const endByBingo=this.shouldBingoEndRound(newBingos,breakActive);
    if(endByBingo||this.turnInRound>GameState.effectiveTurnsPerRound()){this.renderAll();await this.sleep(300);this.endRound();return;}
    if(isNeg){this.renderAll();return;}
    // v11 #7 NPC強化：1回目の行動後は手番をNPCのまま保持し、scheduleAIMove側で2回目の行動を行う
    if(owner==='npc'&&this._npcHold){ this._npcHold=false; this.renderAll(); return; }
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
      if(quadOnly&&sym!=='Cross'&&!(win.isQuad||win.isPenta)) return null; // #8 プレイヤーのみ4列以上
      return {sym,cells};
    };

    // #2 ハブ：2つ以上のビンゴに関わるマスを判定するため、消費前の全窓を走査してマスごとのビンゴ関与数を数える
    const cellBingoCount={};
    this.windows.forEach((win)=>{
      const r=evalWin(win); if(!r) return;
      win.cells.forEach(ci=>{ cellBingoCount[ci]=(cellBingoCount[ci]||0)+1; });
    });

    const scoringRelics=new Set();
    // #3 レリック・パッシブの「ポップ」演出用：実際に点数計算に関わった時だけ、その時の数値を記録する（このビンゴ判定バッチのみ集計）
    const scoringPassives=new Set();
    const relicValueMap={};
    const passiveValueMap={};
    const markRelic=(id,val)=>{ scoringRelics.add(id); relicValueMap[id]=(relicValueMap[id]||0)+val; };
    const markPassive=(sym,val)=>{ scoringPassives.add(sym); passiveValueMap[sym]=(passiveValueMap[sym]||0)+val; };
    const makeResult=(idx,win,r,baseMult)=>{
      const lineFactor = GameData.lineFactor(win.isPenta?'penta':(win.isQuad?'quad':'tri')); // 列補正（魔力ステージA・B込み）
      let pureBaseMult = GameData.BINGO_MULTIPLIER_BASE[r.sym]; // 演出用：列補正を除いた素のビンゴ倍率（列補正0でも割り算しない）
      const sqP3=GameState.symbolPassiveTier.Square>=2; // #A シカクパッシブ3：強化効果2倍
      // #A 記号パッシブ：カード基礎点の個別補正（マルP3の加算、シカクP2の2倍、バツP2のデッキ枚数×3上書き）
      const perCellScore=(c,ci)=>{
        let v=c.baseScore;
        if(c.card?._passiveScoreAdd) v+=c.card._passiveScoreAdd;
        v+=GameData.bourgeoisBonus(c.card); // #4 ブルジョワ：現在G×4
        v+=GameData.weightedBonus(c.card); // #3 加重：デッキ内の同じ記号の枚数×1
        // #2/#3 バツパッシブ1・ボス効果「バツ5000」はNPCのバツのカード基礎点のみ対象
        if(this.isNpcCrossCell(c)) v=this.npcCrossScore(c);
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
      // #6 バツパッシブ1/2入れ替えにより、ミラー効果はLv2条件に変更
      if(r.sym==='Cross'&&GameState.symbolPassiveTier.Cross>=2){
        baseMult=Math.max(...GameData.SYMBOLS.map(s=>GameData.BINGO_MULTIPLIER_BASE[s]));
        pureBaseMult=baseMult;
      }
      // #A バツパッシブ3：点数計算時にバツ倍率をさらに4倍
      if(r.sym==='Cross'&&GameState.symbolPassiveTier.Cross>=3){ baseMult*=4; pureBaseMult*=4; }
      // #2 レリック強化「バツ強化」：バツビンゴ時、ビンゴ倍率を2倍（所持数分）
      if(r.sym==='Cross'&&!noRelic){ GameState.relics.filter(x=>x.relicEnhance==='ren_cross').forEach(rel=>{ baseMult*=2; pureBaseMult*=2; markRelic(rel.id,2); }); }
      // #18 点数計算式: (補正基礎点+カード基礎点) × (ビンゴ倍率+補正倍率) × 4列補正 × 最終乗算補正 + 最終加算補正
      let correctionBase=GameData.CORRECTION_BASE_SCORE;
      let relicBonus=0;
      // #3 補正基礎点に畳み込まれるレリック効果は、そのステップ（補正基礎点の表示時）でのみポップするよう個別管理する
      const baseRelicIds=new Set();
      const markBaseRelic=(id,val)=>{ markRelic(id,val); baseRelicIds.add(id); };
      if(!noRelic){
        // #5 同一レリックを複数所持している場合、所持数分（relicCountOf）だけ効果を重ねて適用する
        const cBingo=GameState.relicCountOf('bingo'); if(cBingo>0){const v=30*cBingo;relicBonus+=v;markBaseRelic('bingo',v);}

        const cOdd=GameState.relicCountOf('odd_boost'), cEven=GameState.relicCountOf('even_boost');
        cardScores.forEach(sc=>{
          if(sc%2===1&&cOdd>0){const v=15*cOdd;relicBonus+=v;markBaseRelic('odd_boost',v);}
          if(sc%2===0&&cEven>0){const v=15*cEven;relicBonus+=v;markBaseRelic('even_boost',v);}
        });
        if(r.sym==='Circle'){const c=GameState.relicCountOf('circle_boost'); if(c>0){const v=60*c;relicBonus+=v;markBaseRelic('circle_boost',v);}}
        if(r.sym==='Triangle'){const c=GameState.relicCountOf('triangle_boost'); if(c>0){const v=60*c;relicBonus+=v;markBaseRelic('triangle_boost',v);}}
        if(r.sym==='Square'){const c=GameState.relicCountOf('square_boost'); if(c>0){const v=60*c;relicBonus+=v;markBaseRelic('square_boost',v);}}
        const cRelicBoost=GameState.relicCountOf('relic_boost');
        if(cRelicBoost>0){const n=GameState.relicCount();const v=(5+8*n)*cRelicBoost;relicBonus+=v;markBaseRelic('relic_boost',v);}
        // base_boost is now FINAL_ADD; handled via FINAL_ADD
        const cEmpty=GameState.relicCountOf('empty_boost');
        if(cEmpty>0){const ec=this.board.filter(c=>!c).length;const v=(6*ec+5)*cEmpty;relicBonus+=v;markBaseRelic('empty_boost',v);}
        // #7 レリック「リロール強化」：ビンゴ時、残りリロール回数n×10を補正基礎点に加算（所持数分重ねる）
        const cReroll=GameState.relicCountOf('reroll_boost');
        if(cReroll>0){const v=GameState.rerollCount*10*cReroll;correctionBase+=v;markBaseRelic('reroll_boost',v);}
        GameState.relics.forEach(rel=>{
          const ren=rel.relicEnhance; if(!ren) return;
          if(ren==='ren_circle'){const n=GameState.currentDeck.filter(c=>c.symbol==='Circle').length;relicBonus+=n;markBaseRelic(rel.id,n);}
          if(ren==='ren_triangle'){const n=GameState.currentDeck.filter(c=>c.symbol==='Triangle').length;relicBonus+=n;markBaseRelic(rel.id,n);}
          if(ren==='ren_square'){const n=GameState.currentDeck.filter(c=>c.symbol==='Square').length;relicBonus+=n;markBaseRelic(rel.id,n);}
          if(ren==='ren_disc_pile'){const v=GameState.discardPile.length;relicBonus+=v;markBaseRelic(rel.id,v);}
          if(ren==='ren_discard'){markRelic(rel.id,0);}
        });
        // #12 レリック「テンステージ」：加算される基礎点が10の倍数のカード1枚につき補正基礎点+30
        const cTen=GameState.relicCountOf('ten_stage');
        if(cTen>0){ const n10=cardScores.filter(sc=>sc%10===0).length; if(n10>0){const v=n10*30*cTen;relicBonus+=v;markBaseRelic('ten_stage',v);} }
        // #3 レリック「魔神のお墨付き」：補正基礎点+n（n=捧げたカードの基礎点）
        GameState.relics.forEach(rel=>{ if(rel.id==='majin_seal'){ const v=(rel.sealValue||0)+50; relicBonus+=v; markBaseRelic('majin_seal',v); } }); // #1 n+50
        // #12 レリック「極みの境地」：補正基礎点+150
        const cPinnacle=GameState.relicCountOf('pinnacle');
        if(cPinnacle>0){const v=150*cPinnacle;relicBonus+=v;markBaseRelic('pinnacle',v);}
        // v12 #2 レリック「温故知新」①補正基礎点+10m（m=レリック所持数）
        const cOnko=GameState.relicCountOf('onko_chishin'); if(cOnko>0){const v=10*GameState.relicCount()*cOnko;if(v){relicBonus+=v;markBaseRelic('onko_chishin',v);}}
      }
      // 性質変化「レリック特攻」・強化「連鎖」の基礎点加算は、合計を出す前に補正基礎点へ加える
      //（以前は合計後に加算していたため実際の得点に反映されていなかった）
      win.cells.forEach(ci=>{
        const cell=this.board[ci]; if(!cell?.card) return;
        if(cell.card.trait==='レリック特攻') correctionBase+=10*GameState.relicCount();
        if(cell.card._ghostOf) return; // #6 分身マスは基礎点加算を重複させない
        if(cell.card.enhance==='連鎖'){ const n=this.board.filter(c=>c&&c.card&&!c.card._ghostOf&&c.card.enhance==='連鎖').length; correctionBase+=30*n; }
      });
      let pairBonus=0;
      if(!noRelic){
        // レリック強化「NPC強化」：補正基礎点×5（所持数分重ねる）
        const npcRels=GameState.relics.filter(x=>x.relicEnhance==='ren_npc');
        if(npcRels.length>0){ const f=Math.pow(5,npcRels.length); const npcBefore=correctionBase+relicBonus; relicBonus=npcBefore*f-correctionBase; const npcAdd=(npcBefore*f-npcBefore)/npcRels.length; npcRels.forEach(rel=>markBaseRelic(rel.id,npcAdd)); /* v11 #7 補正基礎点×5の実増加分をポップ表示 */ }
        // レリック強化「ペアルック」：同じレリックを2つ以上持っている時、カード基礎点+40
        GameState.relics.forEach(rel=>{ if(rel.relicEnhance==='ren_pair'&&GameState.relics.filter(x=>x.id===rel.id).length>=2){ pairBonus+=40; markBaseRelic(rel.id,40); } });
      }
      const cardBaseSum=cardScores.reduce((s,v)=>s+v,0)+pairBonus;
      const totalBase=cardBaseSum+correctionBase+relicBonus;

      let finalMult=baseMult+GameData.CORRECTION_MULTIPLIER;
      // #1 演出用：補正倍率に効く、普段は非表示のレリック強化効果・パッシブ・性質変化・手札効果の内訳を記録しておく
      const correctionMultParts=[];
      // #新規 セブンパッシブ1：ビンゴ時、7の倍数の基礎点を持つカード1枚につき補正倍率+77
      if(GameState.symbolPassiveTier.Seven>=1){
        const n7=r.cells.filter(c=>c&&c.baseScore%7===0).length;
        if(n7>0){ finalMult+=n7*77; correctionMultParts.push({label:'セブンパッシブ1',op:'+',val:n7*77,sym:'Seven'}); markPassive('Seven',n7*77); }
      }
      if(!noRelic){
        // #5 同一レリックを複数所持している場合、所持数分（relicCountOf）だけ効果を重ねて適用する
        const cTurn=GameState.relicCountOf('turn_boost');
        if(cTurn>0){const f=Math.pow(Math.pow(1.01,this.turnInRound),cTurn);finalMult*=f;correctionMultParts.push({label:'ターン強化',op:'×',val:f,id:'turn_boost'});markRelic('turn_boost',f);} // #1 1.1^n→1.01^nに修正
        const cHand=GameState.relicCountOf('hand_boost');
        if(cHand>0){const v=GameState.hand.length*3*cHand;finalMult+=v;correctionMultParts.push({label:'手札強化',op:'+',val:v,id:'hand_boost'});markRelic('hand_boost',v);} // #1 ビンゴ時、手札の数×3を補正倍率に加算
        const cLastStand=GameState.relicCountOf('last_stand');
        if(cLastStand>0&&GameState.round>=4){const f=Math.pow(2,cLastStand);finalMult*=f;correctionMultParts.push({label:'背水の陣',op:'×',val:f,id:'last_stand'});markRelic('last_stand',f);}
        // #3 レリック「チャージ」：補正倍率+n（n=各ラウンド終了直前の手札の基礎点合計を加算。300超でn=-10）
        const cChg=GameState.relicCountOf('charge');
        if(cChg>0&&this.chargeN){const v=this.chargeN*cChg;finalMult+=v;correctionMultParts.push({label:'チャージ',op:'+',val:v,id:'charge'});markRelic('charge',v);}
        // #3 レリック「ジャミング増強」：ブレイク発動ラウンドの補正倍率
        if(this.roundCorrMultBonus){const v=this.roundCorrMultBonus;finalMult+=v;correctionMultParts.push({label:'ジャミング増強',op:'+',val:v,id:'jamming_boost'});markRelic('jamming_boost',v);}
        // #3 レリック「テンステージ」：ビンゴ時のターンが10の時、補正倍率+30（所持数分）
        const cTen2=GameState.relicCountOf('ten_stage');
        if(cTen2>0&&this.turnInRound===10){const v=30*cTen2;finalMult+=v;correctionMultParts.push({label:'テンステージ',op:'+',val:v,id:'ten_stage'});markRelic('ten_stage',v);}
        // #12 レリック「極みの境地」：補正倍率+150
        const cPinnacle2=GameState.relicCountOf('pinnacle');
        if(cPinnacle2>0){const v=150*cPinnacle2;finalMult+=v;correctionMultParts.push({label:'極みの境地',op:'+',val:v,id:'pinnacle'});markRelic('pinnacle',v);}
        // v12 #2 レリック「温故知新」②補正倍率+10n（n=パッシブ所持数）
        const cOnko2=GameState.relicCountOf('onko_chishin'); if(cOnko2>0){const v=10*GameState.passiveCount()*cOnko2;if(v){finalMult+=v;correctionMultParts.push({label:'温故知新',op:'+',val:v,id:'onko_chishin'});markRelic('onko_chishin',v);}}
        GameState.relics.forEach(rel=>{
          if(rel.relicEnhance==='ren_general'){finalMult*=1.1;correctionMultParts.push({label:'将軍(レリック強化)',op:'×',val:1.1,id:rel.id});markRelic(rel.id,1.1);}
          if(rel.relicEnhance==='ren_only_one'&&GameState.relicCount()===1){finalMult+=20;correctionMultParts.push({label:'オンリーワン',op:'+',val:20,id:rel.id});markRelic(rel.id,20);}
          if(rel.relicEnhance==='ren_grade'){const n=GameState.currentDeck.reduce((s,c)=>{let x=0;if(c.enhance)x++;if(c.jamming)x++;if(c.trait)x++;return s+x;},0);finalMult+=n;correctionMultParts.push({label:'グレードオール',op:'+',val:n,id:rel.id});markRelic(rel.id,n);}
          if(rel.relicEnhance==='ren_discard'){finalMult*=1.5;correctionMultParts.push({label:'ディスカード(レリック強化)',op:'×',val:1.5,id:rel.id});markRelic(rel.id,1.5);}
        });
      }
      // 性質変化（r.cellsはセルオブジェクトのため、盤面インデックスであるwin.cellsで参照する。以前は参照ミスで性質変化が発動していなかった）
      win.cells.forEach(cidx=>{
        const cell=this.board[cidx]; if(!cell?.card||cell.card._ghostOf) return; // #6 性質変化は本体マスのみ
        if(cell.card.trait==='指令官'&&this.turnInRound>=7&&this.turnInRound<=10){finalMult*=1.2;correctionMultParts.push({label:'指令官',op:'×',val:1.2});}
        // #3 ミニマム：値を+nから+20nに変更（nは盤面最少記号の数）
        if(cell.card.trait==='ミニマム'){const counts={};GameData.SYMBOLS.forEach(s=>{counts[s]=this.board.filter(c=>c&&c.symbol===s).length;});const minv=Math.min(...Object.values(counts).filter(v=>v>0));finalMult+=minv*20;correctionMultParts.push({label:'ミニマム',op:'+',val:minv*20});}
        // #3 マキシマム：値を+1から+10nに変更（nは盤面最多記号の数）
        if(cell.card.trait==='マキシマム'){const counts={};GameData.SYMBOLS.forEach(s=>{counts[s]=this.board.filter(c=>c&&c.symbol===s).length;});const maxS=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];if(maxS&&maxS[0]===r.sym){finalMult+=maxS[1]*10;correctionMultParts.push({label:'マキシマム',op:'+',val:maxS[1]*10});}}
      });
      if(GameState.hand.some(c=>c.trait==='将軍')){finalMult*=1.1;correctionMultParts.push({label:'将軍(手札)',op:'×',val:1.1});}
      // #1 演出用：「補正倍率」として実際に使われる合計値（定数＋上記の隠れた内訳すべて）
      const correctionMultiplierTotal=finalMult-baseMult;

      // 4列補正はbaseMult計算済み（quadMultで1.5倍）、最終乗算補正
      // #1 演出用：最終乗算補正の内訳（普段は非表示の各要素）を記録しておく
      const finalMultParts=[];
      let finalMultiplier=GameData.FINAL_MULTIPLIER;
      // #1 ボス効果「レリック使用不可」の時はレリック強化効果もすべて無効にする
      if(!noRelic){
        // #5 同じ強化（ren_double/ren_triple）を持つレリックが複数ある場合、それぞれ個別に効果を重ねる
        GameState.relics.filter(r=>r.relicEnhance==='ren_double').forEach(rel=>{finalMultiplier*=1.5;finalMultParts.push({label:'ダブル',op:'×',val:1.5,id:rel.id});markRelic(rel.id,1.5);});
        GameState.relics.filter(r=>r.relicEnhance==='ren_triple').forEach(rel=>{finalMultiplier*=2;finalMultParts.push({label:'トリプル',op:'×',val:2,id:rel.id});markRelic(rel.id,2);});
        // #1 レリック「コンボ」：前ラウンドと異なる記号でビンゴした時、最終乗算補正+1.5（所持数分）
        const cCombo=GameState.relicCountOf('combo');
        if(cCombo>0&&this.prevRoundBingoSymbol&&this.prevRoundBingoSymbol!==r.sym){const v=1.5*cCombo;finalMultiplier+=v;finalMultParts.push({label:'コンボ',op:'+',val:v,id:'combo'});markRelic('combo',v);}
        // #12 レリック「パッシブ不要理論」：最終乗算補正にm=max(0,4.5-n)を加算（n=所持している記号パッシブの種類数）
        const cPassiveUnneeded=GameState.relicCountOf('passive_unneeded');
        if(cPassiveUnneeded>0){
          const n=Object.values(GameState.symbolPassiveTier).filter(t=>t>0).length;
          const m=Math.max(0,4.5-n);
          if(m>0){ const v=m*cPassiveUnneeded; finalMultiplier+=v; finalMultParts.push({label:'パッシブ不要理論',op:'+',val:v,id:'passive_unneeded'}); markRelic('passive_unneeded',v); }
        }
      }
      // #7 サンカクパッシブ2：デッキ内のサンカクカードでジャミング所持のもの1枚につき最終補正倍率+0.1（対象をデッキ全体からサンカクカードに変更）
      if(GameState.symbolPassiveTier.Triangle>=2){
        const n=GameState.currentDeck.filter(c=>c.jamming&&c.symbol==='Triangle').length;
        if(n>0){finalMultiplier+=n*0.1;finalMultParts.push({label:'サンカクパッシブ2',op:'+',val:n*0.1,sym:'Triangle'});markPassive('Triangle',n*0.1);}
      }
      // #新規 セブンパッシブ2：前回の節目で立てたフラグを消費し、今回のビンゴの最終乗算補正×7
      if(GameState.symbolPassiveTier.Seven>=2 && GameState.sevenPendingMultBoost){
        finalMultiplier*=7;
        finalMultParts.push({label:'セブンパッシブ2',op:'×',val:7,sym:'Seven'});
        markPassive('Seven',7);
        GameState.sevenPendingMultBoost=false;
        this.addLog('セブンパッシブ：最終乗算補正×7が発動！');
      }
      // #1 演出用：最終加算補正の内訳（普段は非表示の各要素）を記録しておく
      const finalAddParts=[];
      const finalAdd=GameData.FINAL_ADD;
      // 山札強化
      let finalAddTotal=finalAdd;
      // #5 補正基礎点強化・ラウンド強化：所持している時のみ加算
      if(!noRelic){
        const cBase=GameState.relicCountOf('base_boost'); if(cBase>0){const v=2000*cBase;finalAddTotal+=v;finalAddParts.push({label:'補正基礎点強化',op:'+',val:v,id:'base_boost'});markRelic('base_boost',v);}
        if(GameState.hasRelic('round_boost')&&this.roundBoostAdd){const v=this.roundBoostAdd;finalAddTotal+=v;finalAddParts.push({label:'ラウンド強化',op:'+',val:v,id:'round_boost'});markRelic('round_boost',v);}
      }
      if(!noRelic) GameState.relics.forEach(rel=>{if(rel.relicEnhance==='ren_draw_pile'){const v=GameState.drawPile.length*100;finalAddTotal+=v;finalAddParts.push({label:'山札強化',op:'+',val:v,id:rel.id});markRelic(rel.id,v);}});
      // #新規 セブンパッシブ3：デッキの枚数が7の倍数の時、最終加算補正+目標点数の7%
      if(GameState.symbolPassiveTier.Seven>=3 && GameState.currentDeck.length%7===0){
        const v=Math.round(GameState.targetScore*0.07);
        finalAddTotal+=v;
        finalAddParts.push({label:'セブンパッシブ3',op:'+',val:v,sym:'Seven'});
        markPassive('Seven',v);
      }

      // #19 チェックパッシブ1用：このラウンドでビンゴした記号の種類を記録（最終乗算補正は全結果の算出後にまとめて適用）
      this.bingoSymbolsThisRound=this.bingoSymbolsThisRound||new Set();
      this.bingoSymbolsThisRound.add(r.sym);
      // #20 チェックパッシブ3用：このラウンドの記号別ビンゴ回数
      this.bingoSymbolCountThisRound=this.bingoSymbolCountThisRound||{};
      this.bingoSymbolCountThisRound[r.sym]=(this.bingoSymbolCountThisRound[r.sym]||0)+1;
      // #8 チェックパッシブ3：このステージのビンゴ回数をカウント
      GameState.bingoCountThisStage=(GameState.bingoCountThisStage||0)+1;
      // #新規 セブンパッシブ2：累計ビンゴ回数をカウントし、7の倍数に到達した時点で全記号のビンゴ倍率+7・次回×7フラグを立てる
      if(GameState.symbolPassiveTier.Seven>=2){
        GameState.totalBingoCount=(GameState.totalBingoCount||0)+1;
        if(GameState.totalBingoCount%7===0){
          const mb7=GameData.snapshotMult();
          GameData.SYMBOLS.forEach(s=>{GameData.BINGO_MULTIPLIER_BASE[s]+=7;});
          this.showMultChangeToast(mb7); // #2
          GameState.sevenPendingMultBoost=true;
          this.addLog(`セブンパッシブ：累計${GameState.totalBingoCount}回目のビンゴ！全記号のビンゴ倍率+7、次のビンゴで最終乗算補正×7`);
        }
      }
      // #4 加算点数自体はマイナスを許容する（現在の点数がマイナスにならないようにするのは適用時のみ）
      const score=Math.round(totalBase*finalMult*finalMultiplier)+finalAddTotal;
      // #2 デバッグ用：計算式と各値の出所をログに表示
      const debugMsg=`[計算式] 基礎点=(カード基礎点[${cardScores.join('+')}]${cardScores.reduce((s,v)=>s+v,0)} + 補正基礎点(GameData.CORRECTION_BASE_SCORE)${correctionBase} + レリック補正(relicBonus)${relicBonus}) = ${totalBase} ／ 倍率=(ビンゴ倍率(GameData.BINGO_MULTIPLIER_BASE/quadMult)${baseMult} + 補正倍率(GameData.CORRECTION_MULTIPLIER)${GameData.CORRECTION_MULTIPLIER} + レリック加算) = ${Math.round(finalMult*100)/100} ／ 最終乗算補正(GameData.FINAL_MULTIPLIER×レリック)=${Math.round(finalMultiplier*100)/100} ／ 最終加算補正(GameData.FINAL_ADD+山札強化)=${finalAddTotal} ⇒ score=round(totalBase×倍率×最終乗算補正)+最終加算補正 = round(${totalBase}×${Math.round(finalMult*100)/100}×${Math.round(finalMultiplier*100)/100})+${finalAddTotal} = ${score}`;
      console.log('[ScoreCalc]',{symbol:r.sym,cardScores,correctionBase,relicBonus,totalBase,baseMult,correctionMultiplier:GameData.CORRECTION_MULTIPLIER,finalMult,finalMultiplierGlobal:GameData.FINAL_MULTIPLIER,finalMultiplier,finalAddGlobal:GameData.FINAL_ADD,finalAddTotal,score,activeRelics:GameState.relics.map(x=>x.id+(x.relicEnhance?('/'+x.relicEnhance):''))});
      return {idx,symbol:r.sym,cells:win.cells,cardScores,totalBase,relicBonus,correctionBase,cardBaseSum,correctionBaseTotal:correctionBase+relicBonus,mult:finalMult,pureBaseMult,lineFactor,correctionMultiplier:correctionMultiplierTotal,correctionMultParts,finalMultiplier,finalMultParts,finalAdd:finalAddTotal,finalAddParts,score,isQuad:win.isQuad,isPenta:win.isPenta,debugMsg,baseRelicIds:Array.from(baseRelicIds)};
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
      results.push(makeResult(idx,win,r,GameData.triMult(r.sym)));
    });
    // #19 チェックパッシブ1：このラウンドでビンゴした記号の種類（同時ビンゴを含む）が2種類以上なら最終乗算補正+(種類数-1)
    if(GameState.symbolPassiveTier.Check>=1&&results.length>0){
      const nKinds=this.bingoSymbolsThisRound.size;
      if(nKinds>=2){
        const v=nKinds-1;
        results.forEach(b=>{ b.finalMultiplier+=v; b.finalMultParts.push({label:'チェックパッシブ1',op:'+',val:v,sym:'Check'}); b.score=Math.round(b.totalBase*b.mult*b.finalMultiplier)+b.finalAdd; });
        markPassive('Check',v);
      }
    }
    const cDouble=noRelic?0:GameState.relicCountOf('double');
    if(cDouble>0&&results.length>=2){
      // #4 加算点数はマイナスを許容し、現在の点数のみ0未満にならないようにする
      // #5 同一レリックを複数所持している場合、所持数分だけ効果を重ねる
      const f=Math.pow(1.5,cDouble);
      results.forEach(b=>{b.finalMultiplier*=f;b.score=Math.round(b.totalBase*b.mult*b.finalMultiplier)+b.finalAdd;});
      markRelic('double',f);
    }
    // #3 レリック・パッシブの「ポップ」演出：数値の参照元はここで記録しておくが、実際にポップさせるタイミング（どのidを表示するか）は
    //    showScoreStepが各内訳を画面に表示するステップの間だけ個別に設定する（ここでは空にしておき、時期尚早なポップを防ぐ）
    this.scoringRelicIds=[];
    this.scoringRelicValues=relicValueMap;
    this.scoringPassiveIds=[];
    this.scoringPassiveValues=passiveValueMap;
    if(results.length>0) this.prevRoundBingoSymbol=results[results.length-1].symbol;
    return results;
  },

  shouldBingoEndRound(bingos,breakActive){
    if(bingos.length===0) return false;
    // #20 チェックパッシブ3：同じ記号のビンゴが2回目になるまでは盤面がエクステンド状態（ビンゴしてもラウンドが終了しない）
    if(this.isCheckExtendActive()){
      const cnt=this.bingoSymbolCountThisRound||{};
      if(Object.values(cnt).some(v=>v>=2)){ this.checkExtendReleased=true; this.addLog('チェックパッシブ3：同じ記号のビンゴが2回目になり、オールブレイクが解除された'); }
      else{ this.addLog('チェックパッシブ3：オールブレイクのため、ビンゴしてもラウンドは終了しない'); return false; }
    }
    if(breakActive) return bingos.some(b=>b.symbol!=='Cross');
    return true;
  },

  async playScoreSequence(bingos){ for(const b of bingos) await this.showScoreStep(b); },
  // v12 #9 レリック「チャージ」：全てのビンゴ計算が終わりラウンドが上がるタイミングでのみ、手札の基礎点合計をnに加算する
  updateCharge(sum){
    if(!(GameState.hasRelic('charge')&&this.relicActive())) return;
    this.chargeN=(this.chargeN||0)+sum;
    if(this.chargeN>150){ this.chargeN=-10; this.addLog('チャージ：nが150を超えたため n=-10 にリセット'); }
    else this.addLog(`チャージ：手札の基礎点合計${sum}を加算（n=${this.chargeN}）`);
    this.renderAll();
  },

  // #演出刷新 ビンゴ時の点数計算演出：盤面・倍率表・パッシブ・レリックに重ならない位置に半透明の吹き出し（ScoreFX）を出し、
  //   基礎点×倍率→列補正→最終乗算補正→最終加算補正→加算点数→現在の点数 の順にカウントアップで見せる。
  //   吹き出しは document.body 直下の永続要素なので renderAll() でゲーム画面のレイアウトは一切動かない。
  async showScoreStep(b){
    const before=GameState.currentScore, after=Math.max(0,before+b.score);
    const FX=(typeof ScoreFX!=='undefined')?ScoreFX:null;
    // #2 早送りボタン：一度ONにしたら次にOFFにするまで持続する（このシーケンス開始時にはリセットしない）
    const ffSleep=(ms)=>this.sleep(this.scoreFastForward?Math.max(20,Math.round(ms/8)):ms);
    const lineLabel=b.isPenta?'5列':(b.isQuad?'4列':'3列');
    const fmtNum=(v)=>Math.round(v*100)/100;
    const fs=(v)=>GlobalFunctions.formatScore(v);
    const sg=(v)=>GlobalFunctions.formatSigned(v);
    const sgNum=(v)=>(v>=0?'+':'')+fmtNum(v);
    const partText=(p)=>p.op==='×'?('×'+fmtNum(p.val)):sgNum(p.val);
    // #3 レリック・パッシブは、その内訳が実際に画面に反映されるステップの間だけポップさせる（それ以外は非表示にする）
    let popKey='';
    const popFor=(relicIds,passiveSyms)=>{
      this.scoringRelicIds=relicIds||[]; this.scoringPassiveIds=passiveSyms||[];
      const k=this.scoringRelicIds.join(',')+'|'+this.scoringPassiveIds.join(',');
      if(k!==popKey){ popKey=k; this.renderAll(); }
    };
    const popClear=()=>popFor([],[]);
    const popSrc=()=>document.querySelector('.relic-display-row .relic-card.bounce')||document.querySelector('.passive-bar .passive-icon.bounce');
    const partPop=(p)=>{ popFor(p.id?[p.id]:[],p.sym?[p.sym]:[]); return (p.id||p.sym)?popSrc():null; };

    this.scoringAnim={phase:0,cells:[],symbol:b.symbol,liveScore:before,before,score:b.score,reached:false,popCell:null};
    this.scoreBoxes=null;
    popKey='x'; popClear();
    // デバッグログ：計算式と計算値の出所を表示
    if(b.debugMsg){ this.addLog(b.debugMsg); console.log(b.debugMsg); }
    try{
      if(FX) await FX.open({
        title:`${lineLabel}ビンゴ！`, symLabel:GameData.SYMBOL_LABEL[b.symbol], symClass:'sym-'+b.symbol,
        cells:b.cells, targetScore:GameState.targetScore,
        getSpeed:()=>this.scoreFastForward?8:1,
        onToggleFF:()=>{ this.scoreFastForward=!this.scoreFastForward; }
      });
      const chip=async(k,text,to,o)=>{ if(FX) await FX.chip(k,text,to,o); else await ffSleep(o&&o.ms||300); };
      const cap=(t,c)=>{ if(FX) FX.caption(t,c); };
      const tr=(h,c)=>{ if(FX) FX.trace(h,c); };

      // 1. カード基礎点：盤面のセルを1枚ずつポップさせ、その点数が吹き出しの「基礎点」へ飛び込む
      cap('カード基礎点','cap-base');
      let chips=0;
      for(let i=0;i<b.cells.length;i++){
        const ci=b.cells[i];
        this.scoringAnim.popCell=ci; this.renderAll();
        const v=b.cardScores[i]||0; chips+=v;
        await chip('a',sg(v),chips,{from:document.querySelector(`.board .cell[data-ci="${ci}"]`),cls:'c-base',ms:230});
      }
      this.scoringAnim.popCell=null; this.scoringAnim.cells=b.cells; this.renderAll();
      if(Math.abs(b.cardBaseSum-chips)>1e-9){ // ペアルック等、カード基礎点に加わるボーナス
        popFor(b.baseRelicIds,[]);
        cap('カード基礎点ボーナス','cap-base');
        await chip('a',sg(b.cardBaseSum-chips),b.cardBaseSum,{from:popSrc(),cls:'c-base',ms:340});
      }
      const hasCorrBase=b.correctionBaseTotal!==0;
      tr(`${hasCorrBase?'(':''}${fs(b.cardBaseSum)}`,'t-base');
      // 2. 補正基礎点（ここに畳み込まれるレリック効果はこの時だけポップする）
      if(hasCorrBase||b.baseRelicIds.length>0){
        popFor(b.baseRelicIds,[]);
        cap('補正基礎点','cap-base');
        await chip('a',sg(b.correctionBaseTotal),b.totalBase,{from:popSrc(),cls:'c-base',ms:400,strength:2});
        if(hasCorrBase) tr(`${sg(b.correctionBaseTotal)})`,'t-base');
      }
      popClear();
      if(FX&&FX.el.a._v!==b.totalBase) await FX.tweenTo('a',b.totalBase,160);

      // 3. ビンゴ倍率 → 列補正 → 補正倍率 → 補正倍率の各内訳（レリック強化・パッシブ・性質変化・手札効果など）
      //    実際の計算では4列・5列の列補正はビンゴ倍率に掛かる（倍率表の「4列」欄の値）ため、倍率の中で見せる。
      //    こうすると表示の途中経過が最終の加算点数(b.score)と完全に一致し、最後に数字が不自然に戻ることがない
      tr('×','t-op');
      // #バツ実効倍率 バツパッシブLv2/3でバツ倍率が変化している時は青色で表示する
      const crossEffOn=b.symbol==='Cross'&&(GameState.symbolPassiveTier.Cross||0)>=2;
      cap(crossEffOn?`ビンゴ倍率（バツ ${fmtNum(GameData.BINGO_MULTIPLIER_BASE.Cross)}→${fmtNum(b.pureBaseMult)}）`:'ビンゴ倍率',crossEffOn?'cap-mult cap-cross-eff':'cap-mult');
      let m=b.pureBaseMult;
      const multParts=b.correctionMultParts||[];
      const hasMultParts=GameData.CORRECTION_MULTIPLIER!==0||multParts.length>0;
      const bingoMult=b.mult-b.correctionMultiplier; // 列補正込みのビンゴ倍率（detectNewBingos の baseMult）
      await chip('b','×'+fmtNum(m),m,{from:document.querySelector('.mult-legend'),cls:crossEffOn?'c-mult c-cross-eff':'c-mult',ms:320});
      tr(`${hasMultParts?'(':''}${fmtNum(m)}`,crossEffOn?'t-mult t-cross-eff':'t-mult');
      if(b.lineFactor!==1||Math.abs(bingoMult-m)>1e-9){
        const lf=m!==0?bingoMult/m:b.lineFactor;
        cap(`${lineLabel}ビンゴ補正`,'cap-mod');
        m=bingoMult;
        await chip('b','×'+fmtNum(lf),m,{from:document.querySelector('.mult-legend'),cls:'c-mod',ms:380,strength:2});
        if(FX) FX.shake(1);
        tr('×'+fmtNum(lf),'t-mod');
      }else{ // 3列は×1のため、補正名だけを短く見せる
        cap(`${lineLabel}ビンゴ補正 ×1`,'cap-mod');
        await ffSleep(200);
      }
      if(GameData.CORRECTION_MULTIPLIER!==0){
        m+=GameData.CORRECTION_MULTIPLIER;
        cap('補正倍率','cap-mult');
        await chip('b',sgNum(GameData.CORRECTION_MULTIPLIER),m,{cls:'c-mult',ms:300});
        tr(sgNum(GameData.CORRECTION_MULTIPLIER),'t-mult');
      }
      for(const part of multParts){
        // #3 このレリック/パッシブが実際に画面へ反映される、まさにこの瞬間だけポップさせる
        const src=partPop(part);
        m=part.op==='×'?m*part.val:m+part.val;
        cap(part.label,'cap-mult');
        await chip('b',partText(part),m,{from:src,cls:'c-mult',ms:320,strength:part.op==='×'?2:1});
        if(part.op==='×'&&FX) FX.shake(1);
        tr(partText(part),'t-mult');
      }
      popClear();
      if(hasMultParts&&FX) FX.traceAppend(')');
      // ビンゴ倍率と補正倍率（内訳すべて含む）は足し算のため、1つの「倍率」として扱う（= b.mult）
      if(FX&&Math.abs(FX.el.b._v-b.mult)>1e-9) await FX.tweenTo('b',b.mult,160);

      // 4. 基礎点 × 倍率 を衝突させて「得点」に統合
      cap('基礎点 × 倍率','cap-final');
      let running=b.totalBase*b.mult;
      if(FX) await FX.merge(running,{op:'×',label:'得点',strength:2,ms:500}); else await ffSleep(500);

      // 6. 最終乗算補正：内訳（レリック強化・パッシブなど）を一度すべて見せてから得点に乗算する
      const fParts=(b.finalMultParts||[]).slice();
      let fmCalc=GameData.FINAL_MULTIPLIER; fParts.forEach(p=>{ fmCalc=p.op==='×'?fmCalc*p.val:fmCalc+p.val; });
      if(fmCalc!==0&&Math.abs(b.finalMultiplier/fmCalc-1)>1e-9){ // 同時ビンゴ時のレリック「ダブル」など、内訳に載らない乗算
        const hasDouble=GameState.relics.some(r=>r.id==='double');
        fParts.push({label:hasDouble?'ダブル（同時ビンゴ）':'最終乗算補正',op:'×',val:b.finalMultiplier/fmCalc,id:hasDouble?'double':undefined});
      }
      if(fParts.length>0||b.finalMultiplier!==1){
        let fm=GameData.FINAL_MULTIPLIER;
        const useParen=fParts.some(p=>p.op!=='×');
        cap('最終乗算補正','cap-mod');
        if(FX) FX.showB({label:'最終乗算補正',value:fm,mult:true,kind:'mod',op:'×'});
        await ffSleep(130);
        if(useParen||fm!==1) tr(`×${useParen?'(':''}${fmtNum(fm)}`,'t-mod');
        for(const part of fParts){
          const src=partPop(part);
          fm=part.op==='×'?fm*part.val:fm+part.val;
          cap(part.label,'cap-mod');
          await chip('b',partText(part),fm,{from:src,cls:'c-mod',ms:320,strength:part.op==='×'?2:1});
          tr(partText(part),'t-mod');
        }
        if(useParen&&FX) FX.traceAppend(')');
        popClear();
        if(FX&&Math.abs(FX.el.b._v-b.finalMultiplier)>1e-9) await FX.tweenTo('b',b.finalMultiplier,160);
        running=Math.round(b.totalBase*b.mult*b.finalMultiplier);
        cap('最終乗算！','cap-final');
        if(FX) await FX.merge(running,{op:'×',strength:3,ms:500}); else await ffSleep(500);
      }

      // 7. 最終加算補正：同様に内訳をすべて見せてから加算する
      running=Math.round(b.totalBase*b.mult*b.finalMultiplier);
      const aParts=b.finalAddParts||[];
      if(aParts.length>0||b.finalAdd!==0){
        let fa=b.finalAdd-aParts.reduce((s,p)=>s+p.val,0); // 基本値（GameData.FINAL_ADD）
        cap('最終加算補正','cap-mod');
        if(FX) FX.showB({label:'最終加算補正',value:fa,kind:'add',op:'+',prefix:'+'});
        await ffSleep(130);
        if(fa!==0) tr(sg(fa),'t-add');
        for(const part of aParts){
          const src=partPop(part);
          fa+=part.val;
          cap(part.label,'cap-mod');
          await chip('b',sg(part.val),fa,{from:src,cls:'c-add',ms:320});
          tr(sg(part.val),'t-add');
        }
        popClear();
        running+=b.finalAdd;
        cap('加算！','cap-final');
        if(FX) await FX.merge(running,{op:'+',strength:1,ms:400}); else await ffSleep(400);
      }

      // 8. 加算点数を叩きつける（丸め誤差を避けるため最終的にb.scoreへ厳密一致させる）
      cap(b.score<0?'加算点数…':'加算点数 確定！','cap-final');
      if(FX) await FX.slam(b.score,'加算点数');
      tr(`= ${sg(b.score)}`,'t-res');
      await ffSleep(300);

      // 9. 加算点数が現在の点数へ吸い込まれ、段階的にカウントアップする
      const scoreEl=document.querySelector('.score-combined-stat .value');
      if(FX) await FX.flyTo(scoreEl);
      await this.animateScoreCountUp(before,after);
      this.scoringAnim.liveScore=GameState.currentScore; this.scoringAnim.reached=GameState.currentScore>=GameState.targetScore; this.scoringAnim.phase=8;
      this.addLog(`${GIconSym(b.symbol)}${lineLabel}ビンゴ！ ${GlobalFunctions.formatSigned(b.score)}（計${GlobalFunctions.formatScore(GameState.currentScore)}）`);
      this.renderAll();
      if(FX&&before<GameState.targetScore&&GameState.currentScore>=GameState.targetScore){
        FX.celebrate(document.querySelector('.score-combined-stat .value'));
        await ffSleep(1100);
      }else await ffSleep(520);
    }finally{
      GameState.currentScore=after; // 途中で例外が起きても最終点数は厳密に一致させる
      if(FX) await FX.close();
      // #2 早送りのON/OFF状態は次にプレイヤーが切り替えるまで保持する（ここではリセットしない）
      this.scoringAnim=null; this.scoreBoxes=null;
      // #3 演出が終わったら、レリック・パッシブの「ポップ」状態を必ず解除する（点数計算に関わったタイミング以外は表示しない）
      this.scoringRelicIds=[]; this.scoringRelicValues={}; this.scoringPassiveIds=[]; this.scoringPassiveValues={};
      this.renderAll();
    }
  },

  // #1 現在の点数を before→after へなめらかにカウントアップ（イージング）。最後は必ずafterに厳密一致させる
  //    毎フレーム renderAll せず、点数表示とプログレスバーだけを直接更新する（レイアウトは動かない）
  // #2 早送りがONの間は8倍速で進める
  async animateScoreCountUp(before,after){
    const diff=after-before;
    if(diff===0){ GameState.currentScore=after; this.renderAll(); return; }
    const tgt=GameState.targetScore;
    const el=document.querySelector('.score-combined-stat .value'), bar=document.querySelector('.progress-inner');
    const total=this.scoreFastForward?100:Math.min(820,480+Math.log10(Math.abs(diff)+1)*60);
    const t0=performance.now(); let lastHit=0;
    while(true){
      const now=performance.now();
      const t=Math.min(1,(now-t0)/total);
      const e=1-Math.pow(1-t,3); // 序盤を大きく、終盤を細かく動かす
      GameState.currentScore=(t>=1)?after:Math.round(before+diff*e);
      const live=GameState.currentScore;
      if(el&&el.isConnected){
        el.textContent=`${GlobalFunctions.formatScore(live)} / ${GlobalFunctions.formatScore(tgt)}`;
        if(live>=tgt) el.classList.add('sparkle');
        if(now-lastHit>110){ lastHit=now; el.classList.remove('sfx-score-hit'); void el.offsetWidth; el.classList.add('sfx-score-hit'); }
      }
      if(bar&&bar.isConnected) bar.style.width=Math.min(100,Math.floor((live/tgt)*100))+'%';
      if(t>=1) break;
      await this.sleep(16);
    }
    GameState.currentScore=after;
    this.renderAll();
  },

  // #1 巨大化・肥大化：ターンが1つ進むたびに発動する（配置のたびではなく、スタン・スキップでターンが進んだ時も含む）
  applyPerTurnEnhances(){
    this.board.forEach(cell=>{
      if(!cell?.card) return;
      const sqP1c=cell.card.symbol==='Square'&&GameState.symbolPassiveTier.Square>=2; // シカクパッシブ3はシカクカードのみ有効
      if(cell.card.enhance==='巨大化') cell.baseScore+=3*(sqP1c?2:1);
      // 肥大化：カード基礎点/2×対象ビンゴ倍率
      if(cell.card.enhance==='肥大化'){const a=Math.round((cell.card.baseScore/2)*GameData.BINGO_MULTIPLIER_BASE[cell.symbol]*(sqP1c?2:1));GameState.currentScore=Math.max(0,GameState.currentScore+a);}
    });
  },

  // #4 スキップ実装：手札が無い、または盤面にこれ以上置ける場所が無い場合、自動的にスキップ（ターン消費）として扱う
  hasAnyValidPlacement(){
    if(GameState.hand.length===0) return false;
    const hasEmptyCell=this.board.some((c,i)=>c===null&&!this.blockedCells.has(i));
    if(hasEmptyCell) return true;
    // 塗りつぶし・重ね掛けは既存カードの上に配置できる可能性があるため、盤面が埋まっていても配置可能とみなす
    // #1 重ね掛けは、盤面上の重ね掛けが付与されていない同じ記号のカードがある場合のみ配置可能
    return GameState.hand.some(c=>c.trait==='塗りつぶし'||c.trait==='塗りつぶし(レリック)'||(c.enhance==='重ね掛け'&&this.board.some((b,i)=>this.canOverlayOn(c,b,i))));
  },
  // #1 重ね掛け：同じ記号のカードの上に上書き配置できる。ただし盤面上の重ね掛けが付与されているカードの上には載せられない
  canOverlayOn(card,occ,ci){
    if(!card||card.enhance!=='重ね掛け'||!occ) return false;
    if(ci!=null&&this.blockedCells.has(ci)) return false;
    if(occ.symbol!==card.symbol) return false;
    if(occ.card&&occ.card.enhance==='重ね掛け') return false;
    return true;
  },
  async checkAutoSkip(){
    if(this.currentSide!=='player'||this.resultState) return;
    if(this.hasAnyValidPlacement()) return;
    const reason=GameState.hand.length===0?'手札がない':'盤面に置ける場所がない';
    this.addLog(`スキップ：${reason}ためターンを消費しました`);
    this.turnInRound++;
    this.applyPerTurnEnhances();
    if(this.turnInRound>GameState.effectiveTurnsPerRound()){ this.renderAll(); await this.sleep(300); this.endRound(); return; }
    this.currentSide='npc';
    if(GameState.floor10SpecialBoss&&this.isForcedNpcTurn(this.turnInRound+1)) this.currentSide='npc';
    this.renderAll();
    if(this.currentSide==='npc') this.scheduleAIMove();
  },

  // #7 ターンスキップボタン：プレイヤーが任意にそのターンを終了できるようにする
  async manualSkipTurn(){
    if(this.currentSide!=='player'||this.resultState||this.rerollMode) return;
    this.addLog('スキップ：プレイヤーがターンをスキップしました');
    this.turnInRound++;
    this.applyPerTurnEnhances();
    if(this.turnInRound>GameState.effectiveTurnsPerRound()){ this.renderAll(); await this.sleep(300); this.endRound(); return; }
    this.currentSide='npc';
    if(GameState.floor10SpecialBoss&&this.isForcedNpcTurn(this.turnInRound+1)) this.currentSide='npc';
    this.renderAll();
    if(this.currentSide==='npc') this.scheduleAIMove();
  },

  async scheduleAIMove(){
    await this.sleep(500);
    if(this.currentSide!=='npc'||this.resultState) return;
    const npcDouble=GameState.relics.some(r=>r.relicEnhance==='ren_npc')&&this.relicActive();

    // #A サンカクパッシブ1：遅延ジャミング再付与の処理
    if(this.pendingDelayedJamming&&this.pendingDelayedJamming.length>0){
      const due=this.pendingDelayedJamming.filter(p=>p.afterTurns<=0);
      this.pendingDelayedJamming=this.pendingDelayedJamming.filter(p=>p.afterTurns>0);
      // #22 サンダーは配置時に直接発動する効果のためqueueJammingEffect()に処理が無く、再付与時に発動していなかった
      due.forEach(p=>{ this.addLog(`サンカクパッシブ：ジャミング「${p.jamming}」を再付与`); if(p.jamming==='サンダー') this.applyThunder(); else this.queueJammingEffect(p.jamming,p.cellIdx); });
      this.pendingDelayedJamming.forEach(p=>p.afterTurns--);
    }

    // スタン事前チェック
    if(this.effects.stunNextNpc){
      this.effects.stunNextNpc=false;
      this.addLog('NPCはスタンした');
      this.turnInRound++;
      this.applyPerTurnEnhances();
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
      this.applyPerTurnEnhances();
      if(this.turnInRound>GameState.effectiveTurnsPerRound()){this.endRound();return;}
      this.currentSide='player';
      // #5 階層10：スタン解除後も5ターンごとの強制NPC番を正しく反映する
      if(GameState.floor10SpecialBoss&&this.isForcedNpcTurn(this.turnInRound+1)) this.currentSide='npc';
      this.renderAll();
      if(this.currentSide==='npc') this.scheduleAIMove(); else this.checkAutoSkip();
      return;
    }

    if(ci===null){this.endRound();return;}
    const roundBefore=GameState.round;
    this._npcHold=!!npcDouble;
    await this.placeCard(ci,'Cross',this.npcCrossBase(),'npc',null);
    const held=npcDouble&&!this._npcHold; this._npcHold=false;
    if(held&&!this.resultState&&this.currentSide==='npc'&&GameState.round===roundBefore){
      await this.sleep(400);
      if(this.resultState||this.currentSide!=='npc') return;
      this.addLog('NPC強化：NPCがもう一度行動');
      const ci2=this.chooseAICell();
      if(ci2!==null){ await this.placeCard(ci2,'Cross',this.npcCrossBase(),'npc',null); }
      else { this.currentSide='player'; if(GameState.floor10SpecialBoss&&this.isForcedNpcTurn(this.turnInRound+1)) this.currentSide='npc'; this.renderAll(); if(this.currentSide==='npc') this.scheduleAIMove(); else this.checkAutoSkip(); }
    }
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
    // #10 リンク制限（カードのジャミング「リンク」とレリック強化「オールリンク」はqueueJammingEffect()で合算済み）
    if(this.effects.linkRestrict){const r=this.effects.linkRestrict.filter(i=>empty.includes(i));this.effects.linkRestrict=null;if(r.length>0){empty=r;}else{this.effects.stunNextNpc=true;return null;}}
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

    // #6 予測点数：配置後の手札枚数を考慮する（配置したカードは手札から抜け、ドロー強化効果・シカクパッシブ等でビンゴ判定前に引くカードは加わる）
    const predictedHandCount=(()=>{
      let draws=0;
      const sqTier=GameState.symbolPassiveTier.Square||0;
      if(card.enhance==='ドロー') draws+=1+((card.symbol==='Square'&&sqTier>=2)?1:0);
      if(card.symbol==='Square'&&sqTier>=1) draws+=1;
      const discardedIds=new Set(GameState.discardedPile.map(c=>c.id));
      const available=GameState.drawPile.length+(GameState.drawPile.length<draws?GameState.discardPile.filter(c=>!discardedIds.has(c.id)).length:0);
      return Math.max(0,GameState.hand.length-1+Math.min(draws,available));
    })();
    // 配置したカード自身は手札に残らないため、手札の将軍判定からは除外する
    const handHasGeneral=GameState.hand.some(c=>c.id!==card.id&&c.trait==='将軍');

    // 配置可能なセル（塗りつぶしなら占有マスも含む）
    const empty=this.board.map((v,i)=>{
      if(this.blockedCells.has(i)) return -1;
      if(v===null) return i;
      if(isPaint) return i; // 塗りつぶし可能
      return -1;
    }).filter(i=>i>=0);

    // #予測修正 エクステンド：このカードを置いたターンはビンゴ判定を行わないため予測も出さない
    if(card.enhance==='エクステンド') return hints;
    const noRelic=this.hasBossEffect('no_relic');
    const quadOnly=this.hasBossEffect('quad_only');

    for(const ci of empty){
      const targetSets=getTargetSets(ci); if(targetSets.length===0) continue;
      const targets=targetSets[0];
      if(targets.length>1&&!isPaint&&targets.some(t=>this.board[t]!==null)) continue;

      let total=0, any=false;
      {
        // #予測修正 実際の配置（executePlacement）と同じく card.symbol のみで配置する（マルチ強化は cellCanBeSymbol 側で判定）。
        //   以前は記号ごと（例：バツマルチのバツ）に別々に計算して合算していたため、他のビンゴ＋バツビンゴが二重に加算されていた
        const simResults=[];
        const sim=this.board.slice();
        let bs=card.baseScore;
        // #6 シカクパッシブ1：シカクカードをプレイした時に自身の基礎点+1が永続付与されるため、予測もこの適用後の値で計算する
        if(card.symbol==='Square'&&GameState.symbolPassiveTier.Square>=1) bs+=1;
        const simCard={...card,baseScore:bs};
        targets.forEach(t=>{ sim[t]={symbol:card.symbol,baseScore:bs,owner:'player',card:t===targets[0]?simCard:{...simCard,_ghostOf:card.id}}; });
        // サンダー：配置直後・ビンゴ判定前に盤面の×を全除去（実際の処理順と同じ）
        if(card.jamming==='サンダー') for(let i=0;i<sim.length;i++) if(sim[i]?.symbol==='Cross') sim[i]=null;

        // #予測修正 盤面効果（ジャミング「延命」「ビンゴ阻害」）を配置後の盤面で数え、実際のdetectNewBingos()と同じ条件でバツビンゴの成立を判定する
        const lifeExt=sim.filter(c=>c&&c.card&&c.card.jamming==='延命').length;
        const blockCnt=sim.filter(c=>c&&c.card&&c.card.jamming==='ビンゴ阻害').length;
        const evalWinSim=(win)=>{
          const cells=win.cells.map(i=>sim[i]);
          if(cells.some(c=>!c)) return null;
          const candidates=GameData.SYMBOLS.filter(sy=>cells.every(c=>this.cellCanBeSymbol(c,sy)));
          if(candidates.length===0) return null;
          const s=candidates.find(x=>x!=='Cross')||candidates[0];
          if(s==='Cross'){
            if(blockCnt>=3) return null;
            if((lifeExt>0||blockCnt>=2)&&win.cells.length===3) return null;
            if(blockCnt>=1&&win.type==='col') return null;
          }
          if(quadOnly&&s!=='Cross'&&!(win.isQuad||win.isPenta)) return null;
          return {s,cells};
        };
        // ハブ：2つ以上のビンゴに関わるマスの判定（実際の計算と同じく全窓で数える）
        const cellBingoCount={};
        this.windows.forEach(win=>{ if(!evalWinSim(win)) return; win.cells.forEach(i=>{cellBingoCount[i]=(cellBingoCount[i]||0)+1;}); });

        const local=new Set(this.scoredWindowKeys);
        // #予測修正 空きマス強化：実際の計算と同じく「配置後」の盤面の空きマス数で計算する
        const simEmptyCount=sim.filter(c=>!c).length;
        const tryW=(win,idx,multObj)=>{
          if(local.has(idx)) return false;
          const r=evalWinSim(win); if(!r) return false;
          const {s,cells}=r;
          local.add(idx);
          const sqP3=GameState.symbolPassiveTier.Square>=2;
          const perCellScore=(c,cidx)=>{
            let v=c.baseScore;
            if(c.card?._passiveScoreAdd) v+=c.card._passiveScoreAdd;
            v+=GameData.bourgeoisBonus(c.card); // #4
            v+=GameData.weightedBonus(c.card); // #3
            if(this.isNpcCrossCell(c)) v=this.npcCrossScore(c); // #2/#3 NPCのバツのみ対象
            if(c.symbol==='Triangle'&&GameState.symbolPassiveTier.Triangle>=1){
              const tot=GameState.currentDeck.length||1;
              const n=GameState.currentDeck.filter(cc=>cc.symbol==='Triangle').length/tot;
              v*=(1+n);
            }
            if(c.card?.enhance==='ハブ'&&(cellBingoCount[cidx]||0)>=2){ v*=(sqP3&&c.symbol==='Square')?2:1.5; }
            return v;
          };
          const cardScores=cells.map((c,i)=>perCellScore(c,win.cells[i]));
          let baseMult=multObj[s];
          if(s==='Cross'&&GameState.symbolPassiveTier.Cross>=2) baseMult=Math.max(...GameData.SYMBOLS.map(sy=>GameData.BINGO_MULTIPLIER_BASE[sy]));
          if(s==='Cross'&&GameState.symbolPassiveTier.Cross>=3) baseMult*=4;
          if(s==='Cross'&&!noRelic) baseMult*=Math.pow(2,GameState.relics.filter(x=>x.relicEnhance==='ren_cross').length); // #2
          let correctionBase=GameData.CORRECTION_BASE_SCORE;
          let relicBonus=0;
          if(!noRelic){
            relicBonus+=30*GameState.relicCountOf('bingo');
            const cOdd2=GameState.relicCountOf('odd_boost'), cEven2=GameState.relicCountOf('even_boost');
            cardScores.forEach(sc=>{
              if(sc%2===1) relicBonus+=15*cOdd2;
              if(sc%2===0) relicBonus+=15*cEven2;
            });
            if(s==='Circle') relicBonus+=60*GameState.relicCountOf('circle_boost');
            if(s==='Triangle') relicBonus+=60*GameState.relicCountOf('triangle_boost');
            if(s==='Square') relicBonus+=60*GameState.relicCountOf('square_boost');
            const cRelicBoost2=GameState.relicCountOf('relic_boost');
            if(cRelicBoost2>0){ const n=GameState.relicCount(); relicBonus+=(5+8*n)*cRelicBoost2; }
            const cEmpty3=GameState.relicCountOf('empty_boost');
            if(cEmpty3>0) relicBonus+=(6*simEmptyCount+5)*cEmpty3;
            correctionBase+=GameState.rerollCount*10*GameState.relicCountOf('reroll_boost');
            GameState.relics.forEach(rel=>{
              const ren=rel.relicEnhance; if(!ren) return;
              if(ren==='ren_circle') relicBonus+=GameState.currentDeck.filter(c=>c.symbol==='Circle').length;
              if(ren==='ren_triangle') relicBonus+=GameState.currentDeck.filter(c=>c.symbol==='Triangle').length;
              if(ren==='ren_square') relicBonus+=GameState.currentDeck.filter(c=>c.symbol==='Square').length;
              if(ren==='ren_disc_pile') relicBonus+=GameState.discardPile.length;
            });
            const cTenP=GameState.relicCountOf('ten_stage');
            if(cTenP>0){ const n10=cardScores.filter(sc=>sc%10===0).length; relicBonus+=n10*30*cTenP; }
            GameState.relics.forEach(rel=>{ if(rel.id==='majin_seal') relicBonus+=(rel.sealValue||0)+50; });
            relicBonus+=150*GameState.relicCountOf('pinnacle');
            relicBonus+=10*GameState.relicCount()*GameState.relicCountOf('onko_chishin');
          }
          // 性質変化（配置後の盤面で、実際の点数計算と同じ範囲＝当該ビンゴ列のみを見る）
          cells.forEach(c=>{
            if(!c.card) return;
            if(c.card.trait==='レリック特攻') correctionBase+=10*GameState.relicCount();
            if(c.card._ghostOf) return;
            if(c.card.enhance==='連鎖'){ const n=sim.filter(bc=>bc&&bc.card&&!bc.card._ghostOf&&bc.card.enhance==='連鎖').length; correctionBase+=30*n; }
          });
          let pairP=0;
          if(!noRelic){
            const nNpcP=GameState.relics.filter(x=>x.relicEnhance==='ren_npc').length;
            if(nNpcP>0) relicBonus=(correctionBase+relicBonus)*Math.pow(5,nNpcP)-correctionBase;
            GameState.relics.forEach(rel=>{ if(rel.relicEnhance==='ren_pair'&&GameState.relics.filter(x=>x.id===rel.id).length>=2) pairP+=40; });
          }
          const lb=cardScores.reduce((a,v)=>a+v,0)+pairP+correctionBase+relicBonus;

          // #予測修正 倍率：実際のmakeResult()と同じく (ビンゴ倍率+補正倍率) に対して同じ順序で加算・乗算する
          //   （以前は×系の効果＝廃棄強化×1.5・ターン強化・背水の陣・将軍などを補正倍率部分のみに掛けており、実際より低く見えていた）
          let mult=baseMult+GameData.CORRECTION_MULTIPLIER;
          if(GameState.symbolPassiveTier.Seven>=1){ const n7=cells.filter(c=>c&&c.baseScore%7===0).length; if(n7>0) mult+=n7*77; }
          if(!noRelic){
            const cTurn2=GameState.relicCountOf('turn_boost');
            if(cTurn2>0) mult*=Math.pow(Math.pow(1.01,this.turnInRound),cTurn2);
            const cHand2=GameState.relicCountOf('hand_boost');
            if(cHand2>0) mult+=predictedHandCount*3*cHand2; // #6 配置・ドロー後の手札枚数で計算
            const cLastStand2=GameState.relicCountOf('last_stand');
            if(cLastStand2>0&&GameState.round>=4) mult*=Math.pow(2,cLastStand2);
            const cChgP=GameState.relicCountOf('charge');
            if(cChgP>0&&this.chargeN) mult+=this.chargeN*cChgP;
            if(this.roundCorrMultBonus) mult+=this.roundCorrMultBonus;
            const cTen2P=GameState.relicCountOf('ten_stage');
            if(cTen2P>0&&this.turnInRound===10) mult+=30*cTen2P;
            mult+=150*GameState.relicCountOf('pinnacle');
            mult+=10*GameState.passiveCount()*GameState.relicCountOf('onko_chishin');
            GameState.relics.forEach(rel=>{
              if(rel.relicEnhance==='ren_general') mult*=1.1;
              if(rel.relicEnhance==='ren_only_one'&&GameState.relicCount()===1) mult+=20;
              if(rel.relicEnhance==='ren_grade'){ const n=GameState.currentDeck.reduce((acc,c)=>{let x=0;if(c.enhance)x++;if(c.jamming)x++;if(c.trait)x++;return acc+x;},0); mult+=n; }
              if(rel.relicEnhance==='ren_discard') mult*=1.5; // 廃棄強化
            });
          }
          cells.forEach(c=>{
            if(!c.card||c.card._ghostOf) return;
            if(c.card.trait==='指令官'&&this.turnInRound>=7&&this.turnInRound<=10) mult*=1.2;
            if(c.card.trait==='ミニマム'){ const counts={}; GameData.SYMBOLS.forEach(sy=>{counts[sy]=sim.filter(bc=>bc&&bc.symbol===sy).length;}); const minv=Math.min(...Object.values(counts).filter(v=>v>0)); mult+=minv*20; }
            if(c.card.trait==='マキシマム'){ const counts={}; GameData.SYMBOLS.forEach(sy=>{counts[sy]=sim.filter(bc=>bc&&bc.symbol===sy).length;}); const maxS=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]; if(maxS&&maxS[0]===s) mult+=maxS[1]*10; }
          });
          if(handHasGeneral) mult*=1.1;

          // #3 最終乗算補正
          let finalMul=GameData.FINAL_MULTIPLIER;
          if(!noRelic){
            GameState.relics.filter(r=>r.relicEnhance==='ren_double').forEach(()=>{finalMul*=1.5;});
            GameState.relics.filter(r=>r.relicEnhance==='ren_triple').forEach(()=>{finalMul*=2;});
            const cComboP=GameState.relicCountOf('combo'); // #1 コンボは最終乗算補正
            if(cComboP>0&&this.prevRoundBingoSymbol&&this.prevRoundBingoSymbol!==s) finalMul+=1.5*cComboP;
            const cPassiveUnneededP=GameState.relicCountOf('passive_unneeded');
            if(cPassiveUnneededP>0){ const n=Object.values(GameState.symbolPassiveTier).filter(t=>t>0).length; const m=Math.max(0,4.5-n); if(m>0) finalMul+=m*cPassiveUnneededP; }
          }
          if(GameState.symbolPassiveTier.Triangle>=2) finalMul+=GameState.currentDeck.filter(c=>c.jamming&&c.symbol==='Triangle').length*0.1;
          if(GameState.symbolPassiveTier.Seven>=2 && GameState.sevenPendingMultBoost && simResults.length===0) finalMul*=7; // フラグは最初のビンゴで消費
          let finalAddTotal=GameData.FINAL_ADD;
          if(!noRelic){ finalAddTotal+=2000*GameState.relicCountOf('base_boost'); if(GameState.hasRelic('round_boost')) finalAddTotal+=(this.roundBoostAdd||0); } // #5
          if(!noRelic) finalAddTotal+=GameState.drawPile.length*100*GameState.relics.filter(r=>r.relicEnhance==='ren_draw_pile').length;
          if(GameState.symbolPassiveTier.Seven>=3 && GameState.currentDeck.length%7===0) finalAddTotal+=Math.round(GameState.targetScore*0.07);
          simResults.push({s,lb,mult,finalMul,finalAddTotal});
          any=true; return true;
        };
        // #10 5×5盤面の5列ビンゴにも対応
        this.windows.forEach((win,idx)=>{ if(!win.isPenta) return; if(tryW(win,idx,GameData.SYMBOLS.reduce((o,sy)=>{o[sy]=GameData.pentaMult(sy);return o;},{}))) (this.quadSiblings[idx]||[]).forEach(s=>{local.add(s);(this.quadSiblings[s]||[]).forEach(s2=>local.add(s2));}); });
        this.windows.forEach((win,idx)=>{ if(!win.isQuad) return; if(tryW(win,idx,qObj)) (this.quadSiblings[idx]||[]).forEach(s=>local.add(s)); });
        this.windows.forEach((win,idx)=>{ if(win.isQuad||win.isPenta) return; tryW(win,idx,GameData.SYMBOLS.reduce((o,sy)=>{o[sy]=GameData.triMult(sy);return o;},{})); });
        // #19 チェックパッシブ1
        let checkAdd=0;
        if(GameState.symbolPassiveTier.Check>=1&&simResults.length>0){
          const kinds=new Set([...(this.bingoSymbolsThisRound||[]),...simResults.map(r=>r.s)]);
          if(kinds.size>=2) checkAdd=kinds.size-1;
        }
        const cDoubleP=noRelic?0:GameState.relicCountOf('double');
        const doubleF=(cDoubleP>0&&simResults.length>=2)?Math.pow(1.5,cDoubleP):1;
        simResults.forEach(r=>{ total+=Math.round(r.lb*r.mult*((r.finalMul+checkAdd)*doubleF))+r.finalAddTotal; });
      }
      // #予測修正 ビンゴが成立する場合は、合計がマイナス（バツビンゴ）でもそのまま表示する
      if(any) hints[ci]=total;
    }
    return hints;
  },

  onCardClick(id){
    if(this.rerollMode){this.toggleRerollCard(id);return;}
    if(this.currentSide!=='player'||this.resultState) return;
    this.selectedCardId=(this.selectedCardId===id)?null:id;
    this.handBubbleClosedFor=null; // #扇形 別のカードを選ぶ／選択解除で吹き出しを再表示
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
      if(this.paintPending===ci){
        this.paintPending=null;
        const occ2=this.board[ci];
        // #1 塗りつぶしと重ね掛けが重複している場合も、重ね掛けの効果（基礎点加算＋重ね表示）を発動させる
        if(this.canOverlayOn(card,occ2,ci)){
          card.baseScore+=occ2.baseScore;
          this.executePlacement([ci],card,true);
        }else{
          this.executePlacement([ci],card);
        }
      }
      else{ this.paintPending=ci; this.boardInfoCell=null; this.renderAll(); }
      return;
    }
    const occ=this.board[ci];
    // #4 重ね掛け：盤面にある同じ記号のカードの上に上書き配置できる（上書きされたカードの基礎点を加算）
    if(card.enhance==='重ね掛け'&&occ&&occ.symbol===card.symbol&&occ.card&&occ.card.enhance==='重ね掛け'){
      this.addLog('重ね掛け：重ね掛けが付与されているカードの上には載せられません');
      this.boardInfoCell=(this.boardInfoCell===ci)?null:ci; this.renderAll(); return;
    }
    if(this.canOverlayOn(card,occ,ci)){
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
    const fxPre=(typeof StageFX!=='undefined')?StageFX.snapshot(this):null; // #演出 配置前の盤面（サンダー・引き直しの対象）
    const isPaint=card.trait==='塗りつぶし'||card.trait==='塗りつぶし(レリック)';
    // #3 シカクパッシブ1：プレイしたシカクカード自身にも基礎点+1を永続付与
    if(card.symbol==='Square'&&GameState.symbolPassiveTier.Square>=1) card.baseScore+=1;
    for(const ci of targets){
      if(this.board[ci]?.card&&!this.board[ci].card._ghostOf&&(isPaint||isOverlay)) this.pushToDiscard(this.board[ci].card);
      // #6 拡張・拡大で追加配置されるマスにも同じ効果を乗せる（表示用の分身カード。捨て札等への移動は本体のみ）
      const cellCard = ci===mainCi ? card : {...card, id:card.id+'__g'+ci, _ghostOf:card.id};
      this.board[ci]={symbol:card.symbol,baseScore:card.baseScore,owner:'player',card:cellCard};
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
    // #1 巨大化・肥大化：ターン消費のたびに発動する（配置のたびではなく）。applyPerTurnEnhances()側に移設
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
    if(!isNeg){ this.turnInRound++; this.applyPerTurnEnhances(); }
    // #10 拡張・拡大で追加配置されたマスのジャミング効果もすべて発動する（リンクは全マスの十字マスの和集合）
    if(card.jamming){ this._jamFromPlacement=true; try{ this.queueJammingEffectMulti(card.jamming,targets); } finally{ this._jamFromPlacement=false; } }
    this.applyAllLink(mainCi,card); // #10
    if(card.jamming&&card.symbol==='Triangle'&&GameState.symbolPassiveTier.Triangle>=3){ // #4 サンカクカードのみ有効
      targets.forEach(ci=>{ (this.pendingDelayedJamming=this.pendingDelayedJamming||[]).push({jamming:card.jamming,cellIdx:ci,afterTurns:1}); });
    }
    // #8 ドロー強化：ネガティブカード配置時は発動させず、ターンが4の倍数になった時のみ発動する
    if(!isNeg && this.turnInRound%4===0){ const n=this.relicActive()?GameState.relics.filter(r=>r.id==='draw_boost').length:0; for(let i=0;i<n&&GameState.handCountForLimit()<GameState.effectiveHandSize();i++) this.drawOne(); }
    this.selectedCardId=null; this.boardInfoCell=null; this.activeRelicId=null; this.expandPending=null; this.paintPending=null;
    this.renderAll();
    // #演出 カード効果ごとの配置演出（ビンゴがある時だけ点数演出と重ならないよう短く待つ。それ以外は進行をブロックしない）
    const fxP=fxPre?StageFX.placement(card,targets,fxPre):null;
    if(fxP&&newBingos.length>0) await fxP;
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
    const price=GameData.relicSellPrice(relic);
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
      // #9 レリック「ジョーカー」：売却時、デッキから好きなカードを1枚プレイヤーが選ぶ（基礎点+10・記号ランダム変更は選択後に適用）
      case 'joker': {
        if(GameState.currentDeck.length>0) this.pendingJokerPick=true;
        break;
      }
      case 'hand_boost': break; // #1
      case 'paint': this.removePaintRelic(); GameState.turnsBonus+=4; break; // #3 ターン減少を-4に緩和
      case 'jamming_boost': GameState.handSizeBonus+=3; break; // #7 手札上限-3の解除
      case 'base_boost': break; // #5 所持中のみ点数計算で加算するため除去処理は不要
      default: break;
    }
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
    if(this.activeRelicId!=null){const rp=this.renderRelicInfoPanel();if(rp) topBox.appendChild(rp);} // #7 index 0 でも表示されるよう修正
    wrap.appendChild(topBox);
    const pip=this.renderPassiveInfoPanel(); if(pip) wrap.appendChild(pip);
    const turnMax=GameState.effectiveTurnsPerRound();
    const turnEl=document.createElement('div'); turnEl.className='turn-indicator '+this.currentSide;
    // #15 残りターンが少なくなったら警告表示：分母-6以上で黄色発光、分母-2以上で赤色＋拡縮アニメーション
    const tNow=this.turnInRound;
    const turnCls=tNow>=turnMax-2?' turn-danger':(tNow>=turnMax-6?' turn-warn':'');
    turnEl.innerHTML=`${this.currentSide==='player'?'あなたの番':'NPCの番'}（<span class="turn-count${turnCls}">ターン ${tNow} / ${turnMax}</span>）`;
    // #演出 ボス効果は盤面上の常設枠をやめ、ターン表示の横のコンパクトなバッジにする（タップで一覧を吹き出し表示）
    const turnRow=document.createElement('div'); turnRow.className='turn-row';
    turnRow.appendChild(turnEl);
    wrap.appendChild(turnRow);
    if(this.bossEffect||GameState.floor10SpecialBoss){
      if(typeof StageFX!=='undefined'){
        turnRow.appendChild(StageFX.bossBadge(StageFX.bossList(this),!!this.bossBubbleOpen,()=>{ this.bossBubbleOpen=!this.bossBubbleOpen; this.renderAll(); }));
      }else{
        const bt=document.createElement('div'); bt.className='boss-tag';
        // #9 複数ボス効果（第5階層以降）を全て表示する
        let html=this.bossEffect?(this.bossEffects||[this.bossEffect]).map(be=>`<span class="boss-tag-name">ボス効果：${be.name}</span><span class="boss-tag-desc">${be.desc}</span>`).join(''):'';
        // #6 階層10特有ボス効果を常時表示
        if(GameState.floor10SpecialBoss) html+=`<span class="boss-tag-name">ボス効果：最終決戦</span><span class="boss-tag-desc">5ターンごと（6,11,16…ターン目）は強制的にNPCの番になる</span>`;
        bt.innerHTML=html;
        wrap.appendChild(bt);
      }
    }
    const ba=document.createElement('div'); ba.className='board-area';
    ba.appendChild(this.renderBoard());
    wrap.appendChild(ba);
    const bi=this.renderBoardInfoPanel(); if(bi) wrap.appendChild(bi);
    wrap.appendChild(this.renderHand());
    // #17 ビンゴ倍率と盤面効果は手札の下に配置する
    const belowHand=document.createElement('div'); belowHand.className='below-hand-row';
    const multLegend=this.renderMultLegend();
    if(this.scoringAnim?.phase===2) multLegend.classList.add('scoring-phase2');
    belowHand.appendChild(multLegend);
    belowHand.appendChild(this.renderEffectsPanel());
    wrap.appendChild(belowHand);
    const hi=this.renderHandInfoPanel(); if(hi) wrap.appendChild(hi);
    // #10 ゲームメイン画面のログ表示は削除（ログ自体は this.logs に保持）
    // wrap.appendChild(this.renderLog());
    this.container.appendChild(wrap);
    // #1 報酬画面／パッシブ選択はゲームメイン画面の上にオーバーレイ表示する（両方同時に出ても良いよう独立したifにする）
    if(this.resultState) this.container.appendChild(this.renderResult());
    else if(typeof StageFX!=='undefined') StageFX.hideResult(); // #演出 報酬演出は body 直下の永続要素
    if(this.pendingPassiveChoice && this.passiveModalOpen) this.container.appendChild(this.renderPassiveChoiceModal());
    else if(typeof StageFX!=='undefined') StageFX.hidePassive();
    // #1 ゲーム開始時の無料？カードパック
    if(this.pendingInitialCardPack){
      // 無料？カードパックもパックを剥く演出の後に選択させる
      if(this._initPackOpened===this.pendingInitialCardPack||typeof PackFX==='undefined') this.container.appendChild(this.renderInitialCardPackModal());
      else if(this._initPackPlaying!==this.pendingInitialCardPack){
        const pk=this.pendingInitialCardPack; this._initPackPlaying=pk;
        PackFX.play({type:'card_pack', title:'？カードパック（無料）', items:pk.map(c=>({html:`<div class="card${c.trait?' trait-'+c.trait.replace(/[()]/g,''):''}">${this.cardTagsHtml(c)}${this.cardSymbolHtml(c)}${this.cardScoreHtml(c,GameState.gold)}</div>`}))})
          .then(()=>{ this._initPackOpened=pk; this._initPackPlaying=null; this.renderAll(); });
      }
    }
    // #11 カード変化トースト（画面右側）
    if(this.cardChangeToast) this.container.appendChild(this.renderCardChangeToast());
    if(this.multChangeToast) this.container.appendChild(this.renderMultChangeToast()); // #2
    // #9 レリック「ジョーカー」売却後のカード選択
    if(this.pendingJokerPick) this.container.appendChild(this.renderJokerPickModal());
    this.layoutHandFan(); // #扇形 手札の弓形配置（DOM挿入後に実寸で計算）
    window.scrollTo(0,scrollY);
    this.placeHandBubble(); // #8
  },

  renderStatusBar(){
    const holder=document.createElement('div'); holder.style.width='100%';
    const bar=document.createElement('div'); bar.className='status-bar'; bar.style.flexDirection='column'; bar.style.alignItems='flex-start';
    // #3 点数バーは現在の点数(GameState.currentScore)にのみ連動させる。計算中の途中値は反映しない
    const live=GameState.currentScore;
    const sparkle=this.scoringAnim&&this.scoringAnim.reached;
    const pct=Math.min(100,Math.floor((live/GameState.targetScore)*100));
    // #6 ラウンドを大きく表示し、点数は「現在/目標」の1つの表示にまとめる
    const topRow=document.createElement('div'); topRow.className='status-top-row'; // #6 ラウンド・Gの右にパッシブを詰めて配置（折り返さない）
    const roundBox=document.createElement('div'); roundBox.className='round-big-stat';
    roundBox.innerHTML=`<div class="label">ラウンド</div><div class="round-big-value">${GameState.round}<span class="round-big-max">/${GameState.effectiveMaxRounds()+(this.stageBonusRounds||0)}</span></div>`;
    topRow.appendChild(roundBox);
    // #16 ステージ欄は削除。ラウンドとGを隣り合わせ、その右にパッシブを配置する
    const stats=[['G',GameState.gold]];
    for(const [label,val] of stats){const d=document.createElement('div');d.className='stat';d.innerHTML=`<div class="label">${label}</div><div class="value">${val}</div>`;topRow.appendChild(d);}
    // #4 パッシブ一覧をラウンド・ステージと同じ行の右側に配置する
    const passiveBar=this.renderPassiveBar(); passiveBar.classList.add('passive-bar-inline');
    topRow.appendChild(passiveBar);
    bar.appendChild(topRow);
    const scoreBox=document.createElement('div'); scoreBox.className='stat score-combined-stat';
    scoreBox.innerHTML=`<div class="label">現在の点数 / 目標点数</div><div class="value${sparkle?' sparkle':''}">${GlobalFunctions.formatScore(live)} / ${GlobalFunctions.formatScore(GameState.targetScore)}</div><div class="lives-badge lives-badge-status" title="残機"><span class="lives-label">残機</span>${GameState.livesIconsHtml()}</div>`; // 残機（ハート）
    bar.appendChild(scoreBox);
    // #演出刷新 計算過程は吹き出し（ScoreFX）で表示するため、ステータスバーには何も差し込まない（レイアウトシフト防止）
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
  // 性質変化の常時演出レイヤー（js/traitFx.js / css/traitfx.css）を記号の前に差し込む。
  // cardSymbolHtml は手札・盤面・ショップ・デッキ一覧・パックで共通のため、ここに入れれば全画面に効く。
  cardSymbolHtml(card){
    const fx=(typeof TraitFX!=='undefined')?TraitFX.html(card):'';
    return fx+this.cardSymbolInnerHtml(card);
  },
  cardSymbolInnerHtml(card){
    const label=GameData.SYMBOL_LABEL[card.symbol];
    const emoji=card.jamming?(GameData.JAMMING_EMOJI[card.jamming]||''):'';
    const emojiHtml=emoji?`<div class="card-jamming-emoji">${emoji}</div>`:'';
    const multiSym=GameData.MULTI_SYMBOL_LABEL[card.enhance];
    // #1 マルパッシブ2：マルマルチ(パッシブ専用枠)は通常の強化効果と別枠の黄色丸バッジで表示
    const passiveMultiHtml=card._passiveMultiSymbol?`<span class="passive-multi-badge" title="マルマルチ(パッシブ)">${GameData.MULTI_SYMBOL_LABEL[card._passiveMultiSymbol]||card._passiveMultiSymbol}</span>`:'';

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
    // ハブ：記号右にハブアイコン
    if(card.enhance==='ハブ'){
      const sub=multiSym?`<span class="card-multi-sub">${multiSym}</span>`:'';
      return `<div class="card-symbol-wrap"><span class="sym-${card.symbol}">${label}</span><span class="enhance-badge enhance-badge-icon">${GIcon('enh_hub')}</span>${sub}</div>${emojiHtml}${passiveMultiHtml}`;
    }
    // 連鎖：記号右に連鎖アイコン
    if(card.enhance==='連鎖'){
      const sub=multiSym?`<span class="card-multi-sub">${multiSym}</span>`:'';
      return `<div class="card-symbol-wrap"><span class="sym-${card.symbol}">${label}</span><span class="enhance-badge enhance-badge-icon">${GIcon('enh_chain')}</span>${sub}</div>${emojiHtml}${passiveMultiHtml}`;
    }
    // 肥大化：記号右に肥大化アイコン（加算値は右上のカード基礎点に「+◯」で表示：cardScoreHtml）
    if(card.enhance==='肥大化'){
      const sub=multiSym?`<span class="card-multi-sub">${multiSym}</span>`:'';
      return `<div class="card-symbol-wrap enhance-pulse"><span class="sym-${card.symbol}">${label}</span><span class="enhance-badge enhance-badge-icon enh-enh_bloat">${GIcon('enh_bloat')}</span>${sub}</div>${emojiHtml}${passiveMultiHtml}`;
    }
    // #4 エクステンド：記号右にエクステンドアイコン
    if(card.enhance==='エクステンド'){
      const sub=multiSym?`<span class="card-multi-sub">${multiSym}</span>`:'';
      return `<div class="card-symbol-wrap"><span class="sym-${card.symbol}">${label}</span><span class="enhance-badge enhance-badge-icon">${GIcon('enh_extend')}</span>${sub}</div>${emojiHtml}${passiveMultiHtml}`;
    }
    // #4 トップスピード：記号右にトップスピードアイコン
    if(card.enhance==='トップスピード'){
      const sub=multiSym?`<span class="card-multi-sub">${multiSym}</span>`:'';
      return `<div class="card-symbol-wrap"><span class="sym-${card.symbol}">${label}</span><span class="enhance-badge enhance-badge-icon">${GIcon('enh_top_speed')}</span>${sub}</div>${emojiHtml}${passiveMultiHtml}`;
    }
    // #2 重ね掛け：記号右に重ね掛けアイコン
    if(card.enhance==='重ね掛け'){
      const sub=multiSym?`<span class="card-multi-sub">${multiSym}</span>`:'';
      return `<div class="card-symbol-wrap"><span class="sym-${card.symbol}">${label}</span><span class="enhance-badge enhance-badge-icon enh-enh_overlay">${GIcon('enh_overlay')}</span>${sub}</div>${emojiHtml}${passiveMultiHtml}`;
    }
    // #4 加重・ブルジョワ・ドロー：記号右に専用アイコン（加算値は右上のカード基礎点に「+◯」で表示）
    if(card.enhance==='加重'||card.enhance==='ブルジョワ'||card.enhance==='ドロー'){
      const sub=multiSym?`<span class="card-multi-sub">${multiSym}</span>`:'';
      const key={'加重':'enh_weighted','ブルジョワ':'enh_bourgeois','ドロー':'enh_draw'}[card.enhance];
      const sqP3d=card.symbol==='Square'&&GameState.symbolPassiveTier?.Square>=2;
      const drawN=card.enhance==='ドロー'?`<span class="enh-draw-n${sqP3d?' passive-value':''}">${sqP3d?2:1}</span>`:'';
      return `<div class="card-symbol-wrap"><span class="sym-${card.symbol}">${label}</span><span class="enhance-badge enhance-badge-icon enh-${key}">${GIcon(key)}${drawN}</span>${sub}</div>${emojiHtml}${passiveMultiHtml}`;
    }
    // #2 ギャンブル：記号右にギャンブルアイコン（以前は記号に重ねて表示していたため視認できなかった）
    if(card.enhance==='ギャンブル'){
      const sub=multiSym?`<span class="card-multi-sub">${multiSym}</span>`:'';
      return `<div class="card-symbol-wrap"><span class="sym-${card.symbol}">${label}</span><span class="enhance-badge enhance-badge-icon">${GIcon('enh_gamble')}</span>${sub}</div>${emojiHtml}${passiveMultiHtml}`;
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
      // #4 ブルジョワ：現在G×4 を「+◯」で表示（所持金に応じて変動）
      bonusHtml=`<span class="card-score-bonus gold-text${sqP3?' passive-value':''}">+${GameData.bourgeoisBonus(card)}</span>`;
    } else if(card.enhance==='肥大化'){
      // 肥大化：カード基礎点/2×対象ビンゴ倍率（ビンゴ時の加算値）を「+◯」で表示
      const mult=GameData.BINGO_MULTIPLIER_BASE[card.symbol]||0;
      const val=Math.round((card.baseScore/2)*mult*(sqP3?2:1));
      bonusHtml=`<span class="card-score-bonus${sqP3?' passive-value':' gold-text'}">+${val}</span>`;
    } else if(card.enhance==='加重'){
      // #4 加重：付与時に加算された値を「+◯」で表示
      bonusHtml=`<span class="card-score-bonus gold-text">+${GameData.weightedBonus(card)}</span>`;
    }

    // #4 パッシブ効果でカード基礎点が変化する場合、青字で実効値を表示する
    let displayScore=baseForDisplay, scoreIsPassive=(boardBaseScore!=null&&boardBaseScore!==card.baseScore);
    // #2 バツパッシブ1はNPCのバツのみ対象のため、プレイヤーのバツカードの表示は変えない
    if(card.symbol==='Triangle'&&GameState.symbolPassiveTier.Triangle>=1){
      const total=GameState.currentDeck.length||1;
      const n=GameState.currentDeck.filter(cc=>cc.symbol==='Triangle').length/total;
      displayScore=Math.round(baseForDisplay*(1+n)); scoreIsPassive=true;
    }
    const numHtml=scoreIsPassive?`<span class="passive-value">${displayScore}</span>`:`${baseForDisplay}`;
    let scoreHtml=`<span class="card-number">${dotsSpan}${numHtml}${bonusHtml}</span>`;
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
        extra=`（現在${GameState.gold}G → ビンゴ時に基礎点+${GameData.bourgeoisBonus(card)}）`;
      }
      l.push(`<div class="info-desc desc-enhance">【${card.enhance}】${GameData.ENHANCE_DESC[card.enhance]||''}${extra}</div>`);
    }
    if(card.trait)   l.push(`<div class="info-desc desc-trait">【${card.trait}】${GameData.TRAIT_DESC[card.trait]||''}</div>`);
    return l.length>0?l.join(''):'<div class="info-desc">効果なし</div>';
  },

  effectDotClasses(card){ if(!card) return []; const d=[]; if(card.jamming) d.push('dot-jamming'); if(card.enhance) d.push('dot-enhance'); if(card.trait) d.push('dot-trait'); return d; },

  // バツパッシブLv2（ミラー：全記号の最大倍率）・Lv3（×4）適用後のバツ基礎倍率。どちらも無効なら null
  crossEffectiveBaseMult(){
    const t=GameState.symbolPassiveTier.Cross||0; if(t<2) return null;
    let v=Math.max(...GameData.SYMBOLS.map(s=>GameData.BINGO_MULTIPLIER_BASE[s]));
    if(t>=3) v*=4;
    return v;
  },
  renderMultLegend(){
    const legend=document.createElement('div'); legend.className='mult-legend';
    // #バツ実効倍率 バツパッシブLv2（ミラー）・Lv3（×4）有効時は、変化後のバツ倍率を青色で表示する（元の値は小さく打ち消し線）
    const crossEff=this.crossEffectiveBaseMult();
    const rows=GameData.SYMBOLS.map(s=>{const base=GameData.BINGO_MULTIPLIER_BASE[s]+GameData.CORRECTION_MULTIPLIER;const quad=Math.round(GameData.quadMult(s)+GameData.CORRECTION_MULTIPLIER);const f=v=>v>=0?'+'+Math.round(v):String(Math.round(v));
      if(s==='Cross'&&crossEff!=null){const eb=crossEff+GameData.CORRECTION_MULTIPLIER, eq=crossEff*GameData.lineFactor('quad')+GameData.CORRECTION_MULTIPLIER;const cell=(o,e)=>`<td class="mult-eff-cell">${Math.round(o)!==Math.round(e)?`<s class="mult-orig">${f(o)}</s>`:''}<span class="mult-eff-blue">${f(e)}</span></td>`;return`<tr class="mult-row-cross-eff"><td class="sym-${s}">${GameData.SYMBOL_LABEL[s]}</td>${cell(base,eb)}${cell(quad,eq)}</tr>`;}
      return`<tr><td class="sym-${s}">${GameData.SYMBOL_LABEL[s]}</td><td>${f(base)}</td><td>${f(quad)}</td></tr>`;}).join('');
    legend.innerHTML=`<table><tr><th></th><th>基礎</th><th>4列</th></tr>${rows}</table>`;
    return legend;
  },

  // #18 盤面効果：タップすると盤面効果一覧を吹き出し表示する
  // #盤面効果刷新 「現在ラウンドで有効」「次ターンで有効」の2区分で、実際に有効な状態の効果だけを表示する
  collectActiveEffects(){
    const bs=GameData.BOARD_SIZE;
    const pos=(i)=>`${Math.floor(i/bs)+1}行${(i%bs)+1}列`;
    const posList=(arr)=>{ const a=[...arr].sort((x,y)=>x-y); return a.length>4?a.slice(0,4).map(pos).join('・')+`ほか${a.length-4}マス`:a.map(pos).join('・'); };
    const ic=(k)=>(typeof GameIcons!=='undefined'&&GameIcons.has&&GameIcons.has(k))?GIcon(k):'';
    // 盤面上の（分身でない）カードから、指定の強化効果・性質変化を持つマスを集める
    const cellsWith=(pred)=>{ const r=[]; this.board.forEach((cd,i)=>{ const c=cd&&cd.card; if(c&&!c._ghostOf&&pred(c)) r.push(i); }); return r; };
    const jamCells=(name)=>{ const r=[]; this.board.forEach((cd,i)=>{ if(cd&&cd.card&&cd.card.jamming===name) r.push(i); }); return r; };
    const round=[], next=[];
    // ---- 現在ラウンドで有効 ----
    if(this.roundCorrMultBonus) round.push({icon:ic('relic_jamming_boost'),name:'ジャミング増強②（ブレイク）',desc:`このラウンドの補正倍率+${Math.round(this.roundCorrMultBonus)}`});
    const blk=jamCells('ビンゴ阻害');
    if(blk.length>0){ const n=blk.length; round.push({icon:ic('jam_bingo_block'),name:'ジャミング：ビンゴ阻害',count:n,desc:`NPCのバツビンゴ：${n>=3?'不可':(n===2?'縦横不可':'縦不可')}`,where:posList(blk)}); }
    const lif=jamCells('延命');
    if(lif.length>0) round.push({icon:ic('jam_prolong'),name:'ジャミング：延命',count:lif.length,desc:'バツは4列ビンゴのみ有効',where:posList(lif)});
    const enh=[['肥大化','enh_bloat','ターン消費ごとに「基礎点/2×ビンゴ倍率」点を加算'],['巨大化','enh_giant','ターン消費ごとに基礎点+3'],['ハブ','enh_hub','2つ以上のビンゴに関わるマスは基礎点×1.5'],['連鎖','enh_chain',null]];
    enh.forEach(([nm,icon,desc])=>{
      const cs=cellsWith(c=>c.enhance===nm); if(cs.length===0) return;
      round.push({icon:ic(icon),name:'カード強化：'+nm,count:cs.length,desc:desc||`ビンゴ時カード基礎点+${30*cs.length}（連鎖${cs.length}枚）`,where:posList(cs)});
    });
    const allLink=GameState.relics.filter(r=>r.relicEnhance==='ren_all_link').length;
    if(allLink>0&&this.relicActive()) round.push({icon:ic('ren_all_link'),name:'レリック強化効果：オールリンク',count:allLink>1?allLink:0,desc:'配置するカードに常にジャミング「リンク」が付与される'});
    const cmd=cellsWith(c=>c.trait==='指令官');
    if(cmd.length>0){ const on=this.turnInRound>=7&&this.turnInRound<=10; round.push({icon:ic('trait_commander'),name:'性質変化：司令官',count:cmd.length,desc:`ターン7〜10のビンゴで補正倍率×1.2${on?'（発動中）':`（現在ターン${this.turnInRound}）`}`,where:posList(cmd)}); }
    if(this.isCheckExtendActive()){ const cnt=this.bingoSymbolCountThisRound||{}; const mx=Math.max(0,...Object.values(cnt)); round.push({icon:`<span class="sym-Check">${ic('passive_check')}</span>`,name:'オールブレイク（チェックパッシブ3）',desc:`どの記号でビンゴしてもラウンドが終了しない。同じ記号のビンゴが2回目で解除（最大${mx}/2）`}); }
    // ---- 次ターンで有効 ----
    const ef=this.effects||{};
    if(ef.stunNextNpc) next.push({icon:ic('jam_stun'),name:'ジャミング：スタン',desc:'次のNPC行動を封じる'});
    if(this.isBreakActive()) next.push({icon:ic('jam_break'),name:'ジャミング：ブレイク',desc:`ターン${ef.breakUntilTurn}まで、バツでビンゴしてもラウンドが終了しない`});
    if(ef.linkRestrict&&ef.linkRestrict.length>0) next.push({icon:ic('jam_link'),name:'ジャミング：リンク',desc:'次のNPCは指定マスにしか置けない',where:posList(ef.linkRestrict)});
    if(ef.lureRestrict) next.push({icon:ic('jam_guide'),name:'ジャミング：誘導',desc:'次のNPCは盤面中央にしか置けない'});
    if(ef.redirectBan&&ef.redirectBan.size>0) next.push({icon:ic('jam_redraw'),name:'ジャミング：引き直し',desc:'次のNPCは除去したマスに置けない',where:posList(ef.redirectBan)});
    if(ef.sealCell&&ef.sealCell.size>0) next.push({icon:ic('jam_seal'),name:'ジャミング：封印',desc:`次のNPCは封印マス（${ef.sealCell.size}マス）に置けない`});
    if(ef.confuseNextNpc) next.push({icon:ic('jam_confuse'),name:'ジャミング：混乱',desc:'次のNPCは最低点マスに置く'});
    if(this.extendActive) next.push({icon:ic('enh_extend'),name:'カード強化：エクステンド',desc:'次に自分がカードを置くまでビンゴ判定を行わない'});
    return {round,next};
  },
  renderEffectsPanel(){
    const panel=document.createElement('div'); panel.className='effects-panel-side effects-panel-compact'+(this.effectsBubbleOpen?' open':'');
    const {round,next}=this.collectActiveEffects();
    const total=round.length+next.length;
    const shortName=(e)=>e.name.replace(/^[^：]*：/,'')+(e.count>1?`×${e.count}`:'');
    const sumLine=(lbl,arr)=>arr.length?`<div class="eff-sum-line"><span class="eff-sum-lbl">${lbl}</span>${arr.map(shortName).join(' / ')}</div>`:'';
    panel.innerHTML=`<h3><span>盤面効果<span class="eff-count-badge${total?'':' zero'}">${total}</span></span><span class="eff-tap-hint">${this.effectsBubbleOpen?GIcon('btn_caret_up')+'閉じる':GIcon('btn_caret_down')+'タップで一覧'}</span></h3><div class="eff-summary">${total===0?'なし':sumLine('今R',round)+sumLine('次T',next)}</div>`;
    panel.addEventListener('click',(e)=>{ e.stopPropagation(); this.effectsBubbleOpen=!this.effectsBubbleOpen; this.renderAll(); });
    if(this.effectsBubbleOpen){
      const bubble=document.createElement('div'); bubble.className='effects-bubble';
      bubble.addEventListener('click',(e)=>{ e.stopPropagation(); this.effectsBubbleOpen=false; this.renderAll(); });
      const entry=(e)=>`<div class="effect-entry"><div class="eff-head">${e.icon?`<span class="eff-ic">${e.icon}</span>`:''}<span>${e.name}${e.count>1?`<span class="eff-cnt">×${e.count}</span>`:''}</span></div><div class="eff-desc">${e.desc}${e.where?`<div class="eff-where">対象：${e.where}</div>`:''}</div></div>`;
      const sec=(title,cls,arr)=>`<div class="eff-section ${cls}"><div class="eff-section-title">${title}<span class="eff-cnt">${arr.length}</span></div>${arr.length?arr.map(entry).join(''):'<div class="eff-empty">なし</div>'}</div>`;
      bubble.innerHTML='<div class="effects-bubble-title">盤面効果一覧</div>'+sec('現在ラウンドで有効','eff-sec-round',round)+sec('次ターンで有効','eff-sec-next',next);
      panel.appendChild(bubble);
    }
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
      if(isBlocked){cellEl.innerHTML=GIcon('cell_blocked',{title:'配置不可'});cellEl.style.color='#333';}
      else if(cd){
        if(cd.card){
          // #5 盤面のカードは手札と同じUIヘルパーで描画（塗りつぶし材質・サンダー絵文字・強化効果を統一）
          cellEl.classList.add('card');
          if(cd.card.trait) cellEl.classList.add(`trait-${cd.card.trait.replace(/[()]/g,'')}`);
          cellEl.innerHTML+=`${this.cardTagsHtml(cd.card)}${this.cardSymbolHtml(cd.card)}${this.cardScoreHtml(cd.card,GameState.gold,cd.baseScore)}`;
          this.attachHoverTip(cellEl,cd.card);
        }else{
          const sym=document.createElement('div'); sym.className='card-symbol-wrap sym-'+cd.symbol;
          sym.innerHTML=GameData.SYMBOL_LABEL[cd.symbol];
          cellEl.appendChild(sym);
          const st=document.createElement('div');st.className='cell-score';
          // #2/#3 NPCのバツはパッシブ・ボス効果による実効値を青字で表示
          const eff=this.isNpcCrossCell(cd)?this.npcCrossScore(cd):cd.baseScore;
          if(eff!==cd.baseScore){ st.classList.add('passive-value'); st.textContent=eff; } else st.textContent=cd.baseScore;
          cellEl.appendChild(st);
        }
        if(sc.includes(i)){
          cellEl.classList.add('scoring-cell');
          const isPopping=this.scoringAnim?.phase===0&&this.scoringAnim?.popCell===i;
          if(isPopping){
            cellEl.classList.add('scoring-pop');
            const badge=document.createElement('div');badge.className='score-badge';badge.textContent='+'+(this.isNpcCrossCell(cd)?this.npcCrossScore(cd):cd.baseScore);cellEl.appendChild(badge);
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
        const bubble=document.createElement('div');bubble.className='cell-bubble';bubble.textContent=`予測${GlobalFunctions.formatSigned(hints[i])}`;if(hints[i]<0) bubble.classList.add('negative');cellEl.appendChild(bubble);
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
    // #扇形 手札は弓形に展開する（配置用の回転・移動は .card-wrapper(.fan-slot)、選択の持ち上げは .card 側で行う：layoutHandFan）
    const row=document.createElement('div'); row.className='hand-row fan-line';

    // #11 保留札を左側に分離表示
    if(GameState.reserve.length>0){
      const reserveGroup=document.createElement('div'); reserveGroup.className='reserve-group';
      reserveGroup.innerHTML='<div class="reserve-label">保留</div>';
      const reserveRow=document.createElement('div'); reserveRow.className='reserve-row';
      GameState.reserve.forEach(card=>{
        const wrapper=document.createElement('div'); wrapper.className='card-wrapper fan-slot';
        const c=document.createElement('div'); c.className='card reserve-card'+(card.trait?` trait-${card.trait.replace(/[()]/g,'')}`:'');
        c.innerHTML=`${this.cardTagsHtml(card)}${this.cardSymbolHtml(card)}${this.cardScoreHtml(card,GameState.gold)}`;
        this.attachHoverTip(c,card);
        wrapper.appendChild(c); reserveRow.appendChild(wrapper);
      });
      reserveGroup.appendChild(reserveRow);
      row.appendChild(reserveGroup);
      const divider=document.createElement('div'); divider.className='hand-divider'; row.appendChild(divider);
    }

    for(const card of GameState.hand){
      const wrapper=document.createElement('div'); wrapper.className='card-wrapper fan-slot';
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
          if(this.selectedCardId!==card.id) this.handBubbleClosedFor=null; // #扇形 別カードを掴んだら吹き出しの非表示を解除
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
    const hide=()=>{ this._handBubbleTok=null; return null; }; // 吹き出しが消えたら自動フェードのタイマーもリセット
    if(this.rerollMode||!this.selectedCardId) return hide();
    if(this.handBubbleClosedFor===this.selectedCardId) return hide(); // #扇形 ×で吹き出しだけ閉じた（カードは選択中のまま）
    const card=GameState.hand.find(c=>c.id===this.selectedCardId); if(!card) return hide();
    if(!this._handBubbleTok||this._handBubbleTok.id!==card.id) this._handBubbleTok={id:card.id};
    // #8 選択したカードのすぐ上（入らなければ下）に吹き出しで表示する。位置は描画後に placeHandBubble() で決める
    return this.cardBubbleEl(card,()=>{ this.handBubbleClosedFor=this.selectedCardId; },null,this._handBubbleTok);
  },
  // #扇形 カード効果の吹き出し（×ボタン付き）。ゲームメイン手札・ショップの対象カード選択で共通。
  // 吹き出し本体は pointer-events:none（盤面への配置操作を妨げない）で、×ボタンだけ押せる。onClose の後に吹き出しを取り除く
  // autoTok：吹き出し1回分の表示を表すオブジェクト（再描画をまたいで同じものを渡す）。渡すと10秒後に1秒かけてフェードアウトして閉じる
  cardBubbleEl(card,onClose,extraCls,autoTok){
    const panel=document.createElement('div'); panel.className='card-tooltip-panel hand-card-bubble'+(extraCls?' '+extraCls:'');
    panel.innerHTML=`<div class="info-title sym-${card.symbol}">${GameData.SYMBOL_LABEL[card.symbol]} 基礎点${card.baseScore}</div>${this.cardInfoDescHtml(card)}`;
    const x=document.createElement('button'); x.type='button'; x.className='bubble-close-btn'; x.setAttribute('aria-label','説明を閉じる'); x.textContent='×';
    const stop=(e)=>e.stopPropagation();
    x.addEventListener('pointerdown',stop); x.addEventListener('touchstart',stop,{passive:true}); x.addEventListener('mousedown',stop);
    x.addEventListener('click',(e)=>{ e.stopPropagation(); e.preventDefault(); if(autoTok) clearTimeout(autoTok._timer); if(onClose) onClose(); panel.remove(); });
    panel.appendChild(x);
    if(autoTok){
      // #吹き出し自動消去 表示から10秒経ったら1秒でフェードアウトし、閉じた状態にする（再描画で作り直されても経過時間を引き継ぐ）
      const SHOW=10000, FADE=1000;
      if(!autoTok._t0) autoTok._t0=Date.now();
      const el=Date.now()-autoTok._t0;
      panel.style.animation = el<SHOW
        ? `scoringBubblePopPlain .18s ease, cardBubbleAutoFade ${FADE}ms linear ${SHOW-el}ms forwards`
        : `cardBubbleAutoFade ${FADE}ms linear ${-(el-SHOW)}ms forwards`;
      autoTok._panel=panel;
      clearTimeout(autoTok._timer);
      autoTok._timer=setTimeout(()=>{
        if(autoTok._panel!==panel||!panel.isConnected) return;
        if(onClose) onClose(); panel.remove();
      },Math.max(0,SHOW+FADE-el));
    }
    return panel;
  },
  // 吹き出しを対象カードの近く（上、入らなければ下）に置く。手札・ショップ共通
  placeCardBubble(panel,cardEl){
    if(!panel) return;
    if(!cardEl){ panel.style.visibility='hidden'; return; }
    panel.style.visibility='';
    const r=cardEl.getBoundingClientRect(); const vw=window.innerWidth, vh=window.innerHeight;
    const w=Math.min(300,vw-16); panel.style.width=w+'px';
    const h=panel.offsetHeight;
    let left=Math.max(8,Math.min(vw-w-8,r.left+r.width/2-w/2));
    let top=r.top-h-12, below=false;
    if(top<8){ top=r.bottom+12; below=true; }
    if(top+h>vh-8) top=Math.max(8,vh-h-8);
    panel.style.left=left+'px'; panel.style.top=top+'px';
    panel.classList.toggle('below',below);
    panel.style.setProperty('--tail-x',Math.max(14,Math.min(w-14,r.left+r.width/2-left))+'px');
  },
  placeHandBubble(){
    const panel=document.querySelector('.game-screen .hand-card-bubble'); if(!panel) return;
    this.placeCardBubble(panel,document.querySelector('.hand-row .card.selected'));
  },

  // ===== #扇形 手札の弓形（扇形）展開 =====
  // 1行（.fan-line）内の .fan-slot（カードの外側ラッパー）に、位置に応じた回転角（--fan-rot）と沈み込み（--fan-y）を与える。
  // 幅に収まらない時は隣り合うカードを重ねる（margin-left を負に）。transform は .fan-slot に、選択の持ち上げは内側の .card に掛けるので
  // .card.selected / .reroll-selected / .card-draw-in の transform や traitFx の scale と干渉しない。
  // opts={ width:利用可能幅(px), maxDeg:端の最大角度 }
  fanLayoutLine(line,opts={}){
    if(!line) return null;
    const slots=Array.from(line.querySelectorAll('.fan-slot'));
    const n=slots.length; if(!n) return null;
    slots.forEach(s=>{ s.style.marginLeft=''; s.style.setProperty('--fan-rot','0deg'); s.style.setProperty('--fan-y','0px'); s.classList.remove('fan-front'); });
    line.style.paddingBottom='';
    const cw=slots[0].offsetWidth, ch=slots[0].offsetHeight;
    const width=(opts.width!=null)?opts.width:line.clientWidth;
    if(!cw||!width) return null; // 非表示中などで実寸が取れない
    const maxDeg=(opts.maxDeg!=null)?opts.maxDeg:12;
    const A=n<=1?0:Math.min(maxDeg,3+1.5*(n-1));
    const rad=A*Math.PI/180;
    // 端のカードは下辺中央を軸に回るので、上の角が外側へはみ出す分を左右に確保する
    const pad=Math.ceil(ch*Math.sin(rad)+(cw/2)*(1-Math.cos(rad)))+2;
    const avail=Math.max(cw,width-2*pad);
    const natural=slots[n-1].getBoundingClientRect().right-slots[0].getBoundingClientRect().left;
    const linkable=slots.filter(s=>s.previousElementSibling&&s.previousElementSibling.classList.contains('fan-slot'));
    if(natural>avail&&linkable.length){
      const ov=Math.min(cw*0.78,(natural-avail)/linkable.length);
      linkable.forEach(s=>{ s.style.marginLeft=(-ov)+'px'; }); // flex の gap は残したまま負マージンで重ねる
    }
    const rects=slots.map(s=>s.getBoundingClientRect());
    const c0=rects[0].left+rects[0].width/2, c1=rects[n-1].left+rects[n-1].width/2;
    const mid=(c0+c1)/2, half=Math.max(1,(c1-c0)/2);
    const drop=n<=1?0:Math.round(ch*0.17*(A/12));
    slots.forEach((s,i)=>{
      const cx=rects[i].left+rects[i].width/2;
      const t=n<=1?0:Math.max(-1,Math.min(1,(cx-mid)/half));
      s.style.setProperty('--fan-rot',(t*A).toFixed(2)+'deg');
      s.style.setProperty('--fan-y',(t*t*drop).toFixed(1)+'px');
      // 選択中のカードは前面に
      if(s.querySelector('.card.selected,.card.reroll-selected,.pack-card-item.picked')) s.classList.add('fan-front');
    });
    line.style.paddingBottom=(drop+4)+'px';
    return {cw,ch,A,n};
  },
  layoutHandFan(){
    const row=this.container&&this.container.querySelector('.hand-row.fan-line'); if(!row) return;
    const area=row.parentElement;
    const res=this.fanLayoutLine(row,{width:(area&&area.clientWidth)||row.clientWidth,maxDeg:12});
    // 非表示中で実寸が取れなかった場合は次フレームで再計算
    if(!res&&!this._fanRetry){ this._fanRetry=true; requestAnimationFrame(()=>{ this._fanRetry=false; this.layoutHandFan(); this.placeHandBubble(); }); }
    if(!this._fanResizeBound){ this._fanResizeBound=true; window.addEventListener('resize',()=>{ this.layoutHandFan(); this.placeHandBubble(); }); }
  },

  renderRelicRow(){
    return this.renderRelicStrip({
      activeIdx:this.activeRelicId,
      onPick:(i)=>{ this.relicListOpen=false; this.onRelicClick(i); },
      listOpen:!!this.relicListOpen,
      onToggleList:()=>{ this.relicListOpen=!this.relicListOpen; if(this.relicListOpen){ this.activeRelicId=null; this.effectsBubbleOpen=false; } this.renderAll(); },
      scoringIds:this.scoringRelicIds||[], scoringValues:this.scoringRelicValues||{},
    });
  },

  // ===== レリック列（ゲームメイン・ショップ・マップ・レリックパックモーダルで共通） =====
  // 1行の固定高さで表示し、収まらない分は「+n」ボタンに省略する（何枚収まるかは描画後に実測：fitRelicStrips）。
  // 「+n／一覧」ボタンで盤面効果一覧と同じ作法の吹き出しに所持レリック一覧を出し、各行から効果詳細（renderRelicInfoPanel）を開く。
  // ctx={ activeIdx, onPick(i), listOpen, onToggleList(), scoringIds?, scoringValues?, emptyText? }
  // ===== レリックのグレード演出（ノーマル/レア/スーパーレア/レジェンド）：各所は .rg-* クラスを付けるだけ（装飾は css/relicui.css の擬似要素） =====
  relicGradeOf(relic){ return (typeof GameData!=='undefined'&&GameData.relicGrade)?GameData.relicGrade(relic):'normal'; },
  relicGradeClass(relic){ return 'rg-'+this.relicGradeOf(relic); },
  relicGradeName(relic){ const g=this.relicGradeOf(relic); return (GameData.RELIC_GRADES&&GameData.RELIC_GRADES[g]&&GameData.RELIC_GRADES[g].name)||g; },
  relicGradeBadgeHtml(relic){ const g=this.relicGradeOf(relic); return `<span class="rg-badge rg-badge-${g}">${this.relicGradeName(relic)}</span>`; },
  // グレード枠付きのレリックアイコン（効果詳細・報酬演出など、アイコン単体で出す所用）
  relicGradeIconHtml(relic,cls){ return `<span class="relic-ico relic-gfx-ico ${this.relicGradeClass(relic)}${cls?' '+cls:''}">${GameIcons.relic(relic)}</span>`; },
  relicEnhanceOf(relic){ return (relic&&relic.relicEnhance)?(GameData.RELIC_ENHANCE_POOL.find(r=>r.id===relic.relicEnhance)||null):null; },
  // レリック強化効果は名称の代わりにアイコンの小バッジで示す（アイコンが無い場合のみ名称）
  relicEnhanceBadgeHtml(relic,cls){
    const ren=this.relicEnhanceOf(relic); if(!ren) return '';
    if(GameIcons.has(ren.id)) return `<span class="relic-ren-badge${cls?' '+cls:''}" title="${ren.name}">${GameIcons.svg(ren.id)}</span>`;
    return `<span class="relic-enhance-tag">${ren.name}</span>`;
  },
  renderRelicStrip(ctx){
    const row=document.createElement('div'); row.className='relic-display-row relic-strip'+(ctx.listOpen?' list-open':'');
    const cards=document.createElement('div'); cards.className='relic-strip-cards';
    if(GameState.relics.length===0){ const empty=document.createElement('div'); empty.className='relic-empty'; empty.textContent=ctx.emptyText||'レリックなし'; cards.appendChild(empty); }
    const scIds=ctx.scoringIds||[], scVals=ctx.scoringValues||{};
    GameState.relics.forEach((relic,i)=>{
      const rc=document.createElement('div');
      const isScoring=scIds.includes(relic.id);
      rc.className='relic-card relic-chip '+this.relicGradeClass(relic)+(ctx.activeIdx===i?' active':'')+(isScoring?' bounce':'')+(relic.relicEnhance?' has-ren':'');
      rc.dataset.idx=i;
      // #3 点数計算に関わった時だけ、関わった数値を吹き出しでレリックの上に表示する
      const scoreVal=scVals[relic.id];
      if(isScoring){ rc.dataset.scoring='1'; if(scoreVal!=null) rc.dataset.sv=(scoreVal>=0?'+':'')+(Math.round(scoreVal*100)/100); }
      const bubbleHtml=(isScoring&&scoreVal!=null)?`<div class="scoring-value-bubble">${rc.dataset.sv}</div>`:'';
      // 列ではアイコンのみ（名称・効果はタップで出る吹き出しに表示）。所持枠2以上は小さな枠数ドットを下端に重ねる
      const slots=GameState.slotsForRelic(relic);
      rc.innerHTML=`${bubbleHtml}<span class="relic-ico">${GameIcons.relic(relic)}</span>${slots>1?`<span class="relic-size relic-chip-slots">${GameState.relicSizeDots(relic)}</span>`:''}${this.relicEnhanceBadgeHtml(relic)}`;
      rc.title=relic.name; rc.setAttribute('aria-label',relic.name); rc.setAttribute('role','button');
      rc.classList.add('relic-chip-ico-only');
      rc.addEventListener('click',(e)=>{ e.stopPropagation(); ctx.onPick(i); });
      cards.appendChild(rc);
    });
    row.appendChild(cards);
    const more=document.createElement('button'); more.type='button'; more.className='relic-strip-more'+(ctx.listOpen?' open':'');
    more.setAttribute('aria-label','所持レリック一覧');
    more.innerHTML=`<span class="rsm-top"><span class="rsm-count"></span><span class="rsm-label">${GIcon('btn_list')}一覧</span></span><span class="rsm-cap">${GameState.usedRelicSlots()}/${GameState.effectiveMaxRelics()}</span>`;
    more.addEventListener('click',(e)=>{ e.stopPropagation(); ctx.onToggleList(); });
    row.appendChild(more);
    if(ctx.listOpen){
      const bd=document.createElement('div'); bd.className='relic-list-backdrop';
      bd.addEventListener('click',(e)=>{ e.stopPropagation(); ctx.onToggleList(); });
      row.appendChild(bd);
      row.appendChild(this.renderRelicListBubble(ctx));
    }
    this.scheduleRelicFit();
    return row;
  },
  renderRelicListBubble(ctx){
    const bubble=document.createElement('div'); bubble.className='effects-bubble relic-list-bubble';
    bubble.addEventListener('click',(e)=>{ e.stopPropagation(); ctx.onToggleList(); });
    const title=document.createElement('div'); title.className='effects-bubble-title';
    title.innerHTML=`所持レリック一覧（${GameState.usedRelicSlots()}/${GameState.effectiveMaxRelics()}）<span class="rl-hint">タップで詳細・処理は左上から順</span>`;
    bubble.appendChild(title);
    if(GameState.relics.length===0){ const e=document.createElement('div'); e.className='eff-empty'; e.textContent='なし'; bubble.appendChild(e); }
    // 一覧もアイコンのみのグリッド（名称・効果はタップ後の吹き出しで表示）
    const grid=document.createElement('div'); grid.className='relic-list-grid';
    GameState.relics.forEach((relic,i)=>{
      const it=document.createElement('button'); it.type='button'; it.className='relic-list-tile '+this.relicGradeClass(relic)+(ctx.activeIdx===i?' active':'')+((ctx.scoringIds||[]).includes(relic.id)?' scoring':'');
      it.title=relic.name; it.setAttribute('aria-label',relic.name);
      const slots=GameState.slotsForRelic(relic);
      it.innerHTML=`<span class="rl-no">${i+1}</span><span class="relic-ico">${GameIcons.relic(relic)}</span>${slots>1?`<span class="relic-size relic-chip-slots">${GameState.relicSizeDots(relic)}</span>`:''}${this.relicEnhanceBadgeHtml(relic)}`;
      it.addEventListener('click',(e)=>{ e.stopPropagation(); ctx.onPick(i); });
      grid.appendChild(it);
    });
    if(GameState.relics.length>0) bubble.appendChild(grid);
    return bubble;
  },
  // 描画直後（同じタスク内・描画前）に、各レリック列が1行に収まる数を実測して残りを「+n」に畳む
  scheduleRelicFit(){
    if(this._relicFitQueued) return; this._relicFitQueued=true;
    const run=()=>{ this._relicFitQueued=false; this.fitRelicStrips(); };
    if(typeof queueMicrotask==='function') queueMicrotask(run); else Promise.resolve().then(run);
    if(!this._relicFitResize){ this._relicFitResize=true; window.addEventListener('resize',()=>this.fitRelicStrips()); }
  },
  fitRelicStrips(){
    document.querySelectorAll('.relic-strip').forEach(row=>{
      const box=row.querySelector('.relic-strip-cards'); const more=row.querySelector('.relic-strip-more'); if(!box||!more) return;
      const chips=Array.from(box.children).filter(c=>c.classList.contains('relic-chip'));
      chips.forEach(c=>c.classList.remove('rs-hidden'));
      const avail=box.clientWidth; if(!avail) return;
      const hidden=chips.filter(c=>c.offsetLeft+c.offsetWidth>avail+0.5);
      hidden.forEach(c=>c.classList.add('rs-hidden'));
      more.classList.toggle('has-more',hidden.length>0);
      more.querySelector('.rsm-count').textContent=hidden.length>0?`+${hidden.length}`:'';
      // 詳細表示中のレリックが畳まれている場合は「+n」側を選択色にする（並び＝処理順は変えない）
      more.classList.toggle('active-hidden',hidden.some(c=>c.classList.contains('active')));
      const old=more.querySelector('.scoring-value-bubble'); if(old) old.remove();
      // 計算中のレリックが省略されている場合は「+n」側をポップさせ、数値吹き出しも出す
      const sc=hidden.filter(c=>c.dataset.scoring==='1');
      more.classList.toggle('bounce',sc.length>0);
      if(sc.length>0){
        const b=document.createElement('div'); b.className='scoring-value-bubble rsm-bubble';
        b.innerHTML=sc.slice(0,2).map(c=>{ const r=GameState.relics[+c.dataset.idx]; return `<span class="rsm-b-item">${r?GameIcons.relic(r):''}${c.dataset.sv||''}</span>`; }).join('')+(sc.length>2?`<span class="rsm-b-item">+${sc.length-2}</span>`:'');
        more.appendChild(b);
      }
    });
  },

  // #5 レリックもパッシブと同様に吹き出し表示にする
  // #7 レリックの吹き出し表示（ゲームメイン・ショップ・マップ・レリックパックで共通）。ctx={idx,setIdx(i|null),redraw(),onSell(idx)|null,openList()?}
  renderRelicInfoPanel(ctx){
    ctx=ctx||{ idx:this.activeRelicId, setIdx:(i)=>{this.activeRelicId=i;}, redraw:()=>this.renderAll(), onSell:(i)=>this.sellRelic(i), openList:()=>{ this.activeRelicId=null; this.relicListOpen=true; this.renderAll(); } };
    const idx=ctx.idx;
    const relic=GameState.relics[idx]; if(!relic) return null;
    const backdrop=document.createElement('div'); backdrop.className='passive-info-backdrop';
    // 吹き出しの外をタップで閉じる。別のレリックアイコンの上なら、そのレリックの吹き出しに切り替える（同じアイコンなら閉じる）
    backdrop.addEventListener('click',(e)=>{
      let next=null;
      if(e.clientX!=null&&document.elementFromPoint){
        backdrop.style.display='none';
        const under=document.elementFromPoint(e.clientX,e.clientY);
        backdrop.style.display='';
        const chip=under&&under.closest&&under.closest('.relic-chip:not(.rs-hidden)');
        if(chip&&chip.dataset.idx!=null&&+chip.dataset.idx!==idx) next=+chip.dataset.idx;
      }
      ctx.setIdx(next); ctx.redraw();
    });
    const panel=document.createElement('div'); panel.className='info-panel relic-info-panel passive-info-panel relic-anchored-bubble';
    panel.addEventListener('click',(e)=>e.stopPropagation());
    const ren=this.relicEnhanceOf(relic);
    const sellPrice=GameData.relicSellPrice(relic);
    // #8 タップ時、レリックの現在の効果量を数値で表示する（レリック強化効果が優先）
    const liveInfo=GameData.getRelicLiveInfo(relic);
    // レリック強化効果：アイコン＋名称＋説明
    const renHtml=ren?`<div class="relic-ren-detail"><span class="relic-ren-detail-ico">${GameIcons.has(ren.id)?GameIcons.svg(ren.id):''}</span><div class="relic-ren-detail-text"><div class="relic-ren-detail-name">レリック強化：${ren.name}</div><div class="info-desc relic-enhance-desc">${ren.desc}</div></div></div>`:'';
    panel.className+=' rg-panel-'+this.relicGradeOf(relic);
    panel.innerHTML=`<div class="info-title">${this.relicGradeIconHtml(relic,'relic-ico-lg')}${relic.name}<span class="relic-size">${GameState.relicSizeDots(relic)}</span>${this.relicGradeBadgeHtml(relic)}<span class="relic-pos-tag">${idx+1}/${GameState.relics.length}</span></div><div class="info-desc">${relic.desc}</div>${renHtml}${liveInfo?`<div class="info-desc relic-live-value">${liveInfo}</div>`:''}<div class="relic-reorder-row"><button class="relic-move-btn" ${idx<=0?'disabled':''}>${GIcon('btn_left',{cls:'gi-gap'})}左へ</button><button class="relic-move-btn" ${idx>=GameState.relics.length-1?'disabled':''}>右へ${GIcon('btn_right',{cls:'gi-gap-l'})}</button>${ctx.openList?`<button class="relic-move-btn relic-back-list">${GIcon('btn_list',{cls:'gi-gap'})}一覧</button>`:''}</div>${ctx.onSell?`<button class="sell-relic-btn">売却（${sellPrice}G）</button>`:''}`;
    const moveBtns=panel.querySelectorAll('.relic-move-btn');
    moveBtns[0].addEventListener('click',()=>{ if(GameState.moveRelic(idx,-1)){ ctx.setIdx(idx-1); ctx.redraw(); } });
    moveBtns[1].addEventListener('click',()=>{ if(GameState.moveRelic(idx,1)){ ctx.setIdx(idx+1); ctx.redraw(); } });
    if(ctx.openList) panel.querySelector('.relic-back-list').addEventListener('click',()=>ctx.openList());
    if(ctx.onSell) panel.querySelector('.sell-relic-btn').addEventListener('click',()=>ctx.onSell(idx));
    panel.style.visibility='hidden'; // 配置が決まるまで隠す（placeRelicBubbles で表示）
    backdrop.appendChild(panel);
    this.scheduleRelicBubblePlace();
    return backdrop;
  },
  // 効果詳細の吹き出しを、タップしたレリックアイコン（畳まれている場合は「+n」ボタン）の近くに配置する。
  // 画面端ではみ出さないよう左右をクランプし、しっぽはアイコンの中心を指す。下に入らなければ上に出す。
  scheduleRelicBubblePlace(){
    const run=()=>this.placeRelicBubbles();
    // fitRelicStrips（マイクロタスク）の後に実行
    if(typeof queueMicrotask==='function') queueMicrotask(()=>queueMicrotask(run)); else Promise.resolve().then(()=>Promise.resolve().then(run));
    if(!this._relicBubbleBound){
      this._relicBubbleBound=true;
      window.addEventListener('resize',()=>this.placeRelicBubbles());
      document.addEventListener('scroll',()=>this.placeRelicBubbles(),true);
    }
  },
  placeRelicBubbles(){
    document.querySelectorAll('.relic-anchored-bubble').forEach(panel=>{
      // 同じ親（またはモーダル）内のレリック列から、選択中アイコンを探す
      let anchor=null;
      const scope=panel.closest('.pack-modal-overlay');
      const strips=Array.from(document.querySelectorAll('.relic-strip')).filter(s=>s.closest('.pack-modal-overlay')===scope);
      for(const s of strips){
        const a=s.querySelector('.relic-chip.active:not(.rs-hidden)')||s.querySelector('.relic-strip-more.active-hidden');
        if(a){ anchor=a; break; }
      }
      const vw=document.documentElement.clientWidth||window.innerWidth, vh=window.innerHeight;
      const m=8, gap=10;
      const w=Math.min(320,vw-m*2);
      panel.style.width=w+'px'; panel.style.maxHeight='';
      if(!anchor){ panel.style.left=Math.round((vw-w)/2)+'px'; panel.style.top='14vh'; panel.classList.remove('rb-above'); panel.style.setProperty('--tail-x',(w/2)+'px'); panel.style.visibility=''; return; }
      const r=anchor.getBoundingClientRect();
      const cx=r.left+r.width/2;
      const left=Math.max(m,Math.min(vw-w-m,cx-w/2));
      const h=panel.offsetHeight;
      let top=r.bottom+gap, above=false;
      if(top+h>vh-m && r.top-gap-h>=m){ top=r.top-gap-h; above=true; }
      else if(top+h>vh-m){ panel.style.maxHeight=Math.max(120,vh-top-m)+'px'; }
      panel.style.left=Math.round(left)+'px'; panel.style.top=Math.round(top)+'px';
      panel.classList.toggle('rb-above',above);
      panel.style.setProperty('--tail-x',Math.round(Math.max(16,Math.min(w-16,cx-left)))+'px');
      panel.style.visibility='';
    });
  },

  renderControls(){
    const controls=document.createElement('div'); controls.className='controls-row';
    if(this.rerollMode){
      const okBtn=document.createElement('button');okBtn.textContent=`確定（${this.rerollSelected.size}枚）`;okBtn.disabled=this.rerollSelected.size===0;okBtn.addEventListener('click',()=>this.confirmReroll());controls.appendChild(okBtn);
      const cancelBtn=document.createElement('button');cancelBtn.textContent='キャンセル';cancelBtn.addEventListener('click',()=>this.cancelReroll());controls.appendChild(cancelBtn);
    }else{
      const rBtn=document.createElement('button');rBtn.innerHTML=`${GIcon('btn_reroll',{cls:'gi-btn'})}(${GameState.rerollCount})`;rBtn.title='リロール';rBtn.disabled=GameState.rerollCount<=0||this.currentSide!=='player'||this.hasBossEffect('reroll_limit');rBtn.addEventListener('click',()=>this.enterRerollMode());controls.appendChild(rBtn);
      // #7 ターンスキップボタン
      const skipBtn=document.createElement('button');skipBtn.innerHTML=GIcon('btn_skip',{cls:'gi-btn gi-gap'})+'スキップ';skipBtn.disabled=this.currentSide!=='player';skipBtn.addEventListener('click',()=>this.manualSkipTurn());controls.appendChild(skipBtn);
    }
    // #4 デッキ/山札/捨て札/廃棄札確認ボタン（上画面に配置。GameIcons のSVGアイコン表記）
    const deckBtn=document.createElement('button'); deckBtn.innerHTML=`${GIcon('btn_deck',{cls:'gi-btn'})}(${GameState.currentDeck.length})`; deckBtn.title='デッキ'; deckBtn.addEventListener('click',()=>this.showDeckModal('deck')); controls.appendChild(deckBtn);
    const drawBtn=document.createElement('button'); drawBtn.innerHTML=`${GIcon('btn_drawpile',{cls:'gi-btn'})}(${GameState.drawPile.length})`; drawBtn.title='山札'; drawBtn.addEventListener('click',()=>this.showDeckModal('drawpile')); controls.appendChild(drawBtn);
    const discBtn=document.createElement('button'); discBtn.innerHTML=`${GIcon('btn_discard',{cls:'gi-btn'})}(${GameState.discardPile.length})`; discBtn.title='捨て札'; discBtn.addEventListener('click',()=>this.showDeckModal('discard')); controls.appendChild(discBtn);
    if(GameState.discardedPile.length>0){
      const exlBtn=document.createElement('button'); exlBtn.innerHTML=`${GIcon('btn_trash',{cls:'gi-btn'})}(${GameState.discardedPile.length})`; exlBtn.title='廃棄札'; exlBtn.addEventListener('click',()=>this.showDeckModal('discarded')); controls.appendChild(exlBtn);
    }
    // #1 マップ一覧（確認のみ、遷移不可）
    const mapBtn=document.createElement('button'); mapBtn.innerHTML=GIcon('btn_map',{cls:'gi-btn',title:'マップ'}); mapBtn.setAttribute('aria-label','マップ'); mapBtn.addEventListener('click',()=>this.showDeckModal('map')); controls.appendChild(mapBtn);
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
        <span>${GIconSym('Circle')}${bySym.Circle}</span>
        <span>${GIconSym('Triangle')}${bySym.Triangle}</span>
        <span>${GIconSym('Square')}${bySym.Square}</span>
        <span>${GIconSym('Cross')}${bySym.Cross}</span>
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
            const tmp=swapSelected.enhance; const tmp2=card.enhance; GameData.setEnhance(swapSelected,tmp2); GameData.setEnhance(card,tmp); // #5 入れ替え時も即時加算を付け替える
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
    const win=this.resultState==='win'; const goShop=win&&GameState.currentFloor<10; // #4 ボスクリア時もショップへ（第10階層の最終決戦クリア時はショップ不要）
    const r=GameState.lastReward;
    const gr=(win&&r?.breakdown)?`<div class="gold-reveal-popup"><div class="gr-label">獲得ゴールド</div><div class="gr-total">+${r.gold}G</div><div class="gr-breakdown">${GameMainScene.clearRewardBreakdownText(r.breakdown)}</div>${r.extra?`<div class="gr-breakdown">追加報酬：${r.extra}</div>`:''}</div>`:'';
    // #3 ゲームメイン画面のデバッグ用ログを報酬画面にも表示
    // #11 ステージクリア時のデバッグログ表示（復活用にコメントアウト）
    //     const debugHtml=(r?.debugLog&&r.debugLog.length>0)?`<div class="result-debug-log"><div class="result-debug-title">デバッグログ</div>${r.debugLog.map(l=>`<div class="result-debug-line">${l}</div>`).join('')}</div>`:'';
    const debugHtml='';
    const box=document.createElement('div'); box.className='result-box';
    // #1 ボスクリア時：ショップへ移動の代わりに「パッシブ報酬を受け取る」をタップさせる
    const hasPassiveChoice = win && this.stage.key==='boss' && this.pendingPassiveChoice && this.pendingPassiveChoice.length>0;
    // 敗北：残機があれば「一時撤退」（ミニショップへ）、残機0なら GAME OVER（タイトルへ）
    const retreat = !win ? this.retreatInfo : null;
    const gameOver = !win && !retreat;
    const btnLabel = hasPassiveChoice ? 'パッシブ報酬を受け取る' : (win ? (goShop?'ショップへ':'マップに戻る') : (retreat?'ミニショップで体制を整える':'タイトルへ'));
    const goLose=()=>{
      if(typeof StageFX!=='undefined') StageFX.clearAll();
      if(retreat){ ShopScene.miniShop=true; App.showShop(); }
      else { App.showTitle(); }
    };
    // #演出 報酬の受け取り演出（STAGE CLEAR→内訳→金貨が所持Gへ→追加報酬）。body 直下の永続要素で描画するため、
    //   renderAll() で作り直されても巻き戻らない。ここではプレースホルダーだけを返す
    if(typeof StageFX!=='undefined'){
      StageFX.showResult({
        win, reward:(win?r:null), scoreText:`最終点数：${GlobalFunctions.formatScore(GameState.currentScore)} / ${GlobalFunctions.formatScore(GameState.targetScore)}`,
        goldBefore:(this._rewardGoldBefore!=null?this._rewardGoldBefore:GameState.gold-((r&&r.gold)||0)), goldAfter:GameState.gold,
        formulaText:(win&&r?.breakdown)?GameMainScene.clearRewardBreakdownText(r.breakdown):'', debugHtml, btnLabel,
        // #演出 クリア時に発動した効果（倍率・カード変化）と、G獲得レリック／レリック強化「G獲得」の内訳演出
        relicFx:win?(this._clearFx||[]):[],
        goldFx:(win&&r?.breakdown)?{
          relic:r.breakdown.relicBonus>0?{amount:r.breakdown.relicBonus, count:GameState.relicCountOf('gold_boost'), iconHtml:GameIcons.relic('gold_boost'), name:'G獲得'}:null,
          ren:r.breakdown.relicEnhanceBonus>0?{amount:r.breakdown.relicEnhanceBonus, count:r.breakdown.relicEnhanceBonus, iconHtml:GameIcons.svg('ren_gold'), name:'G獲得（レリック強化）'}:null,
        }:null,
        retreat:retreat?{ gold:retreat.gold, num:retreat.num, ratio:retreat.ratio, livesBefore:retreat.livesBefore, livesLeft:retreat.livesLeft, maxLives:GameState.MAX_LIVES, floor:retreat.floor, stageName:retreat.stageName }:null,
        gameOver,
        onNext:()=>{
          if(!win){ goLose(); return; }
          if(hasPassiveChoice){ this.passiveModalOpen=true; this.renderAll(); }
          else{ StageFX.clearAll(); if(goShop){ App.showShop(); } else { App.showMapSelect(); } }
        },
      });
      const ph=document.createElement('div'); ph.className='stfx-result-placeholder'; ph.hidden=true; return ph;
    }
    const retreatHtml=retreat?`<div class="gold-reveal-popup"><div class="gr-label">撤退G</div><div class="gr-total">+${retreat.gold}G</div><div class="gr-breakdown">残機 ${retreat.livesLeft} / ${GameState.MAX_LIVES}</div></div>`:'';
    box.innerHTML=`<div class="result-title ${win?'win':'lose'}">${win?'STAGE CLEAR':(retreat?'一時撤退':'GAME OVER')}</div><div>最終点数：${GlobalFunctions.formatScore(GameState.currentScore)} / ${GlobalFunctions.formatScore(GameState.targetScore)}</div>${gr}${retreatHtml}${debugHtml}<button id="btn-next">${btnLabel}</button>`;
    el.appendChild(box);
    setTimeout(()=>{el.querySelector('#btn-next').addEventListener('click',()=>{
      if(!win){ goLose(); return; }
      if(hasPassiveChoice){ this.passiveModalOpen=true; this.renderAll(); }
      else if(goShop){ App.showShop(); } else { App.showMapSelect(); }
    });});
    return el;
  },

  // #A ボスクリア時：記号パッシブ選択モーダル（ゲームメイン画面上にオーバーレイ表示）
  renderPassiveChoiceModal(){
    // #演出 神々しい降臨演出（光の柱・降る光の粒・後光）。body 直下の永続要素で描画し、同じ候補なら作り直さない
    if(typeof StageFX!=='undefined'){
      StageFX.showPassiveChoice({
        picks:this.pendingPassiveChoice, remaining:this.passiveRewardsRemaining||1,
        items:this.pendingPassiveChoice.map(cand=>{ const p=GameData.SYMBOL_PASSIVES[cand.symbol][cand.nextTier]; let live=''; try{ live=p.live(); }catch(e){} return {sym:cand.symbol,tier:cand.nextTier,symHtml:GameData.SYMBOL_LABEL[cand.symbol],name:p.name,desc:p.desc,live}; }),
        onChoose:(idx)=>this.choosePassive(idx),
        onSkip:()=>this.skipPassiveChoice(),
      });
      const ph=document.createElement('div'); ph.className='stfx-passive-placeholder'; ph.hidden=true; return ph;
    }
    const el=document.createElement('div'); el.className='pack-modal-overlay passive-choice-overlay';
    const box=document.createElement('div'); box.className='pack-modal';
    box.innerHTML=`<h3>記号パッシブを1つ選んでください${(this.passiveRewardsRemaining||1)>1?`（魔力ステージD：あと${this.passiveRewardsRemaining}回）`:''}</h3>`;
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
    // #14 スキップも表示する
    const skipBtn=document.createElement('button'); skipBtn.className='passive-skip-btn'; skipBtn.textContent='スキップ';
    skipBtn.addEventListener('click',()=>this.skipPassiveChoice());
    box.appendChild(skipBtn);
    el.appendChild(box);
    return el;
  },
  // #1 魔力ステージD：パッシブ報酬が残っていれば続けて次の3択を出す
  nextPassiveReward(){
    if(this.passiveChoiceContext==='boss'&&(this.passiveRewardsRemaining||1)>1){
      this.passiveRewardsRemaining--;
      const picks=this.generatePassiveChoicePicks();
      if(picks&&picks.length>0){ this.pendingPassiveChoice=picks; this.passiveModalOpen=true; this.addLog(`魔力ステージD：パッシブ報酬 残り${this.passiveRewardsRemaining}つ`); this.renderAll(); return true; }
    }
    this.passiveRewardsRemaining=0;
    return false;
  },
  skipPassiveChoice(){
    this.addLog('記号パッシブ選択：スキップした');
    this.pendingPassiveChoice=null;
    this.passiveModalOpen=false;
    if(this.nextPassiveReward()) return;
    if(this.passiveChoiceContext==='start'){ this.passiveChoiceContext=null; App.saveGame(); this.renderAll(); return; }
    this.passiveChoiceContext=null;
    App.saveGame();
    if(typeof StageFX!=='undefined') StageFX.clearAll(); // #演出 報酬・パッシブ演出を片付けてからショップへ
    App.showShop();
  },
  choosePassive(idx){
    const cand=this.pendingPassiveChoice[idx]; if(!cand) return;
    GameState.symbolPassiveTier[cand.symbol]=cand.nextTier;
    this.addLog(`記号パッシブ習得：${GIconSym(cand.symbol)}${GameData.SYMBOL_PASSIVE_NAMES[cand.symbol]}Lv${cand.nextTier}`);
    this.pendingPassiveChoice=null;
    this.passiveModalOpen=false;
    if(this.nextPassiveReward()) return;
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
    if(typeof StageFX!=='undefined') StageFX.clearAll(); // #演出
    App.showShop();
  },

  // #A 常時表示の記号パッシブバー（タップで詳細確認）
  // #16 ショップ・マップ画面でも共通利用できるよう、再描画処理を引数で受け取る
  renderPassiveBar(rerender){
    const redraw=rerender||(()=>this.renderAll());
    const row=document.createElement('div'); row.className='passive-bar';
    // #新規 セブンパッシブは通常枠ではなく、習得済みの場合のみ常時バーに表示する
    const barSymbols=(GameState.symbolPassiveTier.Seven>0)?[...GameData.PASSIVE_SYMBOLS,'Seven']:GameData.PASSIVE_SYMBOLS;
    barSymbols.forEach(sym=>{
      const tier=GameState.symbolPassiveTier[sym]||0;
      // #3 点数計算に関わった時だけポップし、その時の数値を吹き出しで上に表示する
      const isScoring=(this.scoringPassiveIds||[]).includes(sym);
      const btn=document.createElement('div'); btn.className=`passive-icon sym-${sym}${tier>0?' active':''}${isScoring?' bounce':''}`;
      const scoreVal=this.scoringPassiveValues?.[sym];
      const bubbleHtml=(isScoring&&scoreVal!=null)?`<div class="scoring-value-bubble">${scoreVal>=0?'+':''}${Math.round(scoreVal*100)/100}</div>`:'';
      btn.innerHTML=`${bubbleHtml}<span class="passive-sym">${GameData.SYMBOL_LABEL[sym]}</span><span class="passive-tier">Lv${tier}</span>`;
      btn.addEventListener('click',()=>{ this.activePassiveInfo=(this.activePassiveInfo===sym)?null:sym; redraw(); });
      row.appendChild(btn);
    });
    // #1 パッシブ「魔力」：付与されている時のみ表示（レベル制ではないため所持ステージ数を表示）
    if(GameState.hasAnyMana&&GameState.hasAnyMana()){
      const n=['A','B','C','D','E'].filter(s=>GameState.hasMana(s)).length;
      const btn=document.createElement('div'); btn.className='passive-icon passive-mana active';
      btn.innerHTML=`<span class="passive-sym">${GIcon('passive_mana')}</span><span class="passive-tier">${['A','B','C','D','E'].filter(s=>GameState.hasMana(s)).join('')}</span>`;
      btn.title=`魔力（${n}ステージ）`;
      btn.addEventListener('click',()=>{ this.activePassiveInfo=(this.activePassiveInfo==='Mana')?null:'Mana'; redraw(); });
      row.appendChild(btn);
    }
    return row;
  },
  // #1 魔力の詳細（所持しているステージの効果）
  renderManaInfoPanel(redraw){
    const backdrop=document.createElement('div'); backdrop.className='passive-info-backdrop';
    backdrop.addEventListener('click',()=>{ this.activePassiveInfo=null; redraw(); });
    const panel=document.createElement('div'); panel.className='info-panel passive-info-panel';
    panel.addEventListener('click',(e)=>e.stopPropagation());
    let html='<div class="info-title passive-mana-title">'+GIcon('passive_mana',{cls:'gi-gap'})+'魔力（魔神イベントで付与）</div>';
    ['A','B','C','D','E'].forEach(st=>{
      const got=GameState.hasMana(st); const d=GameData.MANA_STAGES[st];
      let extra='';
      if(st==='C'&&got) extra=`<br><span style="color:var(--gold)">レリック所持数上限+${GameState.mana.C}</span>`;
      if(st==='D'&&got) extra=`<br><span style="color:var(--gold)">対象階層：第${GameState.mana.D.join('・')}階層</span>`;
      html+=`<div class="passive-detail-row${got?' got':''}"><b>${d.name}</b>${got?'（付与済）':''}<br>${d.desc}${extra}</div>`;
    });
    html+='<div class="passive-detail-row got" style="font-size:10px;">ボス効果「パッシブ効果無効」の影響を受けない</div>';
    panel.innerHTML=html; backdrop.appendChild(panel); return backdrop;
  },
  renderPassiveInfoPanel(rerender){
    const redraw=rerender||(()=>this.renderAll());
    const sym=this.activePassiveInfo; if(!sym) return null;
    if(sym==='Mana') return this.renderManaInfoPanel(redraw);
    const tier=GameState.symbolPassiveTier[sym]||0;
    // #1 どこをタップしても閉じるよう全画面の透明バックドロップを敷く
    const backdrop=document.createElement('div'); backdrop.className='passive-info-backdrop';
    backdrop.addEventListener('click',()=>{ this.activePassiveInfo=null; redraw(); });
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
