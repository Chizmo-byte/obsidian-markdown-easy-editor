/**
 * マークダウン整形（クレンジング）ロジック。
 * Webツールから移植した純粋関数群。
 */

/** 整形モード。easy=初心者向けの体裁修正 / optimize=ノイズ除去と最適化。 */
export type ProcessMode = "easy" | "optimize";

/** 出力先プラットフォーム（optimize モードでのみ参照）。 */
export type TargetPlatform = "note" | "brain" | "obsidian";

/**
 * マークダウンを整形して返す。
 */
export function processMarkdown(
  text: string,
  mode: ProcessMode,
  target?: TargetPlatform,
): string {
  let result = applyCommonRules(text);
  result = mode === "easy"
    ? applyEasyMode(result)
    : applyOptimizeMode(result, target);
  return applyCommonRules(result);
}

function applyCommonRules(text: string): string {
  const normalized = text.replace(/\r\n?/g, "\n");
  return normalized
    .replace(/[ \t]+$/gm, "") 
    .replace(/\n{3,}/g, "\n\n") 
    .trim();
}

function applyEasyMode(text: string): string {
  let result = ensureHeadingSpacing(text);
  result = normalizeListMarkers(result);
  result = collapseDecorationRuns(result);
  return result;
}

const HEADING_RE = /^#{1,6}\s/;

function ensureHeadingSpacing(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];

  for (const line of lines) {
    const prev = out[out.length - 1];
    const needsBlank =
      HEADING_RE.test(line) && out.length > 0 && prev && prev.trim() !== "";
    if (needsBlank) out.push("");
    out.push(line);
  }

  return out.join("\n");
}

function normalizeListMarkers(text: string): string {
  return text.replace(/^(\s*)([-*])(?=[^\s*\-])/gm, "$1$2 ");
}

const DECORATION_RE = /^\s*([-*_=])\1{2,}\s*$/;

function decorationSymbol(line: string): string | null {
  const match = DECORATION_RE.exec(line);
  return match ? match[1] : null;
}

function collapseDecorationRuns(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const symbol = decorationSymbol(lines[i]);
    if (symbol === null) {
      out.push(lines[i]);
      i += 1;
      continue;
    }

    let j = i + 1;
    while (j < lines.length && decorationSymbol(lines[j]) === symbol) j += 1;

    const runLength = j - i;
    if (runLength >= 3) {
      out.push(lines[i]);
    } else {
      for (let k = i; k < j; k += 1) out.push(lines[k]);
    }
    i = j;
  }

  return out.join("\n");
}

function applyOptimizeMode(text: string, target?: TargetPlatform): string {
  let result = removeAiIntro(text);
  result = stripObsidianSyntax(result);
  result = normalizeCallouts(result);
  result = reduceExcessiveBold(result);

  result = ensureHeadingSpacing(result);
  result = normalizeListMarkers(result);
  result = collapseDecorationRuns(result);

  if (target === "note" || target === "brain") {
    result = convertTablesToList(result);
    result = dedentDeepLists(result);
  }

  return result;
}

const AI_INTRO_PATTERNS: readonly RegExp[] = [
  /^(承知いたしました|承知しました|以下に|こちらが).*?(です|ます|いたします)。?$/,
  /^はい[、,]?\s*(マークダウン形式で|整理して)作成しました。?$/,
];

function removeAiIntro(text: string): string {
  return text
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !AI_INTRO_PATTERNS.some((pattern) => pattern.test(trimmed));
    })
    .join("\n");
}

function stripObsidianSyntax(text: string): string {
  let result = text;
  result = result.replace(/\[\[([^\[\]]+)\]\]/g, (_match, inner: string) => {
    const parts = inner.split("|");
    return (parts.length > 1 ? parts[1] : parts[0]).trim();
  });
  result = result.replace(/(^|[ \t])\^[A-Za-z0-9_-]+(?=[ \t]*$)/gm, "");
  return result;
}

const CALLOUT_PROPER_RE = /^(\s*>)\s*\[![^\]\n]+\][-+]?[ \t]*(.*)$/;
const CALLOUT_BARE_RE = /^\s*\[![^\]\n]+\][-+]?[ \t]*(.*)$/;

function normalizeCallouts(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const proper = CALLOUT_PROPER_RE.exec(lines[i]);
    if (proper) {
      const [, prefix, title] = proper;
      out.push(title.length > 0 ? `${prefix} ${title}` : prefix);
      i += 1;
      continue;
    }

    const bare = CALLOUT_BARE_RE.exec(lines[i]);
    if (bare) {
      const title = bare[1];
      if (title.length > 0) out.push(`> ${title}`);
      i += 1;
      while (i < lines.length && lines[i].trim() !== "") {
        out.push(`> ${lines[i].replace(/^\s*>?[ \t]?/, "")}`);
        i += 1;
      }
      continue;
    }

    out.push(lines[i]);
    i += 1;
  }

  return out.join("\n");
}

function reduceExcessiveBold(text: string): string {
  const boldSpan = /\*\*[^*\n]+\*\*/g;
  return text
    .split("\n")
    .map((line) => {
      const matches = line.match(boldSpan);
      if (matches && matches.length >= 3) {
        return line.replace(/\*\*([^*\n]+)\*\*/g, "$1");
      }
      return line;
    })
    .join("\n");
}

function isTableRow(line: string): boolean {
  return /^\s*\|.*\|\s*$/.test(line);
}

function parseTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((cell) => cell.trim());
}

function isSeparatorRow(line: string): boolean {
  if (!isTableRow(line)) return false;
  const cells = parseTableRow(line);
  return cells.length > 0 && cells.every((c) => /^:?-{1,}:?$/.test(c));
}

function convertTablesToList(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const isTableHead =
      isTableRow(lines[i]) &&
      i + 1 < lines.length &&
      isSeparatorRow(lines[i + 1]);

    if (!isTableHead) {
      out.push(lines[i]);
      i += 1;
      continue;
    }

    const header = parseTableRow(lines[i]);
    let j = i + 2;
    const dataRows: string[][] = [];
    while (j < lines.length && isTableRow(lines[j]) && !isSeparatorRow(lines[j])) {
      dataRows.push(parseTableRow(lines[j]));
      j += 1;
    }

    out.push(...tableToBullets(header, dataRows));
    i = j;
  }

  return out.join("\n");
}

function tableToBullets(header: string[], dataRows: string[][]): string[] {
  if (header.length === 2) {
    return [header, ...dataRows].map(
      (row) => `- ${row[0] ?? ""}: ${row[1] ?? ""}`,
    );
  }

  const out: string[] = [];
  dataRows.forEach((row, rowIndex) => {
    header.forEach((label, col) => {
      const name = label.length > 0 ? label : `列${col + 1}`;
      out.push(`- ${name}: ${row[col] ?? ""}`);
    });
    if (rowIndex < dataRows.length - 1) out.push("");
  });
  return out;
}

const INDENTED_LIST_RE = /^( {2,})([-*+]|\d+\.)\s/;

function dedentDeepLists(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const match = INDENTED_LIST_RE.exec(line);
      if (!match) return line;
      const indent = match[1].length;
      if (indent < 4) return line; 
      return line.slice(2);
    })
    .join("\n");
}
