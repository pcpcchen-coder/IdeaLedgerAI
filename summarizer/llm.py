"""OpenAI 相容的 /chat/completions 用戶端（LiteLLM Gateway、Ollama 皆可）。只連本機或自架端點。"""
from __future__ import annotations

from typing import Optional

import httpx


class LLMError(Exception):
    pass


class OpenAICompatClient:
    def __init__(self, base_url: str, model: str, api_key: Optional[str] = None, timeout: float = 300.0,
                 transport: Optional[httpx.BaseTransport] = None):
        if not model:
            raise LLMError("未設定 LLM_MODEL")
        self.model = model
        headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        self.http = httpx.Client(base_url=base_url.rstrip("/"), headers=headers, timeout=timeout, transport=transport)

    def complete(self, system: str, user: str) -> str:
        try:
            r = self.http.post("/chat/completions", json={
                "model": self.model,
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
                "temperature": 0.2,
            })
        except httpx.HTTPError as e:
            raise LLMError(f"連不上模型服務：{e}") from e
        if r.status_code != 200:
            raise LLMError(f"模型服務回應 {r.status_code}：{r.text[:300]}")
        try:
            return r.json()["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError, ValueError) as e:
            raise LLMError(f"模型回應格式不符：{r.text[:300]}") from e
