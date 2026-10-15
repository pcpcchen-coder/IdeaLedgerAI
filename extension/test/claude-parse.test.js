// T05 Claude 解析層：以 T02 的 fixtures 測試（欄位依 fixtures/claude/NOTES.md）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseOrganizations, parseList, parseConversation } from "../src/adapters/claude/parse.js";
import { AdapterFormatError, NeedsLogin } from "../src/lib/errors.js";

const load = (name) => JSON.parse(readFileSync(new URL(`../fixtures/claude/${name}`, import.meta.url), "utf8"));
const clone = (v) => structuredClone(v);

test("組織：取 capabilities 含 chat 的組織；沒有 → NeedsLogin；不是陣列 → AdapterFormatError", () => {
  assert.deepEqual(parseOrganizations(load("organizations.json")), { orgId: "ORG_1" });
  assert.deepEqual(parseOrganizations(load("organizations.json").reverse()), { orgId: "ORG_1" });
  assert.throws(() => parseOrganizations(load("organizations.json").filter((o) => o.uuid === "ORG_2")), NeedsLogin);
  assert.throws(() => parseOrganizations({ error: "forbidden" }), AdapterFormatError);
});

test("清單：項目數、欄位、時間轉 ISO UTC；滿頁有 next，不滿 limit 或空頁 next 為 null", () => {
  const p1 = parseList(load("list_page1.json"), { offset: 0, limit: 30 });
  assert.equal(p1.items.length, 30);
  assert.deepEqual(p1.next, { offset: 30 });
  assert.deepEqual(p1.items[0], {
    id: "c4f95a94-1376-4be0-9685-8d5c917e82a0",
    title: "IdeaLedger 測試 E 附件行數",
    updated_at: "2026-10-15T03:02:01.224Z",
    project: null,
  });
  const c = p1.items.find((i) => i.id === "3791b027-8d83-4e71-9598-60cedf1126fc");
  assert.equal(c.project, "（其他對話，已遮蔽）"); // 清單帶 project.name（fixture 中已遮蔽）
  assert.deepEqual(parseList(load("list_page2.json"), { offset: 30, limit: 30 }).next, { offset: 60 });
  assert.equal(parseList(load("list_page2.json").slice(0, 7), { offset: 30, limit: 30 }).next, null);
  assert.equal(parseList([], { offset: 60, limit: 30 }).next, null);
});

test("一般對話：訊息數、順序、角色正確；thinking 區塊被略過", () => {
  const c = parseConversation(load("conversation_simple.json"));
  assert.equal(c.platform, "claude");
  assert.equal(c.conv_id, "0c9aaaff-0eaa-4de1-b593-1ccaac18b464");
  assert.equal(c.url, "https://claude.ai/chat/0c9aaaff-0eaa-4de1-b593-1ccaac18b464");
  assert.equal(c.title, "台北 101 介紹");
  assert.equal(c.project, null);
  assert.deepEqual(c.messages.map((m) => m.role), ["user", "assistant", "user", "assistant", "user", "assistant"]);
  assert.equal(c.messages[0].text, "IdeaLedger 測試 A：請用一句話介紹台北 101。");
  assert.ok(c.messages[1].text.startsWith("台北 101 是位於台北信義區"));
  assert.equal(c.messages[5].text, "收到");
  assert.equal(c.created_at, "2026-10-15T02:56:18.648Z");
  assert.equal(c.messages[5].at, "2026-10-15T02:56:47.920Z");
});

test("分支對話：只含使用中的分支（編輯後的訊息與其回覆），重試與被取代的版本不出現", () => {
  const c = parseConversation(load("conversation_branched.json"));
  assert.deepEqual(c.messages.map((m) => m.text), [
    "IdeaLedger 測試 B：請列出三種水果。",
    "1. 蘋果\n2. 香蕉\n3. 芒果",
    "IdeaLedger 測試 B（編輯版）：再列三種花。",
    "1. 玫瑰\n2. 向日葵\n3. 櫻花",
  ]);
});

