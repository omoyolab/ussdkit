# ussdkit

**Build USSD apps in Node without the boilerplate.**

Declarative screens, session handling, gateway adapters, a phone simulator in your
terminal and a test helper. Zero dependencies.

```ts
import { createApp, menu, prompt, end, createNodeHandler } from "@omoyolab/ussdkit";
import { createServer } from "node:http";

const app = createApp()
  .screen(
    "home",
    menu("Welcome to PayCo\n1. Send money\n2. Balance", { "1": "amount", "2": "balance" }),
  )
  .screen(
    "amount",
    prompt("Enter amount", (input) => {
      const amount = Number(input);
      if (!(amount > 0)) return { retry: "Enter a valid amount." };
      return { goto: "done", data: { amount } };
    }),
  )
  .screen("balance", end("Your balance is NGN 12,500"))
  .screen(
    "done",
    end(({ data }) => `Sent NGN ${data.amount}. Thank you.`),
  );

createServer(createNodeHandler(app)).listen(3000);
```

[![npm](https://img.shields.io/npm/v/%40omoyolab%2Fussdkit)](https://www.npmjs.com/package/@omoyolab/ussdkit)
[![CI](https://github.com/omoyolab/ussdkit/actions/workflows/ci.yml/badge.svg)](https://github.com/omoyolab/ussdkit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## Why

USSD is how most of Africa banks, buys airtime and pays bills: dial `*737#`, get a text
menu, press numbers. Every request from the network is stateless, so every team writing a
USSD app ends up hand-rolling the same things: remembering where each phone number is in
the menu, parsing the gateway's format, validating input, handling "0 to go back", and
deploying to a server just to test it from a real handset.

ussdkit does those parts once, properly:

- **Screens, not state machines.** Describe menus and prompts. Navigation, retries, back
  and home are handled for you.
- **Sessions that survive restarts.** In-memory by default, Redis when you scale out, and
  automatic replay from the gateway's input history when a session is lost.
- **Gateway adapters.** Africa's Talking today. Adding one is a 30-line file.
- **A phone in your terminal.** Click through your flow while you build it. Dial any USSD
  endpoint, yours or someone else's, with `ussdkit dial`.
- **A test helper.** `testPhone(app)` drives your app in Vitest or Jest with no HTTP.
- **Zero dependencies.** Node 20+ and nothing else.

## Install

```sh
npm install @omoyolab/ussdkit
```

## Quick start

Try the bundled example before writing your own:

```sh
git clone https://github.com/omoyolab/ussdkit && cd ussdkit && pnpm install && pnpm build
node examples/paybank.mjs --simulate
```

```
ussdkit simulator (local app)
Dialling *384*7000# from +2348012345678…

┌──────────────────────┐
│ Welcome to PayBank   │
│ 1. Send money        │
│ 2. Check balance     │
│ 3. Buy airtime       │
│ 4. Choose bank       │
└──────────────────────┘
> 1

┌──────────────────────┐
│ Enter amount to send │
└──────────────────────┘
> 2500
```

Or serve it and dial it over HTTP, exactly the way Africa's Talking would:

```sh
node examples/paybank.mjs                                  # terminal 1
npx @omoyolab/ussdkit dial http://localhost:3000/ussd      # terminal 2
```

## Writing screens

A screen has `render` (what the phone shows) and optionally `handle` (what to do with the
user's input). Three helpers cover almost everything:

```ts
import { menu, prompt, end, lines } from "@omoyolab/ussdkit";

// Numbered choices. Unknown input re-renders with "Invalid choice."
menu(lines("Main menu", "1. Send", "2. Balance"), {
  "1": "send", // go to a screen
  "2": (ctx) => ({ end: "..." }), // or run code
});

// Free text. Return where to go next, or retry with a message.
prompt("Enter amount", (input, ctx) => {
  const amount = Number(input);
  if (!(amount > 0)) return { retry: "Enter a valid amount." };
  return { goto: "confirm", data: { amount } };
});

// Final screen. The session ends after it is shown.
end(({ data }) => `Sent NGN ${data.amount}.`);
```

`render` can be a string or a function of the context, sync or async, so you can hit your
database or an API before showing a screen.

### What a handler can return

| Return                         | Effect                                               |
| ------------------------------ | ---------------------------------------------------- |
| `{ goto: "id", data?: {...} }` | Move to a screen. `data` is merged into the session. |
| `{ retry: "message" }`         | Show the same screen again with the message on top.  |
| `{ end: "message" }`           | Show the message and end the session.                |
| `{ back: true }`               | Go to the previous screen.                           |
| `{ home: true }`               | Go to the home screen and clear history.             |

### The context

Every `render` and `handle` receives:

```ts
{
  input: string;        // latest input, trimmed by menu() and prompt()
  phone: string;        // "+2348012345678"
  serviceCode: string;  // "*384*7000#"
  network?: string;     // network code when the gateway sends one
  screen: string;       // current screen id
  data: Record<string, unknown>;  // survives across screens; mutate it freely
  session: Session;
}
```

### Back and home

By default `0` goes back one screen and `00` returns home. Change or disable them:

```ts
createApp({ backKey: "#", homeKey: false });
```

The back key is only intercepted when there is somewhere to go back to, so a `0` on the
home screen reaches your handler like any other input.

### Long lists

Screens are limited to about 182 characters on most networks. `paginate()` splits a list
into pages with numbered items and More/Back keys:

```ts
.screen("banks", {
  render: ({ data }) => `Choose a bank\n${paginate(BANKS, { page: data.page ?? 0 }).text}`,
  handle: ({ input, data }) => {
    const page = paginate(BANKS, { page: data.page ?? 0 });
    if (page.isNext(input)) { data.page = page.page + 1; return { retry: "" }; }
    if (page.isPrev(input)) { data.page = page.page - 1; return { retry: "" }; }
    const bank = page.select(input);
    return bank ? { end: `You chose ${bank}.` } : { retry: "Pick a number." };
  },
})
```

ussdkit warns (via `onWarning`) whenever a rendered screen exceeds `maxLength`.

## Serving it

`createNodeHandler(app)` returns a `(req, res)` function. It reads form-encoded or JSON
bodies itself, and uses `req.body` when a framework already parsed it.

```ts
// node:http
createServer(createNodeHandler(app)).listen(3000);

// Express
app.post("/ussd", createNodeHandler(ussdApp));

// Fastify, Hono, Koa: hand it the raw req/res, or call app.handle() directly
```

For anything else, `app.handle(request)` takes a plain `UssdRequest` and returns
`{ text, end }`. Use a gateway's `parse` and `format` to translate.

Handler errors never reach the phone as a stack trace. The user sees a friendly `END`
message and `onError` receives the exception.

## Sessions

Sessions live in memory by default, which is fine for one process. For more than one
server, or to survive restarts, use Redis:

```ts
import Redis from "ioredis";
createApp({ store: createRedisStore(new Redis(process.env.REDIS_URL)) });

// node-redis
createApp({ store: createRedisStore(client, { client: "node-redis" }) });
```

Sessions expire after `ttl` seconds of inactivity (default 180). Any object with
`get`, `set` and `delete` can be a store, so Postgres, DynamoDB or SQLite adapters are a
few lines.

**Replay.** Africa's Talking resends every input the user has typed on each request. If
ussdkit cannot find a session, it rebuilds one by replaying those inputs, so a redeploy or
an expired session in the middle of a flow does not dump the user back to the home screen.

## Testing

```ts
import { testPhone } from "@omoyolab/ussdkit";
import { app } from "../src/app";

test("sends money", async () => {
  const phone = testPhone(app, { phone: "+2348012345678" });
  await phone.dial();
  expect(phone.screen).toContain("Welcome");
  await phone.type("1", "2500", "08012345678");
  expect(phone.screen).toMatch(/Send NGN 2500/);
  await phone.send("1");
  expect(phone.ended).toBe(true);
});
```

No server, no mocks, no gateway. It runs the same code path a real request would.

## The `ussdkit dial` command

A phone in your terminal that speaks Africa's Talking's wire format to any URL:

```sh
npx @omoyolab/ussdkit dial http://localhost:3000/ussd --code "*384*1234#" --phone +254700000000
```

It works against any server built for that gateway, not only ussdkit apps, so you can
use it to poke at an existing service too. Pipe input for scripted runs:

```sh
printf '1\n2500\n' | npx @omoyolab/ussdkit dial http://localhost:3000/ussd
```

## Gateways

| Gateway          | Request                                                        | Response           |
| ---------------- | -------------------------------------------------------------- | ------------------ |
| Africa's Talking | form-encoded `sessionId`, `serviceCode`, `phoneNumber`, `text` | `CON …` or `END …` |

A gateway is an object with `parse(request) → UssdRequest` and `format(response) → wire`.
See `src/gateways/africastalking.ts`, it is the whole file. Hubtel, Nalo, Arkesel and
direct telco integrations are on the roadmap and marked as good first issues.

## Roadmap

- More gateways: Hubtel (Ghana), Nalo, Arkesel, and a generic JSON gateway.
- Browser simulator with a phone frame you can share with non-developers.
- `ussdkit lint`: flag screens over the length limit and unreachable screens.
- SMS fallback: send the end screen as an SMS when a session times out.
- Session analytics hooks: where do users drop off.
- Python port.

Vote on these or propose others in [Discussions](https://github.com/omoyolab/ussdkit/discussions).

## Contributing

Gateway adapters, store adapters and real-world gotchas from specific networks are the
most valuable contributions. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE). ussdkit is not affiliated with Africa's Talking or any network operator.
