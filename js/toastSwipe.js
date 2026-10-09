// v10 #3 右枠のアップグレード演出（.card-reveal-toast）をスワイプ（左右・上下いずれも30px以上）で即座に閉じる
const ToastSwipe = {
  start:null,
  init(){
    const pt=e=>e.touches&&e.touches[0]?e.touches[0]:(e.changedTouches&&e.changedTouches[0]?e.changedTouches[0]:e);
    const onStart=e=>{
      const t=e.target&&e.target.closest&&e.target.closest('.card-reveal-toast');
      if(!t){ this.start=null; return; }
      const p=pt(e); this.start={x:p.clientX,y:p.clientY,el:t}; t.style.transition='none';
    };
    const onMove=e=>{
      if(!this.start) return;
      const p=pt(e); const dx=p.clientX-this.start.x, dy=p.clientY-this.start.y;
      const box=this.start.el.querySelector('.card-reveal-popup');
      if(box){ box.style.transform=`translate(${dx}px,${dy*0.3}px)`; box.style.opacity=String(Math.max(0.2,1-Math.hypot(dx,dy)/160)); }
      if(e.cancelable&&Math.abs(dx)>6) e.preventDefault();
    };
    const onEnd=e=>{
      if(!this.start) return;
      const s=this.start; this.start=null;
      const p=pt(e); const dx=p.clientX-s.x, dy=p.clientY-s.y;
      const box=s.el.querySelector('.card-reveal-popup');
      if(Math.hypot(dx,dy)>=30){ this.dismiss(s.el, dx>=0?1:-1); }
      else if(box){ box.style.transform=''; box.style.opacity=''; }
    };
    document.addEventListener('touchstart',onStart,{passive:true,capture:true});
    document.addEventListener('touchmove',onMove,{passive:false,capture:true});
    document.addEventListener('touchend',onEnd,{capture:true});
    document.addEventListener('touchcancel',onEnd,{capture:true});
    // PC（マウス）でもドラッグで閉じられるように
    if(!('ontouchstart' in window)){
      document.addEventListener('mousedown',onStart,true);
      document.addEventListener('mousemove',onMove,true);
      document.addEventListener('mouseup',onEnd,true);
    }
  },
  dismiss(el, dir){
    try{ if(typeof SFX!=='undefined') SFX.play('swipe'); }catch(e){} // 効果音（js/sfx.js）
    const box=el.querySelector('.card-reveal-popup');
    if(box){ box.style.transition='transform .18s ease-out, opacity .18s'; box.style.transform=`translateX(${dir*220}px)`; box.style.opacity='0'; }
    const isMult=el.classList.contains('mult-change-toast'), isGame=el.classList.contains('game-change-toast');
    if(typeof GameMainScene!=='undefined'){
      if(isMult){ GameMainScene._multToastToken=null; GameMainScene.multChangeToast=null; }
      if(isGame){ GameMainScene._toastToken=null; GameMainScene.cardChangeToast=null; }
    }
    if(!isMult&&!isGame&&typeof ShopScene!=='undefined'&&ShopScene.cardRevealPopup){
      if(ShopScene.cardRevealPopup._cleanup) ShopScene.cardRevealPopup._cleanup();
      ShopScene._activeRevealToken=null; ShopScene.cardRevealPopup=null;
    }
    setTimeout(()=>{ if(el.parentNode) el.remove(); },190);
  }
};
ToastSwipe.init();
