// #1 チュートリアル：マップ選択・ゲームメイン・ショップの初回訪問時に表示する共通オーバーレイ
const TutorialOverlay = {
  CONTENT: {
    mapSelect: {
      title: 'マップ選択の遊び方',
      steps: [
        'この画面では、現在の階層にある3つのステージ（コモン→ハイレベル→ボス）から挑戦するステージを選べます。',
        '各ステージには目標点数があります。「挑戦する」でステージに入るか、「スキップ」でお金と追加報酬だけを受け取ってステージをクリア扱いにできます。',
        'ボスステージには特殊な効果が付いています。効果は挑戦する前に確認できます。',
        '全ステージをクリアすると次の階層に進めます。第10階層のボスを倒すとエンディングです。',
      ],
    },
    gameMain: {
      title: 'ゲームメインの遊び方',
      steps: [
        '4×4（またはパッシブ次第で5×5）の盤面に、手札のカードを交互に配置していく対戦型ビンゴです。あなたとNPCが交互にカードを置きます。',
        'マル・サンカク・シカクは同じ記号を3つ（または4つ）並べるとビンゴになり点数が入ります。バツはマイナス点のビンゴです。',
        '上画面ではラウンドや現在の点数/目標点数を確認できます。デッキ・山札・捨て札の中身もボタンから確認できます。',
        'カードにはジャミング・強化効果・性質変化が付くことがあります。タップやドラッグでカードの効果を確認しながらプレイしましょう。',
        'ラウンド終了までに目標点数へ到達すればステージクリアです。',
      ],
    },
    shop: {
      title: 'ショップの遊び方',
      steps: [
        'ステージクリアやスキップで得たGを使って、レリック・カード強化・カードパックなどを購入できます。',
        '商品はランダムに並びます。同じ商品でも出現確率は種類によって異なります。',
        'レリックは常時発動する効果です。所持数には上限があり、レリックの強化状態によって消費する枠数が変わります。',
        '買い物が終わったら画面下のボタンで次のステージに進みましょう。',
      ],
    },
  },

  show(key){
    const content=this.CONTENT[key]; if(!content) return;
    if(GlobalFunctions.isTutorialSeen(key)) return;
    let step=0;
    const overlay=document.createElement('div'); overlay.className='pack-modal-overlay tutorial-overlay';
    const box=document.createElement('div'); box.className='pack-modal tutorial-modal';
    const finish=()=>{ GlobalFunctions.markTutorialSeen(key); overlay.remove(); };
    const renderStep=()=>{
      box.innerHTML=`
        <h3>${content.title}</h3>
        <div class="tutorial-step-count">${step+1} / ${content.steps.length}</div>
        <div class="tutorial-step-text">${content.steps[step]}</div>
        <div class="tutorial-btn-row">
          <button id="tut-skip">スキップ</button>
          <button id="tut-next">${step<content.steps.length-1?'次へ':'はじめる'}</button>
        </div>
      `;
      box.querySelector('#tut-skip').addEventListener('click',finish);
      box.querySelector('#tut-next').addEventListener('click',()=>{
        if(step<content.steps.length-1){ step++; renderStep(); }
        else finish();
      });
    };
    renderStep();
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  },
};
