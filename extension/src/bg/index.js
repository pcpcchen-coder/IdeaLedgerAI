// 背景服務程式：把 chrome API 接到巡檢核心。決策邏輯都在 round.js、scheduler.js 等可測試的模組裡。
import { registeredPlatforms } from "../adapters/index.js";
import { createThrottle, realClock } from "../lib/throttle.js";
import { createCollectorClient } from "./collector.js";
import { loadConfig, isPlatformEnabled } from "./config.js";
import { createRpc } from "./rpc.js";
import { runAllPlatforms, ROUND_DEFAULTS } from "./round.js";
import { createScheduler } from "./scheduler.js";
import { createStateStore } from "./state.js";
import { createTabManager } from "./tabs.js";

const storage = chrome.storage.local;
const state = createStateStore(storage);

async function runAll() {
  const config = await loadConfig(storage);
  if (!config.token) {
    console.warn("Idea Ledger：尚未設定 collector token，略過巡檢");
    return [];
  }
  const ctx = {
    state,
    tabs: createTabManager(chrome.tabs),
    rpc: createRpc(chrome.tabs),
    collector: createCollectorClient({ baseUrl: config.collectorUrl, token: config.token }),
    clock: realClock,
    newThrottle: () => createThrottle(),
    config: { ...ROUND_DEFAULTS, sweeper: config.sweeper },
  };
  const results = await runAllPlatforms(ctx, registeredPlatforms(), (id) => isPlatformEnabled(config, id));
  console.log("Idea Ledger 巡檢結果", results);
  return results;
}

const scheduler = createScheduler({ alarms: chrome.alarms, clock: realClock, runAll });

async function setupAlarm() {
  const config = await loadConfig(storage);
  await scheduler.setup(config.intervalMinutes);
}

chrome.runtime.onInstalled.addListener(setupAlarm);
chrome.runtime.onStartup.addListener(setupAlarm);
chrome.alarms.onAlarm.addListener((alarm) => scheduler.onAlarm(alarm));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.config) setupAlarm();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "sweepNow") {
    scheduler.trigger("manual").then(
      (results) => sendResponse({ ok: true, results }),
      (e) => sendResponse({ ok: false, error: String(e) }),
    );
    return true;
  }
  if (msg?.type === "getStatus") {
    const platforms = registeredPlatforms();
    state.getAll(platforms.map((p) => p.id)).then((states) =>
      sendResponse({ platforms, states, running: scheduler.isRunning() }),
    );
    return true;
  }
  return false;
});
