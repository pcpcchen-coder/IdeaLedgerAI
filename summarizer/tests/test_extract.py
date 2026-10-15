"""T26：不經模型，以使用者輸入的文字當想法卡內容。"""
import json

from conftest import NOW, PROJECTS, Store, put
from summarizer.__main__ import main
from summarizer.extract import MAX_PER_MESSAGE, MODE, TRUNCATED, extract_result
from summarizer.worker import run_extract_once


def conv(messages=None, **kw):
    base = {"title": "換電站排程想法", "project": None, "page_text": None,
            "messages_json": json.dumps(messages or [], ensure_ascii=False)}
    base.update(kw)
    return base


def test_only_user_inputs_in_order():
    r = extract_result(conv([
        {"role": "user", "text": "幫我規劃換電站排程"},
        {"role": "assistant", "text": "好的，可以依電價分時"},
        {"role": "user", "text": "先做規則式\n再看要不要用模型"},
    ]))
    assert r["summary"] == "1. 幫我規劃換電站排程\n2. 先做規則式\n   再看要不要用模型"
    assert "電價分時" not in r["summary"]
    assert (r["title"], r["ideas"], r["decisions"]) == ("換電站排程想法", [], [])


def test_long_input_truncated_and_attachment_kept():
    r = extract_result(conv([{"role": "user", "text": "長" * (MAX_PER_MESSAGE + 50) + "\n[附件: a.txt]"},
                             {"role": "user", "text": "看一下\n[附件: spec.pdf]"}]))
    first, second = r["summary"].split("\n2. ")
    assert first.endswith(TRUNCATED) and len(first) < MAX_PER_MESSAGE + 20
    assert "[附件: spec.pdf]" in second


def test_total_limit_skips_rest():
    r = extract_result(conv([{"role": "user", "text": "字" * 900} for _ in range(10)]))
    assert "其餘" in r["summary"] and "略過" in r["summary"]
    assert len(r["summary"]) < 7000


def test_project_mapped_to_aimemory_code_else_other():
    assert extract_result(conv(project="換電站EMS"), PROJECTS)["projects"] == ["swap-ems"]
    assert extract_result(conv(project="SWAP-EMS"), PROJECTS)["projects"] == ["swap-ems"]
    assert extract_result(conv(project="我的其他專案"), PROJECTS)["projects"] == ["other"]
    assert extract_result(conv(), PROJECTS)["projects"] == ["other"]


def test_page_capture_and_empty():
    r = extract_result(conv(page_text="使用者：嗨\nAI：你好"))
    assert r["summary"].startswith("（頁面擷取，未區分使用者輸入）") and "使用者：嗨" in r["summary"]
    assert extract_result(conv(title=""))["title"] == "（無標題）"
    assert extract_result(conv([{"role": "user", "text": "第一行當標題\n第二行"}], title=""))["title"] == "第一行當標題"


def test_run_extract_once_saves_with_mode(db):
    collector, summary = db
    put(collector)
    report = run_extract_once(summary, now=NOW, projects=PROJECTS)
    assert report.summarized == ["chatgpt/abc"]
    row = summary.conn.execute("SELECT model, summary FROM summary").fetchone()
    assert row["model"] == MODE and row["summary"] == "1. 第一則：想做換電站排程"
    assert collector.get_conversation("chatgpt", "abc")["dirty"] == 0


def test_main_without_llm_model_writes_user_input_card(monkeypatch, tmp_path):
    db_path = str(tmp_path / "ledger.db")
    collector = Store(db_path)
    put(collector, updated_at="2026-10-01T00:00:00Z", created_at="2026-10-01T00:00:00Z")
    collector.close()
    repo = tmp_path / "AiMemory"
    repo.mkdir()
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("IDEA_DB", db_path)
    monkeypatch.delenv("LLM_MODEL", raising=False)
    monkeypatch.delenv("IDEA_GIT_PUBLISH", raising=False)
    monkeypatch.setenv("IDEA_MEMORY_REPO", str(repo))
    assert main() == 0
    cards = list((repo / "ledger/conversations").rglob("*.md"))
    assert len(cards) == 1
    text = cards[0].read_text(encoding="utf-8")
    assert "## 使用者輸入" in text and "1. 第一則：想做換電站排程" in text
    assert "## 摘要" not in text and "## 想法" not in text and "第二則" not in text


def test_main_writes_status_file(monkeypatch, tmp_path):
    """T27：每次執行後寫狀態檔，給選單列狀態圖示讀。"""
    db_path = str(tmp_path / "ledger.db")
    collector = Store(db_path)
    put(collector, updated_at="2026-10-01T00:00:00Z", created_at="2026-10-01T00:00:00Z")
    collector.close()
    status = tmp_path / "summarizer_status.json"
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("IDEA_DB", db_path)
    monkeypatch.setenv("IDEA_STATUS_FILE", str(status))
    for var in ("LLM_MODEL", "IDEA_GIT_PUBLISH", "IDEA_MEMORY_REPO"):
        monkeypatch.delenv(var, raising=False)
    assert main() == 0
    data = json.loads(status.read_text(encoding="utf-8"))
    assert data["exit_code"] == 0 and data["summarized"] == 1 and data["failed"] == 0
    assert data["mode"] == "使用者輸入" and data["finished_at"].endswith("Z")
    assert not (tmp_path / "summarizer_status.json.tmp").exists()


def test_main_records_crash_in_status_file(monkeypatch, tmp_path):
    status = tmp_path / "s.json"
    monkeypatch.setenv("IDEA_STATUS_FILE", str(status))
    monkeypatch.delenv("LLM_MODEL", raising=False)
    monkeypatch.setenv("IDEA_DB", str(tmp_path / "no-such-dir" / "ledger.db"))
    try:
        main()
    except Exception:
        pass
    data = json.loads(status.read_text(encoding="utf-8"))
    assert data["exit_code"] == 1 and data["error"]
