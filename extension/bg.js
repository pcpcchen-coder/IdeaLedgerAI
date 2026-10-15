// bg.js — 送不出去就排隊，每 5 分鐘重試。
// Fetch 放在 background 而不是 content script，以避開各平台頁面的 CORS／CSP 限制。
const ENDPOINT = "https://ideas.YOUR-DOMAIN/ingest";
const TOKEN = "REPLACE_WITH_LONG_RANDOM_TOKEN";

chrome.runtime.onMessage.addListener(p => { enqueue(p); });

async function enqueue(p) {
  const { q = [] } = await chrome.storage.local.get("q");
  const rest = q.filter(x => !(x.platform === p.platform && x.conv_id === p.conv_id));
  rest.push(p);                       // 同一對話只留最新版
  await chrome.storage.local.set({ q: rest });
  drain();
}

async function drain() {
  const { q = [] } = await chrome.storage.local.get("q");
  const left = [];
  for (const p of q) {
    try {
      const r = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + TOKEN },
        body: JSON.stringify(p)
      });
      if (!r.ok) left.push(p);
    } catch { left.push(p); }
  }
  await chrome.storage.local.set({ q: left });
}

chrome.alarms.create("drain", { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener(drain);
