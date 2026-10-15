import { test } from "node:test";
import assert from "node:assert/strict";
import { runPlatformRound, runAllPlatforms } from "../src/bg/round.js";
import { AdapterFormatError, RateLimited } from "../src/lib/errors.js";
import { makeEnv, makeHistory, PLATFORM, NOW, MIN, HOUR } from "./helpers.js";

const state = (env, id = "chatgpt") => env.ctx.state.get(id);

test("回填：空水位線時建立佇列，分多輪取完後轉一般模式", async () => {
  const env = makeEnv({ history: makeHistory(75) });

  let r = await runPlatformRound(env.ctx, PLATFORM);
  assert.equal(r.status, "ok");
  assert.equal(r.listed, 75);
  // 由新到舊：最近的對話先進資料庫
  assert.deepEqual(env.posted.map((c) => c.conv_id), makeHistory(75).slice(45).reverse().map((i) => i.id));
  let s = await state(env);
  assert.equal(s.backfillQueue.length, 45);
  assert.equal(s.watermark, env.history[74].updated_at);

  await runPlatformRound(env.ctx, PLATFORM);
  r = await runPlatformRound(env.ctx, PLATFORM);
  assert.equal(r.fetched, 15);
  assert.equal(env.posted.at(-1).conv_id, env.history[0].id); // 最舊的最後
  assert.equal(r.listed, 0); // 回填中不重新列清單
  s = await state(env);
  assert.equal(s.backfillQueue, null);
  assert.equal(env.posted.length, 75);
  assert.equal(s.watermark, env.history[74].updated_at);

  // 轉一般模式：只抓新的、已靜止的
  env.history.push(
    { id: "n1", title: "新 1", updated_at: new Date(NOW - 20 * MIN).toISOString() },
    { id: "n2", title: "新 2", updated_at: new Date(NOW - 15 * MIN).toISOString() },
    { id: "live", title: "還在聊", updated_at: new Date(NOW - 2 * MIN).toISOString() },
  );
  r = await runPlatformRound(env.ctx, PLATFORM);
  assert.equal(r.status, "ok");
  assert.deepEqual(env.posted.slice(75).map((c) => c.conv_id), ["n1", "n2"]);
  assert.ok(r.listed < 20, "一般模式翻到水位線就停");

  // 「還在聊」靜止後，下一輪補上
  env.clock.advance(30 * MIN);
  await runPlatformRound(env.ctx, PLATFORM);
  assert.equal(env.posted.at(-1).conv_id, "live");
});

test("回填：舊版存下的由舊到新佇列，也改依新到舊取", async () => {
  const env = makeEnv({ history: makeHistory(40) });
  const old = makeHistory(40).map(({ id, updated_at }) => ({ id, updated_at, project: null }));
  await env.ctx.state.patch("chatgpt", { watermark: old[0].updated_at, backfillQueue: old });
  await runPlatformRound(env.ctx, PLATFORM);
  assert.deepEqual(env.posted.map((c) => c.conv_id), old.slice(10).reverse().map((i) => i.id));
  assert.equal((await state(env)).backfillQueue.length, 10);
});

test("一般模式：每輪上限 30，由舊到新，下一輪接續", async () => {
  const env = makeEnv({ history: makeHistory(50) });
  await env.ctx.state.patch("chatgpt", { watermark: "2026-01-01T00:00:00Z" });
  await runPlatformRound(env.ctx, PLATFORM);
  assert.deepEqual(env.posted.map((c) => c.conv_id), env.history.slice(0, 30).map((i) => i.id));
  assert.equal((await state(env)).watermark, env.history[29].updated_at);
  await runPlatformRound(env.ctx, PLATFORM);
  assert.equal(env.posted.length, 50);
});

test("送出的對話帶有平台描述、擷取方式與節點名稱", async () => {
  const env = makeEnv({ history: makeHistory(1) });
  await runPlatformRound(env.ctx, PLATFORM);
  const c = env.posted[0];
  assert.equal(c.platform, "chatgpt");
  assert.equal(c.platform_name, "ChatGPT");
  assert.equal(c.capture, "api");
  assert.equal(c.sweeper, "test");
  assert.equal(env.runs[0].status, "ok");
});

