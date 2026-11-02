import { test } from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_PALETTE_OPEN_STATE, normalizePaletteOpenState } from "../src/palette-open-state.ts";
import { SECTION_IDS } from "../src/toolbar-visibility.ts";

test("既定値は従来の開閉状態（見出し・基本は開、その他・コールアウトは閉）＋My menuは開", () => {
  assert.deepEqual(DEFAULT_PALETTE_OPEN_STATE, {
    headings: true,
    basic: true,
    more: false,
    callouts: false,
    mymenu: true,
  });
});

test("既定値のキーは大メニューの識別子と一致する", () => {
  assert.deepEqual(Object.keys(DEFAULT_PALETTE_OPEN_STATE).sort(), [...SECTION_IDS].sort());
});

test("保存データが無い・壊れている場合は既定値", () => {
  for (const raw of [undefined, null, "x", 3, [], { headings: "yes", basic: 1 }]) {
    assert.deepEqual(normalizePaletteOpenState(raw), DEFAULT_PALETTE_OPEN_STATE);
  }
});

test("保存された値は反映され、欠けた項目だけ既定値になる", () => {
  assert.deepEqual(normalizePaletteOpenState({ headings: false, more: true }), {
    headings: false,
    basic: true,
    more: true,
    callouts: false,
    mymenu: true,
  });
});

test("毎回新しいオブジェクトを返す（既定値を共有しない）", () => {
  const a = normalizePaletteOpenState(undefined);
  a.more = true;
  assert.equal(DEFAULT_PALETTE_OPEN_STATE.more, false);
  assert.notEqual(normalizePaletteOpenState(undefined), a);
});
