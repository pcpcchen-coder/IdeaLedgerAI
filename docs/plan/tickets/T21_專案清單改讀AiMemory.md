# T21 專案清單改讀 AiMemory `projects/`

| 狀態 | 執行 | 預估 | 依賴 |
|---|---|---|---|
| ✅ 完成（2026-10-15） | ☁️ 雲端 | 30 分 | T20 |

## 目標

想法卡可歸類的專案不再由 `summarizer/projects.txt` 維護，改為直接讀 AiMemory 的 `projects/*.md`。George 在 AiMemory 新增專案檔後，不必改工具就能被歸類。

## 開工前讀

- `AiMemory/ledger/README.md`（`<專案代號>` 規則、`other`）
- `summarizer/prompt.py`、`summarizer/worker.py`

## 範圍：`summarizer/prompt.py`、`summarizer/worker.py`、`summarizer/__main__.py`

- **專案代號** ＝ `<IDEA_MEMORY_REPO>/projects/*.md` 的檔名（不含副檔名）；排除 `README.md`、以 `.` 開頭的檔案，以及保留字 `other`。
- **專案名稱** ＝ 檔案中第一個 `# ` 標題；沒有標題就用代號。
- 只讀不寫：工具不得修改 `projects/` 底下任何檔案。
- 系統提示列出「代號：名稱」，要求模型輸出代號；驗證時接受代號，也接受模型誤填的名稱（轉成代號），其餘丟掉；都沒有就填 `other`。
- 想法卡 frontmatter 的 `projects` 與日誌的專案欄存代號。
- 未設定 `IDEA_MEMORY_REPO` 或沒有 `projects/` 時，清單為空，全部歸 `other`。
- 刪除 `summarizer/projects.txt`；`summarizer/prompt.md` 說明同步更新。

## 驗收（pytest，暫存資料夾當 AiMemory clone）

- [x] 讀出代號與名稱；排除 README、隱藏檔、`other`；沒有標題時以代號當名稱
- [x] 系統提示列出代號與名稱
- [x] 模型輸出代號或名稱都能歸類；清單外的被丟掉；都不符合填 `other`
- [x] 在暫存 repo 新增一個專案檔後，不改工具即可被歸類，想法卡 `projects` 存代號
- [x] 讀取前後 `projects/` 內容與修改時間不變
- [x] `make test` 全過

## 不做

- 依專案分組的想法索引 `ledger/ideas/by-project/`（T22）
- git 同步（T23）

## 收工時

更新 ROADMAP、PROGRESS；commit 訊息以 `T21:` 開頭。

## 完成紀錄

- `prompt.load_projects(repo)` 回傳 `{代號: 名稱}`；系統提示列出「代號（名稱）」。
- `parse_result` 接受代號或名稱，一律轉成代號並去重；都不符合填 `other`（原本是「其他」）。
- `python -m summarizer` 以 `IDEA_MEMORY_REPO` 同時決定專案清單與寫入位置；刪除 `summarizer/projects.txt`。
- 測試 32 個（含新增專案檔即可歸類、`projects/` 只讀）；另以 AiMemory 實際 clone 唯讀驗證，8 個專案的代號與名稱正確讀出。
