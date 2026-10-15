# 進度

每次收工（`/wrap`）在最上方新增一筆紀錄，並更新「下一步」。

## 下一步

- **☁️ 雲端可做：** T23 Git 發佈器（依賴 T20 ✅）；之後 T22（依賴 T21 ✅）。T04、T05 解析層也可做（樣本已提交）。
- **🖥 等 George：** 補 T01、T02 的 D（手機 App 對話，各約 5 分鐘）：手機 App 各開一段「IdeaLedger 測試 D」來回 1 輪，再請雲端工作階段在內建瀏覽器補採並回答 NOTES 第 3 題。

## 卡住／待決定

- **舊 `projects.txt` 的專案在 AiMemory `projects/` 沒有對應檔（T21）。** 換電站EMS、微電網、電池、數位人類、AI OS、InMoov、Amazing Hand、可信任的控制、本地LLM/CoPartner、Idea Ledger 這些分類現在只剩 AiMemory 的 8 個專案可選，其餘會歸 `other`。若要保留這些分類，需由 George 在 AiMemory `projects/` 新增檔案（工具不改 AiMemory 的人工維護區）。
- **手機 App 對話是否同步到網頁歷史（T01、T02 第 3 題）尚未驗證。** 這是整個「帳號層巡檢」設計的前提；若答案是否，需回頭改設計。George 選擇本次先略過。
- Google Drive 上的「開發工單追蹤表」不會自動同步。本 repo 的 ROADMAP 是唯一進度來源；若要 `/wrap` 順便更新追蹤表，需在工作階段開啟 Google Sheets 連接器，並把這個步驟加進 `.claude/commands/wrap.md`。

## 工作紀錄

### 2026-10-15 · T21 專案清單改讀 AiMemory `projects/`
- 完成：專案代號＝`projects/*.md` 檔名、名稱＝第一個 `# ` 標題（排除 README、隱藏檔、保留字 `other`）；模型填代號或名稱都轉成代號，歸不到填 `other`；刪除 `projects.txt`。summarizer 測試 32 個全過，另以 AiMemory 實際 clone 唯讀驗證。
- 學到：模型容易照名稱回填，所以驗證時也接受名稱再轉成代號；代號是想法卡、日誌與之後 `ideas/by-project/` 共用的鍵。

### 2026-10-15 · T20 寫入路徑對齊 AiMemory `ledger/`
- 完成：想法卡寫到 `ledger/conversations/YYYY/MM/`、日誌寫到 `ledger/daily/YYYY/MM/`；`IDEA_VAULT` 改名 `IDEA_MEMORY_REPO`；所有寫入與刪除經 `ensure_in_ledger` 檢查。summarizer 測試 31 個全過（新增 10）。CLAUDE.md 慣例與設計文件第 7、8 節同步改為新路徑。
- 學到：`card` 表可能殘留 T10 時期的 `Ideas/` 路徑；改為「ledger/ 外的舊路徑視為沒有舊檔、不讀不刪」，避免搬檔時刪到 `ledger/` 以外。目前尚未部署，沒有實際舊資料需要遷移。

### 2026-10-15 · T01 ChatGPT 介面採樣、T02 Claude 介面採樣（🟡 缺手機對話 D）
- 完成：這次對話連結了 George 的電腦，在 Claude 桌面 App 內建瀏覽器（George 自行登入）建立測試對話 ChatGPT A–C、Claude A–C 與 E，以採樣腳本相同邏輯（只發 GET、瀏覽器內先遮蔽）取樣，經 `import_sample.py` 遮罩後提交 fixtures 與兩份 NOTES.md。所有請求最終皆 200，社群觀察的介面路徑正確。
- 學到：
  - ChatGPT 以 1.5 秒間隔連發三個請求，第三個就回 429；≥3 秒間隔與退避不能放寬。
  - ChatGPT 清單時間是 ISO 字串、單篇是 epoch 秒浮點數；清單 `total` 不是總數，只是「已看到 + 1」。
  - 兩個平台的專案對話都在主清單中，不需要另外巡專案清單。
  - 兩個平台都以「目前葉節點沿 parent 回溯」取得目前分支（ChatGPT `current_node`、Claude `current_leaf_message_uuid`）；ChatGPT 有 `reasoning_recap` 節點要略過。
  - Claude 附件的 `extracted_content` 是檔案全文，adapter 只取檔名。
  - 回應中有與對話無關的個人設定（ChatGPT `safe_urls`、Claude `enabled_mcp_tools`），已在 fixture 中遮蔽，adapter 也不應轉送。
- 剩餘：兩張工單的 D（手機 App 對話）與 NOTES 第 3 題。

### 2026-10-15 · 資料存放改為 AiMemory
- 決定（George）：本 repo 只做工具開發；資料寫到私人 repo `pcpcchen-coder/AiMemory`，當資料庫用。AiMemory 已有人工維護的個人記憶（profile、decisions、memory-pack、projects、inbox）。
- 完成：在 AiMemory 新增 `ledger/` 自動寫入區與路徑規格 `ledger/README.md`（想法卡、每日日誌、每月彙總、想法索引、平台總覽；與每月彙整的銜接；寫入與同步規則），README 目錄結構補上一行，其他檔案未動。本 repo 的 CLAUDE.md 加入 repo 分工與「只能寫 ledger/」約束；新增 T20–T23。
- 待決定：AiMemory 的 README 仍寫著「本 repo 目前為 public」，但實際已是 private，需由 George 決定是否更正（屬人工維護檔案，工具不改）。

