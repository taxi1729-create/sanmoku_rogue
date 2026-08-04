// マップ選択：ゲーム本編に入る前のステージ選択シーン
// Chap1では1階層（コモン→ハイレベル→ボス）のみ実装。5階層周回はChap6以降で拡張予定。
const MapSelectScene = {
  render(container){
    const el = document.createElement('div');
    el.className = 'map-screen';

    const header = document.createElement('div');
    header.className = 'map-header';
    header.innerHTML = `
      <span>所持G：${GameState.gold}</span>
      <span>階層 1 / 5（Chap1は1階層のみ実装）</span>
    `;
    el.appendChild(header);

    const path = document.createElement('div');
    path.className = 'map-path';

    GameData.STAGE_TYPES.forEach((stage, i) => {
      const clearedBefore = i === 0 || GameState.clearedStages.includes(GameData.STAGE_TYPES[i - 1].key);
      const isCleared = GameState.clearedStages.includes(stage.key);
      const locked = !clearedBefore;

      const card = document.createElement('div');
      card.className = 'stage-card' + (locked ? ' locked' : '') + (isCleared ? ' cleared' : '');
      card.innerHTML = `
        <div class="stage-tag">${stage.tag}</div>
        <div class="stage-name">${stage.name}</div>
        <div class="stage-goal">目標：${GlobalFunctions.formatScore(stage.targetScore)}点</div>
        <div class="stage-actions">
          <button class="challenge-btn" ${locked ? 'disabled' : ''}>${isCleared ? 'クリア済み・再挑戦' : '挑戦する'}</button>
          ${stage.skippable ? `<button class="skip-btn" ${locked || isCleared ? 'disabled' : ''}>スキップ</button>` : ''}
        </div>
      `;
      path.appendChild(card);

      card.querySelector('.challenge-btn').addEventListener('click', () => {
        if(locked) return;
        App.showGameMain(stage);
      });

      const skipBtn = card.querySelector('.skip-btn');
      if(skipBtn){
        skipBtn.addEventListener('click', () => {
          if(locked || isCleared) return;
          const reward = GameData.SKIP_REWARD_BASE[stage.key] || 1;
          GameState.gold += reward;
          GameState.lastReward = { type:'skip', stageName: stage.name, gold: reward, breakdown: { base: reward, bonus: 0, total: reward } };
          if(!GameState.clearedStages.includes(stage.key)) GameState.clearedStages.push(stage.key);
          App.showShop();
        });
      }
    });

    el.appendChild(path);

    if(GameState.clearedStages.includes('boss')){
      const done = document.createElement('div');
      done.style.marginTop = '18px';
      done.innerHTML = `
        <div style="color:var(--square); font-weight:900; margin-bottom:10px;">この階層のボスを撃破しました！（5階層周回はChap6以降で実装予定）</div>
        <button id="btn-back-title">タイトルに戻る</button>
      `;
      el.appendChild(done);
      setTimeout(() => {
        const b = el.querySelector('#btn-back-title');
        if(b) b.addEventListener('click', () => App.showTitle());
      });
    }

    container.appendChild(el);
  }
};
