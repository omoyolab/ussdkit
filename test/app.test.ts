import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { UssdkitError } from "../src/errors.js";
import { end, menu, prompt } from "../src/screens.js";
import { MemoryStore } from "../src/session/memory.js";
import { testPhone } from "../src/testing.js";
import type { AppOptions } from "../src/types.js";

function payApp(options: AppOptions = {}) {
  return createApp({ onWarning: () => {}, ...options })
    .screen(
      "home",
      menu("Welcome\n1. Send\n2. Balance\n3. Async", {
        "1": "amount",
        "2": "balance",
        "3": "async",
      }),
    )
    .screen(
      "amount",
      prompt("Enter amount", (input) => {
        const amount = Number(input);
        if (!(amount > 0)) return { retry: "Enter a valid amount." };
        return { goto: "confirm", data: { amount } };
      }),
    )
    .screen(
      "confirm",
      menu(({ data }) => `Send NGN ${String(data.amount)}?\n1. Yes\n2. No`, {
        "1": () => ({ end: "Sent. Thank you." }),
        "2": () => ({ home: true }),
      }),
    )
    .screen("balance", end("Balance: NGN 500"))
    .screen("async", {
      render: async () => {
        await new Promise((r) => setTimeout(r, 1));
        return "Loaded\n1. Back";
      },
      handle: () => ({ back: true }),
    });
}

describe("createApp", () => {
  it("renders the home screen on the first request", async () => {
    const phone = testPhone(payApp());
    expect(await phone.dial()).toBe("Welcome\n1. Send\n2. Balance\n3. Async");
    expect(phone.ended).toBe(false);
  });

  it("walks a full flow with data carried between screens", async () => {
    const phone = testPhone(payApp());
    await phone.dial();
    expect(await phone.send("1")).toBe("Enter amount");
    expect(await phone.send("2500")).toBe("Send NGN 2500?\n1. Yes\n2. No");
    expect(await phone.send("1")).toBe("Sent. Thank you.");
    expect(phone.ended).toBe(true);
  });

  it("re-renders with a message on retry", async () => {
    const phone = testPhone(payApp());
    await phone.dial();
    expect(await phone.send("7")).toBe("Invalid choice.\nWelcome\n1. Send\n2. Balance\n3. Async");
    await phone.send("1");
    expect(await phone.send("abc")).toBe("Enter a valid amount.\nEnter amount");
    expect(phone.ended).toBe(false);
  });

  it("ends the session on an end screen", async () => {
    const phone = testPhone(payApp());
    await phone.dial();
    expect(await phone.send("2")).toBe("Balance: NGN 500");
    expect(phone.ended).toBe(true);
    await expect(phone.send("1")).rejects.toThrow(/already ended/);
  });

  it("supports back and home keys", async () => {
    const phone = testPhone(payApp());
    await phone.dial();
    await phone.type("1", "100");
    expect(phone.screen).toMatch(/^Send NGN 100/);
    expect(await phone.send("0")).toBe("Enter amount");
    expect(await phone.send("00")).toMatch(/^Welcome/);
  });

  it("treats the back key as ordinary input when there is nothing to go back to", async () => {
    const phone = testPhone(payApp());
    await phone.dial();
    expect(await phone.send("0")).toMatch(/^Invalid choice/);
  });

  it("honors handler-driven back and home", async () => {
    const phone = testPhone(payApp());
    await phone.dial();
    await phone.send("3");
    expect(phone.screen).toBe("Loaded\n1. Back");
    expect(await phone.send("1")).toMatch(/^Welcome/);
    await phone.type("1", "50", "2");
    expect(phone.screen).toMatch(/^Welcome/);
  });

  it("disables back and home keys when told to", async () => {
    const phone = testPhone(payApp({ backKey: false, homeKey: false }));
    await phone.dial();
    await phone.send("1");
    expect(await phone.send("0")).toBe("Enter a valid amount.\nEnter amount");
    expect(await phone.send("00")).toBe("Enter a valid amount.\nEnter amount");
  });

  it("rebuilds a lost session from the gateway's replayed inputs", async () => {
    const store = new MemoryStore();
    const phone = testPhone(payApp({ store }));
    await phone.dial();
    await phone.send("1");
    await store.delete(phone.sessionId); // simulate a restart or an expired session
    expect(await phone.send("300")).toBe("Send NGN 300?\n1. Yes\n2. No");
  });

  it("starts over when a session is lost and the gateway does not replay", async () => {
    const store = new MemoryStore();
    const phone = testPhone(payApp({ store }), { replay: false });
    await phone.dial();
    await phone.send("1");
    await store.delete(phone.sessionId);
    // "300" is now treated as a first input on a fresh home screen
    expect(await phone.send("300")).toMatch(/^Invalid choice/);
  });

  it("expires sessions after the ttl", async () => {
    let now = 1_000_000;
    const store = new MemoryStore(() => now);
    const phone = testPhone(payApp({ store, ttl: 60 }), { replay: false });
    await phone.dial();
    await phone.send("1");
    now += 61_000;
    expect(await phone.send("300")).toMatch(/^Invalid choice/);
  });

  it("uses a custom invalid text from the menu helper", async () => {
    const app = createApp({ onWarning: () => {} }).screen(
      "home",
      menu("Pick\n1. A", { "1": "home" }, { invalid: "Try again." }),
    );
    const phone = testPhone(app);
    await phone.dial();
    expect(await phone.send("9")).toBe("Try again.\nPick\n1. A");
  });

  it("warns when a screen is too long", async () => {
    const onWarning = vi.fn();
    const app = createApp({ onWarning, maxLength: 20 }).screen("home", end("x".repeat(30)));
    await testPhone(app).dial();
    expect(onWarning).toHaveBeenCalledWith(expect.stringContaining("over the 20 limit"));
  });

  it("throws helpful errors for unknown or duplicate screens", async () => {
    expect(() => payApp().screen("home", end("dup"))).toThrow(/already registered/);
    const app = createApp({ onWarning: () => {} }).screen(
      "home",
      menu("Hi\n1. Go", { "1": "missing" }),
    );
    const phone = testPhone(app);
    await phone.dial();
    await expect(phone.send("1")).rejects.toThrow(UssdkitError);
    await expect(phone.send("1")).rejects.toThrow(/Unknown screen "missing"/);
    await expect(
      createApp().handle({ sessionId: "s", phone: "p", serviceCode: "*1#", input: "" }),
    ).rejects.toThrow(/Unknown screen "home"/);
  });

  it("rejects requests without a session id", async () => {
    await expect(
      payApp().handle({ sessionId: "", phone: "p", serviceCode: "*1#", input: "" }),
    ).rejects.toThrow(/sessionId/);
  });

  it("keeps sessions separate per session id", async () => {
    const app = payApp();
    const a = testPhone(app);
    const b = testPhone(app);
    await a.dial();
    await b.dial();
    await a.send("1");
    expect(await b.send("2")).toBe("Balance: NGN 500");
    expect(await a.send("10")).toMatch(/^Send NGN 10/);
  });

  it("exposes phone, service code and network to handlers", async () => {
    const seen: string[] = [];
    const app = createApp({ onWarning: () => {} }).screen("home", {
      render: (ctx) => {
        seen.push(ctx.phone, ctx.serviceCode, String(ctx.network));
        return "Hi";
      },
    });
    await testPhone(app, { phone: "+254700000000", serviceCode: "*123#", network: "63902" }).dial();
    expect(seen).toEqual(["+254700000000", "*123#", "63902"]);
  });
});
