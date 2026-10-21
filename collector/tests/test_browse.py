"""T28：瀏覽介面的唯讀 API 與靜態頁。"""
import pytest

from conftest import AUTH, conv


def post(client, body):
    assert client.post("/v2/conversations", json=body, headers=AUTH).status_code == 200


def msgs(*pairs):
    return [{"role": r, "text": t, "at": "2026-10-15T01:12:00Z"} for r, t in pairs]


@pytest.fixture
def seeded(client):
    post(client, conv(conv_id="a1", title="換電站排程", project="換電站EMS系統", updated_at="2026-10-15T05:00:00Z",
                      messages=msgs(("user", "幫我規劃 SOH 修正流程"), ("assistant", "可以先用 EIS 量測內阻"))))
    post(client, conv(platform="claude", platform_name="Claude", conv_id="b2", title="週末食譜",
                      url="https://claude.ai/chat/b2", updated_at="2026-10-16T05:00:00Z",
                      messages=msgs(("user", "晚餐吃什麼"), ("assistant", "番茄炒蛋 100% 好吃，含\"引號\""))))
    post(client, conv(platform="gemini", platform_name="Gemini", conv_id="c3", capture="page", title="頁面擷取",
                      url="https://gemini.google.com/app/c3", messages=[], updated_at="2026-10-14T05:00:00Z",
                      page_text="使用者：測試 Gemini 頁面 SOH"))
    return client


def get(client, path, **params):
    r = client.get(path, params=params, headers=AUTH)
    assert r.status_code == 200, r.text
    assert r.headers["cache-control"] == "no-store"
    return r.json()


@pytest.mark.parametrize("path", ["/v2/conversations", "/v2/conversations/chatgpt/a1", "/v2/facets"])
def test_data_endpoints_require_token(client, path):
    assert client.get(path).status_code == 401
    assert client.get(path, headers={"Authorization": "Bearer wrong"}).status_code == 401


def test_list_newest_first_with_preview(seeded):
    data = get(seeded, "/v2/conversations")
    assert data["total"] == 3 and [i["conv_id"] for i in data["items"]] == ["b2", "a1", "c3"]
    first = data["items"][0]
    assert first["snippet"] == "晚餐吃什麼" and first["snippet_role"] == "user"
    assert first["platform_name"] == "Claude" and first["url"] == "https://claude.ai/chat/b2"
    assert "messages_json" not in first and "page_text" not in first


def test_search_messages_title_project_and_page_text(seeded):
    hit = get(seeded, "/v2/conversations", q="EIS")
    assert [i["conv_id"] for i in hit["items"]] == ["a1"]
    assert hit["items"][0]["snippet_role"] == "assistant" and "EIS" in hit["items"][0]["snippet"]
    assert get(seeded, "/v2/conversations", q="食譜")["total"] == 1                    # 標題
    assert get(seeded, "/v2/conversations", q="ems系統")["items"][0]["conv_id"] == "a1"  # 專案、不分大小寫
    soh = get(seeded, "/v2/conversations", q="soh")
    assert {i["conv_id"] for i in soh["items"]} == {"a1", "c3"}                          # 含頁面擷取


def test_search_multiple_terms_are_and(seeded):
    assert get(seeded, "/v2/conversations", q="SOH 規劃")["total"] == 1
    assert get(seeded, "/v2/conversations", q="SOH 食譜")["total"] == 0


def test_search_special_characters_are_literal(seeded):
    assert get(seeded, "/v2/conversations", q="100%")["total"] == 1
    assert get(seeded, "/v2/conversations", q="%")["total"] == 1     # % 不是萬用字元
    assert get(seeded, "/v2/conversations", q="_")["total"] == 0
    assert get(seeded, "/v2/conversations", q='"引號"')["total"] == 1  # JSON 內的跳脫引號也找得到


def test_filters_and_paging(seeded):
    assert get(seeded, "/v2/conversations", platform="claude")["total"] == 1
    assert get(seeded, "/v2/conversations", project="換電站EMS系統")["total"] == 1
    assert get(seeded, "/v2/conversations", project="")["total"] == 2  # 不在專案內
    page = get(seeded, "/v2/conversations", limit=1, offset=1)
    assert page["total"] == 3 and [i["conv_id"] for i in page["items"]] == ["a1"]
    assert seeded.get("/v2/conversations", params={"platform": "Bad!"}, headers=AUTH).status_code == 422
    assert seeded.get("/v2/conversations", params={"limit": 1000}, headers=AUTH).status_code == 422


def test_facets_come_from_data(seeded):
    f = get(seeded, "/v2/facets")
    assert f["total"] == 3 and f["no_project"] == 2
    assert {p["platform"]: p["platform_name"] for p in f["platforms"]} == \
        {"chatgpt": "ChatGPT", "claude": "Claude", "gemini": "Gemini"}
    assert f["projects"] == [{"project": "換電站EMS系統", "count": 1}]


def test_detail_full_messages_and_card(seeded, store):
    d = get(seeded, "/v2/conversations/chatgpt/a1")
    assert [m["role"] for m in d["messages"]] == ["user", "assistant"]
    assert d["messages"][1]["text"] == "可以先用 EIS 量測內阻" and d["card_path"] is None
    store.conn.execute("CREATE TABLE card(platform, conv_id, path, version, written_at)")
    store.conn.execute("INSERT INTO card VALUES('chatgpt','a1','ledger/conversations/x.md','v','t')")
    assert get(seeded, "/v2/conversations/chatgpt/a1")["card_path"] == "ledger/conversations/x.md"
    assert get(seeded, "/v2/conversations/gemini/c3")["page_text"].startswith("使用者")
    assert seeded.get("/v2/conversations/chatgpt/none", headers=AUTH).status_code == 404


def test_browse_is_read_only(seeded, store):
    before = store.conn.execute("SELECT platform, conv_id, dirty, last_received FROM conv ORDER BY 1, 2").fetchall()
    get(seeded, "/v2/conversations", q="SOH")
    get(seeded, "/v2/conversations/chatgpt/a1")
    get(seeded, "/v2/facets")
    after = store.conn.execute("SELECT platform, conv_id, dirty, last_received FROM conv ORDER BY 1, 2").fetchall()
    assert [tuple(r) for r in before] == [tuple(r) for r in after]


def test_ui_static_files_without_data(client):
    assert client.get("/", follow_redirects=False).headers["location"] == "/ui"
    page = client.get("/ui")
    assert page.status_code == 200 and page.headers["content-type"].startswith("text/html")
    csp = page.headers["content-security-policy"]
    assert "script-src 'self'" in csp and "connect-src 'self'" in csp and "frame-ancestors 'none'" in csp
    assert page.headers["referrer-policy"] == "no-referrer"
    assert "<script src=\"/ui/app.js\"" in page.text and "http" not in page.text.split("<body>")[0].replace(
        "http-equiv", "")  # 不載入外部資源
    js = client.get("/ui/app.js")
    assert js.status_code == 200 and js.headers["content-type"].startswith("text/javascript")
    assert "innerHTML" not in js.text  # 對話內容一律以文字節點呈現
    assert client.get("/ui/app.css").headers["content-type"].startswith("text/css")
    assert client.get("/ui/server.py").status_code == 404
    assert client.get("/ui/..%2Fdb.py").status_code == 404
