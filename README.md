# Idea Ledger AI

跨平台 AI 對話自動記錄系統：自動收集你在 ChatGPT、Claude、Kimi 上的對話（網頁、桌面 App、手機 App 都算），用本地模型摘要成「想法卡」，並記錄每天跟哪個平台互動。

**設計原則：無痕、一次設定、只讀。** 對話中不需任何操作，也不在對話裡留下任何痕跡。

## 運作方式

一台常開的電腦（建議 Mac Mini）上，用 Chrome 專用設定檔登入三個平台。擴充每 30 分鐘以你的登入狀態讀取各平台的對話歷史；因為 App 上的對話都會同步到帳號，所以全部涵蓋。

```
Chrome 專用設定檔（已登入 3 個平台）
  → extension/bg.js               chrome.alarms 每 30 分鐘排程
  → extension/adapters/*.js       在平台分頁內同源讀取歷史（只讀、節流）
  → collector/  127.0.0.1:8787    FastAPI + SQLite，冪等
  → summarizer/                   LiteLLM → Ollama 本地摘要
  → Obsidian vault                Ideas/ 想法卡 + Ideas/_log/ 每日平台互動日誌
```

## 文件

| 文件 | 內容 |
|---|---|
| [設計文件 v2](docs/2026-10-15_IdeaLedger_帳號層巡檢設計文件_v2.html) | **現行設計**：帳號層巡檢 |
| [設計文件 v1](docs/2026-10-15_IdeaLedger_設計文件_v1.html) | 舊版：各瀏覽器即時擷取（已降為選用模式） |
| [工具評估](docs/00_工具評估_2026-10-07.md) | 為什麼自建而不用現成工具 |

## 開發進度

採「一次工作階段一張工單」的方式推進，有空時開工作階段打 `/next` 接續、打 `/wrap` 收工。

- [路線圖與工單總表](docs/plan/ROADMAP.md)
- [目前進度與下一步](docs/plan/PROGRESS.md)

| 里程碑 | 內容 | 工單 |
|---|---|---|
| M1 收得到 | ChatGPT、Claude 對話進入 collector | T00–T08 |
| M2 有想法卡 | 本地摘要、Obsidian 想法卡與每日日誌 | T09–T11 |
| M3 Kimi | Kimi 對話進入流程 | T12–T13 |
| M4 無人看管 | 健康監控、回填、排除規則、一週驗收 | T14–T17 |

目前 `extension/` 與 `collector/` 內是 v1 即時擷取的骨架，T00 會搬到 `extension/legacy/` 並建立 v2 結構。

## 已知限制

- 各平台讀取用的是非官方介面，平台改版時對應 adapter 需更新。
- 登入過期需手動在主節點重新登入（擴充圖示與每日日誌會提示）。
- 無法區分對話是在網頁還是 App 上進行。
- Kimi 的 App 對話是否同步到網頁歷史尚待驗證。
