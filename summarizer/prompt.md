# Summarizer

> **目前模式（2026-10-15，T26）：使用者輸入。** 沒設定 `LLM_MODEL` 時不經模型，想法卡內容是對話中使用者輸入的文字（依序條列，單則 1000 字、全部 6000 字上限）。設定 `LLM_MODEL` 才走下方的模型摘要。

把 collector 收到的對話，經 LiteLLM Gateway 用本地模型摘要成想法卡資料，存進 SQLite 的 `summary` 表。由 launchd 每 5 分鐘執行一次（部署見 T11）。

```bash
IDEA_DB=/path/to/ledger.db LLM_MODEL=<模型名稱> python -m summarizer
```

| 環境變數 | 說明 |
|---|---|
| `IDEA_DB` | 與 collector 相同的 SQLite 檔，預設 `./ledger.db` |
| `LLM_BASE_URL` | OpenAI 相容端點，預設 `http://127.0.0.1:4000/v1`（LiteLLM Gateway） |
| `LLM_MODEL` | 模型名稱；不設定則為使用者輸入模式 |
| `LLM_API_KEY` | 選填 |
| `SUMMARY_BATCH` | 每次最多處理幾段，預設 20 |
| `IDEA_MEMORY_REPO` | AiMemory 本機 clone 的根目錄：讀 `projects/*.md` 當專案清單，寫想法卡與日誌到 `ledger/` |
| `IDEA_TZ` | 日期使用的時區，預設 `Asia/Taipei` |

## 行為

- 只處理 `dirty=1` 且最後更新超過 15 分鐘的對話，由舊到新。
- 已摘要過的對話只送新增訊息加上前一版摘要（增量）；前段被編輯或切換分支時，collector 會讓它從頭重新摘要。
- 頁面擷取（`capture="page"`）的對話送頁面文字。
- 模型輸出不符格式時重試一次；同一版本連續失敗 3 次就暫停，對話更新後恢復。
- 可歸類的專案清單讀 AiMemory 的 `projects/*.md`（只讀）：代號＝檔名，名稱＝第一個 `# ` 標題；排除 `README.md`。在 AiMemory 新增專案檔即可，不需改程式。未設定 `IDEA_MEMORY_REPO` 時清單為空，全部歸 `other`。

## 提示詞

系統提示與輸入組裝在 `prompt.py`；輸出格式：

```json
{
  "title": "15 字內標題",
  "summary": "3 句內摘要",
  "ideas": [{"type": "新想法|延伸|待驗證", "idea": "...", "next_step": "..."}],
  "decisions": ["..."],
  "projects": ["專案代號（AiMemory projects/ 的檔名），模型填名稱也會轉成代號；都不符合填 other"]
}
```
