// 退避：被平台限流（429／403）時暫停該平台 1→2→4→8 小時（上限 8），成功一輪就歸零。

export const BACKOFF_HOURS = [1, 2, 4, 8];
const HOUR = 60 * 60 * 1000;

/** @param {{ backoffLevel?: number, backoffUntil?: number|null }} state */
export function isBackingOff(state, now) {
  return state.backoffUntil != null && now < state.backoffUntil;
}

/** 再被限流一次：回傳新的退避欄位 */
export function onRateLimited(state, now) {
  const level = Math.min((state.backoffLevel ?? 0) + 1, BACKOFF_HOURS.length);
  return { backoffLevel: level, backoffUntil: now + BACKOFF_HOURS[level - 1] * HOUR };
}

/** 成功一輪：歸零 */
export function onSuccess() {
  return { backoffLevel: 0, backoffUntil: null };
}
