import { test } from "node:test";
import assert from "node:assert/strict";

import { buildCalloutSnippet, calloutAccentColor, calloutStringKey, CALLOUT_TYPES } from "../src/callouts.ts";
import {
  addCustomCallout,
  buildCalloutPaletteEntries,
  normalizeCustomCallouts,
  removeCustomCallout,
  validateCustomCalloutType,
  CUSTOM_CALLOUT_ERROR_KEYS,
  type CustomCallout,
} from "../src/custom-callouts.ts";
import { STRINGS, t } from "../src/i18n.ts";

const BUILTIN_TYPES = [
  "note", "tip", "important", "warning", "danger", "info",
  "success", "question", "example", "quote", "abstract", "bug",
];

// --- 追加・削除 ---

test("カスタム：空の一覧に追加できる", () => {
  const result = addCustomCallout([], { type: "my-note", label: "My note" });
  assert.ok(result.ok);
  assert.deepEqual(result.callouts, [{ type: "my-note", label: "My note" }]);
});

test("カスタム：追加は末尾に並び、元の配列は変更しない", () => {
  const existing: CustomCallout[] = [{ type: "a", label: "A" }];
  const result = addCustomCallout(existing, { type: "b", label: "B" });
  assert.ok(result.ok);
  assert.deepEqual(result.callouts, [{ type: "a", label: "A" }, { type: "b", label: "B" }]);
  assert.deepEqual(existing, [{ type: "a", label: "A" }]);
});

test("カスタム：type は前後の空白を除いて小文字にそろえる", () => {
  const result = addCustomCallout([], { type: "  My-Note2 ", label: "  見出し " });
  assert.ok(result.ok);
  assert.deepEqual(result.callouts, [{ type: "my-note2", label: "見出し" }]);
});

test("カスタム：label が空なら type を表示名に使う", () => {
  const result = addCustomCallout([], { type: "memo", label: "   " });
  assert.ok(result.ok);
  assert.deepEqual(result.callouts, [{ type: "memo", label: "memo" }]);
});

test("カスタム：指定位置を削除できる", () => {
  const existing: CustomCallout[] = [
    { type: "a", label: "A" },
    { type: "b", label: "B" },
    { type: "c", label: "C" },
  ];
  assert.deepEqual(removeCustomCallout(existing, 1), [{ type: "a", label: "A" }, { type: "c", label: "C" }]);
  assert.equal(existing.length, 3, "元の配列が変更されている");
});

test("カスタム：範囲外の削除は何もしない", () => {
  const existing: CustomCallout[] = [{ type: "a", label: "A" }];
  assert.deepEqual(removeCustomCallout(existing, 5), existing);
  assert.deepEqual(removeCustomCallout(existing, -1), existing);
});

test("カスタム：削除した type は再び追加できる", () => {
  const added = addCustomCallout([], { type: "memo", label: "Memo" });
  assert.ok(added.ok);
  const removed = removeCustomCallout(added.callouts, 0);
  assert.ok(addCustomCallout(removed, { type: "memo", label: "Memo" }).ok);
});

// --- 重複の拒否 ---

test("重複：既存12種類と同じ type はすべて拒否される", () => {
  for (const type of BUILTIN_TYPES) {
    const result = addCustomCallout([], { type, label: "x" });
    assert.deepEqual(result, { ok: false, error: "duplicate-builtin" }, `${type} が拒否されない`);
  }
});

test("重複：大文字小文字が違うだけの既存 type も拒否される", () => {
  for (const type of ["NOTE", "Warning", "BuG"]) {
    assert.equal(validateCustomCalloutType(type, []), "duplicate-builtin", `${type} が拒否されない`);
  }
});

test("重複：登録済みのカスタム type と同じものは拒否される", () => {
  const existing: CustomCallout[] = [{ type: "memo", label: "Memo" }];
  assert.deepEqual(addCustomCallout(existing, { type: "memo", label: "別名" }), { ok: false, error: "duplicate-custom" });
  assert.deepEqual(addCustomCallout(existing, { type: "MEMO", label: "別名" }), { ok: false, error: "duplicate-custom" });
});

// --- 不正な文字の拒否 ---

test("文字種：英数字とハイフンだけの type は受け付ける", () => {
  for (const type of ["memo", "my-note", "abc123", "A-1", "-", "todo-2026"]) {
    assert.equal(validateCustomCalloutType(type, []), null, `${type} が拒否された`);
  }
});

test("文字種：英数字・ハイフン以外を含む type は拒否される", () => {
  for (const type of [
    "my note", "my_note", "note!", "a.b", "a/b", "[x]", "メモ", "é", "a]b", "tab\there", "",
  ]) {
    assert.deepEqual(
      addCustomCallout([], { type, label: "x" }),
      { ok: false, error: "invalid-type" },
      `${JSON.stringify(type)} が拒否されない`,
    );
  }
});

