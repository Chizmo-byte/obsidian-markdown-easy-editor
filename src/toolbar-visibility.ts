/**
 * パレット（ツールバー）の「大メニュー」と「見出しレベル」の表示/非表示。
 *
 * このモジュールは obsidian パッケージに依存させないこと（i18n.ts と同じ理由）。
 * Node 上のテストから直接読み込むため、import には拡張子 .ts を付けている。
 *
 * すべてデフォルトは true（表示）。設定を一度も触っていない既存ユーザーの
 * パレットは、このモジュールを入れても完全に同じ見た目になる。
 */

/** 大メニュー（パレットのアコーディオン）の識別子。並び順はパレット上の順序と同じ。 */
export const SECTION_IDS = ["headings", "basic", "more", "callouts"] as const;
export type SectionId = (typeof SECTION_IDS)[number];

/** 見出しボタンのレベル。 */
export const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;
export type HeadingLevel = (typeof HEADING_LEVELS)[number];

/**
 * 設定に保存する表示フラグ。
 * 設定タブのトグルは「boolean 型の設定キー」を直接読み書きするため、
 * 配列ではなくキーごとの boolean にしている。
 */
export interface ToolbarVisibilitySettings {
  showSectionHeadings: boolean;
  showSectionBasic: boolean;
  showSectionMore: boolean;
  showSectionCallouts: boolean;
  showHeadingH1: boolean;
  showHeadingH2: boolean;
  showHeadingH3: boolean;
  showHeadingH4: boolean;
  showHeadingH5: boolean;
  showHeadingH6: boolean;
}

export type ToolbarVisibilityKey = keyof ToolbarVisibilitySettings;

export const DEFAULT_TOOLBAR_VISIBILITY: Readonly<ToolbarVisibilitySettings> = {
  showSectionHeadings: true,
  showSectionBasic: true,
  showSectionMore: true,
  showSectionCallouts: true,
  showHeadingH1: true,
  showHeadingH2: true,
  showHeadingH3: true,
  showHeadingH4: true,
  showHeadingH5: true,
  showHeadingH6: true,
};

/** 大メニュー → 設定キー。 */
export const SECTION_VISIBILITY_KEYS: Readonly<Record<SectionId, ToolbarVisibilityKey>> = {
  headings: "showSectionHeadings",
  basic: "showSectionBasic",
  more: "showSectionMore",
  callouts: "showSectionCallouts",
};

/** 見出しレベル → 設定キー。 */
export const HEADING_VISIBILITY_KEYS: Readonly<Record<HeadingLevel, ToolbarVisibilityKey>> = {
  1: "showHeadingH1",
  2: "showHeadingH2",
  3: "showHeadingH3",
  4: "showHeadingH4",
  5: "showHeadingH5",
  6: "showHeadingH6",
};

/** 設定タブに並べる順序：大メニュー 4 つ → 見出し H1〜H6。 */
export const TOOLBAR_VISIBILITY_KEYS_IN_ORDER: ReadonlyArray<ToolbarVisibilityKey> = [
  ...SECTION_IDS.map((id) => SECTION_VISIBILITY_KEYS[id]),
  ...HEADING_LEVELS.map((level) => HEADING_VISIBILITY_KEYS[level]),
];

/**
 * 設定キー → 設定タブの表示名・説明文の i18n キー。
 * 例：showSectionHeadings → settingShowSectionHeadingsName / settingShowSectionHeadingsDesc
 */
export function toolbarVisibilityStringKeys(key: ToolbarVisibilityKey): { nameKey: string; descKey: string } {
  const base = `setting${key.charAt(0).toUpperCase()}${key.slice(1)}`;
  return { nameKey: `${base}Name`, descKey: `${base}Desc` };
}

/**
 * 保存データから表示フラグを取り出す。
 * 古いバージョンの保存データにはこれらのキーが無く、壊れたデータでは
 * boolean 以外が入っていることもあるため、boolean でないものは既定値（表示）に戻す。
 */
export function normalizeToolbarVisibility(raw: unknown): ToolbarVisibilitySettings {
  const source = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const result = { ...DEFAULT_TOOLBAR_VISIBILITY };
  for (const key of Object.keys(DEFAULT_TOOLBAR_VISIBILITY) as ToolbarVisibilityKey[]) {
    const value = source[key];
    if (typeof value === "boolean") {
      result[key] = value;
    }
  }
  return result;
}

/** 表示対象の見出しレベル（昇順）。 */
export function visibleHeadingLevels(visibility: ToolbarVisibilitySettings): HeadingLevel[] {
  return HEADING_LEVELS.filter((level) => visibility[HEADING_VISIBILITY_KEYS[level]]);
}

/**
 * パレットに実際に描画する大メニュー（パレット上の順序）。
 * 見出しメニューは、メニュー自体が表示でも全レベルが非表示なら中身が空になるため描画しない。
 */
export function resolveVisibleSections(visibility: ToolbarVisibilitySettings): SectionId[] {
  return SECTION_IDS.filter((id) => {
    if (!visibility[SECTION_VISIBILITY_KEYS[id]]) return false;
    if (id === "headings") return visibleHeadingLevels(visibility).length > 0;
    return true;
  });
}
