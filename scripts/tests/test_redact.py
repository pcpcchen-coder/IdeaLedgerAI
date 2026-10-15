import importlib.util
import json
from pathlib import Path

import pytest

_spec = importlib.util.spec_from_file_location(
    "redact_fixture", Path(__file__).resolve().parents[1] / "redact_fixture.py"
)
redact = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(redact)


def write(dir_: Path, name: str, data) -> None:
    p = dir_ / name
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


def read(dir_: Path, name: str):
    return json.loads((dir_ / name).read_text(encoding="utf-8"))


@pytest.fixture
def dirs(tmp_path):
    return tmp_path / "raw", tmp_path / "out"


def test_sensitive_keys_redacted(dirs):
    src, dst = dirs
    write(src, "session.json", {"accessToken": "abc", "nested": {"refresh_token": "x", "expires": None}, "sessionKey": "k"})
    assert redact.main([str(src), str(dst)]) == 0
    out = read(dst, "session.json")
    assert out["accessToken"] == "[REDACTED]"
    assert out["nested"] == {"refresh_token": "[REDACTED]", "expires": None}
    assert out["sessionKey"] == "[REDACTED]"


def test_person_object_fields_and_id(dirs):
    src, dst = dirs
    write(src, "s.json", {"user": {"id": "user-123", "name": "George", "email": "g@example.com", "image": "https://x/a.png"}})
    assert redact.main([str(src), str(dst)]) == 0
    assert read(dst, "s.json") == {"user": {"id": "USER_1", "name": "[REDACTED]", "email": "[REDACTED]", "image": "[REDACTED]"}}


def test_ids_replaced_consistently_across_files_and_urls(dirs):
    src, dst = dirs
    write(src, "a.json", {"user_id": "user-123", "organization_uuid": "org-abc"})
    write(src, "sub/b.json", {"url": "https://x/api/organizations/org-abc/users/user-123", "account": {"id": "acc-9"}})
    assert redact.main([str(src), str(dst)]) == 0
    assert read(dst, "a.json") == {"user_id": "USER_1", "organization_uuid": "ORG_1"}
    assert read(dst, "sub/b.json") == {"url": "https://x/api/organizations/ORG_1/users/USER_1", "account": {"id": "ACCOUNT_1"}}


def test_conversation_structure_preserved(dirs):
    src, dst = dirs
    conv = {
        "id": "conv-1",
        "mapping": {"node-1": {"id": "node-1", "parent": None, "children": ["node-2"], "message": {"id": "m1", "author": {"role": "user"}}}},
        "messages": [{"uuid": "msg-1", "sender": "human", "text": "IdeaLedger 測試"}],
        "is_archived": False,
        "count": 3,
    }
    write(src, "c.json", conv)
    assert redact.main([str(src), str(dst)]) == 0
    assert read(dst, "c.json") == conv


def test_extra_value(dirs):
    src, dst = dirs
    write(src, "orgs.json", [{"uuid": "9f1e-org", "name": "Personal"}])
    assert redact.main([str(src), str(dst), "--extra-value", "9f1e-org"]) == 0
    assert read(dst, "orgs.json") == [{"uuid": "ID_1", "name": "Personal"}]


def test_email_in_text_aborts_without_writing(dirs, capsys):
    src, dst = dirs
    write(src, "c.json", {"text": "請寄到 someone@example.com"})
    assert redact.main([str(src), str(dst)]) == 1
    assert not dst.exists()
    assert "email" in capsys.readouterr().err


def test_jwt_and_api_key_abort(dirs, capsys):
    src, dst = dirs
    jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnopqrstuv"
    write(src, "a.json", {"note": jwt})
    write(src, "b.json", {"note": "sk-ant-abcdefghijklmnopqrstuvwxyz0123"})
    assert redact.main([str(src), str(dst)]) == 1
    err = capsys.readouterr().err
    assert "jwt" in err and "api_key" in err
    assert not dst.exists()


def test_allow_overrides_false_positive(dirs):
    src, dst = dirs
    write(src, "c.json", {"file": "icon@2x.png"})
    assert redact.main([str(src), str(dst)]) == 1
    assert redact.main([str(src), str(dst), "--allow", r"@2x\.png$"]) == 0


def test_empty_input_fails(dirs):
    src, dst = dirs
    src.mkdir()
    assert redact.main([str(src), str(dst)]) == 1
