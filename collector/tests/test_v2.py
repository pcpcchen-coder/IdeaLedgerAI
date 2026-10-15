import os

import pytest

from conftest import AUTH, conv
from app.server import create_app, create_app_from_env


def post(client, body):
    return client.post("/v2/conversations", json=body, headers=AUTH)


# ---- 驗證 ----

@pytest.mark.parametrize("method,path", [
    ("post", "/v2/conversations"),
    ("post", "/v2/sweep-runs"),
    ("get", "/v2/health"),
    ("get", "/v2/watermark?platform=chatgpt"),
])
def test_all_endpoints_require_token(client, method, path):
    kwargs = {"json": {}} if method == "post" else {}
    assert getattr(client, method)(path, **kwargs).status_code == 401
    assert getattr(client, method)(path, headers={"Authorization": "Bearer wrong"}, **kwargs).status_code == 401


def test_missing_token_refuses_to_start(monkeypatch, tmp_path):
    monkeypatch.delenv("IDEA_TOKEN", raising=False)
    monkeypatch.setenv("IDEA_DB", str(tmp_path / "x.db"))
    with pytest.raises(RuntimeError):
        create_app_from_env()
    with pytest.raises(RuntimeError):
        create_app("", str(tmp_path / "y.db"))


# ---- 冪等寫入 ----

def test_create_update_unchanged_older(client, store):
    assert post(client, conv()).json() == {"status": "created"}
    assert store.get_conversation("chatgpt", "abc")["dirty"] == 1

    # 模擬摘要完成
    store.conn.execute("UPDATE conv SET dirty=0")
    store.conn.commit()

    # 相同 updated_at 重送 → 不動
    assert post(client, conv()).json() == {"status": "unchanged"}
    assert store.get_conversation("chatgpt", "abc")["dirty"] == 0

    # 較舊的 updated_at → 不動
    assert post(client, conv(updated_at="2026-10-15T01:00:00Z", title="舊")).json() == {"status": "unchanged"}
    row = store.get_conversation("chatgpt", "abc")
    assert (row["dirty"], row["title"]) == (0, "換電站排程想法")

    # 較新的 updated_at → 更新並標記待摘要
    newer = conv(updated_at="2026-10-15T03:00:00Z", title="新標題")
    newer["messages"].append({"role": "user", "text": "再問一題", "at": None})
    assert post(client, newer).json() == {"status": "updated"}
    row = store.get_conversation("chatgpt", "abc")
    assert (row["dirty"], row["title"], row["message_count"]) == (1, "新標題", 3)


def test_timestamps_normalized_to_utc(client, store):
    post(client, conv(updated_at="2026-10-15T10:40:00+08:00"))
    assert store.get_conversation("chatgpt", "abc")["updated_at"] == "2026-10-15T02:40:00.000Z"
    # 同一時刻換成 UTC 表示 → 視為相同
    assert post(client, conv(updated_at="2026-10-15T02:40:00Z")).json() == {"status": "unchanged"}


def test_summarized_count_kept_on_append_reset_on_rewrite(client, store):
    post(client, conv())
    store.conn.execute("UPDATE conv SET summarized_count=2, dirty=0")
    store.conn.commit()

    appended = conv(updated_at="2026-10-15T03:00:00Z")
    appended["messages"].append({"role": "user", "text": "追加", "at": None})
    post(client, appended)
    assert store.get_conversation("chatgpt", "abc")["summarized_count"] == 2

    rewritten = conv(updated_at="2026-10-15T04:00:00Z")
    rewritten["messages"][0]["text"] = "編輯過的第一則"
    post(client, rewritten)
    assert store.get_conversation("chatgpt", "abc")["summarized_count"] == 0


# ---- #nolog ----

def test_nolog_never_stored(client, store):
    body = conv()
    body["messages"][0]["text"] = "#nolog 私人問題"
    assert post(client, body).json() == {"status": "excluded"}
    assert store.get_conversation("chatgpt", "abc") is None


def test_nolog_deletes_existing(client, store):
    post(client, conv())
    body = conv(updated_at="2026-10-15T03:00:00Z")
    body["messages"][0]["text"] = "IdeaLedger 測試 #nolog"
    assert post(client, body).json() == {"status": "excluded"}
    assert store.get_conversation("chatgpt", "abc") is None


def test_nolog_only_checks_first_user_message(client):
    body = conv()
    body["messages"].append({"role": "user", "text": "後面才提到 #nolog", "at": None})
    assert post(client, body).json() == {"status": "created"}


