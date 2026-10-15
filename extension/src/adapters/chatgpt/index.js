// ChatGPT adapter 進入點：平台描述 + 固定介面。
import descriptor from "./platform.json" with { type: "json" };

export { descriptor };
export { checkLogin, listUpdated, getConversation } from "./fetch.js";
