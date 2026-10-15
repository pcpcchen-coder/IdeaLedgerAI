// T07 設定頁顯示邏輯、燈號與徽章、設定正規化、巡檢開關。
import { test } from "node:test";
import assert from "node:assert/strict";
import { badgeFor, BADGE_COLORS, statusView } from "../src/lib/status.js";
import { normalizeConfig } from "../src/bg/config.js";
import { createScheduler } from "../src/bg/scheduler.js";
import { formToConfig, platformRows, shortTime } from "../src/options/view.js";
import { fakeClock, NOW } from "./helpers.js";

const PLATFORMS = [
  { id: "chatgpt", name: "ChatGPT", hosts: ["chatgpt.com"] },
  { id: "claude", name: "Claude", hosts: ["claude.ai"] },
  { id: "some-new-ai", name: "Some New AI", hosts: ["x.example"] },
];

test("徽章：全綠或尚未巡檢無字；有黃燈黃色 !；有紅燈紅色 !；停用的平台不算", () => {
  assert.deepEqual(badgeFor({ a: { status: "ok" }, b: { status: "idle" } }), { text: "", color: null });
  assert.deepEqual(badgeFor({ a: { status: "ok" }, b: { status: "rate_limited" } }), { text: "!", color: BADGE_COLORS.yellow });
  for (const red of ["needs_login", "format_error", "collector_offline", "error", "something-new"]) {
    assert.deepEqual(badgeFor({ a: { status: "rate_limited" }, b: { status: red } }), { text: "!", color: BADGE_COLORS.red }, red);
  }
  assert.deepEqual(badgeFor({ a: { status: "ok" }, b: { status: "needs_login" } }, (id) => id !== "b"), { text: "", color: null });
  assert.equal(statusView("needs_login").label, "需重新登入");
});

test("設定頁平台列表：由平台描述動態產生（含新平台），顯示燈號、最後成功、上輪抓取、錯誤", () => {
  const states = {
    chatgpt: { status: "ok", lastSuccessAt: "2026-10-15T11:30:00Z", lastRun: { fetched: 3, listed: 28, error: null } },
    claude: { status: "rate_limited", backoffUntil: NOW + 3600_000, lastRun: { fetched: 0, listed: 0, error: "HTTP 429" } },
  };
  const rows = platformRows(PLATFORMS, states, { enabled: { claude: false } }, NOW);
  assert.deepEqual(rows.map((r) => [r.id, r.name, r.enabled, r.light]), [
    ["chatgpt", "ChatGPT", true, "green"],
    ["claude", "Claude", false, "yellow"],
    ["some-new-ai", "Some New AI", true, "gray"],
  ]);
  assert.equal(rows[0].fetched, "3／列出 28");
  const excl = platformRows(PLATFORMS.slice(0, 1), { chatgpt: { status: "ok", lastRun: { fetched: 1, listed: 5, excluded: 2 } } }, {}, NOW);
  assert.equal(excl[0].fetched, "1／列出 5（略過 2）");
  assert.match(rows[1].label, /^退避中，.+ 後重試$/);
  assert.equal(rows[1].error, "HTTP 429");
  assert.equal(rows[2].lastSuccess, "—");
  assert.equal(shortTime("不是時間"), "—");
});

test("設定表單：整理成合法設定；平台開關只記停用的平台", () => {
  const c = formToConfig({
    collectorUrl: " http://127.0.0.1:8787/ ", token: " abc ", intervalMinutes: "7", sweeper: "",
    sweepEnabled: false, platforms: { chatgpt: true, claude: false },
  });
  assert.deepEqual(c, {
    collectorUrl: "http://127.0.0.1:8787", token: "abc", intervalMinutes: 15, sweeper: "mac-mini",
    sweepEnabled: false, enabled: { claude: false }, projectBlacklist: [],
  });
  const withList = formToConfig({ platforms: {}, projectBlacklist: "  公司專案A \n\ng-p-123\n公司專案a\n" });
  assert.deepEqual(withList.projectBlacklist, ["公司專案A", "g-p-123"]); // 去空白、略過空行、不分大小寫去重複
  assert.equal(normalizeConfig({ intervalMinutes: "abc" }).intervalMinutes, 30);
  assert.equal(normalizeConfig({}).sweepEnabled, true);
});

test("排程：把觸發來源（alarm／manual）傳給 runAll，讓巡檢開關只擋鬧鐘", async () => {
  const sources = [];
  const s = createScheduler({ alarms: { create() {} }, clock: fakeClock(), runAll: async (src) => sources.push(src), jitterMaxMs: 0 });
  await s.trigger("manual");
  await s.onAlarm({ name: "idealedger-sweep" });
  assert.deepEqual(sources, ["manual", "alarm"]);
});
