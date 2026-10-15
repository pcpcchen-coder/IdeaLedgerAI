// 每個平台的巡檢狀態，存在 chrome.storage.local（服務程式隨時可能被終止，狀態不能只放記憶體）。
// 平台是開放的：以平台 id 當鍵，任何新平台自動有自己的一份狀態。

export const DEFAULT_STATE = Object.freeze({
  watermark: null, // 已成功送出的最新 updated_at（ISO）
  backfillQueue: null, // 回填中：[{ id, updated_at }] 由舊到新；null 代表不在回填
  backoffLevel: 0,
  backoffUntil: null, // epoch ms
  status: "idle", // idle | ok | rate_limited | needs_login | format_error | collector_offline | error
  lastRun: null, // { started_at, finished_at, listed, fetched, error }
  lastSuccessAt: null,
});

const key = (platform) => `platform:${platform}`;

/** @param {{ get(keys: string|string[]): Promise<object>, set(items: object): Promise<void> }} storage chrome.storage.local 或相容物件 */
export function createStateStore(storage) {
  return {
    async get(platform) {
      const k = key(platform);
      const got = await storage.get(k);
      return { ...DEFAULT_STATE, ...(got?.[k] ?? {}) };
    },
    async patch(platform, partial) {
      const next = { ...(await this.get(platform)), ...partial };
      await storage.set({ [key(platform)]: next });
      return next;
    },
    async getAll(platforms) {
      const out = {};
      for (const p of platforms) out[p] = await this.get(p);
      return out;
    },
  };
}

/** 測試與非擴充環境用的記憶體版 storage */
export function memoryStorage(initial = {}) {
  const data = structuredClone(initial);
  return {
    data,
    async get(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(list.filter((k) => k in data).map((k) => [k, structuredClone(data[k])]));
    },
    async set(items) {
      Object.assign(data, structuredClone(items));
    },
  };
}
