# Fixtures：平台回應樣本

adapter 解析層（T04、T05、T13）只依這裡的樣本開發與測試。雲端工作階段無法登入你的帳號，所以這些樣本就是唯一的事實來源。

## 規則

1. **只用測試對話採樣。** 內容開頭打「IdeaLedger 測試」，不要用真實工作對話。採樣步驟見工單 T01（ChatGPT）、T02（Claude）、T12（Kimi）。
2. **原始檔放 `raw/<平台>/`。** 這個資料夾已列入 `.gitignore`，永遠不會被提交。
3. **遮罩後才提交。** 在 repo 根目錄執行：
   ```bash
   python scripts/redact_fixture.py extension/fixtures/raw/chatgpt extension/fixtures/chatgpt
   ```
   - 敏感鍵（token、email、cookie 等）的值換成 `[REDACTED]`。
   - 人員、組織的識別碼換成一致的佔位（`USER_1`、`ORG_1`），網址裡出現的也會一起換。
   - 遮罩後若仍偵測到 email、JWT 或 API 金鑰，工具會列出位置並中止，不寫出任何檔案。
   - 工具沒認出的識別碼（例如 Claude 組織清單裡的 `uuid`）用 `--extra-value <值>` 補上。
   - 誤判（例如檔名 `icon@2x.png` 被當成 email）用 `--allow '<正規式>'` 放行。
4. **每個平台附一份 `NOTES.md`**，回答工單列出的問題：請求路徑樣式、分頁方式、時間欄位格式、分支表示法等。adapter 的欄位名稱以 NOTES.md 為準。
5. **提交前再確認一次：** `grep -ri "@" extension/fixtures/<平台>/*.json` 不應出現你的 email。

## 最快：主控台採樣腳本

`extension/tools/sampler/out/<平台>.console.js` 貼進已登入平台網頁的 Console 執行，會下載一個已在瀏覽器內遮蔽過的檔案，再用：

```bash
python scripts/import_sample.py idealedger_<平台>_sample.json
```

拆成每個請求一個檔案、再經遮罩工具處理，輸出到 `extension/fixtures/<平台>/`，並產生 `REQUESTS.md`（路徑、狀態碼、測試對話是否出現在清單）。修改腳本原始碼後要執行 `npm run sampler` 重新產生，測試會檢查兩者一致。新增平台時，照 `tools/sampler/sampler-<平台>.js` 的格式加一份設定即可。

## 也可以交給雲端工作階段

把原始 JSON 檔直接拖進雲端工作階段，說「T01 採樣檔，幫我遮罩並提交」。原始檔只會放在 `raw/`，不會被提交。
