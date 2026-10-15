import importlib
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

TEST_TOKEN = "test-token"


@pytest.fixture
def client(tmp_path, monkeypatch):
    """每個測試用獨立的暫存資料庫重新載入 app。"""
    monkeypatch.setenv("IDEA_TOKEN", TEST_TOKEN)
    monkeypatch.setenv("IDEA_DB", str(tmp_path / "ledger.db"))
    import app.main as main

    main = importlib.reload(main)
    with TestClient(main.app) as c:
        yield c
    main.db.close()
