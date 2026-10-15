"""Collector v2 的資料模型（設計文件 v2.1 第 4.1 節）。

平台是開放的：platform 只檢查 id 格式，不維護清單。
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

PLATFORM_ID = r"^[a-z][a-z0-9-]{1,31}$"


def to_iso_utc(dt: datetime) -> str:
    """統一成固定寬度的 ISO 8601 UTC（毫秒），字串比較即可判斷先後。"""
    u = dt.astimezone(timezone.utc)
    return u.strftime("%Y-%m-%dT%H:%M:%S.") + f"{u.microsecond // 1000:03d}Z"


def _require_tz(v: Optional[datetime]) -> Optional[datetime]:
    if v is not None and v.tzinfo is None:
        raise ValueError("時間必須帶時區（例如結尾的 Z）")
    return v


class Message(BaseModel):
    role: Literal["user", "assistant"]
    text: str
    at: Optional[datetime] = None

    _tz = field_validator("at")(_require_tz)


class ConversationIn(BaseModel):
    platform: str = Field(pattern=PLATFORM_ID)
    platform_name: Optional[str] = Field(default=None, max_length=64)
    capture: Literal["api", "page"] = "api"
    conv_id: str = Field(min_length=1, max_length=256)
    title: str = ""
    url: str
    project: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    messages: list[Message] = []
    page_text: Optional[str] = None
    swept_at: Optional[datetime] = None
    sweeper: Optional[str] = Field(default=None, max_length=64)

    _tz = field_validator("created_at", "updated_at", "swept_at")(_require_tz)

    @model_validator(mode="after")
    def _check_capture(self) -> "ConversationIn":
        if self.capture == "api" and not self.messages:
            raise ValueError("capture=api 時 messages 至少要有一則")
        if self.capture == "page" and not (self.page_text and self.page_text.strip()):
            raise ValueError("capture=page 時必須提供 page_text")
        return self

    def is_nolog(self) -> bool:
        """第一則使用者訊息含 #nolog（頁面擷取則看整頁文字）→ 不落地。"""
        if self.capture == "page":
            return "#nolog" in (self.page_text or "")
        first_user = next((m for m in self.messages if m.role == "user"), None)
        return first_user is not None and "#nolog" in first_user.text


SweepStatus = Literal["ok", "rate_limited", "needs_login", "format_error", "error"]


class SweepRunIn(BaseModel):
    platform: str = Field(pattern=PLATFORM_ID)
    started_at: datetime
    finished_at: datetime
    status: SweepStatus
    listed: int = Field(ge=0)
    fetched: int = Field(ge=0)
    error: Optional[str] = Field(default=None, max_length=2000)
    sweeper: Optional[str] = Field(default=None, max_length=64)

    _tz = field_validator("started_at", "finished_at")(_require_tz)
