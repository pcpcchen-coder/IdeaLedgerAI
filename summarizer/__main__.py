"""執行一次摘要（給 launchd 每 5 分鐘呼叫）：python -m summarizer

環境變數：
  IDEA_DB        SQLite 路徑（與 collector 相同），預設 ./ledger.db
  LLM_BASE_URL   OpenAI 相容端點，預設 http://127.0.0.1:4000/v1（LiteLLM Gateway）
  LLM_MODEL      模型名稱（必填）
  LLM_API_KEY    選填
  SUMMARY_BATCH  每次最多處理幾段，預設 20
"""
import os
import sys

from .llm import LLMError, OpenAICompatClient
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
    try:
        report = run_once(store, client.complete, client.model, batch=int(os.environ.get("SUMMARY_BATCH", "20")))
    finally:
        store.close()
    print(f"摘要完成 {len(report.summarized)}、失敗 {len(report.failed)}、期間又更新 {len(report.still_dirty)}")
    for key in report.failed:
        print(f"  失敗：{key}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
