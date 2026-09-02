const GlobalFunctions = {
  shuffle(array){ const a=array.slice(); for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; },
  randInt(min,max){ return Math.floor(Math.random()*(max-min+1))+min; },
  randChoice(array){ return array[this.randInt(0,array.length-1)]; },
  loadImage(path){ return new Promise((res,rej)=>{const img=new Image();img.onload=()=>res(img);img.onerror=()=>res(null);img.src=path;}); },
  playSE(name){},
  formatScore(n){ return Math.floor(n).toLocaleString('ja-JP'); },

  // #8 セーブ/ロード (3スロット)
  SAVE_KEY:'siren_spire_save_v1',
  getSaves(){
    try{ return JSON.parse(localStorage.getItem(this.SAVE_KEY)||'[]'); }catch(e){ return []; }
  },
  saveSlot(slotIndex, data){
    try{
      const saves=this.getSaves();
      while(saves.length<=slotIndex) saves.push(null);
      saves[slotIndex]={...data, savedAt:Date.now()};
      localStorage.setItem(this.SAVE_KEY, JSON.stringify(saves));
      return true;
    }catch(e){ return false; }
  },
  loadSlot(slotIndex){
    try{ const saves=this.getSaves(); return saves[slotIndex]||null; }catch(e){ return null; }
  },
  deleteSlot(slotIndex){
    try{ const saves=this.getSaves(); saves[slotIndex]=null; localStorage.setItem(this.SAVE_KEY,JSON.stringify(saves)); }catch(e){}
  },

  // #9 図鑑データ（ゲーム中に発見したカード効果・レリック）
  GALLERY_KEY:'siren_spire_gallery',
  getGallery(){ try{ return JSON.parse(localStorage.getItem(this.GALLERY_KEY)||'{"jamming":[],"enhance":[],"trait":[],"relic":[]}')}catch(e){return{jamming:[],enhance:[],trait:[],relic:[]};} },
  recordCard(card){
    const g=this.getGallery();
    let dirty=false;
    if(card.jamming&&!g.jamming.includes(card.jamming)){g.jamming.push(card.jamming);dirty=true;}
    if(card.enhance&&!g.enhance.includes(card.enhance)){g.enhance.push(card.enhance);dirty=true;}
    if(card.trait&&!g.trait.includes(card.trait)){g.trait.push(card.trait);dirty=true;}
    if(dirty) localStorage.setItem(this.GALLERY_KEY,JSON.stringify(g));
  },
  recordRelic(relicId){
    const g=this.getGallery();
    if(!g.relic.includes(relicId)){ g.relic.push(relicId); localStorage.setItem(this.GALLERY_KEY,JSON.stringify(g)); }
  },

  // #6 自己最高到達時のデッキ・レリック記録（タイトル画面で確認用）
  BEST_RUN_KEY:'siren_spire_best_run',
  getBestRun(){
    try{ return JSON.parse(localStorage.getItem(this.BEST_RUN_KEY)||'null'); }catch(e){ return null; }
  },
  saveBestRunIfBetter(floorScore, data){
    try{
      const cur=this.getBestRun();
      if(!cur||floorScore>=(cur.floorScore||0)){
        localStorage.setItem(this.BEST_RUN_KEY, JSON.stringify({...data, floorScore}));
        return true;
      }
      return false;
    }catch(e){ return false; }
  },
};
