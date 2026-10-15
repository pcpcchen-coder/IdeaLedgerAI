// 使用者設定（設定頁編輯，見 T07），存在 chrome.storage.local 的 "config"。

export const DEFAULT_CONFIG = Object.freeze({
  collectorUrl: "http://127.0.0.1:8787",
  token: "",
  intervalMinutes: 30, // 15–120
  sweeper: "mac-mini",
  enabled: {}, // { [platformId]: false } 代表停用；未列出的平台預設啟用
});

export async function loadConfig(storage) {
  const { config } = await storage.get("config");
  const merged = { ...DEFAULT_CONFIG, ...(config ?? {}) };
  merged.intervalMinutes = Math.min(120, Math.max(15, Number(merged.intervalMinutes) || 30));
  return merged;
}

export function isPlatformEnabled(config, platformId) {
  return config.enabled?.[platformId] !== false;
}
