# Mac Mini 部署（T11）

把 Idea Ledger 裝成每天自動運作：Chrome 擴充巡檢 → collector → summarizer 每 5 分鐘摘要 → 寫入 AiMemory `ledger/` 並推送。

collector 與 summarizer 都直接在 macOS 上跑（Python 虛擬環境＋launchd），**不用 Docker**：資料庫是 SQLite WAL 模式，Docker 容器與 macOS 主機同時讀寫同一個檔案時鎖不可靠，可能損毀資料庫。

約 30 分鐘。

## 放在哪裡

| 東西 | 位置 |
|---|---|
| 程式（IdeaLedgerAI） | 任何**不在 iCloud 同步**的地方，George 的 Mac Mini 用 `~/IdeaLedger/IdeaLedgerAI` |
| 資料庫、設定、記錄檔、Python 虛擬環境 | `~/Library/Application Support/IdeaLedger/`（`install.sh` 自動建立） |
| AiMemory clone | `~/Library/Application Support/IdeaLedger/AiMemory` |

> **不要**放在「文件」「桌面」或 iCloud Drive：對話全文只能留在這台電腦，不能被同步出去。`install.sh` 遇到這些路徑會拒絕安裝。

## 0. 先準備

- Python 3.12 以上：`python3 --version`；不夠新就 `brew install python@3.12`，之後的指令前面加 `PYTHON=/opt/homebrew/bin/python3.12`。
- Node 20 以上（建置擴充用）、git、Chrome。
- （選填）Ollama 與 LiteLLM Gateway：只有要做模型摘要時才需要。**目前預設不做摘要**，想法卡記「使用者輸入的文字」（T26），`LLM_MODEL` 留空即可。

## 1. 取得程式並建置擴充

```bash
mkdir -p ~/IdeaLedger && cd ~/IdeaLedger
git clone https://github.com/pcpcchen-coder/IdeaLedgerAI.git
cd IdeaLedgerAI
make setup
make build
```

## 2. 安裝本機服務

```bash
deploy/install.sh
```

第一次執行會：建立 `~/Library/Application Support/IdeaLedger/`、產生 `.env`（含隨機 token）、安裝 Python 套件、載入兩個 launchd 工作（collector 常駐、summarizer 每 5 分鐘）。

預設是**使用者輸入模式**（不做模型摘要），`.env` 不用改。T08 首測留下的 `collector_token.txt` 會被沿用為 token，擴充設定頁不必重填。

之後想改成模型摘要：打開 `.env`（`open -e "$HOME/Library/Application Support/IdeaLedger/.env"`），`LLM_MODEL=` 填 LiteLLM 上的模型名稱（有 key 再填 `LLM_API_KEY=`），再執行一次 `deploy/install.sh`（不會覆寫 `.env`，token 不變）。值含空白時要加雙引號。

> **從 T08 接續：** T08 首測的資料庫已在 `~/Library/Application Support/IdeaLedger/ledger.db`，安裝後直接沿用。安裝前先關掉首測用的 collector 終端機視窗（`start_collector.command`），否則 8787 埠被占用。

## 3. Clone AiMemory 並設定推送權限

```bash
git clone https://github.com/pcpcchen-coder/AiMemory.git "$HOME/Library/Application Support/IdeaLedger/AiMemory"
```

推送權限（擇一）：

- **建議：專用 token，只開 AiMemory。** GitHub → Settings → Developer settings → Fine-grained tokens → 新增：Repository access 只選 `AiMemory`，Permissions 的 Contents 設 Read and write。第一次推送時 git 會問帳號密碼：帳號填 GitHub 使用者名稱，密碼貼這個 token；macOS 鑰匙圈會記住。
- 或用 GitHub CLI：`brew install gh && gh auth login && gh auth setup-git`。

不需要設定 git 的 user.name：bot 的 commit 一律以 `Idea Ledger Bot` 署名。工具只會寫 `ledger/`，其他檔案有變動時會停下來、不提交。

## 4. Chrome 專用設定檔

1. Chrome 右上頭像 → 新增 → 命名「IdeaLedger」→ 在這個設定檔登入 chatgpt.com 與 claude.ai。
2. 開 `chrome://extensions` → 右上開「開發人員模式」→「載入未封裝項目」→ 選 `~/IdeaLedger/IdeaLedgerAI/extension/dist`。
3. 點擴充圖示開設定頁：token 填 `.env` 裡的 `IDEA_TOKEN`（`grep IDEA_TOKEN "$HOME/Library/Application Support/IdeaLedger/.env"`）→ 儲存 → 按「立即巡檢」。
4. `chrome://settings/performance` →「一律保持作用中的網站」加入 `chatgpt.com`、`claude.ai`，避免分頁被休眠。

## 5. 讓它一直開著

- **禁止睡眠：** 系統設定 → 能源 → 開啟「顯示器關閉時防止自動進入睡眠」；或終端機執行 `sudo pmset -a sleep 0 disksleep 0`。
- **開機自動登入並開 Chrome 專用設定檔：**
  1. 在 IdeaLedger 設定檔開 `chrome://version`，記下「設定檔路徑」最後一段（例如 `Profile 2`）。
  2. 系統設定 → 一般 → 登入項目 → 加入「Google Chrome」；並在 Chrome 設定 →「啟動時」選「繼續瀏覽上次開啟的網頁」，最後關閉時停在 IdeaLedger 設定檔的視窗。
  3. 想指定設定檔，可改用「自動操作」App 建一個應用程式，內容是 `open -na "Google Chrome" --args --profile-directory="Profile 2"`，再把它加到登入項目。

## 6. 檢查

```bash
deploy/doctor.sh
```

每一項都要是 ✅。常見問題：

| 訊息 | 處理 |
|---|---|
| collector 沒有回應 | 看 `~/Library/Application Support/IdeaLedger/logs/collector.log` |
| LiteLLM 連不上 | 只在設定 `LLM_MODEL` 時檢查：確認 LiteLLM 在跑、`.env` 的 `LLM_BASE_URL` 正確 |
| 無法推送到 AiMemory | 重做第 3 步的推送權限 |
| 還沒有 summarizer 記錄 | 剛安裝時正常，等 5 分鐘再執行一次 |

## 7. 驗收

在手機 App 對 ChatGPT、Claude 各聊一段，1 小時內 AiMemory 的 `ledger/conversations/` 出現對應的想法卡（擴充每 30 分鐘巡檢；對話要靜止 10 分鐘才會被讀、15 分鐘才會被摘要）。

## 日常維護

- **更新程式：** `cd ~/IdeaLedger/IdeaLedgerAI && git pull && make build && deploy/install.sh`，再到 `chrome://extensions` 按擴充的重新載入。
- **記錄檔：** `~/Library/Application Support/IdeaLedger/logs/`。
- **停用：** `deploy/uninstall.sh`（資料保留）。
