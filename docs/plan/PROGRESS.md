# 進度

每次收工（`/wrap`）在最上方新增一筆紀錄，並更新「下一步」。

## 下一步

- **🖥 等 George（關鍵路徑）：** T08 M1 本機首測（約 30 分鐘，依賴 T03 ✅、T07 ✅）：`make build` 後在 Chrome 載入 `extension/dist/`、啟動 collector、在設定頁填 token 後按「立即巡檢」。
- **🖥 等 George：** T24 ChatGPT 專案名稱採樣（約 15 分鐘）；完成後雲端做 T25。
- **🖥 等 George：** T19 免程式平台實測（約 20 分鐘，依賴 T18 ✅）：在設定頁新增 Gemini 或 Grok，聊一段後確認 collector 收到 `capture="page"` 的資料。
- **☁️ 雲端可做：** 依賴都已滿足的 ☁️ 工單已做完（T14、T15 等 T11；T11 等 T08；T13 等 T12；T25 等 T24）。可預做 T11 的雲端部分（docker-compose、launchd、部署步驟）。

## 卡住／待決定

- **ChatGPT 清單端點 429（T08）**：George 帳號的 `/backend-api/conversations` 暫時被限流，連 ChatGPT 網頁自己的側欄請求也 429；單篇正常。等退避後自動重試。若長期如此，再評估降低清單請求頻率（例如每輪只讀第 1 頁）。
- **Claude 回填時的專案名稱（T07）。** 單篇回應只有 `project_uuid`，名稱來自清單；回填佇列跨輪保存時只記 id，所以回填中、且本輪沒列過清單的對話，想法卡上的平台專案會是 UUID。一般模式不受影響。要補的話需確認是否有取得 Claude 專案名稱的端點（需採樣）。
- **舊 `projects.txt` 的專案在 AiMemory `projects/` 沒有對應檔（T21）。** 換電站EMS、微電網、電池、數位人類、AI OS、InMoov、Amazing Hand、可信任的控制、本地LLM/CoPartner、Idea Ledger 這些分類現在只剩 AiMemory 的 8 個專案可選，其餘會歸 `other`。若要保留這些分類，需由 George 在 AiMemory `projects/` 新增檔案（工具不改 AiMemory 的人工維護區）。
- Google Drive 上的「開發工單追蹤表」不會自動同步。本 repo 的 ROADMAP 是唯一進度來源；若要 `/wrap` 順便更新追蹤表，需在工作階段開啟 Google Sheets 連接器，並把這個步驟加進 `.claude/commands/wrap.md`。

## 工作紀錄

### 2026-10-15 · T08 M1 本機首測（🟡 進行中）
- 完成：在 George 的 Mac（現用 Chrome 設定檔）裝好擴充與 collector；Claude 端到端打通（292 篇列出、首輪讀 30 篇寫入）。修正隨機延遲鎖住「立即巡檢」的問題。
- 決定（George）：首次回填改為由新到舊；已存下的舊佇列也依新到舊取。
- 學到：collector 資料庫（對話全文）不能放在 iCloud 同步的資料夾（例如 macOS 的「文件」），T11 部署要放 `~/Library/Application Support/IdeaLedger/` 之類的本機位置；MV3 背景程式不能用長 setTimeout 等待；ChatGPT 清單端點有帳號層限流，被限流時連網頁本身的側欄也拿不到，單篇端點不受影響。
- 剩餘：Claude 回填完成後驗 A–C、E 與分支；ChatGPT 429。

### 2026-10-15 · T18 設定頁免程式新增平台
- 完成：設定頁填名稱、網域、對話網址規則即可新增平台（要網域權限、動態注入通用擷取腳本、存設定），可刪除；頁面靜止 20 秒擷取純文字送 collector（`capture="page"`），連不上時排隊補送。擴充測試 92 個全過，Playwright 實測設定頁新增／刪除。`docs/ADDING_A_PLATFORM.md` 方式二改為可用。
- 學到：
  - `chrome.permissions.request` 必須留在使用者點擊之內，所以輸入檢查改為同步、用設定頁已載入的清單，第一個 await 就是要權限。
  - 頁面擷取的 `created_at` 若用擷取時間，想法卡檔名每次都會變；改存第一次擷取時間。
  - 擷取腳本不信任自己回報的平台，背景程式一律以分頁網域找平台。
- 剩餘：實機驗證（T19）。`#nolog` 在擷取端直接不送，所以「已收過的頁面擷取對話事後加上 #nolog」不會觸發 collector 刪除；需要時可改為送出由 collector 判斷。

