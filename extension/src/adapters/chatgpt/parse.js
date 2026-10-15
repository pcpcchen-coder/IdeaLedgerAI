// ChatGPT 解析層（純函式，不碰網路）。欄位名稱以 fixtures/chatgpt/NOTES.md 為準。
import { AdapterFormatError, NeedsLogin } from "../../lib/errors.js";
import { validateNormalized } from "../../lib/types.js";

const PLATFORM = "chatgpt";
const ORIGIN = "https://chatgpt.com";
/** 專案對話的 gizmo_id 以 g-p- 開頭（一般 GPT 是 g-，一般對話是 null） */
const PROJECT_PREFIX = "g-p-";
/** 只有這兩種 content_type 是真正的訊息；reasoning_recap、code、tether_* 等一律略過 */
const MESSAGE_TYPES = new Set(["text", "multimodal_text"]);
const ROLES = new Set(["user", "assistant"]);

const fail = (msg) => {
  throw new AdapterFormatError(`ChatGPT 回應格式不符：${msg}`);
};
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** 清單的 ISO 字串（6 位小數）或單篇的 epoch 秒（浮點數）→ ISO 8601 UTC */
function toIso(v, field) {
  const ms = typeof v === "number" ? v * 1000 : typeof v === "string" ? Date.parse(v) : NaN;
  if (!Number.isFinite(ms)) fail(`${field} 不是時間：${JSON.stringify(v)}`);
  return new Date(ms).toISOString();
}

function projectOf(gizmoId) {
  return typeof gizmoId === "string" && gizmoId.startsWith(PROJECT_PREFIX) ? gizmoId : null;
}

/**
 * GET /backend-api/gizmos/snorlax/sidebar?conversations_per_gizmo=0&limit=20&owned_only=false[&cursor=…]
 * 專案名稱表（NOTES「專案名稱」）：items[].gizmo.gizmo.id → display.name；cursor 為 null 表示最後一頁。
 * @returns {{ names: Record<string, string>, cursor: string|null }}
 */
export function parseProjects(json) {
  if (!isObj(json)) fail("專案清單不是物件");
  if (!Array.isArray(json.items)) fail("專案清單缺少 items");
  if (json.cursor != null && typeof json.cursor !== "string") fail("專案清單 cursor 不是字串");
  const names = {};
  json.items.forEach((it, i) => {
    const g = isObj(it) && isObj(it.gizmo) ? it.gizmo.gizmo : null;
    if (!isObj(g) || typeof g.id !== "string" || g.id === "") fail(`items[${i}].gizmo.gizmo.id 缺失`);
    const name = isObj(g.display) && typeof g.display.name === "string" ? g.display.name.trim() : "";
    if (g.id.startsWith(PROJECT_PREFIX) && name) names[g.id] = name;
  });
  return { names, cursor: json.cursor ?? null };
}

/**
 * GET /api/auth/session
 * @returns {{ accessToken: string }}
 */
export function parseSession(json) {
  if (!isObj(json)) fail("session 不是物件");
  // 未登入時回應只有 WARNING_BANNER，沒有 accessToken（NOTES 第 4 題）
  if (typeof json.accessToken !== "string" || json.accessToken === "") throw new NeedsLogin("ChatGPT 未登入");
  return { accessToken: json.accessToken };
}

/**
 * GET /backend-api/conversations?offset={n}&limit={n}&order=updated
 * total 不是總數，結束與否看 items.length < limit（NOTES 第 1 題）。
 * @returns {{ items: { id: string, title: string, updated_at: string, project: string|null }[], next: { offset: number } | null }}
 */
export function parseList(json) {
  if (!isObj(json)) fail("清單不是物件");
  if (!Array.isArray(json.items)) fail("清單缺少 items");
  if (!Number.isInteger(json.limit) || !Number.isInteger(json.offset)) fail("清單缺少 limit／offset");
  const items = json.items.map((it, i) => {
    if (!isObj(it) || typeof it.id !== "string" || it.id === "") fail(`items[${i}].id 缺失`);
    return {
      id: it.id,
      title: typeof it.title === "string" ? it.title : "",
      updated_at: toIso(it.update_time, `items[${i}].update_time`),
      project: projectOf(it.gizmo_id),
    };
  });
  const next = items.length >= json.limit && items.length > 0 ? { offset: json.offset + items.length } : null;
  return { items, next };
}

/** 訊息內容：文字段落以換行串接；圖片與檔案只留檔名 */
function messageText(msg) {
  const parts = Array.isArray(msg.content?.parts) ? msg.content.parts : [];
  const texts = parts.filter((p) => typeof p === "string" && p !== "");
  const attachments = Array.isArray(msg.metadata?.attachments) ? msg.metadata.attachments : [];
  const names = attachments.map((a) => (isObj(a) && typeof a.name === "string" && a.name) || "檔案");
  // 圖片 part（物件）若沒有對應的附件紀錄，以「圖片」代表
  const images = parts.filter((p) => isObj(p)).length;
  for (let i = names.length; i < images; i++) names.push("圖片");
  return [...texts, ...names.map((n) => `[附件: ${n}]`)].join("\n");
}

/** 從 current_node 沿 parent 走到根，再反轉 = 目前分支（NOTES「單篇對話結構」） */
function activeBranch(mapping, currentNode) {
  if (!isObj(mapping[currentNode])) fail(`current_node 不在 mapping 中：${currentNode}`);
  const path = [];
  const seen = new Set();
  for (let id = currentNode; id != null; id = mapping[id]?.parent ?? null) {
    if (seen.has(id)) fail("mapping 的 parent 形成迴圈");
    seen.add(id);
    const node = mapping[id];
    if (!isObj(node)) fail(`parent 指向不存在的節點：${id}`);
    path.push(node);
  }
  return path.reverse();
}

/**
 * GET /backend-api/conversation/{id}
 * @returns {import("../../lib/types.js").NormalizedConversation}
 */
export function parseConversation(json) {
  if (!isObj(json)) fail("對話不是物件");
  const id = json.conversation_id;
  if (typeof id !== "string" || id === "") fail("缺少 conversation_id");
  if (!isObj(json.mapping)) fail("缺少 mapping");
  if (typeof json.current_node !== "string") fail("缺少 current_node");

  const messages = [];
  for (const node of activeBranch(json.mapping, json.current_node)) {
    const msg = node.message;
    if (!isObj(msg)) continue; // 根節點
    const role = msg.author?.role;
    if (!ROLES.has(role)) continue; // system、tool
    if (!MESSAGE_TYPES.has(msg.content?.content_type)) continue; // reasoning_recap 等
    if (msg.metadata?.is_visually_hidden_from_conversation === true) continue;
    const text = messageText(msg);
    if (text === "") continue;
    messages.push({ role, text, at: msg.create_time == null ? null : toIso(msg.create_time, "message.create_time") });
  }

  return validateNormalized({
    platform: PLATFORM,
    conv_id: id,
    title: typeof json.title === "string" ? json.title : "",
    url: `${ORIGIN}/c/${id}`,
    project: projectOf(json.gizmo_id),
    created_at: toIso(json.create_time, "create_time"),
    updated_at: toIso(json.update_time, "update_time"),
    messages,
  });
}
