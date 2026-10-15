# chatgpt 採樣紀錄

採樣時間：2026-10-15T03:07:50.347Z（由 tools/sampler 主控台腳本產生）

## 請求

| 檔案 | 方法 | 路徑 | 狀態碼 |
|---|---|---|---|
| `session.json` | GET | `/api/auth/session` | 200 |
| `list_page1.json` | GET | `/backend-api/conversations?offset=0&limit=28&order=updated` | 200 |
| `list_page2.json` | GET | `/backend-api/conversations?offset=28&limit=28&order=updated` | 200 |
| `conversation_simple.json` | GET | `/backend-api/conversation/{id}` | 200 |
| `conversation_branched.json` | GET | `/backend-api/conversation/{id}` | 200 |
| `conversation_project.json` | GET | `/backend-api/conversation/{id}` | 200 |

## 測試對話是否出現在歷史清單（前兩頁）

| 標籤 | 出現在清單 |
|---|---|
| simple | 是 |
| branched | 是 |
| project | 是 |

「否」不一定代表不同步：可能只是不在前兩頁。手機 App 對話（mobile）若為「否」，請在網頁歷史中手動確認。
