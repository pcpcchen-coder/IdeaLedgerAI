"""SQLite 存取。所有寫入都在鎖內的交易中完成；FastAPI 的同步端點會在多執行緒中執行。"""
from __future__ import annotations

import json
import sqlite3
import threading
from datetime import datetime, timezone
from typing import Optional

from .models import ConversationIn, SweepRunIn, to_iso_utc

SCHEMA = """
CREATE TABLE IF NOT EXISTS conv(
  platform TEXT NOT NULL,
  conv_id TEXT NOT NULL,
  platform_name TEXT,
  capture TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  project TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  messages_json TEXT NOT NULL,
  page_text TEXT,
  message_count INTEGER NOT NULL,
  summarized_count INTEGER NOT NULL DEFAULT 0,  -- 已摘要到第幾則，供增量摘要（T09）
  dirty INTEGER NOT NULL,                       -- 1 = 待摘要
  first_seen TEXT NOT NULL,
  last_received TEXT NOT NULL,
  swept_at TEXT,
  sweeper TEXT,
  PRIMARY KEY(platform, conv_id)
);
CREATE INDEX IF NOT EXISTS conv_dirty ON conv(dirty, updated_at);

CREATE TABLE IF NOT EXISTS sweep_run(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  status TEXT NOT NULL,
  listed INTEGER NOT NULL,
  fetched INTEGER NOT NULL,
  error TEXT,
  sweeper TEXT,
  received_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sweep_run_platform ON sweep_run(platform, id);
"""


def _now() -> str:
    return to_iso_utc(datetime.now(timezone.utc))


def _iso(v: Optional[datetime]) -> Optional[str]:
    return to_iso_utc(v) if v is not None else None


class Store:
    def __init__(self, path: str):
        self.conn = sqlite3.connect(path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.executescript(SCHEMA)
        self.lock = threading.Lock()

    def close(self) -> None:
        self.conn.close()

    # ---- 對話 ----

    def upsert_conversation(self, c: ConversationIn) -> str:
        """回傳 created／updated／unchanged／excluded。以 (platform, conv_id, updated_at) 判斷是否重複。"""
        messages = [{"role": m.role, "text": m.text, "at": _iso(m.at)} for m in c.messages]
        updated_at = to_iso_utc(c.updated_at)
        now = _now()
        with self.lock, self.conn:
            if c.is_nolog():
                self.conn.execute("DELETE FROM conv WHERE platform=? AND conv_id=?", (c.platform, c.conv_id))
                return "excluded"

            row = self.conn.execute(
                "SELECT updated_at, messages_json, summarized_count FROM conv WHERE platform=? AND conv_id=?",
                (c.platform, c.conv_id),
            ).fetchone()

            if row is None:
                self.conn.execute(
                    """INSERT INTO conv(platform, conv_id, platform_name, capture, title, url, project,
                         created_at, updated_at, messages_json, page_text, message_count,
                         summarized_count, dirty, first_seen, last_received, swept_at, sweeper)
                       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,0,1,?,?,?,?)""",
                    (c.platform, c.conv_id, c.platform_name, c.capture, c.title, c.url, c.project,
                     to_iso_utc(c.created_at), updated_at, json.dumps(messages, ensure_ascii=False),
                     c.page_text, len(messages), now, now, _iso(c.swept_at), c.sweeper),
                )
                return "created"

            if updated_at <= row["updated_at"]:
                return "unchanged"

            # 已摘要的前段若被改寫（編輯訊息、切換分支），增量摘要不再成立，重新從頭摘要。
            summarized = row["summarized_count"]
            old = json.loads(row["messages_json"])
            if summarized and messages[:summarized] != old[:summarized]:
                summarized = 0

            self.conn.execute(
                """UPDATE conv SET platform_name=COALESCE(?, platform_name), capture=?, title=?, url=?,
                     project=?, created_at=?, updated_at=?, messages_json=?, page_text=?, message_count=?,
                     summarized_count=?, dirty=1, last_received=?, swept_at=?, sweeper=?
                   WHERE platform=? AND conv_id=?""",
                (c.platform_name, c.capture, c.title, c.url, c.project, to_iso_utc(c.created_at), updated_at,
                 json.dumps(messages, ensure_ascii=False), c.page_text, len(messages), summarized, now,
                 _iso(c.swept_at), c.sweeper, c.platform, c.conv_id),
            )
            return "updated"

    def get_conversation(self, platform: str, conv_id: str) -> Optional[sqlite3.Row]:
        return self.conn.execute(
            "SELECT * FROM conv WHERE platform=? AND conv_id=?", (platform, conv_id)
        ).fetchone()

    # ---- 巡檢紀錄 ----

    def add_sweep_run(self, r: SweepRunIn) -> int:
        with self.lock, self.conn:
            cur = self.conn.execute(
                """INSERT INTO sweep_run(platform, started_at, finished_at, status, listed, fetched,
                     error, sweeper, received_at) VALUES(?,?,?,?,?,?,?,?,?)""",
                (r.platform, to_iso_utc(r.started_at), to_iso_utc(r.finished_at), r.status,
                 r.listed, r.fetched, r.error, r.sweeper, _now()),
            )
            return cur.lastrowid

    # ---- 查詢 ----

    def browse(self, fn, *args, **kwargs):
        """瀏覽介面的唯讀查詢（browse.py）；與寫入共用連線，所以同樣在鎖內執行。"""
        with self.lock:
            return fn(self.conn, *args, **kwargs)

    def watermark(self, platform: str) -> Optional[str]:
        row = self.conn.execute("SELECT MAX(updated_at) AS w FROM conv WHERE platform=?", (platform,)).fetchone()
        return row["w"]

    def health(self) -> dict:
        counts = {
            r["platform"]: (r["n"], r["name"])
            for r in self.conn.execute(
                "SELECT platform, COUNT(*) AS n, MAX(platform_name) AS name FROM conv GROUP BY platform"
            )
        }
        last_runs = {
            r["platform"]: dict(r)
            for r in self.conn.execute(
                """SELECT s.platform, s.status, s.started_at, s.finished_at, s.listed, s.fetched, s.error, s.sweeper
                   FROM sweep_run s JOIN (SELECT platform, MAX(id) AS id FROM sweep_run GROUP BY platform) m
                   ON s.id = m.id"""
            )
        }
        platforms = []
        for p in sorted(set(counts) | set(last_runs)):
            n, name = counts.get(p, (0, None))
            run = last_runs.get(p)
            if run:
                run.pop("platform")
            platforms.append({"platform": p, "platform_name": name or p, "conversations": n, "last_run": run})
        return {"platforms": platforms, "total_conversations": sum(n for n, _ in counts.values())}
