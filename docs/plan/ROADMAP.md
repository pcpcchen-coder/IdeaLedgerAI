# 開發路線圖

依據：[設計文件 v2](../2026-10-15_IdeaLedger_帳號層巡檢設計文件_v2.html)。進度記錄在 [PROGRESS.md](PROGRESS.md)。

## 推進規則

- **一次工作階段 = 一張工單。** 每張設計成 30–90 分鐘可做完，做不完就拆票並在 PROGRESS 記錄。
- **開工打 `/next`，收工打 `/wrap`。** 指令定義在 `.claude/commands/`。
- **執行者分兩種：**
  - ☁️ **雲端**：雲端 Claude 工作階段可獨立完成（寫程式、跑測試）。
  - 🖥 **本機**：需要 George 在自己電腦上動手（登入平台、DevTools 採樣、實機驗收）。工單會寫成逐步清單，約 15–30 分鐘。
- **依賴未完成的工單不開工。** 若下一張是 🖥 而 George 沒空，可跳到不依賴它的 ☁️ 工單。
- **Phase 2 以後的工單只有摘要**，開工那次工作階段的第一件事是先把它展開成完整工單檔（參照 T00–T08 的格式），因為細節取決於前面學到的東西。

## 技術選擇（T00 落實）

| 項目 | 選擇 | 理由 |
|---|---|---|
| 擴充語言 | JavaScript（ES modules）+ JSDoc 型別註解 | 不引入 TypeScript 編譯鏈，維持輕量 |
| 打包 | esbuild | MV3 content script 不能直接用 ES modules，需要打包；esbuild 零設定 |
| 擴充測試 | `node:test` | Node 內建，不需額外框架 |
| Collector | Python 3.12 + FastAPI + SQLite | 沿用既有技術棧 |
| Collector 測試 | pytest + FastAPI TestClient | 標準做法 |

**可測試性原則：** adapter 拆成「取資料」與「解析」兩層。解析層是純函式，用 `fixtures/` 裡的真實回應樣本測試；雲端工作階段不需要登入任何平台也能開發。

**平台開放原則：** ChatGPT、Claude 只是內建的前兩個平台。使用者日後要加入 Gemini、Grok 等，有兩種方式，都不需要改核心程式（見 [新增 AI 平台](../ADDING_A_PLATFORM.md)）：
- **方式一：寫 adapter**：新增 `extension/src/adapters/<id>/` 資料夾，建置時自動註冊、自動加入 manifest 網域權限（T00 已完成這個機制）。T13 Kimi 會是第一個用這個方式加入的平台，等於實戰驗證。
- **方式二：設定頁免程式新增**：填名稱、網域、對話網址規則即可，以頁面文字擷取（T18）。
- 每張工單都不得寫死平台清單；collector、summarizer、Obsidian 寫入只認平台 id 格式。

## 工單總表

