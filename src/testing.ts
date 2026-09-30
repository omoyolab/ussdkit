import { randomUUID } from "node:crypto";

import type { App } from "./app.js";
import type { UssdResponse } from "./types.js";

export interface TestPhoneOptions {
  phone?: string;
  serviceCode?: string;
  network?: string;
  sessionId?: string;
  /**
   * Mimic a gateway that resends every input on each request, like Africa's Talking.
   * Default true. Set false to send only the latest input.
   */
  replay?: boolean;
}

export interface TestPhone {
  /** Text currently on the screen. */
  readonly screen: string;
  /** True once an end screen has been shown. */
  readonly ended: boolean;
  readonly sessionId: string;
  /** Every input sent so far. */
  readonly inputs: readonly string[];
  /** Starts a session and returns the first screen. */
  dial(): Promise<string>;
  /** Sends one input and returns the next screen. */
  send(input: string): Promise<string>;
  /** Sends several inputs in a row and returns the final screen. */
  type(...inputs: string[]): Promise<string>;
}

/**
 * A fake phone for tests. Drives the app directly, no HTTP.
 *
 * @example
 * const phone = testPhone(app);
 * await phone.dial();
 * await phone.send("1");
 * expect(phone.screen).toContain("Enter amount");
 */
export function testPhone(app: App, options: TestPhoneOptions = {}): TestPhone {
  const phone = options.phone ?? "+2348012345678";
  const serviceCode = options.serviceCode ?? "*384#";
  const replay = options.replay ?? true;
  let sessionId = options.sessionId ?? randomUUID();
  const inputs: string[] = [];
  let screen = "";
  let ended = false;

  async function request(input: string): Promise<string> {
    const response: UssdResponse = await app.handle({
      sessionId,
      phone,
      serviceCode,
      network: options.network,
      input,
      inputs: replay ? [...inputs] : undefined,
    });
    screen = response.text;
    ended = response.end;
    return screen;
  }

  const api: TestPhone = {
    get screen() {
      return screen;
    },
    get ended() {
      return ended;
    },
    get sessionId() {
      return sessionId;
    },
    get inputs() {
      return inputs;
    },
    async dial() {
      if (ended || inputs.length > 0) {
        // A new dial is a new gateway session.
        sessionId = randomUUID();
        inputs.length = 0;
        ended = false;
      }
      return request("");
    },
    async send(input) {
      if (ended) {
        throw new Error(`Session already ended with: ${screen}`);
      }
      inputs.push(input);
      return request(input);
    },
    async type(...many) {
      let last = screen;
      for (const input of many) last = await api.send(input);
      return last;
    },
  };
  return api;
}
