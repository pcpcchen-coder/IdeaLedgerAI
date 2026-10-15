# 進度

每次收工（`/wrap`）在最上方新增一筆紀錄，並更新「下一步」。

## 下一步

- **☁️ 雲端可做：** 目前沒有依賴全部滿足的 ☁️ 工單。T04、T05 等 T01、T02 的樣本；T07 等 T04、T05。可先預做 T11 的雲端部分（docker-compose、launchd、部署步驟），或 T07 中不依賴樣本的設定頁與燈號。
- **🖥 等 George：** T01 ChatGPT 介面採樣、T02 Claude 介面採樣（各約 30 分鐘，依賴已滿足）。**這兩張現在是整個專案的關鍵路徑。**

## 卡住／待決定

- Google Drive 上的「開發工單追蹤表」不會自動同步。本 repo 的 ROADMAP 是唯一進度來源；若要 `/wrap` 順便更新追蹤表，需在工作階段開啟 Google Sheets 連接器，並把這個步驟加進 `.claude/commands/wrap.md`。

## 工作紀錄

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
