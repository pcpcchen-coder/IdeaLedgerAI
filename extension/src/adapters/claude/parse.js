// Claude 解析層（純函式，不碰網路）。欄位名稱以 fixtures/claude/NOTES.md 為準；寫法比照 chatgpt/parse.js。
import { AdapterFormatError, NeedsLogin } from "../../lib/errors.js";
import { validateNormalized } from "../../lib/types.js";

const PLATFORM = "claude";
const ORIGIN = "https://claude.ai";
/** 根訊息的 parent_message_uuid（NOTES 第 4 題） */
const ROOT = "00000000-0000-4000-8000-000000000000";
const ROLE = { human: "user", assistant: "assistant" };

const fail = (msg) => {
  throw new AdapterFormatError(`Claude 回應格式不符：${msg}`);
};
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function toIso(v, field) {
  const ms = typeof v === "string" ? Date.parse(v) : NaN;
  if (!Number.isFinite(ms)) fail(`${field} 不是時間：${JSON.stringify(v)}`);
  return new Date(ms).toISOString();
}

/** 清單有 project.name；單篇只有 project_uuid（NOTES 第 2 題） */
function projectOf(c) {
  if (isObj(c.project) && typeof c.project.name === "string" && c.project.name) return c.project.name;
  return typeof c.project_uuid === "string" && c.project_uuid ? c.project_uuid : null;
}

/**
 * GET /api/organizations：取 capabilities 含 "chat" 的組織（NOTES 第 6 題）。
 * @returns {{ orgId: string }}
 */
export function parseOrganizations(json) {
  if (!Array.isArray(json)) fail("組織清單不是陣列");
  const org = json.find((o) => isObj(o) && Array.isArray(o.capabilities) && o.capabilities.includes("chat"));
  if (!org) throw new NeedsLogin("Claude 沒有可聊天的組織（未登入或無權限）");
  if (typeof org.uuid !== "string" || org.uuid === "") fail("組織缺少 uuid");
  return { orgId: org.uuid };
}

/**
 * GET /api/organizations/{org}/chat_conversations?limit={limit}&offset={offset}
 * 回應是陣列，沒有 total；length < limit 表示最後一頁（NOTES 第 1 題）。
 * @param {unknown} json
 * @param {{ offset?: number, limit?: number }} [page] 這次請求用的分頁參數
 * @returns {{ items: { id: string, title: string, updated_at: string, project: string|null }[], next: { offset: number } | null }}
 */
export function parseList(json, { offset = 0, limit = 30 } = {}) {
  if (!Array.isArray(json)) fail("對話清單不是陣列");
  const items = json.map((it, i) => {
    if (!isObj(it) || typeof it.uuid !== "string" || it.uuid === "") fail(`[${i}].uuid 缺失`);
    return {
      id: it.uuid,
      title: typeof it.name === "string" ? it.name : "",
      updated_at: toIso(it.updated_at, `[${i}].updated_at`),
      project: projectOf(it),
    };
  });
  const next = items.length >= limit && items.length > 0 ? { offset: offset + items.length } : null;
  return { items, next };
}

/** 只取 text 區塊（thinking、tool_use 等略過）；附件只留檔名，不取 extracted_content（NOTES 第 5 題） */
function messageText(m) {
  const blocks = Array.isArray(m.content) ? m.content : null;
  const texts = blocks
    ? blocks.filter((b) => isObj(b) && b.type === "text" && typeof b.text === "string" && b.text !== "").map((b) => b.text)
    : typeof m.text === "string" && m.text !== "" ? [m.text] : [];
  const files = [...(Array.isArray(m.attachments) ? m.attachments : []), ...(Array.isArray(m.files) ? m.files : [])];
  const names = files.map((f) => (isObj(f) && (f.file_name || f.name)) || "檔案");
  return [...texts, ...names.map((n) => `[附件: ${n}]`)].join("\n");
}

/** 從 current_leaf_message_uuid 沿 parent_message_uuid 走到根，再反轉；不能只依 index 排序 */
function activeBranch(messages, leaf) {
  const byId = new Map();
  for (const m of messages) {
    if (!isObj(m) || typeof m.uuid !== "string") fail("chat_messages 有缺 uuid 的訊息");
    byId.set(m.uuid, m);
  }
  if (leaf == null) {
    if (messages.length) fail("缺少 current_leaf_message_uuid");
    return [];
  }
  const path = [];
  const seen = new Set();
  for (let id = leaf; id !== ROOT; ) {
    if (seen.has(id)) fail("parent_message_uuid 形成迴圈");
    seen.add(id);
    const m = byId.get(id);
    if (!m) fail(`找不到訊息：${id}`);
    path.push(m);
    id = m.parent_message_uuid;
    if (typeof id !== "string") fail(`訊息缺少 parent_message_uuid：${m.uuid}`);
  }
  return path.reverse();
}

/**
 * GET /api/organizations/{org}/chat_conversations/{id}?tree=True&rendering_mode=messages&render_all_tools=true
 * @param {unknown} json
 * @param {{ project?: string|null }} [hint] 清單上的資訊；單篇回應沒有專案名稱，可由清單項目補上
 * @returns {import("../../lib/types.js").NormalizedConversation}
 */
export function parseConversation(json, hint = {}) {
  if (!isObj(json)) fail("對話不是物件");
  const id = json.uuid;
  if (typeof id !== "string" || id === "") fail("缺少 uuid");
  if (!Array.isArray(json.chat_messages)) fail("缺少 chat_messages");

  const messages = [];
  for (const m of activeBranch(json.chat_messages, json.current_leaf_message_uuid)) {
    const role = ROLE[m.sender];
    if (!role) continue;
    const text = messageText(m);
    if (text === "") continue;
    messages.push({ role, text, at: m.created_at == null ? null : toIso(m.created_at, "message.created_at") });
  }

  return validateNormalized({
    platform: PLATFORM,
    conv_id: id,
    title: typeof json.name === "string" ? json.name : "",
    url: `${ORIGIN}/chat/${id}`,
    project: hint.project ?? projectOf(json),
    created_at: toIso(json.created_at, "created_at"),
    updated_at: toIso(json.updated_at, "updated_at"),
    messages,
  });
}
