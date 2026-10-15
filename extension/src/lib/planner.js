// 巡檢規劃（純函式）：決定這輪要抓哪些對話、回填佇列怎麼建、水位線怎麼前移。
// 時間一律用 Date.parse 比較，不做字串比較（各平台的 ISO 格式小數位數不同）。

export const DEFAULTS = {
  cap: 30, // 每輪每平台單篇讀取上限
  settleMs: 10 * 60 * 1000, // 10 分鐘內仍在更新的對話留給下一輪
};

const ts = (iso) => Date.parse(iso);

/** 依 updated_at 由舊到新排序（不改動原陣列） */
export function sortOldestFirst(items) {
  return [...items].sort((a, b) => ts(a.updated_at) - ts(b.updated_at));
}

/** 已靜止（最後更新超過 settleMs）的項目 */
export function isSettled(item, now, settleMs = DEFAULTS.settleMs) {
  return ts(item.updated_at) <= now - settleMs;
}

/** 是否比水位線新；水位線為 null 代表全部都算新 */
export function isNewer(item, watermark) {
  return watermark == null || ts(item.updated_at) > ts(watermark);
}

/**
 * 一般模式：從列出的項目中挑出這輪要抓的對話。
 * @returns 由舊到新、最多 cap 筆
 */
export function planNormal(items, watermark, now, { cap = DEFAULTS.cap, settleMs = DEFAULTS.settleMs } = {}) {
  return sortOldestFirst(items.filter((i) => isNewer(i, watermark) && isSettled(i, now, settleMs))).slice(0, cap);
}

/**
 * 回填模式：由完整歷史建立佇列（只留已靜止的，由舊到新，只存必要欄位；project 供專案黑名單判斷）。
 * 未靜止的對話不放進佇列；它們比佇列裡最新的還新，回填結束後會由一般模式接手。
 */
export function buildBackfillQueue(items, now, { settleMs = DEFAULTS.settleMs } = {}) {
  return sortOldestFirst(items.filter((i) => isSettled(i, now, settleMs))).map(({ id, updated_at, project = null }) => ({ id, updated_at, project }));
}

/** 水位線只往前：取兩者較新者 */
export function advanceWatermark(current, candidate) {
  if (current == null) return candidate;
  return ts(candidate) > ts(current) ? candidate : current;
}

/**
 * 一般模式是否該停止翻頁：清單依 updated_at 由新到舊，
 * 一旦這頁出現不比水位線新的項目，後面的頁都更舊。
 */
export function reachedWatermark(pageItems, watermark) {
  return watermark != null && pageItems.some((i) => !isNewer(i, watermark));
}
