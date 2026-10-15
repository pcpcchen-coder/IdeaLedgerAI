// T18 設定頁免程式新增平台：以假網域與假 chrome API 測試新增、刪除、權限被拒、id 衝突、啟動對齊與頁面擷取。
import { test } from "node:test";
import assert from "node:assert/strict";
import { createCustomManager, PermissionDenied } from "../src/bg/custom.js";
import { memoryStorage } from "../src/bg/state.js";
import {
  buildPageConversation, createCustomPlatform, extractConvId, MIN_TEXT, skipReason, slugify, uniqueId,
} from "../src/lib/custom-platforms.js";
import { CollectorOffline } from "../src/lib/errors.js";

const REGISTERED = [
  { id: "chatgpt", name: "ChatGPT", hosts: ["chatgpt.com"] },
  { id: "claude", name: "Claude", hosts: ["claude.ai"] },
];
const GROK = { name: "Grok", host: "grok.example", idPattern: "/c/([\\w-]+)" };
const LONG = "IdeaLedger 測試 G：".padEnd(MIN_TEXT + 10, "內容");

function fakeChrome({ grant = true } = {}) {
  const calls = [];
  const scripts = new Map();
  const origins = new Set();
  return {
    calls,
    scripts,
    origins,
    storage: memoryStorage(),
    permissions: {
      async request({ origins: o }) {
        calls.push(["permissions.request", o]);
        if (grant) o.forEach((x) => origins.add(x));
        return grant;
      },
      async remove({ origins: o }) {
        calls.push(["permissions.remove", o]);
        o.forEach((x) => origins.delete(x));
        return true;
      },
    },
    scripting: {
      async registerContentScripts(list) {
        calls.push(["register", list.map((s) => s.id)]);
        for (const s of list) {
          if (scripts.has(s.id)) throw new Error(`重複的 id：${s.id}`);
          scripts.set(s.id, s);
        }
      },
      async unregisterContentScripts({ ids }) {
        calls.push(["unregister", ids]);
        ids.forEach((id) => scripts.delete(id));
      },
      async getRegisteredContentScripts() {
        return [...scripts.values()];
      },
    },
  };
}
const manager = (c) => createCustomManager({ ...c, registered: REGISTERED });

// ---- 純函式 ----

test("平台 id：由名稱產生、符合格式；中文名稱用 custom；避開已用的 id", () => {
  assert.equal(slugify("Grok"), "grok");
  assert.equal(slugify("Le Chat (Mistral)"), "le-chat-mistral");
  assert.equal(slugify("Kimi 2.0"), "kimi-2-0");
  assert.equal(slugify("文心一言"), "custom");
  assert.equal(slugify("123abc"), "abc");
  assert.equal(uniqueId("grok", ["grok", "grok-2"]), "grok-3");
});

test("輸入檢查：網域格式、網域重複、規則需要括號；id 與內建平台衝突時加尾碼", () => {
  const p = createCustomPlatform({ ...GROK, host: " Grok.Example " }, { registered: REGISTERED });
  assert.deepEqual(p, { id: "grok", name: "Grok", hosts: ["grok.example"], idPattern: "/c/([\\w-]+)" });
  const clash = createCustomPlatform({ name: "ChatGPT", host: "chat.example", idPattern: "/c/(\\w+)" }, { registered: REGISTERED });
  assert.equal(clash.id, "chatgpt-2");
  const errs = {
    "https://grok.example": /網域格式/,
    "grok.example/chat": /網域格式/,
    "chatgpt.com": /已經屬於平台 ChatGPT/,
  };
  for (const [host, re] of Object.entries(errs)) assert.throws(() => createCustomPlatform({ ...GROK, host }, { registered: REGISTERED }), re);
  assert.throws(() => createCustomPlatform({ ...GROK, idPattern: "/c/\\w+" }), /括號/);
  assert.throws(() => createCustomPlatform({ ...GROK, idPattern: "/c/([" }), /正規式/);
  assert.throws(() => createCustomPlatform({ ...GROK, name: " " }), /顯示名稱/);
});

test("擷取判斷：對話 ID 取自網址；臨時對話、#nolog、太短、規則不符時不送", () => {
  assert.equal(extractConvId(GROK.idPattern, "/c/abc-123"), "abc-123");
  assert.equal(extractConvId(GROK.idPattern, "/settings"), null);
  assert.equal(skipReason({ convId: "a", text: LONG }), null);
  assert.equal(skipReason({ convId: null, text: LONG }), "網址不是對話頁");
  assert.equal(skipReason({ convId: "a", search: "?temporary-chat=true", text: LONG }), "臨時對話");
  assert.equal(skipReason({ convId: "a", text: LONG + " #nolog" }), "#nolog");
  assert.equal(skipReason({ convId: "a", text: "短" }), "文字太短");
});

test("送出內容符合 collector 頁面擷取格式", () => {
  const p = createCustomPlatform(GROK);
  const c = buildPageConversation(p, { conv_id: "abc", url: "https://grok.example/c/abc", title: "t", text: LONG },
    { firstSeen: "2026-10-15T01:00:00.000Z", now: "2026-10-15T02:00:00.000Z", sweeper: "mac-mini" });
  assert.deepEqual(c, {
    platform: "grok", platform_name: "Grok", capture: "page", conv_id: "abc", title: "t",
    url: "https://grok.example/c/abc", project: null, created_at: "2026-10-15T01:00:00.000Z",
    updated_at: "2026-10-15T02:00:00.000Z", messages: [], page_text: LONG,
    swept_at: "2026-10-15T02:00:00.000Z", sweeper: "mac-mini",
  });
});

