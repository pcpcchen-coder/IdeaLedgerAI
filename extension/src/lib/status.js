// 平台燈號與擴充圖示徽章（設計文件 v2 第 7 節）。平台無關：只看每個平台狀態裡的 status。

/** 狀態 → 燈號與顯示文字 */
export const STATUS_VIEW = Object.freeze({
  idle: { light: "gray", label: "尚未巡檢" },
  ok: { light: "green", label: "正常" },
  rate_limited: { light: "yellow", label: "退避中" },
  needs_login: { light: "red", label: "需重新登入" },
  format_error: { light: "red", label: "介面失效" },
  collector_offline: { light: "red", label: "collector 連不上" },
  error: { light: "red", label: "錯誤" },
});

export function statusView(status) {
  return STATUS_VIEW[status] ?? { light: "red", label: status ?? "未知" };
}

export const BADGE_COLORS = Object.freeze({ red: "#d93025", yellow: "#f2a600" });

/**
 * 全綠（或尚未巡檢）無字；有黃燈顯示黃色「!」；有紅燈顯示紅色「!」。只看啟用中的平台。
 * @param {Record<string, { status: string }>} states 平台 id → 狀態
 * @param {(id: string) => boolean} [isEnabled]
 * @returns {{ text: string, color: string | null }}
 */
export function badgeFor(states, isEnabled = () => true) {
  const lights = Object.entries(states)
    .filter(([id]) => isEnabled(id))
    .map(([, s]) => statusView(s?.status).light);
  if (lights.includes("red")) return { text: "!", color: BADGE_COLORS.red };
  if (lights.includes("yellow")) return { text: "!", color: BADGE_COLORS.yellow };
  return { text: "", color: null };
}
