import { test } from "node:test";
import assert from "node:assert/strict";
import { createScheduler, ALARM_NAME, RUN_ALARM_NAME } from "../src/bg/scheduler.js";
import { createTabManager } from "../src/bg/tabs.js";
import { createRpc } from "../src/bg/rpc.js";
import { createCollectorClient } from "../src/bg/collector.js";
import { loadConfig, isPlatformEnabled } from "../src/bg/config.js";
import { memoryStorage } from "../src/bg/state.js";
import { RateLimited, CollectorOffline, CollectorRejected } from "../src/lib/errors.js";
import { fakeClock, PLATFORM } from "./helpers.js";

// ---- 排程 ----

test("排程：同時觸發兩次只跑一輪；跑完可再觸發", async () => {
  let runs = 0;
  let release;
  const s = createScheduler({
    alarms: { create() {} },
    clock: fakeClock(),
    runAll: () => {
      runs++;
      return new Promise((r) => (release = r));
    },
  });
  const a = s.trigger("manual");
  const b = s.trigger("manual");
  assert.equal(a, b);
  assert.equal(s.isRunning(), true);
  release("done");
  assert.equal(await a, "done");
  assert.equal(s.isRunning(), false);
  s.trigger("manual");
  assert.equal(runs, 2);
  release();
});

test("排程：週期鬧鐘改排 0–5 分鐘隨機延遲的單次鬧鐘，等待期間不算執行中、手動可立即跑", async () => {
  const clock = fakeClock(0, 0.5);
  const created = [];
  const sources = [];
  const s = createScheduler({
    alarms: { create: (n, info) => created.push([n, info]) },
    clock,
    runAll: async (src) => sources.push(src),
  });
  await s.onAlarm({ name: ALARM_NAME });
  assert.deepEqual(created, [[RUN_ALARM_NAME, { delayInMinutes: 2.5 }]]);
  assert.deepEqual(sources, []);
  assert.equal(s.isRunning(), false); // 等待中「立即巡檢」不能被鎖住
  await s.trigger("manual");
  await s.onAlarm({ name: RUN_ALARM_NAME });
  assert.deepEqual(sources, ["manual", "alarm"]);
  assert.deepEqual(clock.sleeps, []); // 不用 setTimeout 等待（背景程式會被終止）
  assert.equal(s.onAlarm({ name: "other" }), null);
});

test("排程：setup 依間隔建立鬧鐘", async () => {
  const created = [];
  const s = createScheduler({
    alarms: { create: (n, info) => created.push([n, info]), clear: async () => true },
    clock: fakeClock(),
    runAll: async () => {},
  });
  await s.setup(45);
  assert.deepEqual(created, [[ALARM_NAME, { delayInMinutes: 1, periodInMinutes: 45 }]]);
});

// ---- 分頁 ----

function fakeTabs(initial) {
  const listeners = new Set();
  const api = {
    tabs: initial,
    created: [],
    reloaded: [],
    onUpdated: { addListener: (l) => listeners.add(l), removeListener: (l) => listeners.delete(l) },
    query: async () => api.tabs,
    reload: async (id) => {
      api.reloaded.push(id);
      setTimeout(() => listeners.forEach((l) => l(id, { status: "complete" })), 0);
    },
    create: async (props) => {
      const tab = { id: 99, ...props };
      api.created.push(props);
      setTimeout(() => listeners.forEach((l) => l(99, { status: "complete" })), 0);
      return tab;
    },
  };
  return api;
}

test("分頁：有可用分頁就直接用", async () => {
  const api = fakeTabs([{ id: 7, status: "complete", discarded: false }]);
  assert.equal(await createTabManager(api).ensureTab(PLATFORM), 7);
  assert.deepEqual(api.created, []);
});

test("分頁：被休眠的分頁會重新載入", async () => {
  const api = fakeTabs([{ id: 5, status: "unloaded", discarded: true }]);
  assert.equal(await createTabManager(api).ensureTab(PLATFORM), 5);
  assert.deepEqual(api.reloaded, [5]);
});