### 2026-10-15 · T16 排除規則 UI
- 完成：專案黑名單（設定頁多行文字框；巡檢時不讀單篇、不送 collector；略過數顯示在設定頁）。`#nolog` 確認由 collector 既有測試涵蓋。擴充測試 81 個全過，並以 Playwright 實測設定頁。
- 學到：黑名單項目若在規劃階段直接濾掉，水位線可能停在它們之前，或越過還沒處理的對話；改為保留在計畫中、處理時跳過請求，水位線順序才正確。ChatGPT 在 T25 之前只能以 `g-p-` ID 列入黑名單。
- 剩餘：黑名單不追溯已收進 collector 的對話（工單「不做」）。

### 2026-10-15 · T07 取資料層與設定頁
- 完成：ChatGPT、Claude 的 `fetch.js`（同源 GET、權杖／組織 ID 快取、401 重取一次、錯誤類型對應），共用的 `lib/http.js`；設定頁、各平台燈號、圖示徽章、巡檢總開關。擴充測試 77 個全過；以 Playwright＋Chromium 實際載入 `dist/` 開設定頁並儲存。
- 學到：
  - Claude 的 `/api/organizations` 未登入時回 403，與「403 = 限流」的通則相反，所以 `http.js` 允許個別端點覆寫狀態碼解讀。
  - 同一個 RPC 操作內可能有兩次請求（取權杖＋清單、401 重取），巡檢核心的節流管不到，所以 `http.js` 在分頁內再保證一次 ≥3 秒。
  - 數字輸入框的 `min` 會讓瀏覽器靜默擋下送出（實測發現），改用 `novalidate` 由程式修正範圍。

### 2026-10-15 · 規劃：ChatGPT 專案名稱（T24、T25）
- 決定（George）：想法卡要顯示 ChatGPT 的專案名稱，不是 `g-p-` ID。
- 新增 T24（🖥 採樣取得專案名稱的請求）與 T25（☁️ adapter 內快取名稱表並替換）；原「卡住／待決定」中的這一項改由這兩張工單處理。T07 先照常以 ID 運作，T25 只改 `adapters/chatgpt/`。

### 2026-10-15 · T05 Claude 解析層
- 完成：`extension/src/adapters/claude/parse.js`（組織、清單、單篇），以 T02 fixtures 測試 10 個；擴充測試共 63 個全過。
- 學到：Claude 的 `chat_messages` 平鋪所有分支，`index` 只是建立順序（重試的兩則回覆是 index 3、4，編輯後的訊息是 5），必須從 `current_leaf_message_uuid` 回溯。頂層 `text` 欄位全是空字串，文字只在 `content`。清單回應沒有分頁資訊，`parseList` 需要呼叫端傳入這次的 `offset`／`limit`。

### 2026-10-15 · T04 ChatGPT 解析層
- 完成：`extension/src/adapters/chatgpt/parse.js`（session、清單、單篇），以 T01 fixtures 測試 9 個；擴充測試全過。
- 學到：「再試一次」產生的是使用者訊息底下的兄弟 `reasoning_recap` 節點，「編輯」產生的是上一則助理回覆底下的兄弟使用者節點；兩者都只要從 `current_node` 回溯即可正確取得目前分支。清單第 1 頁 28 筆中有 14 筆是專案對話，與一般對話混排。

### 2026-10-15 · T22 衍生索引
- 完成：`ledger/platforms.md`、`ledger/monthly/YYYY-MM.md`、`ledger/ideas/index.md`、`ledger/ideas/by-project/<代號>.md`，每次寫入後重新產生、內容相同不寫；`status` 從想法卡檔案讀，封存的想法不進索引但保留在月彙總；過期的 by-project 檔會刪除。summarizer 測試 47 個全過。
- 學到：by-project 檔與 `projects/` 同名，Obsidian 的 `[[代號]]` 會連到自己，改用相對路徑連結。

### 2026-10-15 · T23 Git 發佈器
- 完成：`summarizer/publisher.py`，每輪 pull --rebase --autostash → 寫入 → 只 commit `ledger/`（作者 `Idea Ledger Bot`）→ push，被拒重新 pull 再推一次，仍失敗留到下一輪；`ledger/` 外有變動時寫入前、commit 前都會中止。以本機 bare repo 測 9 種情境，summarizer 測試 42 個全過；沒有推送到真正的 AiMemory。
- 學到：
  - git 預設把中文檔名加引號跳脫，路徑一律用 `-z` 解析（`-z` 要放在 `--` 之前，否則被當成路徑）。
  - 想法卡搬檔（bot）與使用者改 `status`（遠端）同時發生時，rebase 的改名偵測通常能自動合併；真正衝突的是使用者手改了系統覆寫區。衝突時丟棄未推出的 bot commit、讓相關想法卡從資料庫重寫，否則同一個衝突會每輪重複。
  - 部署機不一定有 git 的 user 設定，而 rebase、autostash 也會產生 commit，所以所有 git 指令都以 bot 身分執行。
- 設計：CLAUDE.md 慣例加上 `IDEA_GIT_PUBLISH` 與「測試不得推送到真正的 AiMemory」。

