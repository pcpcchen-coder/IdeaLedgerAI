# T02 Claude 介面採樣

| 狀態 | 執行 | 預估 | 依賴 |
|---|---|---|---|
| ⬜ 待辦 | 🖥 George | 30 分 | T00 |

## 目標

取得 claude.ai 載入歷史清單與單篇對話時的真實回應樣本，供 T05 開發解析層。

## 準備測試對話（約 10 分鐘）

全部用無敏感資訊的內容，開頭都打「IdeaLedger 測試」。

1. **A 一般對話**（網頁）：來回 3 輪。
2. **B 有分支的對話**（網頁）：來回 2 輪後，對最後一則回覆按「重試」一次，再編輯你的第 2 則訊息重送一次。
3. **C 專案內的對話**（網頁）：在任一 Project 裡開一段，來回 2 輪。
4. **D 手機 App 對話**：在手機 App 上開一段，來回 1 輪。
5. **E 含附件的對話**（網頁）：上傳一張小圖片或文字檔，問一句。

## 採樣（約 15 分鐘）

1. 用 Chrome 開 claude.ai，按 F12 → Network → 篩選 `Fetch/XHR`，勾選 `Preserve log`。
2. 重新整理，開啟「所有對話」清單並捲動到底一次，再依序點開 A–E。
3. 存下以下回應（右鍵 → Copy → Copy response）：

| 存檔名 | 找什麼 |
|---|---|
| `organizations.json` | 取得組織資訊的回應 |
| `list_page1.json` | 對話清單（第一頁） |
| `list_page2.json` | 捲動後的第二頁（若有分頁） |
| `conversation_simple.json` | 對話 A |
| `conversation_branched.json` | 對話 B |
| `conversation_project.json` | 對話 C |
| `conversation_attachment.json` | 對話 E |

4. 記下每個請求的：方法、網址路徑樣式（ID 換成 `{id}`、`{org}`）、查詢參數、分頁方式。

## 遮罩與提交

同 T01（方式 A 輸出到 `extension/fixtures/claude/`，或方式 B 拖進雲端工作階段）。

## 需在 `extension/fixtures/claude/NOTES.md` 回答的問題

1. 對話清單的請求路徑、分頁方式、排序依據的時間欄位？
2. 專案內的對話是否在同一清單？
3. 手機 App 的對話 D 有沒有出現？
4. 單篇對話如何表示分支？目前使用中的分支怎麼判斷？
5. 附件在回應裡長什麼樣（只需要檔名）？
6. 有多個組織時，要用哪一個？

## 驗收

- [ ] 上表檔案已遮罩並提交
- [ ] `NOTES.md` 回答上述 6 題
- [ ] 組織 ID、使用者 ID 都已替換成佔位字串

## 收工時

更新 ROADMAP、PROGRESS；commit 訊息以 `T02:` 開頭。
