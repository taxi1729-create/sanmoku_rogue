/* icons.js — 三目ローグライク GUIアイコンセット（自己完結 / 依存なし / 外部アセットなし）
 * 絵文字表現の置き換え用オリジナルSVGピクトグラム。24x24グリッド・線幅2・丸キャップで統一。
 * API:
 *   GameIcons.svg(key, {size, cls, title}) -> インラインSVG文字列
 *       size 省略時は '1em'（周囲の font-size に追従）。数値なら px。
 *       title 指定時は <title> と role="img"、省略時は aria-hidden="true"。
 *   GameIcons.has(key) -> boolean
 *   GameIcons.KEYS           … 全キー一覧
 *   GameIcons.byGuiId        … 'GUI-001' → key（91件）
 *   GameIcons.byEmoji        … 元の絵文字 → 代表key
 *   GameIcons.COLOR          … 使用色
 *   GameIcons.meta(key)      … {label, tint:'current'|'fixed'}
 * 色の方針:
 *   ジャミング=緑 / 強化=黄 / 性質変化=青 / 危険・レリック=赤 は固定色。
 *   ボタン類・記号（○△□×☆✓7）は currentColor（既存の .sym-* クラス等の色を継承）。
 * 使用CSS: css/icons.css（クラスはすべて gi プレフィックス）
 * グラデーション・id は使用しない（id 衝突なし）。
 */
