/**
 * 表示言語の判定と、UI 文言の辞書。
 * Obsidian の表示言語設定に追随し、日本語以外は英語にフォールバックする。
 *
 * このモジュールは obsidian パッケージに依存させないこと。
 * obsidian は型定義のみのパッケージで実行時に解決できないため、依存させると
 * Node 上のユニットテストからロードできなくなる。表示言語の取得（getLanguage）は
 * main.ts 側で行い、ここには ISO コードを受け取る純粋な判定関数だけを置く。
 */

export type Locale = "en" | "ja";

/**
 * Obsidian の言語 ISO コードを、辞書が持つロケールへ写像する。
 * `ja` / `ja-JP` などは日本語、それ以外はすべて英語にフォールバックする。
 */
export function resolveLocale(languageCode: string): Locale {
  return languageCode.startsWith("ja") ? "ja" : "en";
}

export const STRINGS: Record<Locale, Record<string, string>> = {
  en: {
    // パネル共通
    paletteTitle: "Markdown syntax palette",
    applyButton: "Apply",
    sectionHeadings: "Headings",
    sectionBasic: "Basic",
    sectionMore: "More",
    sectionCallouts: "Callouts",

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

    // コールアウト（表示順は callouts.ts の CALLOUT_TYPES に合わせる）
    labelCalloutNote: "Note",
    tipCalloutNote: "For general supplementary information.",
    labelCalloutTip: "Tip",
    tipCalloutTip: "For a handy trick or a recommendation.",
    labelCalloutImportant: "Important",
    tipCalloutImportant: "For a point you want to stand out.",
    labelCalloutWarning: "Warning",
    tipCalloutWarning: "For something the reader should be careful about.",
    labelCalloutDanger: "Danger",
    tipCalloutDanger: "For risky steps that could cause loss or damage.",
    labelCalloutInfo: "Info",
    tipCalloutInfo: "For extra background worth knowing.",
    labelCalloutSuccess: "Success",
    tipCalloutSuccess: "For a result that worked, or the recommended approach.",
    labelCalloutQuestion: "Question",
    tipCalloutQuestion: "For open questions and points still under discussion.",
    labelCalloutExample: "Example",
    tipCalloutExample: "For concrete examples and samples.",
    // 「基本」セクションの Link/Quote ボタンと区別するため "block" を付けている
    labelCalloutQuote: "Quote block",
    tipCalloutQuote: "For quoting a source or someone else's words.",
    labelCalloutAbstract: "Abstract",
    tipCalloutAbstract: "For a summary of the key points up front.",
    labelCalloutBug: "Bug",
    tipCalloutBug: "For known defects and reproduction notes.",

    // 挿入されるテンプレートの中身
    placeholderCode: "your code here",
    placeholderTodo: "To-do",
    snippetTable: "| Item | Details |\n| --- | --- |\n| Example | Description |",
    linkTextDefault: "link text",
    calloutTitlePlaceholder: "Title",
    calloutBodyPlaceholder: "Body text here",

    // 通知
    noticeNoMarkdownNote: "Open a Markdown note to use this command.",
    noticeSidebarUnavailable: "Could not open the right sidebar.",
    noticeToolbarError: "Something went wrong while opening the toolbar.",
    noticeMultilineUnsupported:
      "Multi-line selection is not supported. Apply to one line at a time.",
    noticeActionError: "Something went wrong while applying the formatting.",
    noticeSelectText: "Select some text to optimize.",
    noticeOptimized: "Markdown optimized.",
    noticeOptimizedWithRemoval: "Markdown optimized ({count} intro {unit} removed).",
    introLineUnit: "line",
    introLineUnitPlural: "lines",
    noticeOptimizeError: "Something went wrong while optimizing.",
  },

  ja: {
    // パネル共通
    paletteTitle: "Markdown 記法パレット",
    applyButton: "適用",
    sectionHeadings: "見出し",
    sectionBasic: "基本",
    sectionMore: "その他",
    sectionCallouts: "コールアウト",

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

    // コールアウト（表示順は callouts.ts の CALLOUT_TYPES に合わせる）
    labelCalloutNote: "ノート",
    tipCalloutNote: "一般的な補足情報に使います。",
    labelCalloutTip: "ヒント",
    tipCalloutTip: "ちょっとしたコツやおすすめを伝える時に使います。",
    labelCalloutImportant: "重要",
    tipCalloutImportant: "特に強調して伝えたい要点に使います。",
    labelCalloutWarning: "警告",
    tipCalloutWarning: "注意喚起したい内容に使います。",
    labelCalloutDanger: "危険",
    tipCalloutDanger: "事故や損失につながる危険な操作に使います。",
    labelCalloutInfo: "参考情報",
    tipCalloutInfo: "知っておくと役立つ補助的な情報に使います。",
    labelCalloutSuccess: "成功",
    tipCalloutSuccess: "うまくいった結果や推奨されるやり方に使います。",
    labelCalloutQuestion: "疑問",
    tipCalloutQuestion: "疑問点や検討中の論点を書き留める時に使います。",
    labelCalloutExample: "例",
    tipCalloutExample: "具体例やサンプルを示す時に使います。",
    // 「基本」セクションの「引用」ボタンと区別するため「ボックス」を付けている
    labelCalloutQuote: "引用ボックス",
    tipCalloutQuote: "出典のある引用や他者の発言に使います。",
    labelCalloutAbstract: "要約",
    tipCalloutAbstract: "冒頭に要点をまとめる時に使います。",
    labelCalloutBug: "不具合メモ",
    tipCalloutBug: "既知の不具合や再現手順のメモに使います。",

    // 挿入されるテンプレートの中身
    placeholderCode: "ここにコード",
    placeholderTodo: "やること",
    snippetTable: "| 項目 | 内容 |\n| --- | --- |\n| 例 | 説明 |",
    linkTextDefault: "リンク文字列",
    calloutTitlePlaceholder: "タイトル",
    calloutBodyPlaceholder: "本文をここに入力",

    // 通知
    noticeNoMarkdownNote: "Markdownノートを開いてから使用してください。",
    noticeSidebarUnavailable: "右サイドバーを開けませんでした。",
    noticeToolbarError: "ツールバーの表示中にエラーが発生しました。",
    noticeMultilineUnsupported: "複数行選択は未対応です。1行ずつ適用してください。",
    noticeActionError: "記法の適用中にエラーが発生しました。",
    noticeSelectText: "最適化するテキストを選択してください。",
    noticeOptimized: "Markdownを最適化しました。",
    noticeOptimizedWithRemoval: "Markdownを最適化しました（前置き文を{count}{unit}削除）。",
    introLineUnit: "行",
    introLineUnitPlural: "行",
    noticeOptimizeError: "最適化中にエラーが発生しました。",
  },
};

/** 指定ロケールの文言を返す。未定義キーは英語 → キー名の順にフォールバックする。 */
export function t(key: string, locale: Locale): string {
  return STRINGS[locale][key] ?? STRINGS.en[key] ?? key;
}

/**
 * 文言中の `{name}` を vars の値で差し替えて返す。
 * 語順が言語によって変わるため、文字列連結ではなくテンプレートで持たせている。
 * vars に無いプレースホルダーはそのまま残す（欠落に気づけるようにするため）。
 */
export function tf(
  key: string,
  locale: Locale,
  vars: Record<string, string | number>,
): string {
  return t(key, locale).replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}
