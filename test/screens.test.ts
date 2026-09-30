import { describe, expect, it } from "vitest";

import { end, lines, menu, prompt } from "../src/screens.js";
import type { Context } from "../src/types.js";

function ctx(input: string): Context {
  const session = {
    id: "s",
    phone: "+2348000000000",
    serviceCode: "*1#",
    screen: "x",
    history: [],
    data: {},
    startedAt: 0,
    updatedAt: 0,
  };
  return {
    input,
    phone: session.phone,
    serviceCode: "*1#",
    network: undefined,
    screen: "x",
    data: session.data,
    session,
  };
}

describe("menu", () => {
  const screen = menu("Pick", { "1": "a", "2": () => ({ end: "bye" }) });

  it("maps string options to goto", async () => {
    expect(await screen.handle!(ctx("1"))).toEqual({ goto: "a" });
    expect(await screen.handle!(ctx(" 1 "))).toEqual({ goto: "a" });
  });

  it("calls function options", async () => {
    expect(await screen.handle!(ctx("2"))).toEqual({ end: "bye" });
  });

  it("retries on unknown input", async () => {
    expect(await screen.handle!(ctx("3"))).toEqual({ retry: "Invalid choice." });
    expect(await menu("P", {}, { invalid: "No." }).handle!(ctx("x"))).toEqual({ retry: "No." });
  });
});

describe("prompt", () => {
  it("passes trimmed input and the context", async () => {
    const screen = prompt("Amount?", (input, c) => ({
      goto: "next",
      data: { amount: input, phone: c.phone },
    }));
    expect(await screen.handle!(ctx("  500 "))).toEqual({
      goto: "next",
      data: { amount: "500", phone: "+2348000000000" },
    });
  });
});

describe("end and lines", () => {
  it("end has no handler", () => {
    expect(end("Bye").handle).toBeUndefined();
    expect(end("Bye").render).toBe("Bye");
  });

  it("lines joins non-empty parts", () => {
    expect(lines("Title", "1. A", "", "2. B")).toBe("Title\n1. A\n2. B");
  });
});
