// 建置：把 src 打包成 MV3 可載入的 dist/。用法：npm run build
import { build } from "esbuild";
import { copyFile, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ENTRIES, COPIES } from "./build.config.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

// MV3 的 content script 不支援 ES modules，背景服務程式也維持傳統格式，所以一律打包成 IIFE。
for (const [src, out] of Object.entries(ENTRIES)) {
  await build({
    entryPoints: [join(root, src)],
    outfile: join(dist, out),
    bundle: true,
    format: "iife",
    target: "chrome120",
    logLevel: "warning",
  });
}

for (const [src, out] of Object.entries(COPIES)) {
  await copyFile(join(root, src), join(dist, out));
}

console.log(`建置完成：${dist}`);
