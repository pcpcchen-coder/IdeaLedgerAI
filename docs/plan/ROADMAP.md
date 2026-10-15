# 開發路線圖

依據：[設計文件 v2](../2026-10-15_IdeaLedger_帳號層巡檢設計文件_v2.html)。進度記錄在 [PROGRESS.md](PROGRESS.md)。

## 推進規則

- **一次工作階段 = 一張工單。** 每張設計成 30–90 分鐘可做完，做不完就拆票並在 PROGRESS 記錄。
- **開工打 `/next`，收工打 `/wrap`。** 指令定義在 `.claude/commands/`。
- **執行者分兩種：**
  - ☁️ **雲端**：雲端 Claude 工作階段可獨立完成（寫程式、跑測試）。
  - 🖥 **本機**：需要 George 在自己電腦上動手（登入平台、DevTools 採樣、實機驗收）。工單會寫成逐步清單，約 15–30 分鐘。
- **依賴未完成的工單不開工。** 若下一張是 🖥 而 George 沒空，可跳到不依賴它的 ☁️ 工單。
- **Phase 2 以後的工單只有摘要**，開工那次工作階段的第一件事是先把它展開成完整工單檔（參照 T00–T08 的格式），因為細節取決於前面學到的東西。

## 技術選擇（T00 落實）

| 項目 | 選擇 | 理由 |
|---|---|---|
| 擴充語言 | JavaScript（ES modules）+ JSDoc 型別註解 | 不引入 TypeScript 編譯鏈，維持輕量 |
| 打包 | esbuild | MV3 content script 不能直接用 ES modules，需要打包；esbuild 零設定 |
| 擴充測試 | `node:test` | Node 內建，不需額外框架 |
| Collector | Python 3.12 + FastAPI + SQLite | 沿用既有技術棧 |
| Collector 測試 | pytest + FastAPI TestClient | 標準做法 |

**可測試性原則：** adapter 拆成「取資料」與「解析」兩層。解析層是純函式，用 `fixtures/` 裡的真實回應樣本測試；雲端工作階段不需要登入任何平台也能開發。

## 工單總表

| ID | 工單 | 執行 | 預估 | 依賴 | 狀態 |
|---|---|---|---|---|---|
| **Phase 0 地基** |||||
| [T00](tickets/T00_repo骨架與開發環境.md) | Repo 骨架與開發環境 | ☁️ | 60 分 | — | ✅ |
| [T01](tickets/T01_ChatGPT介面採樣.md) | ChatGPT 介面採樣 | 🖥 | 30 分 | T00 | ⬜ |
| [T02](tickets/T02_Claude介面採樣.md) | Claude 介面採樣 | 🖥 | 30 分 | T00 | ⬜ |
| **Phase 1 收得到（M1）** |||||
| [T03](tickets/T03_Collector_v2端點.md) | Collector v2 端點 | ☁️ | 60 分 | T00 | ⬜ |
| [T04](tickets/T04_ChatGPT解析層.md) | ChatGPT 解析層 | ☁️ | 60 分 | T01 | ⬜ |
| [T05](tickets/T05_Claude解析層.md) | Claude 解析層 | ☁️ | 45 分 | T02 | ⬜ |
| [T06](tickets/T06_巡檢核心.md) | 巡檢核心（排程、分頁、節流、水位線） | ☁️ | 90 分 | T00 | ⬜ |
| [T07](tickets/T07_取資料層與設定頁.md) | 取資料層與設定頁 | ☁️ | 60 分 | T04, T05, T06 | ⬜ |
| [T08](tickets/T08_M1本機首測.md) | M1 本機首測 | 🖥 | 30 分 | T03, T07 | ⬜ |
| **Phase 2 有想法卡（M2）** |||||
| T09 | Summarizer worker | ☁️ | 90 分 | T03 | ⬜ |
| T10 | Obsidian 寫入與每日日誌 | ☁️ | 60 分 | T09 | ⬜ |
| T11 | Mac Mini 部署 | ☁️ + 🖥 | 60 分 | T08, T10 | ⬜ |
| **Phase 3 Kimi（M3）** |||||
| T12 | Kimi 探查 | 🖥 | 30 分 | T08 | ⬜ |
| T13 | Kimi adapter | ☁️ | 60 分 | T12 | ⬜ |
| **Phase 4 無人看管（M4）** |||||
| T14 | 健康監控 | ☁️ | 60 分 | T11 | ⬜ |
| T15 | 首次回填與官方匯出匯入 | ☁️ | 60 分 | T11 | ⬜ |
| T16 | 排除規則 UI（`#nolog`、專案黑名單） | ☁️ | 45 分 | T07 | ⬜ |
| T17 | 一週無人看管驗收 | 🖥 | 每天 5 分 × 7 | T14, T15, T16 | ⬜ |

狀態符號：⬜ 待辦 · 🟡 進行中 · ✅ 完成 · ⛔ 卡住

## Phase 2–4 工單摘要（開工時展開）

**T09 Summarizer worker** — 取 `dirty=1` 且最後更新超過 15 分鐘的對話，經 LiteLLM（OpenAI 相容介面）呼叫本地模型，產出設計文件 v2 規格的 JSON；只送 `summarized_count` 之後的新訊息加上前一版摘要。JSON 解析失敗重試一次。驗收：用假 LLM 回應的 pytest 全過。

**T10 Obsidian 寫入與每日日誌** — 依摘要結果寫想法卡（同一對話覆寫同檔）、更新 `Ideas/_log/YYYY-MM-DD.md`（依對話實際更新時間歸日，第一行為各平台巡檢狀態）。驗收：給定 SQLite 狀態，產出的 Markdown 與預期快照一致。

**T11 Mac Mini 部署** — ☁️ 寫 `docker-compose.yml`、`.env.example`、summarizer 的 launchd plist、部署步驟；🖥 George 照步驟部署。驗收：手機 App 聊一段，1 小時內出現想法卡。

**T12 Kimi 探查** — 🖥 確認 Kimi App 的對話是否出現在網頁歷史；在 DevTools 採樣歷史清單與單篇對話的回應。產出：fixtures 與一頁探查筆記。若沒有可用介面，記錄改走頁面文字退路。

**T13 Kimi adapter** — 依 T12 結果實作解析層與取資料層，或實作頁面文字退路。

**T14 健康監控** — 擴充圖示紅黃綠燈、`sweep_run` 寫入、每日日誌狀態行、任一平台連續 24 小時失敗時通知（collector 在 Docker 內，通知需由主機端的 launchd 腳本發出）。

**T15 首次回填與官方匯出匯入** — 驗證回填節流；寫 ChatGPT、Claude 官方匯出檔的匯入腳本，匯入後設定水位線。

**T16 排除規則 UI** — 設定頁可編輯專案黑名單；確認 `#nolog` 在 collector 端丟棄、不落地。

**T17 一週無人看管驗收** — 🖥 連續 7 天每天看一眼日誌狀態行；記錄任何中斷與原因。全綠即 v1.0 完成。
