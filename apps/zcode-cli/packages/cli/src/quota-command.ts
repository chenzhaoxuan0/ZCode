import {
  CODING_PLAN_QUOTA_PATH,
  codingPlanQuotaOrigin,
  CodingPlanQuotaRejectedError,
  fetchCodingPlanQuota,
  remainingPercentFromUsedPercent,
  type CodingPlanQuotaLimit,
} from "@zcode/adapters";
import { color, formatJson, supportsColor } from "@zcode/core";
import type { GlobalOptions, JsonValue, RunContext } from "@zcode/shared-types";

/**
 * `zcode quota`：查询 Coding Plan 剩余用量。
 *
 * 取数逻辑在 `@zcode/adapters` 的 `fetchCodingPlanQuota`，TUI 侧栏用的是同一个，
 * 这里只负责命令行渲染。`--json` 同时输出服务端原始 `percentage` 和推导出的
 * `remainingPercent`，因为前者是「已用占比」，直接当剩余读会搞反。
 */

const formatLocalTime = (epochMs: number): string => {
  const date = new Date(epochMs);
  const pad = (value: number): string => `${value}`.padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const formatRelative = (epochMs: number): string => {
  const deltaMs = epochMs - Date.now();
  if (!Number.isFinite(deltaMs)) {
    return "";
  }
  if (deltaMs <= 0) {
    return "now";
  }
  const totalMinutes = Math.round(deltaMs / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) {
    return `in ${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `in ${hours}h ${minutes}m`;
  }
  return `in ${minutes}m`;
};

const colorizePercent = (percent: number, enabled: boolean): string => {
  const text = `${percent}%`;
  if (percent <= 10) {
    return color.red(text, enabled);
  }
  return percent <= 30 ? color.cyan(text, enabled) : color.green(text, enabled);
};

const describeLimit = (limit: CodingPlanQuotaLimit, colorEnabled: boolean): string => {
  const parts: string[] = [];
  if (typeof limit.percentage === "number") {
    parts.push(`remaining ${colorizePercent(remainingPercentFromUsedPercent(limit.percentage), colorEnabled)}`);
  }
  if (typeof limit.remaining === "number") {
    parts.push(`left ${limit.remaining}`);
  }
  // `number` 是服务端的单位/倍率（TIME_LIMIT 里是 1），不是总额度上限，
  // 所以这里只报已用计数，不拼成 "used 100/1" 这种会误导人的比值。
  if (typeof limit.usage === "number") {
    parts.push(`used ${limit.usage}`);
  }
  if (parts.length === 0) {
    parts.push("no meter reported");
  }
  if (typeof limit.nextResetTime === "number") {
    parts.push(`resets ${formatLocalTime(limit.nextResetTime)} (${formatRelative(limit.nextResetTime)})`);
  }
  return parts.join("  ");
};

/**
 * 把额度桶转成 JSON 值。
 *
 * 不能直接展开 `...limit`：其可选字段可能是 `undefined`，而 `JsonValue` 不接受。
 * 这里逐字段挑选，既满足类型，也让 `--json` 的输出契约稳定（不会出现 `undefined` 键）。
 * `percentage` 是服务端原始的已用占比，`remainingPercent` 是换算后的剩余，两者都保留。
 */
const toJsonLimit = (limit: CodingPlanQuotaLimit): JsonValue => {
  const out: Record<string, JsonValue> = {
    type: limit.type,
    remainingPercent:
      typeof limit.percentage === "number" ? remainingPercentFromUsedPercent(limit.percentage) : null,
  };
  if (typeof limit.bucketId === "string") out.bucketId = limit.bucketId;
  if (typeof limit.period === "string") out.period = limit.period;
  if (typeof limit.unit === "number") out.unit = limit.unit;
  if (typeof limit.number === "number") out.number = limit.number;
  if (typeof limit.usage === "number") out.usage = limit.usage;
  if (typeof limit.currentValue === "number") out.currentValue = limit.currentValue;
  if (typeof limit.remaining === "number") out.remaining = limit.remaining;
  if (typeof limit.percentage === "number") out.percentage = limit.percentage;
  if (typeof limit.nextResetTime === "number") out.nextResetTime = limit.nextResetTime;
  if (limit.usageDetails) {
    out.usageDetails = limit.usageDetails.map((detail) => ({
      modelCode: detail.modelCode,
      usage: detail.usage,
      ...(detail.displayName === undefined ? {} : { displayName: detail.displayName }),
    }));
  }
  return out;
};

export const runQuotaCommand = async (ctx: RunContext, options: GlobalOptions): Promise<number> => {
  let snapshot: Awaited<ReturnType<typeof fetchCodingPlanQuota>>;
  try {
    snapshot = await fetchCodingPlanQuota();
  } catch (error) {
    // 接口拒绝与网络/解析异常要分开报：前者重试没有意义（令牌过期要重新登录、
    // 额度耗尽要等重置），后者才值得退避重试。
    if (error instanceof CodingPlanQuotaRejectedError) {
      if (options.json) {
        ctx.stdout.write(
          formatJson({ ok: false, error: "api_rejected", code: error.code, msg: error.detail }),
        );
        return 1;
      }
      ctx.stderr.write(`Quota request rejected (${error.code}): ${error.detail}\n`);
      return 1;
    }
    const reason = error instanceof Error ? error.message : String(error);
    if (options.json) {
      ctx.stdout.write(formatJson({ ok: false, error: "request_failed", reason }));
      return 1;
    }
    ctx.stderr.write(`Quota request failed: ${reason}\n`);
    return 1;
  }

  if (!snapshot) {
    const message =
      "No Coding Plan credential found. Sign in with `zcode login bigmodel` (or `zcode login zai`) first.";
    if (options.json) {
      ctx.stdout.write(formatJson({ ok: false, error: "credential_not_found" }));
      return 1;
    }
    ctx.stderr.write(`${message}\n`);
    return 1;
  }

  const { limits, level, providerFamily, providerId } = snapshot;

  if (options.json) {
    ctx.stdout.write(
      formatJson({
        ok: true,
        providerId,
        providerFamily,
        level,
        limits: limits.map(toJsonLimit),
      }),
    );
    return 0;
  }

  const colors = supportsColor(ctx.stdout, options.noColor);
  ctx.stdout.write(`${color.bold("zcode quota", colors)}\n`);
  ctx.stdout.write(`provider: ${providerId}${level ? `  level: ${level}` : ""}\n`);

  if (limits.length === 0) {
    ctx.stdout.write("no quota limits reported by the server\n");
    return 0;
  }

  const labelWidth = Math.max(...limits.map((limit) => limit.type.length));
  for (const limit of limits) {
    ctx.stdout.write(`  ${limit.type.padEnd(labelWidth)}  ${describeLimit(limit, colors)}\n`);

    for (const detail of limit.usageDetails ?? []) {
      if (!detail.usage) {
        continue;
      }
      ctx.stdout.write(`      ${(detail.displayName ?? detail.modelCode).padEnd(16)}  ${detail.usage}\n`);
    }
  }

  if (options.verbose) {
    // 只回显 providerId 和端点：完整键名里带 accountIdentity（账户 ID），不该进日志。
    ctx.stdout.write(`credential provider: ${providerId}\n`);
    ctx.stdout.write(`endpoint: ${codingPlanQuotaOrigin(providerFamily)}${CODING_PLAN_QUOTA_PATH}\n`);
  }

  return 0;
};