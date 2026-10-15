import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateNormalized } from "../src/lib/types.js";
import { AdapterFormatError } from "../src/lib/errors.js";
import { getAdapter, ADAPTER_OPS, registeredPlatforms } from "../src/adapters/index.js";
import { handleRpc } from "../src/content/rpc.js";
import { OUTPUTS } from "../build.config.mjs";

const valid = () => ({
  platform: "chatgpt",
  conv_id: "abc",
  title: "測試",
  url: "https://chatgpt.com/c/abc",
  project: null,
  created_at: "2026-10-15T01:12:00Z",
  updated_at: "2026-10-15T02:40:00.123Z",
  messages: [
    { role: "user", text: "你好", at: "2026-10-15T01:12:00Z" },
    { role: "assistant", text: "嗨", at: null },
  ],
});

test("validateNormalized 接受合法對話", () => {
  assert.equal(validateNormalized(valid()).conv_id, "abc");
});

test("validateNormalized 擋下不合法欄位", () => {
  const cases = [
    (c) => (c.platform = "gemini"),
    (c) => (c.conv_id = ""),
    (c) => (c.project = 1),
    (c) => (c.updated_at = "2026-10-15 02:40:00"),
    (c) => (c.created_at = 1760490000),
    (c) => (c.messages = "x"),
    (c) => (c.messages[0].role = "system"),
    (c) => (c.messages[1].text = null),
    (c) => (c.messages[1].at = "昨天"),
  ];
  for (const mutate of cases) {
    const c = valid();
    mutate(c);
    assert.throws(() => validateNormalized(c), AdapterFormatError);
  }
});

test("getAdapter 依網域回傳 adapter，且都實作固定介面", () => {
  assert.equal(getAdapter("chatgpt.com").platform, "chatgpt");
  assert.equal(getAdapter("claude.ai").platform, "claude");
  assert.equal(getAdapter("example.com"), null);
  for (const { host } of registeredPlatforms()) {
    for (const op of ADAPTER_OPS) {
      assert.equal(typeof getAdapter(host).impl[op], "function", `${host} 缺少 ${op}`);
    }
  }
});

test("handleRpc 轉發結果與錯誤", async () => {
  const adapter = {
    platform: "chatgpt",
    impl: {
      checkLogin: async () => ({ ok: true }),
      listUpdated: async (cursor) => ({ items: [], next: cursor }),
      getConversation: async () => {
        throw new AdapterFormatError("壞掉了");
      },
    },
  };
  assert.deepEqual(await handleRpc(adapter, { op: "checkLogin" }), { ok: true, result: { ok: true } });
  assert.deepEqual(await handleRpc(adapter, { op: "listUpdated", args: ["p2"] }), {
    ok: true,
    result: { items: [], next: "p2" },
  });
  assert.deepEqual(await handleRpc(adapter, { op: "getConversation", args: ["x"] }), {
    ok: false,
    error: { name: "AdapterFormatError", message: "壞掉了" },
  });
  assert.equal((await handleRpc(adapter, { op: "deleteEverything" })).error.name, "UnknownOp");
  assert.equal((await handleRpc(adapter, { op: "checkLogin", platform: "claude" })).error.name, "PlatformMismatch");
  assert.equal((await handleRpc(null, { op: "checkLogin" })).error.name, "NoAdapter");
});

test("manifest 引用的檔案都會由建置產出", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf-8"));
  const referenced = [
    manifest.background.service_worker,
    manifest.options_page,
    ...manifest.content_scripts.flatMap((c) => c.js),
  ];
  for (const f of referenced) assert.ok(OUTPUTS.includes(f), `建置不會產出 ${f}`);
  assert.ok(OUTPUTS.includes("manifest.json"));
});
