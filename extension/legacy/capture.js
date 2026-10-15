// capture.js — 對話靜止 20 秒時擷取頁面文字。新增平台只要加一行 adapter。
const ADAPTERS = {
  "chatgpt.com":      { platform: "chatgpt", id: /\/c\/([\w-]+)/ },
  "claude.ai":        { platform: "claude",  id: /\/chat\/([\w-]+)/ },
  "www.kimi.com":     { platform: "kimi",    id: /\/chat\/([\w-]+)/ }, // 待驗證
  "kimi.moonshot.cn": { platform: "kimi",    id: /\/chat\/([\w-]+)/ }, // 待驗證
};
const A = ADAPTERS[location.hostname];
let timer, lastHash = "";

async function sha(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
}

async function flush() {
  if (!A) return;
  const m = location.pathname.match(A.id);
  if (!m || location.search.includes("temporary")) return;   // 臨時對話不記
  const text = (document.querySelector("main") || document.body).innerText.trim();
  if (text.length < 200 || text.includes("#nolog")) return;   // 太短或手動排除
  const hash = await sha(text);
  if (hash === lastHash) return;
  lastHash = hash;
  chrome.runtime.sendMessage({
    platform: A.platform, conv_id: m[1], url: location.href,
    title: document.title, text, hash, captured_at: new Date().toISOString()
  });
}

new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(flush, 20000); })
  .observe(document.body, { childList: true, subtree: true, characterData: true });
document.addEventListener("visibilitychange", () => { if (document.hidden) flush(); });
