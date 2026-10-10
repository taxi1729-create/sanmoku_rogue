// タイトルロゴ「クロスライン / CROSSLINE」（インラインSVG。外部フォント・画像なし）
//   4×4盤面エンブレム＋対角線を貫く光線（クロスライン）＋きらめき。アニメは css/style.css の .tl-*
const TitleLogo = {
  svg(){
    const FONT=`'Hiragino Sans','Hiragino Kaku Gothic ProN','Yu Gothic','YuGothic','Meiryo','Noto Sans JP','Noto Sans CJK JP',sans-serif`;
    const C=24, GX=132, GY=6; // セルサイズ・盤面左上
    const col={O:'#7dd3fc',T:'#4ade80',S:'#fbbf24',X:'#f472b6'};
    const sym=(t,cx,cy,c,w)=>{
      const r=7;
      if(t==='O') return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${c}" stroke-width="${w}"/>`;
      if(t==='T') return `<path d="M${cx} ${cy-r-0.5}L${cx+r+0.5} ${cy+r-1}H${cx-r-0.5}Z" fill="none" stroke="${c}" stroke-width="${w}" stroke-linejoin="round"/>`;
      if(t==='S') return `<rect x="${cx-r+0.5}" y="${cy-r+0.5}" width="${2*r-1}" height="${2*r-1}" rx="1.5" fill="none" stroke="${c}" stroke-width="${w}"/>`;
      return `<path d="M${cx-r+1} ${cy-r+1}L${cx+r-1} ${cy+r-1}M${cx+r-1} ${cy-r+1}L${cx-r+1} ${cy+r-1}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
    };
    // 盤面（対角線 ＝ 完成ライン）
    const board=['OTXS','SOTX','XSOT','TXSO'];
    let cells='';
    for(let r=0;r<4;r++) for(let c=0;c<4;c++){
      const t=board[r][c], cx=GX+c*C+C/2, cy=GY+r*C+C/2, onLine=(r===c);
      cells+=`<g class="${onLine?'tl-hit':'tl-sym'}" style="--d:${(r*4+c)*0.05}s">${sym(t,cx,cy,onLine?'#fff7d6':col[t],onLine?2.6:2)}</g>`;
    }
    let grid='';
    for(let i=1;i<4;i++){
      grid+=`<line x1="${GX+i*C}" y1="${GY+2}" x2="${GX+i*C}" y2="${GY+4*C-2}"/><line x1="${GX+2}" y1="${GY+i*C}" x2="${GX+4*C-2}" y2="${GY+i*C}"/>`;
    }
    const spark=(x,y,s,d)=>`<path class="tl-spark" style="--d:${d}s" transform="translate(${x} ${y}) scale(${s})" d="M0-6C.6-1.2 1.2-.6 6 0C1.2.6.6 1.2 0 6C-.6 1.2-1.2.6-6 0C-1.2-.6-.6-1.2 0-6Z"/>`;
    return `<svg class="tl-svg" viewBox="0 0 360 206" role="img" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="tlText" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#fff3c4"/><stop offset=".55" stop-color="#fde68a"/><stop offset="1" stop-color="#f59e0b"/>
    </linearGradient>
    <linearGradient id="tlBeam" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fde68a" stop-opacity="0"/><stop offset=".5" stop-color="#fffbe8"/><stop offset="1" stop-color="#fde68a" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="tlSheen" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="tlHalo" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="#6366f1" stop-opacity=".55"/><stop offset=".6" stop-color="#1e1b4b" stop-opacity=".35"/><stop offset="1" stop-color="#0b0f1e" stop-opacity="0"/>
    </radialGradient>
    <filter id="tlGlow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="tlSoft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>
    <clipPath id="tlTextClip"><text x="180" y="160" text-anchor="middle" font-family="${FONT}" font-weight="900" font-size="52" textLength="320" lengthAdjust="spacingAndGlyphs">クロスライン</text></clipPath>
  </defs>
  <ellipse class="tl-halo" cx="180" cy="58" rx="120" ry="70" fill="url(#tlHalo)"/>
  <g class="tl-board">
    <rect x="${GX-5}" y="${GY-5}" width="${4*C+10}" height="${4*C+10}" rx="10" fill="rgba(11,15,30,.72)" stroke="rgba(125,211,252,.35)" stroke-width="1.2"/>
    <g stroke="rgba(148,163,255,.28)" stroke-width="1.2">${grid}</g>
    ${cells}
  </g>
  <g class="tl-beam-wrap">
    <line class="tl-beam-glow" x1="${GX-40}" y1="${GY-40}" x2="${GX+4*C+40}" y2="${GY+4*C+40}" stroke="#fde68a" stroke-width="10" stroke-linecap="round" filter="url(#tlSoft)"/>
    <line class="tl-beam" x1="${GX-40}" y1="${GY-40}" x2="${GX+4*C+40}" y2="${GY+4*C+40}" stroke="url(#tlBeam)" stroke-width="3" stroke-linecap="round"/>
    <line class="tl-beam-run" x1="${GX-40}" y1="${GY-40}" x2="${GX+4*C+40}" y2="${GY+4*C+40}" stroke="#fff" stroke-width="3.4" stroke-linecap="round" pathLength="100" stroke-dasharray="14 186" filter="url(#tlGlow)"/>
  </g>
  <g class="tl-word">
    <text x="180" y="160" text-anchor="middle" font-family="${FONT}" font-weight="900" font-size="52" textLength="320" lengthAdjust="spacingAndGlyphs" fill="none" stroke="#0b0f1e" stroke-width="9" stroke-linejoin="round">クロスライン</text>
    <text x="180" y="160" text-anchor="middle" font-family="${FONT}" font-weight="900" font-size="52" textLength="320" lengthAdjust="spacingAndGlyphs" fill="none" stroke="#7c6cf0" stroke-width="4.5" stroke-linejoin="round" opacity=".85">クロスライン</text>
    <text class="tl-word-fill" x="180" y="160" text-anchor="middle" font-family="${FONT}" font-weight="900" font-size="52" textLength="320" lengthAdjust="spacingAndGlyphs" fill="url(#tlText)" filter="url(#tlGlow)">クロスライン</text>
    <g clip-path="url(#tlTextClip)"><rect class="tl-sheen" x="-80" y="106" width="60" height="70" fill="url(#tlSheen)" transform="skewX(-24)"/></g>
  </g>
  <g class="tl-en">
    <line x1="58" y1="190" x2="96" y2="190" stroke="rgba(125,211,252,.5)" stroke-width="1"/>
    <line x1="264" y1="190" x2="302" y2="190" stroke="rgba(125,211,252,.5)" stroke-width="1"/>
    <text x="181" y="195" text-anchor="middle" font-family="'Segoe UI','Helvetica Neue',Arial,sans-serif" font-weight="800" font-size="13" letter-spacing="7" fill="#bae6fd">CROSSLINE</text>
  </g>
  <g fill="#fde68a">
    ${spark(104,40,.9,0)}${spark(262,30,.7,1.1)}${spark(250,112,.55,2.0)}${spark(96,104,.5,.6)}${spark(320,138,.6,1.6)}${spark(40,128,.65,2.6)}${spark(214,6,.45,3.1)}
  </g>
</svg>`;
  },
};

const TitleScene = {
  render(container){
    const el=document.createElement('div'); el.className='title-screen';
    const maxInfo=GameState.maxClearedFloor>0
      ?`<div class="title-record">最高クリア：第${GameState.maxClearedFloor}階層 ${GameState.maxClearedStage}</div>`:'';
    // #3 ゲームスコア最高得点を表示
    const highScore=GlobalFunctions.getHighScore();
    const highScoreInfo=highScore>0?`<div class="title-record">最高得点：${GlobalFunctions.formatScore(highScore)}</div>`:'';
    el.innerHTML=`
      <div>
        <h1 class="title-logo" aria-label="クロスライン CROSSLINE">${TitleLogo.svg()}</h1>
        <div class="title-sub">roguelike bingo deckbuilder</div>
        ${maxInfo}
        ${highScoreInfo}
      </div>
      <div class="title-menu">
        <button id="btn-new">はじめから</button>
        <button id="btn-continue" id="btn-continue">続きから</button>
        ${(typeof GameMeta!=='undefined'&&GameMeta.isCleared10())?'<button id="btn-urasekai-free" class="title-ura-btn">裏世界（クリア特典）</button>':''}
        <button id="btn-gallery">図鑑（発見した効果）</button>
        <button id="btn-best-run">最高到達デッキ・レリックを見る</button>
      </div>
      ${typeof GameVersion!=='undefined'?`<div class="title-version"><span class="tv-ver">${GameVersion.version}</span><span class="tv-date">最終更新日 ${GameVersion.updated}</span><button type="button" id="btn-update-history" class="tv-history-btn">アップデート履歴</button></div>`:''}
    `;
    container.appendChild(el);
    el.querySelector('#btn-new').addEventListener('click',()=>{
      App.showSaveSlotSelect('new');
    });
    el.querySelector('#btn-continue').addEventListener('click',()=>{
      App.showSaveSlotSelect('load');
    });
    const uraBtn=el.querySelector('#btn-urasekai-free');
    if(uraBtn) uraBtn.addEventListener('click',()=>{ if(typeof UraFreePlay!=='undefined') UraFreePlay.show(container); });
    el.querySelector('#btn-gallery').addEventListener('click',()=>{
      App.showGallery();
    });
    el.querySelector('#btn-best-run').addEventListener('click',()=>{
      App.showBestRun();
    });
    // v1.07 チュートリアルスキップ（ONの間は各画面のチュートリアルを表示しない。最初の導入と5・10階層の啓示は対象外）
    //   → チュートリアルスキップ・サウンドは「設定」（js/settings.js。右上の歯車ボタン）へ移動
    if(typeof Settings!=='undefined'){ const sw=document.createElement('div'); sw.className='title-settings-wrap'; sw.appendChild(Settings.button('title')); el.appendChild(sw); }
    const histBtn=el.querySelector('#btn-update-history');
    if(histBtn) histBtn.addEventListener('click',()=>this.showUpdateHistory());
  },
  // アップデート履歴モーダル（GameVersion.history を新しい順に表示）
  showUpdateHistory(){
    if(typeof GameVersion==='undefined') return;
    const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    const ov=document.createElement('div'); ov.className='pack-modal-overlay update-history-overlay';
    const body=GameVersion.history.map(h=>`<div class="uh-entry"><div class="uh-head"><b>${esc(h.version)}</b><span>${esc(h.date)}</span></div><ul>${(h.notes||[]).map(n=>`<li>${esc(n)}</li>`).join('')}</ul></div>`).join('');
    ov.innerHTML=`<div class="pack-modal update-history-modal"><h3>アップデート履歴</h3><div class="uh-list">${body}</div><button type="button" class="uh-close">閉じる</button></div>`;
    const close=()=>ov.remove();
    ov.querySelector('.uh-close').addEventListener('click',close);
    ov.addEventListener('click',e=>{ if(e.target===ov) close(); });
    document.body.appendChild(ov);
  },
};