test("分支對話：葉節點指向重試的版本時，取該分支（不依 index 排序）", () => {
  const json = load("conversation_branched.json");
  json.current_leaf_message_uuid = json.chat_messages.find((m) => m.uuid.startsWith("568835a3")).uuid;
  const c = parseConversation(json);
  assert.deepEqual(c.messages.map((m) => m.text.split("\n")[0]), [
    "IdeaLedger 測試 B：請列出三種水果。", "1. 蘋果", "IdeaLedger 測試 B：再列三種蔬菜。", "1. 高麗菜",
  ]);
  assert.equal(c.messages[3].at, "2026-10-15T02:58:10.939Z"); // 是 index 4 那一則
});

test("專案對話：project 有值；清單提供名稱時以名稱為準", () => {
  const json = load("conversation_project.json");
  assert.equal(parseConversation(json).project, "01a13d2c-ba34-737e-9f8d-b4b555f7a468");
  assert.equal(parseConversation(json, { project: "測試專案" }).project, "測試專案");
  assert.deepEqual(parseConversation(json).messages.map((m) => m.text), [
    "IdeaLedger 測試 C：這是專案內的測試對話，請回「收到 C1」，不用做其他事。",
    "收到 C1",
    "IdeaLedger 測試 C：請回「收到 C2」。",
    "收到 C2",
  ]);
});

test("附件對話：含 [附件: 檔名]，不含檔案內容", () => {
  const json = load("conversation_attachment.json");
  const content = json.chat_messages[0].attachments[0].extracted_content;
  assert.ok(content.length > 0);
  const c = parseConversation(json);
  assert.equal(c.messages[0].text, "IdeaLedger 測試 E：附件有幾行？\n[附件: idealedger_test_E.txt]");
  assert.ok(!JSON.stringify(c).includes(content));
});

test("圖片等 files 也只留檔名；沒有 content 時退回頂層 text", () => {
  const json = load("conversation_simple.json");
  const first = json.chat_messages[0];
  first.files = [{ file_name: "截圖.png", preview_url: "/x" }];
  delete json.chat_messages[2].content;
  json.chat_messages[2].text = "只有頂層 text 的訊息"; // 樣本中頂層 text 都是空字串
  const c = parseConversation(json);
  assert.equal(c.messages[0].text, "IdeaLedger 測試 A：請用一句話介紹台北 101。\n[附件: 截圖.png]");
  assert.equal(c.messages[2].text, "只有頂層 text 的訊息");
});

test("必要欄位缺失或結構損壞 → AdapterFormatError", () => {
  const conv = load("conversation_simple.json");
  const broken = {
    "缺 uuid": (j) => delete j.uuid,
    "缺 chat_messages": (j) => delete j.chat_messages,
    "缺 current_leaf_message_uuid": (j) => delete j.current_leaf_message_uuid,
    "葉節點不存在": (j) => (j.current_leaf_message_uuid = "nope"),
    "缺 updated_at": (j) => delete j.updated_at,
    "parent 指向不存在的訊息": (j) => (j.chat_messages[3].parent_message_uuid = "ghost"),
    "parent 迴圈": (j) => (j.chat_messages[0].parent_message_uuid = j.current_leaf_message_uuid),
  };
  for (const [name, mutate] of Object.entries(broken)) {
    const j = clone(conv);
    mutate(j);
    assert.throws(() => parseConversation(j), AdapterFormatError, name);
  }
  for (const mutate of [(j) => ({ items: j }), (j) => (delete j[0].uuid, j), (j) => ((j[0].updated_at = "不是時間"), j)]) {
    assert.throws(() => parseList(mutate(load("list_page1.json"))), AdapterFormatError);
  }
});

test("沒有訊息的新對話：messages 為空陣列", () => {
  const json = load("conversation_simple.json");
  json.chat_messages = [];
  json.current_leaf_message_uuid = null;
  assert.deepEqual(parseConversation(json).messages, []);
});
