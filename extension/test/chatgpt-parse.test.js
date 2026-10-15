// T04 ChatGPT 解析層：以 T01 的 fixtures 測試（欄位依 fixtures/chatgpt/NOTES.md）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseSession, parseList, parseConversation } from "../src/adapters/chatgpt/parse.js";
import { AdapterFormatError, NeedsLogin } from "../src/lib/errors.js";

const load = (name) => JSON.parse(readFileSync(new URL(`../fixtures/chatgpt/${name}`, import.meta.url), "utf8"));
const clone = (v) => structuredClone(v);

test("session：取出 accessToken；未登入（只有 WARNING_BANNER）→ NeedsLogin；不是物件 → AdapterFormatError", () => {
  assert.deepEqual(parseSession(load("session.json")), { accessToken: "[REDACTED]" });
  assert.throws(() => parseSession({ WARNING_BANNER: "x" }), NeedsLogin);
  assert.throws(() => parseSession(null), AdapterFormatError);
});

test("清單：項目數、欄位、時間轉 ISO UTC；滿頁時 next 為下一個 offset", () => {
  const p1 = parseList(load("list_page1.json"));
  assert.equal(p1.items.length, 28);
  assert.deepEqual(p1.next, { offset: 28 });
  assert.deepEqual(p1.items[0], {
    id: "6ad04335-ce98-83ec-910b-0046d770b040",
    title: "回覆測試 C",
    updated_at: "2026-10-15T03:06:43.890Z",
    project: "g-p-6aceca0463ac8191af88a517b0d2d3eb",
  });
  assert.ok(p1.items.some((i) => i.project === null)); // 一般對話與專案對話混排
  assert.deepEqual(parseList(load("list_page2.json")).next, { offset: 56 });
});

test("清單：最後一頁（不滿 limit）next 為 null；空頁也是 null", () => {
  const last = load("list_page2.json");
  last.items = last.items.slice(0, 5);
  assert.equal(parseList(last).next, null);
  assert.equal(parseList({ items: [], limit: 28, offset: 56, total: 57 }).next, null);
});

test("一般對話：訊息數、順序、角色正確；reasoning_recap 被略過；時間為 ISO UTC", () => {
  const c = parseConversation(load("conversation_simple.json"));
  assert.equal(c.platform, "chatgpt");
  assert.equal(c.conv_id, "6ad0425f-e738-83ec-967f-4dc358431e89");
  assert.equal(c.url, "https://chatgpt.com/c/6ad0425f-e738-83ec-967f-4dc358431e89");
  assert.equal(c.title, "介紹台北101");
  assert.equal(c.project, null);
  assert.deepEqual(c.messages.map((m) => m.role), ["user", "assistant", "user", "assistant", "user", "assistant"]);
  assert.equal(c.messages[0].text, "IdeaLedger 測試 A：請用一句話介紹台北 101。");
  assert.equal(c.messages[5].text, "收到");
  assert.match(c.created_at, /^2026-10-\d\dT.*Z$/);
  assert.ok(Date.parse(c.updated_at) > Date.parse(c.created_at));
  for (let i = 1; i < c.messages.length; i++) assert.ok(c.messages[i].at >= c.messages[i - 1].at);
});

test("分支對話：只含使用中的分支（編輯後的訊息與其回覆），被取代的版本不出現", () => {
  const c = parseConversation(load("conversation_branched.json"));
  assert.deepEqual(c.messages.map((m) => m.text), [
    "IdeaLedger 測試 B：請列出三種水果。",
    "1. 蘋果 🍎\n2. 香蕉 🍌\n3. 葡萄 🍇",
    "IdeaLedger 測試 B（編輯版）：再列三種花。",
    "1. 玫瑰 🌹\n2. 向日葵 🌻\n3. 櫻花 🌸",
  ]);
  const all = c.messages.map((m) => m.text).join("\n");
  assert.ok(!all.includes("蔬菜") && !all.includes("高麗菜"));
});

