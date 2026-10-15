// 自訂平台（設定頁免程式新增，T18）：產生平台 id、檢查輸入、組出送往 collector 的頁面擷取對話。純函式。
// 平台是開放的：這裡只處理使用者輸入的描述，不認得任何特定平台。
import { PLATFORM_ID } from "./types.js";

export const HOSTNAME = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;
export const SCRIPT_PREFIX = "custom-";
export const MIN_TEXT = 200; // 太短的頁面（例如還沒載入完）不送

/**
 * @typedef {{ id: string, name: string, hosts: string[], idPattern: string }} CustomPlatform
 */

/** 名稱 → 平台 id 的基底（小寫英數與連字號；轉不出來時用 custom） */
export function slugify(name) {
  const s = String(name ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^[^a-z]+/, "")
    .replace(/-+$/, "")
    .slice(0, 28)
    .replace(/-+$/, "");
  return PLATFORM_ID.test(s) ? s : "custom";
}

/** 避開已用的 id：gemini → gemini-2 → gemini-3 … */
export function uniqueId(base, taken) {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const id = `${base}-${n}`;
    if (!used.has(id)) return id;
  }
}

export function originPattern(host) {
  return `https://${host}/*`;
}

/**
 * 檢查設定頁輸入並產生平台描述；有誤時丟出 Error（訊息給使用者看）。
 * @param {{ name: string, host: string, idPattern: string }} input
 * @param {{ registered: Array<{ id: string, hosts: string[] }>, custom: CustomPlatform[] }} existing
 * @returns {CustomPlatform}
 */
export function createCustomPlatform(input, { registered = [], custom = [] } = {}) {
  const name = String(input?.name ?? "").trim();
  const host = String(input?.host ?? "").trim().toLowerCase();
  const idPattern = String(input?.idPattern ?? "").trim();
  if (!name || name.length > 64) throw new Error("請填顯示名稱（64 字以內）");
  if (!HOSTNAME.test(host)) throw new Error("網域格式不對：只填網域，例如 grok.com，不要加 https:// 或路徑");
  const all = [...registered, ...custom];
  const owner = all.find((p) => p.hosts.includes(host));
  if (owner) throw new Error(`網域 ${host} 已經屬於平台 ${owner.name ?? owner.id}`);
  let re;
  try {
    re = new RegExp(idPattern);
  } catch (e) {
    throw new Error(`對話網址規則不是合法的正規式：${e.message}`);
  }
  if (!idPattern || new RegExp(`${re.source}|`).exec("").length < 2) {
    throw new Error("對話網址規則需要一個括號，用來取出對話 ID，例如 /c/([\\w-]+)");
  }
  const id = uniqueId(slugify(name), all.map((p) => p.id));
  return { id, name, hosts: [host], idPattern };
}

/** 從網址路徑取對話 ID；不符合規則回傳 null */
export function extractConvId(idPattern, pathname) {
  const m = new RegExp(idPattern).exec(pathname);
  return m?.[1] || null;
}

/**
 * 頁面是否該擷取（在頁面內判斷，不符合的文字不離開頁面）。
 * @returns {string|null} 不擷取的原因；null 代表可以擷取
 */
export function skipReason({ convId, search = "", text = "" }) {
  if (!convId) return "網址不是對話頁";
  if (/temporary/i.test(search)) return "臨時對話";
  if (text.includes("#nolog")) return "#nolog";
  if (text.trim().length < MIN_TEXT) return "文字太短";
  return null;
}

/**
 * 組出送往 collector 的對話（capture="page"）。
 * @param {CustomPlatform} platform
 * @param {{ conv_id: string, url: string, title: string, text: string }} capture
 * @param {{ firstSeen: string, now: string, sweeper: string }} meta firstSeen：第一次擷取到這段對話的時間
 */
export function buildPageConversation(platform, capture, { firstSeen, now, sweeper }) {
  return {
    platform: platform.id,
    platform_name: platform.name,
    capture: "page",
    conv_id: capture.conv_id,
    title: String(capture.title ?? "").slice(0, 300),
    url: capture.url,
    project: null,
    created_at: firstSeen,
    updated_at: now,
    messages: [],
    page_text: capture.text,
    swept_at: now,
    sweeper,
  };
}
