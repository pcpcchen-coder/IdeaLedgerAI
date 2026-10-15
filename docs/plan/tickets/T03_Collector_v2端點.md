# T03 Collector v2 端點

| 狀態 | 執行 | 預估 | 依賴 |
|---|---|---|---|
| ✅ 完成（2026-10-15） | ☁️ 雲端 | 60 分 | T00 |

## 目標

實作設計文件 v2 第 4 節的 collector：接收結構化對話、冪等寫入、記錄巡檢結果、提供健康與水位線查詢。

## 開工前讀

- 設計文件 v2 第 4、6、7 節
- `collector/app/main.py`（T00 搬入的 v1 版）

## 範圍

拆成 `app/main.py`（路由）、`app/db.py`（SQLite 存取與 schema）、`app/models.py`（Pydantic 模型）。全部端點要求 `Authorization: Bearer <IDEA_TOKEN>`。

| 端點 | 行為 |
|---|---|
| `POST /v2/conversations` | 依設計文件 4.1 格式驗證。不存在 → 新增，`dirty=1`，回 `created`；`updated_at` 較新 → 更新，`dirty=1`，回 `updated`；相同或較舊 → 不動，回 `unchanged`；第一則使用者訊息含 `#nolog` → 不寫入（若已存在則刪除），回 `excluded` |
| `POST /v2/sweep-runs` | 寫一筆 `sweep_run`（platform、started_at、finished_at、status、listed、fetched、error） |
| `GET /v2/health` | 各平台最近一次 `sweep_run` 的狀態、時間，以及 `conv` 筆數 |
| `GET /v2/watermark?platform=x` | 該平台已存對話中最大的 `updated_at`；無資料回 `null`。供擴充儲存遺失時復原 |

- **平台開放**：`platform` 不做 enum，只檢查格式 `^[a-z][a-z0-9-]{1,31}$`；任何新平台不需改 collector 就能寫入。另收選填的 `platform_name`（顯示名稱，來自平台描述），存進 `conv` 供日誌顯示；未提供時以 id 代替。
- **擷取方式欄位**：選填 `capture`，`"api"`（預設，帳號層巡檢）或 `"page"`（T18 免程式平台的頁面文字擷取）。`capture="page"` 時必填 `page_text`、`messages` 可為空陣列；`capture="api"` 時 `messages` 至少一則。兩種都要存，供 summarizer 判斷輸入形式。
- 環境變數：`IDEA_TOKEN`（必填，缺少就啟動失敗）、`IDEA_DB`（預設 `./ledger.db`）。
- 請求大小上限 10 MB。
- 時間一律存 ISO 8601 UTC。

## 驗收（pytest）

- [x] 無 token／錯誤 token → 401
- [x] 新增、更新、相同 `updated_at` 重送、較舊 `updated_at` 送入，四種情況回應與 `dirty` 都正確
- [x] `#nolog` 對話不落地；先存一般版本再送含 `#nolog` 的版本 → 被刪除
- [x] 格式錯誤（缺欄位、role 不合法、platform 格式不符）→ 422
- [x] 未曾出現過的平台 id（例如 `gemini`、`grok`）可直接寫入，`health` 也會列出它
- [x] `capture="page"` 帶 `page_text` 可寫入；缺 `page_text` → 422
- [x] `health`、`watermark` 回傳符合寫入的資料
- [x] `make test` 全過

## 不做

- 摘要、Obsidian 寫入（T09、T10）
- Docker（T11）

## 收工時

更新 ROADMAP、PROGRESS；commit 訊息以 `T03:` 開頭。

## 完成紀錄

- 結構：`app/models.py`（Pydantic）、`app/db.py`（SQLite，WAL，寫入加鎖）、`app/server.py`（`create_app` 工廠）、`app/main.py`（uvicorn 進入點）。v1 的 `/ingest` 與舊資料表已移除。
- 時間一律存成固定寬度的 `YYYY-MM-DDTHH:MM:SS.mmmZ`，字串比較即可判斷先後；帶 `+08:00` 的輸入會轉成 UTC，與等值的 UTC 時間視為相同。沒有時區的時間 → 422。
- 追加：已摘要的前段訊息若被改寫（編輯、切換分支），`summarized_count` 歸零，讓 T09 從頭重新摘要；只是新增訊息則保留。
- `sweep_run.status` 限定 `ok`、`rate_limited`、`needs_login`、`format_error`、`error`，T06 沿用。
- 測試 26 個；另以實際 uvicorn 啟動確認：無 token 回 401、缺 `IDEA_TOKEN` 拒絕啟動、超過 10 MB 回 413。
