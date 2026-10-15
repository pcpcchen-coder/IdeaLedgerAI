# Claude 採樣筆記（T02）

採樣日期：2026-10-15。採樣方式：在 Claude 桌面 App 內建瀏覽器（已登入 George 的 claude.ai）執行 `tools/sampler` 的同一套邏輯，只發 GET，請求間隔 3 秒。請求清單與狀態碼見 `REQUESTS.md`。

| 檔案 | 測試對話 |
|---|---|
| `conversation_simple.json` | A 一般對話，3 輪 |
| `conversation_branched.json` | B 對第 2 則回覆「重試」一次，再編輯第 2 則使用者訊息重送 |
| `conversation_project.json` | C 專案（跨AI平台記憶管理專案）內，2 輪 |
| `conversation_attachment.json` | E 上傳文字檔 `idealedger_test_E.txt` 後提問 |
| （無） | D 手機 App 對話：不另採，見問題 3 |

遮罩：組織 ID 換成 `ORG_1`／`ORG_2`；非測試對話的標題、摘要、專案名稱換成「（其他對話，已遮蔽）」；各對話 `settings.enabled_mcp_tools`（使用者連接的工具清單）只保留數量；非測試對話的 `settings` 改為 `"<omitted>"`；組織的 `settings` 只保留結構。

## 1. 對話清單：路徑、分頁、排序時間欄位

- `GET /api/organizations/{org}/chat_conversations?limit=30&offset={n}`
- 回應是**陣列**（沒有外層物件、沒有 total）。分頁用 `offset`／`limit`，`length < limit` 表示最後一頁。
- 兩頁無重疊，依 `updated_at` 由新到舊排列。水位線用 `updated_at`。
- 清單項目欄位：`uuid`、`name`、`summary`、`model`、`created_at`、`updated_at`、`project_uuid`、`project`（`{uuid, name}` 或 null）、`current_leaf_message_uuid`、`is_starred`、`is_archived`、`is_temporary`、`platform`（例：`CLAUDE_AI`）、`settings`。較舊的對話少了部分欄位（例如 `live_status`、`user_uuid`），adapter 只依上列欄位。
- 只帶 cookie（`credentials: include`）即可，不需要額外 header。

## 2. 專案內的對話是否在同一清單

**是。** C 出現在清單第 1 頁，`project_uuid` 與 `project.uuid` 為專案 ID，`project.name` 為專案名稱（fixture 中非測試對話的已遮蔽，C 的未遮蔽）。單篇回應有 `project_uuid`，沒有 `project` 物件。

## 3. 手機 App 對話 D 是否出現

**會出現（George 確認，2026-10-15）。** 手機 App 的對話一定會同步到帳號，網頁歷史清單看得到，不另採樣。清單項目的 `platform` 欄位在手機建立的對話可能不是 `CLAUDE_AI`，adapter 不要依此欄位過濾。

## 4. 分支表示與目前分支

- `GET /api/organizations/{org}/chat_conversations/{id}?tree=True&rendering_mode=messages&render_all_tools=true`
- `chat_messages` 是**平鋪陣列**，含所有分支；每則有 `uuid`、`parent_message_uuid`、`index`、`sender`（`human`／`assistant`）、`content`、`text`、`created_at`、`updated_at`、`attachments`、`files`。
- 根訊息的 `parent_message_uuid` 為 `00000000-0000-4000-8000-000000000000`。
- **目前分支**：從頂層 `current_leaf_message_uuid` 沿 `parent_message_uuid` 往回走到根，再反轉。不能只依 `index` 排序（B 中 index 3、4 是兩次回覆，5 是編輯後的訊息，屬於不同分支）。
- 重試 → 同一則 human 訊息下多一則 assistant（B：`d1e4cb28`、`568835a3` 的 parent 相同）。
- 編輯 → 同一則 assistant 下多一則 human（B：`1c891dc7`、`01cf1c0d` 的 parent 都是 `46d7886c`）。
- 訊息文字：`content` 為陣列，取 `type: "text"` 的 `text` 串接（`thinking` 區塊略過）。頂層 `text` 欄位在本次樣本中**全是空字串**（T05 確認），只能以 `content` 為準。

## 5. 附件長什麼樣

- 文字檔在 human 訊息的 `attachments[]`：`{ id, file_name, file_size, file_type, extracted_content, created_at }`。
- **`extracted_content` 是檔案全文。** adapter 只取 `file_name`（必要時 `file_type`），不要把 `extracted_content` 送進 collector，以免把附件全文帶入摘要。
- `files` 本次為空陣列；圖片附件應會出現在 `files`，本次未採（工單允許圖片或文字檔擇一）。

## 6. 多個組織時用哪一個

- `GET /api/organizations` 回 2 個組織：`ORG_1` 的 `capabilities` 含 `chat`（另有 `claude_pro`），`ORG_2` 是 API 組織（`api`、`api_individual`）。
- 取 `capabilities` 含 `"chat"` 的那一個。沒有的話視為未登入或無法使用聊天。
- 未登入時 `/api/organizations` 回 403，頁面會導向 `/login`，可用來實作 `checkLogin()`。

## 時間格式

全部是 ISO 字串，6 位小數，`Z` 結尾（`"2026-10-15T02:58:44.728797Z"`）。

## 專案名稱（T08 補充）

- 單篇回應只有 `project_uuid`。專案名稱用 `GET /api/organizations/{org}/projects/{project_uuid}` 取 `name`（2026-10-15 在 George 帳號驗證 200）。
- 另有 `GET /api/organizations/{org}/projects?limit=…` 回陣列（`uuid`、`name`…），可一次取全部；adapter 目前用單一專案端點並在分頁內快取。
- 查不到（404 等）時退回 `project_uuid`；限流與未登入照常拋出。
