import { test } from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_SECTION_ORDER, moveSection, normalizeSectionOrder } from "../src/section-order.ts";
import { SECTION_IDS } from "../src/toolbar-visibility.ts";

test("既定の並び：従来の4メニューの順序は変わらず、My menuは一番下", () => {
  assert.deepEqual([...DEFAULT_SECTION_ORDER], ["headings", "basic", "more", "callouts", "mymenu"]);
  assert.deepEqual([...DEFAULT_SECTION_ORDER], [...SECTION_IDS]);
});

test("読み込み：保存データが無い・壊れているときは既定の並び", () => {
  for (const raw of [undefined, null, "x", 3, {}, []]) {
    assert.deepEqual(normalizeSectionOrder(raw), [...DEFAULT_SECTION_ORDER]);
  }
});

test("読み込み：保存された順序を保つ", () => {
  assert.deepEqual(normalizeSectionOrder(["mymenu", "callouts", "more", "basic", "headings"]), [
    "mymenu",
    "callouts",
    "more",
    "basic",
    "headings",
  ]);
});

test("読み込み：未知の id・重複は捨て、足りないメニューは末尾に足す（0.6.0から更新しても壊れない）", () => {
  assert.deepEqual(normalizeSectionOrder(["callouts", "foo", "callouts", 5, "headings"]), [
    "callouts",
    "headings",
    "basic",
    "more",
    "mymenu",
  ]);
});

test("移動：上へ・下へ入れ替わり、元の配列は変わらない", () => {
  const order = [...DEFAULT_SECTION_ORDER];
  assert.deepEqual(moveSection(order, 1, -1), ["basic", "headings", "more", "callouts", "mymenu"]);
  assert.deepEqual(moveSection(order, 1, 1), ["headings", "more", "basic", "callouts", "mymenu"]);
  assert.deepEqual(order, [...DEFAULT_SECTION_ORDER]);
});

test("移動：端では動かない・範囲外の index は変えない", () => {
  const order = [...DEFAULT_SECTION_ORDER];
  assert.deepEqual(moveSection(order, 0, -1), order);
  assert.deepEqual(moveSection(order, order.length - 1, 1), order);
  assert.deepEqual(moveSection(order, 99, -1), order);
  assert.deepEqual(moveSection(order, -1, 1), order);
});
