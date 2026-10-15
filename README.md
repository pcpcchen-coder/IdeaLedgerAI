# Idea Ledger AI

跨平台 AI 對話自動記錄系統：在 ChatGPT、Claude、Kimi 等網頁聊天時，自動擷取對話、用本地模型摘要成「想法卡」，並記錄每天跟哪個平台互動。

**設計原則：無痕、一次設定。** 對話中不需任何操作，也不在對話裡留下額外文字或工具呼叫。

## 狀態

| 項目 | 狀態 |
|---|---|
| 設計文件 v1 | ✅ 完成 |
| 擴充、Collector、Summarizer | 🟡 骨架程式碼（來自設計文件，尚未實測） |
| Summarizer worker 主程式 | ⬜ 未實作 |
| docker-compose、Cloudflare Tunnel 設定 | ⬜ 未實作 |
| 歷史匯出回填腳本 | ⬜ 未實作 |

## 架構

```
ChatGPT / Claude / Kimi 網頁
  → extension/capture.js   對話靜止 20 秒時擷取 main 純文字
  → extension/bg.js        離線佇列，HTTPS + Bearer Token 送出
  → collector/             Mac Mini 上的 FastAPI + SQLite
  → summarizer/            LiteLLM → Ollama 本地摘要（對話靜止 15 分鐘後）
  → Obsidian vault         Ideas/ 想法卡 + Ideas/_log/ 每日平台互動日誌
```

## 為什麼不用各平台的預設 prompt／skill

- 模型要記錄就得呼叫寫入工具，每次呼叫在對話裡都看得到，不是無痕。
- Kimi 網頁版查不到可設定的寫入管道；ChatGPT 自訂連接器需開發者模式，且連不到 localhost。
- 依賴模型遵從率，漏記無法察覺。

詳見 [設計文件](docs/2026-10-15_IdeaLedger_設計文件_v1.html) 第 1 節。

## 目錄

| 路徑 | 內容 |
|---|---|
| `docs/` | 設計文件、工具評估 |
| `extension/` | Chrome／Edge MV3 擴充 |
| `collector/` | FastAPI 接收服務 |
| `summarizer/` | 摘要提示詞（worker 待實作） |
| `prompts/` | 手機補強用的「記一下」指令（選用，非無痕） |

## 已知限制

- 手機 App、桌面 App 的對話抓不到，要在電腦瀏覽器打開一次才會被補抓。
- 公司 Windows 可能禁止載入未封裝擴充。
- Kimi 網址規則（`/chat/<id>`）尚未驗證。
