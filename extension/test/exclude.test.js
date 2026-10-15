// T16 專案黑名單：比對規則與巡檢略過。
import { test } from "node:test";
import assert from "node:assert/strict";
import { runPlatformRound } from "../src/bg/round.js";
import { isExcludedProject, parseBlacklist } from "../src/lib/exclude.js";
import { makeEnv, makeHistory } from "./helpers.js";

test("比對：完全相同、不分大小寫與前後空白；沒有專案的對話不排除", () => {
  const list = parseBlacklist(" Secret Corp \n\ng-p-abc\nsecret corp");
  assert.deepEqual(list, ["Secret Corp", "g-p-abc"]);
  assert.equal(isExcludedProject("secret corp", list), true);
  assert.equal(isExcludedProject(" G-P-ABC ", list), true);
  assert.equal(isExcludedProject("Secret Corp 2", list), false);
  assert.equal(isExcludedProject(null, list), false);
  assert.equal(isExcludedProject("", [""]), false);
});

function envWith(projects, { platform = "chatgpt", convProject } = {}) {
  const history = makeHistory(projects.length).map((h, i) => ({ ...h, project: projects[i] }));
  const env = makeEnv({ history, platform });
  env.ctx.config.projectBlacklist = ["Secret Corp"];
  if (convProject) {
    // 單篇回應的專案與清單不同（例如清單沒帶專案、單篇才有）
    const rpc = env.ctx.rpc.call;
    env.ctx.rpc.call = async (...a) => {
      const r = await rpc(...a);
      return a[2] === "getConversation" ? { ...r, project: convProject(a[3][0]) } : r;
    };
  }
  return env;
}

test("一般模式：黑名單專案不讀單篇、不送 collector，水位線照常推進到最後一篇", async () => {
  const env = envWith([null, "Secret Corp", "Other", "secret corp"]);
  await env.ctx.state.patch("chatgpt", { watermark: "2026-01-01T00:00:00Z" });
  const r = await runPlatformRound(env.ctx, { id: "chatgpt", name: "ChatGPT", hosts: [] });
  assert.equal(r.status, "ok");
  assert.deepEqual(env.posted.map((c) => c.conv_id), ["c0", "c2"]);
  assert.deepEqual(env.calls.filter((c) => c.op === "getConversation").map((c) => c.args[0]), ["c0", "c2"]);
  assert.equal(r.fetched, 2);
  assert.equal(r.excluded, 2);
  const s = await env.ctx.state.get("chatgpt");
  assert.equal(s.watermark, env.history[3].updated_at);
  assert.equal(s.lastRun.excluded, 2);
});

test("回填：佇列帶 project；讀回後才發現在黑名單的不送出；兩者都移出佇列", async () => {
  const env = envWith([null, "Secret Corp", null], { convProject: (id) => (id === "c2" ? "SECRET CORP" : null) });
  const r = await runPlatformRound(env.ctx, { id: "chatgpt", name: "ChatGPT", hosts: [] });
  assert.equal(r.status, "ok");
  assert.deepEqual(env.posted.map((c) => c.conv_id), ["c0"]);
  assert.deepEqual(env.calls.filter((c) => c.op === "getConversation").map((c) => c.args[0]), ["c2", "c0"]); // 回填由新到舊
  const s = await env.ctx.state.get("chatgpt");
  assert.equal(s.backfillQueue, null);
  assert.equal(s.watermark, env.history[2].updated_at);
});

test("新平台同樣適用（不以平台 id 分支）", async () => {
  const env = envWith(["Secret Corp", null], { platform: "some-new-ai" });
  await env.ctx.state.patch("some-new-ai", { watermark: "2026-01-01T00:00:00Z" });
  await runPlatformRound(env.ctx, { id: "some-new-ai", name: "Some New AI", hosts: [] });
  assert.deepEqual(env.posted.map((c) => c.conv_id), ["c1"]);
});