| ID | 工單 | 執行 | 預估 | 依賴 | 狀態 |
|---|---|---|---|---|---|
| **Phase 0 地基** |||||
| [T00](tickets/T00_repo骨架與開發環境.md) | Repo 骨架與開發環境 | ☁️ | 60 分 | — | ✅ |
| [T01](tickets/T01_ChatGPT介面採樣.md) | ChatGPT 介面採樣 | 🖥 | 30 分 | T00 | ✅ |
| [T02](tickets/T02_Claude介面採樣.md) | Claude 介面採樣 | 🖥 | 30 分 | T00 | ✅ |
| **Phase 1 收得到（M1）** |||||
| [T03](tickets/T03_Collector_v2端點.md) | Collector v2 端點 | ☁️ | 60 分 | T00 | ✅ |
| [T04](tickets/T04_ChatGPT解析層.md) | ChatGPT 解析層 | ☁️ | 60 分 | T01 | ✅ |
| [T05](tickets/T05_Claude解析層.md) | Claude 解析層 | ☁️ | 45 分 | T02 | ✅ |
| [T06](tickets/T06_巡檢核心.md) | 巡檢核心（排程、分頁、節流、水位線） | ☁️ | 90 分 | T00 | ✅ |
| [T07](tickets/T07_取資料層與設定頁.md) | 取資料層與設定頁 | ☁️ | 60 分 | T04, T05, T06 | ✅ |
| [T08](tickets/T08_M1本機首測.md) | M1 本機首測 | 🖥 | 30 分 | T03, T07 | 🟡 |
| **Phase 2 有想法卡（M2）** |||||
| [T09](tickets/T09_Summarizer_worker.md) | Summarizer worker | ☁️ | 90 分 | T03 | ✅ |
| [T10](tickets/T10_Obsidian寫入與每日日誌.md) | Obsidian 寫入與每日日誌 | ☁️ | 60 分 | T09 | ✅ |
| [T11](tickets/T11_MacMini部署.md) | Mac Mini 部署 | ☁️ + 🖥 | 60 分 | T08, T23 | 🟡 |
| **Phase 3 Kimi（M3）** |||||
| T12 | Kimi 探查 | 🖥 | 30 分 | T08 | ⬜ |
| T13 | Kimi adapter | ☁️ | 60 分 | T12 | ⬜ |
| **Phase 4 無人看管（M4）** |||||
| T14 | 健康監控 | ☁️ | 60 分 | T11 | ⬜ |
| T15 | 首次回填與官方匯出匯入 | ☁️ | 60 分 | T11 | ⬜ |
| [T16](tickets/T16_排除規則UI.md) | 排除規則 UI（`#nolog`、專案黑名單） | ☁️ | 45 分 | T07 | ✅ |
| T17 | 一週無人看管驗收 | 🖥 | 每天 5 分 × 7 | T14, T15, T16 | ⬜ |
| **Phase 5 開放擴充** |||||
| [T18](tickets/T18_設定頁免程式新增平台.md) | 設定頁免程式新增平台（頁面文字擷取） | ☁️ | 90 分 | T03, T07 | ✅ |
| T19 | 免程式平台實測（以 Gemini 或 Grok 驗證） | 🖥 | 20 分 | T18 | ⬜ |
| **Phase 2b 寫入 AiMemory** |||||
| [T20](tickets/T20_寫入路徑對齊AiMemory.md) | 寫入路徑對齊 AiMemory `ledger/` | ☁️ | 30 分 | T10 | ✅ |
| [T21](tickets/T21_專案清單改讀AiMemory.md) | 專案清單改讀 AiMemory `projects/` | ☁️ | 30 分 | T20 | ✅ |
| [T22](tickets/T22_衍生索引.md) | 衍生索引：平台總覽、每月彙總、想法索引 | ☁️ | 60 分 | T21 | ✅ |
| [T23](tickets/T23_Git發佈器.md) | Git 發佈器（pull → 寫入 → commit → push） | ☁️ | 60 分 | T20 | ✅ |
| **Phase 1b ChatGPT 專案名稱** |||||
| [T24](tickets/T24_ChatGPT專案名稱採樣.md) | ChatGPT 專案名稱採樣 | 🖥 | 15 分 | T01 | ✅ |
| [T25](tickets/T25_ChatGPT專案名稱.md) | ChatGPT 專案名稱（以名稱取代 `g-p-` ID） | ☁️ | 45 分 | T24, T07 | ✅ |
| **Phase 2c 不做模型摘要** |||||
| [T26](tickets/T26_以使用者輸入取代摘要.md) | 以使用者輸入取代摘要（George 決定） | ☁️ | 60 分 | T09, T10, T20 | ✅ |

狀態符號：⬜ 待辦 · 🟡 進行中 · ✅ 完成 · ⛔ 卡住

## Phase 2–4 工單摘要（開工時展開）

**T09 Summarizer worker** — 取 `dirty=1` 且最後更新超過 15 分鐘的對話，經 LiteLLM（OpenAI 相容介面）呼叫本地模型，產出設計文件 v2 規格的 JSON；只送 `summarized_count` 之後的新訊息加上前一版摘要。JSON 解析失敗重試一次。驗收：用假 LLM 回應的 pytest 全過。

**T10 Obsidian 寫入與每日日誌** — 依摘要結果寫想法卡（同一對話覆寫同檔）、更新 `Ideas/_log/YYYY-MM-DD.md`（依對話實際更新時間歸日，第一行為各平台巡檢狀態）。驗收：給定 SQLite 狀態，產出的 Markdown 與預期快照一致。

**T11 Mac Mini 部署** — ☁️ `deploy/`（`install.sh`、`.env` 範本、collector 與 summarizer 的 launchd 設定、`doctor.sh`）與 `docs/DEPLOY_MAC.md`（含 clone AiMemory 並設定 push 權限）；全部在 macOS 本機執行，不用 Docker（George 決定）；🖥 George 照步驟部署。驗收：手機 App 聊一段，1 小時內 AiMemory 出現想法卡。

**T12 Kimi 探查** — 🖥 確認 Kimi App 的對話是否出現在網頁歷史；在 DevTools 採樣歷史清單與單篇對話的回應。產出：fixtures 與一頁探查筆記。若沒有可用介面，記錄改走頁面文字退路。

**T13 Kimi adapter** — 依 T12 結果，以新增 `src/adapters/kimi/` 資料夾的方式實作解析層與取資料層；若沒有可用介面，改用 T18 的頁面文字擷取。驗收含：除了 kimi 資料夾與 fixtures，沒有修改任何其他檔案（驗證平台開放機制）。

