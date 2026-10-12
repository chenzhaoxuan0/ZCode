import { fetchCodingPlanQuota, remainingPercentFromUsedPercent } from "@zcode/adapters";
import type { TuiGetCodingPlanQuota, TuiQuotaEntry, TuiQuotaSummary } from "@zcode/tui";

/**
 * 给 TUI 侧栏提供额度数据。
 *
 * 服务端每个额度桶的 `percentage` 是「已用占比」，这里换算成剩余再交给界面。
 *
 * 排序按「重置时间由近到远」：先看到的是很快会变、马上会影响能否继续干活的那个。
 * 之前取「剩余最少」会让一个 8 天后才重置的耗尽额度长期霸占首行，显示一个不动的
 * 0% 反而掩盖了真正要紧的那个，所以改成按恢复时间排。
 */
export const createCodingPlanQuotaLoader = (): TuiGetCodingPlanQuota => {
  return async (): Promise<TuiQuotaSummary | null> => {
    const snapshot = await fetchCodingPlanQuota();
    if (!snapshot) {
      return null;
    }

    const entries: TuiQuotaEntry[] = snapshot.limits
      .filter((limit): limit is typeof limit & { percentage: number } =>
        typeof limit.percentage === "number",
      )
      .map((limit) => ({
        limitType: limit.type,
        remainingPercent: remainingPercentFromUsedPercent(limit.percentage),
        ...(typeof limit.nextResetTime === "number" ? { resetsAt: limit.nextResetTime } : {}),
      }))
      .sort((left, right) => {
        // 没有重置时间的排在最后，不去和有时效的额度争首行。
        if (left.resetsAt === undefined) return right.resetsAt === undefined ? 0 : 1;
        if (right.resetsAt === undefined) return -1;
        return left.resetsAt - right.resetsAt;
      });

    if (entries.length === 0) {
      return null;
    }
    return { level: snapshot.level, entries };
  };
};