### 2026-10-15 · T21 專案清單改讀 AiMemory `projects/`
- 完成：專案代號＝`projects/*.md` 檔名、名稱＝第一個 `# ` 標題（排除 README、隱藏檔、保留字 `other`）；模型填代號或名稱都轉成代號，歸不到填 `other`；刪除 `projects.txt`。summarizer 測試 32 個全過，另以 AiMemory 實際 clone 唯讀驗證。
- 學到：模型容易照名稱回填，所以驗證時也接受名稱再轉成代號；代號是想法卡、日誌與之後 `ideas/by-project/` 共用的鍵。

### 2026-10-15 · T20 寫入路徑對齊 AiMemory `ledger/`
- 完成：想法卡寫到 `ledger/conversations/YYYY/MM/`、日誌寫到 `ledger/daily/YYYY/MM/`；`IDEA_VAULT` 改名 `IDEA_MEMORY_REPO`；所有寫入與刪除經 `ensure_in_ledger` 檢查。summarizer 測試 31 個全過（新增 10）。CLAUDE.md 慣例與設計文件第 7、8 節同步改為新路徑。
- 學到：`card` 表可能殘留 T10 時期的 `Ideas/` 路徑；改為「ledger/ 外的舊路徑視為沒有舊檔、不讀不刪」，避免搬檔時刪到 `ledger/` 以外。目前尚未部署，沒有實際舊資料需要遷移。

### 2026-10-15 · T01、T02 結案
- 決定（George）：手機 App 對話一定會同步到網頁歷史，D 不另測。T01、T02 改為 ✅，NOTES 第 3 題依此回答。

### 2026-10-15 · T01 ChatGPT 介面採樣、T02 Claude 介面採樣（🟡 缺手機對話 D）
- 完成：這次對話連結了 George 的電腦，在 Claude 桌面 App 內建瀏覽器（George 自行登入）建立測試對話 ChatGPT A–C、Claude A–C 與 E，以採樣腳本相同邏輯（只發 GET、瀏覽器內先遮蔽）取樣，經 `import_sample.py` 遮罩後提交 fixtures 與兩份 NOTES.md。所有請求最終皆 200，社群觀察的介面路徑正確。
- 學到：
  - ChatGPT 以 1.5 秒間隔連發三個請求，第三個就回 429；≥3 秒間隔與退避不能放寬。
  - ChatGPT 清單時間是 ISO 字串、單篇是 epoch 秒浮點數；清單 `total` 不是總數，只是「已看到 + 1」。
  - 兩個平台的專案對話都在主清單中，不需要另外巡專案清單。
  - 兩個平台都以「目前葉節點沿 parent 回溯」取得目前分支（ChatGPT `current_node`、Claude `current_leaf_message_uuid`）；ChatGPT 有 `reasoning_recap` 節點要略過。
  - Claude 附件的 `extracted_content` 是檔案全文，adapter 只取檔名。
  - 回應中有與對話無關的個人設定（ChatGPT `safe_urls`、Claude `enabled_mcp_tools`），已在 fixture 中遮蔽，adapter 也不應轉送。
- 剩餘：兩張工單的 D（手機 App 對話）與 NOTES 第 3 題。

### 2026-10-15 · 資料存放改為 AiMemory
- 決定（George）：本 repo 只做工具開發；資料寫到私人 repo `pcpcchen-coder/AiMemory`，當資料庫用。AiMemory 已有人工維護的個人記憶（profile、decisions、memory-pack、projects、inbox）。
- 完成：在 AiMemory 新增 `ledger/` 自動寫入區與路徑規格 `ledger/README.md`（想法卡、每日日誌、每月彙總、想法索引、平台總覽；與每月彙整的銜接；寫入與同步規則），README 目錄結構補上一行，其他檔案未動。本 repo 的 CLAUDE.md 加入 repo 分工與「只能寫 ledger/」約束；新增 T20–T23。
- 待決定：AiMemory 的 README 仍寫著「本 repo 目前為 public」，但實際已是 private，需由 George 決定是否更正（屬人工維護檔案，工具不改）。

### 2026-10-15 · T01、T02 輔助工具（T01、T02 本身仍待 George）
- 背景：George 請雲端工作階段直接操作本機完成採樣，但這個對話沒有連結到他的電腦，無法操作他的瀏覽器。
- 完成：主控台採樣腳本（`extension/tools/sampler/`，ChatGPT、Claude 各一份），只發 GET，下載前在瀏覽器內遮蔽非測試標題、token、email、JWT、組織 ID；匯入工具 `scripts/import_sample.py`（拆檔 → 遮罩 → `REQUESTS.md`）。新增 9 個測試。T01、T02 工單改以腳本為主要做法，手動 DevTools 降為補採用。
- 學到：清單回應會帶出所有對話的標題，原本的手動流程會讓真實標題進到原始檔；改在瀏覽器端先遮蔽。介面路徑仍未經驗證，腳本記錄每個請求的狀態碼，非 200 就退回手動補採。

