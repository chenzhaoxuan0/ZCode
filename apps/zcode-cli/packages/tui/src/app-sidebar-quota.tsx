import type { TuiCopy } from "@zcode/i18n";
import React from "react";
import { palette } from "./app-model.js";
import { SIDEBAR_CONTENT_WIDTH } from "./app-sidebar-layout.js";
import { SidebarSectionHeader } from "./app-sidebar-section-header.js";
import { displayWidth, truncateDisplay } from "./app-terminal-width.js";
import type { TuiQuotaEntry, TuiQuotaSummary } from "./types.js";

const h = React.createElement as (
  type: React.ElementType | string,
  props?: Record<string, unknown> | null,
  ...children: React.ReactNode[]
) => React.ReactElement;

const LABEL_WIDTH = 7;
const VALUE_WIDTH = SIDEBAR_CONTENT_WIDTH - LABEL_WIDTH - 1;
const ROW_STYLE = { flexShrink: 0, height: 1, truncate: true, wrapMode: "none" } as const;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function QuotaSection(props: {
  copy: TuiCopy;
  expanded: boolean;
  onToggle?: () => void;
  quota: TuiQuotaSummary | null;
}): React.ReactElement | null {
  const { copy, quota } = props;
  if (!quota) {
    return null;
  }

  return h(
    "box",
    { style: { flexDirection: "column", flexShrink: 0, marginTop: 1 } },
    SidebarSectionHeader({
      expanded: props.expanded,
      onToggle: props.onToggle,
      title: copy.sidebar.sections.quota,
    }),
    ...(props.expanded ? quotaLines(quota, copy) : []),
  );
}

function quotaLines(quota: TuiQuotaSummary, copy: TuiCopy): React.ReactNode[] {
  const lines: React.ReactNode[] = [];

  if (quota.level) {
    lines.push(
      row(copy.sidebar.quota.plan, quota.level, palette.muted, "quota-plan"),
    );
  }

  if (quota.entries.length === 0) {
    lines.push(line(copy.sidebar.quota.empty, palette.muted, "quota-empty"));
    return lines;
  }

  for (const entry of quota.entries) {
    lines.push(quotaRow(entry, copy));
  }
  return lines;
}

function quotaRow(entry: TuiQuotaEntry, copy: TuiCopy): React.ReactElement {
  const value = formatEntryValue(entry);
  return row(limitLabel(entry.limitType, copy), value, remainingColor(entry.remainingPercent), `quota-${entry.limitType}`);
}

/**
 * `剩余 93% · 2h 35m 重置`
 *
 * 只在有重置时间时才追加后缀；百分比已经是剩余口径（CLI 侧换算好的），
 * 这里绝不能再做第二次反转。
 */
function formatEntryValue(entry: TuiQuotaEntry): string {
  const percent = `${clampPercent(entry.remainingPercent)}%`;
  const reset = relativeReset(entry.resetsAt);
  return reset ? `${percent} · ${reset}` : percent;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function relativeReset(resetsAt: number | undefined): string | undefined {
  if (resetsAt === undefined || !Number.isFinite(resetsAt)) return undefined;
  const delta = resetsAt - Date.now();
  if (delta <= 0) return "now";
  const days = Math.floor(delta / DAY);
  const hours = Math.floor((delta % DAY) / HOUR);
  const minutes = Math.floor((delta % HOUR) / MINUTE);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** 服务端类型名不保证稳定，只认这两个已知的，其余走兜底标签。 */
function limitLabel(limitType: string, copy: TuiCopy): string {
  if (limitType === "TOKENS_LIMIT") return copy.sidebar.quota.tokensLimit;
  if (limitType === "TIME_LIMIT") return copy.sidebar.quota.toolsLimit;
  return copy.sidebar.quota.unknownLimit;
}

/** 剩余越少越扎眼：<=10% 红色，<=30% 黄色，宽裕时普通前景色。 */
function remainingColor(remainingPercent: number): string {
  if (remainingPercent <= 10) return palette.danger;
  return remainingPercent <= 30 ? palette.warning : palette.text;
}

function row(label: string, value: string, color: string, key: string): React.ReactElement {
  return line(
    `${padEndDisplay(label, LABEL_WIDTH)} ${truncateDisplay(value, VALUE_WIDTH)}`,
    color,
    key,
  );
}

function line(value: string, color: string, key: string): React.ReactElement {
  return h("text", { key, style: { ...ROW_STYLE, fg: color } }, value);
}

function padEndDisplay(value: string, targetCells: number): string {
  const visible = truncateDisplay(value, targetCells);
  return `${visible}${" ".repeat(Math.max(0, targetCells - displayWidth(visible)))}`;
}