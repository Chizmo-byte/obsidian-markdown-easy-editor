import { Notice, Plugin, MarkdownView, ItemView, Setting, WorkspaceLeaf, getLanguage } from "obsidian";
import { processMarkdownWithStats } from "./markdown-transformer";
import { resolveLocale, t, tf, type Locale } from "./i18n";
import { buildCalloutSnippet, calloutAccentColor, calloutStringKey, CALLOUT_BUTTON_STYLE, CALLOUT_TYPES } from "./callouts";

/**
 * 記法ボタンの定義。
 * id は言語に依存しない安定した識別子で、挙動の分岐は必ず id で行う
 * （label は翻訳されるため分岐条件に使ってはいけない）。
 */
type ToolbarAction =
  | { kind: "line-prefix"; id: string; prefix: string; symbol: string; label: string; tip: string; shortcut: string }
  | { kind: "wrap"; id: string; marker: string; symbol: string; label: string; tip: string; shortcut: string }
  | { kind: "insert"; id: string; snippet: string; placeholder?: string; symbol: string; label: string; tip: string; shortcut: string }
  | { kind: "link"; id: string; symbol: string; label: string; tip: string; shortcut: string }
  | { kind: "callout"; id: string; calloutType: string; accentColor: string; titlePlaceholder: string; bodyPlaceholder: string; symbol: string; label: string; tip: string; shortcut: string };

const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;

function buildHeadingButtons(locale: Locale): ReadonlyArray<ToolbarAction> {
  return HEADING_LEVELS.map((level) => {
    const hashes = "#".repeat(level);
    return {
      kind: "line-prefix" as const,
      id: `h${level}`,
      prefix: `${hashes} `,
      symbol: hashes,
      label: t(`labelH${level}`, locale),
      shortcut: t(`shortcutH${level}`, locale),
      tip: t(`tipH${level}`, locale),
    };
  });
}

function buildBasicButtons(locale: Locale): ReadonlyArray<ToolbarAction> {
  return [
    { kind: "wrap", id: "bold", marker: "**", symbol: "**", label: t("labelBold", locale), shortcut: t("shortcutBold", locale), tip: t("tipBold", locale) },
    { kind: "wrap", id: "italic", marker: "*", symbol: "*", label: t("labelItalic", locale), shortcut: t("shortcutItalic", locale), tip: t("tipItalic", locale) },
    { kind: "line-prefix", id: "list", prefix: "- ", symbol: "-", label: t("labelList", locale), shortcut: t("shortcutList", locale), tip: t("tipList", locale) },
    { kind: "line-prefix", id: "number", prefix: "1. ", symbol: "1.", label: t("labelNumber", locale), shortcut: t("shortcutNumber", locale), tip: t("tipNumber", locale) },
    { kind: "line-prefix", id: "quote", prefix: "> ", symbol: ">", label: t("labelQuote", locale), shortcut: t("shortcutQuote", locale), tip: t("tipQuote", locale) },
    { kind: "link", id: "link", symbol: "[]()", label: t("labelLink", locale), shortcut: t("shortcutLink", locale), tip: t("tipLink", locale) },
  ];
}

function buildCalloutButtons(locale: Locale, isDarkTheme: boolean): ReadonlyArray<ToolbarAction> {
  const titlePlaceholder = t("calloutTitlePlaceholder", locale);
  const bodyPlaceholder = t("calloutBodyPlaceholder", locale);

  return CALLOUT_TYPES.map((callout) => ({
    kind: "callout" as const,
    id: `callout-${callout.type}`,
    calloutType: callout.type,
    accentColor: calloutAccentColor(callout, isDarkTheme),
    titlePlaceholder,
    bodyPlaceholder,
    symbol: "[!]",
    label: t(calloutStringKey("label", callout.type), locale),
    shortcut: `> [!${callout.type}]`,
    tip: t(calloutStringKey("tip", callout.type), locale),
  }));
}

