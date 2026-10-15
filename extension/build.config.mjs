// 建置設定：打包入口與直接複製的檔案。build.mjs 與測試共用，確保 manifest 引用的檔案都會產出。

/** esbuild 入口：來源 → dist 內的輸出檔名 */
export const ENTRIES = {
  "src/bg/index.js": "bg.js",
  "src/content/sweeper.js": "content.js",
  "src/options/options.js": "options.js",
};

/** 原樣複製到 dist 的檔案：來源 → dist 內的檔名 */
export const COPIES = {
  "manifest.json": "manifest.json",
  "src/options/options.html": "options.html",
};

/** dist 內會產出的所有檔名 */
export const OUTPUTS = [...Object.values(ENTRIES), ...Object.values(COPIES)];
