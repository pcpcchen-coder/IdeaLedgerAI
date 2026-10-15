# 進度

每次收工（`/wrap`）在最上方新增一筆紀錄，並更新「下一步」。

## 下一步

- **☁️ 雲端可做：** T03 Collector v2 端點（或 T06 巡檢核心；兩張都只依賴 T00，互不相依）
- **🖥 等 George：** T01 ChatGPT 介面採樣、T02 Claude 介面採樣（各約 30 分鐘，依賴已滿足）。T04、T05 要等這兩張的樣本。

## 卡住／待決定

- Google Drive 上的「開發工單追蹤表」不會自動同步。本 repo 的 ROADMAP 是唯一進度來源；若要 `/wrap` 順便更新追蹤表，需在工作階段開啟 Google Sheets 連接器，並把這個步驟加進 `.claude/commands/wrap.md`。

## 工作紀錄

### 2026-10-15 · T00 Repo 骨架與開發環境
- 完成：v2 目錄結構、esbuild 建置（IIFE）、`make setup／build／test`；v1 程式碼移入 `extension/legacy/`；遮罩工具 `scripts/redact_fixture.py`；測試共 16 個全過（擴充 5、collector 2、遮罩工具 9）。
- 學到：manifest 路徑要以 `dist/` 為根（建置時複製進去），已修正 T00 工單描述，並用測試確保 manifest 引用的檔案都會產出。遮罩工具需要 `--extra-value`，因為像 Claude 組織清單裡的 `uuid` 無法從鍵名判斷是組織 ID。

### 2026-10-15 · 規劃
- 完成設計文件 v2（帳號層巡檢）。
- 建立路線圖、工單 T00–T08、開工／收工指令。
- 建立 Google Drive 開發工單追蹤表（2026-10-15_IdeaLedger_開發工單追蹤表_v1）。
- 學到：雲端工作階段無法登入 George 的平台帳號，因此 adapter 採「解析層用 fixtures 開發、取資料層由 George 本機驗收」的分工。