function buildMoreButtons(locale: Locale): ReadonlyArray<ToolbarAction> {
  const codePlaceholder = t("placeholderCode", locale);
  const todoPlaceholder = t("placeholderTodo", locale);

  return [
    { kind: "insert", id: "inline-code", snippet: "`code`", placeholder: "code", symbol: "`", label: t("labelInlineCode", locale), shortcut: t("shortcutInlineCode", locale), tip: t("tipInlineCode", locale) },
    { kind: "insert", id: "code-block", snippet: `\`\`\`text\n${codePlaceholder}\n\`\`\``, placeholder: codePlaceholder, symbol: "```", label: t("labelCodeBlock", locale), shortcut: t("shortcutCodeBlock", locale), tip: t("tipCodeBlock", locale) },
    { kind: "insert", id: "table", snippet: t("snippetTable", locale), symbol: "|", label: t("labelTable", locale), shortcut: t("shortcutTable", locale), tip: t("tipTable", locale) },
    { kind: "insert", id: "check", snippet: `- [ ] ${todoPlaceholder}`, placeholder: todoPlaceholder, symbol: "[ ]", label: t("labelCheck", locale), shortcut: t("shortcutCheck", locale), tip: t("tipCheck", locale) },
    { kind: "wrap", id: "strikethrough", marker: "~~", symbol: "~~", label: t("labelStrikethrough", locale), shortcut: t("shortcutStrikethrough", locale), tip: t("tipStrikethrough", locale) },
    { kind: "insert", id: "divider", snippet: "\n---\n", symbol: "---", label: t("labelDivider", locale), shortcut: t("shortcutDivider", locale), tip: t("tipDivider", locale) },
  ];
}

const VIEW_TYPE_TOOLBAR = "markdown-easy-editor-view";

/** 記法パレットビュー */
class MarkdownToolbarView extends ItemView {
  plugin: MarkdownEasyEditorPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: MarkdownEasyEditorPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return VIEW_TYPE_TOOLBAR;
  }

  getDisplayText() {
    return "Markdown Easy Editor";
  }

  async onOpen() {
    const locale = this.plugin.locale;
    const container = this.contentEl;
    container.empty();
    container.createEl("h3", { text: t("paletteTitle", locale), attr: { style: "margin-bottom: 10px; padding: 0 10px;" } });

    const renderSection = (title: string, buttons: ReadonlyArray<ToolbarAction>, isOpen: boolean) => {
      const details = container.createEl("details", { 
        attr: { style: "margin-bottom: 10px; border: 1px solid var(--background-modifier-border); border-radius: 4px; padding: 5px;" } 
      });
      if (isOpen) details.setAttribute("open", "");

      details.createEl("summary", { 
        text: title, 
        attr: { style: "font-weight: bold; cursor: pointer; padding: 5px; opacity: 0.8;" } 
      });

      const sectionContent = details.createDiv({ attr: { style: "padding: 5px 0;" } });
      
      buttons.forEach((btn) => {
        const setting = new Setting(sectionContent)
          .setName(`${btn.symbol}  ${btn.label}`)
          .setDesc(`${btn.shortcut} — ${btn.tip}`)
          .addButton((button) => {
            button
              .setButtonText(t("applyButton", locale))
              .setTooltip(`${btn.shortcut} — ${btn.tip}`)
              .onClick(() => {
                this.plugin.applyToolbarAction(btn);
              });
          });

        // ソースモードでは挿入するまで実際の色が分からないため、
        // コールアウトだけは行の左端に種別の色を出す。角丸を落とし、
        // 12行が縦に伸びすぎないよう上下の余白も詰める。
        // ショートハンドではなく個別プロパティに important 付きで指定する。
        // テーマが .setting-item の border を !important で潰していても勝てるようにするため。
        // この分岐に入るのは kind が callout のときだけで、他セクションには一切影響しない。
        if (btn.kind === "callout") {
          const el = setting.settingEl;
          el.style.setProperty("border-left-width", CALLOUT_BUTTON_STYLE.borderLeftWidth, "important");
          el.style.setProperty("border-left-style", "solid", "important");
          el.style.setProperty("border-left-color", btn.accentColor, "important");
          el.style.setProperty("border-radius", CALLOUT_BUTTON_STYLE.borderRadius, "important");
          el.style.setProperty("padding-left", CALLOUT_BUTTON_STYLE.paddingLeft, "important");
          el.style.setProperty("padding-top", CALLOUT_BUTTON_STYLE.paddingBlock, "important");
          el.style.setProperty("padding-bottom", CALLOUT_BUTTON_STYLE.paddingBlock, "important");
        }
      });
    };

    renderSection(t("sectionHeadings", locale), buildHeadingButtons(locale), true);
    renderSection(t("sectionBasic", locale), buildBasicButtons(locale), true);
    renderSection(t("sectionMore", locale), buildMoreButtons(locale), false);
    // テーマ判定は描画時に一度だけ。CSS 変数に頼らず配色を確定させる。
    const isDarkTheme = document.body.classList.contains("theme-dark");
    renderSection(t("sectionCallouts", locale), buildCalloutButtons(locale, isDarkTheme), false);
  }
}

export default class MarkdownEasyEditorPlugin extends Plugin {
  private lastMarkdownView: MarkdownView | null = null;

  /** Obsidian の表示言語。onload 時に確定させ、UI とすべての通知で共有する。 */
  locale: Locale = "en";

