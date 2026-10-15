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
