/**
 * 表示言語の判定と、UI 文言の辞書。
 * Obsidian の表示言語設定に追随し、日本語以外は英語にフォールバックする。
 */

export type Locale = "en" | "ja";

/**
 * Obsidian の表示言語を取得する。
 * Obsidian は選択中の言語を localStorage の "language" キーに保存しており、
 * 公式 API が無いためコミュニティプラグインではこの値を参照するのが通例。
 * 未設定・取得失敗時は英語とみなす。
 */
export function getLocale(): Locale {
  try {
    const locale = window.localStorage.getItem("language") || "en";
    return locale.startsWith("ja") ? "ja" : "en";
  } catch (e) {
    // localStorage が使えない環境でもプラグイン自体は動かす
    console.error("Locale detection error:", e);
    return "en";
  }
}

export const STRINGS: Record<Locale, Record<string, string>> = {
  en: {
    // パネル共通
    paletteTitle: "Markdown syntax palette",
    applyButton: "Apply",
    sectionHeadings: "Headings",
    sectionBasic: "Basic",
    sectionMore: "More",

    // 見出し
    labelH1: "H1",
    shortcutH1: "# Heading 1",
    tipH1: "The top-level heading.",
    labelH2: "H2",
    shortcutH2: "## Heading 2",
    tipH2: "A section heading.",
    labelH3: "H3",
    shortcutH3: "### Heading 3",
    tipH3: "A sub-heading.",
    labelH4: "H4",
    shortcutH4: "#### Heading 4",
    tipH4: "A smaller sub-heading.",
    labelH5: "H5",
    shortcutH5: "##### Heading 5",
    tipH5: "A detailed heading.",
    labelH6: "H6",
    shortcutH6: "###### Heading 6",
    tipH6: "The smallest heading.",

    // 基本
    labelBold: "Bold",
    shortcutBold: "**text**",
    tipBold: "Makes important words stand out. Applies to the current selection.",
    labelItalic: "Italic",
    shortcutItalic: "*text*",
    tipItalic: "Adds light emphasis to a word or phrase.",
    labelList: "List",
    shortcutList: "- item",
    tipList: "Lists items one per line.",
    labelNumber: "Numbered list",
    shortcutNumber: "1. step",
    tipNumber: "Numbers steps or ranked items in order.",
    labelQuote: "Quote",
    shortcutQuote: "> quote",
    tipQuote: "Quotes someone's words, or sets an aside apart.",
    labelLink: "Link",
    shortcutLink: "[text](URL)",
    tipLink: "Adds a link to a web page or note.",

    // その他
    labelInlineCode: "Inline code",
    shortcutInlineCode: "`code`",
    tipInlineCode: "Formats the selection as inline code.",
    labelCodeBlock: "Code block",
    shortcutCodeBlock: "```code```",
    tipCodeBlock: "Displays several lines of code.",
    labelTable: "Table",
    shortcutTable: "| Item | Details |",
    tipTable: "Compares and organizes items in rows and columns.",
    labelCheck: "Checklist",
    shortcutCheck: "- [ ] TODO",
    tipCheck: "Tracks what is done and what is left.",
    labelStrikethrough: "Strikethrough",
    shortcutStrikethrough: "~~text~~",
    tipStrikethrough: "Shows text that was corrected or withdrawn.",
    labelDivider: "Divider",
    shortcutDivider: "---",
    tipDivider: "Adds a horizontal rule where the topic changes.",

    // 挿入されるテンプレートの中身
    placeholderCode: "your code here",
    placeholderTodo: "To-do",
    snippetTable: "| Item | Details |\n| --- | --- |\n| Example | Description |",
    linkTextDefault: "link text",

    // 通知
    noticeNoMarkdownNote: "Open a Markdown note to use this command.",
    noticeSidebarUnavailable: "Could not open the right sidebar.",
    noticeToolbarError: "Something went wrong while opening the toolbar.",
    noticeMultilineUnsupported:
      "Multi-line selection is not supported. Apply to one line at a time.",
    noticeActionError: "Something went wrong while applying the formatting.",
    noticeSelectText: "Select some text to optimize.",
    noticeOptimized: "Markdown optimized.",
    noticeOptimizeError: "Something went wrong while optimizing.",
  },

  ja: {
    // パネル共通
    paletteTitle: "Markdown 記法パレット",
    applyButton: "適用",
    sectionHeadings: "見出し",
    sectionBasic: "基本",
    sectionMore: "その他",

    // 見出し
    labelH1: "H1",
    shortcutH1: "# 見出し1",
    tipH1: "最上位の見出しです。",
    labelH2: "H2",
    shortcutH2: "## 見出し2",
    tipH2: "中見出しです。",
    labelH3: "H3",
    shortcutH3: "### 見出し3",
    tipH3: "小見出しです。",
    labelH4: "H4",
    shortcutH4: "#### 見出し4",
    tipH4: "さらに小さい見出しです。",
    labelH5: "H5",
    shortcutH5: "##### 見出し5",
    tipH5: "詳細な見出しです。",
    labelH6: "H6",
    shortcutH6: "###### 見出し6",
    tipH6: "最小の見出しです。",

    // 基本
    labelBold: "太字",
    shortcutBold: "**文字**",
    tipBold: "重要な言葉を目立たせます。選択範囲を太字にできます。",
    labelItalic: "斜体",
    shortcutItalic: "*文字*",
    tipItalic: "軽く強調したい言葉に使います。",
    labelList: "リスト",
    shortcutList: "- 項目",
    tipList: "項目を並べます。",
    labelNumber: "番号",
    shortcutNumber: "1. 手順",
    tipNumber: "順番のある手順やランキングを表します。",
    labelQuote: "引用",
    shortcutQuote: "> 引用",
    tipQuote: "誰かの言葉や補足を引用するときに使います。",
    labelLink: "リンク",
    shortcutLink: "[文字](URL)",
    tipLink: "Webページなどのリンクを付けます。",

    // その他
    labelInlineCode: "インラインコード",
    shortcutInlineCode: "`code`",
    tipInlineCode: "選択範囲をインラインコードにします。",
    labelCodeBlock: "コードブロック",
    shortcutCodeBlock: "```code```",
    tipCodeBlock: "複数行のコードを表示します。",
    labelTable: "表",
    shortcutTable: "| 項目 | 内容 |",
    tipTable: "項目を行と列で比較・整理します。",
    labelCheck: "チェック",
    shortcutCheck: "- [ ] TODO",
    tipCheck: "作業の完了・未完了をチェックリストで管理します。",
    labelStrikethrough: "取消線",
    shortcutStrikethrough: "~~文字~~",
    tipStrikethrough: "修正前の内容や取り消した文章を示します。",
    labelDivider: "区切り",
    shortcutDivider: "---",
    tipDivider: "話題の変わり目に水平線を入れます。",

    // 挿入されるテンプレートの中身
    placeholderCode: "ここにコード",
    placeholderTodo: "やること",
    snippetTable: "| 項目 | 内容 |\n| --- | --- |\n| 例 | 説明 |",
    linkTextDefault: "リンク文字列",

    // 通知
    noticeNoMarkdownNote: "Markdownノートを開いてから使用してください。",
    noticeSidebarUnavailable: "右サイドバーを開けませんでした。",
    noticeToolbarError: "ツールバーの表示中にエラーが発生しました。",
    noticeMultilineUnsupported: "複数行選択は未対応です。1行ずつ適用してください。",
    noticeActionError: "記法の適用中にエラーが発生しました。",
    noticeSelectText: "最適化するテキストを選択してください。",
    noticeOptimized: "Markdownを最適化しました。",
    noticeOptimizeError: "最適化中にエラーが発生しました。",
  },
};

/** 指定ロケールの文言を返す。未定義キーは英語 → キー名の順にフォールバックする。 */
export function t(key: string, locale: Locale): string {
  return STRINGS[locale][key] ?? STRINGS.en[key] ?? key;
}
