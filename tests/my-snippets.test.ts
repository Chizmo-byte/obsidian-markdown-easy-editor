import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DATE_FORMAT_PRESETS,
  DEFAULT_DATE_FORMAT,
  DEFAULT_TIME_FORMAT,
  MY_SNIPPET_ERROR_KEYS,
  MY_SNIPPET_LIMITS,
  TIME_FORMAT_PRESETS,
  addMySnippet,
  expandTemplate,
  generateSnippetId,
  normalizeFormat,
  normalizeMySnippets,
  offsetToLineCh,
  previewTemplate,
  removeMySnippet,
  updateMySnippet,
  type ExpandContext,
  type MySnippet,
} from "../src/my-snippets.ts";
import { STRINGS, t } from "../src/i18n.ts";

let counter = 0;
const nextId = () => `id${++counter}`;
const snip = (id: string, label = "名前", template = "本文"): MySnippet => ({ id, label, template });

/** 書式をそのまま「[書式]」として返す、テスト用の整形関数。 */
function ctx(overrides: Partial<ExpandContext> = {}): ExpandContext {
  return {
    selection: "",
    formatNow: (format) => `<${format}>`,
    dateFormat: "D-FMT",
    timeFormat: "T-FMT",
    ...overrides,
  };
}

// --- 追加 ---

test("追加：末尾に追加され、元の配列は変わらない", () => {
  const existing = [snip("a")];
  const result = addMySnippet(existing, { label: " 見出し ", template: "## {{date}}" }, nextId);
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.snippets.length, 2);
  assert.deepEqual(result.snippets[1], { id: result.snippets[1].id, label: "見出し", template: "## {{date}}" });
  assert.equal(existing.length, 1);
});

test("追加：名前が空・空白だけだとエラー", () => {
  for (const label of ["", "   "]) {
    assert.deepEqual(addMySnippet([], { label, template: "x" }), { ok: false, error: "empty-label" });
  }
});

test("追加：名前は30文字まで", () => {
  assert.ok(addMySnippet([], { label: "あ".repeat(30), template: "x" }).ok);
  assert.deepEqual(addMySnippet([], { label: "あ".repeat(31), template: "x" }), { ok: false, error: "label-too-long" });
});

test("追加：テンプレートが空・空白と改行だけだとエラー、2000文字まで", () => {
  for (const template of ["", "  \n ", "\n\n"]) {
    assert.deepEqual(addMySnippet([], { label: "a", template }), { ok: false, error: "empty-template" });
  }
  assert.ok(addMySnippet([], { label: "a", template: "x".repeat(MY_SNIPPET_LIMITS.templateMax) }).ok);
  assert.deepEqual(addMySnippet([], { label: "a", template: "x".repeat(MY_SNIPPET_LIMITS.templateMax + 1) }), {
    ok: false,
    error: "template-too-long",
  });
});

test("追加：テンプレートの前後の空行は除くが、行頭の空白は保つ", () => {
  const result = addMySnippet([], { label: "a", template: "\n\n  - 項目\n\n" }, nextId);
  assert.ok(result.ok);
  if (result.ok) assert.equal(result.snippets[0].template, "  - 項目");
});

test("追加：50件まで。51件目はエラー", () => {
  const full = Array.from({ length: MY_SNIPPET_LIMITS.countMax }, (_, i) => snip(`s${i}`));
  assert.deepEqual(addMySnippet(full, { label: "a", template: "x" }), { ok: false, error: "too-many" });
});

test("追加：名前の重複は許可される", () => {
  const result = addMySnippet([snip("a", "同じ")], { label: "同じ", template: "x" }, nextId);
  assert.ok(result.ok);
});

// --- 編集・削除 ---

test("編集：位置を変えずに内容だけ差し替わる", () => {
  const existing = [snip("a", "一"), snip("b", "二"), snip("c", "三")];
  const result = updateMySnippet(existing, "b", { label: "二改", template: "新" });
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.deepEqual(
    result.snippets.map((s) => [s.id, s.label, s.template]),
    [["a", "一", "本文"], ["b", "二改", "新"], ["c", "三", "本文"]],
  );
});

