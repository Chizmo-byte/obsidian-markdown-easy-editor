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

// Obsidian 本体の app.css における `.callout[data-callout="..."]` の定義。
// note は専用の規則が無く既定色、danger は error、abstract は summary の別名。
const EXPECTED_COLOR_VARS: Record<string, string> = {
  note: "--callout-default",
  tip: "--callout-tip",
  important: "--callout-important",
  warning: "--callout-warning",
  danger: "--callout-error",
  info: "--callout-info",
  success: "--callout-success",
  question: "--callout-question",
  example: "--callout-example",
  quote: "--callout-quote",
  abstract: "--callout-summary",
  bug: "--callout-bug",
};

test("色：Obsidian 本体が各種別に割り当てている CSS 変数を参照している", () => {
  for (const callout of CALLOUT_TYPES) {
    assert.equal(
      callout.colorVar,
      EXPECTED_COLOR_VARS[callout.type],
      `${callout.type} の色変数が違う`,
    );
  }
});

test("色：フォールバックが RGB 三つ組の形式になっている", () => {
  for (const callout of CALLOUT_TYPES) {
    assert.match(
      callout.fallbackRgb,
      /^\d{1,3}, \d{1,3}, \d{1,3}$/,
      `${callout.type} のフォールバックが RGB 三つ組でない`,
    );
  }
});

test("色：アクセント色は変数とフォールバックを含む rgb() になる", () => {
  const note = CALLOUT_TYPES[0];
  assert.equal(calloutAccentColor(note), "rgb(var(--callout-default, 8, 109, 221))");
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
