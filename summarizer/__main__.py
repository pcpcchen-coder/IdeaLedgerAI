"""執行一次摘要（給 launchd 每 5 分鐘呼叫）：python -m summarizer

環境變數：
  IDEA_DB        SQLite 路徑（與 collector 相同），預設 ./ledger.db
  LLM_BASE_URL   OpenAI 相容端點，預設 http://127.0.0.1:4000/v1（LiteLLM Gateway）
  LLM_MODEL      模型名稱（必填）
  LLM_API_KEY    選填
  SUMMARY_BATCH  每次最多處理幾段，預設 20
  IDEA_MEMORY_REPO  AiMemory 本機 clone 的根目錄；有設定才寫想法卡與每日日誌到其 ledger/（T20），
                    專案清單讀其 projects/*.md（T21）
  IDEA_TZ        日期使用的時區，預設 Asia/Taipei
  IDEA_GIT_PUBLISH  設為 1 時，寫入前後與 AiMemory 遠端同步：pull --rebase → 寫入 → commit → push（T23）
  IDEA_GIT_EMAIL    bot commit 的 email，預設 idea-ledger-bot@users.noreply.github.com
"""
import os
import sys

from .llm import LLMError, OpenAICompatClient
from .obsidian import LedgerWriter
from .prompt import load_projects
from .publisher import BOT_EMAIL, publish
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
        projects = load_projects(repo)
        report = run_once(store, client.complete, client.model, batch=int(os.environ.get("SUMMARY_BATCH", "20")),
                          projects=projects)
        written = published = None
        if repo:
            tz = os.environ.get("IDEA_TZ", "Asia/Taipei")
            writer = LedgerWriter(store.conn, repo, tz, projects)
            if os.environ.get("IDEA_GIT_PUBLISH") == "1":
                published = publish(repo, writer, email=os.environ.get("IDEA_GIT_EMAIL") or BOT_EMAIL, tz=tz)
                written = published.written
            else:
                written = writer.run()
    finally:
        store.close()
    print(f"摘要完成 {len(report.summarized)}、失敗 {len(report.failed)}、期間又更新 {len(report.still_dirty)}")
    for key in report.failed:
        print(f"  失敗：{key}", file=sys.stderr)
    if written:
        print(f"想法卡寫入 {len(written.written)}、移除舊檔 {len(written.removed)}、日誌更新 {len(written.logs)}、"
              f"索引更新 {len(written.indexes)}")
    if published:
        print(f"發佈：{published.status}" + (f"（{published.detail}）" if published.detail else ""))
        if published.outside:
            print(f"  ledger/ 以外的變動：{', '.join(published.outside)}", file=sys.stderr)
        if published.status not in ("pushed", "no_changes"):
            return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
