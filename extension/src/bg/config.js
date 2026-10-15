// 使用者設定（設定頁編輯，見 T07），存在 chrome.storage.local 的 "config"。
import { parseBlacklist } from "../lib/exclude.js";

export const DEFAULT_CONFIG = Object.freeze({
  collectorUrl: "http://127.0.0.1:8787",
  token: "",
  intervalMinutes: 30, // 15–120
  sweeper: "mac-mini",
  sweepEnabled: true, // 巡檢總開關：關閉時鬧鐘不巡檢，「立即巡檢」仍可手動執行
  enabled: {}, // { [platformId]: false } 代表停用；未列出的平台預設啟用
  projectBlacklist: [], // 不記錄的平台專案（名稱或 ID），見 T16
});

/** 補上預設值並把欄位整理成合法範圍（設定頁儲存與讀取共用） */
export function normalizeConfig(input = {}) {
  const merged = { ...DEFAULT_CONFIG, ...input };
  const url = String(merged.collectorUrl ?? "").trim().replace(/\/+$/, "");
  return {
    ...merged,
    collectorUrl: url || DEFAULT_CONFIG.collectorUrl,
    token: String(merged.token ?? "").trim(),
    intervalMinutes: Math.min(120, Math.max(15, Math.round(Number(merged.intervalMinutes)) || 30)),
    sweeper: String(merged.sweeper ?? "").trim() || DEFAULT_CONFIG.sweeper,
    sweepEnabled: merged.sweepEnabled !== false,
    enabled: { ...(merged.enabled ?? {}) },
    projectBlacklist: parseBlacklist(Array.isArray(merged.projectBlacklist) ? merged.projectBlacklist.join("\n") : merged.projectBlacklist),
  };
}

export async function loadConfig(storage) {
  const { config } = await storage.get("config");
  return normalizeConfig(config ?? {});
}

export function isPlatformEnabled(config, platformId) {
  return config.enabled?.[platformId] !== false;
}
