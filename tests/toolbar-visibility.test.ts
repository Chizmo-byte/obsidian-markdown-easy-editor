import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_TOOLBAR_VISIBILITY,
  HEADING_LEVELS,
  HEADING_VISIBILITY_KEYS,
  SECTION_IDS,
  SECTION_VISIBILITY_KEYS,
  TOOLBAR_VISIBILITY_KEYS_IN_ORDER,
  normalizeToolbarVisibility,
  resolveVisibleSections,
  toolbarVisibilityStringKeys,
  visibleHeadingLevels,
  type ToolbarVisibilitySettings,
} from "../src/toolbar-visibility.ts";
import { STRINGS, t } from "../src/i18n.ts";

/** 既定値から、指定のキーだけ変えた設定を作る。 */
function withVisibility(overrides: Partial<ToolbarVisibilitySettings>): ToolbarVisibilitySettings {
  return { ...DEFAULT_TOOLBAR_VISIBILITY, ...overrides };
}

// --- 既定値 ---

test("既定値：すべて表示（既存ユーザーのパレットは変わらない）", () => {
  for (const [key, value] of Object.entries(DEFAULT_TOOLBAR_VISIBILITY)) {
    assert.equal(value, true, `${key} の既定値が true でない`);
  }
});

test("既定値：大メニュー5つ＋見出し6レベル＝11項目が定義されている", () => {
  assert.equal(Object.keys(DEFAULT_TOOLBAR_VISIBILITY).length, 11);
  assert.equal(TOOLBAR_VISIBILITY_KEYS_IN_ORDER.length, 11);
  assert.equal(new Set(TOOLBAR_VISIBILITY_KEYS_IN_ORDER).size, 11, "キーが重複している");
});

test("既定値：すべてのキーが設定キーに対応している", () => {
  for (const id of SECTION_IDS) {
    assert.ok(SECTION_VISIBILITY_KEYS[id] in DEFAULT_TOOLBAR_VISIBILITY, `section ${id}`);
  }
  for (const level of HEADING_LEVELS) {
    assert.ok(HEADING_VISIBILITY_KEYS[level] in DEFAULT_TOOLBAR_VISIBILITY, `H${level}`);
  }
});

test("既定値：設定タブの並び順は大メニュー → H1〜H6", () => {
  assert.deepEqual(TOOLBAR_VISIBILITY_KEYS_IN_ORDER, [
    "showSectionHeadings",
    "showSectionBasic",
    "showSectionMore",
    "showSectionCallouts",
    "showSectionMyMenu",
    "showHeadingH1",
    "showHeadingH2",
    "showHeadingH3",
    "showHeadingH4",
    "showHeadingH5",
    "showHeadingH6",
  ]);
});

// --- 大メニュー ---

test("大メニュー：既定では4つすべてがパレット順に並ぶ", () => {
  assert.deepEqual(resolveVisibleSections(DEFAULT_TOOLBAR_VISIBILITY), ["headings", "basic", "more", "callouts"]);
});

test("大メニュー：非表示にしたものだけが消え、残りの順序は保たれる", () => {
  const visibility = withVisibility({ showSectionBasic: false, showSectionCallouts: false });
  assert.deepEqual(resolveVisibleSections(visibility), ["headings", "more"]);
});

test("大メニュー：4つすべて非表示なら空になる", () => {
  const visibility = withVisibility({
    showSectionHeadings: false,
    showSectionBasic: false,
    showSectionMore: false,
    showSectionCallouts: false,
  });
  assert.deepEqual(resolveVisibleSections(visibility), []);
});

test("大メニュー：見出しメニューが非表示なら、見出しレベルが表示設定でも描画しない", () => {
  const visibility = withVisibility({ showSectionHeadings: false });
  assert.ok(!resolveVisibleSections(visibility).includes("headings"));
});

test("大メニュー：見出しの全レベルを非表示にすると、空の見出しメニューは描画しない", () => {
  const visibility = withVisibility({
    showHeadingH1: false,
    showHeadingH2: false,
    showHeadingH3: false,
    showHeadingH4: false,
    showHeadingH5: false,
    showHeadingH6: false,
  });
  assert.deepEqual(resolveVisibleSections(visibility), ["basic", "more", "callouts"]);
});

