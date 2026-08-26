/**
 * コールアウト記法の定義とスニペット生成。
 *
 * このモジュールは obsidian パッケージに依存させないこと（i18n.ts と同じ理由）。
 * 色は Obsidian 本体の CSS 変数をそのまま参照する。テーマやライト/ダークで
 * 値が変わるため、16進数を焼き込まずに変数へ委ねている。
 * 変数名と対応は Obsidian 本体の app.css（.callout[data-callout="..."] の定義）に準拠。
 */

export interface CalloutType {
  /** `> [!xxx]` に入る種別名。 */
  type: string;
  /** Obsidian が実際にこの種別へ割り当てている CSS 変数名。 */
  colorVar: string;
  /** 変数が解決できなかった場合に使う RGB 三つ組。 */
  fallbackRgb: string;
}

/**
 * パレットに並べる12種類。表示順はおすすめ順。
 *
 * note に `[data-callout="note"]` の規則は存在せず、`.callout` の既定色
 * （--callout-default）が適用される。danger は error の、abstract は summary の
 * 別名として定義されているため、色変数はそれぞれの実体を指している。
 */
export const CALLOUT_TYPES: ReadonlyArray<CalloutType> = [
  { type: "note", colorVar: "--callout-default", fallbackRgb: "8, 109, 221" },
  { type: "tip", colorVar: "--callout-tip", fallbackRgb: "0, 191, 188" },
  { type: "important", colorVar: "--callout-important", fallbackRgb: "0, 191, 188" },
  { type: "warning", colorVar: "--callout-warning", fallbackRgb: "236, 117, 0" },
  { type: "danger", colorVar: "--callout-error", fallbackRgb: "233, 49, 71" },
  { type: "info", colorVar: "--callout-info", fallbackRgb: "8, 109, 221" },
  { type: "success", colorVar: "--callout-success", fallbackRgb: "8, 185, 78" },
  { type: "question", colorVar: "--callout-question", fallbackRgb: "236, 117, 0" },
  { type: "example", colorVar: "--callout-example", fallbackRgb: "120, 82, 238" },
  { type: "quote", colorVar: "--callout-quote", fallbackRgb: "158, 158, 158" },
  { type: "abstract", colorVar: "--callout-summary", fallbackRgb: "0, 191, 188" },
  { type: "bug", colorVar: "--callout-bug", fallbackRgb: "233, 49, 71" },
];

/** パレットのボタンに引くアクセント色。Obsidian の変数を優先し、無ければ固定値。 */
export function calloutAccentColor(callout: CalloutType): string {
  return `rgb(var(${callout.colorVar}, ${callout.fallbackRgb}))`;
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
