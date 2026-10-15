# T20 寫入路徑對齊 AiMemory `ledger/`

| 狀態 | 執行 | 預估 | 依賴 |
|---|---|---|---|
| 🟡 進行中 | ☁️ 雲端 | 30 分 | T10 |

## 目標

把 T10 的想法卡與每日日誌改寫到 AiMemory 的 `ledger/`，路徑依 `AiMemory/ledger/README.md`。寫入根目錄改為 AiMemory 的本機 clone，且程式保證不會寫到 `ledger/` 以外。

## 開工前讀

- `AiMemory/ledger/README.md`（路徑規格，以它為準）
- `summarizer/obsidian.py`、`summarizer/tests/test_obsidian.py`（T10）

## 範圍：`summarizer/obsidian.py`、`summarizer/__main__.py`

| 項目 | 舊 | 新 |
|---|---|---|
| 想法卡 | `Ideas/YYYY/MM/YYYY-MM-DD_<platform>_<標題>.md` | `ledger/conversations/YYYY/MM/YYYY-MM-DD_<platform>_<標題>.md` |
| 每日日誌 | `Ideas/_log/YYYY-MM-DD.md` | `ledger/daily/YYYY/MM/YYYY-MM-DD.md` |
| 環境變數 | `IDEA_VAULT`（Obsidian vault 根目錄） | `IDEA_MEMORY_REPO`（AiMemory 本機 clone 的根目錄） |

- 寫入器的根目錄是 AiMemory repo 根；所有寫入、刪除都經過同一個檢查，路徑解析後必須在 `<repo>/ledger/` 之內，否則丟出錯誤、不動檔案。
- `card` 表的 `path` 改存相對於 repo 根的路徑（`ledger/...`）。舊紀錄若指向 `ledger/` 以外（T10 時期的 `Ideas/`），視為沒有舊檔：不讀、不刪。
- 其餘行為（保留 `status` 與個人筆記、標題變更搬檔、內容相同不重寫）不變。
- 文件：`__main__.py` 說明、`CLAUDE.md` 慣例同步改名。

## 驗收（pytest，暫存資料夾當 AiMemory clone）

- [ ] 快照測試改為新路徑，想法卡內容不變
- [ ] 日誌寫到 `ledger/daily/YYYY/MM/`
- [ ] 一次完整執行後，repo 內 `ledger/` 以外沒有任何新檔或變動（暫存 repo 預先放一個 `profile.md`，內容與修改時間不變）
- [ ] 路徑檢查拒絕 `ledger/` 以外的路徑（含 `..` 跳脫）
- [ ] `card` 表殘留 `Ideas/` 舊路徑時，不讀不刪 `ledger/` 外的檔案
- [ ] `IDEA_MEMORY_REPO` 未設定時不寫任何檔
- [ ] `make test` 全過

## 不做

- 專案清單改讀 `projects/`（T21）
- 衍生索引 `platforms.md`、`monthly/`、`ideas/`（T22）
- git pull／commit／push（T23）

## 收工時

更新 ROADMAP、PROGRESS；commit 訊息以 `T20:` 開頭。
