# Summarizer 系統提示

Worker 規格（待實作）：
1. 每 5 分鐘（launchd）取 `dirty=1` 且 `last_capture` 早於 15 分鐘前的對話。
2. 經 LiteLLM Gateway 呼叫本地模型（24GB 記憶體建議 14B 級、32K context）。
3. 長對話：沿用上一版摘要 + 只送新增部分，避免超出 context。
4. 依 JSON 結果覆寫 `Ideas/YYYY/MM/<date>_<platform>_<title>.md`，更新 `Ideas/_log/<date>.md`，設 `dirty=0`。

---

```
你是想法整理員。以下是一段 {platform} 對話的頁面文字（含介面雜訊，請忽略）。
用繁體中文輸出 JSON，不要其他文字：
{
  "title": "15 字內標題",
  "summary": "3 句內摘要",
  "ideas": [{"type": "新想法|延伸|待驗證", "idea": "...", "next_step": "..."}],
  "decisions": ["..."],
  "projects": ["從清單選：換電站EMS, 微電網, 電池, 數位人類, AI OS,
               InMoov, Amazing Hand, 可信任的控制, 本地LLM/CoPartner, 其他"]
}
若對話只是查資料、沒有任何想法或決策，ideas 與 decisions 給空陣列。
```
