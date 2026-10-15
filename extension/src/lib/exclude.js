// 專案黑名單（設計文件 v2 第 9 節）。平台無關：只比對對話的 project 字串（專案名稱或 ID）。

const norm = (s) => String(s).trim().toLowerCase();

/** 設定頁的多行文字 → 黑名單陣列（去空白、去重複、略過空行） */
export function parseBlacklist(text) {
  const seen = new Set();
  const out = [];
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const v = line.trim();
    if (v && !seen.has(norm(v))) {
      seen.add(norm(v));
      out.push(v);
    }
  }
  return out;
}

/** project 是否在黑名單（不分大小寫、前後空白不計）；沒有專案的對話不會被排除 */
export function isExcludedProject(project, blacklist = []) {
  if (project == null || String(project).trim() === "") return false;
  const p = norm(project);
  return blacklist.some((b) => norm(b) === p);
}
