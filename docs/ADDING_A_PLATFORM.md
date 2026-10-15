# 新增 AI 平台

Idea Ledger 的平台是開放的。ChatGPT、Claude 只是內建的前兩個，Gemini、Grok 或任何網頁版 AI 都能自行加入，**不需要修改任何核心程式**。

有兩種方式：

| | 方式一：寫 adapter | 方式二：設定頁新增（免程式） |
|---|---|---|
| 適合 | 想完整收集，包含手機 App 的對話 | 想先快速收集，或平台介面還沒摸清楚 |
| 收集範圍 | 帳號歷史全部（網頁、桌面 App、手機 App） | 只有在這個瀏覽器打開過的對話 |
| 資料形式 | 結構化訊息（角色、時間、分支） | 頁面純文字 |
| 需要 | 會寫 JavaScript，約 2–3 小時 | 填三個欄位，約 2 分鐘 |
| 狀態 | 可用 | 規劃中（工單 T18） |

方式二可以先用，之後再升級成方式一。

---

## 方式一：寫一個 adapter

以 Gemini 為例。

### 1. 建立資料夾與平台描述

```
extension/src/adapters/gemini/
  platform.json   平台描述
  index.js        進入點（照抄下方範本）
  parse.js        解析層：原始回應 → 統一格式（純函式）
  fetch.js        取資料層：在平台分頁內以同源 GET 讀取
```

`platform.json`：

```json
{
  "id": "gemini",
  "name": "Gemini",
  "hosts": ["gemini.google.com"]
}
```

- `id`：小寫英數與連字號，2–32 字，**必須與資料夾名稱相同**。會出現在想法卡檔名與資料庫中，定了就不要改。
- `name`：顯示名稱，用在設定頁與每日日誌。
- `hosts`：平台網域，不含 `https://` 與路徑。一個網域只能屬於一個平台。

`index.js`（每個平台都一樣）：

```js
import descriptor from "./platform.json" with { type: "json" };

export { descriptor };
export { checkLogin, listUpdated, getConversation } from "./fetch.js";
```

建置時會自動掃描這個資料夾：註冊表、manifest 的網域權限、content script 注入都會自動加上。**不需要改 manifest、`adapters/index.js` 或 collector。**

### 2. 採樣

照工單 T01 的步驟，對新平台建立測試對話並在 DevTools 採樣，存到 `extension/fixtures/raw/gemini/`，遮罩後放到 `extension/fixtures/gemini/`，並寫 `NOTES.md`。詳見 `extension/fixtures/README.md`。

### 3. 實作固定介面

| 函式 | 回傳 |
|---|---|
| `checkLogin()` | `{ ok: true }` 或 `{ ok: false, reason }` |
| `listUpdated(cursor)` | `{ items: [{ id, title, updated_at, project }], next }`，依 `updated_at` 由新到舊 |
| `getConversation(id)` | 統一格式的對話（見 `src/lib/types.js`），最後要呼叫 `validateNormalized()` |

規則（與內建平台相同，寫在 `CLAUDE.md`）：

- 只用 GET，絕不對平台寫入。
- 解析與取資料分開；解析層用 fixtures 測試。
- 錯誤用 `src/lib/errors.js` 的類型：401 → `NeedsLogin`，403／429 → `RateLimited`，格式不符 → `AdapterFormatError`。巡檢核心靠這些類型決定燈號與退避。
- 節流、退避、水位線都由巡檢核心處理，adapter 不用管。

可以參考 `adapters/chatgpt/`、`adapters/claude/` 的寫法。

### 4. 測試與建置

```bash
make test    # 會自動檢查新平台的描述格式、固定介面是否齊全
make build   # 輸出會列出已註冊的平台
```

在 Chrome 重新載入 `extension/dist`，用專用設定檔登入新平台，設定頁按「立即巡檢」驗收。

### 暫時停用某個平台

把資料夾改名為底線開頭（例如 `_gemini`），重新建置即可。

---

## 方式二：設定頁新增（規劃中，T18）

在擴充設定頁「新增平台」填入：

- 顯示名稱（例如 Grok）
- 網域（例如 `grok.com`）
- 對話網址規則（例如 `/c/([\w-]+)`，用來取得對話 ID）

儲存時 Chrome 會詢問是否允許存取該網域。之後只要在這個瀏覽器打開該平台的對話，停止變動 20 秒後就會擷取頁面文字送給 collector，由本地模型照常摘要成想法卡。

限制：讀不到帳號歷史，所以手機 App 上的對話要在電腦上打開一次才會被收集。需要完整收集時，再照方式一寫 adapter，同一個平台 id 可以直接沿用。