# ---- 格式驗證 ----

@pytest.mark.parametrize("mutate", [
    lambda b: b.pop("conv_id"),
    lambda b: b.pop("updated_at"),
    lambda b: b.update(platform="Gemini!"),
    lambda b: b.update(platform="x"),
    lambda b: b.update(updated_at="2026-10-15T02:40:00"),  # 沒有時區
    lambda b: b["messages"][0].update(role="system"),
    lambda b: b.update(messages=[]),                        # capture=api 不可沒有訊息
    lambda b: b.update(capture="screenshot"),
])
def test_invalid_payload_422(client, mutate):
    body = conv()
    mutate(body)
    assert post(client, body).status_code == 422


# ---- 平台開放 ----

def test_unseen_platforms_accepted_and_listed_in_health(client):
    assert post(client, conv(platform="gemini", platform_name="Gemini", url="https://gemini.google.com/app/x")).json()["status"] == "created"
    assert post(client, conv(platform="grok", platform_name=None, url="https://grok.com/c/y")).json()["status"] == "created"
    platforms = {p["platform"]: p for p in client.get("/v2/health", headers=AUTH).json()["platforms"]}
    assert platforms["gemini"]["platform_name"] == "Gemini"
    assert platforms["grok"]["platform_name"] == "grok"  # 未提供顯示名稱時以 id 代替


def test_page_capture(client, store):
    body = conv(platform="grok", capture="page", messages=[], page_text="頁面上的整段對話文字")
    assert post(client, body).json() == {"status": "created"}
    row = store.get_conversation("grok", "abc")
    assert (row["capture"], row["page_text"], row["message_count"]) == ("page", "頁面上的整段對話文字", 0)

    assert post(client, conv(conv_id="p2", capture="page", messages=[])).status_code == 422


def test_page_capture_nolog(client):
    body = conv(capture="page", messages=[], page_text="開頭 #nolog")
    assert post(client, body).json() == {"status": "excluded"}


# ---- 巡檢紀錄、健康、水位線 ----

def run(**overrides):
    base = {
        "platform": "chatgpt", "started_at": "2026-10-15T03:00:00Z", "finished_at": "2026-10-15T03:02:00Z",
        "status": "ok", "listed": 28, "fetched": 3, "error": None, "sweeper": "mac-mini",
    }
    base.update(overrides)
    return base


def test_health_reports_latest_run_per_platform(client):
    post(client, conv())
    post(client, conv(conv_id="def"))
    client.post("/v2/sweep-runs", json=run(), headers=AUTH)
    r = client.post("/v2/sweep-runs", json=run(status="needs_login", fetched=0, error="401"), headers=AUTH)
    assert r.json()["ok"] is True
    client.post("/v2/sweep-runs", json=run(platform="claude", status="rate_limited"), headers=AUTH)

    h = client.get("/v2/health", headers=AUTH).json()
    by = {p["platform"]: p for p in h["platforms"]}
    assert h["total_conversations"] == 2
    assert by["chatgpt"]["conversations"] == 2
    assert by["chatgpt"]["last_run"]["status"] == "needs_login"
    assert by["claude"]["conversations"] == 0
    assert by["claude"]["last_run"]["status"] == "rate_limited"


def test_sweep_run_validation(client):
    assert client.post("/v2/sweep-runs", json=run(status="weird"), headers=AUTH).status_code == 422
    assert client.post("/v2/sweep-runs", json=run(listed=-1), headers=AUTH).status_code == 422


def test_watermark(client):
    assert client.get("/v2/watermark?platform=chatgpt", headers=AUTH).json() == {"platform": "chatgpt", "watermark": None}
    post(client, conv(conv_id="a", updated_at="2026-10-15T01:00:00Z"))
    post(client, conv(conv_id="b", updated_at="2026-10-15T05:00:00Z"))
    post(client, conv(platform="claude", conv_id="c", updated_at="2026-10-16T00:00:00Z"))
    assert client.get("/v2/watermark?platform=chatgpt", headers=AUTH).json()["watermark"] == "2026-10-15T05:00:00.000Z"
    assert client.get("/v2/watermark?platform=BAD", headers=AUTH).status_code == 422


def test_body_size_limit(client):
    headers = {**AUTH, "Content-Length": str(11 * 1024 * 1024), "Content-Type": "application/json"}
    assert client.post("/v2/conversations", content=b"{}", headers=headers).status_code == 413
