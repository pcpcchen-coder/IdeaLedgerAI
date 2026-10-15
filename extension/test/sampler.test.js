// 採樣腳本（T01、T02）：在瀏覽器內就要把個資遮掉，且只發 GET。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assemble } from "../tools/sampler/build-sampler.mjs";

const dir = new URL("../tools/sampler/", import.meta.url);
const read = (f) => readFileSync(new URL(f, dir), "utf-8");

function load(platformFile) {
  // eslint-disable-next-line no-new-func
  return new Function(`${read("sampler-core.js")}\n${read(platformFile)}\nreturn { core: IdeaLedgerSamplerCore, platform: IdeaLedgerSamplerPlatform };`)();
}

const A = "11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const D = "44444444-dddd-4ddd-8ddd-dddddddddddd";
const PRIVATE = "33333333-cccc-4ccc-8ccc-cccccccccccc";
const ORG = "99999999-0000-4000-8000-000000000000";
const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnopqrstu";

function fakeEnv(routes) {
  const calls = [];
  let downloaded = null;
  const env = {
    calls,
    get downloaded() {
      return downloaded;
    },
    fetch: async (path, init) => {
      calls.push({ path, method: init.method, headers: init.headers });
      const hit = Object.entries(routes).find(([prefix]) => path.startsWith(prefix));
      if (!hit) return new Response("not found", { status: 404 });
      return new Response(JSON.stringify(hit[1]), { status: 200 });
    },
    prompt: () => `https://chatgpt.com/c/${A}\nhttps://claude.ai/chat/${B.toUpperCase()}, ${A} https://chatgpt.com/g/g-p-abc/c/${D}`,
    download: (name, text) => {
      downloaded = { name, text };
    },
    sleep: async () => {},
    log: () => {},
    now: () => new Date("2026-10-15T12:00:00Z"),
  };
  return env;
}

test("網址解析：依序、去重、轉小寫", () => {
  const { core } = load("sampler-chatgpt.js");
  assert.deepEqual(core.idsFromInput(`x/${A} ${A.toUpperCase()},${B}`), [A, B]);
  assert.deepEqual(core.idsFromInput(""), []);
});

test("ChatGPT 採樣：遮蔽 token、email、非測試標題，只發 GET，標出哪些測試對話在清單中", async () => {
  const { core, platform } = load("sampler-chatgpt.js");
  const env = fakeEnv({
    "/api/auth/session": { user: { id: "user-x", name: "陳某某", email: "someone@example.com" }, accessToken: JWT, expires: "2026-11-01" },
    "/backend-api/conversations?offset=0": { items: [{ id: A, title: "IdeaLedger 測試 A" }, { id: PRIVATE, title: "私人：家庭旅行計畫" }], total: 2 },
    "/backend-api/conversations?offset=28": { items: [], total: 2 },
    [`/backend-api/conversation/${A}`]: { conversation_id: A, title: "IdeaLedger 測試 A", current_node: "n2", mapping: { n1: {}, n2: {} } },
    [`/backend-api/conversation/${B}`]: { conversation_id: B, title: "IdeaLedger 測試 B" },
    [`/backend-api/conversation/${D}`]: { conversation_id: D, title: "IdeaLedger 測試 D" },
  });
  const out = await core.run(platform, env);
  const text = env.downloaded.text;

  assert.equal(env.downloaded.name, "idealedger_chatgpt_sample.json");
  for (const secret of [JWT, "someone@example.com", "陳某某", "私人：家庭旅行計畫"]) {
    assert.ok(!text.includes(secret), `輸出不得含「${secret}」`);
  }
  assert.ok(env.calls.every((c) => c.method === "GET"));
  assert.equal(env.calls[1].headers.Authorization, `Bearer ${JWT}`, "後續請求要帶 token，但 token 不寫進檔案");

  const session = out.requests.find((r) => r.name === "session").body;
  assert.equal(session.accessToken, "<string>");
  const list = out.requests.find((r) => r.name === "list_page1").body.items;
  assert.equal(list[0].title, "IdeaLedger 測試 A");
  assert.equal(list[1].title, core.MASK);

  assert.deepEqual(out.tests.map((t) => [t.label, t.found_in_lists]), [
    ["simple", true], ["branched", false], ["project", false],
  ]);
  assert.ok(out.requests.some((r) => r.name === "conversation_simple" && r.body.mapping));
  assert.equal(out.requests.find((r) => r.name === "conversation_simple").path, "/backend-api/conversation/{id}");
});

test("Claude 採樣：組織 ID 換成佔位、組織名稱遮蔽、路徑不含組織 ID", async () => {
  const { core, platform } = load("sampler-claude.js");
  const env = fakeEnv({
    "/api/organizations/": [],
    "/api/organizations": [{ uuid: ORG, name: "someone@example.com's Organization", capabilities: ["chat"] }],
  });
  // 清單與單篇對話（路徑含組織 ID）
  const base = `/api/organizations/${ORG}`;
  const routes = {
    [`${base}/chat_conversations?limit=30&offset=0`]: [{ uuid: A, name: "IdeaLedger 測試 A", updated_at: "2026-10-15T01:00:00Z" }, { uuid: PRIVATE, name: "私人對話" }],
    [`${base}/chat_conversations?limit=30&offset=30`]: [],
    [`${base}/chat_conversations/${A}`]: { uuid: A, name: "IdeaLedger 測試 A", chat_messages: [{ sender: "human", text: "IdeaLedger 測試" }] },
    "/api/organizations": [{ uuid: ORG, name: "someone@example.com's Organization", capabilities: ["chat"] }],
  };
  env.fetch = async (path, init) => {
    env.calls.push({ path, method: init.method });
    const key = Object.keys(routes).find((p) => path === p || path.startsWith(p + "?") || path.startsWith(p));
    return key ? new Response(JSON.stringify(routes[key]), { status: 200 }) : new Response("", { status: 404 });
  };
  env.prompt = () => `https://claude.ai/chat/${A}`;

  const out = await core.run(platform, env);
  const text = env.downloaded.text;
  assert.ok(!text.includes(ORG), "組織 ID 不得出現在輸出");
  assert.ok(text.includes("ORG_1"));
  assert.ok(!text.includes("someone@example.com"));
  assert.ok(!text.includes("私人對話"));
  assert.ok(out.requests.every((r) => !r.path.includes(ORG)));
  assert.deepEqual(out.tests, [{ label: "simple", id: A, found_in_lists: true }]);
  assert.equal(out.requests.find((r) => r.name === "conversation_simple").body.chat_messages[0].sender, "human");
  assert.ok(env.calls.every((c) => c.method === "GET"));
});

test("沒有貼網址就取消", async () => {
  const { core, platform } = load("sampler-chatgpt.js");
  const env = fakeEnv({});
  env.prompt = () => "";
  await assert.rejects(core.run(platform, env), /沒有讀到/);
  assert.equal(env.calls.length, 0);
});

test("提交進 repo 的主控台腳本與原始碼一致（改了原始碼要執行 npm run sampler）", () => {
  for (const name of ["chatgpt", "claude"]) {
    assert.equal(read(`out/${name}.console.js`), assemble(`sampler-${name}.js`), `${name}.console.js 需要重新產生`);
  }
});
