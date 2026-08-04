// グローバルファンクション：ゲーム全体で使う共通処理
const GlobalFunctions = {

  // 配列をシャッフルする（Fisher-Yates）
  shuffle(array){
    const a = array.slice();
    for(let i = a.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },

  // min以上max以下のランダム整数
  randInt(min, max){
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },

  // 配列からランダムに1つ選ぶ
  randChoice(array){
    return array[this.randInt(0, array.length - 1)];
  },

  // 画像読み込み（Chap1では未使用・将来拡張用スタブ）
  loadImage(path){
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = path;
    });
  },

  // 音声再生（Chap1では未使用・将来拡張用スタブ）
  playSE(name){
    // TODO: Chap6でSE/BGM実装予定
  },

  // データセーブ（Chap6で本実装予定のスタブ）
  saveData(){
    try{
      localStorage.setItem('siren_spire_save', JSON.stringify({ saved:false }));
    }catch(e){ /* no-op */ }
  },

  // データロード（Chap6で本実装予定のスタブ）
  loadData(){
    try{
      const raw = localStorage.getItem('siren_spire_save');
      return raw ? JSON.parse(raw) : null;
    }catch(e){ return null; }
  },

  // 画面ログ出力用ヘルパー
  formatScore(n){
    return Math.floor(n).toLocaleString('ja-JP');
  }
};
