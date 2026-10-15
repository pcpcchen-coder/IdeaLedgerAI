// 排程：chrome.alarms 每 N 分鐘觸發一次，鬧鐘觸發時再加 0–5 分鐘隨機延遲；同一時間只跑一輪。

export const ALARM_NAME = "idealedger-sweep";

/**
 * @param {object} opts
 * @param {{ create(name, info): void, clear?(name): Promise<boolean> }} opts.alarms chrome.alarms 或相容物件
 * @param {{ sleep(ms): Promise<void>, random(): number }} opts.clock
 * @param {() => Promise<any>} opts.runAll
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

    onAlarm(alarm) {
      if (alarm?.name === ALARM_NAME) return this.trigger("alarm");
      return null;
    },

    /** @param {"alarm"|"manual"} source 手動「立即巡檢」不加隨機延遲 */
    trigger(source = "manual") {
      if (running) return running;
      running = (async () => {
        try {
          if (source === "alarm" && jitterMaxMs > 0) await clock.sleep(Math.floor(clock.random() * jitterMaxMs));
          return await runAll();
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
