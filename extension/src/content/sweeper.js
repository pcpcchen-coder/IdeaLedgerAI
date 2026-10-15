// content script 入口：注入所有已註冊平台的網域（由建置依 platform.json 寫進 manifest）。
// 只回應背景程式的 RPC，不主動做任何事，也不改動頁面。
import { getAdapter } from "../adapters/index.js";
import { handleRpc } from "./rpc.js";

const adapter = getAdapter(location.hostname);

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "rpc") return false;
  handleRpc(adapter, msg).then(sendResponse);
  return true; // 非同步回應
});
