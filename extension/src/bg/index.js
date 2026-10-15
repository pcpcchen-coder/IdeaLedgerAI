// 背景服務程式：把 chrome API 接到巡檢核心。決策邏輯都在 round.js、scheduler.js 等可測試的模組裡。
import { registeredPlatforms } from "../adapters/index.js";
import { badgeFor } from "../lib/status.js";
import { createThrottle, realClock } from "../lib/throttle.js";
import { createCollectorClient } from "./collector.js";
import { createCustomManager } from "./custom.js";
import { loadConfig, isPlatformEnabled } from "./config.js";
import { createRpc } from "./rpc.js";
import { runAllPlatforms, ROUND_DEFAULTS } from "./round.js";
import { createScheduler } from "./scheduler.js";
import { createStateStore } from "./state.js";
import { createTabManager } from "./tabs.js";

const storage = chrome.storage.local;
const state = createStateStore(storage);
// 自訂平台（設定頁免程式新增，T18）
const custom = createCustomManager({
  storage,
  permissions: chrome.permissions,
  scripting: chrome.scripting,
  registered: registeredPlatforms(),
});

/** 擴充圖示徽章：全綠無字；有黃燈顯示黃色「!」；有紅燈顯示紅色「!」 */
async function updateBadge() {
  const config = await loadConfig(storage);
  const states = await state.getAll(registeredPlatforms().map((p) => p.id));
  const { text, color } = badgeFor(states, (id) => isPlatformEnabled(config, id));
  await chrome.action.setBadgeText({ text });
  if (color) await chrome.action.setBadgeBackgroundColor({ color });
}

async function runAll(source) {
  const config = await loadConfig(storage);
  if (!config.token) {
    console.warn("Idea Ledger：尚未設定 collector token，略過巡檢");
    return [];
  }
  if (source === "alarm" && !config.sweepEnabled) return [];
  const collector = createCollectorClient({ baseUrl: config.collectorUrl, token: config.token });
  await custom.drainQueue(collector).catch(() => {});
  const ctx = {
    state,
    tabs: createTabManager(chrome.tabs),
    rpc: createRpc(chrome.tabs),
    collector,
    clock: realClock,
    newThrottle: () => createThrottle(),
    config: { ...ROUND_DEFAULTS, sweeper: config.sweeper, projectBlacklist: config.projectBlacklist },
  };
  try {
    const results = await runAllPlatforms(ctx, registeredPlatforms(), (id) => isPlatformEnabled(config, id));
    console.log("Idea Ledger 巡檢結果", results);
    return results;
  } finally {
    await updateBadge().catch(() => {});
  }
}

const scheduler = createScheduler({ alarms: chrome.alarms, clock: realClock, runAll });

async function setupAlarm() {
  const config = await loadConfig(storage);
  await scheduler.setup(config.intervalMinutes);
  await custom.sync().catch((e) => console.warn("Idea Ledger：自訂平台注入對齊失敗", e));
  await updateBadge().catch(() => {});
}

chrome.runtime.onInstalled.addListener(setupAlarm);
chrome.runtime.onStartup.addListener(setupAlarm);
chrome.alarms.onAlarm.addListener((alarm) => scheduler.onAlarm(alarm));
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.config?.newValue?.intervalMinutes !== changes.config?.oldValue?.intervalMinutes) setupAlarm();
  if (changes.config) updateBadge().catch(() => {});
});

/** 頁面擷取（自訂平台）：平台一律以送出訊息的分頁網址判斷 */
async function onPageCapture(sender, capture) {
  const config = await loadConfig(storage);
  if (!config.token) return { ok: false, reason: "尚未設定 collector token" };
  const collector = createCollectorClient({ baseUrl: config.collectorUrl, token: config.token });
  return custom.handleCapture(sender.tab?.url ?? sender.url, capture, {
    collector,
    now: new Date().toISOString(),
    sweeper: config.sweeper,
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "pageCaptureConfig") {
    custom.findByUrl(sender.tab?.url ?? sender.url).then(sendResponse, () => sendResponse(null));
    return true;
  }
  if (msg?.type === "pageCapture") {
    onPageCapture(sender, msg.capture).then(sendResponse, (e) => sendResponse({ ok: false, reason: String(e) }));
    return true;
  }
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
