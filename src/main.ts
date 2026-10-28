import { App, Modal, Notice, Plugin, PluginSettingTab, MarkdownView, ItemView, Setting, WorkspaceLeaf, getLanguage, moment, type SettingDefinition, type SettingDefinitionItem } from "obsidian";
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
import {
  DATE_FORMAT_PRESETS,
  DEFAULT_DATE_FORMAT,
  DEFAULT_TIME_FORMAT,
  MY_SNIPPET_ERROR_KEYS,
  TIME_FORMAT_PRESETS,
  addMySnippet,
  expandTemplate,
  normalizeFormat,
  normalizeMySnippets,
  offsetToLineCh,
  previewTemplate,
  removeMySnippet,
  updateMySnippet,
  type MySnippet,
  type MySnippetInput,
} from "./my-snippets";
import { DEFAULT_SECTION_ORDER, moveSection, normalizeSectionOrder } from "./section-order";
import { DEFAULT_PALETTE_OPEN_STATE, normalizePaletteOpenState, type PaletteOpenState } from "./palette-open-state";
import {
  DEFAULT_TOOLBAR_VISIBILITY,
  HEADING_LEVELS,
  HEADING_VISIBILITY_KEYS,
  TOOLBAR_VISIBILITY_KEYS_IN_ORDER,
  normalizeToolbarVisibility,
  resolveVisibleSections,
  toolbarVisibilityStringKeys,
  visibleHeadingLevels,
  type HeadingLevel,
  type SectionId,
  type ToolbarVisibilitySettings,
} from "./toolbar-visibility";

/**
 * プラグインの永続設定。
 * Optimize の各処理の on/off と、パレットの大メニュー・見出しレベルの表示は、
 * デフォルトがすべて true（既存挙動・既存の見た目と完全に同じ）。
 */
interface MarkdownEasyEditorSettings extends ToolbarVisibilitySettings {
  optimizeRemoveWikilinks: boolean;
  optimizeRemoveBlockRefs: boolean;
  optimizeStripAiIntro: boolean;
  optimizeReduceBold: boolean;
  /** ユーザーが登録したコールアウト。パレットのコールアウト欄の末尾に並ぶ。 */
  customCallouts: Array<{ type: string; label: string }>;
  /** パレットの大メニューごとの開閉状態（次に開いたときも維持する）。 */
  paletteOpenSections: PaletteOpenState;
  /** My menu のスニペット。登録順にパレットへ並ぶ。 */
  mySnippets: MySnippet[];
  /** {{date}} {{datetime}} の書式（Moment.js 形式）。 */
  snippetDateFormat: string;
  /** {{time}} {{datetime}} の書式（Moment.js 形式）。 */
  snippetTimeFormat: string;
  /** パレットの大メニューの並び順。 */
  sectionOrder: SectionId[];
  /** My menu の更新のお知らせを、既に出したか。 */
  myMenuNoticeShown: boolean;
}