### 2026-10-15 · T01、T02 輔助工具（T01、T02 本身仍待 George）
- 背景：George 請雲端工作階段直接操作本機完成採樣，但這個對話沒有連結到他的電腦，無法操作他的瀏覽器。
- 完成：主控台採樣腳本（`extension/tools/sampler/`，ChatGPT、Claude 各一份），只發 GET，下載前在瀏覽器內遮蔽非測試標題、token、email、JWT、組織 ID；匯入工具 `scripts/import_sample.py`（拆檔 → 遮罩 → `REQUESTS.md`）。新增 9 個測試。T01、T02 工單改以腳本為主要做法，手動 DevTools 降為補採用。
- 學到：清單回應會帶出所有對話的標題，原本的手動流程會讓真實標題進到原始檔；改在瀏覽器端先遮蔽。介面路徑仍未經驗證，腳本記錄每個請求的狀態碼，非 200 就退回手動補採。

### 2026-10-15 · T10 Obsidian 寫入與每日日誌
- 完成：想法卡（本地時區檔名、標題變更搬檔、保留使用者改的 status 與個人筆記）、每日平台互動日誌（巡檢狀態行、摘要中標示）；7 個 pytest 與一次端到端執行。
- 學到：判斷想法卡要不要重寫不能只看摘要時間，要加上對話版本；內容相同時不寫檔，避免同步軟體無謂變動。
- 現況：M2 的雲端部分（T09、T10）已完成，等 M1（需要 T01、T02 採樣）打通後即可在 Mac Mini 上串起整條流程。

### 2026-10-15 · T09 Summarizer worker
- 完成：`summarizer/` 套件（store、llm、prompt、worker、`python -m summarizer`），增量摘要、頁面文字、截斷、格式驗證與重試、失敗計數、與 collector 的競態防護；14 個 pytest 全過。
- 學到：摘要期間 collector 可能寫入新版本，清除 `dirty` 必須以讀取當下的 `updated_at` 為條件，否則會漏掉新內容。輸出品質要等接上真實模型（T11）才能評估。

### 2026-10-15 · T06 巡檢核心
- 完成：排程（單一執行、鬧鐘隨機延遲）、分頁管理（找現有 → 重新載入休眠分頁 → 開釘選分頁）、RPC 錯誤還原、節流、退避、水位線、回填佇列、collector 用戶端、設定；平台清單一律來自 `registeredPlatforms()`。擴充測試 39 個全過，並對真實 collector 做端到端驗證。
- 學到：各平台時間字串小數位數不一致，比較時間必須先轉數值。回填佇列不放還在聊的對話也不會漏：它們比佇列最新的還新，回填結束後一般模式會接手。

### 2026-10-15 · T03 Collector v2 端點
- 完成：`/v2/conversations`（冪等寫入、`#nolog` 排除、平台開放、`capture=api|page`）、`/v2/sweep-runs`、`/v2/health`、`/v2/watermark`；26 個 pytest 全過，並實際啟動 uvicorn 驗證。
- 學到：時間要存成固定寬度的 UTC 字串，才能直接用字串比較判斷新舊；同一時刻用 `+08:00` 與 `Z` 表示要視為相同。已摘要的前段若被編輯或切換分支，增量摘要會失準，所以 collector 偵測到前段改寫就把 `summarized_count` 歸零（T09 要依此從頭摘要）。

### 2026-10-15 · 平台開放架構（George 提出的需求，T00 追加）
- 需求：日後使用者要能自行加入 Gemini、Grok 等平台。
- 完成：平台改為資料夾自動註冊。`src/adapters/<id>/platform.json` 描述平台，`npm run gen` 掃描產生註冊表，建置時由 `manifest.base.json` 加上各平台網域產生 manifest；`validateNormalized` 改為只檢查平台 id 格式。新增 `docs/ADDING_A_PLATFORM.md`。擴充測試增為 11 個，包含「放一個 gemini、grok 資料夾就自動註冊並進 manifest」與描述錯誤（id 不符、網域重複、含 https）時建置失敗。
- 文件：CLAUDE.md 加「平台開放」約束；設計文件升為 v2.1（第 11 節）；T03 改為平台 id 不做 enum、新增 `platform_name` 與 `capture` 欄位；T06、T07 改為平台清單一律動態取得；新增 T18（設定頁免程式新增平台）、T19（實測）；T13 Kimi 的驗收加上「只新增資料夾、不改其他檔」。

### 2026-10-15 · T00 Repo 骨架與開發環境
- 完成：v2 目錄結構、esbuild 建置（IIFE）、`make setup／build／test`；v1 程式碼移入 `extension/legacy/`；遮罩工具 `scripts/redact_fixture.py`；測試共 16 個全過（擴充 5、collector 2、遮罩工具 9）。
- 學到：manifest 路徑要以 `dist/` 為根（建置時複製進去），已修正 T00 工單描述，並用測試確保 manifest 引用的檔案都會產出。遮罩工具需要 `--extra-value`，因為像 Claude 組織清單裡的 `uuid` 無法從鍵名判斷是組織 ID。

### 2026-10-15 · 規劃
- 完成設計文件 v2（帳號層巡檢）。
- 建立路線圖、工單 T00–T08、開工／收工指令。
- 建立 Google Drive 開發工單追蹤表（2026-10-15_IdeaLedger_開發工單追蹤表_v1）。
- 學到：雲端工作階段無法登入 George 的平台帳號，因此 adapter 採「解析層用 fixtures 開發、取資料層由 George 本機驗收」的分工。
