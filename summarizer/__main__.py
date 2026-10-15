"""執行一次摘要（給 launchd 每 5 分鐘呼叫）：python -m summarizer

環境變數：
  IDEA_DB        SQLite 路徑（與 collector 相同），預設 ./ledger.db
  LLM_BASE_URL   OpenAI 相容端點，預設 http://127.0.0.1:4000/v1（LiteLLM Gateway）
  LLM_MODEL      模型名稱（必填）
  LLM_API_KEY    選填
  SUMMARY_BATCH  每次最多處理幾段，預設 20
  IDEA_MEMORY_REPO  AiMemory 本機 clone 的根目錄；有設定才寫想法卡與每日日誌到其 ledger/（T20）
  IDEA_TZ        日期使用的時區，預設 Asia/Taipei
"""
import os
import sys

from .llm import LLMError, OpenAICompatClient
from .obsidian import LedgerWriter
from .store import SummaryStore
from .worker import run_once


def main() -> int:
    try:
        client = OpenAICompatClient(
            base_url=os.environ.get("LLM_BASE_URL", "http://127.0.0.1:4000/v1"),
            model=os.environ.get("LLM_MODEL", ""),
            api_key=os.environ.get("LLM_API_KEY") or None,
        )
    except LLMError as e:
        print(f"設定錯誤：{e}", file=sys.stderr)
        return 1
    store = SummaryStore(os.environ.get("IDEA_DB", "./ledger.db"))
    repo = os.environ.get("IDEA_MEMORY_REPO")
    try:
        report = run_once(store, client.complete, client.model, batch=int(os.environ.get("SUMMARY_BATCH", "20")))
        written = LedgerWriter(store.conn, repo, os.environ.get("IDEA_TZ", "Asia/Taipei")).run() if repo else None
    finally:
        store.close()
    print(f"摘要完成 {len(report.summarized)}、失敗 {len(report.failed)}、期間又更新 {len(report.still_dirty)}")
    for key in report.failed:
        print(f"  失敗：{key}", file=sys.stderr)
    if written:
        print(f"想法卡寫入 {len(written.written)}、移除舊檔 {len(written.removed)}、日誌更新 {len(written.logs)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
