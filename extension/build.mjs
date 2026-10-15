// 建置：把 src 打包成 MV3 可載入的 dist/。用法：npm run build（會先執行 npm run gen）
import { build } from "esbuild";
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ROOT, ENTRIES, COPIES, loadPlatforms, buildManifest, readBaseManifest } from "./build.config.mjs";

const dist = join(ROOT, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

// MV3 的 content script 不支援 ES modules，背景服務程式也維持傳統格式，所以一律打包成 IIFE。
for (const [src, out] of Object.entries(ENTRIES)) {
  await build({
    entryPoints: [join(ROOT, src)],
    outfile: join(dist, out),
    bundle: true,
    format: "iife",
    target: "chrome120",
    logLevel: "warning",
  });
}

for (const [src, out] of Object.entries(COPIES)) {
  await copyFile(join(ROOT, src), join(dist, out));
}

const platforms = loadPlatforms();
const manifest = buildManifest(readBaseManifest(), platforms);
await writeFile(join(dist, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

console.log(`建置完成：${dist}（平台：${platforms.map((p) => p.name).join("、")}）`);
