// 測試用的假時鐘與假環境。
import { createStateStore, memoryStorage } from "../src/bg/state.js";
import { createThrottle } from "../src/lib/throttle.js";
import { CollectorOffline } from "../src/lib/errors.js";

export const MIN = 60 * 1000;
export const HOUR = 60 * MIN;
export const NOW = Date.parse("2026-10-15T12:00:00.000Z");

/** 假時鐘：sleep 直接推進時間；random 預設 0（節流間隔剛好 3 秒） */
export function fakeClock(start = NOW, random = 0) {
  const c = {
    t: start,
    sleeps: [],
    now: () => c.t,
    sleep: async (ms) => {
      c.sleeps.push(ms);
      c.t += ms;
    },
    random: () => random,
    advance: (ms) => {
      c.t += ms;
    },
  };
  return c;
}

/** 產生 n 筆對話：c0 最舊，每筆相隔 1 分鐘，最新的一筆距 end 有 lagMs */
export function makeHistory(n, { end = NOW, lagMs = 30 * MIN, prefix = "c" } = {}) {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${i}`,
    title: `對話 ${i}`,
    updated_at: new Date(end - lagMs - (n - 1 - i) * MIN).toISOString(),
    project: null,
  }));
}

/**
 * 建立一輪巡檢需要的假環境。history 可在測試中修改（模擬新對話）。
 */
export function makeEnv({ history = [], pageSize = 10, clock = fakeClock(), platform = "chatgpt" } = {}) {
  const env = {
    clock,
    history,
    calls: [],
    posted: [],
    runs: [],
    loginOk: true,
    listError: null,
    getError: null, // { at: 第幾次 getConversation, error }
    formatErrorOnGet: false,
    collectorOffline: false,
    gets: 0,
  };

  const adapter = {
    checkLogin: async () => ({ ok: env.loginOk, reason: env.loginOk ? undefined : "未登入" }),
    listUpdated: async (cursor) => {
      if (env.listError) throw env.listError;
      const sorted = [...env.history].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
      const start = cursor ?? 0;
      return { items: sorted.slice(start, start + pageSize), next: start + pageSize < sorted.length ? start + pageSize : null };
    },
    getConversation: async (id) => {
      env.gets++;
      if (env.getError && env.gets === env.getError.at) throw env.getError.error;
      const item = env.history.find((h) => h.id === id);
      return {
        platform,
        conv_id: id,
        title: item.title,
        url: `https://example.test/c/${id}`,
        project: null,
        created_at: item.updated_at,
        updated_at: item.updated_at,
        messages: [{ role: "user", text: "IdeaLedger 測試", at: null }],
      };
    },
  };

  env.storage = memoryStorage();
  env.ctx = {
    state: createStateStore(env.storage),
    tabs: { ensureTab: async () => 1 },
    rpc: {
      call: async (_tabId, p, op, args = []) => {
        env.calls.push({ platform: p, op, args, at: clock.now() });
        return adapter[op](...args);
      },
    },
    collector: {
      postConversation: async (c) => {
        if (env.collectorOffline) throw new CollectorOffline();
        env.posted.push(c);
        return { status: "created" };
      },
      postSweepRun: async (r) => {
        if (env.collectorOffline) throw new CollectorOffline();
        env.runs.push(r);
        return { ok: true };
      },
    },
    clock,
    newThrottle: () => createThrottle({ clock }),
    config: { sweeper: "test" },
  };
  return env;
}

export const PLATFORM = { id: "chatgpt", name: "ChatGPT", hosts: ["chatgpt.com"] };