const GameIcons = (function(){
  'use strict';

  const C = {
    green:'#4ade80', greenL:'#bbf7d0',
    yellow:'#facc15', gold:'#fbbf24',
    blue:'#7dd3fc', blueL:'#bfdbfe',
    red:'#f87171', redD:'#ef4444',
    teal:'#5eead4', orange:'#fb923c', indigo:'#a5b4fc', purple:'#c084fc', violet:'#a78bfa',
    pink:'#f472b6', white:'#f1f5f9', dark:'#1c2030'
  };

  // 属性ヘルパー
  // s(c): 線色c, f(c,o): 塗り色c(不透明度o)
  const s  = c => ` stroke="${c}"`;
  const tf = (c,o) => ` fill="${c}" fill-opacity="${o==null?0.28:o}"`;
  const F  = c => ` fill="${c}" stroke="none"`;

  // 共通部品
  const star4 = (cx,cy,r,attr) => { // 4方向キラ
    const k=r*0.28;
    return `<path d="M${cx} ${cy-r}Q${cx+k} ${cy-k} ${cx+r} ${cy}Q${cx+k} ${cy+k} ${cx} ${cy+r}Q${cx-k} ${cy+k} ${cx-r} ${cy}Q${cx-k} ${cy-k} ${cx} ${cy-r}Z"${attr}/>`;
  };
  const star5 = (cx,cy,R,r) => {
    let d='';
    for(let i=0;i<10;i++){
      const a=-Math.PI/2+i*Math.PI/5, rr=i%2?r:R;
      d+=(i?'L':'M')+(cx+rr*Math.cos(a)).toFixed(2)+' '+(cy+rr*Math.sin(a)).toFixed(2);
    }
    return d+'Z';
  };
  // カード（パック系の土台）: 後ろに傾いたカード＋前面カード
  const cardBase = (col) =>
      `<rect x="3.5" y="4" width="11" height="15" rx="2" transform="rotate(-12 9 11.5)"${s(col)} stroke-opacity=".55"/>`
    + `<rect x="7" y="3" width="13" height="18" rx="2.2"${s(col)} fill="${C.dark}"/>`
    + `<rect x="7" y="3" width="13" height="18" rx="2.2"${s(col)}${tf(col,0.22)}/>`;

  // key → {label, tint, body}
  const D = {
    /* ---------------- ジャミング（緑） ---------------- */
    jam_stun:{ label:'スタン', tint:'fixed', body:
        `<path d="M8 5h6l4.2 4.2v6L14 19.4H8l-4.2-4.2v-6z"${s(C.green)}${tf(C.green)}/>`
      + `<path d="M8.6 9.8l4.8 4.8M13.4 9.8l-4.8 4.8"${s(C.greenL)} stroke-width="2.2"/>`
      + star4(19.6,4.4,3.2,F(C.greenL))
      + `<path d="M15.8 2.4a6 6 0 0 1 6.2 5.6"${s(C.green)} stroke-width="1.4" stroke-dasharray="1.5 2"/>` },
    jam_thunder:{ label:'サンダー', tint:'fixed', body:
        `<path d="M13.5 2.5L4.5 13.5h6.5l-1.5 8 10-11.5h-6.8z"${s(C.green)}${tf(C.green,0.45)}/>` },
    jam_confuse:{ label:'混乱', tint:'fixed', body:
        `<path d="M12 21.5a9.5 9.5 0 1 1 9.5-9.5 6.5 6.5 0 0 1-6.5 6.5"${s(C.green)} stroke-opacity=".75"/>`
      + `<path d="M9.3 9.4a2.8 2.8 0 1 1 3.9 2.6c-.8.4-1.2 1-1.2 1.9"${s(C.greenL)} stroke-width="2.2"/>`
      + `<circle cx="12" cy="16.6" r="1.3"${F(C.greenL)}/>` },
    jam_break:{ label:'ブレイク', tint:'fixed', body:
        `<path d="M11 3.2L4.5 5.8v5.4c0 4.6 2.7 8 6.5 9.6z"${s(C.green)}${tf(C.green)}/>`
      + `<path d="M13.2 2.6l6.3 3.2v5.4c0 4.6-2.8 8-6.8 9.8l1.2-4.6-2.2-2.8 2.4-3.6-1.9-3z"${s(C.green)}${tf(C.green)}/>`
      + `<path d="M8 12h-.01"${s(C.greenL)} stroke-width="2.6"/>` },
    jam_prolong:{ label:'延命', tint:'fixed', body:
        `<path d="M3 3h10M3 21h10M4.5 3c0 5.2 3.5 6 3.5 9s-3.5 3.8-3.5 9M11.5 3c0 5.2-3.5 6-3.5 9s3.5 3.8 3.5 9"${s(C.green)}/>`
      + `<path d="M5.5 20c.5-2.6 2.5-3.4 2.5-4.4 0 1 2 1.8 2.5 4.4z"${F(C.green)} fill-opacity=".7"/>`
      + `<path d="M20.5 20.5V10.5l-5.5 7.5h7"${s(C.greenL)} stroke-width="2.2"/>` },
    jam_bingo_block:{ label:'ビンゴ阻害', tint:'fixed', body:
        `<path d="M4 12h16"${s(C.white)} stroke-opacity=".8"/>`
      + `<circle cx="6.5" cy="12" r="1.7"${F(C.white)}/><circle cx="12" cy="12" r="1.7"${F(C.white)}/><circle cx="17.5" cy="12" r="1.7"${F(C.white)}/>`
      + `<circle cx="12" cy="12" r="9.3"${s(C.green)} stroke-width="2.3"/>`
      + `<path d="M5.4 5.4l13.2 13.2"${s(C.green)} stroke-width="2.3"/>` },
    jam_link:{ label:'リンク', tint:'fixed', body:
        `<rect x="2" y="8.8" width="12" height="6.4" rx="3.2" transform="rotate(-45 8 12)"${s(C.green)}${tf(C.green,0.18)}/>`
      + `<rect x="10" y="8.8" width="12" height="6.4" rx="3.2" transform="rotate(-45 16 12)"${s(C.greenL)}/>` },
    jam_redraw:{ label:'引き直し', tint:'fixed', body:
        `<rect x="10" y="2.5" width="10.5" height="14" rx="2"${s(C.green)}${tf(C.green)}/>`
      + `<path d="M15.2 9.5h.01"${s(C.greenL)} stroke-width="3"/>`
      + `<path d="M13 21H7.5A4.5 4.5 0 0 1 3 16.5V11"${s(C.greenL)}/>`
      + `<path d="M.8 13.4L3 11.1l2.2 2.3"${s(C.greenL)}/>` },
    jam_seal:{ label:'封印', tint:'fixed', body:
        `<path d="M3.5 9.5l2-4.5h13l2 4.5"${s(C.green)}/>`
      + `<rect x="3" y="9.5" width="18" height="11.5" rx="2"${s(C.green)}${tf(C.green)}/>`
      + `<path d="M9.8 14.2v-1.6a2.2 2.2 0 0 1 4.4 0v1.6"${s(C.greenL)} stroke-width="1.8"/>`
      + `<rect x="8.6" y="14" width="6.8" height="5" rx="1"${F(C.greenL)}/>` },
    jam_guide:{ label:'誘導', tint:'fixed', body:
        `<rect x="9.5" y="9.5" width="5" height="5" rx="1"${F(C.greenL)}/>`
      + `<path d="M3 3l4.3 4.3M21 3l-4.3 4.3M3 21l4.3-4.3M21 21l-4.3-4.3"${s(C.green)}/>`
      + `<path d="M4 8.2h3.8V4.4M20 8.2h-3.8V4.4M4 15.8h3.8v3.8M20 15.8h-3.8v3.8"${s(C.green)}/>` },

    /* ---------------- カード強化（黄） ---------------- */
    enh_hub:{ label:'ハブ', tint:'fixed', body:
        `<path d="M12 4.5v15M4.5 12h15"${s(C.yellow)} stroke-opacity=".7"/>`
      + `<circle cx="12" cy="3.8" r="1.9"${F(C.yellow)}/><circle cx="12" cy="20.2" r="1.9"${F(C.yellow)}/>`
      + `<circle cx="3.8" cy="12" r="1.9"${F(C.yellow)}/><circle cx="20.2" cy="12" r="1.9"${F(C.yellow)}/>`
      + `<circle cx="12" cy="12" r="4"${s(C.yellow)} fill="${C.dark}"/><circle cx="12" cy="12" r="4"${s(C.yellow)}${tf(C.yellow,0.5)}/>` },
    enh_chain:{ label:'連鎖', tint:'fixed', body:
        `<rect x="2.6" y="11" width="4.2" height="10.5" rx="1.1" transform="rotate(-62 4.7 21)"${s(C.yellow)}${tf(C.yellow,0.25)}/>`
      + `<rect x="9" y="9" width="4.2" height="10.5" rx="1.1" transform="rotate(-34 11.1 19.5)"${s(C.yellow)}${tf(C.yellow,0.4)}/>`
      + `<rect x="16.4" y="8" width="4.2" height="12.5" rx="1.1"${s(C.yellow)}${tf(C.yellow,0.6)}/>`
      + `<path d="M2 21.5h20"${s(C.yellow)} stroke-opacity=".6"/>`
      + `<path d="M11 4.5q4-2.6 7.6 0M18.8 2.6l-.2 1.9 1.8.2"${s(C.yellow)} stroke-width="1.6"/>` },
    enh_extend:{ label:'エクステンド', tint:'fixed', body:
        `<path d="M3 7v10"${s(C.yellow)}/>`
      + `<path d="M3 12h7"${s(C.yellow)} stroke-width="2.4"/>`
      + `<path d="M13 12h1.5M17.5 12h.5"${s(C.yellow)} stroke-width="2.4"/>`
      + `<path d="M17.5 7.5L22 12l-4.5 4.5"${s(C.yellow)}/>`
      + `<circle cx="10" cy="12" r="2.2"${F(C.yellow)}/>` },
    enh_top_speed:{ label:'トップスピード', tint:'fixed', body:
        `<path d="M9 20.5h11.5M9 17.5h11.5"${s(C.yellow)} stroke-opacity=".55"/>`
      + `<rect x="9.5" y="2.5" width="11" height="12" rx="1.8"${s(C.yellow)}${tf(C.yellow,0.4)}/>`
      + `<path d="M1.5 5.5h5M3 9h4M1.5 12.5h5"${s(C.yellow)}/>` },
    enh_gamble:{ label:'ギャンブル', tint:'fixed', body:
        `<rect x="3.5" y="3.5" width="17" height="17" rx="4"${s(C.yellow)}${tf(C.yellow)}/>`
      + `<circle cx="8.2" cy="8.2" r="1.6"${F(C.yellow)}/><circle cx="12" cy="12" r="1.6"${F(C.yellow)}/><circle cx="15.8" cy="15.8" r="1.6"${F(C.yellow)}/>`
      + `<circle cx="15.8" cy="8.2" r="1.6"${F(C.yellow)} fill-opacity=".45"/><circle cx="8.2" cy="15.8" r="1.6"${F(C.yellow)} fill-opacity=".45"/>` },

    /* ---------------- 記号（currentColor） ---------------- */
    sym_circle:{ label:'マル', tint:'current', body:`<circle cx="12" cy="12" r="7.6" stroke-width="2.6"/>` },
    sym_triangle:{ label:'サンカク', tint:'current', body:`<path d="M12 4.2l8.6 15H3.4z" stroke-width="2.6"/>` },
    sym_square:{ label:'シカク', tint:'current', body:`<rect x="4.8" y="4.8" width="14.4" height="14.4" rx="1.2" stroke-width="2.6"/>` },
    sym_cross:{ label:'バツ', tint:'current', body:`<path d="M5.8 5.8l12.4 12.4M18.2 5.8L5.8 18.2" stroke-width="2.8"/>` },
    passive_hoshi:{ label:'ホシ', tint:'current', body:`<path d="${star5(12,12.8,9.6,4.1)}" stroke-width="2.2"/>` },
    passive_check:{ label:'チェック', tint:'current', body:`<path d="M4 12.8l5.2 5.2L20 6.5" stroke-width="2.8"/>` },
    passive_seven:{ label:'セブン', tint:'current', body:`<path d="M5.5 4.8h13L10.5 20.5M8.5 12.5h7" stroke-width="2.6"/>` },

    /* 副記号（マルチ）：黄色バッジ＝強化由来 */
    multi_circle:{ label:'マルマルチ', tint:'fixed', body:
        `<circle cx="12" cy="12" r="10.5"${F(C.yellow)}/><circle cx="12" cy="12" r="5.4"${s(C.dark)} stroke-width="2.6"/>` },
    multi_triangle:{ label:'サンカクマルチ', tint:'fixed', body:
        `<circle cx="12" cy="12" r="10.5"${F(C.yellow)}/><path d="M12 6.4l6 10.4H6z"${s(C.dark)} stroke-width="2.4"/>` },
    multi_square:{ label:'シカクマルチ', tint:'fixed', body:
        `<circle cx="12" cy="12" r="10.5"${F(C.yellow)}/><rect x="7.3" y="7.3" width="9.4" height="9.4" rx=".8"${s(C.dark)} stroke-width="2.4"/>` },
    multi_cross:{ label:'バツマルチ', tint:'fixed', body:
        `<circle cx="12" cy="12" r="10.5"${F(C.yellow)}/><path d="M8 8l8 8M16 8l-8 8"${s(C.dark)} stroke-width="2.6"/>` },
    multi_all:{ label:'オールマルチ', tint:'fixed', body:
        `<circle cx="12" cy="12" r="10.5"${F(C.yellow)}/>`
      + `<circle cx="8.3" cy="8.6" r="2.6"${s(C.dark)} stroke-width="1.9"/>`
      + `<rect x="13.2" y="6" width="5.2" height="5.2" rx=".5"${s(C.dark)} stroke-width="1.9"/>`
      + `<path d="M12 12.8l3.4 5.6H8.6z"${s(C.dark)} stroke-width="1.9"/>` },

    /* ---------------- パック / アップグレード ---------------- */
    pack_card:{ label:'？カードパック', tint:'fixed', body: cardBase(C.blue)
      + `<path d="M11.3 9.3a2.4 2.4 0 1 1 3.4 2.2c-.7.3-1.1.9-1.1 1.7"${s(C.blueL)} stroke-width="2.1"/>`
      + `<circle cx="13.6" cy="16.3" r="1.2"${F(C.blueL)}/>` },
    pack_card_focus:{ label:'カードフォーカスパック', tint:'fixed', body: cardBase(C.white)
      + `<circle cx="12" cy="11.5" r="4.6"${s(C.white)} fill="${C.dark}"/>`
      + `<path d="M15.3 14.8l5.2 5.2"${s(C.white)} stroke-width="2.8"/>` },
    pack_dream:{ label:'ドリームカードパック', tint:'fixed', body: cardBase(C.indigo)
      + `<path d="M14.6 6.6a5.6 5.6 0 1 0 3.6 9.8 5 5 0 0 1-3.6-9.8z"${s(C.indigo)} stroke-width="1.5" fill="${C.indigo}"/>`
      + star4(17.2,8.2,2,F('#e0e7ff')) },
    pack_jamming:{ label:'ジャミングカードパック', tint:'fixed', body: cardBase(C.green)
      + `<path d="M13.5 16.8a4.8 4.8 0 1 1 4.8-4.8 3 3 0 0 1-3 3 1.8 1.8 0 0 1-1.8-1.8"${s(C.greenL)} stroke-width="2"/>` },
    pack_enhance:{ label:'強化カードパック', tint:'fixed', body: cardBase(C.yellow)
      + `<path d="M9.8 12.3l3.7-3.7 3.7 3.7M9.8 16.8l3.7-3.7 3.7 3.7"${s(C.yellow)} stroke-width="2.3"/>` },
    pack_bingo_focus:{ label:'ビンゴフォーカスパック', tint:'fixed', body: cardBase(C.white)
      + `<circle cx="10.5" cy="7.8" r="1.1"${F(C.white)} fill-opacity=".55"/><circle cx="13.5" cy="7.8" r="1.1"${F(C.white)} fill-opacity=".55"/><circle cx="16.5" cy="7.8" r="1.1"${F(C.white)} fill-opacity=".55"/>`
      + `<circle cx="10.5" cy="11.5" r="1.1"${F(C.white)} fill-opacity=".55"/><circle cx="16.5" cy="11.5" r="1.1"${F(C.white)} fill-opacity=".55"/>`
      + `<circle cx="10.5" cy="15.2" r="1.1"${F(C.white)} fill-opacity=".55"/><circle cx="13.5" cy="15.2" r="1.1"${F(C.white)} fill-opacity=".55"/><circle cx="16.5" cy="15.2" r="1.1"${F(C.white)} fill-opacity=".55"/>`
      + `<path d="M9 17l9-10.6"${s(C.gold)} stroke-width="2.3"/>` },
    pack_upgrade:{ label:'通常アップグレード', tint:'fixed', body:
        `<circle cx="12" cy="12" r="9.5"${s(C.teal)}${tf(C.teal,0.22)}/>`
      + `<path d="M12 17.5V7M7.2 11.4L12 6.6l4.8 4.8"${s(C.teal)} stroke-width="2.6"/>` },
    pack_explosive:{ label:'爆発通常アップグレード', tint:'fixed', body:
        `<path d="M12 1.8l2.2 4.6 4.9-1.9-1.4 5 4.5 2.6-4.6 2.3 1.6 5-5-1.6L12 22.2 9.8 17.8l-5 1.6 1.6-5-4.6-2.3 4.5-2.6-1.4-5 4.9 1.9z"${s(C.orange)}${tf(C.orange,0.3)}/>`
      + `<path d="M12 15.8V8.5M9 11.3l3-3 3 3"${s('#fed7aa')} stroke-width="2.3"/>` },
    pack_special:{ label:'特別アップグレード', tint:'fixed', body:
        `<circle cx="11" cy="13" r="8.5"${s(C.gold)}${tf(C.gold,0.25)}/>`
      + `<path d="M11 18V8.6M7 12.3l4-4 4 4"${s(C.gold)} stroke-width="2.5"/>`
      + star4(19.5,4.5,3.6,F('#fde68a'))
      + star4(3.4,4.2,1.8,F('#fde68a')) },
    pack_relic:{ label:'レリックパック', tint:'fixed', body:
        `<path d="M7 3.5h10v5.5a5 5 0 0 1-10 0z"${s(C.gold)}${tf(C.gold,0.3)}/>`
      + `<path d="M7 5.2H3.8v1.3A3.2 3.2 0 0 0 7 9.7M17 5.2h3.2v1.3A3.2 3.2 0 0 1 17 9.7"${s(C.gold)} stroke-width="1.8"/>`
      + `<path d="M12 14v3.5M8 20.5h8M9.2 20.5l.8-3h4l.8 3"${s(C.gold)}/>`
      + `<circle cx="12" cy="8" r="2"${F(C.redD)}/>` },
    shop_pickup_relic:{ label:'ピックアップレリック', tint:'fixed', body:
        `<path d="M9 3h6M9.8 3v2.8C6.5 7.2 5 9.8 5 13c0 4.3 3 7.5 7 7.5s7-3.2 7-7.5c0-3.2-1.5-5.8-4.8-7.2V3"${s(C.gold)}${tf(C.gold,0.2)}/>`
      + `<path d="M6.2 11.5h11.6"${s(C.gold)} stroke-width="1.5" stroke-opacity=".7"/>`
      + `<circle cx="12" cy="15" r="2.3"${F(C.redD)}/>` },
    shop_pickup_upgrade:{ label:'ピックアップアップグレード', tint:'fixed', body:
        `<circle cx="11" cy="13" r="8.5"${s(C.teal)}${tf(C.teal,0.15)}/>`
      + `<circle cx="11" cy="13" r="4.4"${s(C.teal)}/>`
      + `<circle cx="11" cy="13" r="1.4"${F(C.teal)}/>`
      + `<path d="M11 13l9.5-9.5M17.2 3.5h3.3v3.3"${s(C.white)} stroke-width="2"/>` },

    /* レア度ジェム */
    rarity_normal:{ label:'通常効果', tint:'fixed', body:
        `<path d="M6.5 4h11l4 5.3L12 20.5 2.5 9.3z"${s(C.yellow)}${tf(C.yellow,0.55)}/>`
      + `<path d="M2.8 9.3h18.4M9 4.2l-1.6 5.1L12 20M15 4.2l1.6 5.1L12 20"${s(C.yellow)} stroke-width="1.3"/>` },
    rarity_rare:{ label:'レア/特別効果', tint:'fixed', body:
        `<path d="M6.5 4h11l4 5.3L12 20.5 2.5 9.3z"${s(C.blue)}${tf(C.blue,0.55)}/>`
      + `<path d="M2.8 9.3h18.4M9 4.2l-1.6 5.1L12 20M15 4.2l1.6 5.1L12 20"${s(C.blue)} stroke-width="1.3"/>` },
    rarity_jamming:{ label:'ジャミング付与', tint:'fixed', body:
        `<path d="M6.5 4h11l4 5.3L12 20.5 2.5 9.3z"${s(C.green)}${tf(C.green,0.55)}/>`
      + `<path d="M2.8 9.3h18.4M9 4.2l-1.6 5.1L12 20M15 4.2l1.6 5.1L12 20"${s(C.green)} stroke-width="1.3"/>` },

    /* ---------------- ボタン（currentColor） ---------------- */
    btn_reroll:{ label:'リロール', tint:'current', body:
        `<path d="M19.5 10A8 8 0 0 0 5.6 7M4.5 14a8 8 0 0 0 13.9 3"/>`
      + `<path d="M5 2.8v4.6h4.6M19 21.2v-4.6h-4.6"/>` },
    btn_skip:{ label:'スキップ', tint:'current', body:
        `<path d="M5 5.2l10 6.8-10 6.8z" fill="currentColor" fill-opacity=".3"/><path d="M19 5v14" stroke-width="2.6"/>` },
    btn_deck:{ label:'デッキ', tint:'current', body:
        `<path d="M11 2.5h7.5A1.8 1.8 0 0 1 20.3 4.3V15" stroke-opacity=".55"/>`
      + `<path d="M7.5 5h8.2a1.8 1.8 0 0 1 1.8 1.8V18" stroke-opacity=".8"/>`
      + `<rect x="3.7" y="7.5" width="11" height="14" rx="1.8" fill="currentColor" fill-opacity=".3"/>` },
    btn_drawpile:{ label:'山札', tint:'current', body:
        `<path d="M5 17.5v1.2A1.8 1.8 0 0 0 6.8 20.5h10.4a1.8 1.8 0 0 0 1.8-1.8v-1.2"/>`
      + `<rect x="5" y="9" width="14" height="8.5" rx="1.8" fill="currentColor" fill-opacity=".3"/>`
      + `<path d="M12 7.5V2.2M9.2 4.8L12 2l2.8 2.8"/>` },
    btn_discard:{ label:'捨て札', tint:'current', body:
        `<path d="M4 14.5v4.2A1.8 1.8 0 0 0 5.8 20.5h12.4a1.8 1.8 0 0 0 1.8-1.8v-4.2"/>`
      + `<rect x="8" y="3" width="8" height="11" rx="1.4" transform="rotate(18 12 8.5)" fill="currentColor" fill-opacity=".3"/>`
      + `<path d="M8.5 17h7"/>` },
    btn_trash:{ label:'廃棄札', tint:'current', body:
        `<path d="M3.5 6.5h17M9.5 6.5V4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2.5"/>`
      + `<path d="M5.5 6.5l1 13a1.8 1.8 0 0 0 1.8 1.5h7.4a1.8 1.8 0 0 0 1.8-1.5l1-13" fill="currentColor" fill-opacity=".25"/>`
      + `<path d="M10 10.5v6.5M14 10.5v6.5"/>` },
    btn_map:{ label:'マップ', tint:'current', body:
        `<path d="M3 6.2l5.5-2.2 7 2.5L21 4.3v13.5l-5.5 2.2-7-2.5L3 19.7z" fill="currentColor" fill-opacity=".2"/>`
      + `<path d="M8.5 4v13.5M15.5 6.5V20" stroke-width="1.5" stroke-opacity=".7"/>`
      + `<path d="M5.5 15.5c2-3 4-1 6-4s3.5-1 5-3" stroke-width="1.6" stroke-dasharray="1.6 2.2"/>` },
    btn_fast_forward:{ label:'早送り', tint:'current', body:
        `<path d="M2.5 5.5L11.5 12l-9 6.5zM12.5 5.5l9 6.5-9 6.5z" fill="currentColor" fill-opacity=".3"/>` },
    btn_pack_breakdown:{ label:'パック内訳', tint:'current', body:
        `<path d="M12 2.8l8.5 4.4v9.6L12 21.2l-8.5-4.4V7.2z" fill="currentColor" fill-opacity=".2"/>`
      + `<path d="M3.5 7.2L12 11.6l8.5-4.4M12 11.6v9.6"/>`
      + `<path d="M7.8 5l8.5 4.4" stroke-width="1.5" stroke-opacity=".7"/>` },
    btn_lock:{ label:'ロック', tint:'current', body:
        `<path d="M7.5 10.5V7.5a4.5 4.5 0 0 1 9 0v3"/>`
      + `<rect x="4.5" y="10.5" width="15" height="10.5" rx="2.2" fill="currentColor" fill-opacity=".3"/>`
      + `<path d="M12 14.6v2.6"/>` },
    btn_boss_reroll:{ label:'ボス効果リロール', tint:'current', body:
        `<path d="${star5(12,12.6,5.4,2.4)}" fill="currentColor" fill-opacity=".35" stroke-width="1.6"/>`
      + `<path d="M20.5 11A8.6 8.6 0 0 0 5.2 6.4M3.5 13a8.6 8.6 0 0 0 15.3 4.6"/>`
      + `<path d="M4.8 2.6v4.2H9M19.2 21.4v-4.2H15"/>` },
    btn_left:{ label:'左へ', tint:'current', body:`<path d="M16.5 4.5v15L6 12z" fill="currentColor" fill-opacity=".85"/>` },
    btn_right:{ label:'右へ', tint:'current', body:`<path d="M7.5 4.5v15L18 12z" fill="currentColor" fill-opacity=".85"/>` },
    btn_caret_up:{ label:'開く/閉じる(上)', tint:'current', body:`<path d="M4.5 16.5h15L12 6z" fill="currentColor" fill-opacity=".85"/>` },
    btn_caret_down:{ label:'開く/閉じる(下)', tint:'current', body:`<path d="M4.5 7.5h15L12 18z" fill="currentColor" fill-opacity=".85"/>` },

    /* ---------------- レリック / 状態 ---------------- */
    relic_size_dot:{ label:'レリックサイズ', tint:'fixed', body:
        `<circle cx="12" cy="12" r="8"${F(C.redD)}/>`
      + `<circle cx="12" cy="12" r="8"${s('#fca5a5')} stroke-width="1.4" stroke-opacity=".7"/>`
      + `<path d="M8.2 9.8a4.5 4.5 0 0 1 3-2.6"${s('#fee2e2')} stroke-width="1.8"/>` },
    relic_trigger:{ label:'レリック発動', tint:'fixed', body:
        `<path d="M12 1.5v3.5M12 19v3.5M1.5 12H5M19 12h3.5M4.6 4.6l2.4 2.4M17 17l2.4 2.4M19.4 4.6L17 7M7 17l-2.4 2.4"${s(C.red)}/>`
      + `<path d="M12 6.8l5.2 5.2-5.2 5.2L6.8 12z"${F(C.redD)}/>`
      + `<path d="M12 6.8l5.2 5.2-5.2 5.2L6.8 12z"${s('#fecaca')} stroke-width="1.4"/>` },
    cell_blocked:{ label:'配置不可', tint:'current', body:
        `<rect x="3.5" y="3.5" width="17" height="17" rx="3" stroke-width="1.6" stroke-dasharray="3 2.2" stroke-opacity=".7"/>`
      + `<path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke-width="2.2"/>` },
    joker:{ label:'ジョーカー', tint:'fixed', body:
        `<rect x="4" y="2" width="16" height="20" rx="2.4"${s(C.purple)}${tf(C.purple,0.18)}/>`
      + `<path d="M7.4 15.5C7.3 12.5 6.8 10.4 6 9.3 8.4 9.4 10 11.4 12 14.6 14 11.4 15.6 9.4 18 9.3 17.2 10.4 16.7 12.5 16.6 15.5z"${s(C.purple)} stroke-width="1.6"${tf(C.purple,0.55)}/>`
      + `<path d="M12 14.6C11.4 11 11.1 8.4 12 6.6 12.9 8.4 12.6 11 12 14.6"${s(C.purple)} stroke-width="1.6"/>`
      + `<path d="M7.4 17.8h9.2"${s(C.purple)} stroke-width="1.8"/>`
      + `<circle cx="6" cy="8.4" r="1.4"${F(C.gold)}/><circle cx="18" cy="8.4" r="1.4"${F(C.gold)}/><circle cx="12" cy="5.6" r="1.4"${F(C.gold)}/>` },

    /* ---------------- 演出 ---------------- */
    fx_flame:{ label:'炎', tint:'fixed', body:
        `<path d="M12 2.5c1 3.5 6 5.8 6 11.2a6 6 0 0 1-12 0c0-3 1.6-4.6 2.8-5.8.2 2 1 3.1 2 3.4C10.3 8.4 11.2 5.3 12 2.5z"${s(C.orange)}${tf(C.orange,0.35)}/>`
      + `<path d="M12 20.5a2.8 2.8 0 0 1-2.8-2.8c0-2 1.6-2.7 2.3-4.4.9 1.5 3.3 2.4 3.3 4.4a2.8 2.8 0 0 1-2.8 2.8z"${F('#fde68a')}/>` },
    fx_snake_tail:{ label:'蛇の尾', tint:'fixed', body:
        `<path d="M3 5.5c5 0 7 2.4 7 5.5s-3.5 3.5-3.5 6 3 3.5 6.5 3.5c3.5 0 5-1.5 6.5-3.5"${s(C.teal)} stroke-width="3.6"/>`
      + `<path d="M3 5.5c5 0 7 2.4 7 5.5s-3.5 3.5-3.5 6 3 3.5 6.5 3.5c3.5 0 5-1.5 6.5-3.5"${s(C.dark)} stroke-width="1" stroke-dasharray="1 2.4"/>`
      + `<path d="M19.5 17l2.5-2.8"${s(C.teal)} stroke-width="1.6"/>` },
    fx_hold_triangle:{ label:'保留（三角放出）', tint:'current', body:`<path d="M12 4l9 15.5H3z" fill="currentColor" fill-opacity=".9" stroke-width="1.6"/>` },
    fx_sparkle:{ label:'キラ（塗り）', tint:'current', body: star4(12,12,10,' fill="currentColor" stroke="none"') },
    fx_sparkle_outline:{ label:'キラ（線）', tint:'current', body: star4(12,12,9.5,' stroke-width="1.6"') },
    all_clear:{ label:'全階層クリア', tint:'fixed', body:
        `<path d="M3 21l4.2-12.2 8 8z"${s(C.gold)}${tf(C.gold,0.4)}/>`
      + `<path d="M5.4 14.2l4.4 4.4"${s(C.gold)} stroke-width="1.5"/>`
      + `<path d="M12.5 8.8c.8-2.4 2.8-3 4.2-2.2M15 11.5c2-1.4 4-.6 5 .8"${s(C.pink)}/>`
      + `<path d="M11 2.5l.3 2.2"${s(C.blue)}/><path d="M20.5 3.5l-1.5 1.8"${s(C.green)}/>`
      + `<circle cx="16" cy="3" r="1.2"${F(C.pink)}/><circle cx="21" cy="8.5" r="1.1"${F(C.blue)}/><circle cx="18.8" cy="15.5" r="1.1"${F(C.gold)}/>` },

    /* ---------------- 新規：魔力 / 魔神 ---------------- */
    passive_mana:{ label:'魔力', tint:'fixed', body:
        `<path d="M12 2.5C9 7 5.5 10 5.5 14.5a6.5 6.5 0 0 0 13 0C18.5 10 15 7 12 2.5z"${s(C.violet)}${tf(C.violet,0.3)}/>`
      + star4(12,14.8,4.2,F('#ede9fe'))
      + `<circle cx="18.8" cy="4.8" r="1.2"${F(C.pink)}/>` },
    majin:{ label:'魔神', tint:'fixed', body:
        `<path d="M6.5 9.5C4 8 2.8 5.5 3.2 2.5 5 4.8 6.8 5.7 8.8 6M17.5 9.5C20 8 21.2 5.5 20.8 2.5 19 4.8 17.2 5.7 15.2 6"${s(C.red)}${tf(C.red,0.35)}/>`
      + `<path d="M12 5.5l6.5 3.5v6.5L12 21l-6.5-5.5V9z"${s(C.purple)}${tf(C.purple,0.3)}/>`
      + `<path d="M8.4 11.4l2.6 1.2M15.6 11.4L13 12.6"${s('#fecaca')} stroke-width="2.2"/>`
      + `<path d="M10 16.8l2 1.4 2-1.4"${s(C.purple)} stroke-width="1.6"/>` }
  };

  const KEYS = Object.keys(D);

  const byGuiId = {
    'GUI-001':'jam_stun','GUI-002':'jam_thunder','GUI-003':'jam_confuse','GUI-004':'jam_break','GUI-005':'jam_prolong',
    'GUI-006':'jam_bingo_block','GUI-007':'jam_link','GUI-008':'jam_redraw','GUI-009':'jam_seal','GUI-010':'jam_guide',
    'GUI-011':'enh_hub','GUI-012':'enh_chain','GUI-013':'enh_extend','GUI-014':'enh_top_speed','GUI-015':'enh_gamble',
    'GUI-016':'sym_circle','GUI-017':'sym_triangle','GUI-018':'sym_square','GUI-019':'sym_cross',
    'GUI-020':'passive_hoshi','GUI-021':'passive_check','GUI-022':'passive_seven',
    'GUI-023':'multi_circle','GUI-024':'multi_triangle','GUI-025':'multi_square','GUI-026':'multi_cross','GUI-027':'multi_all',
    'GUI-028':'sym_circle','GUI-029':'sym_circle','GUI-030':'sym_circle',
    'GUI-031':'pack_card','GUI-032':'pack_upgrade','GUI-033':'pack_explosive','GUI-034':'pack_special','GUI-035':'pack_card_focus',
    'GUI-036':'pack_dream','GUI-037':'pack_jamming','GUI-038':'pack_relic','GUI-039':'pack_enhance',
    'GUI-040':'shop_pickup_relic','GUI-041':'pack_card','GUI-042':'shop_pickup_upgrade','GUI-043':'pack_upgrade','GUI-044':'pack_special',
    'GUI-045':'pack_card_focus','GUI-046':'pack_bingo_focus','GUI-047':'pack_dream','GUI-048':'pack_enhance','GUI-049':'pack_jamming',
    'GUI-050':'pack_relic','GUI-051':'pack_explosive',
    'GUI-052':'rarity_normal','GUI-053':'rarity_rare','GUI-054':'rarity_rare','GUI-055':'rarity_jamming',
    'GUI-056':'btn_reroll','GUI-057':'btn_skip','GUI-058':'btn_deck','GUI-059':'btn_drawpile','GUI-060':'btn_discard',
    'GUI-061':'btn_trash','GUI-062':'btn_map','GUI-063':'btn_fast_forward','GUI-064':'btn_pack_breakdown','GUI-065':'btn_lock',
    'GUI-066':'btn_boss_reroll','GUI-067':'btn_left','GUI-068':'btn_right','GUI-069':'btn_caret_down',
    'GUI-070':'relic_size_dot','GUI-071':'relic_trigger','GUI-072':'passive_check','GUI-073':'cell_blocked',
    'GUI-074':'pack_card','GUI-075':'joker','GUI-076':'btn_pack_breakdown','GUI-077':'pack_explosive',
    'GUI-078':'fx_flame','GUI-079':'fx_snake_tail','GUI-080':'fx_hold_triangle',
    'GUI-081':'fx_sparkle','GUI-082':'fx_sparkle','GUI-083':'fx_sparkle','GUI-084':'fx_sparkle','GUI-085':'fx_sparkle',
    'GUI-086':'all_clear','GUI-087':'pack_explosive','GUI-088':'pack_explosive','GUI-089':'pack_explosive','GUI-090':'pack_relic'
    ,'GUI-091':'pack_bingo_focus'
  };

  // 元の絵文字 → 代表キー（同じ絵文字で意味が異なる場合は主な用途を採用。文脈で分けるときは byGuiId を使う）
  const byEmoji = {
    '❌':'jam_stun','⚡️':'jam_thunder','⚡':'jam_thunder','❓':'jam_confuse','⏯':'jam_break','⏯️':'jam_break','4️⃣':'jam_prolong',
    '😵':'jam_bingo_block','⛓':'jam_link','⛓️':'jam_link','↩️':'jam_redraw','↩':'jam_redraw','🗃':'jam_seal','🗃️':'jam_seal','👆':'jam_guide',
    '➕':'enh_hub','🤝':'enh_chain','⏩':'enh_extend','💨':'enh_top_speed','🎰':'enh_gamble',
    '○':'sym_circle','△':'sym_triangle','□':'sym_square','×':'sym_cross','☆':'passive_hoshi','✓':'passive_check','7':'passive_seven',
    '○△□':'multi_all',
    '🎴':'pack_card','⬆️':'pack_upgrade','⬆':'pack_upgrade','💥':'pack_explosive','✨':'pack_special','🔍':'pack_card_focus',
    '🌙':'pack_dream','🌀':'pack_jamming','🏆':'pack_relic','💪':'pack_enhance','🏺':'shop_pickup_relic','🎯':'shop_pickup_upgrade',
    '🟡':'rarity_normal','🔵':'rarity_rare','🟢':'rarity_jamming',
    '♻️':'btn_reroll','♻':'btn_reroll','⏭️':'btn_skip','⏭':'btn_skip','⭕️':'btn_deck','⭕':'btn_deck','❎':'btn_discard',
    '🗑️':'btn_trash','🗑':'btn_trash','🗺️':'btn_map','🗺':'btn_map','📦':'btn_pack_breakdown','🔒':'btn_lock',
    '◀':'btn_left','▶':'btn_right','▲':'btn_caret_up','▼':'btn_caret_down',
    '🔴':'relic_size_dot','✕':'cell_blocked','🃏':'joker','🔥':'fx_flame','🐍':'fx_snake_tail',
    '✦':'fx_sparkle','✧':'fx_sparkle_outline','🎉':'all_clear'
  };

  function esc(v){ return String(v==null?'':v).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  function svg(key, opts){
    opts = opts || {};
    const d = D[key];
    if(!d) return '';
    let size = opts.size==null ? '1em' : opts.size;
    if(typeof size==='number') size = size+'px';
    const cls = 'gi gi-'+key+(d.tint==='fixed'?' gi-fixed':'')+(opts.cls?' '+esc(opts.cls):'');
    const a11y = opts.title ? ` role="img"><title>${esc(opts.title)}</title>` : ` aria-hidden="true" focusable="false">`;
    return `<svg class="${cls}" viewBox="0 0 24 24" width="${esc(size)}" height="${esc(size)}" xmlns="http://www.w3.org/2000/svg"`
      + ` fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${a11y}`
      + d.body + `</svg>`;
  }
  function has(key){ return Object.prototype.hasOwnProperty.call(D, key); }
  function meta(key){ const d=D[key]; return d ? { label:d.label, tint:d.tint } : null; }

  return { svg, has, meta, KEYS, byGuiId, byEmoji, COLOR:C };
})();
