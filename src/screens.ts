import type { Context, Next, Renderer, Screen, ScreenOptions, SessionData } from "./types.js";
import { paginate } from "./util/paginate.js";

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
      : // The text's room is what is left after the options.
        async (ctx) =>
          `${await text({ ...ctx, room: ctx.room - numbered.length - 1 })}\n${numbered}`;

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

/**
 * A screen that shows text and waits, with Back and Home still working. For an About or Help
 * screen. `end()` would close the session instead.
 */
export function info<D extends object = SessionData>(
  text: Renderer<D>,
  options: ScreenOptions = {},
): Screen<D> {
  return { ...options, render: text, handle: () => ({ stay: true }) };
}

export interface ListOptions<T> extends ScreenOptions {
  /** Items to a page. Default 5. */
  perPage?: number;
  /** How an item reads on the screen. Default `String(item)`. */
  label?: (item: T) => string;
  /**
   * Let the user type the first letters of any word to narrow the list. One match is chosen at
   * once. Default false.
   */
  filter?: boolean;
  /** Shown under the first page when filtering is on. Default `Or type the first letters`. */
  filterHint?: string;
  /** Shown when nothing matches what was typed. */
  noMatch?: (typed: string) => string;
  /** Shown when the input is neither a choice, a page key nor letters. */
  invalid?: string;
  nextKey?: string;
  prevKey?: string;
  nextLabel?: string;
  prevLabel?: string;
}

/** Lowercase letters and digits only, so "Oshodi-Isolo" and "oshodi isolo" match. */
const fold = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, "");

/** True when `typed` starts the label or any word in it: "isl" finds "Lagos Island". */
export function startsAnyWord(label: string, typed: string): boolean {
  const k = fold(typed);
  if (!k) return false;
  return (
    fold(label).startsWith(k) || label.split(/[\s/,()-]+/).some((word) => fold(word).startsWith(k))
  );
}

/**
 * A long list to choose from: numbered pages, `9` and `8` to turn them, and, with `filter`,
 * typing the first letters to narrow it. Items can be loaded when the screen is drawn.
 *
 * The page and the filter are kept per screen, and start afresh when the user arrives from
 * another screen. Back from the next screen returns to the same page.
 *
 * @example
 * list("Choose your bank", banks, (bank) => ({ goto: "account", data: { bank } }), { filter: true })
 */
export function list<D extends object = SessionData, T = string>(
  title: Renderer<D>,
  items: T[] | ((ctx: Context<D>) => T[] | Promise<T[]>),
  onPick: (item: T, ctx: Context<D>) => Next<D> | Promise<Next<D>>,
  options: ListOptions<T> = {},
): Screen<D> {
  const {
    perPage = 5,
    label = (item: T) => String(item),
    filter = false,
    filterHint = "Or type the first letters",
    noMatch = (typed: string) => `Nothing starts with "${typed.slice(0, 12)}".`,
    invalid = "Choose a number from the list.",
    nextKey,
    prevKey,
    nextLabel,
    prevLabel,
    ...screenOptions
  } = options;
  const pageOptions = {
    perPage,
    ...(nextKey !== undefined ? { nextKey } : {}),
    ...(prevKey !== undefined ? { prevKey } : {}),
    ...(nextLabel !== undefined ? { nextLabel } : {}),
    ...(prevLabel !== undefined ? { prevLabel } : {}),
  };

  const state = (ctx: Context<D>): { page: number; typed: string } => {
    const views = (ctx.session.view ??= {});
    const view = (views[ctx.screen] ??= { page: 0, typed: "" });
    return view as { page: number; typed: string };
  };
  const all = async (ctx: Context<D>): Promise<T[]> =>
    typeof items === "function" ? items(ctx) : items;
  const shown = async (ctx: Context<D>): Promise<T[]> => {
    const { typed } = state(ctx);
    const every = await all(ctx);
    return typed ? every.filter((item) => startsAnyWord(label(item), typed)) : every;
  };

  return {
    ...screenOptions,
    async render(ctx) {
      const view = state(ctx);
      const visible = await shown(ctx);
      const page = paginate(visible.map(label), { ...pageOptions, page: view.page });
      const hint =
        filter && !view.typed && page.page === 0 && visible.length > perPage ? filterHint : "";
      const body = [page.text, hint].filter((line) => line).join("\n");
      const head =
        typeof title === "string"
          ? title
          : await title({ ...ctx, room: ctx.room - body.length - 1 });
      return [head, body].filter((line) => line).join("\n");
    },
    async handle(ctx) {
      const view = state(ctx);
      const visible = await shown(ctx);
      const page = paginate(visible.map(label), { ...pageOptions, page: view.page });
      if (page.isNext(ctx.input)) {
        view.page = page.page + 1;
        return { stay: true };
      }
      if (page.isPrev(ctx.input)) {
        view.page = page.page - 1;
        return { stay: true };
      }
      const n = Number(ctx.input);
      if (Number.isInteger(n) && n >= 1 && n <= page.items.length) {
        return onPick(visible[page.page * perPage + n - 1] as T, ctx);
      }
      if (filter && /[a-z]/i.test(ctx.input)) {
        const found = (await all(ctx)).filter((item) => startsAnyWord(label(item), ctx.input));
        if (found.length === 0) return { retry: noMatch(ctx.input) };
        if (found.length === 1) return onPick(found[0] as T, ctx);
        view.typed = ctx.input;
        view.page = 0;
        return { stay: true };
      }
      return { retry: invalid };
    },
  };
}
