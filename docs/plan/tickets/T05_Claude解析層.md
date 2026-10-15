# T05 Claude 解析層

| 狀態 | 執行 | 預估 | 依賴 |
|---|---|---|---|
| ✅ 完成（2026-10-15） | ☁️ 雲端 | 45 分 | T02 |

## 目標

把 claude.ai 的原始回應轉成統一格式。純函式，用 T02 的 fixtures 測試。結構比照 T04。

## 開工前讀

- `extension/fixtures/claude/NOTES.md`（**以這份為準**）
- `extension/src/adapters/chatgpt/parse.js`（T04 的寫法，保持一致）

## 範圍：`extension/src/adapters/claude/parse.js`

```js
parseOrganizations(json)  // → { orgId }；多組織時依 NOTES.md 第 6 題的規則選
parseList(json)           // → { items: [{ id, title, updated_at, project }], next }
parseConversation(json)   // → NormalizedConversation（platform="claude"）
```

- **分支：** 依 NOTES.md 第 4 題判斷使用中分支。
- **角色：** 人類訊息 → `user`，助理訊息 → `assistant`。
- **內容：** 只取文字區塊；附件換成 `[附件: 檔名]`。
- 錯誤處理、時間格式、`validateNormalized()` 同 T04。

## 驗收（node:test）

- [x] simple、branched、project、attachment 四個樣本各有對應測試，判準同 T04
- [x] `conversation_attachment.json` → 含 `[附件: 檔名]`，不含檔案內容
- [x] 變造樣本 → `AdapterFormatError`
- [x] `make test` 全過

## 收工時

更新 ROADMAP、PROGRESS；commit 訊息以 `T05:` 開頭。

## 完成紀錄

- `parse.js`：`parseOrganizations`、`parseList`、`parseConversation`；測試 10 個（`test/claude-parse.test.js`）。
- 介面補充（T07 使用時注意）：
  - `parseList(json, { offset, limit })`：清單回應是陣列、沒有分頁資訊，要傳入這次請求的 `offset`、`limit` 才能算出 `next`。
  - `parseConversation(json, { project })`：單篇只有 `project_uuid`，專案名稱在清單的 `project.name`；T07 可把清單項目的 `project` 傳進來，沒傳就用 `project_uuid`。
  - `parseOrganizations` 找不到可聊天的組織時丟 `NeedsLogin`，回應不是陣列才丟 `AdapterFormatError`。
- 只取 `content` 的 `text` 區塊（`thinking` 等略過）；`attachments` 與 `files` 只留檔名，不取 `extracted_content`。
- 更正 NOTES：頂層 `text` 欄位在樣本中全是空字串，不是「也有值」。
