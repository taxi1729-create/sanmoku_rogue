const GameMainScene = {
  container:null, stage:null,
  board:[], windows:[], quadSiblings:{}, scoredWindowKeys:new Set(),
  prevRoundBingoSymbol:null, prevRoundScore:0, chargeActive:false,
  turnInRound:1, currentSide:'player', selectedCardId:null, boardInfoCell:null,
  logs:[], resultState:null, scoringAnim:null,
  rerollMode:false, rerollSelected:new Set(),
  effects:{ stunNextNpc:false, confuseNextNpc:false, breakTurns:0, linkRestrict:null, redirectBan:null, sealCell:null, lureRestrict:false },
  bossEffect:null, blockedCells:new Set(), bossBlackedOut:false,
  lastNpcCell:null, turnsBonus_bossRestore:0, activeRelicId:null, scoringRelicIds:[],
  expandPending:null, paintPending:null,
  unifyRestoreData:null, // #2 統一ボス効果の復元用

  sleep(ms){ return new Promise(res=>setTimeout(res,ms)); },

  render(container,stage){
    this.container=container; this.stage=stage;
    this.board=new Array(GameData.BOARD_SIZE*GameData.BOARD_SIZE).fill(null);
    this.windows=this.buildWindows(GameData.BOARD_SIZE);
    this.logs=[]; this.resultState=null; this.boardInfoCell=null; this.scoringAnim=null;
    this.rerollMode=false; this.rerollSelected=new Set();
    this.prevRoundBingoSymbol=null; this.prevRoundScore=0; this.chargeActive=false;
    this.bossEffect=null; this.blockedCells=new Set(); this.bossBlackedOut=false;
    this.lastNpcCell=null; this.activeRelicId=null; this.scoringRelicIds=[];
    this.turnsBonus_bossRestore=0; this.expandPending=null; this.paintPending=null;
    this.unifyRestoreData=null;
    this.effects={stunNextNpc:false,confuseNextNpc:false,breakTurns:0,linkRestrict:null,redirectBan:null,sealCell:null,lureRestrict:false};
    GameState.initStage(stage);
    this.applyRelicInitEffects();
    this.applyBossEffect();
    this.startRound();
  },

  cellIndex(r,c){ return r*GameData.BOARD_SIZE+c; },

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
      if(line.length===4){
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
    if(GameState.hasRelic('base_boost')) GameData.FINAL_ADD+=2000;
    if(GameState.hasRelic('paint')) this.applyPaintRelic();
    GameState.relics.forEach(r=>{
      if(r.relicEnhance==='ren_cross') GameData.BINGO_MULTIPLIER_BASE['Cross']*=5;
    });
  },

  applyPaintRelic(){
    GameState.currentDeck.forEach(c=>{
      if(!c.trait) c.trait='塗りつぶし(レリック)';
    });
  },

  removePaintRelic(){
    GameState.currentDeck.forEach(c=>{ if(c.trait==='塗りつぶし(レリック)') c.trait=null; });
    GameState.hand.forEach(c=>{ if(c.trait==='塗りつぶし(レリック)') c.trait=null; });
  },

  applyBossEffect(){
    if(this.stage.key!=='boss') return;
    // #2 マップ選択時に確定済みのボス効果を使用
    const effect = GameState.pendingBossEffect || (GameData.BOSS_EFFECT_POOL.length > 0 ? GlobalFunctions.randChoice(GameData.BOSS_EFFECT_POOL) : null);
    if(!effect) return;
    this.bossEffect = effect;
    GameState.pendingBossEffect = null; // 使用済みにリセット（次の周回用）
    this.addLog(`ボス効果：「${this.bossEffect.name}」${this.bossEffect.desc}`);
    switch(this.bossEffect.id){
      case 'cross5000': GameState.currentDeck.forEach(c=>{if(c.symbol==='Cross') c.baseScore=5000;}); break;
      case 'block_cells': GlobalFunctions.shuffle(Array.from({length:16},(_,i)=>i)).slice(0,4).forEach(i=>this.blockedCells.add(i)); break;
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
      case 'cross_corner': [0,3,12,15].forEach(i=>{this.board[i]={symbol:'Cross',baseScore:10,owner:'npc',card:null};}); break;
      case 'turn_limit': this.turnsBonus_bossRestore=GameState.turnsBonus; GameState.turnsBonus=10-GameData.TURNS_PER_ROUND; break;
      case 'reroll_limit': GameState.rerollCount=0; break;
      case 'hand_limit': GameState.handSizeBonus=Math.min(-1,GameState.handSizeBonus-1); break;
      default: break;
    }
  },

  startRound(){
    if(this.bossEffect?.id!=='cross_corner') this.board=new Array(GameData.BOARD_SIZE*GameData.BOARD_SIZE).fill(null);
    this.scoredWindowKeys=new Set(); this.turnInRound=1;
    const forceFirst=GameState.relics.some(r=>r.relicEnhance==='ren_first');
    this.currentSide=forceFirst?'player':((GameState.round%2===1)?'player':'npc');
    this.selectedCardId=null; this.boardInfoCell=null; this.rerollMode=false;
    this.rerollSelected=new Set(); this.activeRelicId=null;
    this.expandPending=null; this.paintPending=null;
    this.effects.linkRestrict=null; this.effects.stunNextNpc=false;
    this.effects.confuseNextNpc=false; this.effects.redirectBan=null;
    this.effects.sealCell=null; this.effects.lureRestrict=false;
    if(GameState.hasRelic('charge')&&GameState.round>1&&this.prevRoundScore===GameState.currentScore){
      this.chargeActive=true; this.addLog('チャージ発動：補正基礎点+100');
    }
    if(GameState.reserve.length>0){ GameState.hand.push(...GameState.reserve); GameState.reserve=[]; }
    this.drawToHandSize();
    this.addLog(`--- ラウンド ${GameState.round} 開始（先手：${this.currentSide==='player'?'プレイヤー':'NPC'}） ---`);
    this.renderAll();
    if(this.currentSide==='npc') this.scheduleAIMove();
  },

  endRound(){
    this.prevRoundScore=GameState.currentScore;
    for(const cell of this.board){
      if(!cell?.card) continue;
      const c=cell.card;
      if(c.trait==='保留'){
        GameState.reserve.push(c);
        // 保留カードは捨て札には入れない（次ラウンド手札へ戻る）
        continue;
      }
      if(this.bossEffect?.id==='discard_used') GameState.discardedPile.push(c);
      else GameState.discardPile.push(c);
    }
    GameState.hand.forEach(c=>{
      if(c.trait==='ディスカード') GameState.gold+=2;
      GameState.discardPile.push(c);
    });
    GameState.hand=[];
    if(GameState.relics.some(r=>r.relicEnhance==='ren_draw')) this.drawOne();
    this.chargeActive=false;
    if(GameState.currentScore>=GameState.targetScore){ this.finishStage('win'); return; }
    if(GameState.round>=GameState.effectiveMaxRounds()){ this.finishStage('lose'); return; }
    GameState.round++;
    this.startRound();
  },

  finishStage(result){
    // #2 統一ボス効果の倍率を元に戻す
    if(this.bossEffect?.id==='turn_limit') GameState.turnsBonus=this.turnsBonus_bossRestore;
    if(this.bossEffect?.id==='unify'&&this.unifyRestoreData){
      GameData.SYMBOLS.forEach(s=>{ GameData.BINGO_MULTIPLIER_BASE[s]=this.unifyRestoreData[s]; });
      this.unifyRestoreData=null;
    }
    this.resultState=result;
    if(result==='win'){
      if(this.stage&&!GameState.clearedStages.includes(this.stage.key)) GameState.clearedStages.push(this.stage.key);
      // #12 最高クリア記録更新
      const stageOrder=['common','high','boss'];
      const stageIdx=stageOrder.indexOf(this.stage.key);
      const floorScore=GameState.currentFloor*3+stageIdx;
      const prevScore=(GameState.maxClearedFloor||0)*3+(stageOrder.indexOf(GameState.maxClearedStage||''));
      if(floorScore>prevScore){ GameState.maxClearedFloor=GameState.currentFloor; GameState.maxClearedStage=this.stage.name; }
      const rd=this.calcClearReward();
      GameState.gold+=rd.total;
      GameState.lastReward={type:'clear',stageName:this.stage.name,gold:rd.total,breakdown:rd};
      this.addLog(`クリア報酬：G+${rd.total}`);
      // #8 クリア時セーブ
      App.saveGame();
    }
    this.renderAll();
  },

  // #30 報酬計算式：6 + 残りラウンド + 残りリロール + レリック補正 + カード補正
  calcClearReward(){
    const base=6;
    const roundBonus=Math.max(0,GameState.effectiveMaxRounds()-GameState.round);
    const rerollBonus=GameState.rerollCount;
    let relicBonus=0;
    if(GameState.hasRelic('gold_boost')) relicBonus+=3;
    GameState.relics.forEach(r=>{ if(r.relicEnhance==='ren_gold') relicBonus+=1; });
    const cardBonus=GameState.currentDeck.filter(c=>c.trait==='ディスカード').length;
    const total=base+roundBonus+rerollBonus+relicBonus+cardBonus;
    return {base,roundBonus,rerollBonus,relicBonus,cardBonus,total};
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
    // #24 竜頭蛇尾：最初の手札では-100しない
    if(card.trait==='竜頭蛇尾'){
      if(card.dragonUsed) card.baseScore=Math.max(0,card.baseScore-100);
      else card.dragonUsed=true;
    }
    GameState.hand.push(card);
  },

  enterRerollMode(){ if(this.currentSide!=='player'||this.resultState||GameState.rerollCount<=0) return; this.rerollMode=true; this.rerollSelected=new Set(); this.selectedCardId=null; this.renderAll(); },
  cancelReroll(){ this.rerollMode=false; this.rerollSelected=new Set(); this.renderAll(); },
  toggleRerollCard(id){ if(this.rerollSelected.has(id)) this.rerollSelected.delete(id); else this.rerollSelected.add(id); this.renderAll(); },
  confirmReroll(){
    if(!this.rerollMode||this.rerollSelected.size===0||GameState.rerollCount<=0) return;
    GameState.rerollCount--;
    const sel=GameState.hand.filter(c=>this.rerollSelected.has(c.id));
    GameState.hand=GameState.hand.filter(c=>!this.rerollSelected.has(c.id));
    sel.forEach(c=>{ if(c.trait==='ディスカード') GameState.gold+=2; GameState.discardPile.push(c); });
    for(let i=0;i<sel.length;i++) this.drawOne();
    this.addLog(`${sel.length}枚リロール（残り${GameState.rerollCount}回）`);
    this.rerollMode=false; this.rerollSelected=new Set(); this.renderAll();
  },

  applyThunder(){ let n=0; for(let i=0;i<this.board.length;i++) if(this.board[i]?.symbol==='Cross'){this.board[i]=null;n++;} if(n) this.addLog(`サンダー：×を${n}個除去`); },

  queueJammingEffect(jamming,cellIdx){
    switch(jamming){
      case 'スタン': this.effects.stunNextNpc=true; this.addLog('スタン：次のNPC行動を封じる'); break;
      case '混乱': this.effects.confuseNextNpc=true; this.addLog('混乱：次のNPCは最低点マスへ'); break;
      case 'ブレイク': this.effects.breakTurns=4; this.addLog('ブレイク：4ターン×ビンゴ無効'); break;
      case 'リンク':{
        const r=Math.floor(cellIdx/GameData.BOARD_SIZE), c=cellIdx%GameData.BOARD_SIZE;
        const cands=[[-1,0],[1,0],[0,-1],[0,1]].map(([dr,dc])=>{const nr=r+dr,nc=c+dc;return(nr>=0&&nr<GameData.BOARD_SIZE&&nc>=0&&nc<GameData.BOARD_SIZE)?this.cellIndex(nr,nc):-1;}).filter(i=>i>=0);
        const empty=cands.filter(i=>this.board[i]===null&&!this.blockedCells.has(i));
        if(empty.length===0){this.effects.stunNextNpc=true;this.addLog('リンク：隣接マスなし→スタン');}
        else{this.effects.linkRestrict=empty;this.addLog('リンク：NPCの配置を十字マスに制限');}
        break;
      }
      case '引き直し':{
        if(this.lastNpcCell!==null&&this.board[this.lastNpcCell]?.symbol==='Cross'){
          this.board[this.lastNpcCell]=null;
          this.effects.redirectBan=this.lastNpcCell;
          this.addLog(`引き直し：マス${this.lastNpcCell+1}のバツを除去`);
        }
        break;
      }
      case '封印':{
        const sr=Math.floor(cellIdx/GameData.BOARD_SIZE), sc=cellIdx%GameData.BOARD_SIZE;
        const sealed=new Set();
        for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++){
          if(dr===0&&dc===0) continue;
          const nr=sr+dr,nc=sc+dc;
          if(nr>=0&&nr<GameData.BOARD_SIZE&&nc>=0&&nc<GameData.BOARD_SIZE) sealed.add(this.cellIndex(nr,nc));
        }
        this.effects.sealCell=sealed; this.addLog('封印：周囲8マスにNPCは置けない');
        break;
      }
      case '誘導': this.effects.lureRestrict=true; this.addLog('誘導：NPCは中央4マスにしか置けない'); break;
      default: break;
    }
  },

  countBoardJamming(name){ return this.board.filter(c=>c&&c.card&&c.card.jamming===name).length; },

  cellCanBeSymbol(cell, targetSym){
    if(!cell) return false;
    if(cell.symbol===targetSym) return true;
    const e=cell.card&&cell.card.enhance;
    if(!e) return false;
    if(e==='オールマルチ') return ['Circle','Triangle','Square'].includes(targetSym);
    const mm={'マルマルチ':'Circle','サンカクマルチ':'Triangle','シカクマルチ':'Square','バツマルチ':'Cross'};
    return mm[e]===targetSym;
  },

  async placeCard(cellIdx,symbol,baseScore,owner,card){
    const breakActive=this.effects.breakTurns>0;
    const isNeg=card&&card.trait==='ネガティブ'&&owner==='player';
    if(card&&(card.trait==='塗りつぶし'||card.trait==='塗りつぶし(レリック)')&&owner==='player'&&this.board[cellIdx]?.card) GameState.discardPile.push(this.board[cellIdx].card);
    this.board[cellIdx]={symbol,baseScore,owner,card};
    if(owner==='npc') this.lastNpcCell=cellIdx;
    if(card) GameState.hand=GameState.hand.filter(c=>c.id!==card.id);
    if(card?.jamming==='サンダー') this.applyThunder();
    this.board.forEach(cell=>{
      if(!cell?.card) return;
      if(cell.card.enhance==='巨大化') cell.baseScore+=3;
      if(cell.card.enhance==='肥大化'){const a=Math.round(GameData.BINGO_MULTIPLIER_BASE[cell.symbol]*2);GameState.currentScore=Math.max(0,GameState.currentScore+a);}
    });
    if(card?.enhance==='ドロー') this.drawOne();
    const newBingos=this.detectNewBingos();
    if(!isNeg) this.turnInRound++;
    if(card?.jamming) this.queueJammingEffect(card.jamming,cellIdx);
    if(GameState.hasRelic('draw_boost')&&GameState.hand.length<GameState.effectiveHandSize()) this.drawOne();
    this.selectedCardId=null; this.boardInfoCell=null; this.activeRelicId=null; this.expandPending=null; this.paintPending=null;
    this.renderAll();
    if(newBingos.length>0) await this.playScoreSequence(newBingos);
    const endByBingo=this.shouldBingoEndRound(newBingos,breakActive);
    if(breakActive&&this.effects.breakTurns>0) this.effects.breakTurns--;
    if(endByBingo||this.turnInRound>GameState.effectiveTurnsPerRound()){this.renderAll();await this.sleep(300);this.endRound();return;}
    if(isNeg){this.renderAll();return;}
    this.currentSide=this.currentSide==='player'?'npc':'player';
    this.renderAll();
    if(this.currentSide==='npc') this.scheduleAIMove();
  },

  detectNewBingos(){
    const results=[];
    const lifeExt=this.countBoardJamming('延命');
    const blockCnt=this.countBoardJamming('ビンゴ阻害');
    const quadOnly=this.bossEffect?.id==='quad_only';
    const noRelic=this.bossEffect?.id==='no_relic';

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

    const scoringRelics=new Set();
    const makeResult=(idx,win,r,baseMult)=>{
      const cardScores=r.cells.map(c=>c.baseScore);
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
      if(!noRelic){
        if(GameState.hasRelic('combo')&&this.prevRoundBingoSymbol&&this.prevRoundBingoSymbol!==r.sym){finalMult+=1.5;scoringRelics.add('combo');}
        if(GameState.hasRelic('turn_boost')){finalMult*=Math.pow(1.1,this.turnInRound);scoringRelics.add('turn_boost');}
        if(GameState.hasRelic('last_stand')&&GameState.round>=4){finalMult*=2;scoringRelics.add('last_stand');}
        GameState.relics.forEach(rel=>{
          if(rel.relicEnhance==='ren_general'){finalMult*=1.1;scoringRelics.add(rel.id);}
          if(rel.relicEnhance==='ren_only_one'&&GameState.relicCount()===1){finalMult+=20;scoringRelics.add(rel.id);}
          if(rel.relicEnhance==='ren_grade'){const n=GameState.currentDeck.reduce((s,c)=>{let x=0;if(c.enhance)x++;if(c.jamming)x++;if(c.trait)x++;return s+x;},0);finalMult+=n;scoringRelics.add(rel.id);}
          if(rel.relicEnhance==='ren_discard'){finalMult*=3;scoringRelics.add(rel.id);}
        });
      }
      // 性質変化
      r.cells.forEach(cidx=>{
        const cell=this.board[cidx]; if(!cell?.card) return;
        if(cell.card.trait==='指令官'&&(this.turnInRound===7||this.turnInRound===8)) finalMult*=1.2;
        if(cell.card.trait==='ミニマム'){const counts={};GameData.SYMBOLS.forEach(s=>{counts[s]=this.board.filter(c=>c&&c.symbol===s).length;});const minv=Math.min(...Object.values(counts).filter(v=>v>0));finalMult+=minv;}
        if(cell.card.trait==='マキシマム'){const counts={};GameData.SYMBOLS.forEach(s=>{counts[s]=this.board.filter(c=>c&&c.symbol===s).length;});const maxS=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];if(maxS&&maxS[0]===r.sym) finalMult+=1;}
        if(cell.card.trait==='レリック特攻') correctionBase+=Math.max(0,50-10*GameState.relicCount());
        if(cell.card.enhance==='連鎖'){const n=this.board.filter(c=>c&&c.card&&c.card.enhance==='連鎖').length;cell.baseScore+=30*n;}
      });
      if(GameState.hand.some(c=>c.trait==='将軍')) finalMult*=1.1;

      // 4列補正はbaseMult計算済み（quadMultで1.5倍）、最終乗算補正
      let finalMultiplier=GameData.FINAL_MULTIPLIER;
      if(GameState.relics.some(r=>r.relicEnhance==='ren_double')) finalMultiplier*=1.5;
      if(GameState.relics.some(r=>r.relicEnhance==='ren_triple')) finalMultiplier*=2;
      const finalAdd=GameData.FINAL_ADD;
      // 山札強化
      let finalAddTotal=finalAdd;
      if(!noRelic) GameState.relics.forEach(rel=>{if(rel.relicEnhance==='ren_draw_pile'){finalAddTotal+=GameState.drawPile.length*100;scoringRelics.add(rel.id);}});

      const score=Math.max(0,Math.round(totalBase*finalMult*finalMultiplier)+finalAddTotal);
      return {idx,symbol:r.sym,cells:win.cells,cardScores,totalBase,relicBonus,mult:finalMult,finalMultiplier,finalAdd:finalAddTotal,score,isQuad:win.isQuad};
    };

    this.windows.forEach((win,idx)=>{
      if(!win.isQuad||this.scoredWindowKeys.has(idx)) return;
      const r=evalWin(win); if(!r) return;
      this.scoredWindowKeys.add(idx);
      (this.quadSiblings[idx]||[]).forEach(s=>this.scoredWindowKeys.add(s));
      results.push(makeResult(idx,win,r,GameData.quadMult(r.sym)));
    });
    this.windows.forEach((win,idx)=>{
      if(win.isQuad||this.scoredWindowKeys.has(idx)) return;
      const r=evalWin(win); if(!r) return;
      this.scoredWindowKeys.add(idx);
      results.push(makeResult(idx,win,r,GameData.BINGO_MULTIPLIER_BASE[r.sym]));
    });
    if(!noRelic&&GameState.hasRelic('double')&&results.length>=2){
      results.forEach(b=>{b.finalMultiplier*=1.5;b.score=Math.max(0,Math.round(b.totalBase*b.mult*b.finalMultiplier)+b.finalAdd);});
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

    // #1 各セルを1枚ずつ0.4秒ポップ（同セルが複数ビンゴに属する場合、その分繰り返す）
    for(const cellIdx of b.cells){
      this.scoringAnim={phase:0,cells:[cellIdx],symbol:b.symbol,liveScore:before,totalBase:b.totalBase,mult:b.mult,isQuad:b.isQuad,finalMultiplier:b.finalMultiplier,finalAdd:b.finalAdd,reached:false,popCell:cellIdx};
      this.renderAll(); await this.sleep(400);
    }
    this.scoringAnim.cells=b.cells;

    // step 1: 補正基礎点+カード基礎点
    this.scoringAnim.phase=1; this.renderAll(); await this.sleep(500);
    // step 2: ビンゴ倍率
    this.scoringAnim.phase=2; this.renderAll(); await this.sleep(500);
    // step 3: 乗算カウントアップ
    this.scoringAnim.phase=3;
    const step3Target=Math.round(b.totalBase*b.mult);
    this.renderAll();
    for(let s=1;s<=10;s++){
      this.scoringAnim.liveScore=Math.round(before+(step3Target-before)*s/10);
      this.renderAll(); await this.sleep(50);
    }
    await this.sleep(150);
    // step 4: 4列×1.5
    if(b.isQuad){
      this.scoringAnim.phase=4;
      const step4Target=Math.max(0,Math.round(b.totalBase*b.mult*1.5));
      this.renderAll();
      for(let s=1;s<=10;s++){
        this.scoringAnim.liveScore=Math.round(before+(step4Target-before)*s/10);
        this.renderAll(); await this.sleep(50);
      }
      await this.sleep(150);
    }
    // step 5: 最終乗算補正
    this.scoringAnim.phase=5; this.renderAll(); await this.sleep(500);
    // step 6: 最終加算補正
    if(b.finalAdd){ this.scoringAnim.phase=6; this.renderAll(); await this.sleep(500); }
    // 確定
    GameState.currentScore=after;
    this.scoringAnim.liveScore=after; this.scoringAnim.reached=GameState.currentScore>=GameState.targetScore; this.scoringAnim.phase=7;
    this.addLog(`${GameData.SYMBOL_LABEL[b.symbol]}${b.isQuad?'4列':'3列'}ビンゴ！ +${GlobalFunctions.formatScore(b.score)}（計${GlobalFunctions.formatScore(GameState.currentScore)}）`);
    this.renderAll(); await this.sleep(900);
    this.scoringAnim=null; this.renderAll();
  },

  async scheduleAIMove(){
    await this.sleep(500);
    if(this.currentSide!=='npc'||this.resultState) return;
    const npcDouble=GameState.relics.some(r=>r.relicEnhance==='ren_npc');

    // スタン事前チェック
    if(this.effects.stunNextNpc){
      this.effects.stunNextNpc=false;
      this.addLog('NPCはスタンした');
      this.turnInRound++;
      if(this.effects.breakTurns>0) this.effects.breakTurns--;
      if(this.turnInRound>GameState.effectiveTurnsPerRound()){this.endRound();return;}
      this.currentSide='player';this.renderAll();return;
    }

    const ci=this.chooseAICell();

    // chooseAICell内でリンク/封印/誘導→配置不可→スタン設定された場合
    if(ci===null && this.effects.stunNextNpc){
      this.effects.stunNextNpc=false;
      this.addLog('NPCはスタンした（配置不可）');
      this.turnInRound++;
      if(this.effects.breakTurns>0) this.effects.breakTurns--;
      if(this.turnInRound>GameState.effectiveTurnsPerRound()){this.endRound();return;}
      this.currentSide='player';this.renderAll();return;
    }

    if(ci===null){this.endRound();return;}
    await this.placeCard(ci,'Cross',10,'npc',null);
    if(npcDouble&&!this.resultState&&this.currentSide==='npc'){await this.sleep(400);const ci2=this.chooseAICell();if(ci2!==null) await this.placeCard(ci2,'Cross',10,'npc',null);}
  },

  chooseAICell(){
    let empty=this.board.map((v,i)=>(v===null&&!this.blockedCells.has(i))?i:-1).filter(i=>i>=0);
    if(this.effects.redirectBan!==null){const ban=this.effects.redirectBan;const e2=empty.filter(i=>i!==ban);this.effects.redirectBan=null;if(e2.length>0) empty=e2;else{this.effects.stunNextNpc=true;return null;}}
    if(this.effects.sealCell){const sealed=this.effects.sealCell;const e2=empty.filter(i=>!sealed.has(i));this.effects.sealCell=null;if(e2.length>0) empty=e2;else{this.effects.stunNextNpc=true;return null;}}
    if(this.effects.lureRestrict){this.effects.lureRestrict=false;const center=[5,6,9,10];const e2=empty.filter(i=>center.includes(i));if(e2.length>0) empty=e2;else{this.effects.stunNextNpc=true;return null;}}
    if(this.effects.linkRestrict){const r=this.effects.linkRestrict.filter(i=>this.board[i]===null&&!this.blockedCells.has(i));this.effects.linkRestrict=null;if(r.length>0) empty=r;else{this.effects.stunNextNpc=true;return null;}}
    if(GameState.relics.some(r=>r.relicEnhance==='ren_all_link')&&this.lastNpcCell!==null){
      const r2=Math.floor(this.lastNpcCell/GameData.BOARD_SIZE),c2=this.lastNpcCell%GameData.BOARD_SIZE;
      const adj=[[-1,0],[1,0],[0,-1],[0,1]].map(([dr,dc])=>{const nr=r2+dr,nc=c2+dc;return(nr>=0&&nr<GameData.BOARD_SIZE&&nc>=0&&nc<GameData.BOARD_SIZE)?this.cellIndex(nr,nc):-1;}).filter(i=>i>=0);
      const e2=adj.filter(i=>this.board[i]===null&&!this.blockedCells.has(i));
      if(e2.length>0) empty=e2;
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
      if(card.enhance==='横拡張'){const t=this.getExpandTargets(ci,'right',isPaint);return t?[t]:[];}
      if(card.enhance==='縦拡張'){const t=this.getExpandTargets(ci,'up',isPaint);return t?[t]:[];}
      if(card.enhance==='拡大'){const t=this.getExpandTargets(ci,'rect',isPaint);return t?[t]:[];}
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
        const tryW=(win,idx,multObj)=>{
          if(local.has(idx)) return false;
          if(!targets.some(t=>win.cells.includes(t))&&!win.cells.some(ci=>this.board[ci]&&this.cellCanBeSymbol(this.board[ci],win.cells.map(i=>sim[i]).filter(Boolean)[0]?.symbol))) return false;
          const cells=win.cells.map(i=>sim[i]);
          if(cells.some(c=>!c)) return false;
          const candidates=GameData.SYMBOLS.filter(s=>cells.every(c=>this.cellCanBeSymbol(c,s)));
          if(candidates.length===0) return false;
          const s=candidates.find(x=>x!=='Cross')||candidates[0];
          if(this.bossEffect?.id==='quad_only'&&!win.isQuad) return false;
          local.add(idx);
          const lb=cells.reduce((acc,c)=>acc+c.baseScore,0)+GameData.CORRECTION_BASE_SCORE;
          const m=multObj[s]+GameData.CORRECTION_MULTIPLIER;
          total+=Math.max(0,Math.round(lb*m*GameData.FINAL_MULTIPLIER));
          any=true; return true;
        };
        this.windows.forEach((win,idx)=>{ if(!win.isQuad) return; if(tryW(win,idx,qObj)) (this.quadSiblings[idx]||[]).forEach(s=>local.add(s)); });
        this.windows.forEach((win,idx)=>{ if(!win.isQuad) tryW(win,idx,GameData.BINGO_MULTIPLIER_BASE); });
      }
      if(any) hints[ci]=total;
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
    const occ=this.board[ci]; if(occ){this.boardInfoCell=(this.boardInfoCell===ci)?null:ci;this.renderAll();return;}
    this.paintPending=null; this.executePlacement([ci],card);
  },

  handleExpandPlace(ci,card,mode,isPaint){
    const targets=this.getExpandTargets(ci,mode,isPaint);
    if(!targets){this.addLog('この場所には配置できません');this.expandPending=null;this.renderAll();return;}
    if(this.expandPending&&this.expandPending.firstCi===ci){const c=this.expandPending.card;this.expandPending=null;this.executePlacement(targets,c);}
    else{this.expandPending={card,targets,firstCi:ci,mode};this.boardInfoCell=null;this.renderAll();}
  },

  getExpandTargets(startCi,mode,isPaint=false){
    const sr=Math.floor(startCi/GameData.BOARD_SIZE),sc=startCi%GameData.BOARD_SIZE;
    let offsets=[];
    if(mode==='right') offsets=[[0,0],[0,1]];           // 右隣
    if(mode==='up')    offsets=[[0,0],[-1,0]];           // 上隣
    if(mode==='rect')  offsets=[[0,0],[0,1],[1,0],[1,1]]; // #10 右・下・右下（2×2）
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

  async executePlacement(targets,card){
    const mainCi=targets[0];
    const isPaint=card.trait==='塗りつぶし'||card.trait==='塗りつぶし(レリック)';
    for(const ci of targets){
      if(this.board[ci]?.card&&isPaint) GameState.discardPile.push(this.board[ci].card);
      this.board[ci]={symbol:card.symbol,baseScore:card.baseScore,owner:'player',card:ci===mainCi?card:null};
    }
    this.paintPending=null;
    GameState.hand=GameState.hand.filter(c=>c.id!==card.id);
    if(card.jamming==='サンダー') this.applyThunder();
    const breakActive=this.effects.breakTurns>0;
    const isNeg=card.trait==='ネガティブ';
    this.board.forEach(cell=>{
      if(!cell?.card) return;
      if(cell.card.enhance==='巨大化') cell.baseScore+=3;
      if(cell.card.enhance==='肥大化'){const a=Math.round(GameData.BINGO_MULTIPLIER_BASE[cell.symbol]*2);GameState.currentScore=Math.max(0,GameState.currentScore+a);}
    });
    if(card.enhance==='ドロー') this.drawOne();
    const newBingos=this.detectNewBingos();
    if(!isNeg) this.turnInRound++;
    if(card.jamming) this.queueJammingEffect(card.jamming,mainCi);
    if(GameState.hasRelic('draw_boost')&&GameState.hand.length<GameState.effectiveHandSize()) this.drawOne();
    this.selectedCardId=null; this.boardInfoCell=null; this.activeRelicId=null; this.expandPending=null; this.paintPending=null;
    this.renderAll();
    if(newBingos.length>0) await this.playScoreSequence(newBingos);
    const endByBingo=this.shouldBingoEndRound(newBingos,breakActive);
    if(breakActive&&this.effects.breakTurns>0) this.effects.breakTurns--;
    if(endByBingo||this.turnInRound>GameState.effectiveTurnsPerRound()){this.renderAll();await this.sleep(300);this.endRound();return;}
    if(isNeg){this.renderAll();return;}
    this.currentSide=this.currentSide==='player'?'npc':'player';
    this.renderAll(); if(this.currentSide==='npc') this.scheduleAIMove();
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
      case 'round_boost': GameState.roundsBonus=Math.max(0,GameState.roundsBonus-1); break;
      case 'reroll_boost': GameState.rerollBonus=Math.max(0,GameState.rerollBonus-2); GameState.rerollCount=Math.max(0,GameState.rerollCount-2); break;
      case 'hand_boost': GameState.handSizeBonus=Math.max(0,GameState.handSizeBonus-3); break;
      case 'paint': this.removePaintRelic(); GameState.turnsBonus+=2; break;
      case 'jamming_boost': GameState.rerollCount+=3; break;
      case 'base_boost': GameData.FINAL_ADD=Math.max(0,GameData.FINAL_ADD-2000); break;
      default: break;
    }
    if(relic.relicEnhance==='ren_cross') GameData.BINGO_MULTIPLIER_BASE['Cross']=Math.max(-30,GameData.BINGO_MULTIPLIER_BASE['Cross']/5);
  },

  addLog(text){ this.logs.push(text); if(this.logs.length>80) this.logs.shift(); },

  // ===== Render =====
  renderAll(){
    this.container.innerHTML='';
    if(this.resultState){this.container.appendChild(this.renderResult());return;}
    const wrap=document.createElement('div'); wrap.className='game-screen';
    wrap.appendChild(this.renderStatusBar());
    const turnMax=GameState.effectiveTurnsPerRound();
    const turnEl=document.createElement('div'); turnEl.className='turn-indicator '+this.currentSide;
    turnEl.textContent=this.currentSide==='player'?`あなたの番（ターン ${this.turnInRound} / ${turnMax}）`:`NPCの番（ターン ${this.turnInRound} / ${turnMax}）`;
    wrap.appendChild(turnEl);
    if(this.bossEffect){
      const bt=document.createElement('div'); bt.className='boss-tag';
      bt.innerHTML=`<span class="boss-tag-name">ボス効果：${this.bossEffect.name}</span><span class="boss-tag-desc">${this.bossEffect.desc}</span>`;
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
    wrap.appendChild(this.renderRelicRow());
    if(this.activeRelicId){const rp=this.renderRelicInfoPanel();if(rp) wrap.appendChild(rp);}
    wrap.appendChild(this.renderControls());
    wrap.appendChild(this.renderLog());
    this.container.appendChild(wrap);
  },

  renderStatusBar(){
    const holder=document.createElement('div'); holder.style.width='100%';
    const bar=document.createElement('div'); bar.className='status-bar'; bar.style.flexDirection='column'; bar.style.alignItems='flex-start';
    const live=this.scoringAnim?this.scoringAnim.liveScore:GameState.currentScore;
    const sparkle=this.scoringAnim&&this.scoringAnim.reached;
    const pct=Math.min(100,Math.floor((live/GameState.targetScore)*100));
    let addScoreHtml='';
    if(this.scoringAnim){
      const a=this.scoringAnim;
      const phase=a.phase||1;
      const phaseLabels={1:`ステップ1: カード基礎点 ${a.totalBase}`,2:`ステップ2: ビンゴ倍率 ×${Math.round(a.mult*10)/10}`,3:`ステップ3: ${a.totalBase} × ${Math.round(a.mult*10)/10} → 計算中`,4:`ステップ4: 4列補正 ×1.5`,5:`ステップ5: 最終乗算補正 ×${Math.round(a.finalMultiplier*10)/10}`,6:`ステップ6: 最終加算補正 +${a.finalAdd}`,7:'確定'};
      addScoreHtml=`<div class="add-score-bar"><span class="as-label">${phaseLabels[phase]||''}</span><span class="as-eq as-live">${GlobalFunctions.formatScore(a.liveScore)}</span></div>`;
    }
    const stats=[['ステージ',this.stage.name],['ラウンド',`${GameState.round}/${GameState.effectiveMaxRounds()}`],['目標',GlobalFunctions.formatScore(GameState.targetScore)],['現在点数',GlobalFunctions.formatScore(live),sparkle],['G',GameState.gold],['山札',GameState.drawPile.length],['捨',GameState.discardPile.length]];
    const row=document.createElement('div'); row.style.cssText='display:flex;flex-wrap:wrap;gap:12px;width:100%;';
    for(const [label,val,sp] of stats){const d=document.createElement('div');d.className='stat';d.innerHTML=`<div class="label">${label}</div><div class="value${sp?' sparkle':''}">${val}</div>`;row.appendChild(d);}
    bar.appendChild(row);
    if(addScoreHtml){const div=document.createElement('div');div.innerHTML=addScoreHtml;bar.appendChild(div);}
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

    // 拡張・拡大
    if(card.enhance==='横拡張')
      return `<div class="card-symbol-expand horiz"><span class="sym-${card.symbol} esym">${label}</span><span class="sym-${card.symbol} esym">${label}</span></div>${emojiHtml}`;
    if(card.enhance==='縦拡張')
      return `<div class="card-symbol-expand vert"><span class="sym-${card.symbol} esym">${label}</span><span class="sym-${card.symbol} esym">${label}</span></div>${emojiHtml}`;
    if(card.enhance==='拡大')
      return `<div class="card-symbol-expand grid2"><span class="sym-${card.symbol} esym">${label}</span><span class="sym-${card.symbol} esym">${label}</span><span class="sym-${card.symbol} esym">${label}</span><span class="sym-${card.symbol} esym">${label}</span></div>${emojiHtml}`;

    // 巨大化：記号1.5倍
    if(card.enhance==='巨大化'){
      const sub=multiSym?`<span class="card-multi-sub">${multiSym}</span>`:'';
      return `<div class="card-symbol-wrap"><span class="sym-${card.symbol} sym-large">${label}</span>${sub}</div>${emojiHtml}`;
    }
    // ハブ：記号右に➕
    if(card.enhance==='ハブ'){
      const sub=multiSym?`<span class="card-multi-sub">${multiSym}</span>`:'';
      return `<div class="card-symbol-wrap"><span class="sym-${card.symbol}">${label}</span><span class="enhance-badge">➕</span>${sub}</div>${emojiHtml}`;
    }
    // 連鎖：記号右に🤝
    if(card.enhance==='連鎖'){
      const sub=multiSym?`<span class="card-multi-sub">${multiSym}</span>`:'';
      return `<div class="card-symbol-wrap"><span class="sym-${card.symbol}">${label}</span><span class="enhance-badge">🤝</span>${sub}</div>${emojiHtml}`;
    }
    // 肥大化：記号横に "+倍率*2" (黄色)
    if(card.enhance==='肥大化'){
      const mult=GameData.BINGO_MULTIPLIER_BASE[card.symbol]||0;
      const val=mult*2;
      const sub=multiSym?`<span class="card-multi-sub">${multiSym}</span>`:'';
      return `<div class="card-symbol-wrap"><span class="sym-${card.symbol}">${label}</span><span class="enhance-badge gold-text">+${val}</span>${sub}</div>${emojiHtml}`;
    }
    // マルチ系
    const sub=multiSym?`<span class="card-multi-sub">${multiSym}</span>`:'';
    return `<div class="card-symbol-wrap"><span class="sym-${card.symbol}">${label}</span>${sub}</div>${emojiHtml}`;
  },

  // #4 右上数字にブルジョワ・ドロー情報を付加
  // #1 ドット（黄緑青）をカード基礎点の左に inline 表示
  // #2 ブルジョワは現在Gを受け取って動的表示
  // #6 数値強化も +15 を明示
  cardScoreHtml(card, currentGold=0){
    const multiMap={'マルマルチ':'Circle','サンカクマルチ':'Triangle','シカクマルチ':'Square'};
    const ms=multiMap[card.enhance];

    // 左側インラインドット
    let dotHtml='';
    if(card.enhance) dotHtml+=`<span class="score-dot dot-enhance"></span>`;
    if(card.jamming) dotHtml+=`<span class="score-dot dot-jamming"></span>`;
    if(card.trait)   dotHtml+=`<span class="score-dot dot-trait"></span>`;
    const dotsSpan=dotHtml?`<span class="score-dots">${dotHtml}</span>`:'';

    let bonusHtml='';
    if(ms&&card.symbol===ms&&card.baseScore>card.number){
      bonusHtml=`<span class="card-score-bonus">+${card.baseScore-card.number}</span>`;
    } else if(card.enhance==='数値強化'){
      bonusHtml=`<span class="card-score-bonus">+15</span>`;
    } else if(card.enhance==='ブルジョワ'){
      // #2 動的：現在G×4
      const bonus=currentGold*4;
      bonusHtml=`<span class="card-score-bonus gold-text">+${bonus}(×4G)</span>`;
    }

    let scoreHtml=`<span class="card-number">${dotsSpan}${card.baseScore}${bonusHtml}</span>`;
    if(card.enhance==='ドロー') scoreHtml+=`<span class="card-draw-label">draw1</span>`;
    return scoreHtml;
  },

  cardInfoDescHtml(card){
    const l=[];
    if(card.jamming){
      const emoji=GameData.JAMMING_EMOJI[card.jamming]||'';
      l.push(`<div class="info-desc desc-jamming">${emoji} 【${card.jamming}】${GameData.JAMMING_DESC[card.jamming]||''}</div>`);
    }
    if(card.enhance) l.push(`<div class="info-desc desc-enhance">【${card.enhance}】${GameData.ENHANCE_DESC[card.enhance]||''}</div>`);
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
      if(isBlocked){cellEl.textContent='✕';cellEl.style.color='#333';}
      else if(cd){
        const sym=document.createElement('div'); sym.className='card-symbol-wrap sym-'+cd.symbol;
        sym.textContent=GameData.SYMBOL_LABEL[cd.symbol];
        // #16 盤面のマルチカードにも副記号
        if(cd.card?.enhance&&GameData.MULTI_SYMBOL_LABEL[cd.card.enhance]){
          const sub=document.createElement('span');sub.className='card-multi-sub small';sub.textContent=GameData.MULTI_SYMBOL_LABEL[cd.card.enhance];sym.appendChild(sub);
        }
        cellEl.appendChild(sym);
        const st=document.createElement('div');st.className='cell-score';st.textContent=cd.baseScore;cellEl.appendChild(st);
        const dcs=this.effectDotClasses(cd.card);
        if(dcs.length>0){const dots=document.createElement('div');dots.className='cell-dots';dcs.forEach(dc=>{const dot=document.createElement('div');dot.className='cell-dot '+dc;dots.appendChild(dot);});cellEl.appendChild(dots);}
        if(sc.includes(i)){
          cellEl.classList.add('scoring-cell');
          const isPopping=(this.scoringAnim?.phase===1)||(this.scoringAnim?.phase===0&&this.scoringAnim?.popCell===i);
          if(isPopping) cellEl.classList.add('scoring-pop');
          const badge=document.createElement('div');badge.className='score-badge';badge.textContent='+'+cd.baseScore;cellEl.appendChild(badge);
        }
        if(this.bossBlackedOut&&cd.owner==='player') sym.style.color='transparent';
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
      c.className='card'+(isSel?' selected':'')+(isRe?' reroll-selected':'')+(card.trait?` trait-${card.trait.replace(/[()]/g,'')}`:'');
      if(this.bossBlackedOut&&!isSel){
        c.innerHTML=`${this.cardTagsHtml(card)}<div class="card-symbol-wrap"><span style="opacity:0;font-size:22px;">${GameData.SYMBOL_LABEL[card.symbol]}</span></div>${this.cardScoreHtml(card, GameState.gold)}`;
      }else{
        c.innerHTML=`${this.cardTagsHtml(card)}${this.cardSymbolHtml(card)}${this.cardScoreHtml(card, GameState.gold)}`;
      }

      // ドラッグ（マウス：0.18秒長押し、タッチ：0.38秒長押し）
      if(this.currentSide==='player'&&!this.resultState&&!this.rerollMode){
        let dragTimer=null, isDragging=false, dragGhost=null;

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
          this.renderAll();
        };
        const clearDrag=()=>{
          if(dragGhost){ dragGhost.remove(); dragGhost=null; }
          c.classList.remove('dragging-origin');
          document.querySelectorAll('.cell.touch-hover').forEach(x=>x.classList.remove('touch-hover'));
          isDragging=false;
        };
        const moveDrag=(x,y)=>{
          if(!isDragging) return;
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
          dragTimer=setTimeout(()=>startDrag(t.clientX,t.clientY), 380);
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

  // #4 手札カードの説明も吹き出し
  renderHandInfoPanel(){
    if(this.rerollMode||!this.selectedCardId) return null;
    const card=GameState.hand.find(c=>c.id===this.selectedCardId); if(!card) return null;
    const panel=document.createElement('div'); panel.className='card-tooltip-panel';
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
    const maxEl=document.createElement('div');maxEl.className='relic-capacity';maxEl.textContent=`${GameState.relics.length}/${GameState.effectiveMaxRelics()}`;
    row.appendChild(maxEl);
    return row;
  },

  renderRelicInfoPanel(){
    const idx=this.activeRelicId;
    const relic=GameState.relics[idx]; if(!relic) return null;
    const panel=document.createElement('div'); panel.className='info-panel relic-info-panel';
    const ren=GameData.RELIC_ENHANCE_POOL.find(r=>r.id===relic.relicEnhance);
    let sellPrice=1; if(relic.relicEnhance==='ren_discard_sell') sellPrice=Math.floor(GameState.currentDeck.length/2); else if(ren) sellPrice+=2;
    panel.innerHTML=`<div class="info-title">${relic.name}</div><div class="info-desc">${relic.desc}</div>${ren?`<div class="info-desc relic-enhance-desc">【${ren.name}】${ren.desc}</div>`:''}<button class="sell-relic-btn">売却（${sellPrice}G）</button>`;
    panel.querySelector('.sell-relic-btn').addEventListener('click',()=>this.sellRelic(idx));
    return panel;
  },

  renderControls(){
    const controls=document.createElement('div'); controls.className='controls-row';
    if(this.rerollMode){
      const okBtn=document.createElement('button');okBtn.textContent=`確定（${this.rerollSelected.size}枚）`;okBtn.disabled=this.rerollSelected.size===0;okBtn.addEventListener('click',()=>this.confirmReroll());controls.appendChild(okBtn);
      const cancelBtn=document.createElement('button');cancelBtn.textContent='キャンセル';cancelBtn.addEventListener('click',()=>this.cancelReroll());controls.appendChild(cancelBtn);
    }else{
      const rBtn=document.createElement('button');rBtn.textContent=`リロール（残り${GameState.rerollCount}）`;rBtn.disabled=GameState.rerollCount<=0||this.currentSide!=='player'||this.bossEffect?.id==='reroll_limit';rBtn.addEventListener('click',()=>this.enterRerollMode());controls.appendChild(rBtn);
    }
    // #10 デッキ/捨て札/廃棄札確認ボタン
    const deckBtn=document.createElement('button'); deckBtn.textContent=`デッキ(${GameState.currentDeck.length})`; deckBtn.addEventListener('click',()=>this.showDeckModal('deck')); controls.appendChild(deckBtn);
    const discBtn=document.createElement('button'); discBtn.textContent=`捨て札(${GameState.discardPile.length})`; discBtn.addEventListener('click',()=>this.showDeckModal('discard')); controls.appendChild(discBtn);
    if(GameState.discardedPile.length>0){
      const exlBtn=document.createElement('button'); exlBtn.textContent=`廃棄(${GameState.discardedPile.length})`; exlBtn.addEventListener('click',()=>this.showDeckModal('discarded')); controls.appendChild(exlBtn);
    }
    return controls;
  },

  showDeckModal(type){
    const existing=document.getElementById('deck-modal-overlay'); if(existing) existing.remove();
    const overlay=document.createElement('div'); overlay.id='deck-modal-overlay'; overlay.className='pack-modal-overlay';
    overlay.addEventListener('click',(e)=>{ if(e.target===overlay) overlay.remove(); });
    const modal=document.createElement('div'); modal.className='pack-modal';
    const titles={'deck':'デッキ','discard':'捨て札','discarded':'廃棄札'};
    const piles={'deck':GameState.currentDeck,'discard':GameState.discardPile,'discarded':GameState.discardedPile};
    const cards=piles[type]||[];
    modal.innerHTML=`<h3>${titles[type]}（${cards.length}枚）</h3>`;
    const grid=document.createElement('div'); grid.className='pack-card-grid'; grid.style.maxHeight='60vh'; grid.style.overflowY='auto';
    cards.forEach(card=>{
      const item=document.createElement('div'); item.className='card';
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
      grid.appendChild(item);
    });
    modal.appendChild(grid);
    const closeBtn=document.createElement('button'); closeBtn.textContent='閉じる'; closeBtn.style.marginTop='14px'; closeBtn.addEventListener('click',()=>overlay.remove()); modal.appendChild(closeBtn);
    overlay.appendChild(modal); this.container.appendChild(overlay);
  },

  renderLog(){ const p=document.createElement('div');p.className='log-panel';p.innerHTML=this.logs.map(l=>`<div>${l}</div>`).join('');p.scrollTop=p.scrollHeight;return p; },

  renderResult(){
    const el=document.createElement('div'); el.className='result-screen';
    const win=this.resultState==='win'; const goShop=win&&this.stage.key!=='boss';
    const r=GameState.lastReward;
    const gr=(win&&r?.breakdown)?`<div class="gold-reveal-popup"><div class="gr-label">獲得ゴールド</div><div class="gr-total">+${r.gold}G</div><div class="gr-breakdown">基本6 ＋ 残りラウンド${r.breakdown.roundBonus} ＋ 残りリロール${r.breakdown.rerollBonus} ＋ レリック補正${r.breakdown.relicBonus} ＋ カード補正${r.breakdown.cardBonus}</div></div>`:'';
    el.innerHTML=`<div class="result-title ${win?'win':'lose'}">${win?'STAGE CLEAR':'GAME OVER'}</div><div>最終点数：${GlobalFunctions.formatScore(GameState.currentScore)} / ${GlobalFunctions.formatScore(GameState.targetScore)}</div>${gr}<button id="btn-next">${goShop?'ショップへ':'マップに戻る'}</button>`;
    setTimeout(()=>{el.querySelector('#btn-next').addEventListener('click',()=>{if(goShop) App.showShop();else App.showMapSelect();});});
    return el;
  },
};
