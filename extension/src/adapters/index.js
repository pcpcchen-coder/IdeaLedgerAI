// 依網域取得對應平台的 adapter。新增平台：在 ADAPTERS 加一列，並實作 adapters/<platform>/。
import * as chatgpt from "./chatgpt/fetch.js";
import * as claude from "./claude/fetch.js";

/** 每個 adapter 必須提供的函式（固定介面，見 CLAUDE.md） */
export const ADAPTER_OPS = ["checkLogin", "listUpdated", "getConversation"];

const ADAPTERS = {
  "chatgpt.com": { platform: "chatgpt", impl: chatgpt },
  "claude.ai": { platform: "claude", impl: claude },
  // "www.kimi.com": T13 實作後加入
};

/**
 * @param {string} hostname
 * @returns {{ platform: string, impl: Record<string, Function> } | null}
 */
export function getAdapter(hostname) {
  return ADAPTERS[hostname] ?? null;
}

/** 已註冊的平台與網域，供背景程式找分頁用 */
export function registeredPlatforms() {
  return Object.entries(ADAPTERS).map(([host, a]) => ({ host, platform: a.platform }));
}
