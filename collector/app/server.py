"""Collector v2 路由。只綁 127.0.0.1，所有端點需 Bearer Token。"""
from __future__ import annotations

import os
import secrets
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse

from . import browse
from .db import Store
from .models import PLATFORM_ID, ConversationIn, SweepRunIn

MAX_BODY_BYTES = 10 * 1024 * 1024

# 瀏覽介面（T28）：靜態檔不含任何資料，不需 token；資料一律走需要 token 的 /v2 API。
UI_DIR = Path(__file__).with_name("ui")
UI_FILES = {"index.html": "text/html", "app.js": "text/javascript", "app.css": "text/css"}
UI_HEADERS = {
    # 只准載入自己的腳本與樣式、只准連回 collector；對話內容一律以文字節點呈現（見 app.js）
    "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; "
                               "img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-cache",
}


def create_app(token: str, db_path: str) -> FastAPI:
    if not token:
        raise RuntimeError("IDEA_TOKEN 未設定，collector 拒絕啟動")

    store = Store(db_path)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        yield
        store.close()

    app = FastAPI(title="Idea Ledger Collector", version="2.0", lifespan=lifespan)
    app.state.store = store

    @app.middleware("http")
    async def limit_body(request: Request, call_next):
        length = request.headers.get("content-length")
        if length is not None and length.isdigit() and int(length) > MAX_BODY_BYTES:
            return JSONResponse({"detail": "請求超過 10 MB 上限"}, status_code=413)
        return await call_next(request)

    def auth(authorization: str = Header("")) -> None:
        if not secrets.compare_digest(authorization, f"Bearer {token}"):
            raise HTTPException(status_code=401, detail="token 錯誤")

    @app.post("/v2/conversations", dependencies=[Depends(auth)])
    def post_conversation(c: ConversationIn) -> dict:
        status = store.upsert_conversation(c)
        return {"status": status}

    @app.post("/v2/sweep-runs", dependencies=[Depends(auth)])
    def post_sweep_run(r: SweepRunIn) -> dict:
        return {"ok": True, "id": store.add_sweep_run(r)}

    @app.get("/v2/health", dependencies=[Depends(auth)])
    def get_health() -> dict:
        return store.health()

    # ---- 瀏覽介面（T28），全部唯讀 ----

    @app.get("/v2/conversations", dependencies=[Depends(auth)])
    def list_conversations(response: Response, q: Optional[str] = Query(None, max_length=200),
                           platform: Optional[str] = Query(None, pattern=PLATFORM_ID),
                           project: Optional[str] = Query(None, max_length=200),
                           limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0)) -> dict:
        response.headers["Cache-Control"] = "no-store"
        return store.browse(browse.search, q=q, platform=platform, project=project, limit=limit, offset=offset)

    @app.get("/v2/conversations/{platform}/{conv_id:path}", dependencies=[Depends(auth)])
    def get_conversation(response: Response, platform: str, conv_id: str) -> dict:
        response.headers["Cache-Control"] = "no-store"
        found = store.browse(browse.detail, platform, conv_id)
        if found is None:
            raise HTTPException(status_code=404, detail="找不到這段對話")
        return found

    @app.get("/v2/facets", dependencies=[Depends(auth)])
    def get_facets(response: Response) -> dict:
        response.headers["Cache-Control"] = "no-store"
        return store.browse(browse.facets)

    @app.get("/", include_in_schema=False)
    def root() -> RedirectResponse:
        return RedirectResponse("/ui")

    @app.get("/ui", include_in_schema=False)
    def ui_index() -> FileResponse:
        return FileResponse(UI_DIR / "index.html", media_type="text/html", headers=UI_HEADERS)

    @app.get("/ui/{name}", include_in_schema=False)
    def ui_file(name: str) -> FileResponse:
        if name not in UI_FILES:  # 白名單，不從路徑組檔名
            raise HTTPException(status_code=404)
        return FileResponse(UI_DIR / name, media_type=UI_FILES[name], headers=UI_HEADERS)

    @app.get("/v2/watermark", dependencies=[Depends(auth)])
    def get_watermark(platform: str = Query(pattern=PLATFORM_ID)) -> dict:
        return {"platform": platform, "watermark": store.watermark(platform)}

    return app


def create_app_from_env() -> FastAPI:
    return create_app(os.environ.get("IDEA_TOKEN", ""), os.environ.get("IDEA_DB", "./ledger.db"))
