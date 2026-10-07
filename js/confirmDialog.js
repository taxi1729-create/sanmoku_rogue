// 共通確認ダイアログ：スキップ確認など
//   confirmSkip(onYes)                     「本当にスキップしますか？」
//   confirmSkip(message, onYes[, onNo])    任意のメッセージで確認
//   confirmDialog({message, yes, no, onYes, onNo})
(function(){
  let current=null;
  function close(){ if(current){ current.remove(); current=null; } }
  function confirmDialog(opts){
    opts=opts||{};
    close();
    const ov=document.createElement('div'); ov.className='confirm-dialog-overlay';
    const box=document.createElement('div'); box.className='confirm-dialog'; box.setAttribute('role','dialog'); box.setAttribute('aria-modal','true');
    const msg=document.createElement('div'); msg.className='confirm-dialog-msg'; msg.textContent=opts.message||'よろしいですか？';
    const row=document.createElement('div'); row.className='confirm-dialog-actions';
    const yes=document.createElement('button'); yes.type='button'; yes.className='confirm-dialog-yes'; yes.textContent=opts.yes||'OK';
    const no=document.createElement('button'); no.type='button'; no.className='confirm-dialog-no'; no.textContent=opts.no||'やめる';
    row.appendChild(no); row.appendChild(yes);
    box.appendChild(msg); box.appendChild(row); ov.appendChild(box);
    let done=false;
    const finish=(ok,e)=>{ if(e) e.stopPropagation(); if(done) return; done=true; close(); const fn=ok?opts.onYes:opts.onNo; if(typeof fn==='function') fn(); };
    yes.addEventListener('click',e=>finish(true,e));
    no.addEventListener('click',e=>finish(false,e));
    ov.addEventListener('click',e=>{ e.stopPropagation(); if(e.target===ov) finish(false); });
    document.body.appendChild(ov); current=ov;
    try{ yes.focus({preventScroll:true}); }catch(_){}
    return ov;
  }
  function confirmSkip(message, onYes, onNo){
    if(typeof message==='function'){ onNo=onYes; onYes=message; message=null; }
    return confirmDialog({ message:message||'本当にスキップしますか？', yes:'スキップする', no:'やめる', onYes, onNo });
  }
  window.confirmDialog=confirmDialog;
  window.confirmSkip=confirmSkip;
})();
