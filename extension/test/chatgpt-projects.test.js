// T25：ChatGPT 專案名稱（以名稱取代 g-p- ID）。樣本見 fixtures/chatgpt/projects_page*.json 與 NOTES「專案名稱」。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseProjects } from "../src/adapters/chatgpt/parse.js";
import { createChatgptClient, PROJECTS_REFRESH_MS } from "../src/adapters/chatgpt/fetch.js";
import { AdapterFormatError, RateLimited } from "../src/lib/errors.js";
import { fakeClock } from "./helpers.js";

const fixture = (name) => JSON.parse(readFileSync(new URL(`../fixtures/chatgpt/${name}`, import.meta.url), "utf8"));
const TEST_ID = "g-p-6ad07a98e7b881919efa7d794aa41eb9";
const NINE_G = "g-p-6aceca0463ac8191af88a517b0d2d3eb"; // conversation_project.json 的專案（名稱已遮蔽）
const MASKED = "（其他專案，已遮蔽）";

function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const hit = routes.find(([m]) => (typeof m === "string" ? url.startsWith(m) : m(url)));
    if (!hit) throw new Error(`未預期的請求：${url}`);
    const r = typeof hit[1] === "function" ? hit[1](calls.length) : hit[1];
    const { status = 200, body } = r;
    return { ok: status >= 200 && status < 300, status, json: async () => structuredClone(body) };
  };
  fn.calls = calls;
  return fn;
}

const SESSION = ["/api/auth/session", { body: fixture("session.json") }];
const SIDEBAR = "/backend-api/gizmos/snorlax/sidebar?conversations_per_gizmo=0&limit=20&owned_only=false";
const page1 = [(u) => u === SIDEBAR, { body: fixture("projects_page1.json") }];
const page2 = [(u) => u.startsWith(`${SIDEBAR}&cursor=`), { body: fixture("projects_page2.json") }];

function client(routes) {
  const fetch = fakeFetch(routes);
  const clock = fakeClock();
  return { client: createChatgptClient({ fetch, clock }), fetch, clock };
}
const sidebarCalls = (fetch) => fetch.calls.filter((c) => c.url.startsWith(SIDEBAR)).length;

test("parseProjects：取出測試專案名稱與下一頁 cursor；最後一頁 cursor 為 null", () => {
  const p1 = parseProjects(fixture("projects_page1.json"));
  assert.equal(p1.names[TEST_ID], "IdeaLedger 測試專案");
  assert.equal(p1.names[NINE_G], MASKED);
  assert.equal(Object.keys(p1.names).length, 20);
  assert.equal(typeof p1.cursor, "string");
  const p2 = parseProjects(fixture("projects_page2.json"));
  assert.equal(p2.cursor, null);
  assert.equal(Object.keys(p2.names).length, 17);
});

test("parseProjects：變造樣本 → AdapterFormatError", () => {
  assert.throws(() => parseProjects([]), AdapterFormatError);
  assert.throws(() => parseProjects({ cursor: null }), AdapterFormatError);
  assert.throws(() => parseProjects({ items: [{ gizmo: {} }], cursor: null }), AdapterFormatError);
  assert.throws(() => parseProjects({ items: [], cursor: 5 }), AdapterFormatError);
});

test("清單與單篇的 project 為名稱；名稱表讀完兩頁後快取，只請求一次", async () => {
  const { client: c, fetch } = client([
    SESSION,
    page1,
    page2,
    ["/backend-api/conversations?offset=0&", { body: fixture("list_page1.json") }],
    ["/backend-api/conversation/", { body: fixture("conversation_project.json") }],
  ]);
  const list = await c.listUpdated(null);
  const proj = list.items.find((i) => i.id === "6ad04335-ce98-83ec-910b-0046d770b040");
  assert.equal(proj.project, MASKED); // 名稱（fixture 中已遮蔽），不是 g-p- ID
  assert.ok(list.items.filter((i) => i.project == null).length > 0, "一般對話仍為 null");
  const conv = await c.getConversation("6ad04335-ce98-83ec-910b-0046d770b040");
  assert.equal(conv.project, MASKED);
  assert.equal(sidebarCalls(fetch), 2); // 兩頁各一次，之後都用快取
  for (const call of fetch.calls) assert.equal(call.init.method, "GET");
});

test("新的專案 ID：超過重讀間隔才重讀名稱表；仍沒有就保留 ID", async () => {
  const unknown = { ...fixture("conversation_project.json"), gizmo_id: "g-p-ffffffffffffffffffffffffffffffff" };
  const { client: c, fetch, clock } = client([SESSION, page1, page2, ["/backend-api/conversation/", { body: unknown }]]);
  assert.equal((await c.getConversation("x")).project, "g-p-ffffffffffffffffffffffffffffffff");
  assert.equal(sidebarCalls(fetch), 2);
  await c.getConversation("x"); // 同一輪內不重讀
  assert.equal(sidebarCalls(fetch), 2);
  clock.advance(PROJECTS_REFRESH_MS);
  assert.equal((await c.getConversation("x")).project, "g-p-ffffffffffffffffffffffffffffffff");
  assert.equal(sidebarCalls(fetch), 4); // 重讀一次（兩頁）
});

test("名稱表失敗（5xx）時對話照常輸出，project 保留 ID", async () => {
  const { client: c } = client([SESSION, [(u) => u.startsWith(SIDEBAR), { status: 502 }], ["/backend-api/conversation/", { body: fixture("conversation_project.json") }]]);
  assert.equal((await c.getConversation("x")).project, NINE_G);
});

test("名稱表 429 照常拋出 RateLimited（交給退避）", async () => {
  const { client: c } = client([SESSION, [(u) => u.startsWith(SIDEBAR), { status: 429 }], ["/backend-api/conversation/", { body: fixture("conversation_project.json") }]]);
  await assert.rejects(c.getConversation("x"), RateLimited);
});