### 2026-10-15 · T10 Obsidian 寫入與每日日誌
- 完成：想法卡（本地時區檔名、標題變更搬檔、保留使用者改的 status 與個人筆記）、每日平台互動日誌（巡檢狀態行、摘要中標示）；7 個 pytest 與一次端到端執行。
- 學到：判斷想法卡要不要重寫不能只看摘要時間，要加上對話版本；內容相同時不寫檔，避免同步軟體無謂變動。
- 現況：M2 的雲端部分（T09、T10）已完成，等 M1（需要 T01、T02 採樣）打通後即可在 Mac Mini 上串起整條流程。

### 2026-10-15 · T09 Summarizer worker
- 完成：`summarizer/` 套件（store、llm、prompt、worker、`python -m summarizer`），增量摘要、頁面文字、截斷、格式驗證與重試、失敗計數、與 collector 的競態防護；14 個 pytest 全過。
- 學到：摘要期間 collector 可能寫入新版本，清除 `dirty` 必須以讀取當下的 `updated_at` 為條件，否則會漏掉新內容。輸出品質要等接上真實模型（T11）才能評估。

### 2026-10-15 · T06 巡檢核心
- 完成：排程（單一執行、鬧鐘隨機延遲）、分頁管理（找現有 → 重新載入休眠分頁 → 開釘選分頁）、RPC 錯誤還原、節流、退避、水位線、回填佇列、collector 用戶端、設定；平台清單一律來自 `registeredPlatforms()`。擴充測試 39 個全過，並對真實 collector 做端到端驗證。
- 學到：各平台時間字串小數位數不一致，比較時間必須先轉數值。回填佇列不放還在聊的對話也不會漏：它們比佇列最新的還新，回填結束後一般模式會接手。

### 2026-10-15 · T03 Collector v2 端點
- 完成：`/v2/conversations`（冪等寫入、`#nolog` 排除、平台開放、`capture=api|page`）、`/v2/sweep-runs`、`/v2/health`、`/v2/watermark`；26 個 pytest 全過，並實際啟動 uvicorn 驗證。
- 學到：時間要存成固定寬度的 UTC 字串，才能直接用字串比較判斷新舊；同一時刻用 `+08:00` 與 `Z` 表示要視為相同。已摘要的前段若被編輯或切換分支，增量摘要會失準，所以 collector 偵測到前段改寫就把 `summarized_count` 歸零（T09 要依此從頭摘要）。

### 2026-10-15 · 平台開放架構（George 提出的需求，T00 追加）
- 需求：日後使用者要能自行加入 Gemini、Grok 等平台。
- 完成：平台改為資料夾自動註冊。`src/adapters/<id>/platform.json` 描述平台，`npm run gen` 掃描產生註冊表，建置時由 `manifest.base.json` 加上各平台網域產生 manifest；`validateNormalized` 改為只檢查平台 id 格式。新增 `docs/ADDING_A_PLATFORM.md`。擴充測試增為 11 個，包含「放一個 gemini、grok 資料夾就自動註冊並進 manifest」與描述錯誤（id 不符、網域重複、含 https）時建置失敗。
- 文件：CLAUDE.md 加「平台開放」約束；設計文件升為 v2.1（第 11 節）；T03 改為平台 id 不做 enum、新增 `platform_name` 與 `capture` 欄位；T06、T07 改為平台清單一律動態取得；新增 T18（設定頁免程式新增平台）、T19（實測）；T13 Kimi 的驗收加上「只新增資料夾、不改其他檔」。

### 2026-10-15 · T00 Repo 骨架與開發環境
- 完成：v2 目錄結構、esbuild 建置（IIFE）、`make setup／build／test`；v1 程式碼移入 `extension/legacy/`；遮罩工具 `scripts/redact_fixture.py`；測試共 16 個全過（擴充 5、collector 2、遮罩工具 9）。
- 學到：manifest 路徑要以 `dist/` 為根（建置時複製進去），已修正 T00 工單描述，並用測試確保 manifest 引用的檔案都會產出。遮罩工具需要 `--extra-value`，因為像 Claude 組織清單裡的 `uuid` 無法從鍵名判斷是組織 ID。

### 2026-10-15 · 規劃
- 完成設計文件 v2（帳號層巡檢）。
- 建立路線圖、工單 T00–T08、開工／收工指令。
- 建立 Google Drive 開發工單追蹤表（2026-10-15_IdeaLedger_開發工單追蹤表_v1）。
- 學到：雲端工作階段無法登入 George 的平台帳號，因此 adapter 採「解析層用 fixtures 開發、取資料層由 George 本機驗收」的分工。
