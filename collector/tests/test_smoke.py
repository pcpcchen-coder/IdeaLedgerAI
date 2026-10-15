from conftest import TEST_TOKEN

PAYLOAD = {
    "platform": "chatgpt",
    "conv_id": "abc",
    "url": "https://chatgpt.com/c/abc",
    "title": "測試",
    "text": "x" * 300,
    "hash": "h1",
    "captured_at": "2026-10-15T01:00:00Z",
}


def test_ingest_requires_token(client):
    assert client.post("/ingest", json=PAYLOAD).status_code == 401
    assert client.post("/ingest", json=PAYLOAD, headers={"Authorization": "Bearer wrong"}).status_code == 401


def test_ingest_accepts_valid_token(client):
    r = client.post("/ingest", json=PAYLOAD, headers={"Authorization": f"Bearer {TEST_TOKEN}"})
    assert r.status_code == 200
    assert r.json() == {"ok": True}
