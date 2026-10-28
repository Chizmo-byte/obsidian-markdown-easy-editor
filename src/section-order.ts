/**
 * パレットの大メニューの並び順。設定画面の上下の矢印で入れ替えられる。
 *
 * このモジュールは obsidian パッケージに依存させないこと（i18n.ts と同じ理由）。
 * Node 上のテストから直接読み込むため、import には拡張子 .ts を付けている。
 */
import { SECTION_IDS, type SectionId } from "./toolbar-visibility.ts";

/** 既定の並び順。従来の 4 メニューの順序は変えず、My menu は一番下。 */
export const DEFAULT_SECTION_ORDER: ReadonlyArray<SectionId> = SECTION_IDS;

/**
 * 保存データから並び順を取り出す。
 * 未知の id・重複は捨て、含まれていない大メニューは既定の位置関係を保って末尾に足す
 * （新しい大メニューを追加したバージョンへ更新しても、保存済みの順序を壊さない）。
 */
export function normalizeSectionOrder(raw: unknown): SectionId[] {
  const known = new Set<string>(SECTION_IDS);
  const result: SectionId[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string" && known.has(item) && result.indexOf(item as SectionId) === -1) {
        result.push(item as SectionId);
      }
    }
  }
  for (const id of SECTION_IDS) {
    if (result.indexOf(id) === -1) result.push(id);
  }
  return result;
}

/** index 番目の要素を 1 つ上（direction = -1）／下（+1）へ動かした新しい配列を返す。端では変わらない。 */
export function moveSection(order: ReadonlyArray<SectionId>, index: number, direction: -1 | 1): SectionId[] {
  const target = index + direction;
  if (index < 0 || index >= order.length || target < 0 || target >= order.length) return [...order];
  const next = [...order];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
