# T16 排除規則 UI（`#nolog`、專案黑名單）

| 狀態 | 執行 | 預估 | 依賴 |
|---|---|---|---|
| ✅ 完成（2026-10-15） | ☁️ 雲端 | 45 分 | T07 |

## 目標

George 能在設定頁列出「不想記錄」的平台專案，擴充巡檢時整個略過，對話內容不會送到 collector；並確認 `#nolog` 在 collector 端丟棄、不落地。

## 開工前讀

- 設計文件 v2 第 9 節「排除」；CLAUDE.md「排除」約束
- `extension/src/bg/round.js`（T06）、`extension/src/options/`（T07）
- `collector/app/models.py` 的 `is_nolog`、`collector/tests/test_v2.py` 的 `#nolog` 測試（T03）

## 範圍

### 專案黑名單（擴充端）

- 設定新增 `projectBlacklist`：字串陣列；設定頁以多行文字框編輯，一行一個，可填專案名稱或專案 ID（ChatGPT 在 T25 前只有 `g-p-` ID）。儲存時去空白、去重複、略過空行。
- 比對：與清單項目或單篇對話的 `project` 完全相同（不分大小寫、前後空白不計）。平台無關，不以平台 id 分支。
- `round.js`：
  - 清單項目的 `project` 在黑名單 → 不讀單篇（不發請求）。項目仍留在一般模式的計畫與回填佇列裡，依原本由舊到新的順序推進水位線，才不會越過還沒處理的對話。
  - 單篇讀回後若 `project` 在黑名單（例如回填佇列早於黑名單建立），不送 collector。
  - 被略過的對話仍推進水位線、移出回填佇列，避免每輪重複處理。
  - 本輪略過數記在 `lastRun.excluded`，設定頁顯示。
- `bg/index.js` 把設定傳進巡檢核心。

### `#nolog`（collector 端，T03 已實作）

- 確認既有測試涵蓋「第一則使用者訊息含 `#nolog` → 不寫入」與「已存在的對話後來加上 `#nolog` → 刪除」，必要時補測試；擴充端不另做判斷（避免兩處規則不一致）。

## 驗收（node:test、pytest）

- [x] 設定表單：多行文字 → 陣列（去空白、去重複、略過空行）
- [x] 一般模式：黑名單專案的對話不讀單篇、不送 collector，水位線照常推進
- [x] 回填：佇列項目帶 `project`，黑名單專案不讀單篇；讀回後才發現在黑名單的，不送 collector；兩者都移出佇列
- [x] 比對不分大小寫；新平台（假平台 id）同樣適用
- [x] `#nolog` 不落地的 collector 測試存在且通過
- [x] 設定頁顯示黑名單文字框與上輪略過數（Playwright 載入 `dist/` 確認）
- [x] `make test` 全過

## 不做

- 已經收進 collector 的舊對話不回頭刪除（之後改黑名單不追溯）。
- 依平台分開的黑名單。

## 收工時

更新 ROADMAP、PROGRESS；commit 訊息以 `T16:` 開頭。

## 完成紀錄

- `src/lib/exclude.js`：`parseBlacklist`、`isExcludedProject`（平台無關）。
- `round.js`：清單項目的專案在黑名單就不讀單篇；讀回後才知道的不送出；兩者都推進水位線並移出回填佇列，`lastRun.excluded` 記錄略過數。回填佇列項目改為帶 `project`。
- 設定：`projectBlacklist`；設定頁多行文字框（含 `#nolog` 用法說明），平台表格顯示「略過 N」。
- `#nolog`：collector 既有 4 個測試涵蓋（不落地、事後加上會刪除、只看第一則使用者訊息、頁面擷取），擴充端不另做判斷。
- 測試新增 5 個（`exclude.test.js` 4、設定頁 1），擴充共 82 個；以 Playwright 載入 `dist/` 確認黑名單欄位可儲存並整理。
