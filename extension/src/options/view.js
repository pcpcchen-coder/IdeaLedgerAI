// 設定頁的顯示邏輯（純函式，可單獨測試）。平台列表一律來自 registeredPlatforms()，不寫死。
import { isPlatformEnabled, normalizeConfig } from "../bg/config.js";
import { statusView } from "../lib/status.js";

/** ISO 時間 → 「10-15 19:30」（本地時區）；沒有就「—」 */
export function shortTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * 每個已註冊平台一列。
 * @param {Array<{ id: string, name: string }>} platforms
 * @param {Record<string, any>} states 平台 id → 巡檢狀態（bg/state.js）
 * @param {object} config
 * @param {number} [now]
 */
export function platformRows(platforms, states, config, now = Date.now()) {
  return platforms.map((p) => {
    const s = states?.[p.id] ?? {};
    const view = statusView(s.status ?? "idle");
    const backoff = s.status === "rate_limited" && s.backoffUntil > now ? `，${shortTime(new Date(s.backoffUntil).toISOString())} 後重試` : "";
    return {
      id: p.id,
      name: p.name,
      enabled: isPlatformEnabled(config, p.id),
      light: view.light,
      label: view.label + backoff,
      lastSuccess: shortTime(s.lastSuccessAt),
      fetched: s.lastRun ? `${s.lastRun.fetched}／列出 ${s.lastRun.listed}` : "—",
      error: s.lastRun?.error ?? "",
    };
  });
}

/**
 * 表單值 → 要儲存的設定。平台開關只記「停用」的平台（未列出的預設啟用，新平台自動啟用）。
 * @param {{ collectorUrl: string, token: string, intervalMinutes: string|number, sweeper: string, sweepEnabled: boolean,
 *           platforms: Record<string, boolean> }} form
 */
export function formToConfig(form) {
  const enabled = Object.fromEntries(Object.entries(form.platforms ?? {}).filter(([, on]) => !on).map(([id]) => [id, false]));
  const { platforms: _platforms, ...rest } = form;
  return normalizeConfig({ ...rest, enabled });
}
