# CLAUDE.md

## 專案

Idea Ledger AI：常開電腦上的 Chrome 專用設定檔（已登入 ChatGPT／Claude／Kimi）由擴充定時巡檢各平台對話歷史 → 本機 FastAPI collector → LiteLLM／Ollama 本地摘要 → Obsidian Markdown。因為網頁、桌面 App、手機 App 的對話都會同步到帳號，所以全部涵蓋。

現行設計：`docs/2026-10-15_IdeaLedger_帳號層巡檢設計文件_v2.html`（v1 即時擷取已降為選用模式，預設關閉）。

## 不可違反的設計約束

- **無痕**：不得在使用者的 AI 對話中插入任何文字或觸發工具呼叫。
- **只讀**：對各平台只發 GET 請求，絕不建立、修改、刪除任何平台資料。
- **節流**：每次請求間隔 ≥3 秒；每輪每平台單篇讀取 ≤30 篇；遇 429／403 該平台指數退避（1→2→4→8 小時）。
- **讀取在平台分頁內執行**：由該網域的 content script 發同源請求，不從擴充背景直接打平台介面。
- **平台差異只在 `extension/adapters/<platform>.js`**，介面固定為 `checkLogin()`、`listUpdated(sinceIso, limit)`、`getConversation(id)`。
- **本地摘要**：對話內容只送往本機 collector 與本地模型，不送第三方雲端 LLM。
- **排除**：第一則使用者訊息含 `#nolog` 的對話不落地；專案黑名單內的對話略過。
- **冪等**：collector 以 `(platform, conv_id, updated_at)` 判斷重複，重送不得產生重複處理。

## 執行環境

- 主節點：Mac Mini M4 24GB，已有 Ollama、LiteLLM Gateway、Docker；需禁止睡眠、開機自動啟動 Chrome 專用設定檔。
- Collector 只綁 `127.0.0.1:8787`，Bearer Token 驗證；不對外開放。
- 技術棧偏好：Python／FastAPI／Docker；擴充為 Chrome MV3。

## 慣例

- 文件與註解用繁體中文。
- 想法卡路徑：`Ideas/YYYY/MM/YYYY-MM-DD_<platform>_<標題>.md`；日誌：`Ideas/_log/YYYY-MM-DD.md`，第一行為各平台巡檢狀態。
- 日誌依對話實際更新時間歸日，不依巡檢時間。
- 各平台內部介面皆為非官方，實作前先以 DevTools Network 驗證，並在 adapter 內做回應格式檢查。
- 秘密（token）不進 repo，用環境變數或 `.env`。
