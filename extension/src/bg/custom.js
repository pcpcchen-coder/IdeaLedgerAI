// 自訂平台的註冊、移除、啟動對齊，以及頁面擷取的送出（T18）。chrome API 由呼叫端注入，方便測試。
//
// 注意：chrome.permissions.request 必須在使用者點擊的處理中呼叫，所以 add() 在設定頁執行，
// 而且檢查輸入是同步的，第一個 await 就是要權限。
import { CollectorOffline } from "../lib/errors.js";
import { buildPageConversation, createCustomPlatform, originPattern, SCRIPT_PREFIX } from "../lib/custom-platforms.js";

export const STORAGE_KEY = "customPlatforms";
const SEEN_KEY = "pageSeen"; // { "platform/conv_id": 第一次擷取時間 }
const QUEUE_KEY = "pageQueue"; // collector 連不上時待送的頁面擷取（同一對話只留最新）
const STATUS_KEY = "pageStatus"; // { platform: { lastCaptureAt, lastError } }
export const CAPTURE_SCRIPT = "page-capture.js";

export class PermissionDenied extends Error {
  constructor(host) {
    super(`沒有取得 ${host} 的存取權限，未新增平台`);
    this.name = "PermissionDenied";
  }
}

const scriptId = (id) => `${SCRIPT_PREFIX}${id}`;
const scriptFor = (p) => ({
  id: scriptId(p.id),
  matches: p.hosts.map(originPattern),
  js: [CAPTURE_SCRIPT],
  runAt: "document_idle",
  persistAcrossSessions: true,
});

/**
 * @param {object} apis
 * @param {{ get(k): Promise<object>, set(o): Promise<void> }} apis.storage chrome.storage.local
 * @param {{ request(p): Promise<boolean>, remove(p): Promise<boolean> }} [apis.permissions]
 * @param {{ registerContentScripts(s): Promise<void>, unregisterContentScripts(f?): Promise<void>,
 *           getRegisteredContentScripts(f?): Promise<Array<{ id: string }>> }} [apis.scripting]
 * @param {Array<{ id: string, name: string, hosts: string[] }>} apis.registered 內建 adapter（registeredPlatforms()）
 */
export function createCustomManager({ storage, permissions, scripting, registered = [] }) {
  const read = async (key, fallback) => (await storage.get(key))?.[key] ?? fallback;

  return {
    /** @returns {Promise<import("../lib/custom-platforms.js").CustomPlatform[]>} */
    list: () => read(STORAGE_KEY, []),

    /**
     * 新增自訂平台。current 是設定頁已載入的清單（同步檢查，讓權限請求留在使用者點擊之內）。
     */
    async add(input, current) {
      const platform = createCustomPlatform(input, { registered, custom: current });
      const origins = platform.hosts.map(originPattern);
      const granted = await permissions.request({ origins });
      if (!granted) throw new PermissionDenied(platform.hosts[0]);
      try {
        await scripting.registerContentScripts([scriptFor(platform)]);
      } catch (e) {
        await permissions.remove({ origins }).catch(() => {});
        throw e;
      }
      const latest = await read(STORAGE_KEY, []);
      await storage.set({ [STORAGE_KEY]: [...latest.filter((p) => p.id !== platform.id), platform] });
      return platform;
    },

    /** 移除自訂平台：解除注入、收回權限、刪除設定（collector 中的資料不動） */
    async remove(id) {
      const list = await read(STORAGE_KEY, []);
      const platform = list.find((p) => p.id === id);
      if (!platform) return false;
      await scripting.unregisterContentScripts({ ids: [scriptId(id)] }).catch(() => {});
      await permissions.remove({ origins: platform.hosts.map(originPattern) }).catch(() => {});
      await storage.set({ [STORAGE_KEY]: list.filter((p) => p.id !== id) });
      return true;
    },

    /** 背景程式啟動時對齊：補注入缺的、移除沒有對應設定的 */
    async sync() {
      const list = await read(STORAGE_KEY, []);
      const scripts = (await scripting.getRegisteredContentScripts()).filter((s) => s.id.startsWith(SCRIPT_PREFIX));
      const have = new Set(scripts.map((s) => s.id));
      const want = new Set(list.map((p) => scriptId(p.id)));
      const stale = [...have].filter((id) => !want.has(id));
      if (stale.length) await scripting.unregisterContentScripts({ ids: stale });
      const missing = list.filter((p) => !have.has(scriptId(p.id)));
      if (missing.length) await scripting.registerContentScripts(missing.map(scriptFor));
      return { added: missing.map((p) => p.id), removed: stale };
    },

    /** 由分頁網址找自訂平台（以分頁的網域為準，不信任訊息內容） */
    async findByUrl(url) {
      let host;
      try {
        host = new URL(url).hostname;
      } catch {
        return null;
      }
      return (await read(STORAGE_KEY, [])).find((p) => p.hosts.includes(host)) ?? null;
    },

    /**
     * 處理頁面擷取：組成 capture="page" 的對話送 collector；連不上就放進待送佇列。
     * @param {string} senderUrl 送出訊息的分頁網址
     * @param {{ conv_id: string, url: string, title: string, text: string }} capture
     * @param {{ collector: { postConversation(c): Promise<any> }, now: string, sweeper: string }} ctx
     */
    async handleCapture(senderUrl, capture, { collector, now, sweeper }) {
      const platform = await this.findByUrl(senderUrl);
      if (!platform) return { ok: false, reason: "此網域不是自訂平台" };
      if (typeof capture?.conv_id !== "string" || !capture.conv_id || typeof capture.text !== "string") {
        return { ok: false, reason: "擷取內容不完整" };
      }
      const seen = await read(SEEN_KEY, {});
      const key = `${platform.id}/${capture.conv_id}`;
      if (!seen[key]) await storage.set({ [SEEN_KEY]: { ...seen, [key]: now } });
      const conv = buildPageConversation(platform, capture, { firstSeen: seen[key] ?? now, now, sweeper });
      const status = await read(STATUS_KEY, {});
      try {
        await collector.postConversation(conv);
        await storage.set({ [STATUS_KEY]: { ...status, [platform.id]: { lastCaptureAt: now, lastError: null } } });
        return { ok: true };
      } catch (e) {
        await storage.set({ [STATUS_KEY]: { ...status, [platform.id]: { ...(status[platform.id] ?? {}), lastError: e.message } } });
        if (!(e instanceof CollectorOffline)) throw e;
        const queue = await read(QUEUE_KEY, []);
        await storage.set({ [QUEUE_KEY]: [...queue.filter((q) => !(q.platform === conv.platform && q.conv_id === conv.conv_id)), conv] });
        return { ok: false, queued: true };
      }
    },

    /** 補送待送佇列（每輪巡檢前呼叫）；仍連不上就留著 */
    async drainQueue(collector) {
      const queue = await read(QUEUE_KEY, []);
      const left = [];
      for (const conv of queue) {
        try {
          await collector.postConversation(conv);
        } catch (e) {
          if (e instanceof CollectorOffline) left.push(conv);
        }
      }
      await storage.set({ [QUEUE_KEY]: left });
      return { sent: queue.length - left.length, left: left.length };
    },

    status: () => read(STATUS_KEY, {}),
  };
}
