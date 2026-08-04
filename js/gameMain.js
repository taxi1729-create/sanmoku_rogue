// ゲーム本編：三目並べコア、点数計算（リアルタイム加算演出）、ターン/ラウンド管理、敵AI、ジャミング効果を扱うシーン
const GameMainScene = {
  container: null,
  stage: null,

  board: [],
  windows: [],
  scoredWindowKeys: new Set(),
  turnInRound: 1,
  currentSide: 'player',
  selectedCardId: null,
  boardInfoCell: null,
  logs: [],
  resultState: null,

  scoringAnim: null,   // { cells, symbol, liveScore, reached } 点数加算演出中の状態

  rerollMode: false,
  rerollSelected: new Set(),

  effects: {
    stunNextNpc: false,
    confuseNextNpc: false,
    breakTurns: 0,
    linkRestrict: null,
  },

  sleep(ms){ return new Promise(res => setTimeout(res, ms)); },

  // ===== 初期化 =====
  render(container, stage){
    this.container = container;
    this.stage = stage;
    this.board = new Array(GameData.BOARD_SIZE * GameData.BOARD_SIZE).fill(null);
    this.windows = this.buildWindows(GameData.BOARD_SIZE);
    this.logs = [];
    this.resultState = null;
    this.boardInfoCell = null;
    this.scoringAnim = null;
    this.rerollMode = false;
    this.rerollSelected = new Set();
    this.effects = { stunNextNpc:false, confuseNextNpc:false, breakTurns:0, linkRestrict:null };
    GameState.initStage(stage);
    this.startRound();
  },

  cellIndex(r, c){ return r * GameData.BOARD_SIZE + c; },

  buildWindows(size){
    const dirs = [
      { dr:0, dc:1, type:'row' },
      { dr:1, dc:0, type:'col' },
      { dr:1, dc:1, type:'diag' },
      { dr:1, dc:-1, type:'diag' },
    ];
    const maximal = [];
    for(const { dr, dc, type } of dirs){
      for(let r = 0; r < size; r++){
        for(let c = 0; c < size; c++){
          const pr = r - dr, pc = c - dc;
          if(pr >= 0 && pr < size && pc >= 0 && pc < size) continue;
          const line = [];
          let rr = r, cc = c;
          while(rr >= 0 && rr < size && cc >= 0 && cc < size){
            line.push(this.cellIndex(rr, cc));
            rr += dr; cc += dc;
          }
          if(line.length >= 3) maximal.push({ line, type });
        }
      }
    }
    const windows = [];
    const quadSiblings = {};
    for(const { line, type } of maximal){
      if(line.length === 4){
        const quadIdx = windows.length;
        windows.push({ cells: line.slice(0, 4), type, isQuad:true });
        const sub1Idx = windows.length;
        windows.push({ cells: line.slice(0, 3), type, isQuad:false });
        const sub2Idx = windows.length;
        windows.push({ cells: line.slice(1, 4), type, isQuad:false });
        quadSiblings[quadIdx] = [sub1Idx, sub2Idx];
      }else{
        windows.push({ cells: line, type, isQuad:false });
      }
    }
    this.quadSiblings = quadSiblings;
    return windows;
  },

  // ===== ラウンド制御 =====
  startRound(){
    this.board = new Array(GameData.BOARD_SIZE * GameData.BOARD_SIZE).fill(null);
    this.scoredWindowKeys = new Set();
    this.turnInRound = 1;
    this.currentSide = (GameState.round % 2 === 1) ? 'player' : 'npc';
    this.selectedCardId = null;
    this.boardInfoCell = null;
    this.rerollMode = false;
    this.rerollSelected = new Set();
    this.effects.linkRestrict = null;
    this.drawToHandSize();
    this.addLog(`--- ラウンド ${GameState.round} 開始（先手：${this.currentSide === 'player' ? 'プレイヤー' : 'NPC'}） ---`);
    this.renderAll();
    if(this.currentSide === 'npc') this.scheduleAIMove();
  },

  endRound(){
    for(const cell of this.board){
      if(cell && cell.card) GameState.discardPile.push(cell.card);
    }
    GameState.discardPile.push(...GameState.hand);
    GameState.hand = [];

    if(GameState.currentScore >= GameState.targetScore){
      this.finishStage('win');
      return;
    }
    if(GameState.round >= GameState.effectiveMaxRounds()){
      this.finishStage('lose');
      return;
    }
    GameState.round++;
    this.startRound();
  },

  finishStage(result){
    this.resultState = result;
    if(result === 'win'){
      if(this.stage && !GameState.clearedStages.includes(this.stage.key)){
        GameState.clearedStages.push(this.stage.key);
      }
      const rewardDetail = this.calcClearReward();
      GameState.gold += rewardDetail.total;
      GameState.lastReward = { type:'clear', stageName: this.stage.name, gold: rewardDetail.total, breakdown: rewardDetail };
      this.addLog(`クリア報酬：基礎G+${rewardDetail.base} 早期クリアボーナスG+${rewardDetail.bonus}（合計G+${rewardDetail.total}）`);
    }
    this.renderAll();
  },

  calcClearReward(){
    const base = GameData.CLEAR_REWARD_BASE[this.stage.key] || 3;
    const bonus = Math.max(0, GameState.effectiveMaxRounds() - GameState.round);
    return { base, bonus, total: base + bonus };
  },

  // ===== 山札・手札 =====
  drawToHandSize(){
    const need = GameState.effectiveHandSize() - GameState.hand.length;
    for(let i = 0; i < need; i++) this.drawOne();
  },

  drawOne(){
    if(GameState.drawPile.length === 0){
      if(GameState.discardPile.length === 0) return;
      GameState.drawPile = GlobalFunctions.shuffle(GameState.discardPile);
      GameState.discardPile = [];
      this.addLog('山札切れ：捨て札をシャッフルして山札に戻した');
    }
    const card = GameState.drawPile.pop();
    if(card) GameState.hand.push(card);
  },

  // ===== リロール（複数選択→まとめて入れ替え） =====
  enterRerollMode(){
    if(this.currentSide !== 'player' || this.resultState || GameState.rerollCount <= 0) return;
    this.rerollMode = true;
    this.rerollSelected = new Set();
    this.selectedCardId = null;
    this.boardInfoCell = null;
    this.renderAll();
  },

  cancelReroll(){
    this.rerollMode = false;
    this.rerollSelected = new Set();
    this.renderAll();
  },

  toggleRerollCard(cardId){
    if(this.rerollSelected.has(cardId)) this.rerollSelected.delete(cardId);
    else this.rerollSelected.add(cardId);
    this.renderAll();
  },

  confirmReroll(){
    if(!this.rerollMode || this.rerollSelected.size === 0 || GameState.rerollCount <= 0) return;
    GameState.rerollCount--;
    const selectedCards = GameState.hand.filter(c => this.rerollSelected.has(c.id));
    GameState.hand = GameState.hand.filter(c => !this.rerollSelected.has(c.id));
    GameState.discardPile.push(...selectedCards);
    const n = selectedCards.length;
    for(let i = 0; i < n; i++) this.drawOne();
    this.addLog(`カードを${n}枚リロールした（残り${GameState.rerollCount}回）`);
    this.rerollMode = false;
    this.rerollSelected = new Set();
    this.renderAll();
  },

  // ===== ジャミング効果 =====
  applyThunder(){
    let removed = 0;
    for(let i = 0; i < this.board.length; i++){
      if(this.board[i] && this.board[i].symbol === 'Cross'){ this.board[i] = null; removed++; }
    }
    if(removed > 0) this.addLog(`サンダー発動：盤面の×を${removed}個除去した`);
  },

  queueJammingEffect(jamming, cellIdx){
    switch(jamming){
      case 'スタン':
        this.effects.stunNextNpc = true;
        this.addLog('スタン発動：次のNPCの行動を封じる');
        break;
      case '混乱':
        this.effects.confuseNextNpc = true;
        this.addLog('混乱発動：次のNPCは最低スコアのマスに配置する');
        break;
      case 'ブレイク':
        this.effects.breakTurns = 4;
        this.addLog('ブレイク発動：4ターンの間、×単独のビンゴではラウンドが終了しない');
        break;
      case 'リンク': {
        const r = Math.floor(cellIdx / GameData.BOARD_SIZE);
        const c = cellIdx % GameData.BOARD_SIZE;
        const dirs = [[-1,0],[1,0],[0,-1],[0,1]]; // 上下左右（十字）のみ
        const candidates = [];
        for(const [dr, dc] of dirs){
          const nr = r + dr, nc = c + dc;
          if(nr >= 0 && nr < GameData.BOARD_SIZE && nc >= 0 && nc < GameData.BOARD_SIZE){
            candidates.push(this.cellIndex(nr, nc));
          }
        }
        const validEmpty = candidates.filter(i => this.board[i] === null);
        if(validEmpty.length === 0){
          this.effects.stunNextNpc = true;
          this.addLog('リンク発動：隣接マスが無いためNPCはスタン状態になる');
        }else{
          this.effects.linkRestrict = validEmpty;
          this.addLog('リンク発動：次のNPCの配置マスを隣接（十字）マスに制限した');
        }
        break;
      }
      default:
        break; // 延命・ビンゴ阻害は盤面上に存在する間ずっと働く受動効果
    }
  },

  countBoardJamming(name){
    return this.board.filter(c => c && c.card && c.card.jamming === name).length;
  },

  // ===== 配置・判定 =====
  async placeCard(cellIdx, symbol, baseScore, owner, card){
    // ブレイクは「発動した次のターンから」効くようにするため、このターン開始時点の状態を確定させておく
    const breakActiveThisTurn = this.effects.breakTurns > 0;

    this.board[cellIdx] = { symbol, baseScore, owner, card };
    if(card) GameState.hand = GameState.hand.filter(c => c.id !== card.id);

    if(card && card.jamming === 'サンダー') this.applyThunder();

    const newBingos = this.detectNewBingos();

    this.turnInRound++;

    if(card && card.jamming) this.queueJammingEffect(card.jamming, cellIdx);

    this.selectedCardId = null;
    this.boardInfoCell = null;
    this.renderAll();

    if(newBingos.length > 0){
      await this.playScoreSequence(newBingos);
    }

    const endByBingo = this.shouldBingoEndRound(newBingos, breakActiveThisTurn);

    if(breakActiveThisTurn && this.effects.breakTurns > 0) this.effects.breakTurns--;

    if(endByBingo || this.turnInRound > GameState.effectiveTurnsPerRound()){
      this.renderAll();
      await this.sleep(300);
      this.endRound();
      return;
    }

    this.currentSide = this.currentSide === 'player' ? 'npc' : 'player';
    this.renderAll();
    if(this.currentSide === 'npc') this.scheduleAIMove();
  },

  detectNewBingos(){
    const results = [];
    const lifeExtendCount = this.countBoardJamming('延命');
    const blockCount = this.countBoardJamming('ビンゴ阻害');

    const evalWindow = (win) => {
      const cells = win.cells.map(i => this.board[i]);
      if(cells.some(c => !c)) return null;
      const symbol = cells[0].symbol;
      if(!cells.every(c => c.symbol === symbol)) return null;
      if(symbol === 'Cross'){
        if(blockCount >= 4) return null;
        if((lifeExtendCount > 0 || blockCount >= 2) && win.cells.length === 3) return null;
        if(blockCount >= 1 && win.type === 'diag') return null;
      }
      return { symbol, cells };
    };

    const makeResult = (idx, win, r, mult) => {
      const cardScores = r.cells.map(c => c.baseScore);
      const lineBase = cardScores.reduce((s, v) => s + v, 0) + GameData.CORRECTION_BASE_SCORE;
      const finalMult = mult + GameData.CORRECTION_MULTIPLIER;
      const score = lineBase * finalMult * GameData.FINAL_MULTIPLIER;
      return { idx, symbol: r.symbol, cells: win.cells, cardScores, lineBase, mult: finalMult, score, isQuad: win.isQuad };
    };

    // パス1：4マスビンゴを優先判定。内包される3マス側は重複加算しないよう消費済みにする
    this.windows.forEach((win, idx) => {
      if(!win.isQuad || this.scoredWindowKeys.has(idx)) return;
      const r = evalWindow(win);
      if(!r) return;
      this.scoredWindowKeys.add(idx);
      (this.quadSiblings[idx] || []).forEach(s => this.scoredWindowKeys.add(s));
      results.push(makeResult(idx, win, r, GameData.BINGO_MULTIPLIER_QUAD[r.symbol]));
    });

    // パス2：4マスに内包されなかった3マスビンゴを判定
    this.windows.forEach((win, idx) => {
      if(win.isQuad || this.scoredWindowKeys.has(idx)) return;
      const r = evalWindow(win);
      if(!r) return;
      this.scoredWindowKeys.add(idx);
      results.push(makeResult(idx, win, r, GameData.BINGO_MULTIPLIER_BASE[r.symbol]));
    });

    return results;
  },

  shouldBingoEndRound(newBingos, breakActiveThisTurn){
    if(newBingos.length === 0) return false;
    if(breakActiveThisTurn){
      return newBingos.some(b => b.symbol !== 'Cross');
    }
    return true;
  },

  // ===== 点数計算：リアルタイム加算演出 =====
  async playScoreSequence(newBingos){
    for(const b of newBingos){
      await this.showScoreStep(b);
    }
  },

  async showScoreStep(b){
    const before = GameState.currentScore;
    const after = before + b.score;

    // 計算に使われているマスをポップアップ表示
    this.scoringAnim = { cells: b.cells, symbol: b.symbol, liveScore: before, reached:false };
    this.renderAll();
    await this.sleep(400);

    // 現在点数がリアルタイムで加算されていく様子を表示
    const steps = 20;
    const duration = 1000;
    for(let s = 1; s <= steps; s++){
      this.scoringAnim.liveScore = Math.round(before + (after - before) * (s / steps));
      this.renderAll();
      await this.sleep(duration / steps);
    }

    GameState.currentScore = after;
    this.scoringAnim.liveScore = after;
    this.scoringAnim.reached = GameState.currentScore >= GameState.targetScore;
    this.addLog(`${GameData.SYMBOL_LABEL[b.symbol]}ビンゴ！ 獲得 ${GlobalFunctions.formatScore(b.score)}点（合計 ${GlobalFunctions.formatScore(GameState.currentScore)}点）`);
    this.renderAll();
    await this.sleep(900);

    this.scoringAnim = null;
    this.renderAll();
  },

  // ===== 敵AI =====
  async scheduleAIMove(){
    await this.sleep(500);
    if(this.currentSide !== 'npc' || this.resultState) return;

    if(this.effects.stunNextNpc){
      this.effects.stunNextNpc = false;
      this.addLog('NPCはスタンして行動できなかった');
      this.turnInRound++;
      if(this.effects.breakTurns > 0) this.effects.breakTurns--;
      if(this.turnInRound > GameState.effectiveTurnsPerRound()){
        this.renderAll();
        await this.sleep(300);
        this.endRound();
        return;
      }
      this.currentSide = 'player';
      this.renderAll();
      return;
    }

    const cellIdx = this.chooseAICell();
    if(cellIdx === null){ this.endRound(); return; }
    await this.placeCard(cellIdx, 'Cross', 10, 'npc', null);
  },

  chooseAICell(){
    let emptyCells = this.board.map((v, i) => v === null ? i : -1).filter(i => i >= 0);

    if(this.effects.linkRestrict && this.effects.linkRestrict.length > 0){
      const restricted = this.effects.linkRestrict.filter(i => this.board[i] === null);
      if(restricted.length > 0) emptyCells = restricted;
      this.effects.linkRestrict = null;
    }

    const weighted = emptyCells.map(cellIdx => {
      let weight = 0;
      for(const win of this.windows){
        if(!win.cells.includes(cellIdx)) continue;
        const cells = win.cells.map(i => this.board[i]);
        const blocked = cells.some(c => c && c.symbol !== 'Cross');
        if(blocked) continue;
        const crossCount = cells.filter(c => c && c.symbol === 'Cross').length;
        weight += (crossCount + 1) * (crossCount + 1);
      }
      return { cellIdx, weight };
    });

    if(weighted.length === 0) return null;

    const isConfused = this.effects.confuseNextNpc;
    if(isConfused) this.effects.confuseNextNpc = false;

    let target = isConfused
      ? weighted.reduce((a, b) => (b.weight < a.weight ? b : a))
      : weighted.reduce((a, b) => (b.weight > a.weight ? b : a));
    const bestSet = weighted.filter(w => w.weight === target.weight);
    return GlobalFunctions.randChoice(bestSet).cellIdx;
  },

  // ===== 配置予測ヒント =====
  computeHints(){
    const hints = {};
    if(this.rerollMode) return hints;
    if(this.currentSide !== 'player' || !this.selectedCardId || this.resultState) return hints;
    const card = GameState.hand.find(c => c.id === this.selectedCardId);
    if(!card) return hints;

    const emptyCells = this.board.map((v, i) => v === null ? i : -1).filter(i => i >= 0);
    for(const cellIdx of emptyCells){
      const simBoard = this.board.slice();
      simBoard[cellIdx] = { symbol: card.symbol, baseScore: card.baseScore, owner:'player', card };
      let total = 0, any = false;
      const localScored = new Set(this.scoredWindowKeys);

      const tryWindow = (win, idx, mult) => {
        if(localScored.has(idx)) return false;
        if(!win.cells.includes(cellIdx)) return false;
        const cells = win.cells.map(i => simBoard[i]);
        if(cells.some(c => !c)) return false;
        const symbol = cells[0].symbol;
        if(!cells.every(c => c.symbol === symbol)) return false;
        localScored.add(idx);
        const lineBase = cells.reduce((s, c) => s + c.baseScore, 0) + GameData.CORRECTION_BASE_SCORE;
        const finalMult = mult[symbol] + GameData.CORRECTION_MULTIPLIER;
        total += lineBase * finalMult * GameData.FINAL_MULTIPLIER;
        any = true;
        return true;
      };

      // 4マスを優先判定し、内包される3マス側の重複加算を避ける
      this.windows.forEach((win, idx) => {
        if(!win.isQuad) return;
        if(tryWindow(win, idx, GameData.BINGO_MULTIPLIER_QUAD)){
          (this.quadSiblings[idx] || []).forEach(s => localScored.add(s));
        }
      });
      this.windows.forEach((win, idx) => {
        if(win.isQuad) return;
        tryWindow(win, idx, GameData.BINGO_MULTIPLIER_BASE);
      });

      if(any) hints[cellIdx] = total;
    }
    return hints;
  },

  // ===== 操作 =====
  onCardClick(cardId){
    if(this.rerollMode){ this.toggleRerollCard(cardId); return; }
    if(this.currentSide !== 'player' || this.resultState) return;
    this.selectedCardId = (this.selectedCardId === cardId) ? null : cardId;
    this.boardInfoCell = null;
    this.renderAll();
  },

  onCellClick(cellIdx){
    if(this.resultState || this.rerollMode) return;
    const occupant = this.board[cellIdx];
    if(occupant){
      this.boardInfoCell = (this.boardInfoCell === cellIdx) ? null : cellIdx;
      this.renderAll();
      return;
    }
    if(this.currentSide !== 'player' || !this.selectedCardId) return;
    const card = GameState.hand.find(c => c.id === this.selectedCardId);
    if(!card) return;
    this.placeCard(cellIdx, card.symbol, card.baseScore, 'player', card);
  },

  addLog(text){
    this.logs.push(text);
    if(this.logs.length > 60) this.logs.shift();
  },

  // ===== 描画 =====
  renderAll(){
    this.container.innerHTML = '';

    if(this.resultState){
      this.container.appendChild(this.renderResult());
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'game-screen';

    wrap.appendChild(this.renderStatusBar());

    const turnEl = document.createElement('div');
    turnEl.className = 'turn-indicator ' + this.currentSide;
    turnEl.textContent = this.currentSide === 'player'
      ? `あなたの番（ターン ${this.turnInRound} / ${GameState.effectiveTurnsPerRound()}）`
      : `NPCの番（ターン ${this.turnInRound} / ${GameState.effectiveTurnsPerRound()}）`;
    wrap.appendChild(turnEl);

    const boardArea = document.createElement('div');
    boardArea.className = 'board-area';
    boardArea.appendChild(this.renderMultLegend());
    boardArea.appendChild(this.renderBoard());
    const effectsPanel = this.renderEffectsPanel();
    if(effectsPanel) boardArea.appendChild(effectsPanel);
    wrap.appendChild(boardArea);

    const boardInfo = this.renderBoardInfoPanel();
    if(boardInfo) wrap.appendChild(boardInfo);

    wrap.appendChild(this.renderHand());

    const handInfo = this.renderHandInfoPanel();
    if(handInfo) wrap.appendChild(handInfo);

    wrap.appendChild(this.renderControls());
    wrap.appendChild(this.renderLog());

    this.container.appendChild(wrap);
  },

  renderStatusBar(){
    const holder = document.createElement('div');
    holder.style.width = '100%';

    const bar = document.createElement('div');
    bar.className = 'status-bar';
    bar.style.flexDirection = 'column';
    bar.style.alignItems = 'flex-start';

    const liveScore = this.scoringAnim ? this.scoringAnim.liveScore : GameState.currentScore;
    const sparkling = this.scoringAnim && this.scoringAnim.reached;
    const pct = Math.min(100, Math.floor((liveScore / GameState.targetScore) * 100));

    const stats = [
      ['ステージ', this.stage.name],
      ['ラウンド', `${GameState.round} / ${GameState.effectiveMaxRounds()}`],
      ['目標点数', GlobalFunctions.formatScore(GameState.targetScore)],
      ['現在点数', GlobalFunctions.formatScore(liveScore), sparkling],
      ['所持G', GameState.gold],
      ['山札', GameState.drawPile.length],
      ['捨て札', GameState.discardPile.length],
    ];
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.flexWrap = 'wrap';
    row.style.gap = '16px';
    row.style.width = '100%';
    for(const [label, value, sparkle] of stats){
      const d = document.createElement('div');
      d.className = 'stat';
      d.innerHTML = `<div class="label">${label}</div><div class="value${sparkle ? ' sparkle' : ''}">${value}</div>`;
      row.appendChild(d);
    }
    bar.appendChild(row);

    // レリック一覧（ステージ情報の左下）
    const relicRow = document.createElement('div');
    relicRow.className = 'relic-row';
    relicRow.innerHTML = `<span class="label">レリック</span>${GameState.relics.length ? GameState.relics.map(r => r.name).join('、') : 'なし'}`;
    bar.appendChild(relicRow);

    holder.appendChild(bar);

    const outer = document.createElement('div');
    outer.className = 'progress-outer';
    outer.style.marginTop = '10px';
    const inner = document.createElement('div');
    inner.className = 'progress-inner';
    inner.style.width = pct + '%';
    outer.appendChild(inner);
    holder.appendChild(outer);

    return holder;
  },

  jammingDotClass(jamming){
    if(!jamming) return null;
    return 'dot-jamming'; // 強化(黄)・性質変化(青)はChap4で使用予定
  },

  renderBoard(){
    const wrapper = document.createElement('div');
    wrapper.className = 'board-wrapper';

    const board = document.createElement('div');
    board.className = 'board';

    const hints = this.computeHints();
    const scoringCells = this.scoringAnim ? this.scoringAnim.cells : [];

    for(let i = 0; i < this.board.length; i++){
      const cellData = this.board[i];
      const cellEl = document.createElement('div');
      const canPlace = this.currentSide === 'player' && !this.resultState && !this.rerollMode && cellData === null && this.selectedCardId;
      cellEl.className = 'cell ' + (cellData === null ? (canPlace ? 'empty' : 'disabled') : '');

      if(cellData){
        const sym = document.createElement('div');
        sym.className = 'sym-' + cellData.symbol;
        sym.textContent = GameData.SYMBOL_LABEL[cellData.symbol];
        cellEl.appendChild(sym);

        const scoreTag = document.createElement('div');
        scoreTag.className = 'cell-score';
        scoreTag.textContent = cellData.baseScore;
        cellEl.appendChild(scoreTag);

        const jamming = cellData.card && cellData.card.jamming;
        const dotClass = this.jammingDotClass(jamming);
        if(dotClass){
          const dots = document.createElement('div');
          dots.className = 'cell-dots';
          const dot = document.createElement('div');
          dot.className = 'cell-dot ' + dotClass;
          dots.appendChild(dot);
          cellEl.appendChild(dots);
        }

        // 点数計算に使われているマスのポップアップ表示
        if(scoringCells.includes(i)){
          cellEl.classList.add('scoring-cell');
          const badge = document.createElement('div');
          badge.className = 'score-badge';
          badge.textContent = '+' + cellData.baseScore;
          cellEl.appendChild(badge);
        }
      }else if(hints[i] !== undefined){
        cellEl.classList.add('hint-blink');
        const bubble = document.createElement('div');
        bubble.className = 'cell-bubble';
        bubble.textContent = `予測+${GlobalFunctions.formatScore(hints[i])}`;
        cellEl.appendChild(bubble);
      }

      cellEl.addEventListener('click', () => this.onCellClick(i));
      board.appendChild(cellEl);
    }

    wrapper.appendChild(board);
    return wrapper;
  },

  // ビンゴ倍率一覧（盤面左下に1つだけ表示）
  renderMultLegend(){
    const legend = document.createElement('div');
    legend.className = 'mult-legend';
    const rows = GameData.SYMBOLS.map(sym => {
      const base = GameData.BINGO_MULTIPLIER_BASE[sym] + GameData.CORRECTION_MULTIPLIER;
      const quad = GameData.BINGO_MULTIPLIER_QUAD[sym] + GameData.CORRECTION_MULTIPLIER;
      const fmt = v => (v >= 0 ? '+' + v : String(v));
      return `<tr><td class="sym-${sym}">${GameData.SYMBOL_LABEL[sym]}</td><td>${fmt(base)}</td><td>${fmt(quad)}</td></tr>`;
    }).join('');
    legend.innerHTML = `
      <table>
        <tr><th></th><th>基礎</th><th>4列</th></tr>
        ${rows}
      </table>
    `;
    return legend;
  },

  renderEffectsPanel(){
    const entries = [];
    this.board.forEach((cellData, i) => {
      if(cellData && cellData.card && cellData.card.jamming){
        entries.push({ i, symbol: cellData.symbol, jamming: cellData.card.jamming });
      }
    });
    if(entries.length === 0) return null;

    const panel = document.createElement('div');
    panel.className = 'effects-panel';
    panel.innerHTML = '<h3>盤面効果一覧</h3>';
    for(const e of entries){
      const r = Math.floor(e.i / GameData.BOARD_SIZE) + 1;
      const c = (e.i % GameData.BOARD_SIZE) + 1;
      const entry = document.createElement('div');
      entry.className = 'effect-entry';
      entry.innerHTML = `
        <div class="eff-head"><span class="sym-${e.symbol}">${GameData.SYMBOL_LABEL[e.symbol]}</span> ${e.jamming}（${r}行${c}列）</div>
        <div class="eff-desc">${GameData.JAMMING_DESC[e.jamming] || ''}</div>
      `;
      panel.appendChild(entry);
    }
    return panel;
  },

  renderBoardInfoPanel(){
    if(this.boardInfoCell === null) return null;
    const cellData = this.board[this.boardInfoCell];
    if(!cellData) return null;
    const panel = document.createElement('div');
    panel.className = 'info-panel';
    const jamming = cellData.card && cellData.card.jamming;
    panel.innerHTML = `
      <div class="info-title sym-${cellData.symbol}">${GameData.SYMBOL_LABEL[cellData.symbol]} 基礎点${cellData.baseScore}${jamming ? `　/　${jamming}` : ''}</div>
      ${jamming ? `<div class="info-desc">${GameData.JAMMING_DESC[jamming] || ''}</div>` : '<div class="info-desc">効果なし</div>'}
    `;
    return panel;
  },

  renderHand(){
    const area = document.createElement('div');
    area.className = 'hand-area';

    const row = document.createElement('div');
    row.className = 'hand-row';
    for(const card of GameState.hand){
      const c = document.createElement('div');
      const isSelected = !this.rerollMode && this.selectedCardId === card.id;
      const isRerollSelected = this.rerollMode && this.rerollSelected.has(card.id);
      c.className = 'card' + (isSelected ? ' selected' : '') + (isRerollSelected ? ' reroll-selected' : '');
      c.innerHTML = `
        <div class="card-symbol sym-${card.symbol}">${GameData.SYMBOL_LABEL[card.symbol]}</div>
        <div class="card-number">${card.number}</div>
        ${card.jamming ? `<div class="card-tag">${card.jamming}</div>` : ''}
      `;
      c.addEventListener('click', () => this.onCardClick(card.id));
      row.appendChild(c);
    }
    area.appendChild(row);
    return area;
  },

  renderHandInfoPanel(){
    if(this.rerollMode || !this.selectedCardId) return null;
    const card = GameState.hand.find(c => c.id === this.selectedCardId);
    if(!card) return null;
    const panel = document.createElement('div');
    panel.className = 'info-panel';
    panel.innerHTML = `
      <div class="info-title sym-${card.symbol}">${GameData.SYMBOL_LABEL[card.symbol]} 基礎点${card.baseScore}${card.jamming ? `　/　${card.jamming}` : ''}</div>
      ${card.jamming ? `<div class="info-desc">${GameData.JAMMING_DESC[card.jamming] || ''}</div>` : '<div class="info-desc">効果なし</div>'}
    `;
    return panel;
  },

  renderControls(){
    const controls = document.createElement('div');
    controls.className = 'controls-row';

    if(this.rerollMode){
      const confirmBtn = document.createElement('button');
      confirmBtn.textContent = `確定（${this.rerollSelected.size}枚）`;
      confirmBtn.disabled = this.rerollSelected.size === 0;
      confirmBtn.addEventListener('click', () => this.confirmReroll());
      controls.appendChild(confirmBtn);

      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'キャンセル';
      cancelBtn.addEventListener('click', () => this.cancelReroll());
      controls.appendChild(cancelBtn);
    }else{
      const rerollBtn = document.createElement('button');
      rerollBtn.textContent = `リロール（残り${GameState.rerollCount}）`;
      rerollBtn.disabled = GameState.rerollCount <= 0 || this.currentSide !== 'player';
      rerollBtn.addEventListener('click', () => this.enterRerollMode());
      controls.appendChild(rerollBtn);
    }
    return controls;
  },

  renderLog(){
    const panel = document.createElement('div');
    panel.className = 'log-panel';
    panel.innerHTML = this.logs.map(l => `<div>${l}</div>`).join('');
    panel.scrollTop = panel.scrollHeight;
    return panel;
  },

  renderResult(){
    const el = document.createElement('div');
    el.className = 'result-screen';
    const win = this.resultState === 'win';
    const goShop = win && this.stage.key !== 'boss';
    el.innerHTML = `
      <div class="result-title ${win ? 'win' : 'lose'}">${win ? 'STAGE CLEAR' : 'GAME OVER'}</div>
      <div>最終点数：${GlobalFunctions.formatScore(GameState.currentScore)} / ${GlobalFunctions.formatScore(GameState.targetScore)}</div>
      <button id="btn-next">${goShop ? 'ショップへ' : 'マップに戻る'}</button>
    `;
    setTimeout(() => {
      el.querySelector('#btn-next').addEventListener('click', () => {
        if(goShop) App.showShop(); else App.showMapSelect();
      });
    });
    return el;
  },
};