test("編集：存在しない id・不正な入力はエラー", () => {
  assert.deepEqual(updateMySnippet([snip("a")], "zzz", { label: "x", template: "y" }), { ok: false, error: "not-found" });
  assert.deepEqual(updateMySnippet([snip("a")], "a", { label: "", template: "y" }), { ok: false, error: "empty-label" });
});

test("削除：指定の id だけ取り除く。存在しなければそのまま", () => {
  const existing = [snip("a"), snip("b")];
  assert.deepEqual(removeMySnippet(existing, "a").map((s) => s.id), ["b"]);
  assert.deepEqual(removeMySnippet(existing, "zzz").map((s) => s.id), ["a", "b"]);
});

// --- 読み込み整形 ---

test("読み込み：配列でなければ空", () => {
  for (const raw of [undefined, null, "x", 3, {}]) assert.deepEqual(normalizeMySnippets(raw), []);
});

test("読み込み：壊れた要素は捨て、id が無い・重複するものには新しい id を振る", () => {
  const result = normalizeMySnippets([
    { id: "a", label: "一", template: "x" },
    { label: "idなし", template: "y" },
    { id: "a", label: "重複id", template: "z" },
    null,
    "文字列",
    { id: "b", label: 5, template: "x" },
    { id: "c", label: "", template: "x" },
    { id: "d", label: "x", template: "   " },
  ]);
  assert.equal(result.length, 3);
  assert.deepEqual(result.map((s) => s.label), ["一", "idなし", "重複id"]);
  assert.equal(new Set(result.map((s) => s.id)).size, 3);
  assert.equal(result[0].id, "a");
});

test("読み込み：上限を超えた分は切り捨てる", () => {
  const raw = Array.from({ length: 60 }, (_, i) => ({ id: `s${i}`, label: `n${i}`, template: "x" }));
  assert.equal(normalizeMySnippets(raw).length, MY_SNIPPET_LIMITS.countMax);
});

test("id 生成：既存と重ならない", () => {
  const existing = [snip("fixed")];
  const id = generateSnippetId(existing, () => 0.5);
  assert.notEqual(id, "fixed");
  assert.ok(id.length > 0);
});

// --- 書式 ---

test("書式：空欄・文字列でない値は既定値に戻る", () => {
  assert.equal(normalizeFormat(undefined, DEFAULT_DATE_FORMAT), DEFAULT_DATE_FORMAT);
  assert.equal(normalizeFormat("   ", DEFAULT_TIME_FORMAT), DEFAULT_TIME_FORMAT);
  assert.equal(normalizeFormat(3, DEFAULT_TIME_FORMAT), DEFAULT_TIME_FORMAT);
  assert.equal(normalizeFormat("YYYY/MM/DD", DEFAULT_DATE_FORMAT), "YYYY/MM/DD");
});

test("書式：候補は空でなく、既定値を含む", () => {
  assert.ok(DATE_FORMAT_PRESETS.includes(DEFAULT_DATE_FORMAT));
  assert.ok(TIME_FORMAT_PRESETS.includes(DEFAULT_TIME_FORMAT));
  for (const f of [...DATE_FORMAT_PRESETS, ...TIME_FORMAT_PRESETS]) assert.ok(f.trim().length > 0);
});

// --- 記号の展開 ---

test("展開：記号が無ければそのまま・カーソル位置は無し", () => {
  assert.deepEqual(expandTemplate("ただの文章", ctx()), { text: "ただの文章", cursorOffset: null });
});

test("展開：{{cursor}} の位置が返り、記号自体は消える", () => {
  assert.deepEqual(expandTemplate("**{{cursor}}**", ctx()), { text: "****", cursorOffset: 2 });
});

