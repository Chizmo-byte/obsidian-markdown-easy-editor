/**
 * ユーザーが登録する「カスタムコールアウト」の検証・追加・削除と、
 * パレットに並べるコールアウトボタン（既存12種類＋カスタム）の組み立て。
 *
 * このモジュールは obsidian パッケージに依存させないこと（i18n.ts と同じ理由）。
 * Node 上のテストから直接読み込むため、import には拡張子 .ts を付けている。
 */

import { calloutAccentColor, calloutStringKey, CALLOUT_TYPES, type CalloutType } from "./callouts.ts";
import { t, type Locale } from "./i18n.ts";

/** 設定に保存するカスタムコールアウト 1 件分。 */
export interface CustomCallout {
  /** `> [!xxx]` に入る種別名。英数字とハイフンのみ。 */
  type: string;
  /** パレットの表示名。挿入時のタイトルにもそのまま使う。 */
  label: string;
}

/** type に使える文字。英数字とハイフンのみ。 */
export const CUSTOM_CALLOUT_TYPE_PATTERN = /^[A-Za-z0-9-]+$/;

export type CustomCalloutError = "invalid-type" | "duplicate-builtin" | "duplicate-custom";

/** エラー種別 → 通知文言の i18n キー。 */
export const CUSTOM_CALLOUT_ERROR_KEYS: Readonly<Record<CustomCalloutError, string>> = {
  "invalid-type": "noticeCustomCalloutInvalidType",
  "duplicate-builtin": "noticeCustomCalloutDuplicateBuiltin",
  "duplicate-custom": "noticeCustomCalloutDuplicateCustom",
};

/**
 * カスタムコールアウトのボタンに引く色。
 * 色のカスタマイズは今回のスコープ外。Obsidian は未知の種別を既定色
 * （--callout-default）で描画するため、それと同じ note の配色を使う。
 */
const CUSTOM_CALLOUT_COLORS: CalloutType = {
  type: "custom",
  darkRgb: CALLOUT_TYPES[0].darkRgb,
  lightRgb: CALLOUT_TYPES[0].lightRgb,
};

/**
 * 追加しようとしている type を検証する。問題が無ければ null。
 * Obsidian はコールアウトの種別を大文字小文字を区別せずに扱うため、重複判定も同様にする。
 */
export function validateCustomCalloutType(
  type: string,
  existing: ReadonlyArray<CustomCallout>,
): CustomCalloutError | null {
  if (!CUSTOM_CALLOUT_TYPE_PATTERN.test(type)) return "invalid-type";

  const lower = type.toLowerCase();
  if (CALLOUT_TYPES.some((c) => c.type === lower)) return "duplicate-builtin";
  if (existing.some((c) => c.type.toLowerCase() === lower)) return "duplicate-custom";
  return null;
}

export type AddCustomCalloutResult =
  | { ok: true; callouts: CustomCallout[] }
  | { ok: false; error: CustomCalloutError };

/**
 * カスタムコールアウトを末尾に追加した新しい配列を返す（引数の配列は変更しない）。
 * type は前後の空白を除いて小文字にそろえ、label が空なら type を表示名に使う。
 */
export function addCustomCallout(
  existing: ReadonlyArray<CustomCallout>,
  input: { type: string; label: string },
): AddCustomCalloutResult {
  const type = input.type.trim().toLowerCase();
  const error = validateCustomCalloutType(type, existing);
  if (error) return { ok: false, error };

  const label = input.label.trim() || type;
  return { ok: true, callouts: [...existing, { type, label }] };
}

/** index 番目を取り除いた新しい配列を返す。範囲外なら内容はそのまま。 */
export function removeCustomCallout(
  existing: ReadonlyArray<CustomCallout>,
  index: number,
): CustomCallout[] {
  return existing.filter((_, i) => i !== index);
}

/**
 * loadData() から読んだ値を、正しい形のカスタムコールアウト配列にそろえる。
 * 手で data.json を編集された場合などに備え、壊れた要素は捨てる。
 */
export function normalizeCustomCallouts(raw: unknown): CustomCallout[] {
  if (!Array.isArray(raw)) return [];

  let result: CustomCallout[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const { type, label } = item as { type?: unknown; label?: unknown };
    if (typeof type !== "string") continue;
    const added = addCustomCallout(result, { type, label: typeof label === "string" ? label : "" });
    if (added.ok) result = added.callouts;
  }
  return result;
}

/** パレットのコールアウトセクションに並べるボタン 1 つ分。 */
export interface CalloutPaletteEntry {
  id: string;
  calloutType: string;
  accentColor: string;
  /** 挿入時のタイトル。挿入後に選択状態にして上書き入力できるようにする。 */
  titlePlaceholder: string;
  label: string;
  shortcut: string;
  tip: string;
}

/**
 * コールアウトセクションのボタン一覧。既存12種類を従来どおりの順で並べ、
 * その末尾に登録済みのカスタムコールアウトを登録順に続ける。
 *
 * カスタムは label をそのままタイトルとして挿入する（`> [!type] label`）。
 */
export function buildCalloutPaletteEntries(
  locale: Locale,
  isDarkTheme: boolean,
  customCallouts: ReadonlyArray<CustomCallout>,
): CalloutPaletteEntry[] {
  const titlePlaceholder = t("calloutTitlePlaceholder", locale);

  const builtin = CALLOUT_TYPES.map((callout): CalloutPaletteEntry => ({
    id: `callout-${callout.type}`,
    calloutType: callout.type,
    accentColor: calloutAccentColor(callout, isDarkTheme),
    titlePlaceholder,
    label: t(calloutStringKey("label", callout.type), locale),
    shortcut: `> [!${callout.type}]`,
    tip: t(calloutStringKey("tip", callout.type), locale),
  }));

  const custom = customCallouts.map((callout): CalloutPaletteEntry => ({
    id: `callout-custom-${callout.type}`,
    calloutType: callout.type,
    accentColor: calloutAccentColor(CUSTOM_CALLOUT_COLORS, isDarkTheme),
    titlePlaceholder: callout.label,
    label: callout.label,
    shortcut: `> [!${callout.type}]`,
    tip: t("tipCalloutCustom", locale),
  }));

  return [...builtin, ...custom];
}
