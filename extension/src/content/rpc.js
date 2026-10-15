// 平台分頁內的 RPC 處理（純函式，可單獨測試）。
// 背景程式負責所有決策；這裡只把 { op, args } 轉給 adapter 執行，並把結果或錯誤包成可序列化的回應。
import { ADAPTER_OPS } from "../adapters/index.js";

/**
 * @param {{ platform: string, impl: Record<string, Function> } | null} adapter
 * @param {{ type?: string, platform?: string, op?: string, args?: unknown[] }} msg
 * @returns {Promise<{ ok: true, result: unknown } | { ok: false, error: { name: string, message: string } }>}
 */
export async function handleRpc(adapter, msg) {
  const err = (name, message) => ({ ok: false, error: { name, message } });
  if (!adapter) return err("NoAdapter", "此網域沒有對應的 adapter");
  if (msg?.platform && msg.platform !== adapter.platform) {
    return err("PlatformMismatch", `分頁平台為 ${adapter.platform}，請求的是 ${msg.platform}`);
  }
  if (!ADAPTER_OPS.includes(msg?.op)) return err("UnknownOp", `不支援的操作：${msg?.op}`);
  try {
    const result = await adapter.impl[msg.op](...(msg.args ?? []));
    return { ok: true, result };
  } catch (e) {
    return err(e?.name ?? "Error", e?.message ?? String(e));
  }
}
