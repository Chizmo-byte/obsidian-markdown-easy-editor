import { Notice, Plugin, MarkdownView, ItemView, Setting } from "obsidian";
import { processMarkdown } from "./markdown-transformer";

/** 記法ボタンの定義 */
type ToolbarAction =
  | { kind: "line-prefix"; prefix: string; symbol: string; label: string; tip: string; shortcut: string }
  | { kind: "wrap"; marker: string; symbol: string; label: string; tip: string; shortcut: string }
  | { kind: "insert"; snippet: string; symbol: string; label: string; tip: string; shortcut: string }
  | { kind: "link"; symbol: string; label: string; tip: string; shortcut: string };

const HEADING_BUTTONS: ReadonlyArray<ToolbarAction> = [
  { kind: "line-prefix", prefix: "# ", symbol: "#", label: "H1", shortcut: "# 見出し1", tip: "最上位の見出しです。" },
  { kind: "line-prefix", prefix: "## ", symbol: "##", label: "H2", shortcut: "## 見出し2", tip: "中見出しです。" },
  { kind: "line-prefix", prefix: "### ", symbol: "###", label: "H3", shortcut: "### 見出し3", tip: "小見出しです。" },
  { kind: "line-prefix", prefix: "#### ", symbol: "####", label: "H4", shortcut: "#### 見出し4", tip: "さらに小さい見出しです。" },
  { kind: "line-prefix", prefix: "##### ", symbol: "#####", label: "H5", shortcut: "##### 見出し5", tip: "詳細な見出しです。" },
  { kind: "line-prefix", prefix: "###### ", symbol: "######", label: "H6", shortcut: "###### 見出し6", tip: "最小の見出しです。" },
];

const BASIC_BUTTONS: ReadonlyArray<ToolbarAction> = [
  { kind: "wrap", marker: "**", symbol: "**", label: "太字", shortcut: "**文字**", tip: "重要な言葉を目立たせます。選択範囲を太字にできます。" },
  { kind: "wrap", marker: "*", symbol: "*", label: "斜体", shortcut: "*文字*", tip: "軽く強調したい言葉に使います。" },
  { kind: "line-prefix", prefix: "- ", symbol: "-", label: "リスト", shortcut: "- 項目", tip: "項目を並べます。選択した複数行にも適用できます。" },
  { kind: "line-prefix", prefix: "1. ", symbol: "1.", label: "番号", shortcut: "1. 手順", tip: "順番のある手順やランキングを表します。" },
  { kind: "line-prefix", prefix: "> ", symbol: ">", label: "引用", shortcut: "> 引用", tip: "誰かの言葉や補足を引用するときに使います。" },
  { kind: "link", symbol: "[]()", label: "リンク", shortcut: "[文字](URL)", tip: "Webページなどのリンクを付けます。" },
];

const MORE_BUTTONS: ReadonlyArray<ToolbarAction> = [
  { kind: "insert", snippet: "`code`", symbol: "`", label: "インラインコード", shortcut: "`code`", tip: "選択範囲をインラインコードにします。" },
  { kind: "insert", snippet: "```text\nここにコード\n```", symbol: "```", label: "コードブロック", shortcut: "```code```", tip: "複数行のコードを表示します。" },
  { kind: "insert", snippet: "| 項目 | 内容 |\n| --- | --- |\n| 例 | 説明 |", symbol: "|", label: "表", shortcut: "| 項目 | 内容 |", tip: "項目を行と列で比較・整理します。" },
  { kind: "insert", snippet: "- [ ] やること", symbol: "[ ]", label: "チェック", shortcut: "- [ ] TODO", tip: "作業の完了・未完了をチェックリストで管理します。" },
  { kind: "wrap", marker: "~~", symbol: "~~", label: "取消線", shortcut: "~~文字~~", tip: "修正前の内容や取り消した文章を示します。" },
  { kind: "insert", snippet: "\n---\n", symbol: "---", label: "区切り", shortcut: "---", tip: "話題の変わり目に水平線を入れます。" },
];

const VIEW_TYPE_TOOLBAR = "markdown-easy-editor-view";

/** 記法パレットビュー */
class MarkdownToolbarView extends ItemView {
  plugin: MarkdownEasyEditorPlugin;

  constructor(app: any, plugin: MarkdownEasyEditorPlugin) {
    super(app);
    this.plugin = plugin;
  }

  getViewType() {
    return VIEW_TYPE_TOOLBAR;
  }

  getDisplayText() {
    return "Markdown Easy Editor";
  }

