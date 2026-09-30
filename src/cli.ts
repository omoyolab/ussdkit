#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";

import { UssdkitError } from "./errors.js";
import { runTerminal, type PhoneLoop } from "./simulate.js";
import type { UssdResponse } from "./types.js";
import { version } from "./version.js";

const HELP = `ussdkit ${version} — build and test USSD apps

Usage
  ussdkit dial <url> [options]     Open a terminal phone against a running USSD endpoint

Options
  --phone <number>      Caller's number. Default +2348012345678
  --code <code>         Service code to dial. Default *384#
  --session <id>        Session id. Default random
  --network <code>      Network code sent as networkCode. Default 99999
  --timeout <ms>        Request timeout. Default 10000
  -h, --help            Show this help
  -v, --version         Show the version

The endpoint is spoken to in Africa's Talking's format (form-encoded sessionId,
serviceCode, phoneNumber, text; response "CON …" or "END …"), so it works against
any USSD server built for that gateway, not only ussdkit apps.

Example
  ussdkit dial http://localhost:3000/ussd --code "*384*1234#"
`;

interface Io {
  out: (line: string) => void;
  err: (line: string) => void;
  stdin: NodeJS.ReadableStream;
  stdout: NodeJS.WritableStream;
}

function parse(argv: string[]) {
  return parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      phone: { type: "string" },
      code: { type: "string" },
      session: { type: "string" },
      network: { type: "string" },
      timeout: { type: "string" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });
}

/** Builds a PhoneLoop that talks Africa's Talking's wire format to `url`. */
export function remotePhone(
  url: string,
  options: {
    phone: string;
    serviceCode: string;
    sessionId: string;
    network: string;
    timeoutMs: number;
  },
): PhoneLoop {
  const inputs: string[] = [];

  async function post(): Promise<UssdResponse> {
    const body = new URLSearchParams({
      sessionId: options.sessionId,
      serviceCode: options.serviceCode,
      phoneNumber: options.phone,
      networkCode: options.network,
      text: inputs.join("*"),
    });
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: AbortSignal.timeout(options.timeoutMs),
      });
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error));
      if (cause.name === "TimeoutError") {
        throw new UssdkitError(`No response from ${url} within ${options.timeoutMs}ms`);
      }
      throw new UssdkitError(`Could not connect to ${url}`, "Is your USSD server running?");
    }
    const text = await response.text();
    if (!response.ok) {
      throw new UssdkitError(`${url} answered HTTP ${response.status}`, text.slice(0, 200));
    }
    const match = /^(CON|END)\s?([\s\S]*)$/.exec(text);
    if (!match) {
      throw new UssdkitError(
        `Response does not start with CON or END`,
        `Got: ${text.slice(0, 80)}`,
      );
    }
    return { text: match[2] ?? "", end: match[1] === "END" };
  }

  return {
    start: post,
    send(input) {
      inputs.push(input);
      return post();
    },
  };
}

export async function run(argv: string[], io: Io): Promise<number> {
  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(argv);
  } catch (error) {
    io.err(`ussdkit: ${error instanceof Error ? error.message : String(error)}`);
    io.err('Run "ussdkit --help" for usage.');
    return 2;
  }
  const { values, positionals } = parsed;
  if (values.version) {
    io.out(version);
    return 0;
  }
  const [command = "help", url] = positionals;
  if (values.help || command === "help") {
    io.out(HELP);
    return 0;
  }
  if (command !== "dial") {
    io.err(`ussdkit: unknown command "${command}"`);
    io.err('Run "ussdkit --help" for usage.');
    return 2;
  }
  if (!url) {
    io.err("ussdkit: dial needs a URL");
    io.err("Example: ussdkit dial http://localhost:3000/ussd");
    return 2;
  }
  const timeoutMs = Number(values.timeout ?? 10_000);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    io.err(`ussdkit: --timeout must be a positive number`);
    return 2;
  }

  const phone = values.phone ?? "+2348012345678";
  const serviceCode = values.code ?? "*384#";
  try {
    const loop = remotePhone(url, {
      phone,
      serviceCode,
      sessionId: values.session ?? randomUUID(),
      network: values.network ?? "99999",
      timeoutMs,
    });
    await runTerminal(loop, {
      input: io.stdin,
      output: io.stdout,
      phone,
      serviceCode,
      banner: `ussdkit dial → ${url}`,
    });
    return 0;
  } catch (error) {
    if (error instanceof UssdkitError) {
      io.err(`ussdkit: ${error.message}`);
      if (error.hint) io.err(`  ${error.hint}`);
      return 1;
    }
    throw error;
  }
}

run(process.argv.slice(2), {
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(`${line}\n`),
  stdin: process.stdin,
  stdout: process.stdout,
}).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(
      `ussdkit: unexpected error\n${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exitCode = 2;
  },
);
