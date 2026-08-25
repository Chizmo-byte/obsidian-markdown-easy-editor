import { Notice, Plugin, MarkdownView, ItemView, Setting, WorkspaceLeaf, getLanguage } from "obsidian";
import { processMarkdown } from "./markdown-transformer";
import { resolveLocale, t, type Locale } from "./i18n";

/**
 * 記法ボタンの定義。
 * id は言語に依存しない安定した識別子で、挙動の分岐は必ず id で行う
 * （label は翻訳されるため分岐条件に使ってはいけない）。
 */
type ToolbarAction =
  | { kind: "line-prefix"; id: string; prefix: string; symbol: string; label: string; tip: string; shortcut: string }
  | { kind: "wrap"; id: string; marker: string; symbol: string; label: string; tip: string; shortcut: string }
  | { kind: "insert"; id: string; snippet: string; placeholder?: string; symbol: string; label: string; tip: string; shortcut: string }
  | { kind: "link"; id: string; symbol: string; label: string; tip: string; shortcut: string };

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
        new Setting(sectionContent)
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
      });
    };

    renderSection(t("sectionHeadings", locale), buildHeadingButtons(locale), true);
    renderSection(t("sectionBasic", locale), buildBasicButtons(locale), true);
    renderSection(t("sectionMore", locale), buildMoreButtons(locale), false);
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
      const optimizedText = processMarkdown(selection, "optimize", "obsidian");
      editor.replaceSelection(optimizedText);
      new Notice(t("noticeOptimized", this.locale));
    } catch (e) {
      console.error("Markdown optimize error:", e);
      new Notice(t("noticeOptimizeError", this.locale));
    }
  }
}
