# T11 Mac Mini 部署

| 狀態 | 執行 | 預估 | 依賴 |
|---|---|---|---|
| 🟡 進行中（☁️ 部分先做） | ☁️ 雲端 ＋ 🖥 George | ☁️ 60 分 ＋ 🖥 30 分 | T08、T23 |

## 目標

在 Mac Mini 上把整條流程串成每天自動運作：Chrome 擴充巡檢 → collector → summarizer 每 5 分鐘摘要 → 寫入 AiMemory `ledger/` 並推送。

## 決定（George，2026-10-15）

**collector 與 summarizer 都直接在 macOS 上跑（Python 虛擬環境＋launchd），不用 Docker。** 原因：資料庫是 SQLite WAL 模式，WAL 需要所有程序在同一台主機上共用記憶體映射；collector 在 Docker（Linux 虛擬機）、summarizer 在 macOS 同時讀寫同一個 bind mount 的檔案，鎖不可靠，可能損毀資料庫。本機執行也讓 summarizer 直接用本機的 Ollama／LiteLLM 與 git 推送權限。

## 開工前讀

- `collector/app/main.py`（環境變數 `IDEA_TOKEN`、`IDEA_DB`）、`summarizer/__main__.py`（環境變數一覽）
- T08 學到的：資料庫（對話全文）與 AiMemory clone 都不能放在 iCloud 同步的資料夾（「文件」「桌面」若開了 iCloud 同步也算）

## ☁️ 範圍（雲端先做，可在 T08 完成前進行）

`deploy/` 資料夾：

| 檔案 | 內容 |
|---|---|
| `env.example` | 設定範本：`IDEA_TOKEN`、`IDEA_DB`、`LLM_BASE_URL`、`LLM_MODEL`、`LLM_API_KEY`、`IDEA_MEMORY_REPO`、`IDEA_GIT_PUBLISH`、`IDEA_TZ`、`SUMMARY_BATCH` |
| `install.sh` | 建資料夾 `~/Library/Application Support/IdeaLedger/`（資料庫、記錄檔、Python 虛擬環境、`.env`）；第一次產生隨機 token；安裝 Python 套件；依範本產生 launchd 設定並載入。可重複執行，不覆寫既有 `.env` |
| `uninstall.sh` | 卸載 launchd 工作；資料（資料庫、`.env`）保留 |
| `run-collector.sh`、`run-summarizer.sh` | 讀 `.env` 後啟動；launchd 呼叫這兩支 |
| `launchd/*.plist.in` | collector 常駐（當掉自動重啟）、summarizer 每 5 分鐘一次 |
| `doctor.sh` | 檢查：collector 健康、LiteLLM 可連、模型已設定、AiMemory clone 與推送權限、launchd 工作已載入、路徑不在 iCloud 同步資料夾 |

- 路徑檢查：`IDEA_DB`、`IDEA_MEMORY_REPO` 在 iCloud（`~/Library/Mobile Documents`、`~/Documents`、`~/Desktop`）底下時，`install.sh` 拒絕安裝並說明原因。
- 文件：`docs/DEPLOY_MAC.md`（George 照做的逐步說明，含 clone AiMemory、GitHub 推送權限、禁止睡眠、開機啟動 Chrome 專用設定檔）。
- 同步更新：CLAUDE.md（執行環境不再寫 Docker）、設計文件第 9 節、ROADMAP 的 T11、T14 摘要。

## 🖥 範圍（George，T08 完成後）

照 `docs/DEPLOY_MAC.md` 在 Mac Mini 上部署，並做驗收。

## 驗收

☁️（pytest，暫存資料夾當 HOME、假 `launchctl`，不真的安裝）：
- [x] `install.sh` 產生 `.env`（含隨機 token）與兩個 launchd 設定；設定檔可被解析，路徑都是絕對路徑，指向 `run-*.sh`
- [x] 重複執行不覆寫 `.env`、token 不變；launchd 工作先卸載再載入
- [x] 資料庫或 AiMemory 路徑在 iCloud 同步資料夾時拒絕安裝
- [x] `run-*.sh` 讀 `.env` 並帶正確參數啟動（collector 只綁 `127.0.0.1:8787`）
- [x] `uninstall.sh` 卸載工作、保留資料
- [x] `make test` 全過

🖥（George）：
- [x] `deploy/doctor.sh` 全部通過（2026-10-15，使用者輸入模式）
- [ ] 手機 App 聊一段，1 小時內 AiMemory 出現想法卡

## 不做

- 健康監控與通知（T14）
- 首次回填與官方匯出匯入（T15）

## 收工時

☁️ 部分完成時：ROADMAP 維持 🟡，在 PROGRESS「下一步」寫明 🖥 部分等 George。🖥 驗收通過後改 ✅，commit 訊息以 `T11:` 開頭。

## ☁️ 完成紀錄（2026-10-15）

- `deploy/`：`install.sh`、`uninstall.sh`、`run-collector.sh`、`run-summarizer.sh`、`doctor.sh`、`lib.sh`、`env.example`、`launchd/*.plist.in`；bash 3.2 相容（macOS 內建）。
- `.env` 由 shell 讀取，預設路徑含空白（Application Support），自動產生的值一律加引號。
- 測試 10 個（`deploy/tests/`，暫存 HOME＋假 `launchctl`），已加入 `make test`。
- 文件：`docs/DEPLOY_MAC.md`；CLAUDE.md、設計文件第 9 節、ROADMAP 的 T11、T14 摘要改為本機執行。

## 剩餘

- 🖥 George 在 Mac Mini 照 `docs/DEPLOY_MAC.md` 部署、`deploy/doctor.sh` 全過、手機對話 1 小時內出現想法卡（等 T08 完成）。

## 部署紀錄（2026-10-15）

- 程式在 `~/IdeaLedger/IdeaLedgerAI`（George 指定），資料在 `~/Library/Application Support/IdeaLedger/`；沿用 T08 的資料庫與 token。
- 由雲端工作階段透過 Finder 執行 `~/IdeaLedger/deploy_T11.command`（停臨時 collector → `git pull` → `install.sh` → clone AiMemory → `doctor.sh`）。
- 實機問題：macOS 內建 bash 3.2 把 `$VAR` 後緊接的中文當成變數名稱（cba7cc9 修正並加測試）；第一次 clone AiMemory 時 summarizer 同時在跑，那一輪發佈因偵測到 `ledger/` 以外的變動而中止（安全機制正常），下一輪即推送成功（AiMemory `a7893df`：想法卡 40、日誌 16、索引 20）。
- 剩餘（🖥 George）：手機 App 對話 1 小時內出現想法卡；禁止睡眠、開機自動開 Chrome；擴充可改從 `~/IdeaLedger/IdeaLedgerAI/extension/dist` 載入（目前仍從「文件」裡的首測副本載入，功能相同）。
