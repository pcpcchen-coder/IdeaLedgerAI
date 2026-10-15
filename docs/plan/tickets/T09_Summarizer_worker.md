# T09 Summarizer worker

| 狀態 | 執行 | 預估 | 依賴 |
|---|---|---|---|
| ✅ 完成（2026-10-15） | ☁️ 雲端 | 90 分 | T03 |

## 目標

把 collector 收到的對話，用本地模型（經 LiteLLM Gateway，OpenAI 相容介面）摘要成想法卡的結構化資料，存回 SQLite，供 T10 寫成 Obsidian 檔案。由 launchd 每 5 分鐘執行一次（部署在 T11）。

## 開工前讀

- 設計文件 v2.1 第 4.2 節；`summarizer/prompt.md`
- `collector/app/db.py`（`conv` 表：`dirty`、`summarized_count`、`capture`、`page_text`）

## 範圍

`summarizer/` 為獨立 Python 套件，與 collector 共用同一個 SQLite 檔：

| 檔案 | 內容 |
|---|---|
| `store.py` | 讀待摘要對話、寫 `summary` 表；建立自己需要的表 |
| `llm.py` | OpenAI 相容 `/chat/completions` 用戶端（httpx） |
| `prompt.py` | 系統提示與輸入組裝（含增量、頁面文字、截斷） |
| `worker.py` | `run_once()`：挑對話 → 呼叫模型 → 驗證 → 存檔 |
| `__main__.py` | `python -m summarizer`：執行一次（給 launchd） |

### 規則

- **挑選：** `dirty=1` 且對話 `updated_at` 早於現在 15 分鐘；每次最多 20 段（可調），依 `updated_at` 由舊到新。
- **增量：** `summarized_count > 0` 且已有摘要 → 只送 `messages[summarized_count:]` 加上前一版摘要；否則送全部。collector 偵測到前段被改寫時已把 `summarized_count` 歸零。
- **頁面擷取：** `capture="page"` 送 `page_text`，提示模型忽略介面雜訊。
- **截斷：** 輸入超過 20,000 字時保留最後的部分，並註明前段已省略。
- **輸出驗證：** 解析 JSON（容忍 ```json 包裹），以 Pydantic 檢查；想法類型限「新想法／延伸／待驗證」；專案只保留清單內的，沒有就填「其他」。失敗時附上錯誤重試一次。
- **失敗：** 兩次都失敗 → `attempts+1`、記錄錯誤、保持 `dirty=1`；同一版本連續失敗 3 次就略過，直到對話再更新。
- **競態防護：** 寫回 `dirty=0` 時以讀取當下的 `updated_at` 為條件；若期間 collector 寫入新版本，維持 `dirty=1` 等下次處理。
- **平台開放：** 只用 `platform_name`（沒有就用 id）放進提示，不認得任何特定平台。
- **專案清單：** 讀 `summarizer/projects.txt`（一行一個），不寫死在程式。
- **設定：** 環境變數 `IDEA_DB`、`LLM_BASE_URL`（預設 `http://127.0.0.1:4000/v1`）、`LLM_MODEL`、`LLM_API_KEY`（選填）、`SUMMARY_BATCH`（預設 20）。

## 驗收（pytest，假 LLM）

- [x] 完整摘要：寫入 `summary`，`dirty=0`，`summarized_count = message_count`
- [x] 增量：只送新訊息與前一版摘要
- [x] 前段改寫（`summarized_count=0`）→ 送全部
- [x] 頁面擷取送 `page_text`
- [x] 15 分鐘內更新的對話不處理
- [x] 輸出包在 ```json 內也能解析；第一次格式錯、第二次對 → 成功
- [x] 兩次都錯 → `attempts` 增加、保持 `dirty=1`；連續 3 次後略過，對話更新後恢復
- [x] 處理期間 collector 寫入新版本 → 維持 `dirty=1`
- [x] 未見過的平台（`grok`）照常摘要，提示中出現其顯示名稱
- [x] LLM 用戶端以 httpx MockTransport 測試請求格式與錯誤處理
- [x] `make test` 全過

## 不做

- Obsidian 寫入（T10）
- launchd、Docker（T11）

## 收工時

更新 ROADMAP、PROGRESS；commit 訊息以 `T09:` 開頭。

## 完成紀錄

- 14 個 pytest（假 LLM、httpx MockTransport），並與 collector 的實際寫入路徑共用 schema 測試。
- `summary` 表另記 `source_updated_at`（摘要依據的對話版本）與失敗資訊（`attempts`、`failed_version`、`last_error`），T10、T14 可直接使用。
- 提示中要求只收使用者提出或採納的想法，避免把 AI 的建議當成使用者的想法。
- 專案清單放在 `summarizer/projects.txt`；模型回傳清單外的專案會被濾掉，全部濾掉時填「其他」。
- 尚未對真實模型驗證輸出品質，留待 T11 部署後觀察；若模型常輸出格式錯誤，可在 LiteLLM 端改用支援 JSON 模式的模型。
