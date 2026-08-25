import { test } from "node:test";
import assert from "node:assert/strict";

import { processMarkdown } from "../src/markdown-transformer.ts";

/** optimize モード（見出し補正・コールアウト正規化が動くモード）で整形する。 */
function optimize(text: string): string {
  return processMarkdown(text, "optimize");
}

/** easy モード（初心者向けの体裁修正のみ）で整形する。 */
function easy(text: string): string {
  return processMarkdown(text, "easy");
}

test("見出し：# 直後のスペース欠落を補う", () => {
  assert.equal(optimize("#見出し"), "# 見出し");
});

test("見出し：H1〜H6 すべての階層で補正される", () => {
  for (let level = 1; level <= 6; level += 1) {
    const hashes = "#".repeat(level);
    assert.equal(optimize(`${hashes}見出し`), `${hashes} 見出し`);
  }
});

test("見出し：すでにスペースがある行は変更しない", () => {
  assert.equal(optimize("## 見出し"), "## 見出し");
});

test("見出し：# が7個以上の行は見出しではないので変更しない", () => {
  assert.equal(optimize("#######見出し"), "#######見出し");
});

test("見出し：# のみの行は変更しない", () => {
  assert.equal(optimize("#"), "#");
});

test("見出し：easy モードでもスペース欠落を補う", () => {
  assert.equal(easy("#見出し"), "# 見出し");
});

test("見出し：easy モードでも H1〜H6 すべての階層で補正される", () => {
  for (let level = 1; level <= 6; level += 1) {
    const hashes = "#".repeat(level);
    assert.equal(easy(`${hashes}見出し`), `${hashes} 見出し`);
  }
});

test("見出し：easy モードでも # が7個以上の行は変更しない", () => {
  assert.equal(easy("#######見出し"), "#######見出し");
});

test("コールアウト：easy モードでは行に手を加えない", () => {
  assert.equal(easy("> [!warning] 本文"), "> [!warning] 本文");
});

test("コールアウト：[!warning] 付きの行は変化しない", () => {
  assert.equal(optimize("> [!warning] 本文"), "> [!warning] 本文");
});

test("コールアウト：>[!tip] のみの行はタグを保持したまま整形される", () => {
  assert.equal(optimize(">[!tip]"), "> [!tip]");
});

test("コールアウト：種類を問わずタグが保持される", () => {
  const tags = ["note", "warning", "tip", "danger", "info", "success", "quote"];
  for (const tag of tags) {
    assert.equal(
      optimize(`> [!${tag}] 本文`),
      `> [!${tag}] 本文`,
      `[!${tag}] が保持されていない`,
    );
  }
});

test("コールアウト：ユーザー定義の任意のタグ名も保持される", () => {
  assert.equal(optimize("> [!custom-tag] 本文"), "> [!custom-tag] 本文");
});

test("コールアウト：タイトル付きでもタグが先頭に残る", () => {
  assert.equal(optimize("> [!note] 注意点"), "> [!note] 注意点");
});

test("コールアウト：> が無い行は引用に整形しつつタグを保持する", () => {
  assert.equal(
    optimize("[!note] 注意点\n本文1"),
    "> [!note] 注意点\n> 本文1",
  );
});

test("コールアウト：折りたたみ記号付きでもタグを保持する", () => {
  assert.equal(optimize("> [!note]- 本文"), "> [!note] 本文");
});

// 以下は不要なエスケープ（\[ / \-）を削除した正規表現の挙動を固定するためのテスト。
// エスケープの有無で意味が変わっていないことを保証する。

test("内部リンク：[[リンク]] は表示テキストだけになる", () => {
  assert.equal(optimize("[[ノート名]]"), "ノート名");
});

test("内部リンク：[[実体|表示名]] は表示名側が残る", () => {
  assert.equal(optimize("[[記事のパス|表示名]]"), "表示名");
});

test("内部リンク：角括弧を含まない本文は変更しない", () => {
  assert.equal(optimize("配列は array[0] で参照する"), "配列は array[0] で参照する");
});

test("リスト：- 直後のスペース欠落を補う", () => {
  assert.equal(optimize("-項目"), "- 項目");
});

test("リスト：* 直後のスペース欠落を補う", () => {
  assert.equal(optimize("*項目"), "* 項目");
});

test("リスト：マーカーが連続する行は補正しない", () => {
  assert.equal(optimize("--項目"), "--項目");
});

test("リスト：水平線 --- はリストとして補正しない", () => {
  assert.equal(optimize("---"), "---");
});

test("コールアウトと見出しが混在しても双方が正しく処理される", () => {
  assert.equal(
    optimize("#タイトル\n\n> [!warning] 注意"),
    "# タイトル\n\n> [!warning] 注意",
  );
});
