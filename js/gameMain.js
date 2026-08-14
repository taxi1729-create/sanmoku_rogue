const GameMainScene = {
  container:null, stage:null,
  board:[], windows:[], quadSiblings:{}, scoredWindowKeys:new Set(),
  prevRoundBingoSymbol:null, prevRoundScore:0, chargeActive:false, negativeCardUsed:false,
  turnInRound:1, currentSide:'player', selectedCardId:null, boardInfoCell:null,
  logs:[], resultState:null, scoringAnim:null,
  rerollMode:false, rerollSelected:new Set(),
  effects:{ stunNextNpc:false, confuseNextNpc:false, breakTurns:0, linkRestrict:null, redirectBan:null, sealCell:null, lureRestrict:false },
  bossEffect:null, blockedCells:new Set(), bossBlackedOut:false,
  lastNpcCell:null,                  // 引き直し用
  turnsBonus_bossRestore:0,          // ボスターン制限の復元用
  activeRelicId:null,                // レリックタップ中
  scoringRelicIds:[],                // 点数計算中に働いたレリックID

  sleep(ms){ return new Promise(res=>setTimeout(res,ms)); },

  render(container,stage){
    this.container=container; this.stage=stage;
    this.board=new Array(GameData.BOARD_SIZE*GameData.BOARD_SIZE).fill(null);
    this.windows=this.buildWindows(GameData.BOARD_SIZE);
    this.logs=[]; this.resultState=null; this.boardInfoCell=null; this.scoringAnim=null;
    this.rerollMode=false; this.rerollSelected=new Set();
    this.prevRoundBingoSymbol=null; this.prevRoundScore=0; this.chargeActive=false;
    this.negativeCardUsed=false; this.bossEffect=null; this.blockedCells=new Set();
    this.bossBlackedOut=false; this.lastNpcCell=null; this.activeRelicId=null; this.scoringRelicIds=[];
    this.turnsBonus_bossRestore=0;
    this.effects={stunNextNpc:false,confuseNextNpc:false,breakTurns:0,linkRestrict:null,redirectBan:null,sealCell:null,lureRestrict:false};
    this.expandPending=null; this.paintPending=null;
    GameState.initStage(stage);
    this.applyRelicInitEffects();
    this.applyBossEffect();
    this.startRound();
  },

  cellIndex(r,c){ return r*GameData.BOARD_SIZE+c; },

  buildWindows(size){
    const dirs=[{dr:0,dc:1,type:'row'},{dr:1,dc:0,type:'col'},{dr:1,dc:1,type:'diag'},{dr:1,dc:-1,type:'diag'}];
    const maximal=[];
    for(const {dr,dc,type} of dirs){
      for(let r=0;r<size;r++) for(let c=0;c<size;c++){
        const pr=r-dr,pc=c-dc;
        if(pr>=0&&pr<size&&pc>=0&&pc<size) continue;
        const line=[]; let rr=r,cc=c;
        while(rr>=0&&rr<size&&cc>=0&&cc<size){ line.push(this.cellIndex(rr,cc)); rr+=dr; cc+=dc; }
        if(line.length>=3) maximal.push({line,type});
      }
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

  // ===== Relic / Boss init =====
  applyRelicInitEffects(){
    if(GameState.hasRelic('base_boost')) GameData.CORRECTION_BASE_SCORE+=200;
    if(GameState.hasRelic('paint')) GameState.currentDeck.forEach(c=>{ if(!c.trait) c.trait='塗りつぶし'; });
    GameState.relics.forEach(r=>{
      if(r.relicEnhance==='ren_cross') GameData.BINGO_MULTIPLIER_BASE['Cross']*=5;
    });
  },

  applyBossEffect(){
    if(this.stage.key!=='boss'||GameData.BOSS_EFFECT_POOL.length===0) return;
    this.bossEffect=GlobalFunctions.randChoice(GameData.BOSS_EFFECT_POOL);
    this.addLog(`ボス効果：「${this.bossEffect.name}」${this.bossEffect.desc}`);
    switch(this.bossEffect.id){
      case 'cross5000': GameState.currentDeck.forEach(c=>{if(c.symbol==='Cross') c.baseScore=5000;}); break;
      case 'block_cells': GlobalFunctions.shuffle(Array.from({length:16},(_,i)=>i)).slice(0,4).forEach(i=>this.blockedCells.add(i)); break;
      case 'blackout': this.bossBlackedOut=true; break;
      case 'unify':{
        const ch=GlobalFunctions.randChoice(['Circle','Triangle','Square']);
        GameData.SYMBOLS.forEach(s=>{if(s===ch) GameData.BINGO_MULTIPLIER_BASE[s]+=10; else if(s!=='Cross') GameData.BINGO_MULTIPLIER_BASE[s]-=20;});
        this.addLog(`統一：${GameData.SYMBOL_LABEL[ch]}倍率+10、他-20`);
        break;
      }
      case 'cross_corner': [0,3,12,15].forEach(i=>{this.board[i]={symbol:'Cross',baseScore:10,owner:'npc',card:null};}); break;
      case 'turn_limit':
        this.turnsBonus_bossRestore = GameState.turnsBonus;
        GameState.turnsBonus = 10 - GameData.TURNS_PER_ROUND;
        break;
      case 'reroll_limit': GameState.rerollCount=0; break;
      case 'hand_limit': GameState.handSizeBonus=Math.min(-1,GameState.handSizeBonus-1); break;
      default: break;
    }
  },

  // ===== Round control =====
  startRound(){
    if(this.bossEffect?.id!=='cross_corner') this.board=new Array(GameData.BOARD_SIZE*GameData.BOARD_SIZE).fill(null);
    this.scoredWindowKeys=new Set(); this.turnInRound=1;
    const forceFirst = GameState.relics.some(r=>r.relicEnhance==='ren_first');
    this.currentSide = forceFirst ? 'player' : ((GameState.round%2===1)?'player':'npc');
    this.selectedCardId=null; this.boardInfoCell=null; this.rerollMode=false; this.rerollSelected=new Set();
    this.negativeCardUsed=false; this.activeRelicId=null; this.expandPending=null; this.paintPending=null;
    this.effects.linkRestrict=null; this.effects.stunNextNpc=false; this.effects.confuseNextNpc=false;
    this.effects.redirectBan=null; this.effects.sealCell=null; this.effects.lureRestrict=false;
    if(GameState.hasRelic('charge')&&GameState.round>1&&this.prevRoundScore===GameState.currentScore){
      this.chargeActive=true; this.addLog('チャージ発動：補正基礎点+100');
    }
    if(GameState.reserve.length>0){ GameState.hand.push(...GameState.reserve); GameState.reserve=[]; }
    this.drawToHandSize();
    // 巨大化・肥大化の初期化（ラウンド開始時点でリセット）
    this.addLog(`--- ラウンド ${GameState.round} 開始（先手：${this.currentSide==='player'?'プレイヤー':'NPC'}） ---`);
    this.renderAll();
    if(this.currentSide==='npc') this.scheduleAIMove();
  },

  endRound(){
    this.prevRoundScore=GameState.currentScore;
    // 巨大化/肥大化は盤面消滅とともに終了（ターン経過ボーナスはリアルタイム適用済み）
    for(const cell of this.board){
      if(!cell||!cell.card) continue;
      const c=cell.card;
      if(c.trait==='保留') GameState.reserve.push(c);
      if(this.bossEffect?.id==='discard_used') GameState.discardedPile.push(c);
      else GameState.discardPile.push(c);
    }
    GameState.hand.forEach(c=>{
      if(c.trait==='ディスカード') GameState.gold+=2;
      GameState.discardPile.push(c);
    });
    GameState.hand=[];
    // ドロー強化レリック：ラウンド終了時1枚ドロー
    if(GameState.relics.some(r=>r.relicEnhance==='ren_draw')) this.drawOne();
    this.chargeActive=false;
    if(GameState.currentScore>=GameState.targetScore){ this.finishStage('win'); return; }
    if(GameState.round>=GameState.effectiveMaxRounds()){ this.finishStage('lose'); return; }
    GameState.round++;
    // ボスターン制限：ステージ終了しなければ継続
    this.startRound();
  },

  finishStage(result){
    // ボスターン制限を元に戻す
    if(this.bossEffect?.id==='turn_limit') GameState.turnsBonus=this.turnsBonus_bossRestore;
    this.resultState=result;
    if(result==='win'){
      if(this.stage&&!GameState.clearedStages.includes(this.stage.key)) GameState.clearedStages.push(this.stage.key);
      const rd=this.calcClearReward();
      GameState.gold+=rd.total;
      GameState.lastReward={type:'clear',stageName:this.stage.name,gold:rd.total,breakdown:rd};
      this.addLog(`クリア報酬：G+${rd.total}`);
    }
    this.renderAll();
  },

  calcClearReward(){
    const base=GameData.CLEAR_REWARD_BASE[this.stage.key]||3;
    const bonus=Math.max(0,GameState.effectiveMaxRounds()-GameState.round);
    let flat=GameData.REWARD_FLAT_BONUS+(GameState.hasRelic('gold_boost')?3:0);
    GameState.relics.forEach(r=>{if(r.relicEnhance==='ren_gold') flat+=1;});
    return {base,bonus,flat,total:base+bonus+flat};
  },

  // ===== Draw / Hand =====
  drawToHandSize(){ const n=GameState.effectiveHandSize()-GameState.hand.length; for(let i=0;i<n;i++) this.drawOne(); },
  drawOne(){
    if(GameState.drawPile.length===0){
      const ret=GameState.discardPile.filter(c=>!GameState.discardedPile.some(d=>d.id===c.id));
      if(ret.length===0) return;
      GameState.drawPile=GlobalFunctions.shuffle(ret); GameState.discardPile=[];
      this.addLog('山札切れ：捨て札をシャッフルして山札に戻した');
    }
    const card=GameState.drawPile.pop();
    if(!card) return;
    if(card.trait==='竜頭蛇尾') card.baseScore=Math.max(0,card.baseScore-100);
    GameState.hand.push(card);
  },

  // ===== Reroll =====
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

  // ===== Jamming =====
  applyThunder(){ let n=0; for(let i=0;i<this.board.length;i++) if(this.board[i]?.symbol==='Cross'){this.board[i]=null;n++;} if(n) this.addLog(`サンダー：×を${n}個除去`); },

  queueJammingEffect(jamming,cellIdx){
    switch(jamming){
      case 'スタン': this.effects.stunNextNpc=true; this.addLog('スタン：次のNPC行動を封じる'); break;
      case '混乱': this.effects.confuseNextNpc=true; this.addLog('混乱：次のNPCは最低点マスへ'); break;
      case 'ブレイク': this.effects.breakTurns=4; this.addLog('ブレイク：4ターン×ビンゴ無効'); break;
      case 'リンク':{
        const r=Math.floor(cellIdx/GameData.BOARD_SIZE), c=cellIdx%GameData.BOARD_SIZE;
        const cands=[[-1,0],[1,0],[0,-1],[0,1]].map(([dr,dc])=>{const nr=r+dr,nc=c+dc; return(nr>=0&&nr<GameData.BOARD_SIZE&&nc>=0&&nc<GameData.BOARD_SIZE)?this.cellIndex(nr,nc):-1;}).filter(i=>i>=0);
        const empty=cands.filter(i=>this.board[i]===null&&!this.blockedCells.has(i));
        if(empty.length===0){this.effects.stunNextNpc=true;this.addLog('リンク：隣接マスなし→スタン');}
        else{this.effects.linkRestrict=empty;this.addLog('リンク：NPCの配置を十字マスに制限');}
        break;
      }
      case '引き直し':{
        // 直前のNPCが置いたバツを取り除く
        if(this.lastNpcCell!==null&&this.board[this.lastNpcCell]?.symbol==='Cross'){
          this.board[this.lastNpcCell]=null;
          this.effects.redirectBan=this.lastNpcCell;
          this.addLog(`引き直し：マス${this.lastNpcCell+1}のバツを除去。次のNPCはそのマス以外に置けない`);
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
        this.effects.sealCell=sealed;
        this.addLog('封印：周囲8マスにNPCは置けない');
        break;
      }
      case '誘導':
        this.effects.lureRestrict=true;
        this.addLog('誘導：NPCは中央4マスにしか置けない');
        break;
      default: break;
    }
  },

  countBoardJamming(name){ return this.board.filter(c=>c&&c.card&&c.card.jamming===name).length; },

  // ===== Place card =====
  async placeCard(cellIdx,symbol,baseScore,owner,card){
    const breakActive=this.effects.breakTurns>0;
    const isNeg=card&&card.trait==='ネガティブ'&&owner==='player';
    if(card&&card.trait==='塗りつぶし'&&owner==='player'&&this.board[cellIdx]?.card) GameState.discardPile.push(this.board[cellIdx].card);
    this.board[cellIdx]={symbol,baseScore,owner,card};
    if(owner==='npc') this.lastNpcCell=cellIdx;
    if(card) GameState.hand=GameState.hand.filter(c=>c.id!==card.id);
    if(card?.jamming==='サンダー') this.applyThunder();

    // 巨大化・肥大化：盤面にあるカードのターン加算
    this.board.forEach((cell,i)=>{
      if(!cell||!cell.card) return;
      if(cell.card.enhance==='巨大化') cell.baseScore+=3;
      if(cell.card.enhance==='肥大化'){
        const addScore=Math.round(GameData.BINGO_MULTIPLIER_BASE[cell.symbol]*2);
        GameState.currentScore+=Math.max(0,addScore);
      }
    });

    // ドロー強化カード
    if(card?.enhance==='ドロー') this.drawOne();

    const newBingos=this.detectNewBingos();
    if(!isNeg) this.turnInRound++;
    if(card?.jamming) this.queueJammingEffect(card.jamming,cellIdx);
    if(GameState.hasRelic('draw_boost')&&GameState.hand.length<GameState.effectiveHandSize()) this.drawOne();

    this.selectedCardId=null; this.boardInfoCell=null; this.activeRelicId=null; this.renderAll();
    if(newBingos.length>0) await this.playScoreSequence(newBingos);

    const endByBingo=this.shouldBingoEndRound(newBingos,breakActive);
    if(breakActive&&this.effects.breakTurns>0) this.effects.breakTurns--;
    if(endByBingo||this.turnInRound>GameState.effectiveTurnsPerRound()){
      this.renderAll(); await this.sleep(300); this.endRound(); return;
    }
    if(isNeg){ this.renderAll(); return; }
    this.currentSide=this.currentSide==='player'?'npc':'player';
    this.renderAll();
    if(this.currentSide==='npc') this.scheduleAIMove();
  },

  // ===== Bingo detection =====
  detectNewBingos(){
    const results=[];
    const lifeExt=this.countBoardJamming('延命');
    const blockCnt=this.countBoardJamming('ビンゴ阻害');
    const quadOnly=this.bossEffect?.id==='quad_only';
    const noRelic=this.bossEffect?.id==='no_relic';

    // セルが指定記号として扱えるか（マルチ系強化を考慮）
    const cellCanBeSymbol = (cell, targetSym) => {
      if(!cell) return false;
      if(cell.symbol === targetSym) return true;
      const e = cell.card && cell.card.enhance;
      if(!e) return false;
      if(e === 'オールマルチ') return ['Circle','Triangle','Square'].includes(targetSym);
      const multiMap = { 'マルマルチ':'Circle', 'サンカクマルチ':'Triangle', 'シカクマルチ':'Square', 'バツマルチ':'Cross' };
      return multiMap[e] === targetSym;
    };

    const evalWin=(win)=>{
      const cells=win.cells.map(i=>this.board[i]);
      if(cells.some(c=>!c)) return null;
      // 全セルが共通して扱える記号を探す
      const candidates = GameData.SYMBOLS.filter(sym =>
        cells.every(c => cellCanBeSymbol(c, sym))
      );
      if(candidates.length === 0) return null;
      // Cross以外を優先（Cross単独は減点になりうるため）
      const sym = candidates.find(s => s !== 'Cross') || candidates[0];
      if(sym==='Cross'){
        if(blockCnt>=3) return null;
        if((lifeExt>0||blockCnt>=2)&&win.cells.length===3) return null;
        if(blockCnt>=1&&win.type==='col') return null;
      }
      if(quadOnly&&!win.isQuad) return null;

      // マルチカードの基礎点補正（元記号 === マルチ対象記号の場合+20）
      const multiMap = { 'マルマルチ':'Circle', 'サンカクマルチ':'Triangle', 'シカクマルチ':'Square' };
      const adjustedCells = cells.map(c => {
        const e = c.card && c.card.enhance;
        const matched = multiMap[e];
        if(matched && c.symbol === matched) {
          return { ...c, baseScore: c.baseScore }; // +20は付与時に適用済み
        }
        return c;
      });

      return {sym, cells: adjustedCells};
    };

    const scoringRelics=new Set();
    const makeResult=(idx,win,r,baseMult)=>{
      const cardScores=r.cells.map(c=>c.baseScore);
      let lineBase=cardScores.reduce((s,v)=>s+v,0);
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
        if(GameState.hasRelic('base_boost')){relicBonus+=200;scoringRelics.add('base_boost');}
        if(GameState.hasRelic('empty_boost')){const ec=this.board.filter(c=>!c).length;relicBonus+=6*ec+5;scoringRelics.add('empty_boost');}
        GameState.relics.forEach(rel=>{
          const ren=rel.relicEnhance;
          if(!ren) return;
          if(ren==='ren_circle'){const n=GameState.currentDeck.filter(c=>c.symbol==='Circle'||(c.enhance==='マルマルチ'||c.enhance==='オールマルチ')).length;relicBonus+=n;scoringRelics.add(rel.id);}
          if(ren==='ren_triangle'){const n=GameState.currentDeck.filter(c=>c.symbol==='Triangle'||(c.enhance==='サンカクマルチ'||c.enhance==='オールマルチ')).length;relicBonus+=n;scoringRelics.add(rel.id);}
          if(ren==='ren_square'){const n=GameState.currentDeck.filter(c=>c.symbol==='Square'||(c.enhance==='シカクマルチ'||c.enhance==='オールマルチ')).length;relicBonus+=n;scoringRelics.add(rel.id);}
          if(ren==='ren_draw_pile'){relicBonus+=GameState.drawPile.length;scoringRelics.add(rel.id);}
          if(ren==='ren_disc_pile'){relicBonus+=GameState.discardPile.length;scoringRelics.add(rel.id);}
          if(ren==='ren_discard'){scoringRelics.add(rel.id);}
        });
      }
      lineBase+=relicBonus+GameData.CORRECTION_BASE_SCORE;

      let finalMult=baseMult+GameData.CORRECTION_MULTIPLIER;
      if(!noRelic){
        if(GameState.hasRelic('combo')&&this.prevRoundBingoSymbol&&this.prevRoundBingoSymbol!==r.sym){finalMult+=1.5;scoringRelics.add('combo');}
        if(GameState.hasRelic('turn_boost')){finalMult*=Math.pow(1.1,this.turnInRound);scoringRelics.add('turn_boost');}
        if(GameState.hasRelic('last_stand')&&GameState.round>=4){finalMult*=2;scoringRelics.add('last_stand');}
        // レリック強化「将軍」
        GameState.relics.forEach(rel=>{if(rel.relicEnhance==='ren_general'){finalMult*=1.1;scoringRelics.add(rel.id);}});
        // レリック強化「オンリーワン」
        GameState.relics.forEach(rel=>{if(rel.relicEnhance==='ren_only_one'&&GameState.relicCount()===1){finalMult+=20;scoringRelics.add(rel.id);}});
        // レリック強化「グレードオール」
        GameState.relics.forEach(rel=>{
          if(rel.relicEnhance==='ren_grade'){
            const n=GameState.currentDeck.reduce((s,c)=>{let x=0;if(c.enhance)x++;if(c.jamming)x++;if(c.trait)x++;return s+x;},0);
            finalMult+=n;scoringRelics.add(rel.id);
          }
        });
        // レリック強化「廃棄強化」
        GameState.relics.forEach(rel=>{if(rel.relicEnhance==='ren_discard'){finalMult*=3;scoringRelics.add(rel.id);}});
      }

      // 性質変化
      r.cells.forEach(cidx=>{
        const cell=this.board[cidx]; if(!cell?.card) return;
        if(cell.card.trait==='指令官'&&(this.turnInRound===7||this.turnInRound===8)) finalMult*=1.2;
        if(cell.card.trait==='ミニマム'){const counts={};GameData.SYMBOLS.forEach(s=>{counts[s]=this.board.filter(c=>c&&c.symbol===s).length;});const minv=Math.min(...Object.values(counts).filter(v=>v>0));finalMult+=minv;}
        if(cell.card.trait==='マキシマム'){const counts={};GameData.SYMBOLS.forEach(s=>{counts[s]=this.board.filter(c=>c&&c.symbol===s).length;});const maxS=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];if(maxS&&maxS[0]===r.sym) finalMult+=1;}
        if(cell.card.trait==='レリック特攻') lineBase+=Math.max(0,50-10*GameState.relicCount());
        if(cell.card.enhance==='連鎖'){const n=this.board.filter(c=>c&&c.card&&c.card.enhance==='連鎖').length;cell.baseScore+=30*n;}
      });
      if(GameState.hand.some(c=>c.trait==='将軍')) finalMult*=1.1;

      const score=Math.round(lineBase*finalMult*GameData.FINAL_MULTIPLIER);
      return {idx,symbol:r.sym,cells:win.cells,cardScores,lineBase,relicBonus,mult:finalMult,score,isQuad:win.isQuad};
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
      results.forEach(b=>{b.mult*=1.5;b.score=Math.round(b.lineBase*b.mult*GameData.FINAL_MULTIPLIER);});
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

  // ===== Score animation =====
  async playScoreSequence(bingos){ for(const b of bingos) await this.showScoreStep(b); },

  async showScoreStep(b){
    const before=GameState.currentScore, after=before+b.score;
    this.scoringAnim={cells:b.cells,symbol:b.symbol,liveScore:before,reached:false,lineBase:b.lineBase,relicBonus:b.relicBonus,mult:b.mult,isQuad:b.isQuad};
    this.renderAll(); await this.sleep(300);
    const steps=20, dur=900;
    for(let s=1;s<=steps;s++){
      this.scoringAnim.liveScore=Math.round(before+(after-before)*s/steps);
      this.renderAll(); await this.sleep(dur/steps);
    }
    GameState.currentScore=after;
    this.scoringAnim.liveScore=after;
    this.scoringAnim.reached=GameState.currentScore>=GameState.targetScore;
    this.addLog(`${GameData.SYMBOL_LABEL[b.symbol]}${b.isQuad?'4列':'3列'}ビンゴ！ +${GlobalFunctions.formatScore(b.score)}（計${GlobalFunctions.formatScore(GameState.currentScore)}）`);
    this.renderAll(); await this.sleep(900);
    this.scoringAnim=null; this.renderAll();
  },

  // ===== AI =====
  async scheduleAIMove(){
    await this.sleep(500);
    if(this.currentSide!=='npc'||this.resultState) return;
    // NPC強化レリック：2回行動
    const npcDouble=GameState.relics.some(r=>r.relicEnhance==='ren_npc');
    if(this.effects.stunNextNpc){ this.effects.stunNextNpc=false; this.addLog('NPCはスタンした'); this.turnInRound++; if(this.effects.breakTurns>0) this.effects.breakTurns--; if(this.turnInRound>GameState.effectiveTurnsPerRound()){ this.endRound(); return; } this.currentSide='player'; this.renderAll(); return; }
    const ci=this.chooseAICell();
    if(ci===null){ this.endRound(); return; }
    await this.placeCard(ci,'Cross',10,'npc',null);
    if(npcDouble&&!this.resultState&&this.currentSide==='npc'){
      await this.sleep(400);
      const ci2=this.chooseAICell();
      if(ci2!==null) await this.placeCard(ci2,'Cross',10,'npc',null);
    }
  },

  chooseAICell(){
    let empty=this.board.map((v,i)=>(v===null&&!this.blockedCells.has(i))?i:-1).filter(i=>i>=0);
    // 引き直し
    if(this.effects.redirectBan!==null){ const ban=this.effects.redirectBan; const e2=empty.filter(i=>i!==ban); this.effects.redirectBan=null; if(e2.length>0) empty=e2; else{this.effects.stunNextNpc=true;return null;} }
    // 封印
    if(this.effects.sealCell){ const sealed=this.effects.sealCell; const e2=empty.filter(i=>!sealed.has(i)); this.effects.sealCell=null; if(e2.length>0) empty=e2; else{this.effects.stunNextNpc=true;return null;} }
    // 誘導（中央4マス）
    if(this.effects.lureRestrict){ this.effects.lureRestrict=false; const center=[5,6,9,10]; const e2=empty.filter(i=>center.includes(i)); if(e2.length>0) empty=e2; else{this.effects.stunNextNpc=true;return null;} }
    // リンク
    if(this.effects.linkRestrict){ const r=this.effects.linkRestrict.filter(i=>this.board[i]===null&&!this.blockedCells.has(i)); this.effects.linkRestrict=null; if(r.length>0) empty=r; else{this.effects.stunNextNpc=true;return null;} }
    // オールリンク（レリック強化）
    if(GameState.relics.some(r=>r.relicEnhance==='ren_all_link')&&this.lastNpcCell!==null){
      const r2=Math.floor(this.lastNpcCell/GameData.BOARD_SIZE),c2=this.lastNpcCell%GameData.BOARD_SIZE;
      const adj=[[-1,0],[1,0],[0,-1],[0,1]].map(([dr,dc])=>{const nr=r2+dr,nc=c2+dc;return(nr>=0&&nr<GameData.BOARD_SIZE&&nc>=0&&nc<GameData.BOARD_SIZE)?this.cellIndex(nr,nc):-1;}).filter(i=>i>=0);
      const e2=adj.filter(i=>this.board[i]===null&&!this.blockedCells.has(i));
      if(e2.length>0) empty=e2;
    }
    const weighted=empty.map(ci=>{
      let w=0;
      for(const win of this.windows){ if(!win.cells.includes(ci)) continue; const cells=win.cells.map(i=>this.board[i]); if(cells.some(c=>c&&c.symbol!=='Cross')) continue; const n=cells.filter(c=>c&&c.symbol==='Cross').length; w+=(n+1)*(n+1); }
      return {ci,w};
    });
    if(weighted.length===0) return null;
    const isConf=this.effects.confuseNextNpc; if(isConf) this.effects.confuseNextNpc=false;
    const tgt=isConf?weighted.reduce((a,b)=>b.w<a.w?b:a):weighted.reduce((a,b)=>b.w>a.w?b:a);
    return GlobalFunctions.randChoice(weighted.filter(w=>w.w===tgt.w)).ci;
  },

  // ===== Hints =====
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
      return [...new Set(ex)].filter(s=>s!==c.symbol);
    };
    const syms=[card.symbol,...extraSymbols(card)];

    // 拡大/拡張の場合は複数マスを対象とする
    const getTargetSets=(ci)=>{
      if(card.enhance==='横拡張') return [this.getExpandTargets(ci,'right')].filter(Boolean);
      if(card.enhance==='縦拡張') return [this.getExpandTargets(ci,'up')].filter(Boolean);
      if(card.enhance==='拡大')   return [this.getExpandTargets(ci,'rect')].filter(Boolean);
      return [[ci]];
    };

    const qObj={}; GameData.SYMBOLS.forEach(s=>{qObj[s]=GameData.quadMult(s);});

    const empty=this.board.map((v,i)=>(v===null&&!this.blockedCells.has(i))?i:-1).filter(i=>i>=0);
    for(const ci of empty){
      const targetSets=getTargetSets(ci);
      if(targetSets.length===0) continue;
      const targets=targetSets[0];

      // 拡大/拡張の場合、全対象マスが空きかチェック（getExpandTargetsで検証済みだが念のため）
      if(targets.length>1&&targets.some(t=>this.board[t]!==null)) continue;

      let total=0, any=false;
      for(const sym of syms){
        const sim=this.board.slice();
        let bs=card.baseScore;
        const ms=multiMap[card.enhance];
        if(ms&&card.symbol===ms) bs+=20;
        targets.forEach(t=>{ sim[t]={symbol:sym,baseScore:bs,owner:'player',card}; });

        const local=new Set(this.scoredWindowKeys);
        const tryW=(win,idx,multObj)=>{
          if(local.has(idx)) return false;
          if(!targets.some(t=>win.cells.includes(t))) return false;
          const cells=win.cells.map(i=>sim[i]);
          if(cells.some(c=>!c)) return false;
          const s=cells[0].symbol; if(!cells.every(c=>c.symbol===s)) return false;
          if(this.bossEffect?.id==='quad_only'&&!win.isQuad) return false;
          local.add(idx);
          const lb=cells.reduce((acc,c)=>acc+c.baseScore,0)+GameData.CORRECTION_BASE_SCORE;
          const m=multObj[s]+GameData.CORRECTION_MULTIPLIER;
          total+=Math.round(lb*m*GameData.FINAL_MULTIPLIER); any=true; return true;
        };
        this.windows.forEach((win,idx)=>{ if(!win.isQuad) return; if(tryW(win,idx,qObj)) (this.quadSiblings[idx]||[]).forEach(s=>local.add(s)); });
        this.windows.forEach((win,idx)=>{ if(!win.isQuad) tryW(win,idx,GameData.BINGO_MULTIPLIER_BASE); });
      }
      if(any) hints[ci]=total;
    }
    return hints;
  },

  // ===== Input =====
  onCardClick(id){
    if(this.rerollMode){this.toggleRerollCard(id);return;}
    if(this.currentSide!=='player'||this.resultState) return;
    this.selectedCardId=(this.selectedCardId===id)?null:id;
    this.boardInfoCell=null; this.activeRelicId=null; this.renderAll();
  },
  onCellClick(ci){
    if(this.resultState||this.rerollMode) return;

    // カード未選択 → 盤面情報パネル or 塗りつぶし2タップ確定
    if(!this.selectedCardId){
      const occ=this.board[ci];
      if(occ){ this.boardInfoCell=(this.boardInfoCell===ci)?null:ci; this.renderAll(); }
      return;
    }

    const card=GameState.hand.find(c=>c.id===this.selectedCardId);
    if(!card||this.currentSide!=='player') return;
    if(this.blockedCells.has(ci)) return;

    // 拡張・拡大系
    if(card.enhance==='横拡張'){ this.handleExpandPlace(ci,card,'right'); return; }
    if(card.enhance==='縦拡張'){ this.handleExpandPlace(ci,card,'up'); return; }
    if(card.enhance==='拡大'){   this.handleExpandPlace(ci,card,'rect'); return; }

    // 塗りつぶし：1タップ目で対象マスを記憶、2タップ目（同マス）で実行
    if(card.trait==='塗りつぶし'){
      if(this.paintPending===ci){
        // 2タップ目確定
        this.paintPending=null;
        this.executePlacement([ci],card);
      }else{
        // 1タップ目：対象マスを記憶（空きでも埋まってもOK）
        this.paintPending=ci;
        this.boardInfoCell=null;
        this.renderAll();
      }
      return;
    }

    // 通常配置：空きマスのみ
    const occ=this.board[ci];
    if(occ){ this.boardInfoCell=(this.boardInfoCell===ci)?null:ci; this.renderAll(); return; }
    this.paintPending=null; // 他カードで別マスに配置したらpaint選択をクリア
    this.executePlacement([ci],card);
  },

  // 拡張・拡大の配置先計算と2ステップUI
  handleExpandPlace(ci,card,mode){
    const targets=this.getExpandTargets(ci,mode);
    if(!targets){
      this.addLog('この場所には配置できません');
      this.expandPending=null; this.renderAll(); return;
    }
    if(this.expandPending && this.expandPending.firstCi===ci){
      // 2タップ目：確定
      const c=this.expandPending.card;
      this.expandPending=null;
      this.executePlacement(targets,c);
    }else{
      // 1タップ目：起点を記録してハイライト
      this.expandPending={card,targets,firstCi:ci,mode};
      this.boardInfoCell=null; this.renderAll();
    }
  },

  getExpandTargets(startCi,mode){
    const sr=Math.floor(startCi/GameData.BOARD_SIZE);
    const sc=startCi%GameData.BOARD_SIZE;
    // mode: 'right'=横拡張(右1マス), 'up'=縦拡張(上1マス), 'rect'=拡大(右・上・右上)
    let offsets=[];
    if(mode==='right')  offsets=[[0,0],[0,1]];
    if(mode==='up')     offsets=[[0,0],[-1,0]];
    if(mode==='rect')   offsets=[[0,0],[0,1],[-1,0],[-1,1]];
    const targets=[];
    for(const [dr,dc] of offsets){
      const nr=sr+dr, nc=sc+dc;
      if(nr<0||nr>=GameData.BOARD_SIZE||nc<0||nc>=GameData.BOARD_SIZE) return null;
      const idx=this.cellIndex(nr,nc);
      if(this.blockedCells.has(idx)||this.board[idx]!==null) return null;
      targets.push(idx);
    }
    return targets.length>0?targets:null;
  },

  async executePlacement(targets,card){
    const mainCi=targets[0];
    for(const ci of targets){
      // 塗りつぶし以外で置く場合、paintPendingマスへの干渉はしない
      if(this.board[ci]?.card) GameState.discardPile.push(this.board[ci].card);
      this.board[ci]={symbol:card.symbol,baseScore:card.baseScore,owner:'player',card:ci===mainCi?card:null};
    }
    // paintPendingをクリア（自分がpaintで配置した場合も含めリセット）
    this.paintPending=null;
    GameState.hand=GameState.hand.filter(c=>c.id!==card.id);
    if(card.jamming==='サンダー') this.applyThunder();
    const breakActive=this.effects.breakTurns>0;
    const isNeg=card.trait==='ネガティブ';
    this.board.forEach(cell=>{
      if(!cell?.card) return;
      if(cell.card.enhance==='巨大化') cell.baseScore+=3;
      if(cell.card.enhance==='肥大化'){const a=Math.round(GameData.BINGO_MULTIPLIER_BASE[cell.symbol]*2);GameState.currentScore+=Math.max(0,a);}
    });
    if(card.enhance==='ドロー') this.drawOne();
    const newBingos=this.detectNewBingos();
    if(!isNeg) this.turnInRound++;
    if(card.jamming) this.queueJammingEffect(card.jamming,mainCi);
    if(GameState.hasRelic('draw_boost')&&GameState.hand.length<GameState.effectiveHandSize()) this.drawOne();
    this.selectedCardId=null; this.boardInfoCell=null; this.activeRelicId=null;
    this.expandPending=null; this.paintPending=null;
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
  onRelicClick(relicId){
    this.activeRelicId=(this.activeRelicId===relicId)?null:relicId;
    this.boardInfoCell=null; this.selectedCardId=null; this.renderAll();
  },
  sellRelic(relicId){
    const idx=GameState.relics.findIndex(r=>r.id===relicId); if(idx<0) return;
    const relic=GameState.relics[idx];
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
    if(this.bossEffect){const bt=document.createElement('div');bt.className='boss-tag';bt.textContent=`ボス効果：${this.bossEffect.name}`;wrap.appendChild(bt);}
    const ba=document.createElement('div'); ba.className='board-area';
    ba.appendChild(this.renderMultLegend()); ba.appendChild(this.renderBoard());
    const ep=this.renderEffectsPanel(); if(ep) ba.appendChild(ep);
    wrap.appendChild(ba);
    const bi=this.renderBoardInfoPanel(); if(bi) wrap.appendChild(bi);
    wrap.appendChild(this.renderHand());
    const hi=this.renderHandInfoPanel(); if(hi) wrap.appendChild(hi);
    wrap.appendChild(this.renderRelicRow());
    // レリック売却パネル
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

    // 加算点数欄（点数計算中のみ表示）
    let addScoreHtml='';
    if(this.scoringAnim){
      const a=this.scoringAnim;
      const cardSum=a.lineBase-(a.relicBonus||0)-GameData.CORRECTION_BASE_SCORE;
      const relicPart=a.relicBonus>0?`+${a.relicBonus}（レリック補正）`:'';
      addScoreHtml=`<div class="add-score-bar">
        <span class="as-label">加算基礎点：</span>
        <span class="as-cards">${cardSum}</span>
        ${relicPart?`<span class="as-relic">${relicPart}</span>`:''}
        <span class="as-eq">= ${a.lineBase} × ${Math.round(a.mult*10)/10}倍</span>
      </div>`;
    }

    const stats=[['ステージ',this.stage.name],['ラウンド',`${GameState.round} / ${GameState.effectiveMaxRounds()}`],['目標点数',GlobalFunctions.formatScore(GameState.targetScore)],['現在点数',GlobalFunctions.formatScore(live),sparkle],['所持G',GameState.gold],['山札',GameState.drawPile.length],['捨て札',GameState.discardPile.length]];
    const row=document.createElement('div'); row.style.cssText='display:flex;flex-wrap:wrap;gap:16px;width:100%;';
    for(const [label,val,sp] of stats){const d=document.createElement('div');d.className='stat';d.innerHTML=`<div class="label">${label}</div><div class="value${sp?' sparkle':''}">${val}</div>`;row.appendChild(d);}
    bar.appendChild(row);
    if(addScoreHtml){ const div=document.createElement('div');div.innerHTML=addScoreHtml;bar.appendChild(div); }
    holder.appendChild(bar);
    const outer=document.createElement('div');outer.className='progress-outer';outer.style.marginTop='10px';
    const inner=document.createElement('div');inner.className='progress-inner';inner.style.width=pct+'%';
    outer.appendChild(inner);holder.appendChild(outer);
    return holder;
  },

  effectDotClasses(card){ if(!card) return []; const d=[]; if(card.jamming) d.push('dot-jamming'); if(card.enhance) d.push('dot-enhance'); if(card.trait) d.push('dot-trait'); return d; },
  cardTagsHtml(card){ let h=''; if(card.jamming) h+=`<div class="card-tag card-tag-jamming">${card.jamming}</div>`; if(card.enhance) h+=`<div class="card-tag card-tag-enhance">${card.enhance}</div>`; if(card.trait) h+=`<div class="card-tag card-tag-trait">${card.trait}</div>`; return h; },
  cardInfoDescHtml(card){ const l=[]; if(card.jamming) l.push(`<div class="info-desc">【${card.jamming}】${GameData.JAMMING_DESC[card.jamming]||''}</div>`); if(card.enhance) l.push(`<div class="info-desc">【${card.enhance}】${GameData.ENHANCE_DESC[card.enhance]||''}</div>`); if(card.trait) l.push(`<div class="info-desc">【${card.trait}】${GameData.TRAIT_DESC[card.trait]||''}</div>`); return l.length>0?l.join(''):'<div class="info-desc">効果なし</div>'; },

  renderMultLegend(){
    const legend=document.createElement('div'); legend.className='mult-legend';
    const rows=GameData.SYMBOLS.map(s=>{const base=GameData.BINGO_MULTIPLIER_BASE[s]+GameData.CORRECTION_MULTIPLIER;const quad=Math.round(GameData.quadMult(s)+GameData.CORRECTION_MULTIPLIER);const f=v=>v>=0?'+'+Math.round(v):String(Math.round(v));return`<tr><td class="sym-${s}">${GameData.SYMBOL_LABEL[s]}</td><td>${f(base)}</td><td>${f(quad)}</td></tr>`;}).join('');
    legend.innerHTML=`<table><tr><th></th><th>基礎</th><th>4列</th></tr>${rows}</table>`;
    return legend;
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
      const canPaint=this.selectedCardId&&GameState.hand.find(c=>c.id===this.selectedCardId)?.trait==='塗りつぶし';
      const canPlace=this.currentSide==='player'&&!this.resultState&&!this.rerollMode&&(cd===null||canPaint)&&this.selectedCardId&&!isBlocked;
      cellEl.className='cell '+(isBlocked?'blocked':(cd===null?(canPlace?'empty':'disabled'):''));
      if(isBlocked){ cellEl.textContent='✕'; cellEl.style.color='#333'; }
      else if(cd){
        const sym=document.createElement('div'); sym.className='sym-'+cd.symbol;
        // ブラックアウト：盤面に出したら表示
        sym.textContent=GameData.SYMBOL_LABEL[cd.symbol];
        cellEl.appendChild(sym);
        const st=document.createElement('div');st.className='cell-score';st.textContent=cd.baseScore;cellEl.appendChild(st);
        const dcs=this.effectDotClasses(cd.card);
        if(dcs.length>0){const dots=document.createElement('div');dots.className='cell-dots';dcs.forEach(dc=>{const dot=document.createElement('div');dot.className='cell-dot '+dc;dots.appendChild(dot);});cellEl.appendChild(dots);}
        if(sc.includes(i)){cellEl.classList.add('scoring-cell');const badge=document.createElement('div');badge.className='score-badge';badge.textContent='+'+cd.baseScore;cellEl.appendChild(badge);}
      }else if(hints[i]!==undefined){
        cellEl.classList.add('hint-blink');
        const bubble=document.createElement('div');bubble.className='cell-bubble';bubble.textContent=`予測+${GlobalFunctions.formatScore(hints[i])}`;cellEl.appendChild(bubble);
      }
      if(expandTargets.has(i)) cellEl.classList.add('expand-highlight');
      if(paintTarget===i) cellEl.classList.add('paint-highlight');
      cellEl.addEventListener('click',()=>this.onCellClick(i));
      board.appendChild(cellEl);
    }
    wrapper.appendChild(board); return wrapper;
  },

  renderEffectsPanel(){
    const entries=[];
    this.board.forEach((cd,i)=>{const card=cd&&cd.card;if(card&&(card.jamming||card.enhance||card.trait)) entries.push({i,symbol:cd.symbol,card});});
    if(!entries.length) return null;
    const panel=document.createElement('div');panel.className='effects-panel';panel.innerHTML='<h3>盤面効果一覧</h3>';
    entries.forEach(e=>{const r=Math.floor(e.i/GameData.BOARD_SIZE)+1,c=(e.i%GameData.BOARD_SIZE)+1;const names=[e.card.jamming,e.card.enhance,e.card.trait].filter(Boolean).join('・');const entry=document.createElement('div');entry.className='effect-entry';entry.innerHTML=`<div class="eff-head"><span class="sym-${e.symbol}">${GameData.SYMBOL_LABEL[e.symbol]}</span> ${names}（${r}行${c}列）</div><div class="eff-desc">${this.cardInfoDescHtml(e.card)}</div>`;panel.appendChild(entry);});
    return panel;
  },

  renderBoardInfoPanel(){
    if(this.boardInfoCell===null) return null;
    const cd=this.board[this.boardInfoCell]; if(!cd) return null;
    const panel=document.createElement('div');panel.className='info-panel';
    panel.innerHTML=`<div class="info-title sym-${cd.symbol}">${GameData.SYMBOL_LABEL[cd.symbol]} 基礎点${cd.baseScore}</div>${this.cardInfoDescHtml(cd.card||{})}`;
    return panel;
  },

  renderHand(){
    const area=document.createElement('div');area.className='hand-area';
    const row=document.createElement('div');row.className='hand-row';
    for(const card of GameState.hand){
      const c=document.createElement('div');
      const isSel=!this.rerollMode&&this.selectedCardId===card.id;
      const isRe=this.rerollMode&&this.rerollSelected.has(card.id);
      c.className='card'+(isSel?' selected':'')+(isRe?' reroll-selected':'');
      if(this.bossBlackedOut&&!isSel){
        c.innerHTML=`<div class="card-symbol" style="color:#fff;font-size:22px;">？</div>${this.cardTagsHtml(card)}`;
      }else{
        c.innerHTML=`<div class="card-symbol sym-${card.symbol}">${GameData.SYMBOL_LABEL[card.symbol]}</div><div class="card-number">${card.baseScore}</div>${this.cardTagsHtml(card)}`;
      }
      c.addEventListener('click',()=>this.onCardClick(card.id));
      row.appendChild(c);
    }
    area.appendChild(row); return area;
  },

  renderHandInfoPanel(){
    if(this.rerollMode||!this.selectedCardId) return null;
    const card=GameState.hand.find(c=>c.id===this.selectedCardId); if(!card) return null;
    const panel=document.createElement('div');panel.className='info-panel';
    panel.innerHTML=`<div class="info-title sym-${card.symbol}">${GameData.SYMBOL_LABEL[card.symbol]} 基礎点${card.baseScore}</div>${this.cardInfoDescHtml(card)}`;
    return panel;
  },

  renderRelicRow(){
    const row=document.createElement('div');row.className='relic-display-row';
    if(GameState.relics.length===0){
      const empty=document.createElement('div');empty.className='relic-empty';empty.textContent='レリックなし';row.appendChild(empty);
    }else{
      GameState.relics.forEach(relic=>{
        const rc=document.createElement('div');
        const isActive=this.activeRelicId===relic.id;
        const isScoring=this.scoringRelicIds.includes(relic.id);
        rc.className='relic-card'+(isActive?' active':'')+(isScoring?' bounce':'');
        rc.innerHTML=`<div class="relic-name">${relic.name}</div>${relic.relicEnhance?`<div class="relic-enhance-tag">${GameData.RELIC_ENHANCE_POOL.find(r=>r.id===relic.relicEnhance)?.name||''}</div>`:''}`;
        rc.addEventListener('click',()=>this.onRelicClick(relic.id));
        row.appendChild(rc);
      });
    }
    const maxEl=document.createElement('div');maxEl.className='relic-capacity';maxEl.textContent=`${GameState.relics.length} / ${GameState.effectiveMaxRelics()}`;
    row.appendChild(maxEl);
    return row;
  },

  renderRelicInfoPanel(){
    const relic=GameState.relics.find(r=>r.id===this.activeRelicId); if(!relic) return null;
    const panel=document.createElement('div');panel.className='info-panel relic-info-panel';
    const ren=GameData.RELIC_ENHANCE_POOL.find(r=>r.id===relic.relicEnhance);
    const hasEnhance=!!ren;
    let sellPrice=1; if(relic.relicEnhance==='ren_discard_sell') sellPrice=Math.floor(GameState.currentDeck.length/2); else if(hasEnhance) sellPrice+=2;
    panel.innerHTML=`
      <div class="info-title">${relic.name}</div>
      <div class="info-desc">${relic.desc}</div>
      ${hasEnhance?`<div class="info-desc relic-enhance-desc">【${ren.name}】${ren.desc}</div>`:''}
      <button class="sell-relic-btn">売却（${sellPrice}G）</button>
    `;
    panel.querySelector('.sell-relic-btn').addEventListener('click',()=>this.sellRelic(relic.id));
    return panel;
  },

  renderControls(){
    const controls=document.createElement('div');controls.className='controls-row';
    if(this.rerollMode){
      const okBtn=document.createElement('button');okBtn.textContent=`確定（${this.rerollSelected.size}枚）`;okBtn.disabled=this.rerollSelected.size===0;okBtn.addEventListener('click',()=>this.confirmReroll());controls.appendChild(okBtn);
      const cancelBtn=document.createElement('button');cancelBtn.textContent='キャンセル';cancelBtn.addEventListener('click',()=>this.cancelReroll());controls.appendChild(cancelBtn);
    }else{
      const rBtn=document.createElement('button');rBtn.textContent=`リロール（残り${GameState.rerollCount}）`;rBtn.disabled=GameState.rerollCount<=0||this.currentSide!=='player'||this.bossEffect?.id==='reroll_limit';rBtn.addEventListener('click',()=>this.enterRerollMode());controls.appendChild(rBtn);
    }
    return controls;
  },

  renderLog(){ const p=document.createElement('div');p.className='log-panel';p.innerHTML=this.logs.map(l=>`<div>${l}</div>`).join('');p.scrollTop=p.scrollHeight;return p; },

  renderResult(){
    const el=document.createElement('div');el.className='result-screen';
    const win=this.resultState==='win';
    const goShop=win&&this.stage.key!=='boss';
    const r=GameState.lastReward;
    const gr=(win&&r?.breakdown)?`<div class="gold-reveal-popup"><div class="gr-label">獲得ゴールド</div><div class="gr-total">+${r.gold}G</div><div class="gr-breakdown">基礎G+${r.breakdown.base} ＋ 早期G+${r.breakdown.bonus} ＋ 基本G+${r.breakdown.flat}</div></div>`:'';
    el.innerHTML=`<div class="result-title ${win?'win':'lose'}">${win?'STAGE CLEAR':'GAME OVER'}</div><div>最終点数：${GlobalFunctions.formatScore(GameState.currentScore)} / ${GlobalFunctions.formatScore(GameState.targetScore)}</div>${gr}<button id="btn-next">${goShop?'ショップへ':'マップに戻る'}</button>`;
    setTimeout(()=>{el.querySelector('#btn-next').addEventListener('click',()=>{ if(goShop) App.showShop(); else App.showMapSelect(); });});
    return el;
  },
};