**T14 健康監控** — 擴充圖示紅黃綠燈、`sweep_run` 寫入、每日日誌狀態行、任一平台連續 24 小時失敗時通知（collector 與 summarizer 都在本機 launchd 下執行，可直接發 macOS 通知）。

**T15 首次回填與官方匯出匯入** — 驗證回填節流；寫 ChatGPT、Claude 官方匯出檔的匯入腳本，匯入後設定水位線。

**T16 排除規則 UI** — 設定頁可編輯專案黑名單；確認 `#nolog` 在 collector 端丟棄、不落地。

**T17 一週無人看管驗收** — 🖥 連續 7 天每天看一眼日誌狀態行；記錄任何中斷與原因。全綠即 v1.0 完成。

**T18 設定頁免程式新增平台** — 設定頁「新增平台」：填顯示名稱、網域、對話網址規則（取對話 ID 的正規式）。儲存時以 `chrome.permissions.request` 向使用者要該網域權限（manifest 加 `optional_host_permissions: ["https://*/*"]` 與 `scripting` 權限），再用 `chrome.scripting.registerContentScripts` 動態注入通用頁面擷取腳本（沿用 v1 邏輯：對話靜止 20 秒後取 `main` 純文字，臨時對話與 `#nolog` 略過）。送 collector 時 `capture="page"`、帶 `page_text` 與 `platform_name`。可刪除（解除注入、收回權限）。平台 id 由名稱產生並避開已註冊的 id。驗收：以假網域的單元測試涵蓋新增、刪除、權限被拒、id 衝突；無需修改 adapters 或 manifest.base.json 以外的核心程式即可新增平台。

**T19 免程式平台實測** — 🖥 在設定頁新增 Gemini 或 Grok，聊一段後確認 collector 收到 `capture="page"` 的資料。

## Phase 2b：寫入 AiMemory（2026-10-15 新增）

資料存放改為 [AiMemory](https://github.com/pcpcchen-coder/AiMemory)（私人 repo）的 `ledger/`，規格見 `AiMemory/ledger/README.md`。這四張都不依賴 T01、T02，可先做。

**T20 寫入路徑對齊** — `summarizer/obsidian.py` 改寫到 `ledger/conversations/YYYY/MM/` 與 `ledger/daily/YYYY/MM/`；環境變數 `IDEA_VAULT` 改名 `IDEA_MEMORY_REPO`（指向 AiMemory 的本機 clone）。驗收：快照測試改為新路徑；寫入範圍不超出 `ledger/`。

**T21 專案清單改讀 AiMemory** — 專案代號＝`AiMemory/projects/*.md` 的檔名（排除 README），名稱＝檔案第一個標題；取代 `summarizer/projects.txt`。想法卡的 `projects` 存代號，歸不到的填 `other`。驗收：新增一個專案檔後，不改工具即可被歸類。

**T22 衍生索引** — 產生 `ledger/platforms.md`、`ledger/monthly/YYYY-MM.md`、`ledger/ideas/index.md`、`ledger/ideas/by-project/<代號>.md`，格式依 ledger 規格。內容相同不重寫。驗收：快照測試；新平台、新專案自動出現。

**T23 Git 發佈器** — 每輪：`git pull --rebase` → 寫入 → 若有變動則以 `Idea Ledger Bot` commit → push；push 被拒則重新 pull 再試一次，仍失敗留到下一輪。commit 前檢查變更只在 `ledger/` 內，否則中止且不 commit。驗收：以本機假遠端（bare repo）測試正常發佈、無變動不 commit、遠端有新 commit 時正確 rebase、使用者在遠端改了 `status` 後重寫仍保留、`ledger/` 外有變動時中止。

## Phase 1b：ChatGPT 專案名稱（2026-10-15 新增）

George 要求想法卡顯示 ChatGPT 的專案名稱。T01 樣本只有專案 ID（`g-p-…`），名稱需另一個請求。

**T24 ChatGPT 專案名稱採樣** — 🖥 在 DevTools 搜尋回應內容，找出同時含專案名稱與 `g-p-` ID 的 GET 請求，取樣、遮罩（測試專案以外的名稱全部遮蔽）後提交 `fixtures/chatgpt/projects.json` 與 NOTES。

**T25 ChatGPT 專案名稱** — ☁️ `parseProjects()` ＋ `fetch.js` 快取名稱表，清單與單篇的 `project` 換成名稱；新 ID 才重取一次，失敗時保留 ID，不影響收取。只改 `adapters/chatgpt/`。
