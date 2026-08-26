import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildCalloutSnippet,
  calloutAccentColor,
  calloutStringKey,
  CALLOUT_TYPES,
} from "../src/callouts.ts";
import { STRINGS, t } from "../src/i18n.ts";

/** 仕様で決めた12種類とその表示順。 */
const EXPECTED_ORDER = [
  "note", "tip", "important", "warning", "danger", "info",
  "success", "question", "example", "quote", "abstract", "bug",
];

test("種類：12種類が仕様どおりの順序で並んでいる", () => {
  assert.deepEqual(CALLOUT_TYPES.map((c) => c.type), EXPECTED_ORDER);
});

test("種類：重複が無い", () => {
  const types = CALLOUT_TYPES.map((c) => c.type);
  assert.equal(new Set(types).size, types.length);
});

// Obsidian 本体 app.css の .theme-dark / .theme-light にある --color-*-rgb の実測値。
// note は既定色（blue）、danger は error（red）、abstract は summary（cyan）の別名。
const EXPECTED_RGB: Record<string, { dark: string; light: string }> = {
  note: { dark: "2, 122, 255", light: "8, 109, 221" },
  tip: { dark: "83, 223, 221", light: "0, 191, 188" },
  important: { dark: "83, 223, 221", light: "0, 191, 188" },
  warning: { dark: "233, 151, 63", light: "236, 117, 0" },
  danger: { dark: "251, 70, 76", light: "233, 49, 71" },
  info: { dark: "2, 122, 255", light: "8, 109, 221" },
  success: { dark: "68, 207, 110", light: "8, 185, 78" },
  question: { dark: "233, 151, 63", light: "236, 117, 0" },
  example: { dark: "168, 130, 255", light: "120, 82, 238" },
  quote: { dark: "158, 158, 158", light: "158, 158, 158" },
  abstract: { dark: "83, 223, 221", light: "0, 191, 188" },
  bug: { dark: "251, 70, 76", light: "233, 49, 71" },
};

test("色：Obsidian 本体の配色と一致している（ライト・ダーク両方）", () => {
  for (const callout of CALLOUT_TYPES) {
    assert.equal(callout.darkRgb, EXPECTED_RGB[callout.type].dark, `${callout.type} のダーク色`);
    assert.equal(callout.lightRgb, EXPECTED_RGB[callout.type].light, `${callout.type} のライト色`);
  }
});

test("色：定義値がすべて RGB 三つ組の形式になっている", () => {
  for (const callout of CALLOUT_TYPES) {
    for (const key of ["darkRgb", "lightRgb"] as const) {
      assert.match(
        callout[key],
        /^\d{1,3}, \d{1,3}, \d{1,3}$/,
        `${callout.type} の ${key} が RGB 三つ組でない`,
      );
    }
  }
});

test("色：アクセント色はテーマに応じた解決済みの rgb() になる", () => {
  const note = CALLOUT_TYPES[0];
  assert.equal(calloutAccentColor(note, true), "rgb(2, 122, 255)");
  assert.equal(calloutAccentColor(note, false), "rgb(8, 109, 221)");
});

