// 建置設定與平台掃描。build.mjs、scripts/gen-registry.mjs 與測試共用。
//
// 平台是開放的：src/adapters/ 底下每個含 platform.json 的資料夾就是一個平台。
// 新增平台不需要改這個檔、manifest 或任何核心程式（見 docs/ADDING_A_PLATFORM.md）。
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = dirname(fileURLToPath(import.meta.url));
export const ADAPTERS_DIR = join(ROOT, "src", "adapters");

/** esbuild 入口：來源 → dist 內的輸出檔名 */
export const ENTRIES = {
  "src/bg/index.js": "bg.js",
  "src/content/sweeper.js": "content.js",
  "src/options/options.js": "options.js",
};

/** 原樣複製到 dist 的檔案：來源 → dist 內的檔名 */
export const COPIES = {
  "src/options/options.html": "options.html",
};

/** dist 內會產出的所有檔名（manifest.json 由 buildManifest 產生） */
export const OUTPUTS = [...Object.values(ENTRIES), ...Object.values(COPIES), "manifest.json"];

export const PLATFORM_ID = /^[a-z][a-z0-9-]{1,31}$/;
const HOSTNAME = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;

/**
 * 檢查一份平台描述；回傳錯誤訊息陣列（空陣列代表合法）。
 * @param {any} d platform.json 內容
 * @param {string} folder 所在資料夾名稱
 */
export function validateDescriptor(d, folder) {
  const errors = [];
  if (!d || typeof d !== "object") return [`${folder}: platform.json 必須是物件`];
  if (!PLATFORM_ID.test(d.id ?? "")) errors.push(`${folder}: id 必須符合 ${PLATFORM_ID}`);
  if (d.id !== folder) errors.push(`${folder}: id（${d.id}）必須與資料夾名稱相同`);
  if (typeof d.name !== "string" || !d.name.trim()) errors.push(`${folder}: name 必須是非空字串`);
  if (!Array.isArray(d.hosts) || d.hosts.length === 0) {
    errors.push(`${folder}: hosts 必須是非空陣列`);
  } else {
    for (const h of d.hosts) {
      if (typeof h !== "string" || !HOSTNAME.test(h)) errors.push(`${folder}: host「${h}」必須是不含 https:// 與路徑的網域`);
    }
  }
  return errors;
}

/**
 * 掃描 src/adapters/*\/platform.json。以 _ 開頭的資料夾視為停用。
 * @returns {Array<{ id: string, name: string, hosts: string[] }>}
 */
export function loadPlatforms(dir = ADAPTERS_DIR) {
  const platforms = [];
  const errors = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
    const file = join(dir, entry.name, "platform.json");
    if (!existsSync(file)) continue;
    let d;
    try {
      d = JSON.parse(readFileSync(file, "utf-8"));
    } catch (e) {
      errors.push(`${entry.name}: platform.json 不是合法 JSON（${e.message}）`);
      continue;
    }
    errors.push(...validateDescriptor(d, entry.name));
    platforms.push(d);
  }
  const seen = new Map();
  for (const p of platforms) {
    for (const h of p.hosts ?? []) {
      if (seen.has(h)) errors.push(`host「${h}」同時出現在 ${seen.get(h)} 與 ${p.id}`);
      seen.set(h, p.id);
    }
  }
  if (errors.length) throw new Error(`平台設定有誤：\n- ${errors.join("\n- ")}`);
  return platforms.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * 由 manifest.base.json 與平台清單產生最終 manifest：
 * 每個平台的網域加入 host_permissions，並注入 content.js。
 */
export function buildManifest(base, platforms) {
  const m = structuredClone(base);
  const matches = platforms.flatMap((p) => p.hosts.map((h) => `https://${h}/*`));
  m.host_permissions = [...new Set([...(m.host_permissions ?? []), ...matches])];
  m.content_scripts = matches.length
    ? [{ matches, js: [ENTRIES["src/content/sweeper.js"]], run_at: "document_idle" }]
    : [];
  return m;
}

export function readBaseManifest() {
  return JSON.parse(readFileSync(join(ROOT, "manifest.base.json"), "utf-8"));
}
