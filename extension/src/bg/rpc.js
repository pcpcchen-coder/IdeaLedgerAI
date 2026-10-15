// 呼叫平台分頁內的 adapter（content/rpc.js 的另一端）。錯誤會還原成原本的類型，讓巡檢核心依類型處理。
import { reviveError } from "../lib/errors.js";

/**
 * @param {{ sendMessage(tabId: number, msg: object): Promise<any> }} tabsApi
 * @param {{ timeoutMs?: number }} [opts]
 */
export function createRpc(tabsApi, { timeoutMs = 30000 } = {}) {
  return {
    async call(tabId, platform, op, args = []) {
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(reviveError({ name: "RpcTimeout", message: `${platform}.${op} 逾時` })), timeoutMs);
      });
      let res;
      try {
        res = await Promise.race([tabsApi.sendMessage(tabId, { type: "rpc", platform, op, args }), timeout]);
      } catch (e) {
        if (e?.name === "RpcTimeout") throw e;
        // 分頁內沒有 content script（剛載入、網域不符）時 sendMessage 會失敗
        throw reviveError({ name: "NoReceiver", message: `${platform} 分頁沒有回應：${e?.message ?? e}` });
      } finally {
        clearTimeout(timer);
      }
      if (!res) throw reviveError({ name: "NoReceiver", message: `${platform} 分頁沒有回應` });
      if (!res.ok) throw reviveError(res.error);
      return res.result;
    },
  };
}
