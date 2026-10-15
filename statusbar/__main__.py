"""選單列狀態圖示：python -m statusbar（由 launchd 在登入時啟動，T27）。

環境變數（run-statusbar.sh 會讀 .env 後帶入）：
  IDEA_TOKEN        collector token
  IDEA_DB           collector 資料庫（只讀，用來算待處理數）
  IDEA_STATUS_FILE  summarizer 狀態檔
  IDEALEDGER_HOME   資料夾（打開記錄用）
  IDEALEDGER_REPO   程式資料夾（執行 doctor 用）
"""
from .app import main

raise SystemExit(main())
