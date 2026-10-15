import { test } from "node:test";
import assert from "node:assert/strict";
import { planNormal, buildBackfillQueue, advanceWatermark, reachedWatermark } from "../src/lib/planner.js";
import { isBackingOff, onRateLimited, onSuccess } from "../src/lib/backoff.js";
import { createThrottle } from "../src/lib/throttle.js";
import { reviveError, RateLimited, NeedsLogin } from "../src/lib/errors.js";
import { fakeClock, makeHistory, NOW, MIN, HOUR } from "./helpers.js";

test("planner：排除 10 分鐘內仍在更新的、由舊到新、上限 30", () => {
  const settled = makeHistory(40);
  const fresh = [{ id: "new", updated_at: new Date(NOW - 5 * MIN).toISOString() }];
  const plan = planNormal([...settled].reverse().concat(fresh), null, NOW);
  assert.equal(plan.length, 30);
  assert.deepEqual(plan.map((i) => i.id), settled.slice(0, 30).map((i) => i.id));
  assert.ok(!plan.some((i) => i.id === "new"));
});

test("planner：只取比水位線新的；不同小數位數的時間也能正確比較", () => {
  const items = [
    { id: "a", updated_at: "2026-10-15T01:00:00Z" },
    { id: "b", updated_at: "2026-10-15T01:00:00.500Z" },
    { id: "c", updated_at: "2026-10-15T02:00:00Z" },
  ];
  assert.deepEqual(planNormal(items, "2026-10-15T01:00:00.000Z", NOW).map((i) => i.id), ["b", "c"]);
});

test("planner：回填佇列只放已靜止的，由新到舊，只存 id、updated_at 與 project（供專案黑名單）", () => {
  const items = [...makeHistory(3), { id: "fresh", title: "x", updated_at: new Date(NOW - MIN).toISOString() }];
  const q = buildBackfillQueue(items.reverse(), NOW);
  assert.deepEqual(q.map((i) => i.id), ["c2", "c1", "c0"]);
  assert.deepEqual(Object.keys(q[0]), ["id", "updated_at", "project"]);
});

test("planner：水位線只往前；翻頁遇到水位線就停", () => {
  assert.equal(advanceWatermark(null, "2026-10-15T01:00:00Z"), "2026-10-15T01:00:00Z");
  assert.equal(advanceWatermark("2026-10-15T02:00:00Z", "2026-10-15T01:00:00Z"), "2026-10-15T02:00:00Z");
  const page = [{ updated_at: "2026-10-15T03:00:00Z" }, { updated_at: "2026-10-15T01:00:00Z" }];
  assert.equal(reachedWatermark(page, "2026-10-15T02:00:00Z"), true);
  assert.equal(reachedWatermark(page, null), false);
});

test("退避：連續三次 1、2、4 小時，上限 8，成功歸零", () => {
  let s = { backoffLevel: 0, backoffUntil: null };
  const hours = [];
  for (let i = 0; i < 5; i++) {
    s = { ...s, ...onRateLimited(s, NOW) };
    hours.push((s.backoffUntil - NOW) / HOUR);
  }
  assert.deepEqual(hours, [1, 2, 4, 8, 8]);
  assert.equal(isBackingOff(s, NOW + 7 * HOUR), true);
  assert.equal(isBackingOff(s, NOW + 8 * HOUR), false);
  assert.deepEqual(onSuccess(), { backoffLevel: 0, backoffUntil: null });
});

test("節流：兩次請求間隔至少 3 秒（含隨機延遲）", async () => {
  const clock = fakeClock(NOW, 0.5);
  const t = createThrottle({ clock });
  const at = [];
  for (let i = 0; i < 3; i++) {
    await t.wait();
    at.push(clock.now());
  }
  assert.equal(at[0], NOW); // 第一次不等
  assert.equal(at[1] - at[0], 3500);
  assert.equal(at[2] - at[1], 3500);
});

test("節流：中間已經過夠久就不必再等", async () => {
  const clock = fakeClock();
  const t = createThrottle({ clock });
  await t.wait();
  clock.advance(10000);
  await t.wait();
  assert.deepEqual(clock.sleeps, []);
});

test("reviveError 還原錯誤類型", () => {
  assert.ok(reviveError({ name: "RateLimited", message: "x" }) instanceof RateLimited);
  assert.ok(reviveError({ name: "NeedsLogin" }) instanceof NeedsLogin);
  const other = reviveError({ name: "Weird", message: "m" });
  assert.equal(other.name, "Weird");
  assert.equal(other.message, "m");
});
