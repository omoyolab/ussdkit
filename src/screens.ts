import type { Context, Next, Renderer, Screen, ScreenOptions, SessionData } from "./types.js";

export type MenuOption<D extends object = SessionData> =
  string | ((ctx: Context<D>) => Next<D> | Promise<Next<D>>);

/** A choice written once: its label and where it goes. `menu()` numbers them. */
export type MenuItem<D extends object = SessionData> = [label: string, next: MenuOption<D>];

export interface MenuOptions extends ScreenOptions {
  /** Text shown when the input matches no option. Default `Invalid choice.` */
  invalid?: string;
}

/**
 * A screen with numbered choices.
 *
 * Pass a list and the menu numbers itself, so a label and its target are written once:
 *
 * @example
 * menu("Welcome", [
 *   ["Send money", "send"],
 *   ["Balance", "balance"],
 * ])
 *
 * Or write the text yourself and map each key:
 *
 * @example
 * menu("Welcome\n1. Send money\n2. Balance", { "1": "send", "2": "balance" })
 */
export function menu<D extends object = SessionData>(
  text: Renderer<D>,
  options: Record<string, MenuOption<D>> | Array<MenuItem<D>>,
  { invalid = "Invalid choice.", ...screenOptions }: MenuOptions = {},
): Screen<D> {
  const items = Array.isArray(options) ? options : undefined;
  const choices: Record<string, MenuOption<D>> = items
    ? Object.fromEntries(items.map(([, next], i) => [String(i + 1), next]))
    : (options as Record<string, MenuOption<D>>);
  const numbered = items ? items.map(([label], i) => `${i + 1}. ${label}`).join("\n") : "";

  const render: Renderer<D> = !items
    ? text
    : typeof text === "string"
      ? `${text}\n${numbered}`
      : async (ctx) => `${await text(ctx)}\n${numbered}`;

  return {
    ...screenOptions,
    render,
    async handle(ctx) {
      const choice = choices[ctx.input.trim()];
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
 *
 * Where `0` is a valid answer, stop the back key being taken first:
 *
 * @example
 * prompt("How many children?", handle, { back: false })
 */
export function prompt<D extends object = SessionData>(
  text: Renderer<D>,
  handle: (input: string, ctx: Context<D>) => Next<D> | Promise<Next<D>>,
  options: ScreenOptions = {},
): Screen<D> {
  return {
    ...options,
    render: text,
    handle: (ctx) => handle(ctx.input.trim(), ctx),
  };
}

/** A final screen. The session ends after it is shown. */
export function end<D extends object = SessionData>(text: Renderer<D>): Screen<D> {
  return { render: text };
}

/** Joins a title and numbered items into menu text. */
export function lines(title: string, ...items: string[]): string {
  return [title, ...items].filter((line) => line.length > 0).join("\n");
}
