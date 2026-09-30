import type { Context, Next, Renderer, Screen } from "./types.js";

export type MenuOption = string | ((ctx: Context) => Next | Promise<Next>);

export interface MenuOptions {
  /** Text shown when the input matches no option. Default `Invalid choice.` */
  invalid?: string;
}

/**
 * A screen with numbered choices.
 *
 * @example
 * menu("Welcome\n1. Send money\n2. Balance", { "1": "send", "2": "balance" })
 */
export function menu(
  text: Renderer,
  options: Record<string, MenuOption>,
  { invalid = "Invalid choice." }: MenuOptions = {},
): Screen {
  return {
    render: text,
    async handle(ctx) {
      const choice = options[ctx.input.trim()];
      if (choice === undefined) return { retry: invalid };
      if (typeof choice === "string") return { goto: choice };
      return choice(ctx);
    },
  };
}

/**
 * A screen that asks for free text and hands it to `handle`.
 *
 * @example
 * prompt("Enter amount", (input) => {
 *   const amount = Number(input);
 *   if (!(amount > 0)) return { retry: "Enter a valid amount." };
 *   return { goto: "confirm", data: { amount } };
 * })
 */
export function prompt(
  text: Renderer,
  handle: (input: string, ctx: Context) => Next | Promise<Next>,
): Screen {
  return {
    render: text,
    handle: (ctx) => handle(ctx.input.trim(), ctx),
  };
}

/** A final screen. The session ends after it is shown. */
export function end(text: Renderer): Screen {
  return { render: text };
}

/** Joins a title and numbered items into menu text. */
export function lines(title: string, ...items: string[]): string {
  return [title, ...items].filter((line) => line.length > 0).join("\n");
}
