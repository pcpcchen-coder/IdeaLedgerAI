import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "collector"))

from app.db import Store  # noqa: E402  collector 的資料層，確保兩邊共用同一份 schema
from app.models import ConversationIn  # noqa: E402
from summarizer.store import SummaryStore  # noqa: E402

NOW = datetime(2026, 10, 15, 12, 0, tzinfo=timezone.utc)
PROJECTS = {"swap-ems": "換電站EMS", "battery": "電池"}   # {代號: 名稱}，同 AiMemory projects/


def good_output(**overrides):
    data = {
        "title": "換電站排程",
        "summary": "討論換電站的充電排程。決定先用規則式排程。",
        "ideas": [{"type": "新想法", "idea": "依電價分時充電", "next_step": "拉三個月電價資料"}],
        "decisions": ["先用規則式排程"],
        "projects": ["換電站EMS", "不存在的專案"],
    }
    data.update(overrides)
    return json.dumps(data, ensure_ascii=False)


class FakeLLM:
    """依序回傳預先排好的輸出；記錄每次的 system 與 user。"""

    def __init__(self, *outputs):
        self.outputs = list(outputs)
        self.calls = []

    def __call__(self, system, user):
        self.calls.append((system, user))
        out = self.outputs.pop(0) if self.outputs else good_output()
        if isinstance(out, Exception):
            raise out
        return out


@pytest.fixture
def db(tmp_path):
    path = str(tmp_path / "ledger.db")
    collector = Store(path)
    summary = SummaryStore(path)
    yield collector, summary
    summary.close()
    collector.close()


def put(collector, **overrides):
    """以 collector 的寫入路徑新增或更新一段對話。"""
    base = {
        "platform": "chatgpt",
        "platform_name": "ChatGPT",
        "conv_id": "abc",
        "title": "換電站排程想法",
        "url": "https://chatgpt.com/c/abc",
        "created_at": "2026-10-15T10:00:00Z",
        "updated_at": "2026-10-15T11:00:00Z",
        "messages": [
            {"role": "user", "text": "第一則：想做換電站排程"},
            {"role": "assistant", "text": "第二則：可以依電價分時"},
        ],
    }
    base.update(overrides)
    return collector.upsert_conversation(ConversationIn.model_validate(base))
