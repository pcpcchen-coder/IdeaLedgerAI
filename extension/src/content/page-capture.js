// 通用頁面擷取（T18，自訂平台用）：由設定頁新增平台時以 chrome.scripting 動態注入。
// 沿用 v1：DOM 變動停止 20 秒、或分頁切到背景時，擷取 main（沒有就 body）的純文字送給背景程式。
// 只讀頁面，不改動頁面、不發任何網路請求；不符合條件的文字不會離開頁面。
import { extractConvId, skipReason } from "../lib/custom-platforms.js";

const QUIET_MS = 20000;

(async () => {
  // 平台設定由背景程式依本分頁網域回覆（不由這裡判斷平台）
  const platform = await chrome.runtime.sendMessage({ type: "pageCaptureConfig" }).catch(() => null);
  if (!platform?.idPattern) return;

  let timer = null;
  let lastSent = "";

  function flush() {
    const convId = extractConvId(platform.idPattern, location.pathname);
    const text = (document.querySelector("main") || document.body)?.innerText?.trim() ?? "";
    if (skipReason({ convId, search: location.search, text })) return;
    const key = `${convId}\n${text}`;
    if (key === lastSent) return;
    lastSent = key;
    chrome.runtime
      .sendMessage({ type: "pageCapture", capture: { conv_id: convId, url: location.href, title: document.title, text } })
      .catch(() => {
        lastSent = ""; // 背景程式沒收到，下次再試
      });
  }

  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(flush, QUIET_MS);
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) flush();
  });
})();