test("色：アクセント色に var() を含めない（色が消える不具合の再発防止）", () => {
  // `rgb(var(--callout-x, ...))` は、テーマが変数を RGB 三つ組以外
  // （16進数・rgb()・色名・空）で再定義していると置換結果が不正になり、
  // CSS の規定で border の宣言ごと破棄される。var() のフォールバックは
  // 変数が「定義済み」であるため使われず、ボーダーが丸ごと消える。
  // 解決済みの rgb() だけを渡すことでこの経路を断つ。
  for (const callout of CALLOUT_TYPES) {
    for (const isDark of [true, false]) {
      const color = calloutAccentColor(callout, isDark);
      assert.doesNotMatch(color, /var\(/, `${callout.type} に var() が含まれる`);
      assert.match(
        color,
        /^rgb\(\d{1,3}, \d{1,3}, \d{1,3}\)$/,
        `${callout.type} が解決済みの rgb() でない`,
      );
    }
  }
});

test("色：ライトとダークで実際に値が変わる種別がある", () => {
  const differing = CALLOUT_TYPES.filter((c) => c.darkRgb !== c.lightRgb);
  assert.ok(differing.length >= 11, "ほとんどの種別はテーマで色が変わるはず");
});

test("文言キー：種別名から label/tip のキーを組み立てる", () => {
  assert.equal(calloutStringKey("label", "note"), "labelCalloutNote");
  assert.equal(calloutStringKey("tip", "abstract"), "tipCalloutAbstract");
});

test("文言：12種類すべてに日英の label と tip がある", () => {
  for (const locale of ["en", "ja"] as const) {
    for (const callout of CALLOUT_TYPES) {
      for (const prefix of ["label", "tip"] as const) {
        const key = calloutStringKey(prefix, callout.type);
        assert.ok(
          key in STRINGS[locale],
          `${locale} に ${key} が無い`,
        );
        assert.notEqual(t(key, locale).trim(), "", `${locale}.${key} が空`);
      }
    }
  }
});

test("文言：日本語ラベルが仕様どおり", () => {
  const expected: Record<string, string> = {
    note: "ノート", tip: "ヒント", important: "重要", warning: "警告",
    danger: "危険", info: "参考情報", success: "成功", question: "疑問",
    example: "例", quote: "引用ボックス", abstract: "要約", bug: "不具合メモ",
  };
  for (const callout of CALLOUT_TYPES) {
    assert.equal(t(calloutStringKey("label", callout.type), "ja"), expected[callout.type]);
  }
});

test("文言：英語ラベルが仕様どおり", () => {
  const expected: Record<string, string> = {
    note: "Note", tip: "Tip", important: "Important", warning: "Warning",
    danger: "Danger", info: "Info", success: "Success", question: "Question",
    example: "Example", quote: "Quote block", abstract: "Abstract", bug: "Bug",
  };
  for (const callout of CALLOUT_TYPES) {
    assert.equal(t(calloutStringKey("label", callout.type), "en"), expected[callout.type]);
  }
});

test("文言：コールアウトのラベルが「基本」「その他」のボタンと重複しない", () => {
  // 同じパネル内に同名のボタンが並ぶとどちらを押せばよいか分からなくなる。
  // 特に quote は「基本」の引用（> ）と紛らわしいため区別している。
  const otherButtonKeys = [
    "labelBold", "labelItalic", "labelList", "labelNumber", "labelQuote", "labelLink",
    "labelInlineCode", "labelCodeBlock", "labelTable", "labelCheck",
    "labelStrikethrough", "labelDivider",
  ];

  for (const locale of ["en", "ja"] as const) {
    const otherLabels = otherButtonKeys.map((key) => t(key, locale));
    for (const callout of CALLOUT_TYPES) {
      const label = t(calloutStringKey("label", callout.type), locale);
      assert.equal(
        otherLabels.includes(label),
        false,
        `${locale}: コールアウト「${label}」が他セクションのボタンと同名`,
      );
    }
  }
});

// --- 挿入されるスニペット ---

test("挿入：選択なしならタイトルと本文のプレースホルダーが入る", () => {
  assert.equal(
    buildCalloutSnippet("note", "タイトル", "本文をここに入力"),
    "> [!note] タイトル\n> 本文をここに入力",
  );
});

test("挿入：英語のプレースホルダーでも同じ形になる", () => {
  assert.equal(
    buildCalloutSnippet("warning", "Title", "Body text here"),
    "> [!warning] Title\n> Body text here",
  );
});

test("挿入：12種類すべてが正しい種別名で組み立てられる", () => {
  for (const callout of CALLOUT_TYPES) {
    const snippet = buildCalloutSnippet(callout.type, "タイトル", "本文をここに入力");
    assert.equal(snippet.split("\n")[0], `> [!${callout.type}] タイトル`);
    assert.equal(snippet.split("\n").length, 2);
  }
});

test("挿入：選択範囲があれば本文として畳み込む", () => {
  assert.equal(
    buildCalloutSnippet("tip", "タイトル", "本文をここに入力", "選択したテキスト"),
    "> [!tip] タイトル\n> 選択したテキスト",
  );
});

test("挿入：複数行の選択範囲は各行を引用にする", () => {
  assert.equal(
    buildCalloutSnippet("info", "タイトル", "本文をここに入力", "1行目\n2行目\n3行目"),
    "> [!info] タイトル\n> 1行目\n> 2行目\n> 3行目",
  );
});

test("挿入：空文字の選択はプレースホルダー扱いにする", () => {
  assert.equal(
    buildCalloutSnippet("note", "タイトル", "本文をここに入力", ""),
    "> [!note] タイトル\n> 本文をここに入力",
  );
});

test("挿入：タイトルは常に1行目に現れ、位置を特定できる", () => {
  // main.ts は挿入後に indexOf でタイトルを探して選択状態にするため、
  // タイトルが1行目に必ず含まれることが前提になる
  for (const callout of CALLOUT_TYPES) {
    const snippet = buildCalloutSnippet(callout.type, "タイトル", "本文", "本文の選択");
    assert.ok(snippet.split("\n")[0].includes("タイトル"));
  }
});