  async onload(): Promise<void> {
    // getLanguage() は Obsidian 公式 API。設定中の言語の ISO コードを返し、既定は "en"。
    this.locale = resolveLocale(getLanguage());

    this.registerView(
      VIEW_TYPE_TOOLBAR,
      (leaf) => new MarkdownToolbarView(leaf, this)
    );

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        if (leaf?.view instanceof MarkdownView) {
          this.lastMarkdownView = leaf.view;
        }
      })
    );

    this.addRibbonIcon("pencil", "Markdown Easy Editor", () => {
      // activateToolbarView は内部で例外を捕捉するため、Promise は明示的に破棄する
      void this.activateToolbarView();
    });

    this.addCommand({
      id: "optimize-selected-markdown",
      name: "Optimize Selected Markdown",
      callback: () => {
        this.optimizeSelection();
      }
    });
  }

  async activateToolbarView() {
    try {
      const { workspace } = this.app;
      const currentMarkdownView = workspace.getActiveViewOfType(MarkdownView);
      if (currentMarkdownView) {
        this.lastMarkdownView = currentMarkdownView;
      }

      let leaf = workspace.getLeavesOfType(VIEW_TYPE_TOOLBAR)[0];
      if (!leaf) {
        const newLeaf = workspace.getRightLeaf(false);
        if (!newLeaf) {
          new Notice(t("noticeSidebarUnavailable", this.locale));
          return;
        }
        await newLeaf.setViewState({ type: VIEW_TYPE_TOOLBAR, active: true });
        leaf = newLeaf;
      }
      await workspace.revealLeaf(leaf);
    } catch (e) {
      console.error("Toolbar view activation error:", e);
      new Notice(t("noticeToolbarError", this.locale));
    }
  }

  applyToolbarAction(action: ToolbarAction) {
    const markdownView = this.lastMarkdownView ?? this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!markdownView) {
      new Notice(t("noticeNoMarkdownNote", this.locale));
      return;
    }

    const editor = markdownView.editor;
    const selection = editor.getSelection();
    const cursor = editor.getCursor();

    try {
      if (action.kind === "wrap") {
        const marker = action.marker;
        if (selection && selection.length > 0) {
          // 1. 選択範囲あり
          const wrapped = `${marker}${selection}${marker}`;
          
          // 現在の開始位置を記憶
          const startPos = editor.getCursor("from");
          
          editor.replaceSelection(wrapped);
          
          // 挿入後、元の選択範囲（マーカーの内側）を再選択する
          editor.setSelection(
            { line: startPos.line, ch: startPos.ch + marker.length },
            { line: startPos.line, ch: startPos.ch + marker.length + selection.length }
          );
        } else {
          // 2. 選択範囲なし
          const markerPair = `${marker}${marker}`;
          editor.replaceRange(markerPair, cursor);
          
          // カーソルをマーカーの間に配置
          editor.setCursor({
            line: cursor.line,
            ch: cursor.ch + marker.length
          });
        }
      } 
      else if (action.kind === "line-prefix") {
        const prefix = action.prefix;
        
        if (selection && selection.includes("\n")) {
          new Notice(t("noticeMultilineUnsupported", this.locale));
        }

        const lineText = editor.getLine(cursor.line);

        if (prefix === "> ") {
          const listMarkerRegex = /^(\s*(\d+\.|-|\*|\+)\s*)/;
          if (listMarkerRegex.test(lineText)) {
            const cleanedLine = lineText.replace(listMarkerRegex, "");
            editor.replaceRange(cleanedLine, { line: cursor.line, ch: 0 }, { line: cursor.line, ch: lineText.length });
          }
        }

        if (prefix.startsWith("#")) {
          const headingRegex = /^#{1,6}\s*/;
          const match = lineText.match(headingRegex);
          if (match) {
            editor.replaceRange(prefix, { line: cursor.line, ch: 0 }, { line: cursor.line, ch: match[0].length });
            editor.setCursor({ line: cursor.line, ch: prefix.length });
            if (markdownView.leaf) {
              this.app.workspace.setActiveLeaf(markdownView.leaf, { focus: true });
            }
            return;
          }
        }

        if (selection && !selection.includes("\n")) {
          const processed = prefix + selection;
          editor.replaceSelection(processed);
          editor.setCursor({ line: cursor.line, ch: prefix.length });
        } else {
          editor.replaceRange(prefix, { line: cursor.line, ch: 0 }, { line: cursor.line, ch: 0 });
          editor.setCursor({ line: cursor.line, ch: prefix.length });
        }
      } 
      else if (action.kind === "insert") {
        // インラインコードは選択範囲があれば従来どおりバッククォートで挟む
        if (action.id === "inline-code" && selection && selection.length > 0) {
          const startPos = editor.getCursor("from");
          editor.replaceSelection(`\`${selection}\``);
          editor.setSelection(
            { line: startPos.line, ch: startPos.ch + 1 },
            { line: startPos.line, ch: startPos.ch + 1 + selection.length }
          );
          if (markdownView.leaf) {
            this.app.workspace.setActiveLeaf(markdownView.leaf, { focus: true });
          }
          return;
        }

        const snippet = action.snippet;
        editor.replaceSelection(snippet);

        // プレースホルダーは翻訳されるため、位置も長さも action.placeholder から求める
        const placeholder = action.placeholder ?? "";

        if (action.id === "inline-code") {
          // 空のインラインコードはライブプレビューでカーソル位置がずれるため、
          // プレースホルダー `code` を挿入して選択状態にする
          const cursorAfter = editor.getCursor();
          const currentLine = editor.getLine(cursorAfter.line);
          const start = currentLine.lastIndexOf(`\`${placeholder}\``, cursorAfter.ch);
          if (start !== -1) {
            editor.setSelection(
              { line: cursorAfter.line, ch: start + 1 },
              { line: cursorAfter.line, ch: start + 1 + placeholder.length }
            );
          }
        } else if (action.id === "code-block") {
          const lineIdx = editor.getCursor().line;
          const targetLineIdx = lineIdx - 1;
          if (targetLineIdx >= 0) {
            const targetLine = editor.getLine(targetLineIdx);
            const start = targetLine.indexOf(placeholder);
            if (start !== -1) {
              editor.setSelection({ line: targetLineIdx, ch: start }, { line: targetLineIdx, ch: start + placeholder.length });
            }
          }
        } else if (action.id === "check") {
          const currentLine = editor.getLine(editor.getCursor().line);
          const start = currentLine.indexOf(placeholder);
          if (start !== -1) {
            editor.setSelection({ line: editor.getCursor().line, ch: start }, { line: editor.getCursor().line, ch: start + placeholder.length });
          }
        } else {
          editor.setCursor({ line: editor.getCursor().line, ch: editor.getLine(editor.getCursor().line).length });
        }
      } 
      else if (action.kind === "callout") {
        // 選択範囲があれば本文として畳み込む（選択テキストを捨てない）
        const snippet = buildCalloutSnippet(
          action.calloutType,
          action.titlePlaceholder,
          action.bodyPlaceholder,
          selection,
        );

        const startPos = editor.getCursor("from");
        editor.replaceSelection(snippet);

        // タイトルを選択状態にして、そのまま上書き入力できるようにする。
        // 挿入位置以降を探すことで、同じ語が行の手前にあっても取り違えない。
        const titleLine = editor.getLine(startPos.line);
        const start = titleLine.indexOf(action.titlePlaceholder, startPos.ch);
        if (start !== -1) {
          editor.setSelection(
            { line: startPos.line, ch: start },
            { line: startPos.line, ch: start + action.titlePlaceholder.length }
          );
        }
      }
      else if (action.kind === "link") {
        const linkText = selection || t("linkTextDefault", this.locale);
        const url = "URL";
        const result = `[${linkText}](${url})`;
        editor.replaceSelection(result);
        
        const currentLine = editor.getLine(editor.getCursor().line);
        const urlStart = currentLine.indexOf(`(${url})`) + 1;
        if (urlStart !== -1) {
          editor.setSelection(
            { line: editor.getCursor().line, ch: urlStart },
            { line: editor.getCursor().line, ch: urlStart + url.length }
          );
        }
      }
    } catch (e) {
      console.error("Toolbar action error:", e);
      new Notice(t("noticeActionError", this.locale));
    }
    
    if (markdownView.leaf) {
      this.app.workspace.setActiveLeaf(markdownView.leaf, { focus: true });
    }
  }

  optimizeSelection() {
    const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!markdownView) {
      new Notice(t("noticeNoMarkdownNote", this.locale));
      return;
    }
    const editor = markdownView.editor;
    const selection = editor.getSelection();
    if (!selection || selection.length === 0) {
      new Notice(t("noticeSelectText", this.locale));
      return;
    }

    try {
      const { text, removedIntroCount } = processMarkdownWithStats(selection, "optimize", "obsidian");
      editor.replaceSelection(text);

      // 前置き文を消したときは、黙って消さずに件数を知らせる
      if (removedIntroCount > 0) {
        const unitKey = removedIntroCount === 1 ? "introLineUnit" : "introLineUnitPlural";
        new Notice(tf("noticeOptimizedWithRemoval", this.locale, {
          count: removedIntroCount,
          unit: t(unitKey, this.locale),
        }));
      } else {
        new Notice(t("noticeOptimized", this.locale));
      }
    } catch (e) {
      console.error("Markdown optimize error:", e);
      new Notice(t("noticeOptimizeError", this.locale));
    }
  }
}
