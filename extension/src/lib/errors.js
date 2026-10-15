// 巡檢流程共用的錯誤類型。巡檢核心依類型決定平台燈號（見設計文件 v2 第 7 節）。

/** 平台回應格式不符預期 → 「介面失效」紅燈 */
export class AdapterFormatError extends Error {
  constructor(message) {
    super(message);
    this.name = "AdapterFormatError";
  }
}

/** 未登入或登入過期 → 「需重新登入」紅燈 */
export class NeedsLogin extends Error {
  constructor(message = "需要重新登入") {
    super(message);
    this.name = "NeedsLogin";
  }
}

/** 被平台限流或拒絕（429／403）→ 「退避中」黃燈 */
export class RateLimited extends Error {
  constructor(message = "被平台限流") {
    super(message);
    this.name = "RateLimited";
  }
}

/** collector 連不上（網路錯誤、逾時、5xx）→ 中止本輪，不前移水位線 */
export class CollectorOffline extends Error {
  constructor(message = "collector 連不上") {
    super(message);
    this.name = "CollectorOffline";
  }
}

/** collector 拒絕（token 錯誤或格式不符）→ 需要修設定或程式 */
export class CollectorRejected extends Error {
  constructor(message) {
    super(message);
    this.name = "CollectorRejected";
  }
}

const BY_NAME = { AdapterFormatError, NeedsLogin, RateLimited, CollectorOffline, CollectorRejected };

/** 把跨訊息傳遞後的 { name, message } 還原成對應的錯誤類型 */
export function reviveError({ name, message } = {}) {
  const Cls = BY_NAME[name];
  if (Cls) return new Cls(message);
  const e = new Error(message ?? "未知錯誤");
  e.name = name ?? "Error";
  return e;
}
