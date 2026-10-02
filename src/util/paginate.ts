export interface PaginateOptions {
  /** Zero-based page. Default 0. */
  page?: number;
  /** Items per page. Default 5. */
  perPage?: number;
  /** Key shown for the next page. Default `9`. Set `false` to hide. */
  nextKey?: string | false;
  /**
   * Key shown for the previous page. Default `8`. Set `false` to hide.
   * It is not `0`, because `0` is the app's back key and the app takes it before the screen does.
   */
  prevKey?: string | false;
  nextLabel?: string;
  prevLabel?: string;
  /** Set false for a list people read but do not pick from, like a statement. Default true. */
  numbered?: boolean;
}

export interface Page {
  /** Items on this page. */
  items: string[];
  /** Numbered lines plus navigation lines, ready to append to a title. */
  text: string;
  page: number;
  pageCount: number;
  hasNext: boolean;
  hasPrev: boolean;
  /** Maps an input like `2` to the item it selects on this page, or `undefined`. */
  select(input: string): string | undefined;
  /** True when `input` is the next-page key and there is a next page. */
  isNext(input: string): boolean;
  /** True when `input` is the previous-page key and there is a previous page. */
  isPrev(input: string): boolean;
}

/**
 * Splits a long list into USSD-sized pages with numbered items and next/back keys.
 *
 * @example
 * const page = paginate(banks, { page: ctx.data.page as number });
 * return `Choose a bank\n${page.text}`;
 */
export function paginate(all: string[], options: PaginateOptions = {}): Page {
  const perPage = Math.max(1, options.perPage ?? 5);
  const pageCount = Math.max(1, Math.ceil(all.length / perPage));
  const page = Math.min(Math.max(0, options.page ?? 0), pageCount - 1);
  const nextKey = options.nextKey ?? "9";
  const prevKey = options.prevKey ?? "8";
  const nextLabel = options.nextLabel ?? "More";
  const prevLabel = options.prevLabel ?? "Previous";
  const numbered = options.numbered ?? true;

  const items = all.slice(page * perPage, page * perPage + perPage);
  const hasNext = page < pageCount - 1;
  const hasPrev = page > 0;

  const rows = items.map((item, i) => (numbered ? `${i + 1}. ${item}` : item));
  if (hasNext && nextKey !== false) rows.push(`${nextKey}. ${nextLabel}`);
  if (hasPrev && prevKey !== false) rows.push(`${prevKey}. ${prevLabel}`);

  return {
    items,
    text: rows.join("\n"),
    page,
    pageCount,
    hasNext,
    hasPrev,
    select(input) {
      if (!numbered) return undefined;
      const n = Number(input.trim());
      if (!Number.isInteger(n) || n < 1 || n > items.length) return undefined;
      return items[n - 1];
    },
    isNext: (input) => hasNext && nextKey !== false && input.trim() === nextKey,
    isPrev: (input) => hasPrev && prevKey !== false && input.trim() === prevKey,
  };
}