const DEFAULT_SETTINGS: MarkdownEasyEditorSettings = {
  ...DEFAULT_TOOLBAR_VISIBILITY,
  optimizeRemoveWikilinks: true,
  optimizeRemoveBlockRefs: true,
  optimizeStripAiIntro: true,
  optimizeReduceBold: true,
  customCallouts: [],
  paletteOpenSections: { ...DEFAULT_PALETTE_OPEN_STATE },
  mySnippets: [],
  snippetDateFormat: DEFAULT_DATE_FORMAT,
  snippetTimeFormat: DEFAULT_TIME_FORMAT,
  sectionOrder: [...DEFAULT_SECTION_ORDER],
  myMenuNoticeShown: false,
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
  | { kind: "snippet"; id: string; template: string; symbol: string; label: string; tip: string; shortcut: string }
  | { kind: "callout"; id: string; calloutType: string; accentColor: string; titlePlaceholder: string; bodyPlaceholder: string; symbol: string; label: string; tip: string; shortcut: string };

/** 表示対象のレベルだけ見出しボタンを作る（全レベル渡せば従来と同じ H1〜H6）。 */
function buildHeadingButtons(locale: Locale, levels: ReadonlyArray<HeadingLevel>): ReadonlyArray<ToolbarAction> {
  return levels.map((level) => {
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

/** Obsidian 同梱の moment で現在日時を整形する（型定義が呼び出し形を持たないため関数型に直す）。 */
function formatNowWithMoment(format: string): string {
  const m = moment as unknown as () => { format: (f: string) => string };
  return m().format(format);
}

/** My menu のスニペットを、他のメニューと同じボタン形式に直す。説明にはテンプレートの冒頭 1 行を出す。 */
function buildMySnippetButtons(snippets: ReadonlyArray<MySnippet>): ReadonlyArray<ToolbarAction> {
  return snippets.map((snippet) => ({
    kind: "snippet" as const,
    id: `mysnippet-${snippet.id}`,
    template: snippet.template,
    symbol: "★",
    label: snippet.label,
    shortcut: previewTemplate(snippet.template),
    tip: "",
  }));
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

    const renderSection = (id: SectionId, title: string, buttons: ReadonlyArray<ToolbarAction>, onAdd?: () => void) => {
      const details = container.createEl("details", { 
        attr: { style: "margin-bottom: 10px; border: 1px solid var(--background-modifier-border); border-radius: 4px; padding: 5px;" } 
      });
      if (this.plugin.settings.paletteOpenSections[id]) details.setAttribute("open", "");
      // 開閉のたびに保存し、次にパレットを開いたときも同じ状態にする
      details.addEventListener("toggle", () => {
        if (this.plugin.settings.paletteOpenSections[id] === details.open) return;
        this.plugin.settings.paletteOpenSections[id] = details.open;
        void this.plugin.saveSettings();
      });

      const summary = details.createEl("summary", { 
        text: title, 
        attr: { style: "font-weight: bold; cursor: pointer; padding: 5px; opacity: 0.8;" } 
      });
      // 見出しの端の小さな「＋」。他のボタンから離れているので誤タップしにくい
      if (onAdd) {
        const addButton = summary.createSpan({
          text: "＋",
          attr: {
            style: "float: right; padding: 0 8px; cursor: pointer; font-weight: bold;",
            "aria-label": t("tooltipMyMenuAdd", locale),
            role: "button",
          },
        });
        addButton.addEventListener("click", (evt) => {
          // 見出しの開閉（details の標準動作）を起こさない
          evt.preventDefault();
          evt.stopPropagation();
          onAdd();
        });
      }

      const sectionContent = details.createDiv({ attr: { style: "padding: 5px 0;" } });
      
      buttons.forEach((btn) => {
        const setting = new Setting(sectionContent)
          .setName(`${btn.symbol}  ${btn.label}`)
          .setDesc(btn.tip ? `${btn.shortcut} — ${btn.tip}` : btn.shortcut)
          .addButton((button) => {
            button
              .setButtonText(t("applyButton", locale))
              .setTooltip(btn.tip ? `${btn.shortcut} — ${btn.tip}` : btn.shortcut)
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

    // 設定で非表示にした大メニュー・見出しレベルは描画しない。
    // 設定が既定（すべて表示）なら、従来と同じ4メニュー・同じ順序・同じ開閉状態になる。
    const visibleSections = resolveVisibleSections(this.plugin.settings, {
      order: this.plugin.settings.sectionOrder,
      hasSnippets: this.plugin.settings.mySnippets.length > 0,
    });
    if (visibleSections.length === 0) {
      container.createEl("p", {
        text: t("paletteAllHidden", locale),
        attr: { style: "padding: 0 10px; opacity: 0.7;" },
      });
      return;
    }

    // テーマ判定は描画時に一度だけ。CSS 変数に頼らず配色を確定させる。
    const isDarkTheme = document.body.classList.contains("theme-dark");
    for (const id of visibleSections) {
      switch (id) {
        case "headings":
          renderSection(
            id,
            t("sectionHeadings", locale),
            buildHeadingButtons(locale, visibleHeadingLevels(this.plugin.settings)),
          );
          break;
        case "basic":
          renderSection(id, t("sectionBasic", locale), buildBasicButtons(locale));
          break;
        case "more":
          renderSection(id, t("sectionMore", locale), buildMoreButtons(locale));
          break;
        case "callouts":
          renderSection(
            id,
            t("sectionCallouts", locale),
            buildCalloutButtons(locale, isDarkTheme, this.plugin.settings.customCallouts),
          );
          break;
        case "mymenu":
          renderSection(
            id,
            t("sectionMyMenu", locale),
            buildMySnippetButtons(this.plugin.settings.mySnippets),
            () => this.plugin.openMySnippetModal(),
          );
          break;
      }
    }
  }
}

/** スニペットの追加・編集ウィンドウ。パレットの「＋」と設定画面の両方から開く。 */
class MySnippetModal extends Modal {
  constructor(
    app: App,
    private readonly plugin: MarkdownEasyEditorPlugin,
    private readonly snippet: MySnippet | null,
    private readonly onSaved?: () => void,
  ) {
    super(app);
  }

  onOpen(): void {
    const locale = this.plugin.locale;
    const { contentEl } = this;
    contentEl.empty();
    this.setTitle(t(this.snippet ? "modalMySnippetEditTitle" : "modalMySnippetAddTitle", locale));

    let label = this.snippet?.label ?? "";
    let template = this.snippet?.template ?? "";

    new Setting(contentEl)
      .setName(t("modalMySnippetLabel", locale))
      .addText((text) => {
        text
          .setPlaceholder(t("settingMySnippetLabelPlaceholder", locale))
          .setValue(label)
          .onChange((value) => {
            label = value;
          });
      });

    contentEl.createDiv({ text: t("modalMySnippetTemplate", locale), cls: "setting-item-name" });
    const textarea = contentEl.createEl("textarea", {
      attr: {
        rows: "8",
        style: "width: 100%; margin: 6px 0; font-family: var(--font-monospace);",
        placeholder: t("settingMySnippetTemplatePlaceholder", locale),
      },
    });
    textarea.value = template;
    textarea.addEventListener("input", () => {
      template = textarea.value;
    });
    contentEl.createDiv({
      text: t("settingMySnippetTokensDesc", locale),
      cls: "setting-item-description",
    });

    new Setting(contentEl)
      .addButton((button) => {
        button
          .setButtonText(t("modalMySnippetSave", locale))
          .setCta()
          .onClick(async () => {
            const saved = await this.plugin.saveMySnippet(this.snippet?.id ?? null, { label, template });
            if (!saved) return;
            this.close();
            this.onSaved?.();
          });
      })
      .addButton((button) => {
        button.setButtonText(t("modalMySnippetCancel", locale)).onClick(() => this.close());
      });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

/** display() / getSettingDefinitions() の両方で共有する、1トグル分の定義。 */
interface ToggleDefinition {
  key: ToggleSettingKey;
  nameKey: string;
  descKey: string;
}

/** Optimize の4トグルの定義（表示名・説明文の i18n キーのみを持つ、ロケール非依存の静的データ）。 */
const OPTIMIZE_TOGGLE_DEFINITIONS: ReadonlyArray<ToggleDefinition> = [
  { key: "optimizeRemoveWikilinks", nameKey: "settingRemoveWikilinksName", descKey: "settingRemoveWikilinksDesc" },
  { key: "optimizeRemoveBlockRefs", nameKey: "settingRemoveBlockRefsName", descKey: "settingRemoveBlockRefsDesc" },
  { key: "optimizeStripAiIntro", nameKey: "settingStripAiIntroName", descKey: "settingStripAiIntroDesc" },
  { key: "optimizeReduceBold", nameKey: "settingReduceBoldName", descKey: "settingReduceBoldDesc" },
];

/** パレットの大メニュー4つ＋見出し H1〜H6 の表示トグル（定義の本体は toolbar-visibility.ts）。 */
const PALETTE_TOGGLE_DEFINITIONS: ReadonlyArray<ToggleDefinition> = TOOLBAR_VISIBILITY_KEYS_IN_ORDER.map((key) => ({
  key,
  ...toolbarVisibilityStringKeys(key),
}));

const HEADING_LEVEL_KEYS: ReadonlySet<string> = new Set<string>(HEADING_LEVELS.map((level) => HEADING_VISIBILITY_KEYS[level]));

/**
 * 設定タブ。今のところ通常項目は無く、めったに触らない項目だけを
 * 「Advanced customization」の折りたたみセクションにまとめている
 * （デフォルトは閉じた状態）。
 *
 * display() は Obsidian 1.13 未満向けのフォールバック実装で、
 * getSettingDefinitions() が非空配列を返すバージョンではそちらが優先され
 * display() は呼ばれない（Obsidian 公式の仕様）。両方をサポートするため、
 * トグルの定義は TOGGLE_DEFINITIONS に一本化し、二重管理を避けている。
 */
class MarkdownEasyEditorSettingTab extends PluginSettingTab {
  plugin: MarkdownEasyEditorPlugin;

  /** display() と getSettingDefinitions() が共有する、全トグル（Optimize → パレット表示の順）。 */
  private static readonly TOGGLE_DEFINITIONS: ReadonlyArray<ToggleDefinition> = [
    ...OPTIMIZE_TOGGLE_DEFINITIONS,
    ...PALETTE_TOGGLE_DEFINITIONS,
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

    // 項目が増えても縦に伸びないよう、グループごとに折りたたむ（どれも初期状態は閉じる）
    this.renderToggles(
      this.createCollapsible(content, t("settingOptimizeHeading", locale), t("settingOptimizeDesc", locale)),
      OPTIMIZE_TOGGLE_DEFINITIONS,
    );
    this.renderToggles(
      this.createCollapsible(content, t("settingPaletteDisplayHeading", locale), t("settingPaletteDisplayDesc", locale)),
      PALETTE_TOGGLE_DEFINITIONS,
    );
    this.mountCustomCallouts(this.createCollapsible(content, t("settingCustomCalloutsHeading", locale)));
    this.mountMyMenu(this.createCollapsible(content, t("settingMyMenuHeading", locale)));
    this.mountSectionOrder(this.createCollapsible(content, t("settingSectionOrderHeading", locale), t("settingSectionOrderDesc", locale)));
  }

  /** 大メニューの並べ替え（上へ／下へ）。押したあとはこの領域だけ描き直す。 */
  private mountSectionOrder(container: HTMLElement): void {
    const locale = this.plugin.locale;
    const redraw = () => {
      container.empty();
      this.mountSectionOrder(container);
    };
    const titleKeys: Record<SectionId, string> = {
      headings: "sectionHeadings",
      basic: "sectionBasic",
      more: "sectionMore",
      callouts: "sectionCallouts",
      mymenu: "sectionMyMenu",
    };
    const order = this.plugin.settings.sectionOrder;
    order.forEach((id, index) => {
      new Setting(container)
        .setName(t(titleKeys[id], locale))
        .addExtraButton((button) => {
          button
            .setIcon("arrow-up")
            .setTooltip(t("settingSectionMoveUp", locale))
            .setDisabled(index === 0)
            .onClick(async () => {
              await this.plugin.moveSectionOrder(index, -1);
              redraw();
            });
        })
        .addExtraButton((button) => {
          button
            .setIcon("arrow-down")
            .setTooltip(t("settingSectionMoveDown", locale))
            .setDisabled(index === order.length - 1)
            .onClick(async () => {
              await this.plugin.moveSectionOrder(index, 1);
              redraw();
            });
        });
    });
  }

  /** My menu の説明・一覧・追加ボタン・日時の書式を container に描画する。変更後はこの領域だけ描き直す。 */
  private mountMyMenu(container: HTMLElement): void {
    const locale = this.plugin.locale;
    const redraw = () => {
      container.empty();
      this.mountMyMenu(container);
    };

    new Setting(container).setDesc(t("settingMyMenuDesc", locale));

    const snippets = this.plugin.settings.mySnippets;
    if (snippets.length === 0) {
      new Setting(container).setDesc(t("settingMyMenuEmpty", locale));
    }
    snippets.forEach((snippet) => {
      new Setting(container)
        .setName(snippet.label)
        .setDesc(previewTemplate(snippet.template))
        .addButton((button) => {
          button.setButtonText(t("settingMySnippetEditButton", locale)).onClick(() => {
            this.plugin.openMySnippetModal(snippet, redraw);
          });
        })
        .addButton((button) => {
          button
            .setButtonText(t("settingMySnippetDeleteButton", locale))
            .setWarning()
            .onClick(async () => {
              await this.plugin.deleteMySnippet(snippet.id);
              redraw();
            });
        });
    });

    new Setting(container)
      .setName(t("settingMySnippetAddName", locale))
      .setDesc(t("settingMySnippetAddDesc", locale))
      .addButton((button) => {
        button
          .setButtonText(t("settingMySnippetAddButton", locale))
          .setCta()
          .onClick(() => this.plugin.openMySnippetModal(undefined, redraw));
      });

    new Setting(container)
      .setName(t("settingMySnippetTokensName", locale))
      .setDesc(t("settingMySnippetTokensDesc", locale));

    this.renderFormatSetting(container, "settingDateFormatName", "settingDateFormatDesc", "snippetDateFormat", DEFAULT_DATE_FORMAT, DATE_FORMAT_PRESETS);
    this.renderFormatSetting(container, "settingTimeFormatName", "settingTimeFormatDesc", "snippetTimeFormat", DEFAULT_TIME_FORMAT, TIME_FORMAT_PRESETS);
  }

  /** 書式の入力欄。現在の日時でプレビューし、プリセットボタンで入力欄へ書き込む。 */
  private renderFormatSetting(
    container: HTMLElement,
    nameKey: string,
    descKey: string,
    settingKey: "snippetDateFormat" | "snippetTimeFormat",
    fallback: string,
    presets: ReadonlyArray<string>,
  ): void {
    const locale = this.plugin.locale;
    const setting = new Setting(container).setName(t(nameKey, locale)).setDesc(t(descKey, locale));
    const preview = container.createDiv({ cls: "setting-item-description" });
    preview.setCssProps({ padding: "0 0 8px 0" });

    const showPreview = () => {
      const format = normalizeFormat(this.plugin.settings[settingKey], fallback);
      preview.setText(`${t("settingFormatPreview", locale)}${formatNowWithMoment(format)}`);
    };

    let input: { setValue: (value: string) => unknown } | null = null;
    const apply = async (value: string) => {
      this.plugin.settings[settingKey] = value;
      await this.plugin.saveSettings();
      showPreview();
    };

    setting.addText((text) => {
      input = text;
      text.setValue(this.plugin.settings[settingKey]).onChange(async (value) => {
        await apply(value);
      });
    });

    const presetRow = container.createDiv({ cls: "setting-item-description" });
    presetRow.setCssProps({ display: "flex", flexWrap: "wrap", gap: "6px", padding: "0 0 8px 0" });
    presetRow.createSpan({ text: t("settingFormatPresets", locale) });
    for (const preset of presets) {
      const btn = presetRow.createEl("button", { text: formatNowWithMoment(preset) });
      btn.addEventListener("click", () => {
        input?.setValue(preset);
        void apply(preset);
      });
    }
    showPreview();
  }

  /** display() 用：見出しをクリックで開閉できるグループを作り、中身の入れ物を返す。 */
  private createCollapsible(parent: HTMLElement, title: string, desc?: string): HTMLElement {
    const details = parent.createEl("details", { attr: { style: "margin-top: 8px;" } });
    details.createEl("summary", {
      text: title,
      attr: { style: "font-weight: bold; cursor: pointer; padding: 6px 0;" },
    });
    const body = details.createDiv();
    if (desc) new Setting(body).setDesc(desc);
    return body;
  }

  /** display() 用：トグルを1行ずつ描画する。パレットに関わるトグルは変更を即座にパレットへ反映する。 */
  private renderToggles(parent: HTMLElement, definitions: ReadonlyArray<ToggleDefinition>): void {
    const locale = this.plugin.locale;
    definitions.forEach(({ key, nameKey, descKey }) => {
      new Setting(parent)
        .setName(t(nameKey, locale))
        .setDesc(t(descKey, locale))
        .addToggle((toggle) => {
          toggle.setValue(this.plugin.settings[key]).onChange(async (value) => {
            await this.applyToggle(key, value);
          });
        });
    });
  }

  /** トグルの値を保存し、パレットの表示に関わる設定なら開いているパレットを描き直す。 */
  private async applyToggle(key: ToggleSettingKey, value: boolean): Promise<void> {
    this.plugin.settings[key] = value;
    await this.plugin.saveSettings();
    if (PALETTE_TOGGLE_DEFINITIONS.some((definition) => definition.key === key)) {
      this.plugin.refreshToolbarViews();
    }
  }

  /**
   * getSettingDefinitions() 経由（1.13+）での値の読み書き。
   * 既定の実装がどこに保存するかに頼らず、display() と同じ plugin.settings を
   * 読み書きし、パレットの表示設定は変更を即座にパレットへ反映する。
   */
  getControlValue(key: string): unknown {
    const definition = MarkdownEasyEditorSettingTab.TOGGLE_DEFINITIONS.find((d) => d.key === key);
    return definition ? this.plugin.settings[definition.key] : undefined;
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    const definition = MarkdownEasyEditorSettingTab.TOGGLE_DEFINITIONS.find((d) => d.key === key);
    if (!definition || typeof value !== "boolean") return;
    await this.applyToggle(definition.key, value);
  }

  /**
   * カスタムコールアウトの説明・一覧・追加欄を container の中に描画する。
   * 追加・削除のあとは、この container の中身だけを自分で描き直す。
   * 設定タブ全体の再描画（display() / update()）に頼らないので、
   * display() 経由でも getSettingDefinitions() の render 経由でも同じように使え、
   * 描き直しでほかのグループの開閉状態が崩れることもない。
   */
  private mountCustomCallouts(container: HTMLElement): void {
    const locale = this.plugin.locale;
    const redraw = () => {
      container.empty();
      this.mountCustomCallouts(container);
    };

    new Setting(container).setDesc(t("settingCustomCalloutsDesc", locale));

    const callouts = this.plugin.settings.customCallouts;
    if (callouts.length === 0) {
      new Setting(container).setDesc(t("settingCustomCalloutsEmpty", locale));
    }
    callouts.forEach((callout, index) => {
      new Setting(container)
        .setName(callout.label)
        .setDesc(`> [!${callout.type}]`)
        .addButton((button) => {
          button
            .setButtonText(t("settingCustomCalloutDeleteButton", locale))
            .setWarning()
            .onClick(async () => {
              await this.deleteCustomCallout(index);
              redraw();
            });
        });
    });

    this.renderAddCustomCalloutRow(new Setting(container), redraw);
  }

  /** type・label の入力欄と追加ボタンを 1 行に並べる。 */
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
   * Obsidian 1.13 以降向けの宣言的な定義。項目が増えても縦に伸びないよう、
   * 「Optimize」「パレットの表示」「カスタムコールアウト」をそれぞれ
   * 1 つのサブページにまとめている（ページ形式なので設定検索にも対応）。
   * key は this.plugin.settings のプロパティ名と一致させている。
   *
   * minAppVersion（1.8.7）より新しい API（update()・setDestructive() 等）は
   * 静的解析（no-unsupported-api）に弾かれるため使わない。カスタムコールアウトの
   * 追加・削除は render 内で自分の領域だけを描き直す（mountCustomCallouts）。
   */
  getSettingDefinitions(): SettingDefinitionItem[] {
    const locale = this.plugin.locale;
    const toToggle = ({ key, nameKey, descKey }: ToggleDefinition): SettingDefinition => ({
      name: t(nameKey, locale),
      desc: t(descKey, locale),
      control: { type: "toggle", key },
    });

    return [
      {
        type: "page",
        name: t("settingOptimizeHeading", locale),
        desc: t("settingOptimizeDesc", locale),
        items: OPTIMIZE_TOGGLE_DEFINITIONS.map(toToggle),
      },
      {
        type: "page",
        name: t("settingPaletteDisplayHeading", locale),
        desc: t("settingPaletteDisplayDesc", locale),
        items: [
          ...PALETTE_TOGGLE_DEFINITIONS.filter((d) => !HEADING_LEVEL_KEYS.has(d.key)).map(toToggle),
          {
            type: "group",
            heading: t("settingHeadingLevelsHeading", locale),
            items: PALETTE_TOGGLE_DEFINITIONS.filter((d) => HEADING_LEVEL_KEYS.has(d.key)).map(toToggle),
          },
        ],
      },
      {
        type: "page",
        name: t("settingCustomCalloutsHeading", locale),
        desc: t("settingCustomCalloutsDesc", locale),
        items: [
          {
            name: t("settingCustomCalloutsHeading", locale),
            render: (setting) => {
              const el = setting.settingEl;
              el.empty();
              el.setCssProps({ display: "block", border: "none" });
              this.mountCustomCallouts(el.createDiv());
            },
          },
        ],
      },
      {
        type: "page",
        name: t("settingMyMenuHeading", locale),
        desc: t("settingMyMenuDesc", locale),
        items: [
          {
            name: t("settingMyMenuHeading", locale),
            render: (setting) => {
              const el = setting.settingEl;
              el.empty();
              el.setCssProps({ display: "block", border: "none" });
              this.mountMyMenu(el.createDiv());
            },
          },
        ],
      },
      {
        type: "page",
        name: t("settingSectionOrderHeading", locale),
        desc: t("settingSectionOrderDesc", locale),
        items: [
          {
            name: t("settingSectionOrderHeading", locale),
            render: (setting) => {
              const el = setting.settingEl;
              el.empty();
              el.setCssProps({ display: "block", border: "none" });
              this.mountSectionOrder(el.createDiv());
            },
          },
        ],
      },
    ];
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
    // 旧バージョンの保存データにはパレット表示のキーが無い。boolean 以外の壊れた値も含め、既定（表示）に戻す
    Object.assign(this.settings, normalizeToolbarVisibility(loaded));
    this.settings.paletteOpenSections = normalizePaletteOpenState(loaded?.paletteOpenSections);
    this.settings.mySnippets = normalizeMySnippets(loaded?.mySnippets);
    this.settings.snippetDateFormat = normalizeFormat(loaded?.snippetDateFormat, DEFAULT_DATE_FORMAT);
    this.settings.snippetTimeFormat = normalizeFormat(loaded?.snippetTimeFormat, DEFAULT_TIME_FORMAT);
    this.settings.sectionOrder = normalizeSectionOrder(loaded?.sectionOrder);
    this.settings.myMenuNoticeShown = loaded?.myMenuNoticeShown === true;
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

    // My menu の更新のお知らせ。一度だけ、クリックして閉じるまで出し続ける（duration 0）。
    // 設定を一度も保存していない既存ユーザーと新規インストールは保存データだけでは区別できないため、
    // どちらにも一度だけ出す。
    if (!this.settings.myMenuNoticeShown) {
      this.app.workspace.onLayoutReady(() => {
        new Notice(t("noticeUpdatedMyMenu", this.locale), 0);
      });
      this.settings.myMenuNoticeShown = true;
      await this.saveSettings();
    }

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
      else if (action.kind === "snippet") {
        const { text, cursorOffset } = expandTemplate(action.template, {
          selection,
          formatNow: (format) => formatNowWithMoment(format),
          dateFormat: normalizeFormat(this.settings.snippetDateFormat, DEFAULT_DATE_FORMAT),
          timeFormat: normalizeFormat(this.settings.snippetTimeFormat, DEFAULT_TIME_FORMAT),
        });
        const startPos = editor.getCursor("from");
        editor.replaceSelection(text);
        if (cursorOffset !== null) {
          const pos = offsetToLineCh(text, cursorOffset);
          editor.setCursor({
            line: startPos.line + pos.line,
            ch: pos.line === 0 ? startPos.ch + pos.ch : pos.ch,
          });
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

  /** スニペットを追加（id が null）または編集する。拒否したときは理由を通知して false を返す。 */
  async saveMySnippet(id: string | null, input: MySnippetInput): Promise<boolean> {
    const result =
      id === null
        ? addMySnippet(this.settings.mySnippets, input)
        : updateMySnippet(this.settings.mySnippets, id, input);
    if (!result.ok) {
      new Notice(t(MY_SNIPPET_ERROR_KEYS[result.error], this.locale));
      return false;
    }
    this.settings.mySnippets = result.snippets;
    await this.saveSettings();
    this.refreshToolbarViews();
    return true;
  }

  async deleteMySnippet(id: string): Promise<void> {
    this.settings.mySnippets = removeMySnippet(this.settings.mySnippets, id);
    await this.saveSettings();
    this.refreshToolbarViews();
  }

  /** 大メニューを上（-1）／下（+1）へ動かす。 */
  async moveSectionOrder(index: number, direction: -1 | 1): Promise<void> {
    this.settings.sectionOrder = moveSection(this.settings.sectionOrder, index, direction);
    await this.saveSettings();
    this.refreshToolbarViews();
  }

  /** スニペットの追加・編集ウィンドウを開く。保存したら onSaved を呼ぶ。 */
  openMySnippetModal(snippet?: MySnippet, onSaved?: () => void): void {
    new MySnippetModal(this.app, this, snippet ?? null, onSaved).open();
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
