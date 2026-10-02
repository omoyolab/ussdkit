// What 0.2 added, each from a finding in the mobile money use case.
import { PassThrough } from "node:stream";

import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { end, lines, menu, prompt } from "../src/screens.js";
import { runTerminal, simulate } from "../src/simulate.js";
import { testPhone } from "../src/testing.js";
import { paginate } from "../src/util/paginate.js";

describe("typed session data", () => {
  interface Flow {
    amount: number;
    recipient: string;
  }

  it("types ctx.data and what goto may store, with no casts", async () => {
    const app = createApp<Flow>()
      .screen(
        "home",
        prompt("Amount", (input) => ({ goto: "confirm", data: { amount: Number(input) } })),
      )
      .screen(
        "confirm",
        end(({ data }) => {
          const doubled: number = (data.amount ?? 0) * 2;
          return `Twice that is ${doubled}`;
        }),
      );
    const phone = testPhone(app);
    await phone.dial();
    expect(await phone.send("21")).toBe("Twice that is 42");
  });

  it("refuses data of the wrong shape at compile time", () => {
    createApp<Flow>().screen(
      "home",
      // @ts-expect-error amount is a number
      prompt("Amount", () => ({ goto: "home", data: { amount: "ten" } })),
    );
  });
});

describe("ctx.replaying", () => {
  function pinApp() {
    const seen: Array<{ input: string; replaying: boolean }> = [];
    const app = createApp()
      .screen("home", menu("Home", [["PIN", "pin"]]))
      .screen(
        "pin",
        prompt("PIN", (input, ctx) => {
          seen.push({ input, replaying: ctx.replaying });
          return input === "1234" ? { end: "Welcome" } : { retry: "Wrong PIN." };
        }),
      );
    return { app, seen };
  }

  it("is false for every input while the session is remembered", async () => {
    const { app, seen } = pinApp();
    const phone = testPhone(app);
    await phone.dial();
    await phone.type("1", "0000", "1234");
    expect(seen).toEqual([
      { input: "0000", replaying: false },
      { input: "1234", replaying: false },
    ]);
  });

  it("is true for inputs handled before the session was lost, and false for the new one", async () => {
    const { app, seen } = pinApp();
    const phone = testPhone(app);
    await phone.dial();
    await phone.type("1", "0000");
    seen.length = 0;
    await phone.loseSession();
    expect(await phone.send("1234")).toBe("Welcome");
    expect(seen).toEqual([
      { input: "0000", replaying: true },
      { input: "1234", replaying: false },
    ]);
  });
});

describe("onStart", () => {
  it("can end the session before any screen is shown", async () => {
    const app = createApp({
      onStart: ({ phone }) => (phone === "+254700000001" ? { end: "Not registered." } : undefined),
    }).screen("home", menu("Home", [["One", "home"]]));

    const stranger = testPhone(app, { phone: "+254700000001" });
    expect(await stranger.dial()).toBe("Not registered.");
    expect(stranger.ended).toBe(true);

    const customer = testPhone(app, { phone: "+254712345678" });
    expect(await customer.dial()).toBe("Home\n1. One");
    expect(customer.ended).toBe(false);
  });

  it("can start on another screen and seed the session", async () => {
    const app = createApp<{ lang: string }>({
      onStart: () => ({ goto: "welcome", data: { lang: "sw" } }),
    })
      .screen("home", menu("Home", [["One", "home"]]))
      .screen(
        "welcome",
        end(({ data }) => `Karibu (${data.lang})`),
      );
    expect(await testPhone(app).dial()).toBe("Karibu (sw)");
  });

  it("runs once per session, not on every request", async () => {
    let starts = 0;
    const app = createApp({
      onStart: () => {
        starts += 1;
      },
    })
      .screen("home", menu("Home", [["Next", "next"]]))
      .screen("next", menu("Next", [["Home", "home"]]));
    const phone = testPhone(app);
    await phone.dial();
    await phone.type("1", "1", "1");
    expect(starts).toBe(1);
  });
});

describe("per-screen back and home", () => {
  it("hands 0 to a prompt that asked for it", async () => {
    const app = createApp()
      .screen("home", menu("Home", [["Children", "children"]]))
      .screen(
        "children",
        prompt("How many children?", (input) => ({ end: `You said ${input}.` }), { back: false }),
      );
    const phone = testPhone(app);
    await phone.dial();
    expect(await phone.type("1", "0")).toBe("You said 0.");
  });

  it("still goes back with 0 everywhere else", async () => {
    const app = createApp()
      .screen("home", menu("Home", [["Amount", "amount"]]))
      .screen(
        "amount",
        prompt("Amount", () => ({ end: "Done" })),
      );
    const phone = testPhone(app);
    await phone.dial();
    expect(await phone.type("1", "0")).toBe("Home\n1. Amount");
  });
});

describe("transient screens", () => {
  it("are skipped by Back from the screen after them", async () => {
    const app = createApp()
      .screen("home", menu("Account", [["Statement", "pin"]]))
      .screen(
        "pin",
        prompt("PIN", () => ({ goto: "statement" }), { transient: true }),
      )
      .screen("statement", menu("Statement", [["Refresh", "statement"]]));
    const phone = testPhone(app);
    await phone.dial();
    expect(await phone.type("1", "1234")).toBe("Statement\n1. Refresh");
    // Back goes to the account menu, not to the PIN the user already passed.
    expect(await phone.send("0")).toBe("Account\n1. Statement");
  });
});