test("分支對話：current_node 指向「再試一次」的另一個版本時，取該版本", () => {
  const json = load("conversation_branched.json");
  json.current_node = Object.keys(json.mapping).find((k) => k.startsWith("622101ae"));
  const c = parseConversation(json);
  assert.equal(c.messages[2].text, "IdeaLedger 測試 B：再列三種蔬菜。");
  assert.equal(c.messages[3].text, "1. 高麗菜 🥬\n2. 胡蘿蔔 🥕\n3. 花椰菜 🥦");
});

test("專案對話：project 有值", () => {
  const c = parseConversation(load("conversation_project.json"));
  assert.equal(c.project, "g-p-6aceca0463ac8191af88a517b0d2d3eb");
  assert.deepEqual(c.messages.map((m) => m.text), [
    "IdeaLedger 測試 C：這是專案內的測試對話，請回「收到 C1」，不用做其他事。",
    "收到 C1",
    "IdeaLedger 測試 C：請回「收到 C2」。",
    "收到 C2",
  ]);
});

test("略過系統、工具、隱藏節點；附件只留檔名", () => {
  const json = load("conversation_project.json");
  const [first] = Object.values(json.mapping).filter((n) => n.message?.author?.role === "user");
  const extra = (id, message) => ({ id, parent: first.id, children: [], message });
  const base = (role, content, metadata = {}) => ({ author: { role }, content, metadata, create_time: 1792033590 });
  // 把目前分支改成：first → system → tool → 隱藏 → 附件訊息
  const chain = [
    extra("sys", base("system", { content_type: "text", parts: ["系統提示"] })),
    extra("tool", base("tool", { content_type: "text", parts: ["工具輸出"] })),
    extra("hidden", base("assistant", { content_type: "text", parts: ["看不到"] }, { is_visually_hidden_from_conversation: true })),
    extra("code", base("assistant", { content_type: "code", text: "print(1)" })),
    extra("att", base("user", { content_type: "multimodal_text", parts: [{ content_type: "image_asset_pointer" }, "看這張圖", { content_type: "image_asset_pointer" }] },
      { attachments: [{ name: "設計圖.png" }] })),
  ];
  let parent = first.id;
  for (const n of chain) {
    n.parent = parent;
    json.mapping[n.id] = n;
    parent = n.id;
  }
  json.current_node = "att";
  const c = parseConversation(json);
  assert.deepEqual(c.messages.map((m) => [m.role, m.text]), [
    ["user", "IdeaLedger 測試 C：這是專案內的測試對話，請回「收到 C1」，不用做其他事。"],
    ["user", "看這張圖\n[附件: 設計圖.png]\n[附件: 圖片]"],
  ]);
});

test("必要欄位缺失或結構損壞 → AdapterFormatError", () => {
  const conv = load("conversation_simple.json");
  const broken = {
    "缺 conversation_id": (j) => delete j.conversation_id,
    "缺 mapping": (j) => delete j.mapping,
    "缺 current_node": (j) => delete j.current_node,
    "current_node 不存在": (j) => (j.current_node = "nope"),
    "缺 update_time": (j) => delete j.update_time,
    "parent 指向不存在的節點": (j) => (j.mapping[j.current_node].parent = "ghost"),
    "parent 迴圈": (j) => (j.mapping[Object.keys(j.mapping)[0]].parent = j.current_node),
  };
  for (const [name, mutate] of Object.entries(broken)) {
    const j = clone(conv);
    mutate(j);
    assert.throws(() => parseConversation(j), AdapterFormatError, name);
  }
  const list = load("list_page1.json");
  for (const mutate of [(j) => delete j.items, (j) => delete j.limit, (j) => delete j.items[0].id, (j) => (j.items[0].update_time = "不是時間")]) {
    const j = clone(list);
    mutate(j);
    assert.throws(() => parseList(j), AdapterFormatError);
  }
});
