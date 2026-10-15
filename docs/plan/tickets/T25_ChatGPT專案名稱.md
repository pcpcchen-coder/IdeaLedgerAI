# T25 ChatGPT 專案名稱

| 狀態 | 執行 | 預估 | 依賴 |
|---|---|---|---|
| ✅ 完成 | ☁️ 雲端 | 45 分 | T24、T07 |

## 目標

想法卡、日誌與索引上的 ChatGPT 專案顯示名稱，而不是 `g-p-…` ID。

## 開工前讀

- `extension/fixtures/chatgpt/NOTES.md`「專案名稱」一節（T24 新增，**以這份為準**）
- `extension/src/adapters/chatgpt/parse.js`（T04）、`fetch.js`（T07）

## 範圍：只改 `extension/src/adapters/chatgpt/`

- `parse.js` 新增 `parseProjects(json)` → `{ [gizmo_id]: 名稱 }`；格式不符丟 `AdapterFormatError`。
- `fetch.js`：分頁存活期間快取專案名稱表；`listUpdated`、`getConversation` 遇到 `g-p-` ID 時換成名稱。
  - 遇到表中沒有的 ID 才重取一次名稱表（每輪最多一次），仍找不到就保留 ID。
  - 取名稱表失敗（含 429）不影響對話本身的收取：記錄後保留 ID；429 仍照常觸發退避。
  - 只發 GET，遵守 ≥3 秒間隔（名稱表請求也算一次請求）。
- 不改巡檢核心、collector、summarizer（平台差異只在 adapter 資料夾）。

## 驗收（node:test）

- [x] `parseProjects(projects_page1.json)`（回傳名稱表與下一頁 cursor） 取出「IdeaLedger 測試專案」與其 ID；變造樣本 → `AdapterFormatError`
- [x] 假 `fetch` 下，清單與單篇的 `project` 為名稱；名稱表只請求一次並被快取
- [x] 出現新的專案 ID 時重取一次名稱表；仍沒有就保留 ID
- [x] 名稱表請求失敗時，對話照常輸出（`project` 為 ID）
- [x] 除了 `adapters/chatgpt/`、fixtures 與測試，沒有修改其他檔案
- [x] `make test` 全過

## 不做

- 已經寫成想法卡的舊對話不回頭補名稱；之後對話更新、重新摘要時自然更新。

## 收工時

更新 ROADMAP、PROGRESS；commit 訊息以 `T25:` 開頭。

## 結果（2026-10-15）

- 名稱表來源：`/backend-api/gizmos/snorlax/sidebar?conversations_per_gizmo=0&limit=20&owned_only=false`，以 `cursor` 翻頁（最多 10 頁）。
- 「每輪最多重讀一次」以時間實作：遇到沒看過的專案 ID，距上次讀名稱表超過 10 分鐘才重讀（adapter 沒有「輪」的概念）。
- 名稱表 5xx、格式不符：保留 ID、對話照常；429／未登入照常拋出交給退避。
- 既有 `fetch.test.js` 三個測試的請求序列多了名稱表請求，已更新預期。
- 注意：專案黑名單比對的是 `project` 字串；ChatGPT 對話的 `project` 改為名稱後，黑名單裡填 `g-p-` ID 的項目不再命中（記在 PROGRESS 待決定）。
