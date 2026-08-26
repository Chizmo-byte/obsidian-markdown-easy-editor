/**
 * コールアウト記法の定義とスニペット生成。
 *
 * このモジュールは obsidian パッケージに依存させないこと（i18n.ts と同じ理由）。
 *
 * 色について：以前は `rgb(var(--callout-warning, ...))` のように Obsidian 本体の
 * CSS 変数を参照していたが、これは実機で色が出ない不具合の原因になった。
 * 変数が RGB 三つ組**以外**（16進数・rgb()・色名・空）で定義されていると
 * `rgb(...)` の置換結果が不正になり、CSS の規定により宣言そのものが破棄される。
 * このとき var() のフォールバックは使われない（変数は「定義済み」のため）ので、
 * ボーダーが丸ごと消える。テーマがコールアウト色を再定義すると容易に起きる。
 *
 * そのため変数参照をやめ、実測値を直接持つ。値は Obsidian 本体 app.css の
 * .theme-dark / .theme-light 各ブロックにある --color-*-rgb から採取している。
 */

export interface CalloutType {
  /** `> [!xxx]` に入る種別名。 */
  type: string;
  /** ダークテーマでの RGB 三つ組。 */
  darkRgb: string;
  /** ライトテーマでの RGB 三つ組。 */
  lightRgb: string;
}

/**
 * パレットに並べる12種類。表示順はおすすめ順。
 *
 * 各行のコメントは Obsidian 側の対応。note に `[data-callout="note"]` の規則は
 * 存在せず `.callout` の既定色（--callout-default）が当たる。danger は error の、
 * abstract は summary の別名。
 */
export const CALLOUT_TYPES: ReadonlyArray<CalloutType> = [
  { type: "note", darkRgb: "2, 122, 255", lightRgb: "8, 109, 221" },       // default → blue
  { type: "tip", darkRgb: "83, 223, 221", lightRgb: "0, 191, 188" },       // cyan
  { type: "important", darkRgb: "83, 223, 221", lightRgb: "0, 191, 188" }, // cyan
  { type: "warning", darkRgb: "233, 151, 63", lightRgb: "236, 117, 0" },   // orange
  { type: "danger", darkRgb: "251, 70, 76", lightRgb: "233, 49, 71" },     // error → red
  { type: "info", darkRgb: "2, 122, 255", lightRgb: "8, 109, 221" },       // blue
  { type: "success", darkRgb: "68, 207, 110", lightRgb: "8, 185, 78" },    // green
  { type: "question", darkRgb: "233, 151, 63", lightRgb: "236, 117, 0" },  // orange
  { type: "example", darkRgb: "168, 130, 255", lightRgb: "120, 82, 238" }, // purple
  { type: "quote", darkRgb: "158, 158, 158", lightRgb: "158, 158, 158" },  // 本体が直値で定義
  { type: "abstract", darkRgb: "83, 223, 221", lightRgb: "0, 191, 188" },  // summary → cyan
  { type: "bug", darkRgb: "251, 70, 76", lightRgb: "233, 49, 71" },        // red
];

/**
 * パレットのボタンに引くアクセント色を返す。
 * 必ず解決済みの `rgb(r, g, b)` を返し、var() は一切含めない。
 */
export function calloutAccentColor(callout: CalloutType, isDarkTheme: boolean): string {
  return `rgb(${isDarkTheme ? callout.darkRgb : callout.lightRgb})`;
}

/** i18n の文言キー。`note` → `labelCalloutNote` / `tipCalloutNote`。 */
export function calloutStringKey(prefix: "label" | "tip", type: string): string {
  return `${prefix}Callout${type.charAt(0).toUpperCase()}${type.slice(1)}`;
}

/**
 * 挿入するコールアウトを組み立てる。
 *
 * 選択範囲があればそれを本文として引用行に畳み込む（選択テキストを捨てない）。
 * 選択が無ければ本文プレースホルダーを置く。タイトルは常にプレースホルダーで、
 * 呼び出し側が選択状態にして上書き入力できるようにする。
 */
export function buildCalloutSnippet(
  type: string,
  titlePlaceholder: string,
  bodyPlaceholder: string,
  selection?: string,
): string {
  const body = selection && selection.length > 0
    ? selection.split("\n").map((line) => `> ${line}`).join("\n")
    : `> ${bodyPlaceholder}`;

  return `> [!${type}] ${titlePlaceholder}\n${body}`;
}
