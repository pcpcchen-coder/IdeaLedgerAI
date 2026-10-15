"""Collector v2 路由。只綁 127.0.0.1，所有端點需 Bearer Token。"""
from __future__ import annotations

import os
import secrets
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.responses import JSONResponse

from .db import Store
from .models import PLATFORM_ID, ConversationIn, SweepRunIn

MAX_BODY_BYTES = 10 * 1024 * 1024


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

    @app.get("/v2/watermark", dependencies=[Depends(auth)])
    def get_watermark(platform: str = Query(pattern=PLATFORM_ID)) -> dict:
        return {"platform": platform, "watermark": store.watermark(platform)}

    return app


def create_app_from_env() -> FastAPI:
    return create_app(os.environ.get("IDEA_TOKEN", ""), os.environ.get("IDEA_DB", "./ledger.db"))