test("分頁：reloadTab 重新載入並等載完", async () => {
  const api = fakeTabs([{ id: 7, status: "complete", discarded: false }]);
  assert.equal(await createTabManager(api).reloadTab(7), 7);
  assert.deepEqual(api.reloaded, [7]);
});

test("分頁：沒有分頁就開一個釘選、非作用中的", async () => {
  const api = fakeTabs([]);
  assert.equal(await createTabManager(api).ensureTab(PLATFORM), 99);
  assert.deepEqual(api.created, [{ url: "https://chatgpt.com/", pinned: true, active: false }]);
});

// ---- RPC ----

test("RPC：回傳結果；錯誤還原成原本類型", async () => {
  const sent = [];
  const rpc = createRpc({
    sendMessage: async (tabId, msg) => {
      sent.push([tabId, msg]);
      return msg.op === "listUpdated"
        ? { ok: false, error: { name: "RateLimited", message: "429" } }
        : { ok: true, result: { ok: true } };
    },
  });
  assert.deepEqual(await rpc.call(3, "chatgpt", "checkLogin"), { ok: true });
  assert.deepEqual(sent[0], [3, { type: "rpc", platform: "chatgpt", op: "checkLogin", args: [] }]);
  await assert.rejects(rpc.call(3, "chatgpt", "listUpdated", [null]), RateLimited);
});

test("RPC：分頁沒有回應、逾時", async () => {
  const none = createRpc({ sendMessage: async () => { throw new Error("Receiving end does not exist"); } });
  await assert.rejects(none.call(1, "chatgpt", "checkLogin"), { name: "NoReceiver" });
  const slow = createRpc({ sendMessage: () => new Promise(() => {}) }, { timeoutMs: 10 });
  await assert.rejects(slow.call(1, "chatgpt", "checkLogin"), { name: "RpcTimeout" });
});

// ---- collector 用戶端 ----

test("collector 用戶端：帶 token、離線與拒絕分開處理", async () => {
  const seen = [];
  const make = (impl) => createCollectorClient({ baseUrl: "http://127.0.0.1:8787/", token: "t", fetchImpl: impl });

  const ok = make(async (url, init) => {
    seen.push([url, init.method, init.headers.Authorization]);
    return new Response(JSON.stringify({ status: "created", watermark: "2026-10-15T00:00:00.000Z" }), { status: 200 });
  });
  assert.deepEqual(await ok.postConversation({}), { status: "created", watermark: "2026-10-15T00:00:00.000Z" });
  assert.equal(await ok.getWatermark("gemini"), "2026-10-15T00:00:00.000Z");
  assert.deepEqual(seen[0], ["http://127.0.0.1:8787/v2/conversations", "POST", "Bearer t"]);
  assert.equal(seen[1][0], "http://127.0.0.1:8787/v2/watermark?platform=gemini");

  await assert.rejects(make(async () => { throw new TypeError("fetch failed"); }).postSweepRun({}), CollectorOffline);
  await assert.rejects(make(async () => new Response("", { status: 503 })).postSweepRun({}), CollectorOffline);
  await assert.rejects(make(async () => new Response("bad token", { status: 401 })).postSweepRun({}), CollectorRejected);
});

// ---- 設定 ----

test("設定：預設值、間隔限制在 15–120 分鐘、平台預設啟用", async () => {
  const c = await loadConfig(memoryStorage({ config: { intervalMinutes: 5, enabled: { claude: false } } }));
  assert.equal(c.intervalMinutes, 15);
  assert.equal(c.collectorUrl, "http://127.0.0.1:8787");
  assert.equal(isPlatformEnabled(c, "claude"), false);
  assert.equal(isPlatformEnabled(c, "gemini"), true);
  assert.equal((await loadConfig(memoryStorage({ config: { intervalMinutes: 999 } }))).intervalMinutes, 120);
});
