import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveLocale, STRINGS, t } from "../src/i18n.ts";

const enKeys = Object.keys(STRINGS.en).sort();
const jaKeys = Object.keys(STRINGS.ja).sort();

// resolveLocale は Obsidian の getLanguage() が返す ISO コードを受け取る。
// 一覧は https://github.com/obsidianmd/obsidian-translations を参照。
test("言語判定：日本語のコードは ja になる", () => {
  assert.equal(resolveLocale("ja"), "ja");
  assert.equal(resolveLocale("ja-JP"), "ja");
});

test("言語判定：日本語以外はすべて en にフォールバックする", () => {
  for (const code of ["en", "en-GB", "zh", "zh-TW", "ko", "fr", "de", "es", "ru", "pt-BR"]) {
    assert.equal(resolveLocale(code), "en", `${code} が en にならない`);
  }
});

test("言語判定：空文字でも en を返す", () => {
  assert.equal(resolveLocale(""), "en");
});

test("言語判定：ja で始まらない j 系のコードは巻き込まない", () => {
  // jv（ジャワ語）は ja で始まらないため日本語扱いにならない。
  // なお前方一致判定のため "ja" で始まるコードは一律 ja になるが、
  // Obsidian の対応言語で ja から始まるのは日本語のみなので実害はない。
  assert.equal(resolveLocale("jv"), "en");
  assert.equal(resolveLocale("jv-ID"), "en");
});

test("辞書：en と ja のキー集合が完全に一致する", () => {
  const missingInJa = enKeys.filter((k) => !jaKeys.includes(k));
  const missingInEn = jaKeys.filter((k) => !enKeys.includes(k));
  assert.deepEqual(missingInJa, [], "ja に未翻訳のキーがある");
  assert.deepEqual(missingInEn, [], "en に存在しないキーが ja にある");
});

test("辞書：空文字の文言が無い", () => {
  for (const locale of ["en", "ja"] as const) {
    for (const key of Object.keys(STRINGS[locale])) {
      assert.notEqual(STRINGS[locale][key].trim(), "", `${locale}.${key} が空`);
    }
  }
});

test("辞書：英語の文言に日本語が混入していない", () => {
  const japanese = /[ぁ-んァ-ヶ一-龥ー]/;
  for (const key of enKeys) {
    assert.equal(
      japanese.test(STRINGS.en[key]),
      false,
      `en.${key} に日本語が残っている: ${STRINGS.en[key]}`,
    );
  }
});

test("辞書：日本語ロケールの通知が既存の文言から変わっていない", () => {
  // 既存ユーザーの体験を変えないよう、日本語側は移行前の文字列を維持する
  assert.equal(t("noticeNoMarkdownNote", "ja"), "Markdownノートを開いてから使用してください。");
  assert.equal(t("noticeSelectText", "ja"), "最適化するテキストを選択してください。");
  assert.equal(t("noticeOptimized", "ja"), "Markdownを最適化しました。");
  assert.equal(t("noticeOptimizeError", "ja"), "最適化中にエラーが発生しました。");
  assert.equal(t("noticeActionError", "ja"), "記法の適用中にエラーが発生しました。");
  assert.equal(t("noticeToolbarError", "ja"), "ツールバーの表示中にエラーが発生しました。");
  assert.equal(t("noticeSidebarUnavailable", "ja"), "右サイドバーを開けませんでした。");
  assert.equal(t("noticeMultilineUnsupported", "ja"), "複数行選択は未対応です。1行ずつ適用してください。");
});

test("t()：未知のキーは英語 → キー名の順にフォールバックする", () => {
  assert.equal(t("labelBold", "ja"), "太字");
  assert.equal(t("labelBold", "en"), "Bold");
  assert.equal(t("thisKeyDoesNotExist", "ja"), "thisKeyDoesNotExist");
});

test("辞書：テンプレートのプレースホルダーが両言語で定義されている", () => {
  // main.ts はこれらの文字列を indexOf で探して選択範囲を決めるため、
  // 空や未定義だとカーソル位置がずれる
  for (const locale of ["en", "ja"] as const) {
    for (const key of ["placeholderCode", "placeholderTodo", "linkTextDefault"]) {
      assert.ok(t(key, locale).length > 0, `${locale}.${key} が空`);
    }
  }
});

test("辞書：表テンプレートが Markdown の表として成立している", () => {
  for (const locale of ["en", "ja"] as const) {
    const rows = t("snippetTable", locale).split("\n");
    assert.equal(rows.length, 3, `${locale} の表が3行でない`);
    assert.match(rows[1], /^\|\s*-{3,}\s*\|/, `${locale} の表に区切り行が無い`);
  }
});
