# T23 Git 發佈器（pull → 寫入 → commit → push）

| 狀態 | 執行 | 預估 | 依賴 |
|---|---|---|---|
| ✅ 完成（2026-10-15） | ☁️ 雲端 | 60 分 | T20 |

## 目標

讓 Mac Mini 上的 AiMemory clone 每輪自動與 GitHub 同步：先拉下 George 在其他裝置改的 `status` 與筆記，再寫入 `ledger/`，有變動才 commit、push。規則依 `AiMemory/ledger/README.md`「寫入與同步規則」。

## 開工前讀

- `AiMemory/ledger/README.md`「寫入與同步規則」
- `summarizer/obsidian.py`（`LedgerWriter`、`card` 表）、`summarizer/__main__.py`

## 範圍：`summarizer/publisher.py`、`summarizer/__main__.py`

每輪 `publish(repo, writer)`：

1. **前置檢查：** 工作區若有 `ledger/` 以外的變動（含未追蹤檔）→ 中止這輪，不寫、不 commit。
2. **pull：** `git pull --rebase --autostash`。
   - 網路等失敗 → 中止這輪，不寫（資料都在 collector 資料庫，下一輪會補寫）。
   - **rebase 衝突**（上一輪沒推出去的 bot commit 與遠端使用者修改衝突）→ `rebase --abort`；確認未推出的 commit 都是 bot 的、且只動 `ledger/`，才丟棄它們並回到遠端版本，同時讓這些想法卡下一次重寫（重寫時會讀到使用者的 `status` 與筆記）。否則中止這輪。不這樣處理的話，同一個衝突會每輪重複。
3. **寫入：** `writer.run()`（T20 的 `LedgerWriter`）。
4. **commit 前再檢查：** 變更只在 `ledger/` 內，否則中止且不 commit。只 `git add ledger/`。
5. **commit：** 有變動才 commit。作者與 committer 都是 `Idea Ledger Bot`，訊息 `ledger: 想法卡 N、日誌 M（YYYY-MM-DD HH:MM）`（台北時間；有其他 `ledger/` 檔變動時加「、其他 K」）。
6. **push：** 被拒 → 重新 `pull --rebase` 再推一次；仍失敗 → 留在本機，下一輪再推。不使用 force。

設定（`python -m summarizer`）：`IDEA_GIT_PUBLISH=1` 才走發佈器（預設關閉，部署時在 T11 開啟）；`IDEA_GIT_EMAIL` 可覆寫 bot 的 email。

## 驗收（pytest，暫存資料夾 + 本機 bare repo 當假遠端，不碰真正的 AiMemory）

- [x] 正常發佈：遠端出現想法卡與日誌；作者為 `Idea Ledger Bot`；訊息格式正確
- [x] 無變動不 commit：第二輪遠端 HEAD 不變
- [x] 遠端有新 commit（使用者在其他裝置提交）：正確 rebase，歷史為線性，使用者的 commit 保留
- [x] 使用者在遠端改了想法卡 `status` 與筆記後，重新摘要再發佈，兩者仍保留
- [x] `ledger/` 外有變動時中止，不 commit；寫入器若寫到 `ledger/` 外，也在 commit 前中止
- [x] push 被拒（寫入期間遠端多了 commit）→ 重新 pull 後推送成功
- [x] 遠端不通時 commit 留在本機，下一輪推出
- [x] 未推出的 bot commit 與遠端使用者修改衝突 → 下一輪自動回到遠端版本並重寫，使用者的 `status` 保留
- [x] `make test` 全過

## 不做

- launchd 排程、Mac Mini 上的 clone 與 push 權限設定（T11）
- 衍生索引（T22）

## 收工時

更新 ROADMAP、PROGRESS；commit 訊息以 `T23:` 開頭。

## 完成紀錄

- `summarizer/publisher.py`：`publish(repo, writer)` 回報 `pushed／no_changes／aborted／pull_failed／push_failed／error`；所有 git 指令都以 bot 身分執行（rebase、autostash 也會產生 commit），不依賴本機的 git 設定。
- 路徑一律以 `-z` 解析：中文檔名在預設設定下會被 git 加引號跳脫。
- `LedgerWriter.reset_card()`：丟棄未推出的 commit 後，讓相關想法卡下一次重寫；搬檔的情況把路徑指回遠端上的舊檔，才讀得到使用者的 `status`。
- `python -m summarizer`：`IDEA_GIT_PUBLISH=1` 才發佈；失敗時結束碼 2。
- 測試 11 個（9 個以 bare repo 當假遠端，含不讀全域 git 設定）；summarizer 共 42 個。