test("文字種：空白だけの type は拒否される", () => {
  assert.deepEqual(addCustomCallout([], { type: "   ", label: "x" }), { ok: false, error: "invalid-type" });
});

test("エラー：すべてのエラー種別に日英の通知文言がある", () => {
  for (const key of Object.values(CUSTOM_CALLOUT_ERROR_KEYS)) {
    for (const locale of ["en", "ja"] as const) {
      assert.ok(key in STRINGS[locale], `${locale} に ${key} が無い`);
    }
  }
});

// --- 保存データの読み込み ---

test("読み込み：未保存・不正な値は空配列になる", () => {
  for (const raw of [undefined, null, "memo", 1, {}]) {
    assert.deepEqual(normalizeCustomCallouts(raw), []);
  }
});

test("読み込み：正しい要素は残し、壊れた要素・不正な type・重複は捨てる", () => {
  const raw = [
    { type: "memo", label: "Memo" },
    null,
    "memo",
    { label: "no type" },
    { type: "bad type", label: "x" },
    { type: "note", label: "builtin" },
    { type: "memo", label: "dup" },
    { type: "todo" },
  ];
  assert.deepEqual(normalizeCustomCallouts(raw), [
    { type: "memo", label: "Memo" },
    { type: "todo", label: "todo" },
  ]);
});

// --- ツールバーへの表示 ---

test("ツールバー：カスタムが無ければ既存12種類だけが並ぶ", () => {
  const entries = buildCalloutPaletteEntries("en", true, []);
  assert.deepEqual(entries.map((e) => e.calloutType), BUILTIN_TYPES);
});

test("ツールバー：既存12種類のボタン内容は従来から変わらない", () => {
  for (const locale of ["en", "ja"] as const) {
    for (const isDark of [true, false]) {
      const entries = buildCalloutPaletteEntries(locale, isDark, [{ type: "memo", label: "Memo" }]);
      CALLOUT_TYPES.forEach((callout, i) => {
        assert.deepEqual(entries[i], {
          id: `callout-${callout.type}`,
          calloutType: callout.type,
          accentColor: calloutAccentColor(callout, isDark),
          titlePlaceholder: t("calloutTitlePlaceholder", locale),
          label: t(calloutStringKey("label", callout.type), locale),
          shortcut: `> [!${callout.type}]`,
          tip: t(calloutStringKey("tip", callout.type), locale),
        });
      });
    }
  }
});

test("ツールバー：カスタムは既存12種類の後ろに登録順で並ぶ", () => {
  const customs: CustomCallout[] = [
    { type: "memo", label: "メモ" },
    { type: "todo-list", label: "やること" },
  ];
  const entries = buildCalloutPaletteEntries("ja", false, customs);
  assert.equal(entries.length, 14);
  assert.deepEqual(entries.slice(0, 12).map((e) => e.calloutType), BUILTIN_TYPES);

  const [memo, todo] = entries.slice(12);
  assert.equal(memo.calloutType, "memo");
  assert.equal(memo.label, "メモ");
  assert.equal(memo.shortcut, "> [!memo]");
  assert.equal(todo.calloutType, "todo-list");
  assert.equal(todo.label, "やること");
  assert.equal(todo.shortcut, "> [!todo-list]");
});

test("ツールバー：カスタムのボタン id は既存と衝突しない", () => {
  const entries = buildCalloutPaletteEntries("en", true, [{ type: "memo", label: "Memo" }]);
  const ids = entries.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("ツールバー：カスタムを Apply すると > [!type] label の形で挿入される", () => {
  const [custom] = buildCalloutPaletteEntries("en", true, [{ type: "my-note", label: "My note" }]).slice(12);
  // main.ts の applyToolbarAction と同じ組み立て方
  const snippet = buildCalloutSnippet(custom.calloutType, custom.titlePlaceholder, t("calloutBodyPlaceholder", "en"));
  assert.equal(snippet, "> [!my-note] My note\n> Body text here");
});

test("ツールバー：カスタムにも既存と同じ形式の色と説明文が付く", () => {
  for (const locale of ["en", "ja"] as const) {
    for (const isDark of [true, false]) {
      const [custom] = buildCalloutPaletteEntries(locale, isDark, [{ type: "memo", label: "Memo" }]).slice(12);
      assert.match(custom.accentColor, /^rgba\(\d{1,3}, \d{1,3}, \d{1,3}, [\d.]+\)$/);
      assert.equal(custom.tip, t("tipCalloutCustom", locale));
    }
  }
});
