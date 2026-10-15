# T01 ChatGPT 介面採樣

| 狀態 | 執行 | 預估 | 依賴 |
|---|---|---|---|
| ✅ 完成 | 🖥 George | 30 分 | T00 |

## 目標

取得 ChatGPT 網頁載入歷史清單與單篇對話時的真實回應樣本，讓雲端工作階段能據此開發解析層（T04）。

## 最快的做法：主控台採樣腳本（約 15 分鐘，含建立測試對話）

1. 照下方「準備測試對話」建好 A–D。
2. 用 Chrome 打開已登入的 chatgpt.com，按 F12 → Console 分頁。
3. 打開 [`extension/tools/sampler/out/chatgpt.console.js`](../../../extension/tools/sampler/out/chatgpt.console.js)，在 GitHub 按「Raw」後全選複製，貼進 Console 按 Enter。
   - Chrome 第一次貼程式碼時會要求先輸入 `allow pasting`，照做後再貼一次。
4. 跳出的對話框依序貼上 A–D 的網址（空白或逗號分隔），按確定。
5. 約 20 秒後會自動下載 `idealedger_chatgpt_sample.json`。Console 會列出每個請求的狀態碼。
6. 開一個雲端工作階段，把檔案拖進對話並說「T01 採樣檔」，由雲端工作階段執行匯入、撰寫 NOTES.md 並提交。
   - 本機有 clone 也可以自己跑：`python scripts/import_sample.py idealedger_chatgpt_sample.json`

腳本做了什麼：
- 只發 GET 請求，不改動任何資料。
- 下載前就在你的瀏覽器內遮蔽：非測試對話的標題、token、email、JWT（以及 Claude 的組織名稱與組織 ID），所以你的真實對話標題不會離開你的電腦。
- 介面路徑是社群觀察到的非官方路徑，未經驗證。**任何請求不是 200 時，該項改用下方的手動做法補採。**

## 準備測試對話（約 10 分鐘）

全部用無敏感資訊的內容，開頭都打「IdeaLedger 測試」。

1. **A 一般對話**（網頁）：來回 3 輪。
2. **B 有分支的對話**（網頁）：來回 2 輪後，對最後一則回覆按「重新生成」一次，再編輯你的第 2 則訊息重送一次。
3. **C 專案內的對話**（網頁）：在任一 Project 裡開一段，來回 2 輪。
4. **D 手機 App 對話**：在手機 App 上開一段，來回 1 輪。

## 手動做法（腳本有請求失敗時）

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

- [x] 上表檔案已遮罩並提交（專案對話在主清單中，不需要 `project_list.json`）
- [x] `NOTES.md` 回答上述 5 題（第 3 題依 George 確認）
- [x] `grep -ri "@" extension/fixtures/chatgpt/*.json` 找不到你的 email

## 收工時

更新 ROADMAP、PROGRESS；commit 訊息以 `T01:` 開頭。若問題 3 的答案是「沒有」，在 PROGRESS「卡住／待決定」記下，這會影響整個設計。


## 結案說明

- 2026-10-15 在 Claude 桌面 App 內建瀏覽器完成測試對話建立與採樣。
- D（手機 App 對話）未採：George 確認手機 App 對話一定會同步到網頁歷史，不另測。