test("中途失敗：第 5 篇出錯 → 水位線停在第 4 篇", async () => {
  const env = makeEnv({ history: makeHistory(10) });
  await env.ctx.state.patch("chatgpt", { watermark: "2026-01-01T00:00:00Z" });
  env.getError = { at: 5, error: new Error("boom") };
  const r = await runPlatformRound(env.ctx, PLATFORM);
  assert.equal(r.status, "error");
  assert.match(r.error, /boom/);
  assert.equal(env.posted.length, 4);
  assert.equal((await state(env)).watermark, env.history[3].updated_at);
});

test("collector 離線：水位線不變、狀態正確、不送巡檢紀錄", async () => {
  const env = makeEnv({ history: makeHistory(5) });
  await env.ctx.state.patch("chatgpt", { watermark: "2026-01-01T00:00:00Z" });
  env.collectorOffline = true;
  const r = await runPlatformRound(env.ctx, PLATFORM);
  assert.equal(r.status, "collector_offline");
  const s = await state(env);
  assert.equal(s.watermark, "2026-01-01T00:00:00Z");
  assert.equal(s.status, "collector_offline");
  assert.equal(env.runs.length, 0);
});

test("未登入：不列清單，狀態為需重新登入，並送出巡檢紀錄", async () => {
  const env = makeEnv({ history: makeHistory(5) });
  env.loginOk = false;
  const r = await runPlatformRound(env.ctx, PLATFORM);
  assert.equal(r.status, "needs_login");
  assert.deepEqual(env.calls.map((c) => c.op), ["checkLogin"]);
  assert.equal(env.runs[0].status, "needs_login");
});

test("被限流：退避 1→2→4 小時，退避期間整輪略過，成功後歸零", async () => {
  const env = makeEnv({ history: makeHistory(3) });
  env.listError = new RateLimited("429");

  for (const hours of [1, 2, 4]) {
    const r = await runPlatformRound(env.ctx, PLATFORM);
    assert.equal(r.status, "rate_limited");
    const s = await state(env);
    assert.equal(Math.round((s.backoffUntil - env.clock.now()) / HOUR), hours);

    const callsBefore = env.calls.length;
    const skipped = await runPlatformRound(env.ctx, PLATFORM);
    assert.equal(skipped.skipped, true);
    assert.equal(env.calls.length, callsBefore, "退避中不得對平台發任何請求");

    env.clock.advance(hours * HOUR + MIN);
  }

  env.listError = null;
  const r = await runPlatformRound(env.ctx, PLATFORM);
  assert.equal(r.status, "ok");
  const s = await state(env);
  assert.equal(s.backoffLevel, 0);
  assert.equal(s.backoffUntil, null);
});

test("平台回應格式不符：狀態為介面失效", async () => {
  const env = makeEnv({ history: makeHistory(3) });
  env.getError = { at: 1, error: new AdapterFormatError("缺 mapping") };
  const r = await runPlatformRound(env.ctx, PLATFORM);
  assert.equal(r.status, "format_error");
  assert.equal((await state(env)).status, "format_error");
});

test("節流：同一輪中任兩次平台請求間隔 ≥3 秒", async () => {
  const env = makeEnv({ history: makeHistory(12), pageSize: 5 });
  await runPlatformRound(env.ctx, PLATFORM);
  assert.ok(env.calls.length > 10);
  for (let i = 1; i < env.calls.length; i++) {
    assert.ok(env.calls[i].at - env.calls[i - 1].at >= 3000, `第 ${i} 次請求間隔不足`);
  }
});

test("平台開放：第三個平台（gemini）自動巡檢、狀態分開、停用的平台略過", async () => {
  const env = makeEnv({ history: makeHistory(2) });
  const platforms = [
    PLATFORM,
    { id: "claude", name: "Claude", hosts: ["claude.ai"] },
    { id: "gemini", name: "Gemini", hosts: ["gemini.google.com"] },
  ];
  const results = await runAllPlatforms(env.ctx, platforms, (id) => id !== "claude");
  assert.deepEqual(results.map((r) => r.platform), ["chatgpt", "gemini"]);
  assert.deepEqual(env.posted.map((c) => `${c.platform}/${c.platform_name}`), [
    "chatgpt/ChatGPT", "chatgpt/ChatGPT", "gemini/Gemini", "gemini/Gemini",
  ]);
  assert.ok(env.storage.data["platform:gemini"].watermark);
  assert.equal(env.storage.data["platform:claude"], undefined);
});
