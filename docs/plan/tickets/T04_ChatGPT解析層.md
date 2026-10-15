# T04 ChatGPT 解析層

| 狀態 | 執行 | 預估 | 依賴 |
|---|---|---|---|
| ✅ 完成（2026-10-15） | ☁️ 雲端 | 60 分 | T01 |

## 目標

把 ChatGPT 的原始回應轉成統一格式。純函式，不碰網路，用 T01 的 fixtures 測試。

## 開工前讀

- `extension/fixtures/chatgpt/NOTES.md`（**以這份為準**，不要依記憶假設欄位名稱）
- 設計文件 v2 第 4.1 節
- `extension/src/lib/types.js`

## 範圍：`extension/src/adapters/chatgpt/parse.js`

```js
parseSession(json)       // → { accessToken } ；缺少則丟 AdapterFormatError
parseList(json)          // → { items: [{ id, title, updated_at, project }], next }  next 為下一頁參數或 null
parseConversation(json)  // → NormalizedConversation（platform="chatgpt"）
```

- **分支：** 只取使用中的分支（依 NOTES.md 第 4 題的答案判斷，從目前節點往回走到根，再反轉）。
- **角色：** 只保留使用者與助理訊息；系統訊息、工具呼叫、隱藏訊息略過。
- **內容：** 文字段落以換行串接；圖片、檔案換成 `[附件: 檔名]`，不保留內容。
- **時間：** 一律轉 ISO 8601 UTC。
- **格式防護：** 必要欄位缺失時丟 `AdapterFormatError`（定義在 `src/lib/errors.js`），這會被巡檢核心轉成「介面失效」紅燈。
- 最後呼叫 `validateNormalized()` 檢查輸出。

## 驗收（node:test）

- [x] `conversation_simple.json` → 訊息數、順序、角色正確
- [x] `conversation_branched.json` → 只含使用中分支：重新生成後的回覆、編輯後的訊息；被取代的版本不出現
- [x] `conversation_project.json` → `project` 有值
- [x] `list_page1.json` → 項目數正確、`next` 有值；最後一頁 `next` 為 null
- [x] 刪掉必要欄位的變造樣本 → 丟 `AdapterFormatError`
- [x] `make test` 全過

## 不做

- 任何 fetch（T07）

## 收工時

更新 ROADMAP、PROGRESS；commit 訊息以 `T04:` 開頭。若 fixtures 不足以判斷某行為，在 PROGRESS「卡住／待決定」列出需要 George 補採的樣本。

## 完成紀錄

- `parse.js`：`parseSession`、`parseList`、`parseConversation`；測試 9 個（`test/chatgpt-parse.test.js`）。
- 與工單原文不同之處（依 NOTES）：
  - `parseSession` 在回應沒有 `accessToken` 時丟 `NeedsLogin`（NOTES 第 4 題：未登入時只有 `WARNING_BANNER`），回應不是物件才丟 `AdapterFormatError`。
  - `project` 是專案的 `gizmo_id`（`g-p-…`）：清單與單篇都不含專案名稱，名稱需另一個端點（本次未採）。
  - `next` 為 `{ offset }`；判斷最後一頁看 `items.length < limit`（`total` 不是總數）。
- 略過：`reasoning_recap` 等非 `text`／`multimodal_text` 節點、system／tool 角色、`is_visually_hidden_from_conversation`、空白訊息。附件以 `metadata.attachments[].name` 表示，沒有紀錄的圖片 part 記為 `[附件: 圖片]`（樣本中沒有附件，以變造節點測試）。
