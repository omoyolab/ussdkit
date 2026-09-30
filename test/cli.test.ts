import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { createNodeHandler } from "../src/http/node.js";
import { menu, prompt } from "../src/screens.js";

const cli = resolve(__dirname, "../dist/cli.js");

interface Run {
  code: number;
  stdout: string;
  stderr: string;
}

function ussdkit(args: string[], stdin = ""): Promise<Run> {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [cli, ...args], {
      env: { ...process.env, NO_COLOR: "1" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("close", (code) => resolvePromise({ code: code ?? 1, stdout, stderr }));
    child.stdin.end(stdin);
  });
}

let server: Server | undefined;

async function startApp(): Promise<string> {
  const app = createApp({ onWarning: () => {} })
    .screen("home", menu("Welcome\n1. Name", { "1": "name" }))
    .screen(
      "name",
      prompt("Your name?", (input) => ({ end: `Hello ${input}!` })),
    );
  const handler = createNodeHandler(app);
  server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/ussd`;
}

beforeAll(() => {
  if (!existsSync(cli)) throw new Error(`${cli} is missing. Run "pnpm build" before "pnpm test".`);
});

afterEach(async () => {
  if (server) await new Promise<void>((r) => server!.close(() => r()));
  server = undefined;
});

describe("ussdkit cli", () => {
  it("prints version and help", async () => {
    expect((await ussdkit(["--version"])).stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
    const help = await ussdkit(["--help"]);
    expect(help.code).toBe(0);
    expect(help.stdout).toContain("ussdkit dial <url>");
    expect((await ussdkit([])).stdout).toContain("Usage");
  });

  it("fails usage errors with exit 2", async () => {
    expect((await ussdkit(["explode"])).code).toBe(2);
    expect((await ussdkit(["dial"])).code).toBe(2);
    expect((await ussdkit(["dial", "http://x", "--bogus"])).code).toBe(2);
  });

  it("dials a running server and walks the menu from stdin", async () => {
    const url = await startApp();
    const run = await ussdkit(["dial", url, "--code", "*111#"], "1\nAda\n");
    expect(run.code).toBe(0);
    expect(run.stdout).toContain("Dialling *111#");
    expect(run.stdout).toContain("│ Welcome");
    expect(run.stdout).toContain("│ Your name?");
    expect(run.stdout).toContain("│ Hello Ada!");
    expect(run.stdout).toContain("Session ended.");
  });

  it("explains connection failures with exit 1", async () => {
    const run = await ussdkit(["dial", "http://127.0.0.1:1/ussd"]);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("Could not connect");
  });
});
