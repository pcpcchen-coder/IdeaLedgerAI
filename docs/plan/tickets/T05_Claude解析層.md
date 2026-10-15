# T05 Claude 解析層

| 狀態 | 執行 | 預估 | 依賴 |
|---|---|---|---|
| ⬜ 待辦 | ☁️ 雲端 | 45 分 | T02 |

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

- [ ] simple、branched、project、attachment 四個樣本各有對應測試，判準同 T04
- [ ] `conversation_attachment.json` → 含 `[附件: 檔名]`，不含檔案內容
- [ ] 變造樣本 → `AdapterFormatError`
- [ ] `make test` 全過

## 收工時

更新 ROADMAP、PROGRESS；commit 訊息以 `T05:` 開頭。
