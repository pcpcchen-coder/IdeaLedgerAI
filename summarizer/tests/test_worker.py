import json

import httpx
import pytest

from conftest import NOW, PROJECTS, FakeLLM, good_output, put
from summarizer.llm import LLMError, OpenAICompatClient
from summarizer.prompt import load_projects
from summarizer.worker import parse_result, run_once


def run(summary, llm, **kw):
    return run_once(summary, llm, "test-model", now=NOW, projects=PROJECTS, **kw)


def conv_row(collector, platform="chatgpt", conv_id="abc"):
    return collector.get_conversation(platform, conv_id)


def test_full_summary(db):
    collector, summary = db
    put(collector)
    llm = FakeLLM()
    report = run(summary, llm)
    assert report.summarized == ["chatgpt/abc"]

    row = conv_row(collector)
    assert (row["dirty"], row["summarized_count"]) == (0, 2)
    prev = summary.previous("chatgpt", "abc")
    assert prev["title"] == "換電站排程"
    assert prev["ideas"][0]["idea"] == "依電價分時充電"
    assert prev["projects"] == ["換電站EMS"]  # 清單外的專案被濾掉

    system, user = llm.calls[0]
    assert "換電站EMS、電池、其他" in system
    assert "第一則" in user and "第二則" in user


def test_incremental_sends_only_new_messages_and_previous_summary(db):
    collector, summary = db
    put(collector)
    run(summary, FakeLLM())

    put(collector, updated_at="2026-10-15T11:30:00Z", messages=[
        {"role": "user", "text": "第一則：想做換電站排程"},
        {"role": "assistant", "text": "第二則：可以依電價分時"},
        {"role": "user", "text": "第三則：再加上需量反應"},
    ])
    llm = FakeLLM()
    run(summary, llm)
    _, user = llm.calls[0]
    assert "第三則" in user
    assert "第一則" not in user
    assert "前一版結果" in user and "依電價分時充電" in user
    assert conv_row(collector)["summarized_count"] == 3


def test_rewritten_prefix_sends_everything(db):
    collector, summary = db
    put(collector)
    run(summary, FakeLLM())
    put(collector, updated_at="2026-10-15T11:30:00Z", messages=[
        {"role": "user", "text": "第一則（編輯過）"},
        {"role": "assistant", "text": "新的回覆"},
    ])
    assert conv_row(collector)["summarized_count"] == 0  # collector 已歸零
    llm = FakeLLM()
    run(summary, llm)
    _, user = llm.calls[0]
    assert "第一則（編輯過）" in user and "前一版結果" not in user


def test_page_capture_uses_page_text(db):
    collector, summary = db
    put(collector, platform="grok", platform_name="Grok", capture="page", messages=[], page_text="頁面文字：討論電池 SOH")
    llm = FakeLLM()
    assert run(summary, llm).summarized == ["grok/abc"]
    _, user = llm.calls[0]
    assert "頁面文字：討論電池 SOH" in user and "忽略" in user
    assert "平台：Grok" in user


def test_unsettled_conversations_wait(db):
    collector, summary = db
    put(collector, updated_at="2026-10-15T11:50:00Z")  # 10 分鐘前
    llm = FakeLLM()
    assert run(summary, llm).summarized == []
    assert llm.calls == []


def test_fenced_json_and_retry_once(db):
    collector, summary = db
    put(collector)
    llm = FakeLLM("這不是 JSON", "好的：\n```json\n" + good_output(title="第二次才對") + "\n```")
    report = run(summary, llm)
    assert report.summarized == ["chatgpt/abc"]
    assert len(llm.calls) == 2
    assert "無法使用" in llm.calls[1][1]
    assert summary.previous("chatgpt", "abc")["title"] == "第二次才對"


