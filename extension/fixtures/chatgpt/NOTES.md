# ChatGPT 採樣筆記（T01）

採樣日期：2026-10-15。採樣方式：在 Claude 桌面 App 內建瀏覽器（已登入 George 的 ChatGPT）執行 `tools/sampler` 的同一套邏輯，只發 GET。請求清單與狀態碼見 `REQUESTS.md`。

| 檔案 | 測試對話 |
|---|---|
| `conversation_simple.json` | A 一般對話，3 輪 |
| `conversation_branched.json` | B 第 2 則回覆「再試一次」一次，再編輯第 2 則使用者訊息重送 |
| `conversation_project.json` | C 專案（9G數位化專案）內，2 輪 |
| （無） | D 手機 App 對話：不另採，見問題 3 |

## 1. 歷史清單：路徑、分頁、排序時間欄位

- `GET /backend-api/conversations?offset={n}&limit=28&order=updated`
- 回應：`{ items: [...], total, limit, offset }`。
- 分頁：`offset`／`limit`。兩頁無重疊，依 `update_time` 由新到舊排列。
- **`total` 不是總數**：第 1 頁回 `29`、第 2 頁回 `57`，等於「目前已看到的數量 + 1」，只能當「還有下一頁」的指標。判斷結束要看 `items.length < limit`。
- 清單項目欄位：`id`、`title`、`create_time`、`update_time`、`gizmo_id`、`conversation_template_id`、`is_archived`、`is_temporary_chat`、`is_do_not_remember`、`snippet`（目前為 null）、`mapping`（清單中為 null）、`current_node`（清單中為 null）。
- 水位線用 `update_time`。

## 2. 專案內的對話是否在主清單

**有。** C 出現在主清單第 1 頁，與一般對話混排。專案對話的 `gizmo_id`／`conversation_template_id` 為 `g-p-<32 位十六進位>`，一般對話為 `null`。清單不含專案名稱；需要時另查（本次未採）。單篇回應同樣帶 `gizmo_id`。

## 3. 手機 App 對話 D 是否出現在網頁歷史

**會出現（George 確認，2026-10-15）。** 手機 App 的對話一定會同步到帳號，網頁歷史清單看得到，不另採樣。

## 4. 需要的 header 與來源

- 先 `GET /api/auth/session`（同源、帶 cookie）取得 `accessToken`（本檔只保留結構，值已移除）。
- 之後的 `/backend-api/*` 請求帶 `Authorization: Bearer <accessToken>`。
- `session.json` 頂層鍵：`WARNING_BANNER`、`accessToken`、`account`、`user`、`authProvider`、`expires`、`sessionToken`、`statsigContext`、`marketingEligibility`。未登入時只有 `WARNING_BANNER`，沒有 `accessToken`，可用來實作 `checkLogin()`。

## 5. 時間欄位格式

**兩種格式並存，adapter 必須都處理：**
- 清單：ISO 字串，6 位小數，`Z` 結尾（`"2026-10-15T03:06:43.890008Z"`）。
- 單篇對話與訊息：epoch **秒**，浮點數（`create_time: 1792033376.938742`）。

## 單篇對話結構（給 T04）

- `GET /backend-api/conversation/{id}`，`{id}` 是 UUID 格式（`6ad0425f-e738-83ec-967f-4dc358431e89`）。
- 頂層：`conversation_id`、`title`、`create_time`、`update_time`、`current_node`、`mapping`、`gizmo_id`、`default_model_slug`、`is_archived`、`is_temporary_chat`、`memory_scope`…
- `mapping` 是 `{ 節點id: { id, message, parent, children } }` 的樹。根節點 id 為 `client-created-root`，`message` 為 null。
- **目前分支**：從 `current_node` 沿 `parent` 往回走到根，再反轉。
- **分支表示**：同一父節點有多個 `children`。
  - 編輯使用者訊息 → 該使用者訊息的父節點（上一則助理回覆）多一個子節點（B：`4fb51e2f` 有兩個子節點）。
  - 再試一次 → 使用者訊息底下多一個 `reasoning_recap` 子節點（B：`fb3a2c52` 有兩個子節點）。
- 訊息：`message.author.role`（`user`／`assistant`）、`message.content.content_type`、`message.content.parts`（字串陣列）、`message.create_time`。
- **要略過的節點**：`content_type: "reasoning_recap"`（例如「思考兩秒鐘」，屬於 assistant），它夾在使用者訊息與真正回覆之間，parent 鏈會經過它。`metadata.is_visually_hidden_from_conversation` 本次樣本皆未出現，T04 仍應略過為 true 的節點。
- `safe_urls` 含使用者其他對話的網址，與本對話無關，fixture 中已換成 `ID_n` 佔位；adapter 不要使用這個欄位。

## 節流觀察

- 第一次採樣以 1.5 秒間隔連發 session → 清單第 1 頁 → 清單第 2 頁，**第 2 頁回 429**。間隔 5 秒後重送成功。擴充的 ≥3 秒間隔與 429 退避是必要的，不能放寬。

## 專案名稱（T24）

採樣日期：2026-10-15，在 Claude 桌面 App 內建瀏覽器以 George 帳號採樣。測試專案「IdeaLedger 測試專案」（`g-p-6ad07a98e7b881919efa7d794aa41eb9`），內有測試對話 F。

- **請求**：`GET /backend-api/gizmos/snorlax/sidebar?conversations_per_gizmo=0&limit=20&owned_only=false`，第二頁起加 `&cursor=<上一頁的 cursor>`。網頁自己載入側欄也呼叫這個端點（`conversations_per_gizmo=5` 會順帶每個專案最近 5 篇對話；我們用 0 只取專案）。
- **header**：`Authorization: Bearer <accessToken>`（同清單）。網頁另帶 `chatgpt-account-id`、`oai-did`、`oai-language`，實測不帶也是 200。
- **回應**：`{ items: [...], cursor: string|null }`。`items[].gizmo.gizmo.id` 是專案 ID（`g-p-…`），`items[].gizmo.gizmo.display.name` 是專案名稱；`items[].conversations` 在 `conversations_per_gizmo=0` 時為 `{ items: [], cursor: null }`。
- **分頁**：每頁最多 20 個專案；`cursor` 為 null 表示最後一頁。George 帳號 37 個專案，兩頁列完（`projects_page1.json` 20 個、`projects_page2.json` 17 個）。依最近使用排序，新建的測試專案在第 1 頁第 1 個。
- **限流**：同一時間 `/backend-api/conversations` 被限流（429）時，這個端點仍正常 200。
- **遮罩**：測試專案以外的名稱、描述換成「（其他專案，已遮蔽）」；作者、權限、分享、指令等欄位換成 `[REDACTED]`；`cursor` 換成 `[CURSOR]`。
