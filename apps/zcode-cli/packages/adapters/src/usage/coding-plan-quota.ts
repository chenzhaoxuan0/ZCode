import { readFile } from "node:fs/promises";
import { createSharedZCodeCredentialStore, resolveSharedZCodeCredentialsPath } from "../auth/index.js";

/**
 * Coding Plan 剩余用量查询（服务端 `/api/monitor/usage/quota/limit`）。
 *
 * 桌面端走 `packages/services` 的 `BigModelUsageQuotaProvider`，但 CLI 的 TUI 不依赖服务层，
 * 所以这里提供一份轻量实现共用：`zcode quota` 子命令和 TUI 状态栏都从这里取数，保证口径一致。
 */

const QUOTA_PATH = "/api/monitor/usage/quota/limit";
const QUOTA_REQUEST_TIMEOUT_MS = 15_000;

/** Coding Plan api-key 的凭证键前缀，见 bootstrap/src/app/standalone-account-provider-runtime.ts。 */
const CODING_PLAN_KEY_PREFIX = "account-provider:coding-plan:";

export type CodingPlanProviderFamily = "bigmodel" | "zai";

export interface CodingPlanQuotaUsageDetail {
  modelCode: string;
  displayName?: string;
  usage: number;
}

export interface CodingPlanQuotaLimit {
  type: string;
  bucketId?: string;
  period?: string;
  unit?: number;
  number?: number;
  usage?: number;
  currentValue?: number;
  remaining?: number;
  percentage?: number;
  nextResetTime?: number;
  /** 服务端可能整体省略该字段（TOKENS_LIMIT 就是如此），消费方不能假设它存在。 */
  usageDetails?: CodingPlanQuotaUsageDetail[];
}

export interface CodingPlanQuotaSnapshot {
  level: string | null;
  limits: CodingPlanQuotaLimit[];
  providerFamily: CodingPlanProviderFamily;
  providerId: string;
}

export interface CodingPlanQuotaCredential {
  apiKey: string;
  providerFamily: CodingPlanProviderFamily;
  providerId: string;
}

/**
 * `percentage` 是服务端口径的**已用占比**，不是剩余占比。
 *
 * `packages/shared/src/usage-quota.ts` 的 `UsageMcpQuotaSnapshot.aggregate` 注释写明
 * 「percentage 沿用 quota 接口口径：已使用占比，展示端负责反转成剩余」，而桌面端
 * `bigmodelUsageQuotaProvider` 的 Z.ai Start Plan 分支自己算的却是 `remaining / total`。
 * 同名字段两套语义，这里只在本接口口径下反转，并保留原始值供核对。
 */
export const remainingPercentFromUsedPercent = (usedPercent: number): number =>
  Math.max(0, Math.min(100, 100 - usedPercent));

const readProviderFamily = (segment: string): CodingPlanProviderFamily | null =>
  segment.startsWith("bigmodel") ? "bigmodel" : segment.startsWith("zai") ? "zai" : null;

const quotaOrigin = (family: CodingPlanProviderFamily): string =>
  family === "bigmodel" ? "https://open.bigmodel.cn" : "https://api.z.ai";

export const codingPlanQuotaOrigin = quotaOrigin;
export const CODING_PLAN_QUOTA_PATH = QUOTA_PATH;

/**
 * 解析凭证键里的 providerId。
 *
 * 桌面端与 CLI 写入的键格式并不一致：
 * - CLI `standaloneAccountProviderCredentialKey`：`account-provider:coding-plan:${providerId}:account:${identity}:api-key`
 * - 桌面端 `accountProviderCredentialKey`：多一层 `account:` 前缀
 *
 * 同一个 credentials.json 里两种格式可能并存（谁最后写入谁生成），所以不按下标取，
 * 而是逐段扫描第一个能识别出 provider 家族的那一段。
 */
const credentialKeyFamily = (
  key: string,
): { providerFamily: CodingPlanProviderFamily; providerId: string } | null => {
  if (!key.startsWith(CODING_PLAN_KEY_PREFIX) || !key.endsWith(":api-key")) {
    return null;
  }
  const segments = key.slice(CODING_PLAN_KEY_PREFIX.length, key.length - ":api-key".length).split(":");
  for (const segment of segments) {
    const providerFamily = readProviderFamily(segment);
    if (providerFamily) {
      return { providerFamily, providerId: segment };
    }
  }
  return null;
};

/**
 * 找出可用于查配额的 Coding Plan api-key。
 *
 * credentials.json 里可能同时存在个人/团队以及两种 key 格式的条目，这里逐个尝试解密，
 * 第一个能解出非空 key 的即采用；个人套餐优先于团队套餐（团队额度通常是共享的）。
 */
export const resolveCodingPlanQuotaCredential = async (): Promise<CodingPlanQuotaCredential | null> => {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(resolveSharedZCodeCredentialsPath(), "utf8"));
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) {
    return null;
  }

  const isTeam = (key: string): number =>
    credentialKeyFamily(key)?.providerId.includes("team") ? 1 : 0;
  const candidates = Object.keys(raw as Record<string, unknown>)
    .filter((key) => credentialKeyFamily(key) !== null)
    .sort((left, right) => isTeam(left) - isTeam(right));

  const store = createSharedZCodeCredentialStore();
  for (const key of candidates) {
    const identity = credentialKeyFamily(key);
    if (!identity) {
      continue;
    }
    // 解密走 auth 模块里现成的 cipher，CLI 与桌面端算法一致。
    const apiKey = await store.load(key).catch(() => null);
    if (apiKey && apiKey.length > 0) {
      return { apiKey, ...identity };
    }
  }
  return null;
};

type QuotaResponse = {
  code: number;
  msg?: string;
  data?: { limits?: CodingPlanQuotaLimit[]; level?: string | null };
};

/**
 * 服务端明确拒绝（鉴权失效、套餐失效等）。
 *
 * 单独一个类型是为了让调用方能把「接口拒绝」和「网络/解析异常」分开：前者重试没有意义
 * （令牌过期要重新登录，额度耗尽要等重置），后者才值得退避重试。
 */
export class CodingPlanQuotaRejectedError extends Error {
  constructor(
    readonly code: number,
    readonly detail: string,
  ) {
    super(`quota request rejected (${code}): ${detail}`);
    this.name = "CodingPlanQuotaRejectedError";
  }
}

/**
 * 拉取一次 Coding Plan 配额。
 *
 * 返回 `null` 表示当前没有可用的 Coding Plan 凭证（未登录或未开通套餐），
 * 这属于正常状态而不是错误；网络/接口异常会抛给调用方决定如何呈现。
 */
export const fetchCodingPlanQuota = async (): Promise<CodingPlanQuotaSnapshot | null> => {
  const credential = await resolveCodingPlanQuotaCredential();
  if (!credential) {
    return null;
  }

  const response = await fetch(`${quotaOrigin(credential.providerFamily)}${QUOTA_PATH}`, {
    headers: { Authorization: `Bearer ${credential.apiKey}` },
    signal: AbortSignal.timeout(QUOTA_REQUEST_TIMEOUT_MS),
  });

  const body = (await response.json()) as QuotaResponse;
  if (body.code !== 200) {
    throw new CodingPlanQuotaRejectedError(body.code, body.msg ?? "unknown error");
  }

  return {
    level: body.data?.level ?? null,
    limits: body.data?.limits ?? [],
    providerFamily: credential.providerFamily,
    providerId: credential.providerId,
  };
};