// ---- 註冊與移除 ----

test("新增：先要權限、再注入、最後儲存", async () => {
  const c = fakeChrome();
  const p = await manager(c).add(GROK, []);
  assert.equal(p.id, "grok");
  assert.deepEqual(c.calls, [["permissions.request", ["https://grok.example/*"]], ["register", ["custom-grok"]]]);
  assert.deepEqual(c.scripts.get("custom-grok").matches, ["https://grok.example/*"]);
  assert.deepEqual(c.scripts.get("custom-grok").js, ["page-capture.js"]);
  assert.deepEqual(await manager(c).list(), [p]);
});

test("權限被拒：不注入、不儲存，回傳清楚的錯誤", async () => {
  const c = fakeChrome({ grant: false });
  await assert.rejects(manager(c).add(GROK, []), (e) => e instanceof PermissionDenied && /grok\.example/.test(e.message));
  assert.equal(c.scripts.size, 0);
  assert.deepEqual(await manager(c).list(), []);
});

test("id 衝突：與其他自訂平台同名時加尾碼；網域重複時拒絕（不要求權限）", async () => {
  const c = fakeChrome();
  const m = manager(c);
  const first = await m.add(GROK, []);
  const second = await m.add({ ...GROK, host: "grok2.example" }, await m.list());
  assert.equal(second.id, "grok-2");
  const before = c.calls.length;
  await assert.rejects(m.add({ ...GROK, name: "另一個" }, await m.list()), /已經屬於平台 Grok/);
  assert.equal(c.calls.length, before);
  assert.deepEqual((await m.list()).map((p) => p.id), [first.id, "grok-2"]);
});

test("刪除：解除注入、收回權限、刪除設定", async () => {
  const c = fakeChrome();
  const m = manager(c);
  await m.add(GROK, []);
  assert.equal(await m.remove("grok"), true);
  assert.equal(c.scripts.size, 0);
  assert.equal(c.origins.size, 0);
  assert.deepEqual(await m.list(), []);
  assert.equal(await m.remove("grok"), false);
});

test("啟動對齊：補注入缺的、移除沒有對應設定的（不動非自訂的注入）", async () => {
  const c = fakeChrome();
  await c.storage.set({ customPlatforms: [createCustomPlatform(GROK)] });
  c.scripts.set("custom-old", { id: "custom-old" });
  c.scripts.set("something-else", { id: "something-else" });
  const r = await manager(c).sync();
  assert.deepEqual(r, { added: ["grok"], removed: ["custom-old"] });
  assert.deepEqual([...c.scripts.keys()].sort(), ["custom-grok", "something-else"]);
  assert.deepEqual(await manager(c).sync(), { added: [], removed: [] });
});

// ---- 頁面擷取 ----

function fakeCollector() {
  const posted = [];
  return { posted, offline: false, async postConversation(conv) {
    if (this.offline) throw new CollectorOffline();
    posted.push(conv);
    return { status: "created" };
  } };
}

test("擷取：以分頁網域決定平台；created_at 第一次擷取後固定；訊息偽造的平台被忽略", async () => {
  const c = fakeChrome();
  const m = manager(c);
  await m.add(GROK, []);
  const col = fakeCollector();
  const cap = { conv_id: "abc", url: "https://grok.example/c/abc", title: "t", text: LONG, platform: "chatgpt" };
  await m.handleCapture("https://grok.example/c/abc", cap, { collector: col, now: "2026-10-15T01:00:00.000Z", sweeper: "s" });
  await m.handleCapture("https://grok.example/c/abc", cap, { collector: col, now: "2026-10-15T03:00:00.000Z", sweeper: "s" });
  assert.deepEqual(col.posted.map((p) => [p.platform, p.created_at, p.updated_at]), [
    ["grok", "2026-10-15T01:00:00.000Z", "2026-10-15T01:00:00.000Z"],
    ["grok", "2026-10-15T01:00:00.000Z", "2026-10-15T03:00:00.000Z"],
  ]);
  assert.equal((await m.status()).grok.lastCaptureAt, "2026-10-15T03:00:00.000Z");
  const r = await m.handleCapture("https://chatgpt.com/c/x", cap, { collector: col, now: "x", sweeper: "s" });
  assert.equal(r.ok, false);
  assert.equal(col.posted.length, 2);
});

test("collector 連不上：放進待送佇列（同一對話只留最新），下一輪補送", async () => {
  const c = fakeChrome();
  const m = manager(c);
  await m.add(GROK, []);
  const col = fakeCollector();
  col.offline = true;
  for (const now of ["2026-10-15T01:00:00.000Z", "2026-10-15T02:00:00.000Z"]) {
    const r = await m.handleCapture("https://grok.example/c/abc", { conv_id: "abc", url: "u", title: "t", text: LONG }, { collector: col, now, sweeper: "s" });
    assert.deepEqual(r, { ok: false, queued: true });
  }
  assert.deepEqual(await m.drainQueue(col), { sent: 0, left: 1 });
  col.offline = false;
  assert.deepEqual(await m.drainQueue(col), { sent: 1, left: 0 });
  assert.equal(col.posted[0].updated_at, "2026-10-15T02:00:00.000Z");
});
