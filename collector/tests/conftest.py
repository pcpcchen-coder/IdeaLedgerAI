import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.server import create_app  # noqa: E402

TEST_TOKEN = "test-token"
AUTH = {"Authorization": f"Bearer {TEST_TOKEN}"}


@pytest.fixture
def app(tmp_path):
    return create_app(TEST_TOKEN, str(tmp_path / "ledger.db"))


@pytest.fixture
def client(app):
    with TestClient(app) as c:
        yield c


@pytest.fixture
def store(app):
    return app.state.store


def conv(**overrides):
    """一筆合法的 capture=api 對話，可用參數覆寫欄位。"""
    base = {
        "platform": "chatgpt",
        "platform_name": "ChatGPT",
        "conv_id": "abc",
        "title": "換電站排程想法",
        "url": "https://chatgpt.com/c/abc",
        "project": None,
        "created_at": "2026-10-15T01:12:00Z",
        "updated_at": "2026-10-15T02:40:00Z",
        "messages": [
            {"role": "user", "text": "IdeaLedger 測試", "at": "2026-10-15T01:12:00Z"},
            {"role": "assistant", "text": "收到", "at": "2026-10-15T01:12:30Z"},
        ],
        "swept_at": "2026-10-15T03:00:00Z",
        "sweeper": "mac-mini",
    }
    base.update(overrides)
    return base