describe("backHint", () => {
  const app = () =>
    createApp({ backHint: "0. Back" })
      .screen("home", menu("Home", [["Amount", "amount"]]))
      .screen(
        "amount",
        prompt("Amount", (input) =>
          input === "x" ? { retry: "Not a number." } : { goto: "zero" },
        ),
      )
      .screen(
        "zero",
        prompt("How many?", () => ({ goto: "done" }), { back: false }),
      )
      .screen("done", end("Done"));

  it("is added where the back key works, and nowhere else", async () => {
    const phone = testPhone(app());
    expect(await phone.dial()).toBe("Home\n1. Amount"); // nowhere to go back to
    expect(await phone.send("1")).toBe("Amount\n0. Back");
    expect(await phone.send("x")).toBe("Not a number.\nAmount\n0. Back");
    expect(await phone.send("5")).toBe("How many?"); // this screen keeps 0 for itself
    expect(await phone.send("0")).toBe("Done"); // an end screen has no way back
  });
});

describe("menu from a list", () => {
  it("numbers the items and routes each number", async () => {
    const app = createApp()
      .screen(
        "home",
        menu("Wallet", [
          ["Send money", "send"],
          ["Balance", () => ({ end: "KES 500" })],
        ]),
      )
      .screen("send", end("Sending"));
    const phone = testPhone(app);
    expect(await phone.dial()).toBe("Wallet\n1. Send money\n2. Balance");
    expect(await phone.send("3")).toBe("Invalid choice.\nWallet\n1. Send money\n2. Balance");
    expect(await phone.send("2")).toBe("KES 500");
  });

  it("works with a title that is a function", async () => {
    const app = createApp().screen(
      "home",
      menu(({ phone }) => `Hello ${phone}`, [["Go", () => ({ end: "Gone" })]]),
    );
    expect(await testPhone(app, { phone: "+254700" }).dial()).toBe("Hello +254700\n1. Go");
  });

  it("still takes text and a map of keys", async () => {
    const app = createApp().screen(
      "home",
      menu(lines("Pick", "*. Star"), { "*": () => ({ end: "Star" }) }),
    );
    const phone = testPhone(app);
    await phone.dial();
    expect(await phone.send("*")).toBe("Star");
  });
});

describe("paginate", () => {
  const items = ["A", "B", "C", "D", "E"];

  it("does not use the app's back key for the previous page", async () => {
    const app = createApp()
      .screen("home", menu("Home", [["List", "list"]]))
      .screen("list", {
        render: ({ data }) =>
          paginate(items, { page: (data.page as number) ?? 0, perPage: 2 }).text,
        handle: ({ input, data }) => {
          const page = paginate(items, { page: (data.page as number) ?? 0, perPage: 2 });
          if (page.isNext(input)) data.page = page.page + 1;
          if (page.isPrev(input)) data.page = page.page - 1;
          return { retry: "" };
        },
      });
    const phone = testPhone(app);
    await phone.dial();
    expect(await phone.type("1", "9")).toBe("1. C\n2. D\n9. More\n8. Previous");
    expect(await phone.send("8")).toBe("1. A\n2. B\n9. More");
    expect(await phone.type("9", "0")).toBe("Home\n1. List"); // 0 is still Back
  });

  it("can list rows without numbers", () => {
    const page = paginate(items, { perPage: 2, numbered: false });
    expect(page.text).toBe("A\nB\n9. More");
    expect(page.select("1")).toBeUndefined();
  });
});

describe("test phone", () => {
  const app = () =>
    createApp()
      .screen("home", menu("Home", [["Name", "name"]]))
      .screen(
        "name",
        prompt("Your name?", (input) => ({ end: `Hello ${input}!` })),
      );

  it("keeps every step and draws a transcript", async () => {
    const phone = testPhone(app());
    await phone.dial();
    await phone.type("1", "Ada");
    expect(phone.steps).toEqual([
      { input: null, screen: "Home\n1. Name" },
      { input: "1", screen: "Your name?" },
      { input: "Ada", screen: "Hello Ada!" },
    ]);
    const transcript = phone.transcript();
    expect(transcript).toContain("│ Home");
    expect(transcript).toContain("> 1\n");
    expect(transcript).toContain("> Ada\n");
    expect(transcript.trimEnd().endsWith("┘")).toBe(true);
  });

  it("starts the transcript again on a new dial", async () => {
    const phone = testPhone(app());
    await phone.dial();
    await phone.type("1", "Ada");
    await phone.dial();
    expect(phone.steps).toHaveLength(1);
  });

  it("rebuilds a lost session from the inputs", async () => {
    const phone = testPhone(app());
    await phone.dial();
    await phone.send("1");
    await phone.loseSession();
    expect(await phone.send("Ada")).toBe("Hello Ada!");
  });
});

describe("simulator", () => {
  it("shows piped input, so a scripted run reads as a transcript", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    let text = "";
    output.on("data", (chunk: Buffer) => (text += chunk.toString()));
    input.end("1\nAda\n");
    const app = createApp()
      .screen("home", menu("Home", [["Name", "name"]]))
      .screen(
        "name",
        prompt("Your name?", (value) => ({ end: `Hello ${value}!` })),
      );
    await simulate(app, { input, output });
    expect(text).toContain("> 1\n");
    expect(text).toContain("> Ada\n");
    expect(text).toContain("│ Hello Ada!");
    expect(typeof runTerminal).toBe("function");
  });
});
