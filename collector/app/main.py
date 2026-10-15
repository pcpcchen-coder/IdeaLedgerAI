"""Idea Ledger collector 進入點。

啟動：
    IDEA_TOKEN=<自訂亂碼> uvicorn app.main:app --host 127.0.0.1 --port 8787

環境變數：IDEA_TOKEN（必填）、IDEA_DB（預設 ./ledger.db）。
"""
from .server import create_app_from_env

app = create_app_from_env()
