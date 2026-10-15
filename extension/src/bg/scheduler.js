// 排程：chrome.alarms 每 N 分鐘觸發一次，觸發時再排一個 0–5 分鐘隨機延遲的單次鬧鐘，單次鬧鐘響了才開跑；同一時間只跑一輪。
// 隨機延遲必須用鬧鐘而不是 setTimeout：MV3 背景程式閒置約 30 秒就會被終止，setTimeout 等不到；
// 而且等待期間不算「執行中」，手動「立即巡檢」不會被鎖住（T08 首測發現）。

export const ALARM_NAME = "idealedger-sweep";
export const RUN_ALARM_NAME = "idealedger-sweep-run";

/**
 * @param {object} opts
 * @param {{ create(name, info): void, clear?(name): Promise<boolean> }} opts.alarms chrome.alarms 或相容物件
 * @param {{ random(): number }} opts.clock
 * @param {(source: "alarm"|"manual") => Promise<any>} opts.runAll
 * @param {number} [opts.jitterMaxMs]
 */
export function createScheduler({ alarms, clock, runAll, jitterMaxMs = 5 * 60 * 1000 }) {
  let running = null;

  return {
    /** 安裝或更新鬧鐘（間隔變更時重新呼叫即可） */
    async setup(intervalMinutes = 30) {
      await alarms.clear?.(ALARM_NAME);
      alarms.create(ALARM_NAME, { delayInMinutes: 1, periodInMinutes: intervalMinutes });
    },

    /** 週期鬧鐘 → 排隨機延遲的單次鬧鐘；單次鬧鐘 → 開跑 */
    onAlarm(alarm) {
      if (alarm?.name === RUN_ALARM_NAME) return this.trigger("alarm");
      if (alarm?.name !== ALARM_NAME) return null;
      const delayMs = jitterMaxMs > 0 ? Math.floor(clock.random() * jitterMaxMs) : 0;
      if (delayMs <= 0) return this.trigger("alarm");
      alarms.create(RUN_ALARM_NAME, { delayInMinutes: delayMs / 60000 });
      return Promise.resolve(null);
    },

    /** @param {"alarm"|"manual"} source 隨機延遲已在 onAlarm 處理，這裡直接執行 */
    trigger(source = "manual") {
      if (running) return running;
      running = (async () => {
        try {
          return await runAll(source);
        } finally {
          running = null;
        }
      })();
      return running;
    },

    isRunning() {
      return running != null;
    },
  };
}
