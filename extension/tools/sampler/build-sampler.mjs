// 組出可直接貼進瀏覽器主控台的採樣腳本：tools/sampler/out/<平台>.console.js（提交進 repo，可直接從 GitHub 複製）
// 用法：npm run sampler
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out");
mkdirSync(out, { recursive: true });

export function assemble(platformFile) {
  const core = readFileSync(join(here, "sampler-core.js"), "utf-8");
  const platform = readFileSync(join(here, platformFile), "utf-8");
  return `// Idea Ledger 介面採樣腳本。在已登入的 ${platformFile.replace("sampler-", "").replace(".js", "")} 網頁按 F12 → Console，整段貼上後按 Enter。
// 只發 GET 請求；下載前已在你的瀏覽器內遮蔽非測試對話標題、token、email。
(async () => {
${core}
${platform}
try {
  const result = await IdeaLedgerSamplerCore.run(IdeaLedgerSamplerPlatform, IdeaLedgerSamplerCore.browserEnv());
  console.log("完成，已下載檔案。各請求狀態：", result.requests.map((r) => r.status + " " + r.name).join("、"));
} catch (e) {
  console.error("採樣失敗：", e.message);
}
})();
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const f of ["sampler-chatgpt.js", "sampler-claude.js"]) {
    const name = f.replace("sampler-", "").replace(".js", "");
    writeFileSync(join(out, `${name}.console.js`), assemble(f));
    console.log(`已產生 tools/sampler/out/${name}.console.js`);
  }
}
