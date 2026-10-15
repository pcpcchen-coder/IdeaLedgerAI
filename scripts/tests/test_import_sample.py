import importlib.util
import json
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "import_sample", Path(__file__).resolve().parents[1] / "import_sample.py"
)
imp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(imp)


def bundle(**overrides):
    b = {
        "tool": "idealedger-sampler",
        "platform": "chatgpt",
        "captured_at": "2026-10-15T12:00:00.000Z",
        "tests": [
            {"label": "simple", "id": "a", "found_in_lists": True},
            {"label": "mobile", "id": "d", "found_in_lists": False},
        ],
        "requests": [
            {"name": "session", "method": "GET", "path": "/api/auth/session", "status": 200,
             "body": {"accessToken": "<string>", "user": {"id": "<string>"}}},
            {"name": "list_page1", "method": "GET", "path": "/backend-api/conversations?offset=0", "status": 200,
             "body": {"items": [{"id": "a", "title": "IdeaLedger 測試", "user_id": "user-123"}]}},
            {"name": "conversation_simple", "method": "GET", "path": "/backend-api/conversation/{id}", "status": 200,
             "body": {"conversation_id": "a", "mapping": {}, "owner": {"id": "user-123"}}},
            {"name": "conversation_mobile", "method": "GET", "path": "/backend-api/conversation/{id}", "status": 404,
             "body": None},
        ],
    }
    b.update(overrides)
    return b


def write(tmp_path, data):
    p = tmp_path / "idealedger_chatgpt_sample.json"
    p.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return p


def test_import_splits_redacts_and_reports(tmp_path, capsys):
    dest = tmp_path / "fixtures"
    assert imp.main([str(write(tmp_path, bundle())), "--dest", str(dest)]) == 0
    files = sorted(p.name for p in dest.iterdir())
    assert files == ["REQUESTS.md", "conversation_mobile.json", "conversation_simple.json", "list_page1.json", "session.json"]
    assert json.loads((dest / "session.json").read_text(encoding="utf-8"))["accessToken"] == "[REDACTED]"
    listed = json.loads((dest / "list_page1.json").read_text(encoding="utf-8"))
    conv = json.loads((dest / "conversation_simple.json").read_text(encoding="utf-8"))
    # 跨檔一致替換：同一個 ID 在兩個檔案換成同一個佔位，原值不再出現
    assert listed["items"][0]["user_id"] == conv["owner"]["id"]
    assert listed["items"][0]["user_id"] != "user-123"
    assert "user-123" not in (dest / "list_page1.json").read_text(encoding="utf-8")

    md = (dest / "REQUESTS.md").read_text(encoding="utf-8")
    assert "| `conversation_mobile.json` | GET | `/backend-api/conversation/{id}` | 404 |" in md
    assert "| mobile | 否 |" in md
    assert "404 conversation_mobile" in capsys.readouterr().err


def test_leftover_email_aborts_without_writing(tmp_path):
    b = bundle()
    b["requests"][2]["body"]["note"] = "寄給 someone@example.com"
    dest = tmp_path / "fixtures"
    assert imp.main([str(write(tmp_path, b)), "--dest", str(dest)]) == 1
    assert not dest.exists()


def test_rejects_foreign_files_and_bad_names(tmp_path):
    assert imp.main([str(write(tmp_path, {"platform": "chatgpt"}))]) == 1
    b = bundle()
    b["requests"][0]["name"] = "../evil"
    assert imp.main([str(write(tmp_path, b)), "--dest", str(tmp_path / "x")]) == 1
    assert imp.main([str(write(tmp_path, bundle(platform="Bad!")))]) == 1
