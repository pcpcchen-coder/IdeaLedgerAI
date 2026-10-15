// 平台分頁內的同源 GET（給各 adapter 的 fetch.js 用）。平台無關：只處理 HTTP 狀態、節流與 JSON。
//
// - 只發 GET（設計約束「只讀」），帶 cookie。
// - 同一個分頁內任兩次請求至少間隔 MIN_GAP_MS：巡檢核心已在每次 RPC 前節流，
//   這裡再擋一次同一個操作內的連續請求（例如先取權杖再取清單、401 後重取）。
// - 狀態碼對應錯誤類型（src/lib/errors.js）：401 → NeedsLogin；403、429 → RateLimited；
//   其他非 2xx → 一般錯誤；回應不是 JSON → AdapterFormatError。
import { AdapterFormatError, NeedsLogin, RateLimited } from "./errors.js";
import { realClock } from "./throttle.js";

export const MIN_GAP_MS = 3000;

export class HttpError extends Error {
  constructor(status, url) {
    super(`HTTP ${status}：${url}`);
    this.name = "HttpError";
    this.status = status;
  }
}

/**
 * @param {{ fetch?: typeof fetch, clock?: typeof realClock, minGapMs?: number }} [opts]
 */
export function createGetter({ fetch = (...a) => globalThis.fetch(...a), clock = realClock, minGapMs = MIN_GAP_MS } = {}) {
  let last = null;
  return {
    /**
     * @param {string} url 同源路徑（例如 /backend-api/conversations?...）
     * @param {{ headers?: Record<string, string>, statusMap?: Record<number, () => Error> }} [opts]
     *   statusMap：個別端點對狀態碼的特殊解讀（例如某端點未登入時回 403）
     */
    async getJson(url, { headers = {}, statusMap = {} } = {}) {
      if (last != null) {
        const wait = last + minGapMs - clock.now();
        if (wait > 0) await clock.sleep(wait);
      }
      last = clock.now();
      const res = await fetch(url, { method: "GET", credentials: "include", headers: { Accept: "application/json", ...headers } });
      if (!res.ok) {
        if (statusMap[res.status]) throw statusMap[res.status]();
        if (res.status === 401) throw new NeedsLogin(`未登入或登入過期（${url}）`);
        if (res.status === 403 || res.status === 429) throw new RateLimited(`HTTP ${res.status}：${url}`);
        throw new HttpError(res.status, url);
      }
      try {
        return await res.json();
      } catch (e) {
        throw new AdapterFormatError(`回應不是 JSON：${url}`);
      }
    },
  };
}
