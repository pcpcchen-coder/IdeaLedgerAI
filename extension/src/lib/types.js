// 統一的對話格式（設計文件 v2 第 4.1 節）。所有 adapter 的 parseConversation 都必須輸出這個格式。
import { AdapterFormatError } from "./errors.js";

export const PLATFORMS = ["chatgpt", "claude", "kimi"];
export const ROLES = ["user", "assistant"];

/**
 * @typedef {Object} NormalizedMessage
 * @property {"user"|"assistant"} role
 * @property {string} text      附件以「[附件: 檔名]」表示，不含檔案內容
 * @property {string|null} at   ISO 8601 UTC；平台未提供時為 null
 */

/**
 * @typedef {Object} NormalizedConversation
 * @property {"chatgpt"|"claude"|"kimi"} platform
 * @property {string} conv_id
 * @property {string} title
 * @property {string} url
 * @property {string|null} project    平台上的專案名稱
 * @property {string} created_at      ISO 8601 UTC
 * @property {string} updated_at      ISO 8601 UTC
 * @property {NormalizedMessage[]} messages  只含使用中的分支，依時間由舊到新
 */

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** @param {unknown} v */
function isIsoUtc(v) {
  return typeof v === "string" && ISO_UTC.test(v) && !Number.isNaN(Date.parse(v));
}

/**
 * 檢查 adapter 輸出是否符合統一格式；不符合就丟 AdapterFormatError。
 * @param {any} c
 * @returns {NormalizedConversation}
 */
export function validateNormalized(c) {
  const fail = (msg) => {
    throw new AdapterFormatError(`統一格式檢查失敗：${msg}`);
  };
  if (!c || typeof c !== "object") fail("不是物件");
  if (!PLATFORMS.includes(c.platform)) fail(`platform 不合法：${c.platform}`);
  for (const k of ["conv_id", "title", "url"]) {
    if (typeof c[k] !== "string") fail(`${k} 必須是字串`);
  }
  if (c.conv_id === "") fail("conv_id 不可為空");
  if (c.project !== null && typeof c.project !== "string") fail("project 必須是字串或 null");
  for (const k of ["created_at", "updated_at"]) {
    if (!isIsoUtc(c[k])) fail(`${k} 必須是 ISO 8601 UTC：${c[k]}`);
  }
  if (!Array.isArray(c.messages)) fail("messages 必須是陣列");
  c.messages.forEach((m, i) => {
    if (!m || !ROLES.includes(m.role)) fail(`messages[${i}].role 不合法`);
    if (typeof m.text !== "string") fail(`messages[${i}].text 必須是字串`);
    if (m.at !== null && !isIsoUtc(m.at)) fail(`messages[${i}].at 必須是 ISO 8601 UTC 或 null`);
  });
  return c;
}
