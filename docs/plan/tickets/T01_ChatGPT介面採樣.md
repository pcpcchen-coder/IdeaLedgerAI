# T01 ChatGPT 介面採樣

| 狀態 | 執行 | 預估 | 依賴 |
|---|---|---|---|
| ⬜ 待辦 | 🖥 George | 30 分 | T00 |

## 目標

取得 ChatGPT 網頁載入歷史清單與單篇對話時的真實回應樣本，讓雲端工作階段能據此開發解析層（T04）。

## 準備測試對話（約 10 分鐘）

全部用無敏感資訊的內容，開頭都打「IdeaLedger 測試」。

1. **A 一般對話**（網頁）：來回 3 輪。
2. **B 有分支的對話**（網頁）：來回 2 輪後，對最後一則回覆按「重新生成」一次，再編輯你的第 2 則訊息重送一次。
3. **C 專案內的對話**（網頁）：在任一 Project 裡開一段，來回 2 輪。
4. **D 手機 App 對話**：在手機 App 上開一段，來回 1 輪。

## 採樣（約 15 分鐘）

1. 用 Chrome 開 chatgpt.com，按 F12 → Network 分頁 → 篩選 `Fetch/XHR`，勾選 `Preserve log`。
2. 重新整理頁面，捲動左側歷史清單到底一次，再依序點開 A、B、C、D。
3. 在請求清單中找出以下回應，對每一個按右鍵 → Copy → Copy response，存成 JSON 檔：

| 存檔名 | 找什麼 |
|---|---|
| `session.json` | 頁面載入時取得登入狀態的回應（通常含 access token 與使用者資訊） |
| `list_page1.json` | 左側歷史清單第一頁 |
| `list_page2.json` | 捲動後載入的第二頁 |
| `conversation_simple.json` | 對話 A |
| `conversation_branched.json` | 對話 B |
| `project_list.json` | 專案內的對話清單（若專案對話不在主清單中） |
| `conversation_project.json` | 對話 C |

4. 另外記下每個請求的：方法、網址路徑樣式（ID 換成 `{id}`）、分頁參數、需要的特殊 header **名稱**（不要記值）。

## 遮罩與提交（兩種方式擇一）

- **方式 A（本機有 clone）：** 原始檔放 `extension/fixtures/raw/chatgpt/`，執行 `python scripts/redact_fixture.py extension/fixtures/raw/chatgpt extension/fixtures/chatgpt`，確認無錯誤後提交 `extension/fixtures/chatgpt/`。
- **方式 B（較省事）：** 開一個雲端工作階段，把原始 JSON 檔直接拖進對話，說「T01 採樣檔，幫我遮罩並提交」，並附上第 4 步的記錄。

## 需在 `extension/fixtures/chatgpt/NOTES.md` 回答的問題

1. 歷史清單的請求路徑、分頁方式、排序依據的時間欄位是什麼？
2. 專案內的對話有沒有出現在主清單？沒有的話，專案清單怎麼取得？
3. 手機 App 的對話 D 有沒有出現在網頁歷史？
4. 讀取時需要哪些 header（例如 Authorization）？從哪個回應取得？
5. 時間欄位是 ISO 字串還是 epoch 數字？

## 驗收

- [ ] 上表檔案（`project_list.json` 視情況）都已遮罩並提交
- [ ] `NOTES.md` 回答上述 5 題
- [ ] `grep -ri "@" extension/fixtures/chatgpt/*.json` 找不到你的 email

## 收工時

更新 ROADMAP、PROGRESS；commit 訊息以 `T01:` 開頭。若問題 3 的答案是「沒有」，在 PROGRESS「卡住／待決定」記下，這會影響整個設計。
