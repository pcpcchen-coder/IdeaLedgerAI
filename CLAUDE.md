# CLAUDE.md

## 專案

Idea Ledger AI：常開電腦上的 Chrome 專用設定檔（已登入各 AI 平台）由擴充定時巡檢各平台對話歷史 → 本機 FastAPI collector → LiteLLM／Ollama 本地摘要 → Obsidian Markdown。因為網頁、桌面 App、手機 App 的對話都會同步到帳號，所以全部涵蓋。內建 ChatGPT、Claude，平台清單是開放的，使用者可自行加入 Gemini、Grok 等（`docs/ADDING_A_PLATFORM.md`）。

現行設計：`docs/2026-10-15_IdeaLedger_帳號層巡檢設計文件_v2.html`（v1 即時擷取已降為選用模式，預設關閉）。

## 不可違反的設計約束

- **無痕**：不得在使用者的 AI 對話中插入任何文字或觸發工具呼叫。
- **只讀**：對各平台只發 GET 請求，絕不建立、修改、刪除任何平台資料。
- **節流**：每次請求間隔 ≥3 秒；每輪每平台單篇讀取 ≤30 篇；遇 429／403 該平台指數退避（1→2→4→8 小時）。
- **讀取在平台分頁內執行**：由該網域的 content script 發同源請求，不從擴充背景直接打平台介面。
- **平台開放**：任何地方都不得寫死平台清單或以平台 id 做 enum／分支判斷（擴充、collector、summarizer、Obsidian 寫入皆然）。平台 id 只做格式檢查（`^[a-z][a-z0-9-]{1,31}$`），顯示名稱來自平台描述。新增平台必須只靠新增 adapter 資料夾（方式一）或設定頁（方式二，T18）完成，不得要求修改核心程式。
- **平台差異只在 `extension/src/adapters/<id>/`**：`platform.json`（id、name、hosts）＋ `index.js` ＋ `parse.js` ＋ `fetch.js`。建置時自動掃描註冊並產生 manifest 網域權限；`adapters/index.js` 與 `manifest.base.json` 不因新增平台而修改。介面固定為 `checkLogin()`、`listUpdated(cursor)`、`getConversation(id)`。
- **本地摘要**：對話內容只送往本機 collector 與本地模型，不送第三方雲端 LLM。
- **排除**：第一則使用者訊息含 `#nolog` 的對話不落地；專案黑名單內的對話略過。
- **冪等**：collector 以 `(platform, conv_id, updated_at)` 判斷重複，重送不得產生重複處理。

## 工作方式

- 一次工作階段 = 一張工單（`docs/plan/tickets/`）。開工 `/next`，收工 `/wrap`。
- 進度的唯一來源是 `docs/plan/PROGRESS.md` 與 `docs/plan/ROADMAP.md`；不要依賴對話記憶判斷做到哪。
- 標 🖥 的工單需要 George 本機動手，雲端工作階段不得假裝完成；只能協助他照工單步驟進行。
- 雲端工作階段無法登入 George 的平台帳號。adapter 解析層一律用 `extension/fixtures/` 的樣本開發與測試；欄位名稱以 `fixtures/*/NOTES.md` 為準，不憑記憶假設。
- fixtures 只能提交遮罩後的檔案；原始檔放 `extension/fixtures/raw/`（已 gitignore）。
- 只做工單範圍內的事，範圍外的發現記到 PROGRESS「卡住／待決定」。

## 開發指令

- `make setup`：安裝擴充（npm）與 collector（pip）依賴，第一次使用時執行。
- `make test`：擴充 node:test + collector pytest + 遮罩工具 pytest，每張工單收工前必須全過。
- `make build`：產出 `extension/dist/`，Chrome 以「載入未封裝項目」載入這個資料夾。
- `npm run gen`（build、test 前自動執行）：掃描 `src/adapters/*/platform.json` 產生 `registry.generated.js`（不進 repo）。
- manifest 由 `manifest.base.json` 加上各平台網域於建置時產生，路徑以 `dist/` 為根；新增入口或複製檔時改 `extension/build.config.mjs`，測試會檢查 manifest 引用的檔案都有產出。

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
