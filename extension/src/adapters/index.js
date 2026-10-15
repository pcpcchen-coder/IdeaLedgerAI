// 平台註冊表。平台是開放的：每個 src/adapters/<id>/ 資料夾（含 platform.json）由建置自動註冊，
// 這個檔不需要因為新增平台而修改。新增方式見 docs/ADDING_A_PLATFORM.md。
import { ADAPTER_MODULES } from "./registry.generated.js";

/** 每個 adapter 必須提供的函式（固定介面，見 CLAUDE.md） */
export const ADAPTER_OPS = ["checkLogin", "listUpdated", "getConversation"];

const BY_HOST = new Map();
for (const mod of ADAPTER_MODULES) {
  for (const host of mod.descriptor.hosts) {
    BY_HOST.set(host, { platform: mod.descriptor.id, name: mod.descriptor.name, impl: mod });
  }
}

/**
 * @param {string} hostname
 * @returns {{ platform: string, name: string, impl: Record<string, Function> } | null}
 */
export function getAdapter(hostname) {
  return BY_HOST.get(hostname) ?? null;
}

/** 已註冊平台的描述（id、name、hosts），供背景程式找分頁、設定頁顯示用 */
export function registeredPlatforms() {
  return ADAPTER_MODULES.map((m) => m.descriptor);
}
