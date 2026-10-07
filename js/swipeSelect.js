// スワイプ複数選択：カードに指を置いてなぞると、なぞったカードを最初のカードと同じ状態（選択／解除）に塗る
//   SwipeSelect.attach(container, {
//     item:'.card',                 対象要素のセレクタ（container 内）
//     getKey:(el)=>key,             要素→キー（null なら対象外）
//     isSelected:(key)=>bool,
//     canSelect:()=>bool,           追加選択できるか（上限チェック）
//     set:(key,on)=>void,           状態だけを更新（ここで再描画しない）
//     paint:(el,on)=>void,          見た目だけを更新
//     commit:()=>void,              なぞり終了時（ここで再描画してよい）
//     scrollable:true,              true なら縦方向の最初の動きはスクロールに譲る
//   })
// タップ（なぞらない）は従来どおり click で処理される。なぞった直後の click は抑止する。
const SwipeSelect = (function(){
  const START_DIST=8;
  function attach(container, o){
    if(!container||container.__swipeSelect) return;
    container.__swipeSelect=true;
    let g=null, suppressUntil=0;
    const itemOf=(node)=>{ const it=node&&node.closest?node.closest(o.item):null; return it&&container.contains(it)?it:null; };
    const apply=(el)=>{
      const key=o.getKey(el); if(key==null||g.visited.has(key)) return;
      g.visited.add(key);
      const sel=!!o.isSelected(key);
      if(g.mode===sel) return;
      if(g.mode&&o.canSelect&&!o.canSelect()) return;
      o.set(key,g.mode); g.changed=true;
      if(o.paint) o.paint(el,g.mode);
    };
    container.addEventListener('touchstart',(e)=>{
      if(e.touches.length!==1){ g=null; return; }
      const it=itemOf(e.target); if(!it){ g=null; return; }
      const t=e.touches[0];
      g={ x:t.clientX, y:t.clientY, start:it, painting:false, cancelled:false, mode:true, visited:new Set(), changed:false };
    },{passive:true});
    container.addEventListener('touchmove',(e)=>{
      if(!g||g.cancelled) return;
      if(e.touches.length!==1){ g.cancelled=true; return; }
      const t=e.touches[0];
      if(!g.painting){
        const dx=t.clientX-g.x, dy=t.clientY-g.y;
        if(Math.hypot(dx,dy)<START_DIST) return;
        const over=itemOf(document.elementFromPoint(t.clientX,t.clientY));
        if(o.scrollable!==false && Math.abs(dy)>Math.abs(dx)*1.4 && (!over||over===g.start)){ g.cancelled=true; return; } // 縦スクロールに譲る
        g.painting=true;
        const sk=o.getKey(g.start);
        g.mode=!o.isSelected(sk);
        apply(g.start);
      }
      if(e.cancelable) e.preventDefault();
      const over=itemOf(document.elementFromPoint(t.clientX,t.clientY));
      if(over) apply(over);
    },{passive:false});
    const end=()=>{
      if(g&&g.painting){ suppressUntil=Date.now()+500; if(o.commit) o.commit(g.changed); }
      g=null;
    };
    container.addEventListener('touchend',end);
    container.addEventListener('touchcancel',end);
    container.addEventListener('click',(e)=>{ if(Date.now()<suppressUntil){ e.stopPropagation(); e.preventDefault(); } },true);
  }
  return { attach };
})();
window.SwipeSelect=SwipeSelect;
