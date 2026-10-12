import { useEffect, useState } from "react";
import type { TuiGetCodingPlanQuota, TuiQuotaSummary } from "./types.js";

/**
 * 额度变化远慢于 MCP 状态，5 分钟轮询一次足够；
 * 失败后退避到 30 秒，避免网络不通时把终端刷满错误。
 */
const QUOTA_REFRESH_INTERVAL_MS = 5 * 60_000;
const QUOTA_RETRY_INTERVAL_MS = 30_000;

export type QuotaStatus = {
  failed: boolean;
  summary?: TuiQuotaSummary;
};

/**
 * 拉取 Coding Plan 额度用于侧栏分区。
 *
 * 与 `useMcpSidebarStatus` 同构，但刻意**不把错误暴露到界面**：
 * 配额是锦上添花的信息，取不到就安静地不显示，而不是在用户干活时弹错误。
 */
export function useQuotaStatus(
  getCodingPlanQuota: TuiGetCodingPlanQuota | undefined,
): QuotaStatus {
  const [status, setStatus] = useState<QuotaStatus>({ failed: false });

  useEffect(() => {
    if (!getCodingPlanQuota) {
      setStatus({ failed: false });
      return;
    }
    const loadQuota = getCodingPlanQuota;

    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function scheduleRefresh(delayMs: number) {
      timer = setTimeout(() => {
        void refresh();
      }, delayMs);
    }

    async function refresh() {
      try {
        const summary = await loadQuota();
        if (disposed) return;
        setStatus({ summary: summary ?? undefined, failed: false });
        scheduleRefresh(QUOTA_REFRESH_INTERVAL_MS);
      } catch {
        if (disposed) return;
        // 静默退避：分区消失即可，不必告诉用户为什么。
        setStatus({ failed: true });
        scheduleRefresh(QUOTA_RETRY_INTERVAL_MS);
      }
    }

    void refresh();

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
    };
  }, [getCodingPlanQuota]);

  return status;
}