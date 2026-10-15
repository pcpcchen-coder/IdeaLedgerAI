// 平台開放性：新增平台只需要放一個 adapter 資料夾，不需要改核心程式。
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPlatforms, validateDescriptor, buildManifest, readBaseManifest } from "../build.config.mjs";

function fakeAdaptersDir(descriptors) {
  const dir = mkdtempSync(join(tmpdir(), "adapters-"));
  for (const [folder, d] of Object.entries(descriptors)) {
    mkdirSync(join(dir, folder));
    writeFileSync(join(dir, folder, "platform.json"), typeof d === "string" ? d : JSON.stringify(d));
  }
  return dir;
}

test("新增一個平台資料夾就會被註冊，並自動加入 manifest", () => {
  const dir = fakeAdaptersDir({
    chatgpt: { id: "chatgpt", name: "ChatGPT", hosts: ["chatgpt.com"] },
    gemini: { id: "gemini", name: "Gemini", hosts: ["gemini.google.com"] },
    grok: { id: "grok", name: "Grok", hosts: ["grok.com"] },
  });
  const platforms = loadPlatforms(dir);
  assert.deepEqual(platforms.map((p) => p.id), ["chatgpt", "gemini", "grok"]);
  const m = buildManifest(readBaseManifest(), platforms);
  assert.ok(m.host_permissions.includes("https://gemini.google.com/*"));
  assert.ok(m.content_scripts[0].matches.includes("https://grok.com/*"));
});

test("以 _ 開頭的資料夾視為停用；沒有 platform.json 的資料夾略過", () => {
  const dir = fakeAdaptersDir({ _grok: { id: "_grok", name: "Grok", hosts: ["grok.com"] } });
  mkdirSync(join(dir, "helpers"));
  assert.deepEqual(loadPlatforms(dir), []);
});

test("平台描述有誤時建置失敗，並指出原因", () => {
  const cases = {
    "id 與資料夾不同": { gemini: { id: "bard", name: "Gemini", hosts: ["gemini.google.com"] } },
    "host 含 https": { gemini: { id: "gemini", name: "Gemini", hosts: ["https://gemini.google.com"] } },
    "缺 name": { gemini: { id: "gemini", hosts: ["gemini.google.com"] } },
    "不是 JSON": { gemini: "{ id: gemini" },
    "兩個平台搶同一網域": {
      grok: { id: "grok", name: "Grok", hosts: ["x.com"] },
      xai: { id: "xai", name: "xAI", hosts: ["x.com"] },
    },
  };
  for (const [label, descriptors] of Object.entries(cases)) {
    assert.throws(() => loadPlatforms(fakeAdaptersDir(descriptors)), /平台設定有誤/, label);
  }
});

test("validateDescriptor 接受合法描述", () => {
  assert.deepEqual(validateDescriptor({ id: "grok", name: "Grok", hosts: ["grok.com"] }, "grok"), []);
});
