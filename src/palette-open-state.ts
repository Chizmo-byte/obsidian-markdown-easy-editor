/**
 * パレットの大メニュー（アコーディオン）ごとの開閉状態。
 *
 * obsidian パッケージに依存させないこと（Node のテストから直接読み込むため、
 * import には拡張子 .ts を付けている）。
 * 既定値は従来の挙動（見出し・基本は開く、その他・コールアウトは閉じる）と同じ。
 */
import type { SectionId } from "./toolbar-visibility.ts";

export type PaletteOpenState = Record<SectionId, boolean>;

export const DEFAULT_PALETTE_OPEN_STATE: Readonly<PaletteOpenState> = {
  headings: true,
  basic: true,
  more: false,
  callouts: false,
};

/** 保存データから開閉状態を取り出す。無い・壊れている項目は既定値に戻す。常に新しいオブジェクトを返す。 */
export function normalizePaletteOpenState(raw: unknown): PaletteOpenState {
  const source = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const result: PaletteOpenState = { ...DEFAULT_PALETTE_OPEN_STATE };
  for (const id of Object.keys(DEFAULT_PALETTE_OPEN_STATE) as SectionId[]) {
    const value = source[id];
    if (typeof value === "boolean") result[id] = value;
  }
  return result;
}
