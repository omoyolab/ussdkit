/**
 * ussdkit — build USSD apps in Node.
 *
 * @example
 * import { createApp, menu, prompt, end, createNodeHandler } from "@omoyolab/ussdkit";
 * import { createServer } from "node:http";
 *
 * const app = createApp()
 *   .screen("home", menu("Welcome to PayCo\n1. Send money\n2. Balance", { "1": "amount", "2": "balance" }))
 *   .screen("amount", prompt("Enter amount", (input) => {
 *     const amount = Number(input);
 *     if (!(amount > 0)) return { retry: "Enter a valid amount." };
 *     return { goto: "done", data: { amount } };
 *   }))
 *   .screen("balance", end("Your balance is NGN 12,500"))
 *   .screen("done", end(({ data }) => `Sent NGN ${data.amount}. Thank you.`));
 *
 * createServer(createNodeHandler(app)).listen(3000);
 */

export { createApp } from "./app.js";
export type { App, ResolvedOptions } from "./app.js";
export { menu, prompt, end, lines } from "./screens.js";
export type { MenuOption, MenuOptions } from "./screens.js";
export { MemoryStore } from "./session/memory.js";
export { createRedisStore } from "./session/redis.js";
export type { RedisLikeClient, NodeRedisLikeClient, RedisStoreOptions } from "./session/redis.js";
export { africasTalking, gateways, splitInputs } from "./gateways/index.js";
export type { AfricasTalkingRequest } from "./gateways/index.js";
export { createNodeHandler, readBody } from "./http/node.js";
export type { NodeHandlerOptions } from "./http/node.js";
export { testPhone } from "./testing.js";
export type { TestPhone, TestPhoneOptions } from "./testing.js";
export { simulate, runTerminal } from "./simulate.js";
export type { PhoneLoop, TerminalOptions } from "./simulate.js";
export { paginate } from "./util/paginate.js";
export type { Page, PaginateOptions } from "./util/paginate.js";
export { UssdkitError } from "./errors.js";
export { version } from "./version.js";
export type {
  AppOptions,
  Context,
  Gateway,
  Next,
  Renderer,
  Screen,
  Session,
  SessionStore,
  UssdRequest,
  UssdResponse,
} from "./types.js";