  async onOpen() {
    const container = this.contentEl;
    container.empty();
    container.createEl("h3", { text: "Markdown 記法パレット", attr: { style: "margin-bottom: 10px; padding: 0 10px;" } });

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
              .setButtonText("適用")
              .setTooltip(`${btn.shortcut} — ${btn.tip}`)
              .onClick(() => {
                this.plugin.applyToolbarAction(btn);
              });
          });
      });
    };

    renderSection("見出し", HEADING_BUTTONS, true);
    renderSection("基本", BASIC_BUTTONS, true);
    renderSection("その他", MORE_BUTTONS, false);
  }
}

export default class MarkdownEasyEditorPlugin extends Plugin {
  private lastMarkdownView: MarkdownView | null = null;

  async onload(): Promise<void> {
    this.registerView(
      VIEW_TYPE_TOOLBAR,
      (app) => new MarkdownToolbarView(app, this)
    );

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        if (leaf?.view instanceof MarkdownView) {
          this.lastMarkdownView = leaf.view;
        }
      })
    );

    this.addRibbonIcon("pencil", "Markdown Easy Editor", () => {
      this.activateToolbarView();
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
          new Notice("右サイドバーを開けませんでした。");
          return;
        }
        await newLeaf.setViewState({ type: VIEW_TYPE_TOOLBAR, active: true });
        leaf = newLeaf;
      }
      workspace.revealLeaf(leaf);
    } catch (e) {
      console.error("Toolbar view activation error:", e);
      new Notice("ツールバーの表示中にエラーが発生しました。");
    }
  }

  applyToolbarAction(action: ToolbarAction) {
    const markdownView = this.lastMarkdownView ?? this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!markdownView) {
      new Notice("Markdownノートを開いてから使用してください。");
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
          new Notice("複数行選択は未対応です。1行ずつ適用してください。");
        }

        const lineText = editor.getLine(cursor.line);

        if (prefix === "> ") {
          const listMarkerRegex = /^(\s*(\d+\.|\-|\*|\+)\s*)/;
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
        if (action.label === "インラインコード" && selection && selection.length > 0) {
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

        if (action.label === "インラインコード") {
          // 空のインラインコードはライブプレビューでカーソル位置がずれるため、
          // プレースホルダー `code` を挿入して選択状態にする
          const cursorAfter = editor.getCursor();
          const currentLine = editor.getLine(cursorAfter.line);
          const start = currentLine.lastIndexOf("`code`", cursorAfter.ch);
          if (start !== -1) {
            editor.setSelection(
              { line: cursorAfter.line, ch: start + 1 },
              { line: cursorAfter.line, ch: start + 5 }
            );
          }
        } else if (action.label === "コードブロック") {
          const lineIdx = editor.getCursor().line;
          const targetLineIdx = lineIdx - 1; 
          if (targetLineIdx >= 0) {
            const targetLine = editor.getLine(targetLineIdx);
            const start = targetLine.indexOf("ここにコード");
            if (start !== -1) {
              editor.setSelection({ line: targetLineIdx, ch: start }, { line: targetLineIdx, ch: start + 6 });
            }
          }
        } else if (action.label === "チェック") {
          const currentLine = editor.getLine(editor.getCursor().line);
          const start = currentLine.indexOf("やること");
          if (start !== -1) {
            editor.setSelection({ line: editor.getCursor().line, ch: start }, { line: editor.getCursor().line, ch: start + 4 });
          }
        } else {
          editor.setCursor({ line: editor.getCursor().line, ch: editor.getLine(editor.getCursor().line).length });
        }
      } 
      else if (action.kind === "link") {
        const linkText = selection || "リンク文字列";
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
      new Notice("記法の適用中にエラーが発生しました。");
    }
    
    if (markdownView.leaf) {
      this.app.workspace.setActiveLeaf(markdownView.leaf, { focus: true });
    }
  }

  optimizeSelection() {
    const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!markdownView) {
      new Notice("Markdownノートを開いてから使用してください。");
      return;
    }
    const editor = markdownView.editor;
    const selection = editor.getSelection();
    if (!selection || selection.length === 0) {
      new Notice("最適化するテキストを選択してください。");
      return;
    }

    try {
      const optimizedText = processMarkdown(selection, "optimize", "obsidian");
      editor.replaceSelection(optimizedText);
      new Notice("Markdownを最適化しました。");
    } catch (e) {
      console.error("Markdown optimize error:", e);
      new Notice("最適化中にエラーが発生しました。");
    }
  }
}
