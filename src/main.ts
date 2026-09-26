import { App, Notice, Plugin, PluginSettingTab, MarkdownView, ItemView, Setting, WorkspaceLeaf, getLanguage, type SettingDefinitionItem } from "obsidian";
import { processMarkdownWithStats } from "./markdown-transformer";
import { resolveLocale, t, tf, type Locale } from "./i18n";
import { buildCalloutSnippet, CALLOUT_BUTTON_STYLE } from "./callouts";
import {
  addCustomCallout,
  buildCalloutPaletteEntries,
  normalizeCustomCallouts,
  removeCustomCallout,
  CUSTOM_CALLOUT_ERROR_KEYS,
  type CustomCallout,
} from "./custom-callouts";

/**
 * プラグインの永続設定。
 * Optimize の各処理の on/off はデフォルトがすべて true（既存挙動と完全に同じ）。
 */
interface MarkdownEasyEditorSettings {
  optimizeRemoveWikilinks: boolean;
  optimizeRemoveBlockRefs: boolean;
  optimizeStripAiIntro: boolean;
  optimizeReduceBold: boolean;
  /** ユーザーが登録したコールアウト。パレットのコールアウト欄の末尾に並ぶ。 */
  customCallouts: Array<{ type: string; label: string }>;
}

const DEFAULT_SETTINGS: MarkdownEasyEditorSettings = {
  optimizeRemoveWikilinks: true,
  optimizeRemoveBlockRefs: true,
  optimizeStripAiIntro: true,
  optimizeReduceBold: true,
  customCallouts: [],
};

/** トグルで表示する boolean 型の設定項目だけを取り出したキー。 */
type ToggleSettingKey = {
  [K in keyof MarkdownEasyEditorSettings]: MarkdownEasyEditorSettings[K] extends boolean ? K : never;
}[keyof MarkdownEasyEditorSettings];

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

/** 既存12種類の後ろに、登録済みのカスタムコールアウトを同じボタン形式で並べる。 */
function buildCalloutButtons(
  locale: Locale,
  isDarkTheme: boolean,
  customCallouts: ReadonlyArray<CustomCallout>,
): ReadonlyArray<ToolbarAction> {
  const bodyPlaceholder = t("calloutBodyPlaceholder", locale);

  return buildCalloutPaletteEntries(locale, isDarkTheme, customCallouts).map((entry) => ({
    kind: "callout" as const,
    ...entry,
    bodyPlaceholder,
    symbol: "[!]",
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
        //
        // style.setProperty を直接叩くと審査ルール
        // obsidianmd/no-static-styles-assignment に抵触するため、
        // Obsidian が用意している setCssStyles を使う。
        // 色は種別×テーマで変わる動的な値なので、CSS クラスではなくここで指定する。
        //
        // この分岐に入るのは kind が callout のときだけで、他セクションには一切影響しない。
        if (btn.kind === "callout") {
          setting.settingEl.setCssStyles({
            borderLeftWidth: CALLOUT_BUTTON_STYLE.borderLeftWidth,
            borderLeftStyle: "solid",
            borderLeftColor: btn.accentColor,
            borderRadius: CALLOUT_BUTTON_STYLE.borderRadius,
            paddingLeft: CALLOUT_BUTTON_STYLE.paddingLeft,
            paddingTop: CALLOUT_BUTTON_STYLE.paddingBlock,
            paddingBottom: CALLOUT_BUTTON_STYLE.paddingBlock,
          });
        }
      });
    };

    renderSection(t("sectionHeadings", locale), buildHeadingButtons(locale), true);
    renderSection(t("sectionBasic", locale), buildBasicButtons(locale), true);
    renderSection(t("sectionMore", locale), buildMoreButtons(locale), false);
    // テーマ判定は描画時に一度だけ。CSS 変数に頼らず配色を確定させる。
    const isDarkTheme = document.body.classList.contains("theme-dark");
    renderSection(
      t("sectionCallouts", locale),
      buildCalloutButtons(locale, isDarkTheme, this.plugin.settings.customCallouts),
      false,
    );
  }
}

/** display() / getSettingDefinitions() の両方で共有する、1トグル分の定義。 */
interface ToggleDefinition {
  key: ToggleSettingKey;
  nameKey: string;
  descKey: string;
}

