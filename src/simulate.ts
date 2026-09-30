import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";

import type { App } from "./app.js";
import type { UssdResponse } from "./types.js";

export interface PhoneLoop {
  /** Sends the first, empty request. */
  start(): Promise<UssdResponse>;
  /** Sends one input. */
  send(input: string): Promise<UssdResponse>;
}

export interface TerminalOptions {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  phone?: string;
  serviceCode?: string;
  /** Header line printed before the first screen. */
  banner?: string;
}

function frame(text: string): string {
  const lines = text.split("\n");
  const width = Math.max(20, ...lines.map((l) => l.length));
  const top = `┌${"─".repeat(width + 2)}┐`;
  const bottom = `└${"─".repeat(width + 2)}┘`;
  const body = lines.map((l) => `│ ${l.padEnd(width)} │`).join("\n");
  return `${top}\n${body}\n${bottom}`;
}

/**
 * Reads lines from a stream one at a time. Lines that arrive before they are asked for
 * are queued, so piped input (`printf '1\n2\n' | ussdkit dial …`) works as well as a
 * person typing.
 */
function lineReader(input: NodeJS.ReadableStream): {
  next: () => Promise<string | null>;
  close: () => void;
} {
  const rl = createInterface({ input, terminal: false });
  const queue: string[] = [];
  const waiting: Array<(line: string | null) => void> = [];
  let closed = false;

  rl.on("line", (line) => {
    const waiter = waiting.shift();
    if (waiter) waiter(line);
    else queue.push(line);
  });
  rl.on("close", () => {
    closed = true;
    for (const waiter of waiting.splice(0)) waiter(null);
  });

  return {
    next() {
      const queued = queue.shift();
      if (queued !== undefined) return Promise.resolve(queued);
      if (closed) return Promise.resolve(null);
      return new Promise((resolve) => waiting.push(resolve));
    },
    close: () => rl.close(),
  };
}

/**
 * Runs an interactive phone in the terminal against any `PhoneLoop`.
 * Used by `simulate()` for local apps and by the `ussdkit dial` command for remote ones.
 */
export async function runTerminal(loop: PhoneLoop, options: TerminalOptions = {}): Promise<void> {
  const output = options.output ?? process.stdout;
  const reader = lineReader(options.input ?? process.stdin);
  const write = (s: string): void => {
    output.write(`${s}\n`);
  };

  if (options.banner) write(options.banner);
  write(`Dialling ${options.serviceCode ?? "*384#"} from ${options.phone ?? "+2348012345678"}…\n`);

  try {
    let response = await loop.start();
    write(frame(response.text));
    while (!response.end) {
      output.write("> ");
      const input = await reader.next();
      if (input === null) {
        write("\nInput closed before the session ended.");
        return;
      }
      response = await loop.send(input.trim());
      write("");
      write(frame(response.text));
    }
    write("\nSession ended.");
  } finally {
    reader.close();
  }
}

/**
 * Interactive terminal phone for a local app. Handy at the bottom of your app file:
 *
 * @example
 * if (process.argv.includes("--simulate")) await simulate(app);
 */
export async function simulate(app: App, options: TerminalOptions = {}): Promise<void> {
  const phone = options.phone ?? "+2348012345678";
  const serviceCode = options.serviceCode ?? "*384#";
  const sessionId = randomUUID();
  const inputs: string[] = [];

  const loop: PhoneLoop = {
    start: () => app.handle({ sessionId, phone, serviceCode, input: "", inputs: [] }),
    send(input) {
      inputs.push(input);
      return app.handle({ sessionId, phone, serviceCode, input, inputs: [...inputs] });
    },
  };

  await runTerminal(loop, {
    ...options,
    phone,
    serviceCode,
    banner: options.banner ?? "ussdkit simulator (local app)",
  });
}