test("展開：{{cursor}} は最初の1つだけ有効（日付などで長さが変わっても位置が合う）", () => {
  const result = expandTemplate("{{date}}|{{cursor}}|{{cursor}}", ctx({ formatNow: () => "2026-10-28" }));
  assert.equal(result.text, "2026-10-28||");
  assert.equal(result.cursorOffset, 11);
});

test("展開：{{selection}} は選択テキストに置き換わる（未選択なら空）", () => {
  assert.equal(expandTemplate("[[{{selection}}]]", ctx({ selection: "ノート" })).text, "[[ノート]]");
  assert.equal(expandTemplate("[[{{selection}}]]", ctx()).text, "[[]]");
});

test("展開：選択テキストの中の {{...}} は再展開されない", () => {
  assert.equal(expandTemplate("{{selection}}", ctx({ selection: "{{date}}" })).text, "{{date}}");
});

test("展開：{{date}} {{time}} は設定の書式を使う", () => {
  assert.equal(expandTemplate("{{date}} / {{time}}", ctx()).text, "<D-FMT> / <T-FMT>");
});

test("展開：{{datetime}} は日付と時刻を半角スペースでつなぐ", () => {
  assert.equal(expandTemplate("{{datetime}}", ctx()).text, "<D-FMT> <T-FMT>");
});

test("展開：{{date:書式}} {{time:書式}} {{datetime:書式}} は書式を直接指定できる", () => {
  assert.equal(expandTemplate("{{date:YYYY/MM/DD}}", ctx()).text, "<YYYY/MM/DD>");
  assert.equal(expandTemplate("{{time:H時}}", ctx()).text, "<H時>");
  assert.equal(expandTemplate("{{datetime:YYYYMMDD-HHmm}}", ctx()).text, "<YYYYMMDD-HHmm>");
});

test("展開：書式が空（{{date:}}）なら設定の書式を使う", () => {
  assert.equal(expandTemplate("{{date:}}", ctx()).text, "<D-FMT>");
  assert.equal(expandTemplate("{{date:  }}", ctx()).text, "<D-FMT>");
});

test("展開：未知の記号・引数を付けられない記号の引数付きは、そのまま残る", () => {
  assert.equal(expandTemplate("{{foo}} {{cursor:x}} {{selection:y}}", ctx({ selection: "S" })).text, "{{foo}} {{cursor:x}} {{selection:y}}");
});

test("展開：複数行・日本語・前後の文字を保つ", () => {
  const result = expandTemplate("日時：{{date}}\n- {{cursor}}\n以上", ctx({ formatNow: () => "10月28日" }));
  assert.equal(result.text, "日時：10月28日\n- \n以上");
  assert.deepEqual(offsetToLineCh(result.text, result.cursorOffset ?? 0), { line: 1, ch: 2 });
});

test("位置変換：1行目・複数行・末尾", () => {
  assert.deepEqual(offsetToLineCh("abc", 2), { line: 0, ch: 2 });
  assert.deepEqual(offsetToLineCh("ab\ncde", 4), { line: 1, ch: 1 });
  assert.deepEqual(offsetToLineCh("ab\n", 3), { line: 1, ch: 0 });
});

// --- プレビュー ---

test("プレビュー：最初の空でない行を返し、長ければ … で切る", () => {
  assert.equal(previewTemplate("\n\n  見出し  \n2行目"), "見出し");
  assert.equal(previewTemplate("あ".repeat(50), 40), `${"あ".repeat(39)}…`);
  assert.equal(previewTemplate("あ".repeat(40), 40), "あ".repeat(40));
  assert.equal(previewTemplate(""), "");
});

// --- 文言 ---

test("文言：エラー通知のキーが日英とも存在する", () => {
  for (const key of Object.values(MY_SNIPPET_ERROR_KEYS)) {
    assert.ok(key in STRINGS.en, `en: ${key}`);
    assert.ok(key in STRINGS.ja, `ja: ${key}`);
    assert.notEqual(t(key, "ja"), key);
  }
});
