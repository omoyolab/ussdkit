// 0.3.0: what the second use case, a civic lookup on a live API, asked for.
import { PassThrough } from "node:stream";

import { describe, expect, it } from "vitest";

import {
  createApp,
  end,
  info,
  list,
  menu,
  prompt,
  runTerminal,
  startsAnyWord,
  testPhone,
} from "../src/index.js";

const STATES = ["Abia", "Adamawa", "Akwa Ibom", "Cross River", "Lagos", "Rivers", "Oyo"];

describe("onError", () => {
  it("ends the session with its text when a screen throws while drawn", async () => {
    const app = createApp({ onError: () => "Sorry, try again later." })
      .screen("home", menu("Home", [["Load", "broken"]]))
      .screen("broken", {
        render: () => {
          throw new Error("API down");
        },
        handle: () => ({ stay: true }),
      });
    const phone = testPhone(app);
    await phone.dial();
    expect(await phone.send("1")).toBe("Sorry, try again later.");
    expect(phone.ended).toBe(true);
  });

  it("ends the session when a handler throws, and is given the error", async () => {
    const seen: unknown[] = [];
    const app = createApp({
      onError: (error) => {
        seen.push(error);
        return "Sorry.";
      },
    }).screen(
      "home",
      prompt("Amount", () => {
        throw new Error("boom");
      }),
    );
    const phone = testPhone(app);
    await phone.dial();
    expect(await phone.send("5")).toBe("Sorry.");
    expect((seen[0] as Error).message).toBe("boom");
  });

  it("covers onStart", async () => {
    const app = createApp({
      onStart: () => {
        throw new Error("no store");
      },
      onError: () => "Closed for now.",
    }).screen("home", end("Hi"));
    expect(await testPhone(app).dial()).toBe("Closed for now.");
  });

  it("lets the error through when it returns nothing, or when it is not set", async () => {
    const throwing = {
      render: "x",
      handle: () => {
        throw new Error("boom");
      },
    };
    const quiet = createApp({ onError: () => undefined }).screen("home", throwing);
    const plain = createApp().screen("home", throwing);
    for (const app of [quiet, plain]) {
      const phone = testPhone(app);
      await phone.dial();
      await expect(phone.send("1")).rejects.toThrow("boom");
    }
  });
});

describe("slowMs", () => {
  it("warns when one request takes longer than the limit", async () => {
    const warnings: string[] = [];
    const app = createApp({ slowMs: 20, onWarning: (m) => warnings.push(m) })
      .screen(
        "home",
        menu("Home", [
          [
            "Slow",
            async () => {
              await new Promise((r) => setTimeout(r, 40));
              return { goto: "done" };
            },
          ],
        ]),
      )
      .screen("done", end("Done"));
    const phone = testPhone(app);
    await phone.dial();
    expect(warnings).toEqual([]);
    await phone.send("1");
    expect(warnings[0]).toMatch(/answering took \d+ ms, over the 20 ms limit/);
  });

  it("can be turned off", async () => {
    const warnings: string[] = [];
    const app = createApp({ slowMs: false, onWarning: (m) => warnings.push(m) }).screen("home", {
      render: async () => {
        await new Promise((r) => setTimeout(r, 10));
        return "Hi";
      },
    });
    await testPhone(app).dial();
    expect(warnings).toEqual([]);
  });
});

describe("list", () => {
  const app = () =>
    createApp<{ state: string }>({ backHint: "0. Back" })
      .screen(
        "home",
        menu("Home", [
          ["States", "states"],
          ["Other", "other"],
        ]),
      )
      .screen("other", menu("Other", [["States", "states"]]))
      .screen(
        "states",
        list(
          "Choose your state",
          async () => STATES,
          (state) => ({ goto: "chosen", data: { state } }),
          {
            perPage: 3,
            filter: true,
          },
        ),
      )
      .screen(
        "chosen",
        menu(({ data }) => `You chose ${data.state}`, []),
      );

  it("shows numbered pages with the filter hint, and turns them with 9 and 8", async () => {
    const phone = testPhone(app());
    await phone.dial();
    expect(await phone.send("1")).toBe(
      "Choose your state\n1. Abia\n2. Adamawa\n3. Akwa Ibom\n9. More\nOr type the first letters\n0. Back",
    );
    expect(await phone.send("9")).toBe(
      "Choose your state\n1. Cross River\n2. Lagos\n3. Rivers\n9. More\n8. Previous\n0. Back",
    );
    expect(await phone.send("8")).toMatch(/1\. Abia/);
  });

  it("picks by number on any page", async () => {
    const phone = testPhone(app());
    await phone.dial();
    await phone.type("1", "9");
    expect(await phone.send("2")).toMatch(/^You chose Lagos/);
  });

  it("chooses at once when typing matches one item, and narrows when it matches several", async () => {
    const phone = testPhone(app());
    await phone.dial();
    await phone.send("1");
    expect(await phone.send("lag")).toMatch(/^You chose Lagos/);
    await phone.send("0");
    // "riv" starts a word in "Cross River" and in "Rivers".
    expect(await phone.send("riv")).toBe("Choose your state\n1. Cross River\n2. Rivers\n0. Back");
    expect(await phone.send("2")).toMatch(/^You chose Rivers/);
  });

  it("says when nothing matches", async () => {
    const phone = testPhone(app());
    await phone.dial();
    await phone.send("1");
    expect(await phone.send("zz")).toMatch(/^Nothing starts with "zz"\.\nChoose your state/);
    expect(await phone.send("55")).toMatch(/^Choose a number from the list\./);
  });

  it("keeps its page when the user comes back, and starts afresh when they arrive from elsewhere", async () => {
    const phone = testPhone(app());
    await phone.dial();
    await phone.type("1", "9", "1");
    expect(await phone.send("0")).toMatch(/1\. Cross River/);
    await phone.send("00");
    expect(await phone.type("2", "1")).toMatch(/1\. Abia/);
  });

  it("matches the start of any word", () => {
    expect(startsAnyWord("Lagos Island", "isl")).toBe(true);
    expect(startsAnyWord("Oshodi-Isolo", "iso")).toBe(true);
    expect(startsAnyWord("Abua/Odual", "od")).toBe(true);
    expect(startsAnyWord("Lagos", "agos")).toBe(false);
    expect(startsAnyWord("Lagos", "")).toBe(false);
  });
});

