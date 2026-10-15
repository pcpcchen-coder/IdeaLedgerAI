// 節流：任兩次對平台的請求之間至少間隔 minIntervalMs（再加 0–jitterMs 隨機）。

export const realClock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  random: () => Math.random(),
};

/**
 * @param {{ minIntervalMs?: number, jitterMs?: number, clock?: typeof realClock }} [opts]
 */
export function createThrottle({ minIntervalMs = 3000, jitterMs = 1000, clock = realClock } = {}) {
  let last = null;
  return {
    /** 在每次請求前呼叫 */
    async wait() {
      if (last != null) {
        const gap = minIntervalMs + Math.floor(clock.random() * jitterMs);
        const remaining = last + gap - clock.now();
        if (remaining > 0) await clock.sleep(remaining);
      }
      last = clock.now();
    },
  };
}
