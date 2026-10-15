# T00 Repo 骨架與開發環境

| 狀態 | 執行 | 預估 | 依賴 |
|---|---|---|---|
| ⬜ 待辦 | ☁️ 雲端 | 60 分 | — |

## 目標

建立 v2 的目錄結構、建置與測試流程，之後每張工單都能 `make test` 驗證。v1 程式碼移入 legacy，不刪除。

## 開工前讀

- `CLAUDE.md`
- `docs/plan/ROADMAP.md` 的「技術選擇」

## 目標結構

```
extension/
  package.json            # scripts: build, test
  build.mjs               # esbuild：src/bg/index.js、src/content/sweeper.js、src/options/options.js → dist/
  manifest.json           # v2 版（見下）
  src/
    bg/index.js           # stub：只註冊 onInstalled
    content/sweeper.js    # stub：RPC 路由骨架
    adapters/index.js     # 依 hostname 回傳 adapter
    adapters/chatgpt/     # parse.js、fetch.js（stub）
    adapters/claude/      # parse.js、fetch.js（stub）
    lib/types.js          # NormalizedConversation 的 JSDoc 型別與 validateNormalized()
    options/              # options.html、options.js（stub）
  test/smoke.test.js
  fixtures/README.md      # 採樣與遮罩規則
  fixtures/chatgpt/ fixtures/claude/   # 放 .gitkeep
  legacy/                 # 搬入 v1 的 capture.js、bg.js、manifest.json
collector/
  app/main.py             # 搬入 v1 collector.py，改成套件結構
  tests/test_smoke.py
  requirements.txt        # fastapi、uvicorn、pydantic、pytest、httpx
scripts/
  redact_fixture.py       # 遮罩工具（見下）
  tests/test_redact.py
Makefile                  # make test = 擴充測試 + collector 測試 + redact 測試；make build
```

## v2 manifest 要點

- `permissions`: `storage`、`alarms`、`tabs`
- `host_permissions`: `https://chatgpt.com/*`、`https://claude.ai/*`、`https://www.kimi.com/*`、`http://127.0.0.1:8787/*`
- `content_scripts`: 上述三個平台網域都注入 `dist/content.js`
- `background.service_worker`: `dist/bg.js`
- `options_page`: `dist/options.html`

## 遮罩工具 `scripts/redact_fixture.py`

用法：`python scripts/redact_fixture.py <輸入資料夾> <輸出資料夾>`

- 遞迴處理 JSON，鍵名命中以下規則就把值換成固定佔位字串：含 `token`、`email`、`phone`、`cookie`、`authorization`、`session` 的鍵。
- 使用者 ID、組織 ID 等識別碼：同一個值在所有檔案中替換成同一個佔位（例如 `ORG_1`），保留關聯性。
- 輸出前掃描整個結果，若仍出現 `@` 形式的 email 或疑似 JWT（三段 base64 以 `.` 相連），中止並列出位置。
- `.gitignore` 加入 `extension/fixtures/raw/`，原始檔永遠不進 repo。

## 驗收

- [ ] `make build` 產出 `extension/dist/`，含 manifest 引用的所有檔案
- [ ] `make test` 全過（至少各 1 個 smoke 測試；redact 測試涵蓋 token、email、ID 一致替換、JWT 偵測中止）
- [ ] v1 程式碼完整移入 `extension/legacy/`
- [ ] `extension/fixtures/README.md` 寫明：用測試對話採樣、原始檔放 `raw/`、遮罩後才提交

## 不做

- 任何 adapter 邏輯、巡檢邏輯
- Docker、部署

## 收工時

更新 ROADMAP 狀態、PROGRESS 紀錄；commit 訊息以 `T00:` 開頭。