describe("stay", () => {
  it("draws the screen again with nothing above it", async () => {
    let n = 0;
    const app = createApp().screen("home", {
      render: () => `Count ${n}`,
      handle: () => {
        n++;
        return { stay: true };
      },
    });
    const phone = testPhone(app);
    await phone.dial();
    expect(await phone.send("1")).toBe("Count 1");
  });
});

describe("info", () => {
  it("shows text, keeps the session open, and Back still works", async () => {
    const app = createApp({ backHint: "0. Back" })
      .screen("home", menu("Home", [["About", "about"]]))
      .screen("about", info("About this service"));
    const phone = testPhone(app);
    await phone.dial();
    expect(await phone.send("1")).toBe("About this service\n0. Back");
    expect(await phone.send("5")).toBe("About this service\n0. Back");
    expect(phone.ended).toBe(false);
    expect(await phone.send("0")).toMatch(/^Home/);
  });
});

describe("room", () => {
  it("is the limit less the hints, a retry message, and a menu's options", async () => {
    const rooms: number[] = [];
    const app = createApp({ backHint: "0. Back", homeHint: "00. Home" })
      .screen("home", menu("Home", [["Next", "a"]]))
      .screen("a", menu("A", [["Next", "b"]]))
      .screen(
        "b",
        prompt(
          (ctx) => {
            rooms.push(ctx.room);
            return "Enter";
          },
          () => ({ retry: "Try again." }),
        ),
      )
      .screen(
        "c",
        menu(
          (ctx) => {
            rooms.push(ctx.room);
            return "C";
          },
          [["Option", "home"]],
        ),
      );
    const phone = testPhone(app);
    await phone.dial();
    await phone.type("1", "1");
    await phone.send("x");
    const hint = "0. Back  00. Home".length + 1;
    expect(rooms[0]).toBe(182 - hint);
    expect(rooms[1]).toBe(182 - hint - "Try again.".length - 1);
  });

  it("reaches a menu's text after its options are counted", async () => {
    let room = 0;
    const app = createApp().screen(
      "home",
      menu(
        (ctx) => {
          room = ctx.room;
          return "Home";
        },
        [
          ["One", "home"],
          ["Two", "home"],
        ],
      ),
    );
    await testPhone(app).dial();
    expect(room).toBe(182 - "1. One\n2. Two".length - 1);
  });
});

describe("homeHint", () => {
  it("shows on screens two or more steps from home, on the back hint's line", async () => {
    const app = createApp({ backHint: "0. Back", homeHint: "00. Home" })
      .screen("home", menu("Home", [["A", "a"]]))
      .screen("a", menu("A", [["B", "b"]]))
      .screen("b", menu("B", [["C", "home"]]));
    const phone = testPhone(app);
    expect(await phone.dial()).toBe("Home\n1. A");
    expect(await phone.send("1")).toBe("A\n1. B\n0. Back");
    expect(await phone.send("1")).toBe("B\n1. C\n0. Back  00. Home");
  });
});

describe("simulator", () => {
  it("tells you Ctrl+C hangs up, and hangs up cleanly", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    let text = "";
    output.on("data", (chunk) => (text += String(chunk)));
    const app = createApp().screen(
      "home",
      prompt("Your name?", () => ({ end: "Bye" })),
    );
    const done = runTerminal(
      {
        start: () => app.handle({ sessionId: "s", phone: "+1", serviceCode: "*1#", input: "" }),
        send: async () => ({ text: "", end: true }),
      },
      { input, output },
    );
    await new Promise((r) => setTimeout(r, 20));
    process.emit("SIGINT");
    await done;
    expect(text).toMatch(/Ctrl\+C hangs up/);
    expect(text).toMatch(/You hung up\. Session ended\./);
    expect(process.listenerCount("SIGINT")).toBe(0);
  });
});
