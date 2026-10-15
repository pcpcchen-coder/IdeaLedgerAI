// T07 取資料層：以假 fetch 回傳 fixtures，檢查請求、快取、401 重取、錯誤對應與只發 GET。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createChatgptClient } from "../src/adapters/chatgpt/fetch.js";
import { createClaudeClient } from "../src/adapters/claude/fetch.js";
import { AdapterFormatError, NeedsLogin, RateLimited } from "../src/lib/errors.js";
import { MIN_GAP_MS } from "../src/lib/http.js";
import { fakeClock } from "./helpers.js";

const fixture = (platform, name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/${platform}/${name}`, import.meta.url), "utf8"));

/** 假 fetch：routes 是 [比對函式或字串前綴, 回應] 陣列；回應可以是函式（每次呼叫產生）。記錄每次請求。 */
function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const hit = routes.find(([m]) => (typeof m === "string" ? url.startsWith(m) : m(url)));
    if (!hit) throw new Error(`未預期的請求：${url}`);
    const r = typeof hit[1] === "function" ? hit[1](calls.length) : hit[1];
    const { status = 200, body, text } = r;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => (text !== undefined ? JSON.parse(text) : structuredClone(body)),
    };
  };
  fn.calls = calls;
  return fn;
}

const chatgpt = (routes) => {
  const fetch = fakeFetch(routes);
  const clock = fakeClock();
  return { client: createChatgptClient({ fetch, clock }), fetch, clock };
};
const claude = (routes) => {
  const fetch = fakeFetch(routes);
  const clock = fakeClock();
  return { client: createClaudeClient({ fetch, clock }), fetch, clock };
};

const SESSION = ["/api/auth/session", { body: fixture("chatgpt", "session.json") }];

// ---- ChatGPT ----

test("ChatGPT：清單與單篇輸出正確；權杖只取一次並帶在 Authorization", async () => {
  const { client, fetch } = chatgpt([
    SESSION,
    ["/backend-api/conversations?offset=0&", { body: fixture("chatgpt", "list_page1.json") }],
    ["/backend-api/conversations?offset=28&", { body: fixture("chatgpt", "list_page2.json") }],
    ["/backend-api/conversation/", { body: fixture("chatgpt", "conversation_simple.json") }],
  ]);
  assert.deepEqual(await client.checkLogin(), { ok: true });
  const p1 = await client.listUpdated(null);
  assert.equal(p1.items.length, 28);
  const p2 = await client.listUpdated(p1.next);
  assert.deepEqual(p2.next, { offset: 56 });
  const conv = await client.getConversation("6ad0425f-e738-83ec-967f-4dc358431e89");
  assert.equal(conv.messages.length, 6);

  assert.deepEqual(fetch.calls.map((c) => c.url), [
    "/api/auth/session",
    "/backend-api/conversations?offset=0&limit=28&order=updated",
    "/backend-api/gizmos/snorlax/sidebar?conversations_per_gizmo=0&limit=20&owned_only=false", // 專案名稱表（T25），只讀一次
    "/backend-api/conversations?offset=28&limit=28&order=updated",
    "/backend-api/conversation/6ad0425f-e738-83ec-967f-4dc358431e89",
  ]);
  for (const c of fetch.calls.slice(1)) assert.equal(c.init.headers.Authorization, "Bearer [REDACTED]");
  for (const c of fetch.calls) assert.ok(c.init.method === "GET" && c.init.credentials === "include");
});

test("ChatGPT：未登入（session 沒有 accessToken）→ checkLogin 回 ok:false", async () => {
  const { client } = chatgpt([["/api/auth/session", { body: { WARNING_BANNER: "x" } }]]);
  const r = await client.checkLogin();
  assert.equal(r.ok, false);
  assert.match(r.reason, /未登入/);
});

test("ChatGPT：401 時清掉權杖重取一次；再 401 就放棄（不無限重試）", async () => {
  let listCalls = 0;
  const { client, fetch } = chatgpt([
    SESSION,
    ["/backend-api/conversations", () => (++listCalls === 1 ? { status: 401 } : { body: fixture("chatgpt", "list_page1.json") })],
  ]);
  assert.equal((await client.listUpdated(null)).items.length, 28);
  assert.deepEqual(fetch.calls.map((c) => c.url.split("?")[0]), [
    "/api/auth/session", "/backend-api/conversations", "/api/auth/session", "/backend-api/conversations",
    "/backend-api/gizmos/snorlax/sidebar", // 清單有專案對話時讀名稱表（T25）
  ]);

  const always = chatgpt([SESSION, ["/backend-api/conversations", { status: 401 }]]);
  await assert.rejects(always.client.listUpdated(null), NeedsLogin);
  assert.equal(always.fetch.calls.filter((c) => c.url === "/api/auth/session").length, 2);
  assert.equal(always.fetch.calls.length, 4);
});

test("ChatGPT：403、429 → RateLimited；格式錯誤 → AdapterFormatError；5xx → 一般錯誤", async () => {
  for (const status of [403, 429]) {
    const { client } = chatgpt([SESSION, ["/backend-api/conversations", { status }]]);
    await assert.rejects(client.listUpdated(null), RateLimited);
  }
  const bad = chatgpt([SESSION, ["/backend-api/conversation/", { body: { title: "缺 mapping" } }]]);
  await assert.rejects(bad.client.getConversation("x"), AdapterFormatError);
  const notJson = chatgpt([SESSION, ["/backend-api/conversations", { text: "<html>" }]]);
  await assert.rejects(notJson.client.listUpdated(null), AdapterFormatError);
  const down = chatgpt([SESSION, ["/backend-api/conversations", { status: 502 }]]);
  await assert.rejects(down.client.listUpdated(null), (e) => e.name === "HttpError" && e.status === 502);
});

test("同一個操作內的連續請求也間隔 ≥3 秒", async () => {
  const { client, clock } = chatgpt([SESSION, ["/backend-api/conversations", { body: fixture("chatgpt", "list_page1.json") }]]);
  await client.listUpdated(null); // 取權杖 + 清單 + 專案名稱表（T25）= 三次請求
  assert.deepEqual(clock.sleeps, [MIN_GAP_MS, MIN_GAP_MS]);
});

// ---- Claude ----

const ORGS = ["/api/organizations", { body: fixture("claude", "organizations.json") }];
const isOrgs = (u) => u === "/api/organizations";

test("Claude：取 chat 組織、清單與單篇輸出正確；專案名稱由清單帶到單篇", async () => {
  const { client, fetch } = claude([
    [isOrgs, ORGS[1]],
    ["/api/organizations/ORG_1/chat_conversations?limit=30&offset=0", { body: fixture("claude", "list_page1.json") }],
    ["/api/organizations/ORG_1/chat_conversations?limit=30&offset=30", { body: fixture("claude", "list_page2.json") }],
    ["/api/organizations/ORG_1/chat_conversations/", { body: fixture("claude", "conversation_project.json") }],
  ]);
  assert.deepEqual(await client.checkLogin(), { ok: true });
  const p1 = await client.listUpdated(null);
  assert.deepEqual(p1.next, { offset: 30 });
  assert.equal((await client.listUpdated(p1.next)).items.length, 30);
  const conv = await client.getConversation("3791b027-8d83-4e71-9598-60cedf1126fc");
  assert.equal(conv.project, "（其他對話，已遮蔽）"); // 清單上的專案名稱（fixture 中已遮蔽），不是 project_uuid
  assert.equal(fetch.calls.filter((c) => isOrgs(c.url)).length, 1); // 組織 ID 快取
  assert.equal(
    fetch.calls.at(-1).url,
    "/api/organizations/ORG_1/chat_conversations/3791b027-8d83-4e71-9598-60cedf1126fc?tree=True&rendering_mode=messages&render_all_tools=true",
  );
  for (const c of fetch.calls) assert.ok(c.init.method === "GET" && c.init.credentials === "include" && !c.init.headers.Authorization);
});

const PROJECT_URL = "/api/organizations/ORG_1/projects/01a13d2c-ba34-737e-9f8d-b4b555f7a468";

test("Claude：沒在清單看過的對話，查專案取名稱；同一專案只查一次", async () => {
  const { client, fetch } = claude([
    [isOrgs, ORGS[1]],
    ["/api/organizations/ORG_1/chat_conversations/", { body: fixture("claude", "conversation_project.json") }],
    [PROJECT_URL, { body: { uuid: "01a13d2c-ba34-737e-9f8d-b4b555f7a468", name: "測試專案" } }],
  ]);
  assert.equal((await client.getConversation("3791b027-8d83-4e71-9598-60cedf1126fc")).project, "測試專案");
  assert.equal((await client.getConversation("3791b027-8d83-4e71-9598-60cedf1126fc")).project, "測試專案");
  assert.equal(fetch.calls.filter((c) => c.url === PROJECT_URL).length, 1);
  for (const c of fetch.calls) assert.equal(c.init.method, "GET");
});

test("Claude：專案查不到（404）退回 project_uuid；沒有專案的對話不查", async () => {
  const { client, fetch } = claude([
    [isOrgs, ORGS[1]],
    ["/api/organizations/ORG_1/chat_conversations/3791", { body: fixture("claude", "conversation_project.json") }],
    ["/api/organizations/ORG_1/chat_conversations/0c9a", { body: fixture("claude", "conversation_simple.json") }],
    [PROJECT_URL, { status: 404, body: {} }],
  ]);
  assert.equal((await client.getConversation("3791b027-8d83-4e71-9598-60cedf1126fc")).project, "01a13d2c-ba34-737e-9f8d-b4b555f7a468");
  assert.equal((await client.getConversation("0c9aaaff-0eaa-4de1-b593-1ccaac18b464")).project, null);
  assert.equal(fetch.calls.filter((c) => c.url.includes("/projects/")).length, 1);
});

test("Claude：查專案遇到限流照常拋出（交給退避）", async () => {
  const { client } = claude([
    [isOrgs, ORGS[1]],
    ["/api/organizations/ORG_1/chat_conversations/", { body: fixture("claude", "conversation_project.json") }],
    [PROJECT_URL, { status: 429, body: {} }],
  ]);
  await assert.rejects(client.getConversation("3791b027-8d83-4e71-9598-60cedf1126fc"), RateLimited);
});

test("Claude：/api/organizations 回 403 代表未登入（不是限流）；沒有 chat 組織也是未登入", async () => {
  const forbidden = claude([[isOrgs, { status: 403 }]]);
  assert.equal((await forbidden.client.checkLogin()).ok, false);
  const apiOnly = claude([[isOrgs, { body: fixture("claude", "organizations.json").filter((o) => o.uuid === "ORG_2") }]]);
  assert.equal((await apiOnly.client.checkLogin()).ok, false);
});

test("Claude：清單 403、429 → RateLimited；401 重取組織一次後放棄", async () => {
  for (const status of [403, 429]) {
    const { client } = claude([[isOrgs, ORGS[1]], ["/api/organizations/ORG_1/", { status }]]);
    await assert.rejects(client.listUpdated(null), RateLimited);
  }
  const { client, fetch } = claude([[isOrgs, ORGS[1]], ["/api/organizations/ORG_1/", { status: 401 }]]);
  await assert.rejects(client.listUpdated(null), NeedsLogin);
  assert.equal(fetch.calls.filter((c) => isOrgs(c.url)).length, 2);
  assert.equal(fetch.calls.length, 4);
});

// ---- 只讀 ----

test("對平台的請求全為 GET：adapters 與 lib 中沒有 GET 以外的 method", () => {
  const root = new URL("../src/", import.meta.url).pathname;
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith(".js")) files.push(p);
    }
  };
  walk(join(root, "adapters"));
  walk(join(root, "lib"));
  const methods = files.flatMap((f) =>
    [...readFileSync(f, "utf8").matchAll(/method\s*:\s*["'`]?(\w+)/g)].map((m) => [f, m[1]]),
  );
  assert.ok(methods.length > 0, "至少要找到 lib/http.js 的 method");
  assert.deepEqual(methods.filter(([, m]) => m !== "GET"), []);
});
