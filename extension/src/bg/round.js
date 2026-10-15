// 單一平台一輪巡檢（T06）。背景程式負責所有決策；平台分頁只透過 rpc 執行 adapter。
// 平台是開放的：這裡只用平台描述（id、name、hosts），不認得任何特定平台。
import { isBackingOff, onRateLimited, onSuccess } from "../lib/backoff.js";
import { advanceWatermark, buildBackfillQueue, planNormal, reachedWatermark, DEFAULTS } from "../lib/planner.js";

export const ROUND_DEFAULTS = {
  cap: DEFAULTS.cap,
  settleMs: DEFAULTS.settleMs,
  maxListPages: 20, // 一般模式最多翻幾頁
  maxBackfillPages: 500, // 回填列清單最多翻幾頁
  sweeper: "mac-mini",
};

const iso = (ms) => new Date(ms).toISOString();

const STATUS_BY_ERROR = {
  NeedsLogin: "needs_login",
  RateLimited: "rate_limited",
  AdapterFormatError: "format_error",
  CollectorOffline: "collector_offline",
};

/**
 * @param {object} ctx
 * @param {ReturnType<import("./state.js").createStateStore>} ctx.state
 * @param {{ ensureTab(platform): Promise<number> }} ctx.tabs
 * @param {{ call(tabId, platform, op, args?): Promise<any> }} ctx.rpc
 * @param {ReturnType<import("./collector.js").createCollectorClient>} ctx.collector
 * @param {{ now(): number, sleep(ms): Promise<void>, random(): number }} ctx.clock
 * @param {() => { wait(): Promise<void> }} ctx.newThrottle
 * @param {typeof ROUND_DEFAULTS} ctx.config
 * @param {{ id: string, name: string, hosts: string[] }} platform
 */
export async function runPlatformRound(ctx, platform) {
  const { state, tabs, rpc, collector, clock } = ctx;
  const config = { ...ROUND_DEFAULTS, ...ctx.config };
  const id = platform.id;
  const startedAt = clock.now();

  if (isBackingOff(await state.get(id), startedAt)) {
    return { platform: id, status: "rate_limited", skipped: true };
  }

  const throttle = ctx.newThrottle();
  let listed = 0;
  let fetched = 0;

  const call = async (tabId, op, args = []) => {
    await throttle.wait();
    return rpc.call(tabId, id, op, args);
  };

  async function listPages(tabId, watermark, maxPages) {
    const out = [];
    let cursor = null;
    for (let page = 0; page < maxPages; page++) {
      const { items, next } = await call(tabId, "listUpdated", [cursor]);
      listed += items.length;
      out.push(...items);
      if (!next || reachedWatermark(items, watermark)) break;
      cursor = next;
    }
    return out;
  }

  async function finish(status, error = null) {
    const finishedAt = clock.now();
    const run = { started_at: iso(startedAt), finished_at: iso(finishedAt), listed, fetched, error };
    const current = await state.get(id);
    const patch = { status, lastRun: run };
    if (status === "ok") Object.assign(patch, onSuccess(), { lastSuccessAt: run.finished_at });
    if (status === "rate_limited") Object.assign(patch, onRateLimited(current, finishedAt));
    await state.patch(id, patch);
    // collector 離線時送不出巡檢紀錄；其他情況盡力送，失敗也不影響本輪結果
    if (status !== "collector_offline") {
      await collector.postSweepRun({ platform: id, ...run, status, sweeper: config.sweeper }).catch(() => {});
    }
    return { platform: id, status, ...run };
  }

  try {
    const tabId = await tabs.ensureTab(platform);
    const login = await call(tabId, "checkLogin");
    if (!login?.ok) return finish("needs_login", login?.reason ?? "未登入");

    let s = await state.get(id);
    let toFetch;
    if (s.watermark == null && s.backfillQueue == null) {
      // 首次：列出全部歷史建立回填佇列（之後每輪從佇列取）
      const all = await listPages(tabId, null, config.maxBackfillPages);
      const queue = buildBackfillQueue(all, clock.now(), { settleMs: config.settleMs });
      s = await state.patch(id, { backfillQueue: queue.length ? queue : null });
      toFetch = queue.slice(0, config.cap);
    } else if (s.backfillQueue) {
      toFetch = s.backfillQueue.slice(0, config.cap);
    } else {
      const items = await listPages(tabId, s.watermark, config.maxListPages);
      toFetch = planNormal(items, s.watermark, clock.now(), { cap: config.cap, settleMs: config.settleMs });
    }

    for (const item of toFetch) {
      const conv = await call(tabId, "getConversation", [item.id]);
      await collector.postConversation({
        ...conv,
        platform: id,
        platform_name: platform.name,
        capture: "api",
        swept_at: iso(clock.now()),
        sweeper: config.sweeper,
      });
      fetched++;
      // 每成功一篇就存水位線：服務程式可能隨時被終止，下一輪要能接續
      const cur = await state.get(id);
      const patch = { watermark: advanceWatermark(cur.watermark, item.updated_at) };
      if (cur.backfillQueue) {
        const rest = cur.backfillQueue.filter((q) => q.id !== item.id);
        patch.backfillQueue = rest.length ? rest : null;
      }
      await state.patch(id, patch);
    }
    return finish("ok");
  } catch (e) {
    const status = STATUS_BY_ERROR[e?.name] ?? "error";
    return finish(status, status === "error" ? `${e?.name ?? "Error"}: ${e?.message ?? e}` : e?.message ?? null);
  }
}

/**
 * 依序巡檢所有已註冊且啟用的平台（不平行）。
 * @param {Array<{ id: string, name: string, hosts: string[] }>} platforms 來自 registeredPlatforms()
 * @param {(id: string) => boolean} isEnabled
 */
export async function runAllPlatforms(ctx, platforms, isEnabled = () => true) {
  const results = [];
  for (const p of platforms) {
    if (!isEnabled(p.id)) continue;
    results.push(await runPlatformRound(ctx, p));
  }
  return results;
}
