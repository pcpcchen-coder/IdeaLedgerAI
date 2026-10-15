# CLAUDE.md

## 專案

Idea Ledger AI：瀏覽器擴充被動擷取 ChatGPT／Claude／Kimi 網頁對話 → Mac Mini 上的 FastAPI collector → LiteLLM／Ollama 本地摘要 → Obsidian Markdown。設計依據見 `docs/2026-10-15_IdeaLedger_設計文件_v1.html`。

## 不可違反的設計約束

- **無痕**：不得在使用者的 AI 對話中插入任何文字或觸發工具呼叫；擷取只在瀏覽器層進行。
- **本地摘要**：對話內容只送往自架 collector 與本地模型，不送第三方雲端 LLM。
- **擷取不解析 DOM 結構**：只取 `main` 的 `innerText`，新增平台只改 `extension/capture.js` 的 `ADAPTERS`。
- 臨時對話與含 `#nolog` 的對話不得擷取。

## 執行環境

- Collector／summarizer 部署在 macOS（Mac Mini M4 24GB），已有 Ollama、LiteLLM Gateway、Docker。
- 對外以 Cloudflare Tunnel 暴露 `/ingest`，Bearer Token 驗證。
- 技術棧偏好：Python／FastAPI／Docker。

## 慣例

- 文件與註解用繁體中文。
- 想法卡路徑：`Ideas/YYYY/MM/YYYY-MM-DD_<platform>_<標題>.md`；日誌：`Ideas/_log/YYYY-MM-DD.md`。
- 秘密（token、網域）不進 repo，用環境變數或 `.env`。
