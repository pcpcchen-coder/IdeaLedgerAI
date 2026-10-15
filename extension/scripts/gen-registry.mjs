// 掃描 src/adapters/*/platform.json，產生 src/adapters/registry.generated.js。
// build 與 test 前會自動執行（npm 的 prebuild、pretest）。
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ADAPTERS_DIR, loadPlatforms } from "../build.config.mjs";

const platforms = loadPlatforms();
const ident = (id) => `p_${id.replace(/-/g, "_")}`;

const lines = [
  "// 自動產生，請勿手動修改。來源：src/adapters/*/platform.json（npm run gen）",
  ...platforms.map((p) => `import * as ${ident(p.id)} from "./${p.id}/index.js";`),
  "",
  `export const ADAPTER_MODULES = [${platforms.map((p) => ident(p.id)).join(", ")}];`,
  "",
];
writeFileSync(join(ADAPTERS_DIR, "registry.generated.js"), lines.join("\n"));
console.log(`已註冊 ${platforms.length} 個平台：${platforms.map((p) => p.id).join(", ") || "（無）"}`);