// --- 見出しレベル ---

test("見出し：既定では H1〜H6 がすべて表示される", () => {
  assert.deepEqual(visibleHeadingLevels(DEFAULT_TOOLBAR_VISIBILITY), [1, 2, 3, 4, 5, 6]);
});

test("見出し：非表示にしたレベルだけが消え、昇順は保たれる", () => {
  const visibility = withVisibility({ showHeadingH1: false, showHeadingH5: false, showHeadingH6: false });
  assert.deepEqual(visibleHeadingLevels(visibility), [2, 3, 4]);
});

test("見出し：飛び飛びのレベルでも昇順で返る", () => {
  const visibility = withVisibility({ showHeadingH2: false, showHeadingH4: false });
  assert.deepEqual(visibleHeadingLevels(visibility), [1, 3, 5, 6]);
});

test("見出し：見出しメニュー自体が非表示でも、レベルの設定は保持される", () => {
  // 一時的にメニューごと隠して、あとで戻したときにレベルの選択が消えないことを保証する
  const visibility = withVisibility({ showSectionHeadings: false, showHeadingH3: false });
  assert.deepEqual(visibleHeadingLevels(visibility), [1, 2, 4, 5, 6]);
});

// --- 読み込み・正規化 ---

test("読み込み：保存データが無ければ既定値（すべて表示）になる", () => {
  assert.deepEqual(normalizeToolbarVisibility(undefined), DEFAULT_TOOLBAR_VISIBILITY);
  assert.deepEqual(normalizeToolbarVisibility(null), DEFAULT_TOOLBAR_VISIBILITY);
});

test("読み込み：旧バージョンの保存データ（表示設定のキーが無い）でもすべて表示になる", () => {
  const legacy = {
    optimizeRemoveWikilinks: false,
    optimizeRemoveBlockRefs: true,
    customCallouts: [{ type: "todo", label: "TODO" }],
  };
  assert.deepEqual(normalizeToolbarVisibility(legacy), DEFAULT_TOOLBAR_VISIBILITY);
});

test("読み込み：保存された false はそのまま保たれる", () => {
  const result = normalizeToolbarVisibility({ showSectionMore: false, showHeadingH1: false });
  assert.equal(result.showSectionMore, false);
  assert.equal(result.showHeadingH1, false);
  assert.equal(result.showSectionBasic, true);
});

test("読み込み：boolean 以外の壊れた値は既定値（表示）に戻る", () => {
  const result = normalizeToolbarVisibility({
    showSectionHeadings: "false",
    showSectionBasic: 0,
    showSectionMore: null,
    showSectionCallouts: {},
    showHeadingH1: [],
  });
  assert.deepEqual(result, DEFAULT_TOOLBAR_VISIBILITY);
});

test("読み込み：配列や文字列など、オブジェクトでない保存データでも既定値になる", () => {
  assert.deepEqual(normalizeToolbarVisibility("broken"), DEFAULT_TOOLBAR_VISIBILITY);
  assert.deepEqual(normalizeToolbarVisibility(42), DEFAULT_TOOLBAR_VISIBILITY);
});

test("読み込み：既定値オブジェクトそのものを返さない（共有して書き換えないため）", () => {
  const result = normalizeToolbarVisibility(undefined);
  assert.notEqual(result, DEFAULT_TOOLBAR_VISIBILITY);
  result.showSectionBasic = false;
  assert.equal(DEFAULT_TOOLBAR_VISIBILITY.showSectionBasic, true);
});

// --- 文言 ---

test("文言キー：設定キーから name / desc のキーを組み立てる", () => {
  assert.deepEqual(toolbarVisibilityStringKeys("showSectionHeadings"), {
    nameKey: "settingShowSectionHeadingsName",
    descKey: "settingShowSectionHeadingsDesc",
  });
  assert.deepEqual(toolbarVisibilityStringKeys("showHeadingH3"), {
    nameKey: "settingShowHeadingH3Name",
    descKey: "settingShowHeadingH3Desc",
  });
});

