# Summarizer

把 collector 收到的對話，經 LiteLLM Gateway 用本地模型摘要成想法卡資料，存進 SQLite 的 `summary` 表。由 launchd 每 5 分鐘執行一次（部署見 T11）。

```bash
IDEA_DB=/path/to/ledger.db LLM_MODEL=<模型名稱> python -m summarizer
```

| 環境變數 | 說明 |
|---|---|
| `IDEA_DB` | 與 collector 相同的 SQLite 檔，預設 `./ledger.db` |
| `LLM_BASE_URL` | OpenAI 相容端點，預設 `http://127.0.0.1:4000/v1`（LiteLLM Gateway） |
| `LLM_MODEL` | 模型名稱，必填 |
| `LLM_API_KEY` | 選填 |
| `SUMMARY_BATCH` | 每次最多處理幾段，預設 20 |

## 行為

- 只處理 `dirty=1` 且最後更新超過 15 分鐘的對話，由舊到新。
- 已摘要過的對話只送新增訊息加上前一版摘要（增量）；前段被編輯或切換分支時，collector 會讓它從頭重新摘要。
- 頁面擷取（`capture="page"`）的對話送頁面文字。
- 模型輸出不符格式時重試一次；同一版本連續失敗 3 次就暫停，對話更新後恢復。
- 可歸類的專案清單在 `projects.txt`，改檔即可，不需改程式。

## 提示詞

系統提示與輸入組裝在 `prompt.py`；輸出格式：

```json
{
  "title": "15 字內標題",
  "summary": "3 句內摘要",
  "ideas": [{"type": "新想法|延伸|待驗證", "idea": "...", "next_step": "..."}],
  "decisions": ["..."],
  "projects": ["從 projects.txt 中選，都不符合填「其他」"]
}
```
