# T25 ChatGPT 專案名稱

| 狀態 | 執行 | 預估 | 依賴 |
|---|---|---|---|
| ⬜ 待辦 | ☁️ 雲端 | 45 分 | T24、T07 |

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

- [ ] `parseProjects(projects_page1.json)`（回傳名稱表與下一頁 cursor） 取出「IdeaLedger 測試專案」與其 ID；變造樣本 → `AdapterFormatError`
- [ ] 假 `fetch` 下，清單與單篇的 `project` 為名稱；名稱表只請求一次並被快取
- [ ] 出現新的專案 ID 時重取一次名稱表；仍沒有就保留 ID
- [ ] 名稱表請求失敗時，對話照常輸出（`project` 為 ID）
- [ ] 除了 `adapters/chatgpt/`、fixtures 與測試，沒有修改其他檔案
- [ ] `make test` 全過

## 不做

- 已經寫成想法卡的舊對話不回頭補名稱；之後對話更新、重新摘要時自然更新。

## 收工時

更新 ROADMAP、PROGRESS；commit 訊息以 `T25:` 開頭。
