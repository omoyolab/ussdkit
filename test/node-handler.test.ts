import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { createNodeHandler } from "../src/http/node.js";
import { end, menu } from "../src/screens.js";

function app() {
  return createApp({ onWarning: () => {} })
    .screen(
      "home",
      menu("Hi\n1. Bye\n2. Boom", {
        "1": "bye",
        "2": () => {
          throw new Error("kaboom");
        },
      }),
    )
    .screen("bye", end("Bye"));
}

let server: Server | undefined;

async function listen(handler: ReturnType<typeof createNodeHandler>): Promise<string> {
  server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/ussd`;
}

afterEach(async () => {
  if (server) await new Promise<void>((r) => server!.close(() => r()));
  server = undefined;
});

async function post(url: string, body: string, contentType: string) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": contentType }, body });
  return { status: res.status, type: res.headers.get("content-type"), text: await res.text() };
}

describe("createNodeHandler", () => {
  it("handles form-encoded Africa's Talking requests", async () => {
    const url = await listen(createNodeHandler(app()));
    const first = await post(
      url,
      new URLSearchParams({
        sessionId: "s",
        serviceCode: "*1#",
        phoneNumber: "+1",
        text: "",
      }).toString(),
      "application/x-www-form-urlencoded",
    );
    expect(first).toEqual({
      status: 200,
      type: "text/plain; charset=utf-8",
      text: "CON Hi\n1. Bye\n2. Boom",
    });

    const second = await post(
      url,
      new URLSearchParams({
        sessionId: "s",
        serviceCode: "*1#",
        phoneNumber: "+1",
        text: "1",
      }).toString(),
      "application/x-www-form-urlencoded",
    );
    expect(second.text).toBe("END Bye");
  });

  it("accepts JSON bodies too", async () => {
    const url = await listen(createNodeHandler(app()));
    const res = await post(
      url,
      JSON.stringify({ sessionId: "j", serviceCode: "*1#", phoneNumber: "+1", text: "" }),
      "application/json",
    );
    expect(res.text).toMatch(/^CON Hi/);
  });

  it("uses req.body when a framework already parsed it", async () => {
    const handler = createNodeHandler(app());
    server = createServer((req, res) => {
      (req as typeof req & { body: unknown }).body = {
        sessionId: "e",
        serviceCode: "*1#",
        phoneNumber: "+1",
        text: "",
      };
      void handler(req, res);
    });
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/ussd`;
    const res = await post(url, "ignored", "text/plain");
    expect(res.text).toMatch(/^CON Hi/);
  });

  it("turns handler errors into a friendly END and reports them", async () => {
    const onError = vi.fn();
    const url = await listen(createNodeHandler(app(), undefined, { onError, errorText: "Oops." }));
    const res = await post(
      url,
      new URLSearchParams({
        sessionId: "x",
        serviceCode: "*1#",
        phoneNumber: "+1",
        text: "2",
      }).toString(),
      "application/x-www-form-urlencoded",
    );
    expect(res.text).toBe("END Oops.");
    expect(onError).toHaveBeenCalledOnce();
    expect((onError.mock.calls[0]![0] as Error).message).toBe("kaboom");
  });

  it("reports malformed requests without crashing", async () => {
    const url = await listen(createNodeHandler(app(), undefined, { onError: () => {} }));
    const res = await post(url, "garbage", "application/x-www-form-urlencoded");
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/^END Something went wrong/);
  });
});
