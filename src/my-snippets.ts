/**
 * 「My menu」：ユーザーが登録するスニペットの検証・追加・編集・削除、
 * 読み込み時の整形、差し込み記号の展開、日付書式の既定値と候補。
 *
 * このモジュールは obsidian パッケージに依存させないこと（i18n.ts と同じ理由）。
 * Node 上のテストから直接読み込むため、import には拡張子 .ts を付けている。
 * 日付の整形（moment）は呼び出し側から関数として渡してもらう。
 */

/** 設定に保存するスニペット 1 件分。 */
export interface MySnippet {
  /** 内部用の識別子。編集・削除の対象を指すのに使う（画面には出さない）。 */
  id: string;
  /** パレットに出る名前。 */
  label: string;
  /** 挿入するテキスト。複数行可・差し込み記号を含められる。 */
  template: string;
}

export const MY_SNIPPET_LIMITS = {
  labelMax: 30,
  templateMax: 2000,
  countMax: 50,
} as const;

export type MySnippetError =
  | "empty-label"
  | "label-too-long"
  | "empty-template"
  | "template-too-long"
  | "too-many"
  | "not-found";

/** エラー種別 → 通知文言の i18n キー。 */
export const MY_SNIPPET_ERROR_KEYS: Readonly<Record<MySnippetError, string>> = {
  "empty-label": "noticeMySnippetEmptyLabel",
  "label-too-long": "noticeMySnippetLabelTooLong",
  "empty-template": "noticeMySnippetEmptyTemplate",
  "template-too-long": "noticeMySnippetTemplateTooLong",
  "too-many": "noticeMySnippetTooMany",
  "not-found": "noticeMySnippetNotFound",
};

export type MySnippetResult =
  | { ok: true; snippets: MySnippet[] }
  | { ok: false; error: MySnippetError };

export interface MySnippetInput {
  label: string;
  template: string;
}

/** 名前・テンプレートを検証し、前後の空白を除いた値を返す（名前のみ trim。テンプレートは先頭・末尾の改行以外は保つ）。 */
function validateInput(input: MySnippetInput): { ok: true; value: MySnippetInput } | { ok: false; error: MySnippetError } {
  const label = input.label.trim();
  if (label.length === 0) return { ok: false, error: "empty-label" };
  if (label.length > MY_SNIPPET_LIMITS.labelMax) return { ok: false, error: "label-too-long" };

  // 前後の空行は不要だが、行頭のインデントなどは意味を持つので trim はしない。
  const template = input.template.replace(/^\n+|\n+$/g, "");
  if (template.trim().length === 0) return { ok: false, error: "empty-template" };
  if (template.length > MY_SNIPPET_LIMITS.templateMax) return { ok: false, error: "template-too-long" };
  return { ok: true, value: { label, template } };
}

/** 既存の id と重ならない新しい id を作る。 */
export function generateSnippetId(existing: ReadonlyArray<MySnippet>, random: () => number = Math.random): string {
  const taken = new Set(existing.map((s) => s.id));
  for (;;) {
    const id = `s${Date.now().toString(36)}${Math.floor(random() * 1e6).toString(36)}`;
    if (!taken.has(id)) return id;
  }
}

/** 末尾に追加した新しい配列を返す（引数の配列は変更しない）。 */
export function addMySnippet(
  existing: ReadonlyArray<MySnippet>,
  input: MySnippetInput,
  makeId: (existing: ReadonlyArray<MySnippet>) => string = generateSnippetId,
): MySnippetResult {
  if (existing.length >= MY_SNIPPET_LIMITS.countMax) return { ok: false, error: "too-many" };
  const checked = validateInput(input);
  if (!checked.ok) return checked;
  return { ok: true, snippets: [...existing, { id: makeId(existing), ...checked.value }] };
}

/** id のスニペットの名前・テンプレートを差し替えた新しい配列を返す（位置は変えない）。 */
export function updateMySnippet(
  existing: ReadonlyArray<MySnippet>,
  id: string,
  input: MySnippetInput,
): MySnippetResult {
  if (!existing.some((s) => s.id === id)) return { ok: false, error: "not-found" };
  const checked = validateInput(input);
  if (!checked.ok) return checked;
  return {
    ok: true,
    snippets: existing.map((s) => (s.id === id ? { id, ...checked.value } : s)),
  };
}

/** id のスニペットを取り除いた新しい配列を返す。存在しなければ内容はそのまま。 */
export function removeMySnippet(existing: ReadonlyArray<MySnippet>, id: string): MySnippet[] {
  return existing.filter((s) => s.id !== id);
}

/**
 * loadData() から読んだ値を、正しい形のスニペット配列にそろえる。
 * 古い保存データ・手で編集された data.json に備え、壊れた要素は捨て、
 * id が無い・重複するものには新しい id を振る。上限を超えた分は切り捨てる。
 */
