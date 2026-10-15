// 與本機 collector 溝通（T03 的 /v2 端點）。
import { CollectorOffline, CollectorRejected } from "../lib/errors.js";

/**
 * @param {{ baseUrl: string, token: string, fetchImpl?: typeof fetch, timeoutMs?: number }} opts
 */
export function createCollectorClient({ baseUrl, token, fetchImpl = globalThis.fetch, timeoutMs = 10000 }) {
  const root = baseUrl.replace(/\/+$/, "");

  async function request(method, path, body) {
    let res;
    try {
      res = await fetchImpl(`${root}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      throw new CollectorOffline(`collector 連不上：${e?.message ?? e}`);
    }
    if (res.status >= 500) throw new CollectorOffline(`collector 錯誤 ${res.status}`);
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new CollectorRejected(`collector 拒絕 ${res.status}：${detail.slice(0, 300)}`);
    }
    return res.json();
  }

  return {
    /** @returns {Promise<{ status: "created"|"updated"|"unchanged"|"excluded" }>} */
    postConversation(conversation) {
      return request("POST", "/v2/conversations", conversation);
    },
    postSweepRun(run) {
      return request("POST", "/v2/sweep-runs", run);
    },
    async getWatermark(platform) {
      return (await request("GET", `/v2/watermark?platform=${encodeURIComponent(platform)}`)).watermark;
    },
  };
}