/**
 * 設定タブ。今のところ通常項目は無く、めったに触らない項目だけを
 * 「Advanced customization」の折りたたみセクションにまとめている
 * （デフォルトは閉じた状態）。
 *
 * display() は Obsidian 1.13 未満向けのフォールバック実装で、
 * getSettingDefinitions() が非空配列を返すバージョンではそちらが優先され
 * display() は呼ばれない（Obsidian 公式の仕様）。両方をサポートするため、
 * トグル4項目の定義は TOGGLE_DEFINITIONS に一本化し、二重管理を避けている。
 */
class MarkdownEasyEditorSettingTab extends PluginSettingTab {
  plugin: MarkdownEasyEditorPlugin;

  /** Optimize の4トグルの定義（表示名・説明文の i18n キーのみを持つ、ロケール非依存の静的データ）。 */
  private static readonly TOGGLE_DEFINITIONS: ReadonlyArray<ToggleDefinition> = [
    { key: "optimizeRemoveWikilinks", nameKey: "settingRemoveWikilinksName", descKey: "settingRemoveWikilinksDesc" },
    { key: "optimizeRemoveBlockRefs", nameKey: "settingRemoveBlockRefsName", descKey: "settingRemoveBlockRefsDesc" },
    { key: "optimizeStripAiIntro", nameKey: "settingStripAiIntroName", descKey: "settingStripAiIntroDesc" },
    { key: "optimizeReduceBold", nameKey: "settingReduceBoldName", descKey: "settingReduceBoldDesc" },
  ];

  constructor(app: App, plugin: MarkdownEasyEditorPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    const locale = this.plugin.locale;

    const details = containerEl.createEl("details");
    details.createEl("summary", {
      text: t("settingsAdvancedSection", locale),
      attr: { style: "font-weight: bold; cursor: pointer;" },
    });
    const content = details.createDiv({ attr: { style: "padding-top: 10px;" } });

    MarkdownEasyEditorSettingTab.TOGGLE_DEFINITIONS.forEach(({ key, nameKey, descKey }) => {
      new Setting(content)
        .setName(t(nameKey, locale))
        .setDesc(t(descKey, locale))
        .addToggle((toggle) => {
          toggle.setValue(this.plugin.settings[key]).onChange(async (value) => {
            this.plugin.settings[key] = value;
            await this.plugin.saveSettings();
          });
        });
    });

    this.renderCustomCallouts(content);
  }

  /** display() 用：カスタムコールアウトの一覧と追加欄を描画する。 */
  private renderCustomCallouts(parent: HTMLElement): void {
    const locale = this.plugin.locale;

    new Setting(parent)
      .setName(t("settingCustomCalloutsHeading", locale))
      .setDesc(t("settingCustomCalloutsDesc", locale))
      .setHeading();

    const callouts = this.plugin.settings.customCallouts;
    if (callouts.length === 0) {
      new Setting(parent).setDesc(t("settingCustomCalloutsEmpty", locale));
    }
    callouts.forEach((callout, index) => {
      new Setting(parent)
        .setName(callout.label)
        .setDesc(`> [!${callout.type}]`)
        .addButton((button) => {
          button
            .setButtonText(t("settingCustomCalloutDeleteButton", locale))
            .setWarning()
            .onClick(async () => {
              await this.deleteCustomCallout(index);
              this.display();
            });
        });
    });

    this.renderAddCustomCalloutRow(new Setting(parent), () => this.display());
  }

  /**
   * type・label の入力欄と追加ボタンを 1 行に並べる。display() と
   * getSettingDefinitions() の render の両方から使う。
   */
  private renderAddCustomCalloutRow(setting: Setting, onAdded: () => void): void {
    const locale = this.plugin.locale;
    let typeValue = "";
    let labelValue = "";

    setting
      .setName(t("settingCustomCalloutAddName", locale))
      .setDesc(t("settingCustomCalloutAddDesc", locale))
      .addText((text) => {
        text.setPlaceholder(t("settingCustomCalloutTypePlaceholder", locale)).onChange((value) => {
          typeValue = value;
        });
      })
      .addText((text) => {
        text.setPlaceholder(t("settingCustomCalloutLabelPlaceholder", locale)).onChange((value) => {
          labelValue = value;
        });
      })
      .addButton((button) => {
        button
          .setButtonText(t("settingCustomCalloutAddButton", locale))
          .setCta()
          .onClick(async () => {
            if (await this.addCustomCallout(typeValue, labelValue)) onAdded();
          });
      });
  }

