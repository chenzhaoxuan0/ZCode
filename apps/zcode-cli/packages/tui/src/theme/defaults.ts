import type { UiThemeMode } from "@zcode/contracts";
import type { TuiThemeTokens } from "./types.js";

export const DEFAULT_TUI_THEME_MODE: UiThemeMode = "dark";

/**
 * 画布底色设为透明，直接透出终端自身的背景。
 *
 * 之前浅色主题用 `#f8fafc`（slate-50）、侧栏用 `#e2e8f0`（slate-200），都是偏蓝的灰，
 * 在多数终端上会被看成"雾霾蓝"。改成透明后由终端配色决定底色，也避免应用强行
 * 改写用户终端观感。
 *
 * 这里刻意**没有**改成半透明：OpenTUI 的 `setCell` 是把背景色直接写进单元格，
 * 而终端单元格本身没有"下层"可混合；混合开关 `respectAlpha` 默认 false。
 * 半透明背景要么被当成不透明色（等于没改），要么渲染成不可预期结果，不可靠。
 * 想要"侧栏比正文略浅"的层次，目前只能用不透明色，而那正是要去掉的蓝调。
 *
 * 影响范围：主内容区底板 + 侧栏底板。输入框等面板(`backgroundPanel`)、
 * 自己的消息气泡(`backgroundMessageUser`) 仍是不透明色，区域层次保持不变。
 *
 * 代价：若强制把主题设为 light、而终端本身是深色，浅色文字会失去对比度。
 * 主题默认跟随终端自动判定，正常使用不会遇到这个组合。
 */
const TRANSPARENT_BACKGROUND = "transparent";

export const DARK_TUI_THEME: TuiThemeTokens = {
  mode: "dark",
  primary: "#7dd3fc",
  secondary: "#c4b5fd",
  accent: "#7dd3fc",
  error: "#fca5a5",
  warning: "#fbbf24",
  success: "#86efac",
  info: "#93c5fd",
  text: "#e5e7eb",
  textMuted: "#94a3b8",
  selectedListItemText: "#f8fafc",
  background: TRANSPARENT_BACKGROUND,
  backgroundPanel: "#161b22",
  backgroundElement: TRANSPARENT_BACKGROUND,
  backgroundMenu: "#161b22",
  backgroundMessageUser: "#30363d",
  border: "#3b4450",
  borderActive: "#7dd3fc",
  borderSubtle: "#26313d",
  diffAdded: "#86efac",
  diffRemoved: "#fca5a5",
  diffContext: "#e5e7eb",
  diffHunkHeader: "#93c5fd",
  diffHighlightAdded: "#bbf7d0",
  diffHighlightRemoved: "#fecaca",
  diffAddedBg: "#12351e",
  diffRemovedBg: "#3b1717",
  diffContextBg: "#0f1419",
  diffLineNumber: "#94a3b8",
  diffAddedLineNumberBg: "#14532d",
  diffRemovedLineNumberBg: "#7f1d1d",
  markdownText: "#e5e7eb",
  markdownHeading: "#e5e7eb",
  markdownLink: "#7dd3fc",
  markdownLinkText: "#86efac",
  markdownCode: "#86efac",
  markdownBlockQuote: "#fbbf24",
  markdownEmph: "#fbbf24",
  markdownStrong: "#e5e7eb",
  markdownHorizontalRule: "#3b4450",
  markdownListItem: "#7dd3fc",
  markdownListEnumeration: "#7dd3fc",
  markdownImage: "#c4b5fd",
  markdownImageText: "#86efac",
  markdownCodeBlock: "#86efac",
  syntaxComment: "#94a3b8",
  syntaxKeyword: "#7dd3fc",
  syntaxFunction: "#7dd3fc",
  syntaxVariable: "#e5e7eb",
  syntaxString: "#86efac",
  syntaxNumber: "#fbbf24",
  syntaxType: "#86efac",
  syntaxOperator: "#e5e7eb",
  syntaxPunctuation: "#e5e7eb",
  thinkingOpacity: 0.68,
};

export const LIGHT_TUI_THEME: TuiThemeTokens = {
  mode: "light",
  primary: "#0369a1",
  secondary: "#7c3aed",
  accent: "#0369a1",
  error: "#b91c1c",
  warning: "#a16207",
  success: "#15803d",
  info: "#2563eb",
  text: "#111827",
  textMuted: "#64748b",
  selectedListItemText: "#0f172a",
  background: TRANSPARENT_BACKGROUND,
  backgroundPanel: "#ffffff",
  backgroundElement: TRANSPARENT_BACKGROUND,
  backgroundMenu: "#ffffff",
  backgroundMessageUser: "#e0f2fe",
  border: "#cbd5e1",
  borderActive: "#0284c7",
  borderSubtle: "#e5e7eb",
  diffAdded: "#166534",
  diffRemoved: "#991b1b",
  diffContext: "#111827",
  diffHunkHeader: "#1d4ed8",
  diffHighlightAdded: "#15803d",
  diffHighlightRemoved: "#b91c1c",
  diffAddedBg: "#dcfce7",
  diffRemovedBg: "#fee2e2",
  diffContextBg: "#f8fafc",
  diffLineNumber: "#64748b",
  diffAddedLineNumberBg: "#bbf7d0",
  diffRemovedLineNumberBg: "#fecaca",
  markdownText: "#111827",
  markdownHeading: "#111827",
  markdownLink: "#0369a1",
  markdownLinkText: "#15803d",
  markdownCode: "#15803d",
  markdownBlockQuote: "#a16207",
  markdownEmph: "#a16207",
  markdownStrong: "#111827",
  markdownHorizontalRule: "#cbd5e1",
  markdownListItem: "#0369a1",
  markdownListEnumeration: "#0369a1",
  markdownImage: "#7c3aed",
  markdownImageText: "#15803d",
  markdownCodeBlock: "#15803d",
  syntaxComment: "#64748b",
  syntaxKeyword: "#0369a1",
  syntaxFunction: "#0369a1",
  syntaxVariable: "#111827",
  syntaxString: "#15803d",
  syntaxNumber: "#a16207",
  syntaxType: "#15803d",
  syntaxOperator: "#111827",
  syntaxPunctuation: "#111827",
  thinkingOpacity: 0.72,
};

export const BUILTIN_TUI_THEMES: Record<UiThemeMode, TuiThemeTokens> = {
  dark: DARK_TUI_THEME,
  light: LIGHT_TUI_THEME,
};

