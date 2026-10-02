/**
 * PayBank: a small but complete USSD app.
 *
 *   node examples/paybank.mjs               # serve on http://localhost:3000/ussd (Africa's Talking format)
 *   node examples/paybank.mjs --simulate    # phone in your terminal, no server
 *
 * With the server running, open a second terminal and dial it:
 *   npx @omoyolab/ussdkit dial http://localhost:3000/ussd
 *
 * In your own project import from the package instead of ../dist:
 *   import { createApp, menu, prompt, end } from "@omoyolab/ussdkit";
 */
import { createServer } from "node:http";

import {
  createApp,
  createNodeHandler,
  end,
  lines,
  menu,
  paginate,
  prompt,
  simulate,
} from "../dist/index.js";

const BANKS = [
  "Access",
  "First Bank",
  "GTBank",
  "Kuda",
  "Moniepoint",
  "Opay",
  "UBA",
  "Wema",
  "Zenith",
];
const balances = new Map(); // phone -> kobo

const naira = (kobo) => `NGN ${(kobo / 100).toLocaleString("en-NG")}`;
const balanceOf = (phone) => balances.get(phone) ?? 1_250_000;

export const app = createApp({ ttl: 120, backHint: "0. Back" })
  .screen(
    "home",
    menu("Welcome to PayBank", [
      ["Send money", "send.amount"],
      ["Check balance", "balance"],
      ["Buy airtime", "airtime.amount"],
      ["Choose bank", "banks"],
    ]),
  )

  // Send money: amount -> recipient -> confirm
  .screen(
    "send.amount",
    prompt("Enter amount to send", (input) => {
      const amount = Number(input);
      if (!Number.isFinite(amount) || amount < 100) return { retry: "Minimum is NGN 100." };
      return { goto: "send.recipient", data: { amount } };
    }),
  )
  .screen(
    "send.recipient",
    prompt("Enter recipient phone number", (input) => {
      if (!/^(\+?234|0)\d{10}$/.test(input)) return { retry: "Enter a valid Nigerian number." };
      return { goto: "send.confirm", data: { recipient: input } };
    }),
  )
  .screen(
    "send.confirm",
    menu(
      ({ data }) =>
        lines(`Send NGN ${data.amount} to ${data.recipient}?`, "1. Confirm", "2. Cancel"),
      {
        1: ({ data, phone }) => {
          const kobo = data.amount * 100;
          if (kobo > balanceOf(phone)) return { end: "Insufficient funds." };
          balances.set(phone, balanceOf(phone) - kobo);
          return {
            end: `Sent NGN ${data.amount} to ${data.recipient}. New balance ${naira(balanceOf(phone))}.`,
          };
        },
        2: () => ({ home: true }),
      },
    ),
  )

  .screen(
    "balance",
    end(({ phone }) => `Your balance is ${naira(balanceOf(phone))}.`),
  )

  .screen(
    "airtime.amount",
    prompt("Airtime amount (NGN 50 to 5000)", (input) => {
      const amount = Number(input);
      if (!(amount >= 50 && amount <= 5000)) return { retry: "Enter between 50 and 5000." };
      return { end: `NGN ${amount} airtime sent to your number.` };
    }),
  )

  // Paginated list: the page number lives in session data
  .screen("banks", {
    render: ({ data }) =>
      `Choose a bank\n${paginate(BANKS, { page: data.page ?? 0, perPage: 4 }).text}`,
    handle: ({ input, data }) => {
      const page = paginate(BANKS, { page: data.page ?? 0, perPage: 4 });
      if (page.isNext(input)) {
        data.page = page.page + 1;
        return { retry: "" };
      }
      if (page.isPrev(input)) {
        data.page = page.page - 1;
        return { retry: "" };
      }
      const bank = page.select(input);
      if (!bank) return { retry: "Pick a number from the list." };
      return { end: `You chose ${bank}.` };
    },
  });

if (process.argv.includes("--simulate")) {
  await simulate(app, { serviceCode: "*384*7000#" });
} else {
  const port = Number(process.env.PORT ?? 3000);
  createServer(createNodeHandler(app)).listen(port, () => {
    console.log(`PayBank USSD listening on http://localhost:${port}/ussd`);
    console.log(`Dial it: npx @omoyolab/ussdkit dial http://localhost:${port}/ussd`);
  });
}