export function normalizeMySnippets(raw: unknown): MySnippet[] {
  if (!Array.isArray(raw)) return [];

  const result: MySnippet[] = [];
  const usedIds = new Set<string>();
  for (const item of raw) {
    if (result.length >= MY_SNIPPET_LIMITS.countMax) break;
    if (typeof item !== "object" || item === null) continue;
    const { id, label, template } = item as { id?: unknown; label?: unknown; template?: unknown };
    if (typeof label !== "string" || typeof template !== "string") continue;
    const checked = validateInput({ label, template });
    if (!checked.ok) continue;

    let finalId = typeof id === "string" && id.length > 0 && !usedIds.has(id) ? id : "";
    if (finalId === "") finalId = generateSnippetId(result);
    usedIds.add(finalId);
    result.push({ id: finalId, ...checked.value });
  }
  return result;
}

// --- 日付・時刻の書式 ---

export const DEFAULT_DATE_FORMAT = "YYYY-MM-DD";
export const DEFAULT_TIME_FORMAT = "HH:mm";

/** 書式の入力欄の下に並べる候補（押すと入力欄に入る）。 */
export const DATE_FORMAT_PRESETS: ReadonlyArray<string> = [
  "YYYY-MM-DD",
  "YYYY/MM/DD",
  "YYYY年M月D日",
  "M/D",
  "YYYY-MM-DD（ddd）",
];
export const TIME_FORMAT_PRESETS: ReadonlyArray<string> = ["HH:mm", "HH:mm:ss", "H時mm分"];

/** 保存された書式を整える。文字列でない・空欄なら既定値に戻す。 */
export function normalizeFormat(raw: unknown, fallback: string): string {
  return typeof raw === "string" && raw.trim().length > 0 ? raw : fallback;
}

// --- 差し込み記号の展開 ---

/** 記号の展開に必要なもの。日付の整形は moment などを呼び出し側から渡す。 */
export interface ExpandContext {
  /** エディタで選択中のテキスト（未選択なら空文字）。 */
  selection: string;
  /** 書式文字列 → 現在の日時を整形した文字列。 */
  formatNow: (format: string) => string;
  dateFormat: string;
  timeFormat: string;
}

export interface ExpandResult {
  /** 挿入する文字列。 */
  text: string;
  /** `{{cursor}}` の位置（text の先頭からの文字数）。無ければ null。 */
  cursorOffset: number | null;
}

const TOKEN_PATTERN = /\{\{(cursor|selection|datetime|date|time)(?::([^{}\n]*))?\}\}/g;

/**
 * テンプレートの差し込み記号を展開する。
 *
 * - `{{cursor}}`：カーソル位置（最初の 1 つだけ有効。2 つ目以降は消える）
 * - `{{selection}}`：選択中のテキスト
 * - `{{date}}` `{{time}}` `{{datetime}}`：設定の書式で整形（`{{date:書式}}` のように直接指定もできる）
 * - 上記以外（`{{foo}}`・引数が付けられない記号に付けたもの）は、そのまま文字として残す
 */
export function expandTemplate(template: string, ctx: ExpandContext): ExpandResult {
  let text = "";
  let cursorOffset: number | null = null;
  let last = 0;

  // matchAll は ES2020。tsconfig の lib（es6）でも通る exec ループにしている
  const pattern = new RegExp(TOKEN_PATTERN.source, "g");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(template)) !== null) {
    const whole = match[0];
    const name = match[1];
    const arg: string | undefined = match[2];
    const start = match.index;
    text += template.slice(last, start);
    last = start + whole.length;

    const hasArg = arg !== undefined;
    const customFormat = hasArg && arg.trim().length > 0 ? arg : null;

    switch (name) {
      case "cursor":
        if (hasArg) {
          text += whole;
        } else if (cursorOffset === null) {
          cursorOffset = text.length;
        }
        break;
      case "selection":
        text += hasArg ? whole : ctx.selection;
        break;
      case "date":
        text += ctx.formatNow(customFormat ?? ctx.dateFormat);
        break;
      case "time":
        text += ctx.formatNow(customFormat ?? ctx.timeFormat);
        break;
      case "datetime":
        text += customFormat !== null
          ? ctx.formatNow(customFormat)
          : `${ctx.formatNow(ctx.dateFormat)} ${ctx.formatNow(ctx.timeFormat)}`;
        break;
    }
  }
  text += template.slice(last);
  return { text, cursorOffset };
}

/** パレットのボタンの説明に使う、テンプレートの冒頭 1 行（長ければ末尾を … にする）。 */
export function previewTemplate(template: string, maxLength = 40): string {
  const firstLine = template.split("\n").find((line) => line.trim().length > 0) ?? "";
  const line = firstLine.trim();
  return line.length > maxLength ? `${line.slice(0, maxLength - 1)}…` : line;
}

/** 文字数の位置（先頭からの offset）を、行・桁（0 始まり）に直す。 */
export function offsetToLineCh(text: string, offset: number): { line: number; ch: number } {
  const before = text.slice(0, offset);
  const lines = before.split("\n");
  return { line: lines.length - 1, ch: lines[lines.length - 1].length };
}