test("文言：10項目すべてに日英の name と desc がある", () => {
  for (const key of TOOLBAR_VISIBILITY_KEYS_IN_ORDER) {
    const { nameKey, descKey } = toolbarVisibilityStringKeys(key);
    for (const locale of ["en", "ja"] as const) {
      assert.ok(STRINGS[locale][nameKey]?.length > 0, `${locale}.${nameKey} が未定義または空`);
      assert.ok(STRINGS[locale][descKey]?.length > 0, `${locale}.${descKey} が未定義または空`);
    }
  }
});

test("文言：設定タブの小見出しと、全メニュー非表示時の案内に日英の文言がある", () => {
  for (const key of ["settingOptimizeHeading", "settingPaletteDisplayHeading", "settingPaletteDisplayDesc", "paletteAllHidden"]) {
    for (const locale of ["en", "ja"] as const) {
      assert.ok(STRINGS[locale][key]?.length > 0, `${locale}.${key} が未定義または空`);
    }
  }
});

test("文言：大メニューの表示名は、パレット上のセクション名と一致している", () => {
  // 設定画面で「見出し」を探したとき、パレットの「見出し」と同じ名前で見つかるようにする
  assert.ok(t("settingShowSectionHeadingsName", "ja").includes(t("sectionHeadings", "ja")));
  assert.ok(t("settingShowSectionBasicName", "ja").includes(t("sectionBasic", "ja")));
  assert.ok(t("settingShowSectionMoreName", "ja").includes(t("sectionMore", "ja")));
  assert.ok(t("settingShowSectionCalloutsName", "ja").includes(t("sectionCallouts", "ja")));
  assert.ok(t("settingShowSectionHeadingsName", "en").includes(t("sectionHeadings", "en")));
  assert.ok(t("settingShowSectionBasicName", "en").includes(t("sectionBasic", "en")));
  assert.ok(t("settingShowSectionMoreName", "en").includes(t("sectionMore", "en")));
  assert.ok(t("settingShowSectionCalloutsName", "en").includes(t("sectionCallouts", "en")));
});

// --- My menu（0.7.0）---

test("My menu：スニペットが無いうちは出さない（既存の見た目を変えない）", () => {
  assert.deepEqual(resolveVisibleSections(DEFAULT_TOOLBAR_VISIBILITY), ["headings", "basic", "more", "callouts"]);
  assert.deepEqual(resolveVisibleSections(DEFAULT_TOOLBAR_VISIBILITY, { hasSnippets: false }), [
    "headings",
    "basic",
    "more",
    "callouts",
  ]);
});

test("My menu：スニペットがあれば既定で一番下に出る", () => {
  assert.deepEqual(resolveVisibleSections(DEFAULT_TOOLBAR_VISIBILITY, { hasSnippets: true }), [
    "headings",
    "basic",
    "more",
    "callouts",
    "mymenu",
  ]);
});

test("My menu：非表示設定ならスニペットがあっても出さない", () => {
  const visibility = withVisibility({ showSectionMyMenu: false });
  assert.ok(!resolveVisibleSections(visibility, { hasSnippets: true }).includes("mymenu"));
});

test("並び順：order に従って並び、非表示のものは除かれる", () => {
  const order = ["mymenu", "callouts", "more", "basic", "headings"] as const;
  assert.deepEqual(resolveVisibleSections(DEFAULT_TOOLBAR_VISIBILITY, { order, hasSnippets: true }), [
    "mymenu",
    "callouts",
    "more",
    "basic",
    "headings",
  ]);
  const hidden = withVisibility({ showSectionMore: false });
  assert.deepEqual(resolveVisibleSections(hidden, { order, hasSnippets: false }), ["callouts", "basic", "headings"]);
});

test("文言：My menu の表示トグルの名前に、パレットの見出し名が含まれる", () => {
  assert.ok(t("settingShowSectionMyMenuName", "ja").includes(t("sectionMyMenu", "ja")));
  assert.ok(t("settingShowSectionMyMenuName", "en").includes(t("sectionMyMenu", "en")));
});