def test_failures_counted_then_skipped_until_updated(db):
    collector, summary = db
    put(collector)
    bad = good_output(ideas=[{"type": "胡說", "idea": "x"}])
    for attempt in range(1, 4):
        llm = FakeLLM(bad, bad)
        assert run(summary, llm).failed == ["chatgpt/abc"]
        row = summary.conn.execute("SELECT attempts, last_error FROM summary").fetchone()
        assert row["attempts"] == attempt
        assert conv_row(collector)["dirty"] == 1

    llm = FakeLLM()
    assert run(summary, llm).failed == [] and llm.calls == []  # 連續 3 次後略過

    put(collector, updated_at="2026-10-15T11:30:00Z", title="對話更新了")
    assert run(summary, FakeLLM()).summarized == ["chatgpt/abc"]  # 對話更新後恢復


def test_llm_exception_recorded(db):
    collector, summary = db
    put(collector)
    report = run(summary, FakeLLM(LLMError("連不上模型服務")))
    assert report.failed == ["chatgpt/abc"]
    assert "連不上" in summary.conn.execute("SELECT last_error FROM summary").fetchone()[0]


def test_race_with_collector_keeps_dirty(db):
    collector, summary = db
    put(collector)

    def llm(system, user):
        # 摘要進行中，collector 收到新版本
        put(collector, updated_at="2026-10-15T11:45:00Z", title="期間又更新")
        return good_output()

    report = run(summary, llm)
    assert report.still_dirty == ["chatgpt/abc"]
    assert conv_row(collector)["dirty"] == 1


def test_unseen_platform_summarized(db):
    collector, summary = db
    put(collector, platform="grok", platform_name="Grok", url="https://grok.com/c/1")
    put(collector, platform="some-new-ai", platform_name=None, url="https://x.test/c/1")
    llm = FakeLLM()
    report = run(summary, llm)
    assert sorted(report.summarized) == ["grok/abc", "some-new-ai/abc"]
    users = " ".join(u for _, u in llm.calls)
    assert "平台：Grok" in users and "平台：some-new-ai" in users


def test_batch_limit_oldest_first(db):
    collector, summary = db
    for i in range(5):
        put(collector, conv_id=f"c{i}", updated_at=f"2026-10-15T1{i}:00:00Z" if i < 2 else "2026-10-15T11:0%d:00Z" % i)
    report = run(summary, FakeLLM(), batch=2)
    assert report.summarized == ["chatgpt/c0", "chatgpt/c1"]


def test_parse_result_rules():
    out = parse_result(good_output(projects=["外星專案"]), ["換電站EMS", "其他"])
    assert out["projects"] == ["其他"]
    with pytest.raises(ValueError):
        parse_result("沒有大括號", ["其他"])


def test_projects_file_loaded():
    projects = load_projects()
    assert "換電站EMS" in projects
    assert not any(p.startswith("#") for p in projects)


# ---- LLM 用戶端 ----

def test_llm_client_request_and_errors():
    seen = {}

    def handler(request):
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("authorization")
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"choices": [{"message": {"content": "回覆"}}]})

    c = OpenAICompatClient("http://127.0.0.1:4000/v1/", "qwen", api_key="k", transport=httpx.MockTransport(handler))
    assert c.complete("系統", "使用者") == "回覆"
    assert seen["url"] == "http://127.0.0.1:4000/v1/chat/completions"
    assert seen["auth"] == "Bearer k"
    assert seen["body"]["model"] == "qwen"
    assert [m["role"] for m in seen["body"]["messages"]] == ["system", "user"]

    err = OpenAICompatClient("http://x/v1", "m", transport=httpx.MockTransport(lambda r: httpx.Response(500, text="炸了")))
    with pytest.raises(LLMError, match="500"):
        err.complete("s", "u")

    def down(request):
        raise httpx.ConnectError("refused")

    with pytest.raises(LLMError, match="連不上"):
        OpenAICompatClient("http://x/v1", "m", transport=httpx.MockTransport(down)).complete("s", "u")

    with pytest.raises(LLMError, match="LLM_MODEL"):
        OpenAICompatClient("http://x/v1", "")
