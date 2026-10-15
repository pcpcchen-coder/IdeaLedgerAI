# T24 ChatGPT 專案名稱採樣

| 狀態 | 執行 | 預估 | 依賴 |
|---|---|---|---|
| ⬜ 待辦 | 🖥 George | 15 分 | T01 |

## 目標

找出 ChatGPT 網頁取得「專案名稱」的請求，取一份回應樣本，讓 T25 能把想法卡上的 `g-p-…` 換成專案名稱。

背景：T01 的清單與單篇回應只有專案 ID（`gizmo_id`，`g-p-` 開頭），沒有名稱（見 `extension/fixtures/chatgpt/NOTES.md` 第 2 題）。網頁左側欄能顯示專案名稱，所以一定有某個請求帶著名稱；路徑要實際看 Network 才能確定，不要憑記憶假設。

## 準備（約 2 分鐘）

- 建一個測試專案，名稱用「IdeaLedger 測試專案」，裡面開一段對話「IdeaLedger 測試 F」，來回 1 輪。
- 測試專案以外的專案名稱都是個人資料，提交前一律遮蔽。

## 採樣（約 10 分鐘）

1. Chrome 開 chatgpt.com，F12 → Network → 篩選 `Fetch/XHR`，勾選 `Preserve log`。
2. 重新整理頁面；展開左側欄的「專案」區塊，點開「IdeaLedger 測試專案」。
3. 在 Network 的搜尋框（放大鏡，搜尋回應內容）輸入 `IdeaLedger 測試專案`，找出回應中同時含有這個名稱與 `g-p-` 開頭 ID 的請求（可能不只一個，挑最小、只用 GET 的那個）。
4. 對該請求：右鍵 → Copy → Copy response，存成 `projects.json`。
5. 記下：方法（必須是 GET）、網址路徑樣式（ID 換成 `{id}`）、查詢參數、分頁方式（若有）、需要的 header **名稱**（例如是否要 `Authorization`）。
6. 若有好幾個專案，確認回應是否列出**全部**專案；若需要捲動才會載入更多，記下第二頁的請求參數。

## 遮罩與提交

- **建議（方式 B）：** 開雲端工作階段，把 `projects.json` 拖進對話，說「T24 採樣檔，幫我遮罩並提交」，並附上第 5、6 步的記錄。雲端會把測試專案以外的名稱換成「（其他專案，已遮蔽）」、清掉 token 與 email 後提交到 `extension/fixtures/chatgpt/projects.json`，並在 `NOTES.md` 新增「專案名稱」一節。
- 原始檔若放在本機，只能放 `extension/fixtures/raw/chatgpt/`（已 gitignore）。

## 驗收

- [ ] `extension/fixtures/chatgpt/projects.json` 已遮蔽並提交，含「IdeaLedger 測試專案」與其 `g-p-` ID
- [ ] `NOTES.md` 記下請求路徑、參數、分頁、header 名稱，以及是否一次列出全部專案
- [ ] `grep -ri "@" extension/fixtures/chatgpt/projects.json` 找不到 email

## 收工時

更新 ROADMAP、PROGRESS；commit 訊息以 `T24:` 開頭。若找不到任何帶專案名稱的 GET 請求，在 PROGRESS「卡住／待決定」記下，T25 改為維持顯示 ID。
