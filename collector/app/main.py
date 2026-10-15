"""Idea Ledger collector — 接收擴充送來的對話快照，存入 SQLite 並標記待摘要。

目前是 v1 的 /ingest 端點，T03 會改寫為 v2（/v2/conversations 等）。
"""
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
import sqlite3, os, datetime as dt

TOKEN = os.environ["IDEA_TOKEN"]
db = sqlite3.connect(os.environ.get("IDEA_DB", "./ledger.db"), check_same_thread=False)
db.executescript("""
CREATE TABLE IF NOT EXISTS conv(platform TEXT, conv_id TEXT, url TEXT, title TEXT,
  text TEXT, hash TEXT, first_seen TEXT, last_capture TEXT, dirty INT,
  PRIMARY KEY(platform, conv_id));
CREATE TABLE IF NOT EXISTS visit(platform TEXT, conv_id TEXT, day TEXT, at TEXT,
  PRIMARY KEY(platform, conv_id, day));
""")


class Capture(BaseModel):
    platform: str
    conv_id: str
    url: str
    title: str
    text: str
    hash: str
    captured_at: str


app = FastAPI()


@app.post("/ingest")
def ingest(c: Capture, authorization: str = Header("")):
    if authorization != f"Bearer {TOKEN}":
        raise HTTPException(401)
    now = dt.datetime.now().isoformat(timespec="seconds")
    db.execute("""INSERT INTO conv VALUES(?,?,?,?,?,?,?,?,1)
      ON CONFLICT(platform, conv_id) DO UPDATE SET
        url=excluded.url, title=excluded.title, text=excluded.text,
        hash=excluded.hash, last_capture=excluded.last_capture, dirty=1
      WHERE conv.hash != excluded.hash""",
               (c.platform, c.conv_id, c.url, c.title, c.text, c.hash, now, now))
    db.execute("INSERT OR IGNORE INTO visit VALUES(?,?,?,?)",
               (c.platform, c.conv_id, now[:10], now))
    db.commit()
    return {"ok": True}