  /** 検証して追加する。拒否したときは理由を Notice で伝えて false を返す。 */
  private async addCustomCallout(type: string, label: string): Promise<boolean> {
    const result = addCustomCallout(this.plugin.settings.customCallouts, { type, label });
    if (!result.ok) {
      new Notice(t(CUSTOM_CALLOUT_ERROR_KEYS[result.error], this.plugin.locale));
      return false;
    }
    this.plugin.settings.customCallouts = result.callouts;
    await this.plugin.saveSettings();
    this.plugin.refreshToolbarViews();
    return true;
  }

  private async deleteCustomCallout(index: number): Promise<void> {
    this.plugin.settings.customCallouts = removeCustomCallout(this.plugin.settings.customCallouts, index);
    await this.plugin.saveSettings();
    this.plugin.refreshToolbarViews();
  }

  /**
   * Obsidian 1.13 以降の設定検索に対応させるための宣言的な定義。
   * key は this.plugin.settings のプロパティ名と一致させており、
   * 値の読み書きは PluginSettingTab のデフォルト実装（plugin.settings を
   * 直接読み書きする）に任せている。
   */
  getSettingDefinitions(): SettingDefinitionItem[] {
    const locale = this.plugin.locale;

    const toggles = MarkdownEasyEditorSettingTab.TOGGLE_DEFINITIONS.map(
      ({ key, nameKey, descKey }): SettingDefinitionItem => ({
        name: t(nameKey, locale),
        desc: t(descKey, locale),
        control: { type: "toggle", key },
      }),
    );

    // カスタムコールアウトは件数が変わる一覧なので list で持たせ、削除は onDelete に任せる。
    // 追加欄は list の項目に混ぜると削除ボタンが付いてしまうため、別の group に置く。
    const customCallouts: SettingDefinitionItem = {
      type: "list",
      heading: t("settingCustomCalloutsHeading", locale),
      emptyState: t("settingCustomCalloutsEmpty", locale),
      items: this.plugin.settings.customCallouts.map((callout) => ({
        name: callout.label,
        desc: `> [!${callout.type}]`,
      })),
      onDelete: (index) => {
        void this.deleteCustomCallout(index).then(() => this.update());
      },
    };

    const addCustomCallout: SettingDefinitionItem = {
      type: "group",
      items: [
        {
          name: t("settingCustomCalloutAddName", locale),
          desc: t("settingCustomCalloutAddDesc", locale),
          render: (setting) => this.renderAddCustomCalloutRow(setting, () => this.update()),
        },
      ],
    };

    return [...toggles, customCallouts, addCustomCallout];
  }
}

export default class MarkdownEasyEditorPlugin extends Plugin {
  private lastMarkdownView: MarkdownView | null = null;

  /** Obsidian の表示言語。onload 時に確定させ、UI とすべての通知で共有する。 */
  locale: Locale = "en";

  /** Optimize の各処理の on/off。デフォルトはすべて true（既存挙動と完全に同じ）。 */
  settings: MarkdownEasyEditorSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    // getLanguage() は Obsidian 公式 API。設定中の言語の ISO コードを返し、既定は "en"。
    this.locale = resolveLocale(getLanguage());

    const loaded = (await this.loadData()) as Partial<MarkdownEasyEditorSettings> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded ?? {});
    // 既定値の配列を共有しないよう、また壊れた保存データを持ち込まないよう作り直す
    this.settings.customCallouts = normalizeCustomCallouts(loaded?.customCallouts);
    this.addSettingTab(new MarkdownEasyEditorSettingTab(this.app, this));

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

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /** 開いているパレットを描き直し、カスタムコールアウトの追加・削除を即座に反映する。 */
  refreshToolbarViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_TOOLBAR)) {
      if (leaf.view instanceof MarkdownToolbarView) {
        void leaf.view.onOpen();
      }
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
      const { text, removedIntroCount } = processMarkdownWithStats(selection, "optimize", "obsidian", {
        removeWikilinks: this.settings.optimizeRemoveWikilinks,
        removeBlockRefs: this.settings.optimizeRemoveBlockRefs,
        stripAiIntro: this.settings.optimizeStripAiIntro,
        reduceBold: this.settings.optimizeReduceBold,
      });
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
