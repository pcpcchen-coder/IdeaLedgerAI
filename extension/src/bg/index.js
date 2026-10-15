// 背景服務程式入口。排程與巡檢流程見 T06。

chrome.runtime.onInstalled.addListener(() => {
  console.log("Idea Ledger Sweeper 已安裝（巡檢核心尚未實作，見 T06）");
});
