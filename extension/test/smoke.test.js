import { test } from "node:test";
import assert from "node:assert/strict";
import { validateNormalized } from "../src/lib/types.js";
import { AdapterFormatError } from "../src/lib/errors.js";
import { getAdapter, ADAPTER_OPS, registeredPlatforms } from "../src/adapters/index.js";
import { handleRpc } from "../src/content/rpc.js";
import { OUTPUTS, buildManifest, readBaseManifest, loadPlatforms } from "../build.config.mjs";

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
    (c) => (c.platform = "Gemini!"),
    (c) => (c.platform = undefined),
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

test("validateNormalized 接受任何格式正確的平台 id（平台是開放的）", () => {
  for (const id of ["gemini", "grok", "my-platform2"]) {
    const c = valid();
    c.platform = id;
    assert.equal(validateNormalized(c).platform, id);
  }
});

test("getAdapter 依網域回傳 adapter", () => {
  assert.equal(getAdapter("chatgpt.com").platform, "chatgpt");
  assert.equal(getAdapter("claude.ai").name, "Claude");
  assert.equal(getAdapter("example.com"), null);
});

test("每個已註冊平台都實作固定介面，且與 platform.json 一致", () => {
  const onDisk = loadPlatforms();
  const registered = registeredPlatforms();
  assert.deepEqual(registered.map((d) => d.id).sort(), onDisk.map((d) => d.id));
  for (const d of registered) {
    for (const host of d.hosts) {
      const a = getAdapter(host);
      assert.equal(a.platform, d.id);
      for (const op of ADAPTER_OPS) assert.equal(typeof a.impl[op], "function", `${d.id} 缺少 ${op}`);
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

test("manifest 引用的檔案都會由建置產出，且涵蓋所有平台網域", () => {
  const platforms = loadPlatforms();
  const manifest = buildManifest(readBaseManifest(), platforms);
  for (const p of platforms) {
    for (const h of p.hosts) {
      assert.ok(manifest.host_permissions.includes(`https://${h}/*`), `host_permissions 缺少 ${h}`);
      assert.ok(manifest.content_scripts[0].matches.includes(`https://${h}/*`), `content_scripts 缺少 ${h}`);
    }
  }
  assert.ok(manifest.host_permissions.includes("http://127.0.0.1:8787/*"));
  const referenced = [
    manifest.background.service_worker,
    manifest.options_page,
    ...manifest.content_scripts.flatMap((c) => c.js),
  ];
  for (const f of referenced) assert.ok(OUTPUTS.includes(f), `建置不會產出 ${f}`);
  assert.ok(OUTPUTS.includes("manifest.json"));
});
